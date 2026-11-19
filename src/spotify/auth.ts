import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';

const PORT = 43821;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = 'user-read-currently-playing user-read-playback-state';
const TOKEN_KEY = 'karaoke.spotify.tokens';

interface Tokens {
	accessToken: string;
	refreshToken: string;
	expiresAt: number;
}

function b64url(buf: Buffer): string {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export class SpotifyAuth {
	private tokens?: Tokens;
	private readonly _onDidChange = new vscode.EventEmitter<boolean>();
	readonly onDidChangeSignIn = this._onDidChange.event;

	constructor(private readonly secrets: vscode.SecretStorage) { }

	static readonly redirectUri = REDIRECT_URI;

	private get clientId(): string {
		return vscode.workspace.getConfiguration('karaoke').get<string>('spotifyClientId', '').trim();
	}

	async load(): Promise<boolean> {
		const raw = await this.secrets.get(TOKEN_KEY);
		this.tokens = raw ? JSON.parse(raw) : undefined;
		return !!this.tokens;
	}

	get isSignedIn(): boolean {
		return !!this.tokens;
	}

	async signOut(): Promise<void> {
		this.tokens = undefined;
		await this.secrets.delete(TOKEN_KEY);
		this._onDidChange.fire(false);
	}

	async signIn(): Promise<void> {
		const clientId = this.clientId;
		if (!clientId) {
			const pick = await vscode.window.showErrorMessage(
				`Set "karaoke.spotifyClientId" first. Create an app at developer.spotify.com and add ${REDIRECT_URI} as a Redirect URI.`,
				'Open Settings');
			if (pick) {
				vscode.commands.executeCommand('workbench.action.openSettings', 'karaoke.spotifyClientId');
			}
			return;
		}
		const verifier = b64url(crypto.randomBytes(64));
		const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
		const state = b64url(crypto.randomBytes(16));

		const code = await new Promise<string>((resolve, reject) => {
			const server = http.createServer((req, res) => {
				const url = new URL(req.url ?? '/', REDIRECT_URI);
				if (url.pathname !== '/callback') {
					res.writeHead(404).end();
					return;
				}
				const err = url.searchParams.get('error');
				const c = url.searchParams.get('code');
				const ok = !err && !!c && url.searchParams.get('state') === state;
				res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
				res.end(ok
					? '<h2>Signed in to Spotify. You can close this tab and return to VS Code.</h2>'
					: '<h2>Sign-in failed. Return to VS Code and try again.</h2>');
				clearTimeout(timer);
				server.close();
				if (ok) {
					resolve(c!);
				} else {
					reject(new Error(err ?? 'state mismatch'));
				}
			});
			const timer = setTimeout(() => { server.close(); reject(new Error('Sign-in timed out')); }, 5 * 60_000);
			server.on('error', reject);
			server.listen(PORT, '127.0.0.1', () => {
				const p = new URLSearchParams({
					client_id: clientId,
					response_type: 'code',
					redirect_uri: REDIRECT_URI,
					code_challenge_method: 'S256',
					code_challenge: challenge,
					scope: SCOPES,
					state,
				});
				vscode.env.openExternal(vscode.Uri.parse(`https://accounts.spotify.com/authorize?${p}`, true));
			});
		});

		await this.tokenRequest({
			grant_type: 'authorization_code',
			code,
			redirect_uri: REDIRECT_URI,
			client_id: clientId,
			code_verifier: verifier,
		});
		this._onDidChange.fire(true);
	}

	private async tokenRequest(body: Record<string, string>): Promise<void> {
		const res = await fetch('https://accounts.spotify.com/api/token', {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams(body),
		});
		if (!res.ok) {
			throw new Error(`Spotify token request failed (${res.status}): ${await res.text()}`);
		}
		const j = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
		this.tokens = {
			accessToken: j.access_token,
			refreshToken: j.refresh_token ?? this.tokens?.refreshToken ?? '',
			expiresAt: Date.now() + (j.expires_in - 60) * 1000,
		};
		await this.secrets.store(TOKEN_KEY, JSON.stringify(this.tokens));
	}

	/** Returns a valid access token, refreshing if needed. Undefined when signed out. */
	async getAccessToken(): Promise<string | undefined> {
		if (!this.tokens) {
			return undefined;
		}
		if (Date.now() >= this.tokens.expiresAt) {
			try {
				await this.tokenRequest({
					grant_type: 'refresh_token',
					refresh_token: this.tokens.refreshToken,
					client_id: this.clientId,
				});
			} catch {
				await this.signOut();
				return undefined;
			}
		}
		return this.tokens.accessToken;
	}
}
