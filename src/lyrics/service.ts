import * as vscode from 'vscode';
import { TrackInfo } from '../spotify/player';
import { findLyrics, LrclibRecord } from './lrclib';
import { LyricLine, parseLrc } from './lrc';

export interface LyricsResult {
	kind: 'synced' | 'plain' | 'instrumental' | 'none';
	lines: LyricLine[];
	source?: string;
}

const CACHE_KEY = 'vscaraoke.lyricsCache';
const OVERRIDE_KEY = 'vscaraoke.lyricsOverrides';
const NOT_FOUND_TTL = 24 * 3600_000;
const MAX_CACHE = 300;

interface CacheEntry {
	rec?: LrclibRecord;
	at: number;
}

export function toResult(rec: LrclibRecord | undefined): LyricsResult {
	if (!rec) {
		return { kind: 'none', lines: [] };
	}
	const source = `${rec.artistName} – ${rec.trackName}`;
	if (rec.syncedLyrics) {
		return { kind: 'synced', lines: parseLrc(rec.syncedLyrics), source };
	}
	if (rec.plainLyrics) {
		return { kind: 'plain', lines: rec.plainLyrics.split(/\r?\n/).map(text => ({ timeMs: 0, text })), source };
	}
	return { kind: rec.instrumental ? 'instrumental' : 'none', lines: [], source };
}

export class LyricsService {
	constructor(private readonly state: vscode.Memento) { }

	private get cache(): Record<string, CacheEntry> {
		return this.state.get<Record<string, CacheEntry>>(CACHE_KEY, {});
	}

	private get overrides(): Record<string, LrclibRecord> {
		return this.state.get<Record<string, LrclibRecord>>(OVERRIDE_KEY, {});
	}

	async get(track: TrackInfo, bypassCache = false): Promise<LyricsResult> {
		const override = this.overrides[track.id];
		if (override) {
			return toResult(override);
		}
		const hit = this.cache[track.id];
		if (!bypassCache && hit && (hit.rec || Date.now() - hit.at < NOT_FOUND_TTL)) {
			return toResult(hit.rec);
		}
		const rec = await findLyrics({
			title: track.title,
			artist: track.artist,
			album: track.album,
			durationMs: track.durationMs,
		});
		await this.put(track.id, rec);
		return toResult(rec);
	}

	async setOverride(trackId: string, rec: LrclibRecord): Promise<void> {
		await this.state.update(OVERRIDE_KEY, { ...this.overrides, [trackId]: rec });
	}

	private async put(id: string, rec: LrclibRecord | undefined): Promise<void> {
		const entries = Object.entries({ ...this.cache, [id]: { rec, at: Date.now() } })
			.sort((a, b) => b[1].at - a[1].at)
			.slice(0, MAX_CACHE);
		await this.state.update(CACHE_KEY, Object.fromEntries(entries));
	}
}
