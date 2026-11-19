/**
 * Original pixel creatures. Palette indices:
 * 0 transparent, 1 outline, 2 body, 3 highlight, 4 shade, 5 eye,
 * 6 accent (sprout / cap / shell), 7 cheek, 8 light (spots / bulb), 9 screen
 */

export type SpeciesName = 'sproutling' | 'capling' | 'wisp' | 'beepbox' | 'dribble' | 'skitter';
export const DANCER_SPECIES: SpeciesName[] = ['sproutling', 'capling', 'wisp', 'beepbox', 'dribble'];

export interface Species {
	name: SpeciesName;
	/** Animation frames; tail wiggles, antenna blinks, leg steps. */
	frames: string[][];
	eyeRow: number;
	/** Row where arms attach, -1 = no arms. */
	armRow: number;
	/** Row removed (squash) or duplicated (stretch), -1 = rigid. */
	squashRow: number;
	/** Rows from the top that lean. */
	leanRows: number;
	/** Top rows (sprout, antenna, cap) that swing extra far when leaning. */
	topperRows: number;
	/** Hovers above the floor instead of standing on it. */
	floats?: boolean;
	alpha?: number;
}

const SPROUTLING: Species = {
	name: 'sproutling', eyeRow: 6, armRow: 8, squashRow: 8, leanRows: 6, topperRows: 3,
	frames: [[
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
	]],
};

const CAPLING: Species = {
	name: 'capling', eyeRow: 6, armRow: 7, squashRow: 8, leanRows: 5, topperRows: 0,
	frames: [[
		'...111111...',
		'..16686661..',
		'.1666666861.',
		'.1686666661.',
		'.1111111111.',
		'...122221...',
		'...152251...',
		'...172271...',
		'...122221...',
		'...142241...',
		'...144441...',
		'...111111...',
	]],
};

const WISP: Species = {
	name: 'wisp', eyeRow: 3, armRow: 5, squashRow: 6, leanRows: 4, topperRows: 0, floats: true, alpha: 0.88,
	frames: [
		[
			'...1111...',
			'..133221..',
			'.13222221.',
			'.12522521.',
			'.12722721.',
			'.12222221.',
			'.12222241.',
			'.14222441.',
			'.14444441.',
			'.141.141..',
			'..1...1...',
		],
		[
			'...1111...',
			'..133221..',
			'.13222221.',
			'.12522521.',
			'.12722721.',
			'.12222221.',
			'.12222241.',
			'.14222441.',
			'.14444441.',
			'..141.141.',
			'...1...1..',
		],
	],
};

const BEEPBOX_BASE = [
	'......6.....',
	'......1.....',
	'..11111111..',
	'.1333332221.',
	'.1399999921.',
	'.1395995921.',
	'.1399999921.',
	'.1322222241.',
	'.1222222241.',
	'.1244444441.',
	'..14....41..',
	'..11....11..',
];
const BEEPBOX: Species = {
	name: 'beepbox', eyeRow: 5, armRow: 7, squashRow: 8, leanRows: 4, topperRows: 2,
	frames: [BEEPBOX_BASE, ['......8.....', ...BEEPBOX_BASE.slice(1)]],
};

const DRIBBLE: Species = {
	name: 'dribble', eyeRow: 4, armRow: 6, squashRow: 7, leanRows: 4, topperRows: 2,
	frames: [[
		'....11....',
		'...1331...',
		'..133221..',
		'.13322221.',
		'.12522521.',
		'.17222271.',
		'1322222241',
		'1222222241',
		'1422222441',
		'.14444441.',
		'..111111..',
	]],
};

const SKITTER: Species = {
	name: 'skitter', eyeRow: 2, armRow: -1, squashRow: -1, leanRows: 2, topperRows: 1,
	frames: [
		['.1...1.', '..111..', '.15651.', '1666661', '.1.1.1.'],
		['1.....1', '..111..', '.15651.', '1666661', '1.1.1.1'],
	],
};

export const SPECIES: Record<SpeciesName, Species> = {
	sproutling: SPROUTLING, capling: CAPLING, wisp: WISP, beepbox: BEEPBOX, dribble: DRIBBLE, skitter: SKITTER,
};

export type Sprite = number[][];

const parse = (rows: string[]): Sprite => rows.map(r => [...r].map(c => (c === '.' ? 0 : parseInt(c, 10))));
const parsed = new Map<string[], Sprite>();
function base(rows: string[]): Sprite {
	let s = parsed.get(rows);
	if (!s) {
		s = parse(rows);
		parsed.set(rows, s);
	}
	return s;
}

export interface Pose {
	/** -1 squash, 0 normal, 1 stretch */
	squash: number;
	/** horizontal lean of the upper body in pixels */
	lean: number;
	blink: boolean;
	/** 0 none, 1 left up, 2 right up, 3 both up, 4 both out */
	arms: number;
	/** happy ^ ^ eyes */
	happy: boolean;
	/** lying on its side (tripped) */
	flopped: boolean;
	frame: number;
}

export const poseKey = (p: Pose) => `${p.squash}${p.lean}${+p.blink}${p.arms}${+p.happy}${+p.flopped}${p.frame}`;

const PAD = 2;

export function buildSprite(sp: Species, p: Pose): Sprite {
	const src = base(sp.frames[p.frame % sp.frames.length]);
	let rows = src.map(r => [...r]);
	const eyes = src[sp.eyeRow].map((v, x) => (v === 5 ? x : -1)).filter(x => x >= 0);

	if (p.blink || p.happy) {
		for (const x of eyes) {
			const behind = rows[sp.eyeRow][x - 1] || 2;
			rows[sp.eyeRow][x] = p.happy ? behind : 1;
			if (p.happy && sp.eyeRow > 0) {
				// on beepbox's dark screen the ^ ^ must glow
				rows[sp.eyeRow - 1][x] = sp.name === 'beepbox' ? 5 : 1;
			}
		}
	}

	rows = rows.map(r => [...new Array(PAD).fill(0), ...r, ...new Array(PAD).fill(0)]);

	if (p.lean !== 0) {
		for (let y = 0; y < sp.leanRows; y++) {
			// only the topper (sprout, antenna, tip) swings 2px; the body moves 1px so shapes stay intact
			rows[y] = shift(rows[y], y < sp.topperRows ? p.lean * 2 : p.lean);
		}
	}
	let armRow = sp.armRow;
	if (sp.squashRow >= 0 && p.squash < 0) {
		rows.splice(sp.squashRow, 1);
		rows.unshift(new Array(rows[0].length).fill(0));
	} else if (sp.squashRow >= 0 && p.squash > 0) {
		rows.splice(sp.squashRow, 0, [...rows[sp.squashRow]]);
		rows.shift();
	}
	if (armRow >= 0 && p.arms) {
		addArms(rows, armRow, p.arms);
	}
	if (p.flopped) {
		rows = rotate(rows);
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

function addArms(r: Sprite, y: number, arms: number): void {
	const row = r[y];
	const left = row.findIndex(v => v !== 0);
	const right = row.length - 1 - [...row].reverse().findIndex(v => v !== 0);
	const set = (yy: number, x: number) => {
		// body shade, not outline: outline vanishes on dark themes
		if (r[yy] && x >= 0 && x < r[yy].length) { r[yy][x] = 4; }
	};
	if (arms === 4) {
		set(y, left - 1); set(y, left - 2); set(y, right + 1); set(y, right + 2);
		return;
	}
	const lUp = arms === 1 || arms === 3;
	const rUp = arms === 2 || arms === 3;
	if (lUp) { set(y - 1, left - 1); set(y - 2, left - 2); set(y - 3, left - 2); } else { set(y, left - 1); set(y + 1, left - 1); }
	if (rUp) { set(y - 1, right + 1); set(y - 2, right + 2); set(y - 3, right + 2); } else { set(y, right + 1); set(y + 1, right + 1); }
}

/** Rotate 90° clockwise (the creature tips over to the right). */
function rotate(s: Sprite): Sprite {
	const h = s.length, w = s[0].length;
	return Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => s[h - 1 - y][x]))
		// drop fully empty rows/cols so it lies on the floor
		.filter(row => row.some(v => v));
}

export function paletteFor(sp: SpeciesName, h: number): string[] {
	const p = [
		'transparent',
		`hsl(${h} 45% 16%)`,
		`hsl(${h} 70% 62%)`,
		`hsl(${h} 85% 80%)`,
		`hsl(${h} 55% 44%)`,
		'#15131f',
		`hsl(${(h + 150) % 360} 55% 50%)`,
		`hsl(${(h + 340) % 360} 80% 72%)`,
		`hsl(${h} 40% 96%)`,
		'#101820',
	];
	if (sp === 'capling') {
		p[6] = `hsl(${(h + 180) % 360} 65% 52%)`;
		p[2] = `hsl(${h} 35% 82%)`;
		p[3] = `hsl(${h} 40% 92%)`;
		p[4] = `hsl(${h} 25% 62%)`;
	} else if (sp === 'beepbox') {
		p[2] = `hsl(${h} 25% 62%)`;
		p[3] = `hsl(${h} 30% 80%)`;
		p[4] = `hsl(${h} 25% 42%)`;
		p[5] = `hsl(${(h + 180) % 360} 95% 68%)`;
		p[6] = `hsl(${(h + 30) % 360} 90% 55%)`;
		p[8] = `hsl(${(h + 30) % 360} 100% 80%)`;
	} else if (sp === 'wisp') {
		p[2] = `hsl(${h} 60% 82%)`;
		p[3] = `hsl(${h} 70% 94%)`;
		p[4] = `hsl(${h} 45% 66%)`;
	} else if (sp === 'skitter') {
		p[6] = `hsl(${h} 75% 48%)`;
	}
	return p;
}
