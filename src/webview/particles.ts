/** Tiny pixel particle system: notes, hearts, confetti, dust, sparkles, z's. */

const SHAPES = {
	px: ['1'],
	note: ['.11', '.1.', '.1.', '11.', '11.'],
	note2: ['.1111', '.1..1', '.1..1', '11.11', '11.11'],
	heart: ['11.11', '11111', '.111.', '..1..'],
	z: ['111', '.1.', '111'],
	spark: ['.1.', '111', '.1.'],
	bang: ['1', '1', '1', '.', '1'],
} as const;

export type ShapeName = keyof typeof SHAPES;

const MASKS: Record<string, [number, number][]> = {};
for (const [k, rows] of Object.entries(SHAPES)) {
	MASKS[k] = [];
	(rows as readonly string[]).forEach((r, y) => [...r].forEach((c, x) => c === '1' && MASKS[k].push([x, y])));
}

interface Particle {
	shape: ShapeName;
	x: number; y: number;
	vx: number; vy: number;
	g: number;
	life: number; max: number;
	color: string;
	wobble: number;
	seed: number;
}

export interface Spawn {
	shape?: ShapeName;
	x: number; y: number;
	vx?: number; vy?: number;
	g?: number;
	life?: number;
	color: string;
	wobble?: number;
}

const MAX = 400;

export class Particles {
	private list: Particle[] = [];

	spawn(s: Spawn): void {
		if (this.list.length >= MAX) {
			this.list.shift();
		}
		const life = s.life ?? 1;
		this.list.push({
			shape: s.shape ?? 'px', x: s.x, y: s.y, vx: s.vx ?? 0, vy: s.vy ?? 0, g: s.g ?? 0,
			life, max: life, color: s.color, wobble: s.wobble ?? 0, seed: Math.random() * 10,
		});
	}

	burst(n: number, f: (i: number) => Spawn): void {
		for (let i = 0; i < n; i++) {
			this.spawn(f(i));
		}
	}

	update(dt: number, floor: number): void {
		for (const p of this.list) {
			p.life -= dt;
			p.vy += p.g * dt;
			p.x += (p.vx + Math.sin((p.max - p.life) * 6 + p.seed) * p.wobble) * dt;
			p.y += p.vy * dt;
			if (p.g > 0 && p.y > floor) {
				// confetti settles on the floor and fades
				p.y = floor;
				p.vy = 0;
				p.vx *= 0.8;
			}
		}
		this.list = this.list.filter(p => p.life > 0);
	}

	draw(ctx: CanvasRenderingContext2D): void {
		for (const p of this.list) {
			const fade = Math.min(1, p.life / Math.min(0.4, p.max));
			ctx.globalAlpha = fade;
			ctx.fillStyle = p.color;
			const x0 = Math.round(p.x), y0 = Math.round(p.y);
			for (const [dx, dy] of MASKS[p.shape]) {
				ctx.fillRect(x0 + dx, y0 + dy, 1, 1);
			}
		}
		ctx.globalAlpha = 1;
	}
}
