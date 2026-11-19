import { buildSprite, DANCER_SPECIES, paletteFor, Pose, poseKey, SPECIES, SpeciesName, Sprite } from './sprites';
import { Particles } from './particles';

const SCALE = 4; // screen pixels per art pixel

export type Chaos = 'calm' | 'lively' | 'chaos';
const CHAOS_LEVEL: Record<Chaos, number> = { calm: 0, lively: 1, chaos: 2 };
/** [calm, lively, chaos] */
const by = <T>(lvl: number, v: [T, T, T]): T => v[lvl];

type Move = 'bob' | 'hop' | 'sway' | 'wave' | 'cheer' | 'spin' | 'leap' | 'flop' | 'stomp' | 'headbang' | 'loop';
const GROUND_MOVES: Move[] = ['bob', 'hop', 'sway', 'wave', 'cheer', 'spin', 'stomp', 'headbang'];
const FLOAT_MOVES: Move[] = ['sway', 'wave', 'cheer', 'loop', 'spin'];

interface Actor {
	species: SpeciesName;
	hue: number;
	palette: string[];
	x: number;
	targetX: number;
	lane: number;
	offbeat: boolean;
	move: Move;
	leapFrom: number;
	leapBeat: number;
	blinkUntil: number;
	nextBlink: number;
	vx: number;
	seed: number;
}

export interface Beat {
	/** continuous beat count (approximate phase) */
	beats: number;
	playing: boolean;
	/** seconds since stage start, for idle animations */
	time: number;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const shuffle = <T>(arr: T[]): T[] => arr.map(v => [Math.random(), v] as const).sort((a, b) => a[0] - b[0]).map(([, v]) => v);

/** Smooth 1D value noise. */
function rnd(a: number, b: number): number {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
}
function noise(t: number, seed: number): number {
	const i = Math.floor(t);
	const f = t - i;
	const u = f * f * (3 - 2 * f);
	return rnd(i, seed) * (1 - u) + rnd(i + 1, seed) * u;
}

export class Stage {
	private readonly ctx: CanvasRenderingContext2D;
	private w = 0;
	private h = 0;
	private dancers: Actor[] = [];
	private critters: Actor[] = [];
	private hues: number[] = [340, 200, 45, 140, 275, 20];
	private count = 6;
	private chaos = 1;
	private pool: SpeciesName[] = [...DANCER_SPECIES];
	showVisualizer = true;
	private readonly particles = new Particles();
	private spriteCache = new Map<string, HTMLCanvasElement>();
	private level = 0;
	private lastBeat = Number.NaN;
	private lastTime = 0;
	private shake = 0;
	private peaks: number[] = [];

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.ctx = canvas.getContext('2d')!;
		new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
		this.resize();
	}

	// ---------- config ----------
	setCreatureCount(n: number): void {
		this.count = Math.max(0, Math.min(12, n));
		this.populate();
	}

	setChaos(c: Chaos): void {
		this.chaos = CHAOS_LEVEL[c] ?? 1;
		this.populate();
	}

	setSpecies(names: string[]): void {
		const valid = names.filter((n): n is SpeciesName => (DANCER_SPECIES as string[]).includes(n));
		this.pool = valid.length ? valid : [...DANCER_SPECIES];
		this.populate();
	}

	setHues(hues: number[]): void {
		if (hues.length) {
			this.hues = hues;
		}
		[...this.dancers, ...this.critters].forEach((a, i) => this.colorize(a, i));
		this.spriteCache.clear();
	}

	/** Gives every creature (and the bars) a fresh random color, with a little sparkle pop. */
	shuffleColors(): number[] {
		const start = Math.random() * 360;
		this.hues = Array.from({ length: 6 }, (_, i) => Math.round(start + i * 61 + (Math.random() - 0.5) * 30) % 360);
		for (const a of [...this.dancers, ...this.critters]) {
			a.hue = Math.floor(Math.random() * 360);
			a.palette = paletteFor(a.species, a.hue);
			this.particles.burst(3, () => ({
				shape: Math.random() < 0.5 ? 'spark' : 'px',
				x: a.x + (Math.random() - 0.5) * 12, y: this.floor - 6 - Math.random() * 12,
				vx: (Math.random() - 0.5) * 16, vy: -6 - Math.random() * 10,
				life: 0.6 + Math.random() * 0.4, color: `hsl(${a.hue} 95% 78%)`,
			}));
		}
		this.spriteCache.clear();
		return this.hues;
	}

	private colorize(a: Actor, i: number): void {
		// jitter so same-hue creatures still look different
		a.hue = Math.round((this.hues[i % this.hues.length] + (rnd(i, a.seed) - 0.5) * 36 + 360) % 360);
		a.palette = paletteFor(a.species, a.hue);
	}

	private makeActor(species: SpeciesName, i: number): Actor {
		const a: Actor = {
			species, hue: 0, palette: [],
			x: 8 + Math.random() * Math.max(1, this.w - 16),
			targetX: 0, lane: i % 3, offbeat: Math.random() < 0.4,
			move: 'bob', leapFrom: 0, leapBeat: -99,
			blinkUntil: 0, nextBlink: 1 + Math.random() * 4,
			vx: (Math.random() < 0.5 ? -1 : 1) * (8 + Math.random() * 10),
			seed: Math.random() * 100,
		};
		a.targetX = a.x;
		this.colorize(a, i);
		return a;
	}

	private populate(): void {
		const order = shuffle(this.pool);
		const old = this.dancers;
		this.dancers = Array.from({ length: this.count }, (_, i) => {
			const prev = old[i];
			return prev && this.pool.includes(prev.species) ? prev : this.makeActor(order[i % order.length], i);
		});
		const bugs = by(this.chaos, [0, 2, 5]);
		this.critters = Array.from({ length: bugs }, (_, i) => this.critters[i] ?? this.makeActor('skitter', i + 7));
		this.spriteCache.clear();
	}

	private resize(): void {
		const parent = this.canvas.parentElement!;
		this.w = Math.max(1, Math.floor(parent.clientWidth / SCALE));
		this.h = Math.max(1, Math.floor(parent.clientHeight / SCALE));
		this.canvas.width = this.w;
		this.canvas.height = this.h;
		this.canvas.style.width = `${this.w * SCALE}px`;
		this.canvas.style.height = `${this.h * SCALE}px`;
		for (const a of [...this.dancers, ...this.critters]) {
			a.x = Math.min(a.x, this.w - 6);
			a.targetX = Math.min(a.targetX, this.w - 6);
		}
		if (!this.dancers.length) {
			this.populate();
		}
	}

	private get floor(): number {
		return this.h - 2;
	}

	// ---------- frame ----------
	draw(b: Beat): void {
		const dt = Math.max(0, Math.min(0.1, b.time - this.lastTime));
		this.lastTime = b.time;
		this.level += ((b.playing ? 1 : 0) - this.level) * 0.05;

		const beatIdx = Math.floor(b.beats);
		if (b.playing && beatIdx !== this.lastBeat && !Number.isNaN(this.lastBeat) && Math.abs(beatIdx - this.lastBeat) < 4) {
			this.onBeat(beatIdx);
		}
		this.lastBeat = beatIdx;

		this.update(b, dt);
		this.particles.update(dt, this.floor - 1);
		this.ambient(b, dt);

		const { ctx, w, h } = this;
		ctx.save();
		ctx.clearRect(0, 0, w, h);
		this.shake *= 0.85;
		if (this.shake > 0.3) {
			ctx.translate(Math.round((Math.random() - 0.5) * 2 * this.shake), Math.round((Math.random() - 0.5) * 2 * this.shake));
		}
		if (this.showVisualizer) {
			this.drawBars(b, dt);
		}
		ctx.fillStyle = 'rgba(255,255,255,0.08)';
		ctx.fillRect(0, this.floor, w, 1);

		const actors = [...this.dancers, ...this.critters].sort((a, z) => z.lane - a.lane);
		for (const a of actors) {
			this.drawActor(a, b);
		}
		this.particles.draw(ctx);
		ctx.restore();
	}

	// ---------- beat events ----------
	private onBeat(i: number): void {
		const lvl = this.chaos;
		const downbeat = ((i % 4) + 4) % 4 === 0;
		const bar = Math.floor(i / 4);

		for (const a of this.dancers) {
			const sp = SPECIES[a.species];
			if (downbeat) {
				const roll = Math.random();
				if (!sp.floats && roll < by(lvl, [0, 0.03, 0.08])) {
					a.move = 'flop';
					this.particles.spawn({ shape: 'bang', x: a.x, y: this.floor - 18, vy: -6, life: 0.8, color: '#ffd84a' });
				} else if (!sp.floats && roll < by(lvl, [0.04, 0.12, 0.25])) {
					a.move = 'leap';
					a.leapFrom = a.x;
					a.leapBeat = i;
					a.targetX = 8 + Math.random() * Math.max(1, this.w - 16);
				} else {
					a.move = pick(sp.floats ? FLOAT_MOVES : GROUND_MOVES);
					if (Math.random() < by(lvl, [0.05, 0.2, 0.4])) {
						a.targetX = 8 + Math.random() * Math.max(1, this.w - 16);
					}
				}
				if (a.move === 'cheer' && Math.random() < by(lvl, [0.2, 0.5, 0.9])) {
					this.particles.spawn({ shape: 'heart', x: a.x - 2, y: this.floor - 20, vy: -8, wobble: 6, life: 1.4, color: `hsl(${(a.hue + 330) % 360} 85% 70%)` });
				}
			}
			if (Math.random() < by(lvl, [0.04, 0.12, 0.28])) {
				this.particles.spawn({
					shape: Math.random() < 0.3 ? 'note2' : 'note',
					x: a.x + (Math.random() - 0.5) * 8, y: this.floor - 18,
					vx: (Math.random() - 0.5) * 6, vy: -10 - Math.random() * 6, wobble: 8,
					life: 1.6 + Math.random(), color: `hsl(${a.hue} 80% 72%)`,
				});
			}
			if ((a.move === 'stomp' || a.move === 'hop') && !sp.floats) {
				this.dust(a.x, by(lvl, [1, 2, 4]));
			}
		}

		for (const c of this.critters) {
			if (Math.random() < 0.15) {
				c.vx = -c.vx;
			}
		}

		if (downbeat && (bar % 8 === 0 || Math.random() < by(lvl, [0, 0.04, 0.15]))) {
			this.confetti(by(lvl, [10, 30, 70]));
			this.shake = Math.max(this.shake, by(lvl, [0, 1, 2]));
		} else if (downbeat && lvl === 2) {
			this.shake = Math.max(this.shake, 0.8);
		}
	}

	private dust(x: number, n: number): void {
		this.particles.burst(n, k => ({
			x: x + (k % 2 ? 4 : -5), y: this.floor - 1,
			vx: (k % 2 ? 1 : -1) * (6 + Math.random() * 8), vy: -2 - Math.random() * 3,
			life: 0.35, color: 'rgba(200,200,210,0.7)',
		}));
	}

	private confetti(n: number): void {
		this.particles.burst(n, () => ({
			x: Math.random() * this.w, y: -2 - Math.random() * 6,
			vx: (Math.random() - 0.5) * 10, vy: Math.random() * 8, g: 18, wobble: 10,
			life: 2 + Math.random() * 1.5,
			color: `hsl(${pick(this.hues) + (Math.random() - 0.5) * 40} 90% ${60 + Math.random() * 20}%)`,
		}));
	}

	private ambient(b: Beat, dt: number): void {
		if (b.playing) {
			if (Math.random() < dt * by(this.chaos, [0.5, 2, 6])) {
				this.particles.spawn({
					shape: Math.random() < 0.25 ? 'spark' : 'px',
					x: Math.random() * this.w, y: Math.random() * (this.h * 0.6),
					life: 0.5 + Math.random() * 0.5, color: `hsl(${pick(this.hues)} 90% 85%)`,
				});
			}
		} else if (Math.random() < dt * 0.8) {
			const a = this.dancers.length ? pick(this.dancers) : undefined;
			if (a) {
				this.particles.spawn({ shape: 'z', x: a.x + 4, y: this.floor - 14, vx: 2, vy: -5, wobble: 3, life: 1.8, color: 'rgba(255,255,255,0.75)' });
			}
		}
	}

	// ---------- movement ----------
	private update(b: Beat, dt: number): void {
		if (!b.playing) {
			return;
		}
		const speed = by(this.chaos, [3, 6, 11]);
		for (const a of this.dancers) {
			if (a.move === 'leap' || a.move === 'flop') {
				continue;
			}
			const d = a.targetX - a.x;
			a.x += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
		}
		for (const c of this.critters) {
			c.x += c.vx * dt * by(this.chaos, [0.5, 1, 1.6]);
			if (c.x < 4 || c.x > this.w - 4) {
				c.vx = -c.vx;
				c.x = Math.max(4, Math.min(this.w - 4, c.x));
			}
		}
	}

	// ---------- drawing ----------
	private drawBars(b: Beat, dt: number): void {
		const { ctx, w } = this;
		const barW = 2;
		const gap = 1;
		const n = Math.floor(w / (barW + gap));
		const frac = b.beats - Math.floor(b.beats);
		const kick = Math.exp(-frac * 5);
		const half = b.beats * 2;
		const hat = Math.exp(-(half - Math.floor(half)) * 7);
		const maxH = this.floor - 2;
		if (this.peaks.length !== n) {
			this.peaks = new Array(n).fill(0);
		}
		const left = Math.floor((w - n * (barW + gap)) / 2);
		for (let i = 0; i < n; i++) {
			const pos = i / Math.max(1, n - 1);
			const bass = Math.max(0, 1 - pos * 1.6);
			const treble = Math.max(0, pos * 1.4 - 0.3);
			const nz = noise(b.time * 3 + i * 0.7, i);
			let energy = 0.1 + 0.5 * kick * (0.4 + bass) + 0.3 * hat * treble + 0.35 * nz;
			if (Math.random() < 0.004 * this.chaos * this.level) {
				energy += 0.6; // random spikes for mess
			}
			const bh = Math.max(1, Math.round(maxH * Math.min(1, energy) * (0.1 + 0.9 * this.level)));
			this.peaks[i] = Math.max(this.peaks[i] - dt * 14, bh);
			const x = left + i * (barW + gap);
			const hue = this.hues[Math.floor(pos * this.hues.length) % this.hues.length];
			ctx.fillStyle = `hsla(${hue} 70% 55% / 0.3)`;
			ctx.fillRect(x, this.floor - bh, barW, bh);
			ctx.fillStyle = `hsla(${hue} 90% 75% / 0.65)`;
			ctx.fillRect(x, this.floor - bh, barW, 1);
			ctx.fillStyle = `hsla(${hue} 95% 85% / 0.5)`;
			ctx.fillRect(x, this.floor - Math.round(this.peaks[i]) - 2, barW, 1);
		}
	}

	private drawActor(a: Actor, b: Beat): void {
		const sp = SPECIES[a.species];
		const beats = b.beats + (a.offbeat ? 0.5 : 0);
		const beatIdx = Math.floor(beats);
		const frac = beats - beatIdx;
		const inBar = ((beatIdx % 4) + 4) % 4;

		if (b.time > a.nextBlink) {
			a.blinkUntil = b.time + 0.12;
			a.nextBlink = b.time + 1.5 + Math.random() * 4;
		}

		const pose: Pose = { squash: 0, lean: 0, blink: b.time < a.blinkUntil, arms: 0, happy: false, flopped: false, frame: 0 };
		let dy = 0;
		let dx = 0;
		const moving = Math.abs(a.targetX - a.x) > 0.5;

		if (a.species === 'skitter') {
			pose.frame = b.playing ? Math.floor(b.time * 12) % 2 : 0;
			dy = b.playing && beatIdx % 2 === 0 ? -Math.round(Math.sin(frac * Math.PI) * 2) : 0;
			pose.lean = b.playing ? Math.sign(a.vx) : 0;
			pose.blink ||= !b.playing;
		} else if (!b.playing) {
			pose.squash = -1;
			pose.blink = true;
			pose.frame = 0;
		} else {
			pose.frame = a.species === 'wisp' ? Math.floor(b.time * 4) % 2 : beatIdx % 2;
			switch (a.move) {
				case 'bob':
					pose.squash = frac < 0.2 ? -1 : 0;
					dy = frac < 0.2 ? 0 : -Math.round(Math.sin(frac * Math.PI));
					break;
				case 'hop': {
					const air = Math.sin(frac * Math.PI);
					dy = -Math.round(air * 4);
					pose.squash = frac < 0.12 || frac > 0.9 ? -1 : air > 0.6 ? 1 : 0;
					pose.arms = air > 0.5 ? 4 : 0;
					break;
				}
				case 'sway':
					pose.lean = beatIdx % 2 === 0 ? -1 : 1;
					pose.squash = frac < 0.15 ? -1 : 0;
					break;
				case 'wave':
					pose.arms = beatIdx % 2 === 0 ? 1 : 2;
					dy = frac < 0.5 ? -1 : 0;
					break;
				case 'cheer':
					pose.arms = frac < 0.5 ? 3 : 0;
					pose.happy = true;
					dy = -Math.round(Math.sin(frac * Math.PI) * 2);
					pose.squash = frac > 0.85 ? -1 : 0;
					break;
				case 'spin':
					// fast lean flip twice per beat, arms flung out
					pose.lean = frac < 0.25 || (frac >= 0.5 && frac < 0.75) ? -1 : 1;
					pose.arms = 4;
					pose.happy = inBar === 3;
					break;
				case 'stomp':
					pose.squash = frac < 0.25 ? -1 : 1;
					dx = beatIdx % 2 === 0 ? -1 : 1;
					pose.arms = frac < 0.25 ? 4 : 0;
					break;
				case 'headbang': {
					const h2 = (beats * 2) % 1;
					pose.lean = h2 < 0.5 ? 1 : 0;
					pose.squash = h2 < 0.3 ? -1 : 0;
					pose.blink = true;
					break;
				}
				case 'loop': {
					const t = (beats % 2) / 2 * Math.PI * 2;
					dx = Math.round(Math.cos(t) * 3);
					dy = Math.round(Math.sin(t) * 3);
					pose.happy = true;
					break;
				}
				case 'leap': {
					const p = Math.min(1, (b.beats - a.leapBeat) / 2);
					if (p < 1) {
						a.x = a.leapFrom + (a.targetX - a.leapFrom) * p;
						dy = -Math.round(Math.sin(p * Math.PI) * 7);
						pose.arms = 3;
						pose.squash = 1;
						pose.happy = true;
					} else {
						if (a.x !== a.targetX) {
							a.x = a.targetX;
							this.dust(a.x, 3 + this.chaos * 2);
						}
						pose.squash = frac < 0.2 ? -1 : 0;
					}
					break;
				}
				case 'flop':
					if (inBar < 3) {
						pose.flopped = true;
						pose.blink = Math.floor(b.time * 3) % 2 === 0; // dazed
					} else {
						pose.squash = frac < 0.5 ? -1 : 0;
						pose.arms = frac > 0.5 ? 3 : 0;
					}
					break;
			}
			if (moving && a.move !== 'leap' && pose.lean === 0) {
				pose.lean = Math.sign(a.targetX - a.x);
			}
		}

		const sprite = this.sprite(a, pose);
		let base = this.floor - a.lane * 2;
		if (sp.floats) {
			base -= b.playing ? 5 + Math.round(Math.sin(b.time * 2 + a.seed) * 2) : 1;
		}
		const x = Math.round(a.x - sprite.width / 2) + dx;
		const y = base - sprite.height + dy;
		const ctx = this.ctx;
		ctx.globalAlpha = sp.alpha ?? 1;
		ctx.filter = a.lane === 2 ? 'brightness(0.72)' : a.lane === 1 ? 'brightness(0.87)' : 'none';
		ctx.drawImage(sprite, x, y);
		ctx.filter = 'none';
		ctx.globalAlpha = 1;
	}

	private sprite(a: Actor, p: Pose): HTMLCanvasElement {
		const key = `${a.species}|${a.hue}|${poseKey(p)}`;
		let cv = this.spriteCache.get(key);
		if (!cv) {
			cv = render(buildSprite(SPECIES[a.species], p), a.palette);
			this.spriteCache.set(key, cv);
		}
		return cv;
	}
}

function render(s: Sprite, palette: string[]): HTMLCanvasElement {
	const cv = document.createElement('canvas');
	cv.width = s[0]?.length ?? 1;
	cv.height = s.length || 1;
	const ctx = cv.getContext('2d')!;
	s.forEach((row, y) => row.forEach((v, x) => {
		if (v) {
			ctx.fillStyle = palette[v];
			ctx.fillRect(x, y, 1, 1);
		}
	}));
	return cv;
}
