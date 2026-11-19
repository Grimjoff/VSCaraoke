import * as vscode from 'vscode';
import { SpotifyAuth } from './spotify/auth';
import { SpotifyPlayer, TrackInfo } from './spotify/player';
import { LyricsService, toResult } from './lyrics/service';
import { lrclibSearch } from './lyrics/lrclib';
import { normalizeArtist, normalizeTitle } from './lyrics/normalize';
import { fetchTempo } from './tempo/reccobeats';
import { KaraokeViewProvider } from './view/KaraokeViewProvider';

export async function activate(context: vscode.ExtensionContext) {
	const auth = new SpotifyAuth(context.secrets);
	const player = new SpotifyPlayer(auth);
	const lyrics = new LyricsService(context.globalState);
	const view = new KaraokeViewProvider(context.extensionUri);

	let currentTrack: TrackInfo | undefined;
	let sessionOffset = 0;
	const tempoCache = new Map<string, number | undefined>();

	const config = () => vscode.workspace.getConfiguration('karaoke');
	const sendConfig = () => view.post({
		type: 'config',
		creatureCount: config().get<number>('creatureCount', 4),
		showVisualizer: config().get<boolean>('showVisualizer', true),
	});
	const sendOffset = () => view.post({ type: 'offset', ms: config().get<number>('lyricsOffsetMs', 0) + sessionOffset });
	const updateActive = () => player.setActive(view.visible && auth.isSignedIn);

	async function loadLyrics(track: TrackInfo, bypassCache = false) {
		view.post({ type: 'lyricsLoading', trackId: track.id });
		try {
			const r = await lyrics.get(track, bypassCache);
			view.post({ type: 'lyrics', trackId: track.id, ...r });
		} catch (e) {
			view.post({ type: 'lyrics', trackId: track.id, kind: 'error', lines: [], source: String(e) });
		}
	}

	async function loadTempo(track: TrackInfo) {
		if (!tempoCache.has(track.id)) {
			tempoCache.set(track.id, await fetchTempo(track.id));
		}
		view.post({ type: 'tempo', trackId: track.id, bpm: tempoCache.get(track.id) });
	}

	context.subscriptions.push(
		auth.onDidChangeSignIn(signedIn => {
			view.post({ type: 'auth', signedIn });
			updateActive();
			if (signedIn) {
				player.refresh();
			}
		}),
		player.onTrackChange(track => {
			currentTrack = track;
			sessionOffset = 0;
			sendOffset();
			view.post({ type: 'track', track });
			if (track) {
				void loadLyrics(track);
				void loadTempo(track);
			}
		}),
		player.onState(s => view.post({ type: 'state', isPlaying: s.isPlaying, progressMs: s.progressMs, timestamp: s.timestamp })),
		view.onDidChangeVisibility(updateActive),
		view.onMessage(m => {
			if (m.type === 'ready') {
				view.post({ type: 'auth', signedIn: auth.isSignedIn });
				sendConfig();
				sendOffset();
				player.refresh();
			} else if (m.type === 'signIn') {
				void vscode.commands.executeCommand('karaoke.signIn');
			} else if (m.type === 'searchLyrics') {
				void vscode.commands.executeCommand('karaoke.searchLyrics');
			}
		}),
		vscode.workspace.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('karaoke')) {
				sendConfig();
				sendOffset();
			}
		}),
		vscode.window.registerWebviewViewProvider(KaraokeViewProvider.viewType, view, {
			webviewOptions: { retainContextWhenHidden: true },
		}),
		vscode.commands.registerCommand('karaoke.show', () => view.reveal()),
		vscode.commands.registerCommand('karaoke.signIn', async () => {
			try {
				await auth.signIn();
			} catch (e) {
				vscode.window.showErrorMessage(`Spotify sign-in failed: ${e instanceof Error ? e.message : e}`);
			}
		}),
		vscode.commands.registerCommand('karaoke.signOut', () => auth.signOut()),
		vscode.commands.registerCommand('karaoke.reloadLyrics', () => {
			if (currentTrack) {
				void loadLyrics(currentTrack, true);
			}
		}),
		vscode.commands.registerCommand('karaoke.lyricsEarlier', () => { sessionOffset -= 250; sendOffset(); }),
		vscode.commands.registerCommand('karaoke.lyricsLater', () => { sessionOffset += 250; sendOffset(); }),
		vscode.commands.registerCommand('karaoke.tapTempo', () => view.post({ type: 'tap' })),
		vscode.commands.registerCommand('karaoke.searchLyrics', async () => {
			const track = currentTrack;
			const query = await vscode.window.showInputBox({
				prompt: 'Search LRCLIB for lyrics',
				value: track ? `${normalizeArtist(track.artist)} ${normalizeTitle(track.title)}` : '',
			});
			if (!query) {
				return;
			}
			const results = await lrclibSearch({ q: query });
			const pick = await vscode.window.showQuickPick(results.map(r => ({
				label: `${r.syncedLyrics ? '$(watch)' : '$(note)'} ${r.trackName}`,
				description: `${r.artistName} · ${r.albumName}`,
				detail: `${Math.floor(r.duration / 60)}:${String(Math.round(r.duration % 60)).padStart(2, '0')}` +
					(track ? `  (track is ${Math.floor(track.durationMs / 60000)}:${String(Math.round(track.durationMs / 1000) % 60).padStart(2, '0')})` : '') +
					(r.syncedLyrics ? '  · synced' : '  · plain only'),
				rec: r,
			})), { placeHolder: results.length ? 'Pick the matching song' : 'No results', matchOnDescription: true });
			if (!pick || !track || currentTrack?.id !== track.id) {
				return;
			}
			await lyrics.setOverride(track.id, pick.rec);
			view.post({ type: 'lyrics', trackId: track.id, ...toResult(pick.rec) });
		}),
		player,
		view,
	);

	await auth.load();
	updateActive();
}

export function deactivate() { }
