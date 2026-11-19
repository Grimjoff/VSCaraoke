import * as assert from 'assert';
import { parseLrc } from '../lyrics/lrc';
import { normalizeArtist, normalizeTitle } from '../lyrics/normalize';
import { LrclibRecord, pickBest } from '../lyrics/lrclib';

suite('LRC parser', () => {
	test('parses timestamps, fractions and sorts', () => {
		const lines = parseLrc('[ar:Someone]\n[00:12.50]Second\n[00:01.2]First\n[01:02.345]Third');
		assert.deepStrictEqual(lines, [
			{ timeMs: 1200, text: 'First' },
			{ timeMs: 12500, text: 'Second' },
			{ timeMs: 62345, text: 'Third' },
		]);
	});

	test('parses enhanced LRC word timings and strips tags from text', () => {
		const [line] = parseLrc('[00:10.00]<00:10.00>Watch <00:10.40>me <00:11.20>now');
		assert.strictEqual(line.text, 'Watch me now');
		assert.deepStrictEqual(line.words, [
			{ timeMs: 10000, text: 'Watch ' },
			{ timeMs: 10400, text: 'me ' },
			{ timeMs: 11200, text: 'now' },
		]);
	});

	test('text before the first word tag starts at the line time', () => {
		const [line] = parseLrc('[00:05.00]Oh <00:05.80>yeah');
		assert.strictEqual(line.text, 'Oh yeah');
		assert.deepStrictEqual(line.words?.map(w => w.timeMs), [5000, 5800]);
	});

	test('plain lines have no words', () => {
		assert.strictEqual(parseLrc('[00:01.00]Just a line')[0].words, undefined);
	});

	test('expands lines with multiple tags and keeps empty lines', () => {
		const lines = parseLrc('[00:05.00][00:20.00]Chorus\n[00:10.00]');
		assert.deepStrictEqual(lines.map(l => [l.timeMs, l.text]), [[5000, 'Chorus'], [10000, ''], [20000, 'Chorus']]);
	});
});

suite('Title normalization', () => {
	const cases: [string, string][] = [
		['Here Comes The Sun - Remastered 2009', 'Here Comes The Sun'],
		['Under Pressure (feat. David Bowie)', 'Under Pressure'],
		['Song [Live at Wembley]', 'Song'],
		['Track - Radio Edit', 'Track'],
		['Plain Title', 'Plain Title'],
		['(What\'s The Story) Morning Glory?', '(What\'s The Story) Morning Glory?'],
	];
	for (const [input, expected] of cases) {
		test(input, () => assert.strictEqual(normalizeTitle(input), expected));
	}

	test('first artist only', () => {
		assert.strictEqual(normalizeArtist('Queen, David Bowie'), 'Queen');
		assert.strictEqual(normalizeArtist('Simon & Garfunkel'), 'Simon & Garfunkel');
		assert.strictEqual(normalizeArtist('Daft Punk'), 'Daft Punk');
	});
});

suite('pickBest', () => {
	const rec = (id: number, duration: number, synced: boolean): LrclibRecord => ({
		id, duration, trackName: 't', artistName: 'a', albumName: 'b', instrumental: false,
		plainLyrics: 'x', syncedLyrics: synced ? '[00:01.00]x' : null,
	});

	test('prefers synced within tolerance, closest first', () => {
		const r = pickBest([rec(1, 200, false), rec(2, 210, true), rec(3, 201.5, true)], 200_000);
		assert.strictEqual(r?.id, 3);
	});

	test('falls back to plain within tolerance', () => {
		assert.strictEqual(pickBest([rec(1, 202, false), rec(2, 250, true)], 200_000)?.id, 1);
	});

	test('nothing within tolerance', () => {
		assert.strictEqual(pickBest([rec(1, 250, true)], 200_000), undefined);
	});
});
