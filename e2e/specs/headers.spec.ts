/**
 * HD-01…03: the security-header set of the built app — _headers on static
 * assets (incl. prerendered HTML), hooks.server.ts on runtime routes, and
 * kit.csp's per-page meta CSP — plus a zero-violation real compression.
 * Preview-only: the dev server's headers come from the hook, not _headers.
 */
import { expect, fx, test } from '../fixtures';
import { compress, gotoTab, setOutputFormat, upload } from '../helpers';

test.skip(() => !process.env.E2E_PREVIEW, 'production headers ship with the built app');

const STATIC_HEADERS: Record<string, string | RegExp> = {
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-embedder-policy': 'require-corp',
	'x-content-type-options': 'nosniff',
	'referrer-policy': 'strict-origin-when-cross-origin',
	'x-frame-options': 'DENY',
	'permissions-policy': /camera=\(\)/,
	'content-security-policy': /frame-ancestors 'none'/,
	link: /<\/llms\.txt>; rel="describedby".*<\/\.well-known\/agent-skills\/index\.json>/
};

test('HD-01: prerendered pages and static assets carry the header set', async ({ request }) => {
	for (const path of ['/', '/compress-jpg']) {
		const res = await request.get(path);
		expect(res.status(), path).toBe(200);
		for (const [name, want] of Object.entries(STATIC_HEADERS)) {
			const got = res.headers()[name];
			expect(got, `${path} → ${name}`).toBeDefined();
			if (typeof want === 'string') expect(got, `${path} → ${name}`).toBe(want);
			else expect(got, `${path} → ${name}`).toMatch(want);
		}
	}
	// The SW script must keep COEP (it serves the isolated shell) and nosniff.
	const sw = await request.get('/service-worker.js');
	expect(sw.status()).toBe(200);
	expect(sw.headers()['cross-origin-embedder-policy']).toBe('require-corp');
	expect(sw.headers()['x-content-type-options']).toBe('nosniff');
});

test('HD-02: runtime routes get hook-set headers; the 404 CSP carries frame-ancestors', async ({
	request
}) => {
	const robots = await request.get('/robots.txt');
	expect(robots.status()).toBe(200);
	expect(robots.headers()['x-content-type-options']).toBe('nosniff');
	expect(robots.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
	expect(robots.headers()['permissions-policy']).toMatch(/geolocation=\(\)/);

	// Unknown paths render through Kit (+error) — headers come from the hook,
	// the CSP header from kit.csp (nonce mode), incl. frame-ancestors.
	const missing = await request.get('/definitely-not-a-page');
	expect(missing.status()).toBe(404);
	expect(missing.headers()['x-frame-options']).toBe('DENY');
	expect(missing.headers()['content-security-policy'], '404 CSP').toMatch(/frame-ancestors 'none'/);
});

test('HD-03: meta CSP is present and a real compression runs violation-free', async ({ page }) => {
	await page.addInitScript(() => {
		const w = window as unknown as { __cspViolations: string[] };
		w.__cspViolations = [];
		document.addEventListener('securitypolicyviolation', (e) => {
			w.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`);
		});
	});
	await gotoTab(page, 'jpg');

	const meta = page.locator('meta[http-equiv="content-security-policy" i]');
	await expect(meta).toHaveCount(1);
	const policy = (await meta.getAttribute('content')) ?? '';
	expect(policy).toContain('wasm-unsafe-eval');
	expect(policy).toContain("worker-src 'self' blob:");
	expect(policy).toContain('sha256-'); // kit's per-page hydration hash landed

	await upload(page, fx('photo-1200x800.jpg'));
	await setOutputFormat(page, 'JPG');
	await compress(page);
	const violations = await page.evaluate(
		() => (window as unknown as { __cspViolations: string[] }).__cspViolations
	);
	expect(violations, violations.join('\n')).toEqual([]);
});
