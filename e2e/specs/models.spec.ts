/**
 * MD-01…11: the model tab — GLB optimization via gltf-transform (Draco /
 * Meshopt / quantize) + embedded-texture recompression. Output verification
 * runs the SAME engine in Node (verify.ts glbInfo). All tests are
 * preview-safe: pure UI drive + Node-side byte checks.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { expect, fx, fxMeta, test } from '../fixtures';
import { compress, downloadRow, gotoPath, setModelSimplify, upload } from '../helpers';
import { glbDecodesWithoutCodecs, glbInfo, glbJson } from '../verify';

test.describe.configure({ timeout: 180_000 });

const TRIANGLES = 24_320;

test('MD-01: /compress-glb crushes geometry with Draco by default @smoke', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await expect(page).toHaveTitle(/Compress GLB/);
	await expect(page.getByText('Drop GLB models here')).toBeVisible();
	await upload(page, fx('sample.glb'));
	await expect(page.getByRole('button', { name: 'Draco', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.getByTestId('compress-cta')).toHaveText('Compress 1 model');
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample.glb');
	const source = readFileSync(fx('sample.glb'));
	expect(art.bytes.length).toBeLessThan(source.length);
	const info = await glbInfo(art.bytes);
	expect(info.extensionsRequired).toContain('KHR_draco_mesh_compression');
	// no simplify → connectivity preserved exactly (pole-clean fixture)
	expect(info.triangles).toBe(TRIANGLES);
	expect(info.animations).toBe(1);
	expect(info.animationChannels).toBe(1);
	// texture: re-encoded smaller, dims untouched (cap Off)
	const meta = fxMeta<{ texture: { bytes: number } }>('sample.glb');
	expect(info.textures).toHaveLength(1);
	expect(info.textures[0].mime).toBe('image/jpeg');
	expect([info.textures[0].width, info.textures[0].height]).toEqual([2048, 1024]);
	expect(info.textures[0].bytes).toBeLessThan(meta.texture.bytes);
	await expect(page.getByTestId('row-info')).toContainText('Draco geometry');
	await expect(page.getByTestId('row-info')).toContainText('1 of 1 texture recompressed');
});

test('MD-02: compression None produces a decoder-free file', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample.glb'));
	await page.getByRole('button', { name: 'None', exact: true }).click();
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	expect(art.bytes.length).toBeLessThan(readFileSync(fx('sample.glb')).length);
	const json = glbJson(art.bytes) as { extensionsRequired?: string[] };
	// KHR_mesh_quantization needs no decoder — anything else would
	const required = json.extensionsRequired ?? [];
	expect(required.every((e) => e === 'KHR_mesh_quantization')).toBe(true);
	expect(await glbDecodesWithoutCodecs(art.bytes)).toBe(true);
	const info = await glbInfo(art.bytes);
	expect(info.triangles).toBe(TRIANGLES);
	expect(info.animations).toBe(1);
});

test('MD-03: Meshopt compression writes EXT_meshopt_compression', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample.glb'));
	await page.getByRole('button', { name: 'Meshopt', exact: true }).click();
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	expect(art.bytes.length).toBeLessThan(readFileSync(fx('sample.glb')).length);
	const info = await glbInfo(art.bytes);
	expect(info.extensionsRequired).toContain('EXT_meshopt_compression');
	expect(info.triangles).toBe(TRIANGLES);
});

test('MD-04: simplify 50% halves the triangle count', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample.glb'));
	await setModelSimplify(page, 50);
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	const info = await glbInfo(art.bytes);
	// phase-0 measured 12,159 at ratio 0.5 — the window is generous anyway
	expect(info.triangles).toBeGreaterThan(TRIANGLES * 0.35);
	expect(info.triangles).toBeLessThan(TRIANGLES * 0.65);
	await expect(page.getByTestId('row-info')).toContainText(/→ .*triangles/);
});

test('MD-05: the texture cap downscales the 2048px texture to 1024', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample.glb'));
	await page.getByRole('button', { name: '1024 px', exact: true }).click();
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	const info = await glbInfo(art.bytes);
	expect([info.textures[0].width, info.textures[0].height]).toEqual([1024, 512]);
	expect(info.triangles).toBe(TRIANGLES);
	expect(art.bytes.length).toBeLessThan(readFileSync(fx('sample.glb')).length);
});

test('MD-06: a run that would grow returns the original file untouched', async ({ page }) => {
	// Texture-less draco source + compression None: decoding to merely-quantized
	// raw geometry is deterministically BIGGER → whole-file keep-original.
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample-draco-notex.glb'));
	await page.getByRole('button', { name: 'None', exact: true }).click();
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample-draco-notex.glb');
	expect(art.bytes.equals(readFileSync(fx('sample-draco-notex.glb')))).toBe(true);
	await expect(page.getByTestId('row-info')).toHaveCount(0);
});

test('MD-07: a .gltf with external files gets the export-as-glb error', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample-external.gltf'));
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/single \.glb|self-contained/i);
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});

test('MD-08: a home-dropped .glb routes to the 3D tab', async ({ page }) => {
	await gotoPath(page, '/');
	await upload(page, fx('sample.glb'));
	await expect(page.getByRole('button', { name: 'Draco', exact: true })).toBeVisible();
	await expect(page.getByTestId('compress-cta')).toHaveText('Compress 1 model');
});

test('MD-09: an already-Draco input re-optimizes cleanly', async ({ page }) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample-draco.glb'));
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	expect(art.name).toBe('sample-draco.glb');
	const info = await glbInfo(art.bytes);
	expect(info.extensionsRequired).toContain('KHR_draco_mesh_compression');
	expect(info.triangles).toBe(TRIANGLES);
	// canvas q80 re-encode beats the fixture's q92 texture → net smaller
	expect(art.bytes.length).toBeLessThan(readFileSync(fx('sample-draco.glb')).length);
	await expect(page.getByTestId('row-info')).toContainText('1 of 1 texture recompressed');
});

test('MD-10: simplify on a morph-target model is skipped with an honest warning', async ({
	page
}) => {
	await gotoPath(page, '/compress-glb');
	await upload(page, fx('sample-morph.glb'));
	await setModelSimplify(page, 50);
	await compress(page, { timeout: 150_000 });
	const art = await downloadRow(page);
	const info = await glbInfo(art.bytes);
	// The skip is wholesale — the full triangle count survives — and the row
	// must say WHY the explicit simplify setting was ignored.
	expect(info.triangles).toBe(TRIANGLES);
	await expect(page.getByTestId('row-warning')).toContainText('Simplify skipped');
	await expect(page.getByTestId('row-warning')).toContainText('morph targets');
});

test('MD-11: a .glb truncated mid-JSON gets the honest message, not a raw SyntaxError', async ({
	page
}, testInfo) => {
	const full = readFileSync(fx('sample.glb'));
	const jsonLength = full.readUInt32LE(12);
	const cut = full.subarray(0, 20 + Math.floor(jsonLength / 2));
	const path = testInfo.outputPath('truncated.glb');
	writeFileSync(path, cut);
	await gotoPath(page, '/compress-glb');
	await upload(page, path);
	const run = await compress(page, { expectError: true });
	expect(run.error).toMatch(/incomplete/);
	expect(run.error).toMatch(/re-download/);
	expect(run.error).not.toMatch(/JSON|DataView|Offset/);
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});
