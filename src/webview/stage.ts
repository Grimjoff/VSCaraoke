import { buildSprite, paletteForHue, Pose, Sprite } from './sprites';

const SCALE = 3; // screen pixels per art pixel
const SPRITE = 14;

type Move = 'bob' | 'hop' | 'sway' | 'wave' | 'cheer';
const MOVES: Move[] = ['bob', 'hop', 'sway', 'wave', 'cheer'];

interface Creature {
	hue: number;
	palette: string[];
	offbeat: boolean;
	move: Move;
	bar: number;
	blinkUntil: number;
	nextBlink: number;
	x: number;
}

/** Deterministic hash -> [0,1). */
function rand(a: number, b: number): number {
	const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
	return s - Math.floor(s);
}

/** Smooth 1D value noise. */
function noise(t: number, seed: number): number {
	const i = Math.floor(t);
	const f = t - i;
	const u = f * f * (3 - 2 * f);
	return rand(i, seed) * (1 - u) + rand(i + 1, seed) * u;
}

export interface Beat {
	/** continuous beat count (can be negative/approximate) */
	beats: number;
	playing: boolean;
	/** seconds since stage start, for idle animations */
	time: number;
}

export class Stage {
	private readonly ctx: CanvasRenderingContext2D;
	private w = 0;
	private h = 0;
	private creatures: Creature[] = [];
	private hues: number[] = [340, 200, 45, 140, 275, 20];
	private count = 4;
	showVisualizer = true;
	private spriteCache = new Map<string, HTMLCanvasElement>();
	private level = 0; // smoothed visualizer energy (fades on pause)

	constructor(private readonly canvas: HTMLCanvasElement) {
		this.ctx = canvas.getContext('2d')!;
		new ResizeObserver(() => this.resize()).observe(canvas.parentElement!);
		this.resize();
	}

	setCreatureCount(n: number): void {
		this.count = Math.max(0, Math.min(6, n));
		this.layout();
	}

	setHues(hues: number[]): void {
		this.hues = hues.length ? hues : this.hues;
		this.creatures.forEach((c, i) => {
			c.hue = this.hues[i % this.hues.length];
			c.palette = paletteForHue(c.hue);
		});
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
		this.layout();
	}

	private layout(): void {
		const n = this.count;
		const prev = this.creatures;
		this.creatures = Array.from({ length: n }, (_, i) => {
			const hue = this.hues[i % this.hues.length];
			return {
				hue,
				palette: paletteForHue(hue),
				offbeat: i % 2 === 1,
				move: prev[i]?.move ?? 'bob',
				bar: -1,
				blinkUntil: 0,
				nextBlink: 1 + rand(i, 9) * 4,
				x: Math.round(((i + 1) / (n + 1)) * this.w - SPRITE / 2),
			};
		});
		this.spriteCache.clear();
	}

	draw(b: Beat): void {
		const { ctx, w, h } = this;
		ctx.clearRect(0, 0, w, h);
		this.level += ((b.playing ? 1 : 0) - this.level) * 0.05;
		if (this.showVisualizer) {
			this.drawBars(b);
		}
		// floor line
		ctx.fillStyle = 'rgba(255,255,255,0.08)';
		ctx.fillRect(0, h - 2, w, 1);
		this.creatures.forEach((c, i) => this.drawCreature(c, i, b));
	}

	private drawBars(b: Beat): void {
		const { ctx, w, h } = this;
		const barW = 2;
		const gap = 1;
		const n = Math.floor(w / (barW + gap));
		const frac = b.beats - Math.floor(b.beats);
		const kick = Math.exp(-frac * 5);
		const half = b.beats * 2;
		const hat = Math.exp(-(half - Math.floor(half)) * 7);
		const maxH = h - 3;
		for (let i = 0; i < n; i++) {
			const pos = i / Math.max(1, n - 1);
			const bass = Math.max(0, 1 - pos * 1.6);
			const treble = Math.max(0, pos * 1.4 - 0.3);
			const nz = noise(b.time * 3 + i * 0.7, i);
			const energy = 0.12 + 0.55 * kick * (0.4 + bass) + 0.3 * hat * treble + 0.35 * nz;
			const bh = Math.max(1, Math.round(maxH * Math.min(1, energy) * (0.1 + 0.9 * this.level)));
			const x = i * (barW + gap) + Math.floor((w - n * (barW + gap)) / 2);
			const hue = this.hues[Math.floor(pos * this.hues.length) % this.hues.length];
			ctx.fillStyle = `hsla(${hue} 70% 55% / 0.35)`;
			ctx.fillRect(x, h - 2 - bh, barW, bh);
			ctx.fillStyle = `hsla(${hue} 90% 75% / 0.7)`;
			ctx.fillRect(x, h - 2 - bh, barW, 1);
		}
	}

	private drawCreature(c: Creature, i: number, b: Beat): void {
		const beats = b.beats + (c.offbeat ? 0.5 : 0);
		const beatIdx = Math.floor(beats);
		const frac = beats - beatIdx;
		const bar = Math.floor(beats / 4);
		if (bar !== c.bar) {
			c.bar = bar;
			c.move = MOVES[Math.floor(rand(bar, i + 1) * MOVES.length)];
		}
		if (b.time > c.nextBlink) {
			c.blinkUntil = b.time + 0.12;
			c.nextBlink = b.time + 2 + rand(b.time, i) * 4;
		}

		const pose: Pose = { squash: 0, lean: 0, blink: b.time < c.blinkUntil, arms: 0, happy: false };
		let dy = 0;
		if (!b.playing) {
			pose.squash = -1;
			pose.blink = true;
			dy = Math.round(Math.sin(b.time * 1.5 + i) * 0.5);
		} else {
			switch (c.move) {
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
			}
		}

		const sprite = this.sprite(c, pose);
		const y = this.h - 2 - sprite.height + dy;
		this.ctx.drawImage(sprite, c.x - 1, y);

		if (!b.playing) {
			this.drawZ(c.x + 12, y, b.time + i * 0.7);
		}
	}

	private drawZ(x: number, y: number, t: number): void {
		const p = (t * 0.5) % 1;
		const zy = Math.round(y - p * 8);
		if (zy < 0) {
			return;
		}
		this.ctx.fillStyle = `rgba(255,255,255,${0.7 * (1 - p)})`;
		// 3x3 pixel "z"
		this.ctx.fillRect(x, zy, 3, 1);
		this.ctx.fillRect(x + 1, zy + 1, 1, 1);
		this.ctx.fillRect(x, zy + 2, 3, 1);
	}

	private sprite(c: Creature, p: Pose): HTMLCanvasElement {
		const key = `${c.hue}|${p.squash}|${p.lean}|${p.blink}|${p.arms}|${p.happy}`;
		let cv = this.spriteCache.get(key);
		if (!cv) {
			cv = render(buildSprite(p), c.palette);
			this.spriteCache.set(key, cv);
		}
		return cv;
	}
}

function render(s: Sprite, palette: string[]): HTMLCanvasElement {
	const cv = document.createElement('canvas');
	cv.width = s[0].length;
	cv.height = s.length;
	const ctx = cv.getContext('2d')!;
	s.forEach((row, y) => row.forEach((v, x) => {
		if (v) {
			ctx.fillStyle = palette[v];
			ctx.fillRect(x, y, 1, 1);
		}
	}));
	// widen narrower sprites (no arms) so they align with armed ones
	if (cv.width === 12) {
		const wide = document.createElement('canvas');
		wide.width = 14;
		wide.height = cv.height;
		wide.getContext('2d')!.drawImage(cv, 1, 0);
		return wide;
	}
	return cv;
}
