import { Stage } from './stage';
import { DEMO_BPM, DEMO_HUES, DEMO_LINES, DEMO_TRACK } from './demo';

declare function acquireVsCodeApi(): {
	postMessage(msg: unknown): void;
	getState(): { demoPaused?: boolean } | undefined;
	setState(state: { demoPaused?: boolean }): void;
};
const vscode = acquireVsCodeApi();

interface Line { timeMs: number; text: string; words?: { timeMs: number; text: string }[] }
interface Track { id: string; title: string; artist: string; album: string; durationMs: number; artUrl?: string }

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = {
	art: $<HTMLImageElement>('art'),
	title: $('title'),
	artist: $('artist'),
	fill: $('progress-fill'),
	bpm: $('bpm'),
	demoBtn: $<HTMLButtonElement>('demo-btn'),
	signinBtn: $<HTMLButtonElement>('signin-btn'),
	wrap: $('lyrics-wrap'),
	lyrics: $('lyrics'),
	empty: $('empty'),
	emptyText: $('empty-text'),
	emptyBtn: $<HTMLButtonElement>('empty-btn'),
	stage: $('stage'),
};

const DEFAULT_BPM = 110;
/** How long Spotify must be quiet before the demo takes over (avoids flicker on short pauses). */
const DEMO_GRACE_MS = 3000;

/** What Spotify reports. Kept even while the demo is on screen. */
const real = {
	signedIn: false,
	track: undefined as Track | undefined,
	isPlaying: false,
	progressMs: 0,
	receivedAt: performance.now(),
	lyrics: undefined as { trackId: string; lines: Line[]; kind: string; source?: string } | undefined,
	tempo: undefined as { trackId: string; bpm: number } | undefined,
	// start almost "expired" so the demo appears ~1s after opening when nothing plays
	lastPlayingAt: performance.now() - DEMO_GRACE_MS + 1000,
};

/** The silent demo song. */
const demo = {
	enabled: true,
	paused: vscode.getState()?.demoPaused ?? false,
	elapsed: 0,
};

let mode: 'spotify' | 'demo' = 'spotify';

/** What is currently on screen. */
const s = {
	track: undefined as Track | undefined,
	lines: [] as Line[],
	lineEls: [] as HTMLElement[],
	synced: false,
	offsetMs: 0,
	lineFill: 'instant' as string,
	bpm: DEFAULT_BPM,
	bpmSource: 'default' as 'default' | 'api' | 'tap' | 'demo',
	beatPhase: 0,
	active: -1,
	taps: [] as number[],
};

const stage = new Stage($<HTMLCanvasElement>('stage-canvas'));

// ---------- clock ----------
function realProgress(): number {
	const p = real.progressMs + (real.isPlaying ? performance.now() - real.receivedAt : 0);
	return real.track ? Math.min(p, real.track.durationMs) : p;
}

function progress(): number {
	return mode === 'demo' ? demo.elapsed % DEMO_TRACK.durationMs : realProgress();
}

function playing(): boolean {
	return mode === 'demo' ? !demo.paused : real.isPlaying && !!real.track;
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
	const t = mode === 'demo' ? ms : ms - s.offsetMs;
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
		const fill = s.lineFill === 'sweep' ? lineFill(idx, t) : 1;
		cur.style.setProperty('--p', `${(fill * 100).toFixed(1)}%`);
	}
}

/** How much of line i has been sung at time t (0..1). Uses word timings when the LRC has them. */
function lineFill(i: number, t: number): number {
	const line = s.lines[i];
	const next = s.lines[i + 1]?.timeMs ?? line.timeMs + 4000;
	const words = line.words;
	if (words?.length) {
		const total = words.reduce((n, w) => n + w.text.length, 0) || 1;
		let done = 0;
		for (let k = 0; k < words.length; k++) {
			const w = words[k];
			if (t < w.timeMs) {
				break;
			}
			// last word: assume it is held at most 1.5s (or until the next line)
			const end = words[k + 1]?.timeMs ?? Math.min(next, w.timeMs + 1500);
			const f = Math.min(1, (t - w.timeMs) / Math.max(1, end - w.timeMs));
			done += w.text.length * f;
			if (f < 1) {
				break;
			}
		}
		return done / total;
	}
	// no word timings: spread evenly, finishing a bit before the next line
	return Math.max(0, Math.min(1, (t - line.timeMs) / Math.max(1, Math.min(next - line.timeMs, 6000) * 0.9)));
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
	if (mode === 'demo') {
		return;
	}
	if (!real.signedIn) {
		renderLyrics([], 'none');
		showEmpty('Connect Spotify to start singing along.', 'Sign in to Spotify', 'signIn');
	} else if (!real.track) {
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
	el.title.textContent = t?.title ?? 'VSCARAOKE';
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
	el.bpm.title = (s.bpmSource === 'default' ? 'Tempo unknown.'
		: s.bpmSource === 'tap' ? 'Tapped tempo.'
			: s.bpmSource === 'demo' ? 'Demo tempo.' : 'Tempo from ReccoBeats.')
		+ ' Click here on the beat (3+ times) to tap it.';
}

function updateHeaderButtons(): void {
	el.demoBtn.hidden = mode !== 'demo';
	el.demoBtn.textContent = demo.paused ? 'PARTY' : 'REST';
	el.demoBtn.title = demo.paused ? 'Wake the crew up' : 'Let the crew take a nap';
	el.signinBtn.hidden = !(mode === 'demo' && !real.signedIn);
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

// ---------- mode switching ----------
function enterDemo(): void {
	mode = 'demo';
	setTrack(DEMO_TRACK);
	s.bpm = DEMO_BPM;
	s.bpmSource = 'demo';
	updateBpmLabel();
	showDemoLyrics();
	document.documentElement.style.removeProperty('--accent');
	stage.setHues(DEMO_HUES);
	updateHeaderButtons();
}

/** Demo lyrics while the crew performs; hidden while they rest. */
function showDemoLyrics(): void {
	if (demo.paused) {
		renderLyrics([], 'resting');
		showEmpty('Zzz… the crew is taking a nap.');
	} else {
		renderLyrics(DEMO_LINES, 'synced');
	}
}

function enterSpotify(): void {
	mode = 'spotify';
	const t = real.track;
	setTrack(t);
	if (t) {
		if (real.lyrics?.trackId === t.id) {
			renderLyrics(real.lyrics.lines, real.lyrics.kind, real.lyrics.source);
		} else {
			renderLyrics([], 'loading');
			showEmpty('Looking for lyrics…');
		}
		if (real.tempo?.trackId === t.id) {
			s.bpm = real.tempo.bpm;
			s.bpmSource = 'api';
			updateBpmLabel();
		}
	} else {
		renderLyrics([], 'none');
		refreshEmpty();
	}
	updateHeaderButtons();
}

function updateMode(now: number): void {
	const spotifyPlaying = real.signedIn && !!real.track && real.isPlaying;
	if (spotifyPlaying) {
		real.lastPlayingAt = now;
	}
	const wantDemo = demo.enabled && !spotifyPlaying && now - real.lastPlayingAt > DEMO_GRACE_MS;
	if (wantDemo && mode !== 'demo') {
		enterDemo();
	} else if (!wantDemo && mode === 'demo' && (spotifyPlaying || !demo.enabled)) {
		enterSpotify();
	}
}

el.demoBtn.addEventListener('click', () => {
	demo.paused = !demo.paused;
	if (!demo.paused) {
		demo.elapsed = 0; // back from the nap: start the song over
	}
	vscode.setState({ demoPaused: demo.paused });
	if (mode === 'demo') {
		showDemoLyrics();
	}
	updateHeaderButtons();
});
el.signinBtn.addEventListener('click', () => vscode.postMessage({ type: 'signIn' }));

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
	const showing = mode === 'spotify';
	switch (m.type) {
		case 'auth':
			real.signedIn = m.signedIn;
			if (!m.signedIn) {
				real.track = undefined;
				real.isPlaying = false;
				if (showing) { setTrack(undefined); }
			}
			refreshEmpty();
			updateHeaderButtons();
			break;
		case 'track':
			real.track = m.track;
			real.lyrics = undefined;
			real.tempo = undefined;
			if (showing) {
				setTrack(m.track);
				if (m.track) { renderLyrics([], 'loading'); showEmpty('Looking for lyrics…'); }
			}
			break;
		case 'state': {
			const incoming = m.progressMs + (Date.now() - m.timestamp);
			const current = realProgress();
			const drift = incoming - current;
			// Small differences are poll jitter: ease toward them so the fill doesn't twitch.
			// Big ones (seek, pause/resume, new track) snap immediately.
			real.progressMs = real.isPlaying && m.isPlaying && Math.abs(drift) < 150 ? current + drift * 0.3 : incoming;
			real.isPlaying = m.isPlaying;
			real.receivedAt = performance.now();
			break;
		}
		case 'lyricsLoading':
			if (showing && m.trackId === s.track?.id) { showEmpty('Looking for lyrics…'); }
			break;
		case 'lyrics':
			real.lyrics = { trackId: m.trackId, lines: m.lines, kind: m.kind, source: m.source };
			if (showing && m.trackId === s.track?.id) { renderLyrics(m.lines, m.kind, m.source); }
			break;
		case 'tempo':
			if (m.bpm) {
				real.tempo = { trackId: m.trackId, bpm: m.bpm };
			}
			if (showing && m.trackId === s.track?.id && m.bpm && s.bpmSource !== 'tap') {
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
			s.lineFill = m.lineFill ?? 'instant';
			demo.enabled = m.demoWhenIdle ?? true;
			break;
		case 'tap':
			tap();
			break;
	}
});

// ---------- loop ----------
const t0 = performance.now();
let lastFrame = t0;
function frame(): void {
	const now = performance.now();
	if (mode === 'demo' && !demo.paused) {
		demo.elapsed += now - lastFrame;
	}
	lastFrame = now;
	updateMode(now);

	const ms = progress();
	if (s.track) {
		el.fill.style.width = `${(ms / s.track.durationMs) * 100}%`;
	}
	updateLyrics(ms);
	stage.draw({ beats: beats(ms), playing: playing(), time: (now - t0) / 1000 });
	requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

refreshEmpty();
updateHeaderButtons();
vscode.postMessage({ type: 'ready' });
