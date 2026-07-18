/**
 * VC-01: the vectorize path downscales big photos to the trace ceiling
 * (vectorize-limits) instead of feeding the synchronous, progress-less to_svg
 * a full-res bitmap — pre-fix, a many-MP input ground the wasm for minutes
 * (or OOM-aborted, poisoning the instance). The SVG root carries the trace
 * size, so the ceiling is directly observable in the artifact.
 */
import { expect, fx, test } from '../fixtures';
import { compress, downloadRow, gotoPath, upload } from '../helpers';

test.describe.configure({ timeout: 240_000 });

test('VC-01: /jpg-to-svg tames a 12 MP photo via the trace ceiling', async ({ page }) => {
	await gotoPath(page, '/jpg-to-svg');
	await upload(page, fx('photo-4000x3000.jpg'));
	await compress(page, { timeout: 120_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('photo-4000x3000.svg');
	const text = art.bytes.toString('utf8');
	expect(text).toContain('<path');
	const m = text.match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/);
	expect(m, 'vtracer stamps the trace size on the svg root').toBeTruthy();
	const w = Number(m![1]);
	const h = Number(m![2]);
	expect(w * h, 'traced at or under the 2 MP ceiling').toBeLessThanOrEqual(2_000_000);
	expect(w / h, 'aspect preserved').toBeCloseTo(4 / 3, 2);
});
