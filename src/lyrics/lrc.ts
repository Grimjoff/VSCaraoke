export interface LyricLine {
	timeMs: number;
	text: string;
}

const TIME_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/** Parses LRC text into time-sorted lines. Lines with several time tags are duplicated. */
export function parseLrc(lrc: string): LyricLine[] {
	const out: LyricLine[] = [];
	for (const raw of lrc.split(/\r?\n/)) {
		const tags = [...raw.matchAll(TIME_TAG)];
		if (tags.length === 0) {
			continue;
		}
		const text = raw.replace(TIME_TAG, '').trim();
		for (const m of tags) {
			const min = parseInt(m[1], 10);
			const sec = parseInt(m[2], 10);
			const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
			out.push({ timeMs: (min * 60 + sec) * 1000 + frac, text });
		}
	}
	return out.sort((a, b) => a.timeMs - b.timeMs);
}
