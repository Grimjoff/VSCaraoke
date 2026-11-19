import { normalizeArtist, normalizeTitle } from './normalize';

const BASE = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'VSCaraoke (https://github.com/Grimjoff/VSCaraoke)' };

export interface LrclibRecord {
	id: number;
	trackName: string;
	artistName: string;
	albumName: string;
	duration: number; // seconds
	instrumental: boolean;
	plainLyrics: string | null;
	syncedLyrics: string | null;
}

export interface TrackQuery {
	title: string;
	artist: string;
	album: string;
	durationMs: number;
}

async function getJson<T>(url: string): Promise<T | undefined> {
	const res = await fetch(url, { headers: HEADERS });
	if (res.status === 404) {
		return undefined;
	}
	if (!res.ok) {
		throw new Error(`LRCLIB ${res.status}`);
	}
	return (await res.json()) as T;
}

export async function lrclibGet(q: TrackQuery): Promise<LrclibRecord | undefined> {
	const p = new URLSearchParams({
		track_name: q.title,
		artist_name: q.artist,
		album_name: q.album,
		duration: String(Math.round(q.durationMs / 1000)),
	});
	return getJson<LrclibRecord>(`${BASE}/get?${p}`);
}

export async function lrclibSearch(query: { q?: string; track?: string; artist?: string }): Promise<LrclibRecord[]> {
	const p = new URLSearchParams();
	if (query.q) { p.set('q', query.q); }
	if (query.track) { p.set('track_name', query.track); }
	if (query.artist) { p.set('artist_name', query.artist); }
	return (await getJson<LrclibRecord[]>(`${BASE}/search?${p}`)) ?? [];
}

/** Picks the synced result whose duration is closest to the target (within tolerance), else best plain one. */
export function pickBest(results: LrclibRecord[], durationMs: number, toleranceSec = 3): LrclibRecord | undefined {
	const target = durationMs / 1000;
	const close = results
		.filter(r => Math.abs(r.duration - target) <= toleranceSec)
		.sort((a, b) => Math.abs(a.duration - target) - Math.abs(b.duration - target));
	return close.find(r => r.syncedLyrics) ?? close.find(r => r.plainLyrics || r.instrumental);
}

/** Lookup chain: exact get -> normalized get -> search -> undefined. */
export async function findLyrics(q: TrackQuery): Promise<LrclibRecord | undefined> {
	const exact = await lrclibGet(q);
	if (exact?.syncedLyrics) {
		return exact;
	}
	const norm: TrackQuery = { ...q, title: normalizeTitle(q.title), artist: normalizeArtist(q.artist) };
	const changed = norm.title !== q.title || norm.artist !== q.artist;
	const normalized = changed ? await lrclibGet(norm) : undefined;
	if (normalized?.syncedLyrics) {
		return normalized;
	}
	const searched = pickBest(await lrclibSearch({ track: norm.title, artist: norm.artist }), q.durationMs);
	if (searched?.syncedLyrics) {
		return searched;
	}
	return exact ?? normalized ?? searched;
}
