import * as vscode from 'vscode';
import * as crypto from 'crypto';

/** Messages the extension host sends to the webview. */
export type HostMessage =
	| { type: 'auth'; signedIn: boolean }
	| { type: 'track'; track?: { id: string; title: string; artist: string; album: string; durationMs: number; artUrl?: string } }
	| { type: 'state'; isPlaying: boolean; progressMs: number; timestamp: number }
	| { type: 'lyrics'; trackId: string; kind: string; lines: { timeMs: number; text: string }[]; source?: string }
	| { type: 'lyricsLoading'; trackId: string }
	| { type: 'tempo'; trackId: string; bpm?: number }
	| { type: 'offset'; ms: number }
	| { type: 'config'; creatureCount: number; showVisualizer: boolean }
	| { type: 'tap' };

/** Messages the webview sends back. */
export type ViewMessage =
	| { type: 'ready' }
	| { type: 'signIn' }
	| { type: 'searchLyrics' };

export class KaraokeViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
	public static readonly viewType = 'karaoke.lyricsView';
	private view?: vscode.WebviewView;
	private readonly disposables: vscode.Disposable[] = [];

	private readonly _onVisibility = new vscode.EventEmitter<boolean>();
	readonly onDidChangeVisibility = this._onVisibility.event;
	private readonly _onMessage = new vscode.EventEmitter<ViewMessage>();
	readonly onMessage = this._onMessage.event;

	constructor(private readonly extensionUri: vscode.Uri) { }

	get visible(): boolean {
		return !!this.view?.visible;
	}

	resolveWebviewView(view: vscode.WebviewView): void {
		this.view = view;
		const dist = vscode.Uri.joinPath(this.extensionUri, 'dist');
		const media = vscode.Uri.joinPath(this.extensionUri, 'media');
		view.webview.options = { enableScripts: true, localResourceRoots: [dist, media] };
		view.webview.html = this.html(view.webview, dist, media);

		this.disposables.push(
			view.webview.onDidReceiveMessage((m: ViewMessage) => this._onMessage.fire(m)),
			view.onDidChangeVisibility(() => this._onVisibility.fire(view.visible)),
			view.onDidDispose(() => {
				this.view = undefined;
				this._onVisibility.fire(false);
			}),
		);
		this._onVisibility.fire(view.visible);
	}

	post(msg: HostMessage): void {
		void this.view?.webview.postMessage(msg);
	}

	reveal(): void {
		if (this.view) {
			this.view.show(true);
		} else {
			void vscode.commands.executeCommand(`${KaraokeViewProvider.viewType}.focus`);
		}
	}

	private html(webview: vscode.Webview, dist: vscode.Uri, media: vscode.Uri): string {
		const nonce = crypto.randomBytes(16).toString('base64');
		const script = webview.asWebviewUri(vscode.Uri.joinPath(dist, 'webview.js'));
		const style = webview.asWebviewUri(vscode.Uri.joinPath(media, 'webview.css'));
		const font = webview.asWebviewUri(vscode.Uri.joinPath(media, 'fonts', 'PressStart2P-Regular.ttf'));
		const csp = [
			`default-src 'none'`,
			`img-src ${webview.cspSource} https://i.scdn.co https: data:`,
			`style-src ${webview.cspSource} 'unsafe-inline'`,
			`font-src ${webview.cspSource}`,
			`script-src 'nonce-${nonce}'`,
		].join('; ');
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>@font-face { font-family: 'PixelFont'; src: url('${font}') format('truetype'); }</style>
<link rel="stylesheet" href="${style}">
<title>Karaoke</title>
</head>
<body>
<div id="app">
	<header id="header">
		<img id="art" alt="" hidden>
		<div id="meta">
			<div id="title">KARAOKE</div>
			<div id="artist"></div>
			<div id="progress"><div id="progress-fill"></div></div>
		</div>
		<div id="bpm" title="Click the stage to tap the tempo"></div>
	</header>
	<main id="lyrics-wrap">
		<div id="lyrics"></div>
		<div id="empty" hidden>
			<div id="empty-text"></div>
			<button id="empty-btn" hidden></button>
		</div>
	</main>
	<footer id="stage" title="Click to tap the tempo">
		<canvas id="stage-canvas"></canvas>
	</footer>
</div>
<script nonce="${nonce}" src="${script}"></script>
</body>
</html>`;
	}

	dispose(): void {
		this.disposables.forEach(d => d.dispose());
		this._onVisibility.dispose();
		this._onMessage.dispose();
	}
}
