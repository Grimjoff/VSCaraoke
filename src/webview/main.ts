import { Stage } from './stage';

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

interface Line { timeMs: number; text: string }
interface Track { id: string; title: string; artist: string; album: string; durationMs: number; artUrl?: string }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
	art: $<HTMLImageElement>('art'),
	title: $('title'),
	artist: $('artist'),
	fill: $('progress-fill'),
	bpm: $('bpm'),
	wrap: $('lyrics-wrap'),
	lyrics: $('lyrics'),
	empty: $('empty'),
	emptyText: $('empty-text'),
	emptyBtn: $<HTMLButtonElement>('empty-btn'),
	stage: $('stage'),
};

const DEFAULT_BPM = 110;

const s = {
	signedIn: false,
	track: undefined as Track | undefined,
	isPlaying: false,
	progressMs: 0,
	receivedAt: performance.now(),
	lines: [] as Line[],
	lineEls: [] as HTMLElement[],
	synced: false,
	offsetMs: 0,
	bpm: DEFAULT_BPM,
	bpmSource: 'default' as 'default' | 'api' | 'tap',
	beatPhase: 0,
	active: -1,
	taps: [] as number[],
};

const stage = new Stage($<HTMLCanvasElement>('stage-canvas'));

// ---------- clock ----------
function progress(): number {
	const p = s.progressMs + (s.isPlaying ? performance.now() - s.receivedAt : 0);
	return s.track ? Math.min(p, s.track.durationMs) : p;
}

function beats(ms: number): number {
	return (ms / 60000) * s.bpm + s.beatPhase;
}

// ---------- lyrics ----------
function renderLyrics(lines: Line[], kind: string, source?: string): void {
	s.lines = lines;
	s.synced = kind === 'synced';
	s.active = -1;
	el.lyrics.replaceChildren();
	el.lyrics.style.transform = '';
	el.lyrics.classList.toggle('plain', !s.synced);
	s.lineEls = lines.map(l => {
		const d = document.createElement('div');
		d.className = 'line';
		d.textContent = l.text || '♪';
		if (!l.text) { d.classList.add('gap'); }
		el.lyrics.appendChild(d);
		return d;
	});
	if (!s.synced && lines.length) {
		const badge = document.createElement('div');
		badge.className = 'badge';
		badge.textContent = 'not synced';
		el.lyrics.prepend(badge);
	}
	if (lines.length === 0) {
		const msg = kind === 'instrumental' ? '♪ instrumental ♪'
			: kind === 'error' ? 'Could not reach the lyrics service.'
				: 'No lyrics found for this song.';
		showEmpty(msg, kind === 'instrumental' ? undefined : 'Search manually', 'searchLyrics');
	} else {
		hideEmpty();
	}
	el.wrap.title = source ? `Lyrics: ${source}` : '';
}

function updateLyrics(ms: number): void {
	if (!s.synced || s.lines.length === 0) {
		return;
	}
	const t = ms - s.offsetMs;
	let lo = 0, hi = s.lines.length - 1, idx = -1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		if (s.lines[mid].timeMs <= t) { idx = mid; lo = mid + 1; } else { hi = mid - 1; }
	}
	if (idx !== s.active) {
		s.lineEls[s.active]?.classList.remove('active');
		s.active = idx;
		s.lineEls.forEach((e, i) => {
			e.classList.toggle('past', i < idx);
			e.classList.toggle('near', Math.abs(i - idx) === 1);
		});
		const cur = s.lineEls[Math.max(0, idx)];
		cur?.classList.toggle('active', idx >= 0);
		if (cur) {
			const y = el.wrap.clientHeight / 2 - (cur.offsetTop + cur.offsetHeight / 2);
			el.lyrics.style.transform = `translateY(${Math.round(y)}px)`;
		}
	}
	// karaoke wipe on the active line
	const cur = s.lineEls[idx];
	if (cur) {
		const start = s.lines[idx].timeMs;
		const end = s.lines[idx + 1]?.timeMs ?? start + 4000;
		const p = Math.max(0, Math.min(1, (t - start) / Math.max(1, Math.min(end - start, 6000) * 0.9)));
		cur.style.setProperty('--p', `${(p * 100).toFixed(1)}%`);
	}
}

// ---------- empty states ----------
let emptyAction: string | undefined;
function showEmpty(text: string, btn?: string, action?: string): void {
	el.empty.hidden = false;
	el.emptyText.textContent = text;
	el.emptyBtn.hidden = !btn;
	el.emptyBtn.textContent = btn ?? '';
	emptyAction = action;
}
function hideEmpty(): void {
	el.empty.hidden = true;
}
el.emptyBtn.addEventListener('click', () => {
	if (emptyAction) { vscode.postMessage({ type: emptyAction }); }
});

function refreshEmpty(): void {
	if (!s.signedIn) {
		renderLyrics([], 'none');
		showEmpty('Connect Spotify to start singing along.', 'Sign in to Spotify', 'signIn');
	} else if (!s.track) {
		el.lyrics.replaceChildren();
		s.lines = [];
		showEmpty('Nothing playing. The sproutlings are napping…');
	}
}

// ---------- header ----------
function setTrack(t?: Track): void {
	s.track = t;
	s.bpm = DEFAULT_BPM;
	s.bpmSource = 'default';
	s.beatPhase = 0;
	el.title.textContent = t?.title ?? 'KARAOKE';
	el.artist.textContent = t?.artist ?? '';
	if (t?.artUrl) {
		el.art.hidden = false;
		el.art.src = t.artUrl;
		void extractHues(t.artUrl).then(h => h && s.track?.id === t.id && stage.setHues(h));
	} else {
		el.art.hidden = true;
	}
	updateBpmLabel();
	refreshEmpty();
}

function updateBpmLabel(): void {
	el.bpm.textContent = s.track ? `${Math.round(s.bpm)}${s.bpmSource === 'default' ? '?' : ''} BPM` : '';
	el.bpm.title = (s.bpmSource === 'default' ? 'Tempo unknown.' : s.bpmSource === 'tap' ? 'Tapped tempo.' : 'Tempo from ReccoBeats.')
		+ ' Click here on the beat (3+ times) to tap it.';
}

/** Samples album art and returns a few distinct, saturated hues. */
async function extractHues(url: string): Promise<number[] | undefined> {
	try {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.src = url;
		await img.decode();
		const c = document.createElement('canvas');
		c.width = c.height = 24;
		const ctx = c.getContext('2d')!;
		ctx.drawImage(img, 0, 0, 24, 24);
		const data = ctx.getImageData(0, 0, 24, 24).data;
		const buckets = new Array(12).fill(0);
		for (let i = 0; i < data.length; i += 4) {
			const [h, sat, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);
			if (sat > 0.25 && l > 0.2 && l < 0.85) {
				buckets[Math.floor(h / 30) % 12] += sat;
			}
		}
		const top = buckets.map((v, i) => [v, i * 30 + 15]).filter(([v]) => v > 2).sort((a, b) => b[0] - a[0]).map(([, h]) => h);
		if (top.length === 0) { return undefined; }
		const accent = top[0];
		document.documentElement.style.setProperty('--accent', `hsl(${accent} 80% 65%)`);
		// pad with spread hues so creatures stay distinct
		while (top.length < 4) { top.push((top[top.length - 1] + 95) % 360); }
		return top.slice(0, 6);
	} catch {
		document.documentElement.style.removeProperty('--accent');
		return undefined;
	}
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	r /= 255; g /= 255; b /= 255;
	const max = Math.max(r, g, b), min = Math.min(r, g, b);
	const l = (max + min) / 2;
	if (max === min) { return [0, 0, l]; }
	const d = max - min;
	const sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
	const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
	return [h * 60, sat, l];
}

// ---------- tap tempo ----------
function tap(): void {
	const now = performance.now();
	s.taps = s.taps.filter(t => now - t < 2500);
	s.taps.push(now);
	if (s.taps.length >= 3) {
		const iv = (s.taps[s.taps.length - 1] - s.taps[0]) / (s.taps.length - 1);
		s.bpm = 60000 / iv;
		s.bpmSource = 'tap';
		// align phase so this tap lands on a whole beat
		const raw = (progress() / 60000) * s.bpm;
		s.beatPhase = Math.round(raw) - raw;
		updateBpmLabel();
	}
	el.bpm.classList.add('tapped');
	setTimeout(() => el.bpm.classList.remove('tapped'), 80);
}
el.bpm.addEventListener('click', tap);

// ---------- dance floor ----------
el.stage.addEventListener('click', () => {
	const hues = stage.shuffleColors();
	const hue = hues[Math.floor(Math.random() * hues.length)];
	el.stage.style.setProperty('--flash', `hsl(${hue} 85% 60%)`);
	el.stage.classList.add('flash');
	setTimeout(() => el.stage.classList.remove('flash'), 80);
});

// ---------- messages ----------
window.addEventListener('message', ev => {
	const m = ev.data;
	switch (m.type) {
		case 'auth':
			s.signedIn = m.signedIn;
			if (!m.signedIn) { setTrack(undefined); }
			refreshEmpty();
			break;
		case 'track':
			setTrack(m.track);
			if (m.track) { renderLyrics([], 'loading'); showEmpty('Looking for lyrics…'); }
			break;
		case 'state':
			s.isPlaying = m.isPlaying;
			s.progressMs = m.progressMs + (Date.now() - m.timestamp);
			s.receivedAt = performance.now();
			break;
		case 'lyricsLoading':
			if (m.trackId === s.track?.id) { showEmpty('Looking for lyrics…'); }
			break;
		case 'lyrics':
			if (m.trackId === s.track?.id) { renderLyrics(m.lines, m.kind, m.source); }
			break;
		case 'tempo':
			if (m.trackId === s.track?.id && m.bpm && s.bpmSource !== 'tap') {
				s.bpm = m.bpm;
				s.bpmSource = 'api';
				updateBpmLabel();
			}
			break;
		case 'offset':
			s.offsetMs = m.ms;
			s.active = -2; // force re-layout
			break;
		case 'config':
			el.stage.style.height = `${Math.max(48, Math.min(240, m.stageHeight))}px`;
			stage.setSpecies(m.species);
			stage.setChaos(m.chaos);
			stage.setCreatureCount(m.creatureCount);
			stage.showVisualizer = m.showVisualizer;
			break;
		case 'tap':
			tap();
			break;
	}
});

// ---------- loop ----------
const t0 = performance.now();
function frame(): void {
	const ms = progress();
	if (s.track) {
		el.fill.style.width = `${(ms / s.track.durationMs) * 100}%`;
	}
	updateLyrics(ms);
	stage.draw({ beats: beats(ms), playing: s.isPlaying && !!s.track, time: (performance.now() - t0) / 1000 });
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

refreshEmpty();
vscode.postMessage({ type: 'ready' });
