import * as vscode from 'vscode';
import { SpotifyAuth } from './auth';

export interface TrackInfo {
	id: string;
	title: string;
	artist: string;
	album: string;
	durationMs: number;
	artUrl?: string;
}

export interface PlaybackState {
	track?: TrackInfo;
	isPlaying: boolean;
	progressMs: number;
	/** Date.now() at which progressMs was valid. */
	timestamp: number;
}

/** Polls Spotify's currently-playing endpoint while active (view visible + signed in). */
export class SpotifyPlayer implements vscode.Disposable {
	private timer?: NodeJS.Timeout;
	private active = false;
	private lastTrackId?: string;
	private readonly _onState = new vscode.EventEmitter<PlaybackState>();
	private readonly _onTrackChange = new vscode.EventEmitter<TrackInfo | undefined>();
	readonly onState = this._onState.event;
	readonly onTrackChange = this._onTrackChange.event;

	constructor(private readonly auth: SpotifyAuth) { }

	setActive(active: boolean): void {
		if (active === this.active) {
			return;
		}
		this.active = active;
		clearTimeout(this.timer);
		if (active) {
			void this.tick();
		}
	}

	/** Polls immediately and re-announces the current track. */
	refresh(): void {
		this.lastTrackId = undefined;
		if (this.active) {
			clearTimeout(this.timer);
			void this.tick();
		}
	}

	private async tick(): Promise<void> {
		let next = 5000;
		try {
			const token = await this.auth.getAccessToken();
			if (!token) {
				this.emit({ isPlaying: false, progressMs: 0, timestamp: Date.now() });
				return;
			}
			const sentAt = Date.now();
			const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode', {
				headers: { Authorization: `Bearer ${token}` },
			});
			// Spotify measured progress_ms somewhere during the round trip; the midpoint is the best guess.
			const measuredAt = sentAt + (Date.now() - sentAt) / 2;
			if (res.status === 204) {
				this.emit({ isPlaying: false, progressMs: 0, timestamp: Date.now() });
			} else if (res.status === 429) {
				next = (parseInt(res.headers.get('Retry-After') ?? '5', 10) || 5) * 1000;
			} else if (res.ok) {
				const j = await res.json() as any;
				const item = j.item;
				const track: TrackInfo | undefined = item ? {
					id: item.id ?? item.uri,
					title: item.name,
					artist: (item.artists ?? []).map((a: any) => a.name).join(', ') || item.show?.name || '',
					album: item.album?.name ?? '',
					durationMs: item.duration_ms,
					artUrl: (item.album?.images ?? item.images ?? [])[0]?.url,
				} : undefined;
				this.emit({ track, isPlaying: !!j.is_playing, progressMs: j.progress_ms ?? 0, timestamp: measuredAt });
				next = j.is_playing ? 1000 : 4000;
			}
		} catch {
			next = 10000;
		} finally {
			clearTimeout(this.timer);
			if (this.active && this.auth.isSignedIn) {
				this.timer = setTimeout(() => void this.tick(), next);
			}
		}
	}

	private emit(state: PlaybackState): void {
		const id = state.track?.id;
		if (id !== this.lastTrackId) {
			this.lastTrackId = id;
			this._onTrackChange.fire(state.track);
		}
		this._onState.fire(state);
	}

	dispose(): void {
		clearTimeout(this.timer);
		this._onState.dispose();
		this._onTrackChange.dispose();
	}
}
