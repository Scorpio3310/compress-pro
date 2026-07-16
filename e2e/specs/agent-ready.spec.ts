/**
 * AR-01…03: the agent-discovery surface — markdown page twins, the
 * digest-verified .well-known/agent-skills index, and WebMCP tools.
 * AR-01/02 hit prerendered static assets, so they're preview-only;
 * AR-03 stubs the browser API and runs everywhere (incl. CI dev runs).
 */
import { createHash } from 'node:crypto';
import { expect, test } from '../fixtures';
import { gotoPath } from '../helpers';

type McpStub = Record<
	string,
	{ execute: (input?: Record<string, unknown>) => Promise<{ content: { text: string }[] }> }
>;

test('AR-01: tool pages have markdown twins with the right MIME', async ({ request }) => {
	test.skip(!process.env.E2E_PREVIEW, 'prerendered .md twins ship with the built app');

	const jpg = await request.get('/compress-jpg.md');
	expect(jpg.status()).toBe(200);
	expect(jpg.headers()['content-type']).toMatch(/text\/markdown/);
	const body = await jpg.text();
	expect(body).toContain('# Compress JPG images.');
	expect(body).toContain('canonical: https://compress-pro.com/compress-jpg');

	const home = await request.get('/index.md');
	expect(home.status()).toBe(200);
	expect(await home.text()).toContain('## All tools');

	const missing = await request.get('/not-a-tool.md');
	expect(missing.status()).toBe(404);
});

test('AR-04: Accept: text/markdown negotiates HTML pages to their twin', async ({ request }) => {
	test.skip(!process.env.E2E_PREVIEW, 'needs the built worker + run_worker_first');

	// Same URL as the HTML page, but the markdown Accept header gets the twin.
	const md = await request.get('/compress-jpg', { headers: { Accept: 'text/markdown' } });
	expect(md.status()).toBe(200);
	expect(md.headers()['content-type']).toMatch(/text\/markdown/);
	expect(md.headers()['vary']).toMatch(/Accept/i);
	expect(Number(md.headers()['x-markdown-tokens'])).toBeGreaterThan(0);
	expect(await md.text()).toContain('# Compress JPG images.');

	// The homepage negotiates to /index.md.
	const home = await request.get('/', { headers: { Accept: 'text/markdown' } });
	expect(home.headers()['content-type']).toMatch(/text\/markdown/);
	expect(await home.text()).toContain('## All tools');

	// Browsers (no markdown Accept) still get HTML at the same URL.
	const html = await request.get('/compress-jpg');
	expect(html.headers()['content-type']).toMatch(/text\/html/);
});

test('AR-02: agent-skills index parses and its digest matches the served skill', async ({
	request
}) => {
	test.skip(!process.env.E2E_PREVIEW, '.well-known ships with the built app');

	const res = await request.get('/.well-known/agent-skills/index.json');
	expect(res.status()).toBe(200);
	expect(res.headers()['content-type']).toMatch(/application\/json/);
	const index = JSON.parse(await res.text());
	expect(index.$schema).toContain('agentskills.io');
	const [skill] = index.skills;
	expect(skill.type).toBe('skill-md');

	// Recompute the digest from the actually-served bytes — proves the pair
	// on the wire matches, not just the pair in the source module.
	const md = await request.get(skill.url);
	expect(md.status()).toBe(200);
	const digest =
		'sha256:' +
		createHash('sha256')
			.update(await md.body())
			.digest('hex');
	expect(digest).toBe(skill.digest);
});

test('AR-03: WebMCP tools register and drive the app @smoke', async ({ page }) => {
	await page.addInitScript(() => {
		const w = window as unknown as { __mcpTools: Record<string, unknown> };
		w.__mcpTools = {};
		Object.defineProperty(navigator, 'modelContext', {
			configurable: true,
			value: {
				registerTool(tool: { name: string }) {
					w.__mcpTools[tool.name] = tool;
				}
			}
		});
	});
	await gotoPath(page, '/');

	// Per-page markdown discovery rides in the head next to the canonical.
	await expect(page.locator('link[rel="alternate"][type="text/markdown"]')).toHaveAttribute(
		'href',
		/\/index\.md$/
	);

	// The layout $effect registers all three tools after hydration.
	await expect
		.poll(() =>
			page.evaluate(() =>
				Object.keys((window as unknown as { __mcpTools: McpStub }).__mcpTools).sort()
			)
		)
		.toEqual(['get_current_tool', 'list_tools', 'open_tool']);

	// list_tools pulls titles/descriptions from the lazy seo-detail chunks —
	// one line per tool page, so the full registry must come back.
	const listing = await page.evaluate(async () => {
		const result = await (window as unknown as { __mcpTools: McpStub }).__mcpTools[
			'list_tools'
		].execute();
		return result.content[0].text;
	});
	expect(listing.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(93);
	expect(listing).toContain(
		'- compress-jpg — Compress JPG (JPEG) Online — Private, No Upload: Shrink JPG (JPEG) photos right in your browser. Set a quality or a target size like 500 KB. No uploads — files stay on your device. Free & private.'
	);

	await page.evaluate(() =>
		(window as unknown as { __mcpTools: McpStub }).__mcpTools['open_tool'].execute({
			slug: 'compress-jpg'
		})
	);
	await expect(page).toHaveURL(/\/compress-jpg$/);

	const current = await page.evaluate(async () => {
		const result = await (window as unknown as { __mcpTools: McpStub }).__mcpTools[
			'get_current_tool'
		].execute();
		return result.content[0].text;
	});
	expect(current).toContain('# Compress JPG images.');
});
