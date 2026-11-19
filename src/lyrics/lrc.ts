export interface LyricWord {
	timeMs: number;
	text: string;
}

export interface LyricLine {
	timeMs: number;
	text: string;
	/** Per-word timings, only present for "enhanced" LRC (<mm:ss.xx> tags inside the line). */
	words?: LyricWord[];
}

const LINE_TAG = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD_TAG = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;

function toMs(min: string, sec: string, frac?: string): number {
	return (parseInt(min, 10) * 60 + parseInt(sec, 10)) * 1000 + (frac ? parseInt(frac.padEnd(3, '0').slice(0, 3), 10) : 0);
}

/** Splits "<00:01.00>Hello <00:01.50>world" into timed words. Text before the first tag starts at lineTime. */
function parseWords(body: string, lineTime: number): LyricWord[] | undefined {
	const tags = [...body.matchAll(WORD_TAG)];
	if (tags.length === 0) {
		return undefined;
	}
	const words: LyricWord[] = [];
	const lead = body.slice(0, tags[0].index).trim();
	if (lead) {
		words.push({ timeMs: lineTime, text: lead });
	}
	tags.forEach((m, i) => {
		const start = m.index! + m[0].length;
		const end = i + 1 < tags.length ? tags[i + 1].index! : body.length;
		const text = body.slice(start, end);
		if (text.trim()) {
			words.push({ timeMs: toMs(m[1], m[2], m[3]), text });
		}
	});
	// normalize spacing: trim the whole run, keep inner spaces as part of each word
	if (words.length) {
		words[0].text = words[0].text.trimStart();
		words[words.length - 1].text = words[words.length - 1].text.trimEnd();
	}
	return words.length ? words : undefined;
}

/** Parses LRC text into time-sorted lines. Lines with several time tags are duplicated. */
export function parseLrc(lrc: string): LyricLine[] {
	const out: LyricLine[] = [];
	for (const raw of lrc.split(/\r?\n/)) {
		const tags = [...raw.matchAll(LINE_TAG)];
		if (tags.length === 0) {
			continue;
		}
		const body = raw.replace(LINE_TAG, '');
		const text = body.replace(WORD_TAG, '').replace(/\s{2,}/g, ' ').trim();
		for (const m of tags) {
			const timeMs = toMs(m[1], m[2], m[3]);
			const words = parseWords(body, timeMs);
			out.push(words ? { timeMs, text, words } : { timeMs, text });
		}
	}
	return out.sort((a, b) => a.timeMs - b.timeMs);
}
