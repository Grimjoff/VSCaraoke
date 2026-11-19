import * as vscode from 'vscode';
import * as http from 'http';
import * as crypto from 'crypto';
import { parseRedirect, Redirect } from './redirect';

const SCOPES = 'user-read-currently-playing user-read-playback-state';
const TOKEN_KEY = 'vscaraoke.spotify.tokens';

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

	private get clientId(): string {
		return vscode.workspace.getConfiguration('vscaraoke').get<string>('spotifyClientId', '').trim();
	}

	private get redirect(): Redirect | string {
		return parseRedirect(vscode.workspace.getConfiguration('vscaraoke').get<string>('redirectUri', ''));
	}

	private async settingError(message: string, setting: string): Promise<void> {
		if (await vscode.window.showErrorMessage(message, 'Open Settings')) {
			void vscode.commands.executeCommand('workbench.action.openSettings', setting);
		}
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
		const redirect = this.redirect;
		if (typeof redirect === 'string') {
			return this.settingError(`Invalid "vscaraoke.redirectUri": ${redirect}`, 'vscaraoke.redirectUri');
		}
		const clientId = this.clientId;
		if (!clientId) {
			return this.settingError(
				`Set "vscaraoke.spotifyClientId" first. Create an app at developer.spotify.com and add ${redirect.uri} as a Redirect URI.`,
				'vscaraoke.spotifyClientId');
		}
		const verifier = b64url(crypto.randomBytes(64));
		const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
		const state = b64url(crypto.randomBytes(16));

		const code = await new Promise<string>((resolve, reject) => {
			const server = http.createServer((req, res) => {
				const url = new URL(req.url ?? '/', redirect.uri);
				if (url.pathname !== redirect.path) {
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
			server.on('error', (e: NodeJS.ErrnoException) => {
				clearTimeout(timer);
				reject(new Error(e.code === 'EADDRINUSE'
					? `Port ${redirect.port} is already in use. Pick another port in "vscaraoke.redirectUri" and add the new URL to your Spotify app.`
					: e.message));
			});
			server.listen(redirect.port, redirect.host, () => {
				const p = new URLSearchParams({
					client_id: clientId,
					response_type: 'code',
					redirect_uri: redirect.uri,
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
			redirect_uri: redirect.uri,
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
