/** The song the crew performs when Spotify is quiet. Silent: it only drives lyrics and the beat. */

export const DEMO_BPM = 120;
export const DEMO_HUES = [340, 200, 45, 140, 275, 20];

const LINE_MS = 4000; // two bars at 120 BPM
const LYRICS = [
	'Nothing on the speakers, but we came here to dance',
	'Sproutlings on the floor, give the beat a chance',
	'',
	'Beepbox counts the tempo, one, two, three and four',
	'Capling lost a spore and now it\'s rolling on the floor',
	'Wisp is doing loops, it never touches ground',
	'Dribble keeps on bouncing, what a squishy sound',
	'',
	'Push your code, push your code',
	'Watch the build go green and hit the road',
	'Push your code, push your code',
	'Tiny pixel crowd in full overload',
	'',
	'Hit play on Spotify and we\'ll sing along with you',
	'Till then it\'s just the crew, and a skitter passing through',
	'',
];

export const DEMO_LINES = LYRICS.map((text, i) => ({ timeMs: 2000 + i * LINE_MS, text }));

export const DEMO_TRACK = {
	id: '__demo__',
	title: 'Sproutling Shuffle',
	artist: 'The Sproutlings · demo',
	album: '',
	durationMs: 2000 + LYRICS.length * LINE_MS + 2000,
};
