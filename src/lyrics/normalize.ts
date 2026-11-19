const SUFFIX_PATTERNS: RegExp[] = [
	/\s+-\s+.*\b(remaster(ed)?|live|radio edit|single version|mono|stereo|edit|version|mix|demo|acoustic|bonus track)\b.*$/i,
	/\s*[([][^)\]]*\b(feat\.?|ft\.?|with|remaster(ed)?|live|radio edit|version|edit|mono|stereo|deluxe)\b[^)\]]*[)\]]/gi,
];

/** Removes version/feature decorations that commonly break lyric lookups. */
export function normalizeTitle(title: string): string {
	let t = title;
	for (const p of SUFFIX_PATTERNS) {
		t = t.replace(p, '');
	}
	return t.replace(/\s{2,}/g, ' ').trim() || title.trim();
}

/** Uses only the first artist and drops "feat." parts. */
export function normalizeArtist(artist: string): string {
	// Spotify artists arrive comma-joined; don't split on "&" (Simon & Garfunkel).
	return artist.split(/,| feat\.? | ft\.? /i)[0].trim() || artist.trim();
}
