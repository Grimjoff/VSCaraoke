/**
 * Original pixel creatures ("sproutlings"): round 12x12 blobs with a leaf sprout.
 * Palette indices: 0 transparent, 1 outline, 2 body, 3 highlight, 4 shade, 5 eye, 6 sprout, 7 cheek
 */
const BODY = [
	'......66....',
	'.....66.....',
	'.....1......',
	'...111111...',
	'..13322221..',
	'.1332222221.',
	'.1252222521.',
	'.1272222721.',
	'.1222222241.',
	'.1422222441.',
	'..14444441..',
	'...111111...',
];

export type Sprite = number[][];

const parse = (rows: string[]): Sprite =>
	rows.map(r => [...r].map(c => (c === '.' ? 0 : parseInt(c, 10))));

const base = parse(BODY);
const EYE_ROW = 6;

export interface Pose {
	/** -1 squash, 0 normal, 1 stretch */
	squash: number;
	/** horizontal lean of the upper body in pixels */
	lean: number;
	blink: boolean;
	/** 0 none, 1 left arm up, 2 right arm up, 3 both up, 4 both out */
	arms: number;
	/** happy closed eyes ^ ^ */
	happy: boolean;
}

export function buildSprite(p: Pose): Sprite {
	let rows = base.map(r => [...r]);
	if (p.blink || p.happy) {
		rows[EYE_ROW] = rows[EYE_ROW].map(v => (v === 5 ? (p.happy ? 0 : 1) : v));
		if (p.happy) {
			// draw ^ ^ : eye pixel row above becomes outline at eye columns
			rows[EYE_ROW - 1] = rows[EYE_ROW - 1].map((v, x) => (base[EYE_ROW][x] === 5 ? 1 : v));
			rows[EYE_ROW] = rows[EYE_ROW].map((v, x) => (base[EYE_ROW][x] === 5 ? 2 : v));
		}
	}
	if (p.lean !== 0) {
		for (let y = 0; y < 6; y++) {
			rows[y] = shift(rows[y], y < 3 ? p.lean * 2 : p.lean);
		}
	}
	if (p.squash < 0) {
		// remove one middle row, add a wider bottom
		rows.splice(8, 1);
		rows.unshift(new Array(12).fill(0));
	} else if (p.squash > 0) {
		rows.splice(8, 0, [...rows[8]]);
		rows.shift();
	}
	if (p.arms) {
		rows = addArms(rows, p.arms);
	}
	return rows;
}

function shift(row: number[], dx: number): number[] {
	const out = new Array(row.length).fill(0);
	row.forEach((v, x) => {
		const nx = x + dx;
		if (v && nx >= 0 && nx < row.length) {
			out[nx] = v;
		}
	});
	return out;
}

function addArms(rows: Sprite, arms: number): Sprite {
	const r = rows.map(row => [0, ...row, 0]); // widen to 14 so arms fit
	const set = (y: number, x: number) => { if (r[y]) { r[y][x] = 1; } };
	const left = arms === 1 || arms === 3;
	const right = arms === 2 || arms === 3;
	if (arms === 4) {
		set(7, 0); set(7, 1); set(7, 12); set(7, 13);
		return r;
	}
	if (left) { set(3, 0); set(4, 0); set(5, 1); } else { set(8, 1); set(9, 1); }
	if (right) { set(3, 13); set(4, 13); set(5, 12); } else { set(8, 12); set(9, 12); }
	return r;
}

export function paletteForHue(h: number): string[] {
	return [
		'transparent',
		`hsl(${h} 45% 16%)`,
		`hsl(${h} 70% 62%)`,
		`hsl(${h} 85% 80%)`,
		`hsl(${h} 55% 44%)`,
		'#15131f',
		`hsl(${(h + 150) % 360} 55% 50%)`,
		`hsl(${(h + 340) % 360} 80% 72%)`,
	];
}
