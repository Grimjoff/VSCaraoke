/**
 * Best-effort BPM lookup via ReccoBeats (free, keyed by Spotify track ID).
 * The response shape is parsed defensively; any failure returns undefined and the caller falls back.
 */
export async function fetchTempo(spotifyTrackId: string): Promise<number | undefined> {
	try {
		const res = await fetch(`https://api.reccobeats.com/v1/audio-features?ids=${encodeURIComponent(spotifyTrackId)}`, {
			headers: { Accept: 'application/json' },
		});
		if (!res.ok) {
			return undefined;
		}
		const j: unknown = await res.json();
		const tempo = findTempo(j);
		return tempo && tempo > 40 && tempo < 250 ? tempo : undefined;
	} catch {
		return undefined;
	}
}

function findTempo(v: unknown): number | undefined {
	if (Array.isArray(v)) {
		for (const x of v) {
			const t = findTempo(x);
			if (t) { return t; }
		}
	} else if (v && typeof v === 'object') {
		const o = v as Record<string, unknown>;
		if (typeof o.tempo === 'number') {
			return o.tempo;
		}
		for (const key of ['content', 'audio_features', 'data']) {
			const t = findTempo(o[key]);
			if (t) { return t; }
		}
	}
	return undefined;
}
