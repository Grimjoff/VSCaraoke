export const DEFAULT_REDIRECT_URI = 'http://127.0.0.1:43821/callback';

export interface Redirect {
	/** Exactly as configured: Spotify compares it character for character with the registered one. */
	uri: string;
	host: string;
	port: number;
	path: string;
}

/**
 * Validates a callback URL. Spotify only allows loopback IP literals over plain http
 * with an explicit port for local apps ("localhost" is rejected).
 * Returns the parsed redirect, or an error message.
 */
export function parseRedirect(raw: string): Redirect | string {
	const uri = raw.trim() || DEFAULT_REDIRECT_URI;
	let u: URL;
	try {
		u = new URL(uri);
	} catch {
		return `"${uri}" is not a valid URL.`;
	}
	if (u.protocol !== 'http:') {
		return 'The callback URL must start with http:// (Spotify allows plain http only for loopback addresses).';
	}
	if (u.hostname !== '127.0.0.1' && u.hostname !== '[::1]') {
		return 'The callback URL must use 127.0.0.1 or [::1]. Spotify no longer accepts "localhost".';
	}
	if (!u.port) {
		return 'The callback URL needs an explicit port, for example http://127.0.0.1:43821/callback.';
	}
	if (u.search || u.hash) {
		return 'The callback URL must not contain ? or # parts.';
	}
	return { uri, host: u.hostname === '[::1]' ? '::1' : '127.0.0.1', port: Number(u.port), path: u.pathname };
}
