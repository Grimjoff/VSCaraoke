import * as assert from 'assert';
import { DEFAULT_REDIRECT_URI, parseRedirect } from '../spotify/redirect';

suite('Redirect URI', () => {
	test('default and empty setting', () => {
		const r = parseRedirect('');
		assert.deepStrictEqual(r, { uri: DEFAULT_REDIRECT_URI, host: '127.0.0.1', port: 43821, path: '/callback' });
	});

	test('custom port and path, kept exactly as typed', () => {
		const r = parseRedirect(' http://127.0.0.1:8888/spotify ');
		assert.deepStrictEqual(r, { uri: 'http://127.0.0.1:8888/spotify', host: '127.0.0.1', port: 8888, path: '/spotify' });
	});

	test('IPv6 loopback', () => {
		const r = parseRedirect('http://[::1]:9000/cb');
		assert.ok(typeof r !== 'string');
		assert.strictEqual(r.host, '::1');
	});

	const invalid: [string, RegExp][] = [
		['http://localhost:43821/callback', /localhost/],
		['https://127.0.0.1:43821/callback', /http:\/\//],
		['http://127.0.0.1/callback', /port/],
		['http://127.0.0.1:43821/callback?x=1', /\?/],
		['not a url', /valid URL/],
	];
	for (const [input, msg] of invalid) {
		test(`rejects ${input}`, () => {
			const r = parseRedirect(input);
			assert.strictEqual(typeof r, 'string');
			assert.match(r as string, msg);
		});
	}
});
