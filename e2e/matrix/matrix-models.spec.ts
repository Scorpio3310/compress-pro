/**
 * Real-file matrix — 3D model family. Every routable real .glb (normal tier)
 * runs the geometry-preset ladder (Draco / Meshopt / None) with a Node-side
 * decode-back through the SAME engine (verify.ts glbInfo: gltf-transform +
 * draco3d + meshopt decoders), plus a simplify run and a texture-quality
 * ladder on representatives. Real .gltf inputs (if any land in the fixture
 * tree) must produce the honest export-as-glb error — that error IS the
 * contract, recorded as pass. The two giant drogon .glb files (>60 MB) are
 * excluded here by the normal-tier default and belong to matrix-giant.
 *
 * There is no 3D rasterizer in the harness, so the visual-inspection material
 * is the embedded texture: input|output side-by-sides per cell.
 *
 * Cell titles: `MX [models] <file> :: <action> @<level>` — grep one to re-run.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import {
	compress,
	downloadRow,
	gotoPath,
	setModelSimplify,
	setModelTextureQuality,
	upload
} from '../helpers';
import { glbDecodesWithoutCodecs, glbInfo, type GlbInfo } from '../verify';
import { MatrixRecorder, timer } from './record';
import { realByFormat } from './walk';

test.describe.configure({ timeout: 300_000 });

if (process.env.E2E_PREVIEW) throw new Error('matrix specs need the dev server (rasterizers)');

const rec = new MatrixRecorder('models');
const TOOL = '/compress-glb';

const models = realByFormat(['model']);
const glbs = models.filter((f) => f.ext === 'glb');
const gltfs = models.filter((f) => f.ext === 'gltf');

const PRESETS = [
	{ level: 'draco', button: 'Draco', requiredExt: 'KHR_draco_mesh_compression' },
	{ level: 'meshopt', button: 'Meshopt', requiredExt: 'EXT_meshopt_compression' },
	{ level: 'none', button: 'None', requiredExt: null }
] as const;

/** Sum of embedded-texture byte sizes (the texture share of the file). */
function texBytes(info: GlbInfo): number {
	return info.textures.reduce((n, t) => n + t.bytes, 0);
}

/** Node-side decode of the input; null = not a decodable glb (negative material). */
async function tryGlbInfo(buf: Buffer): Promise<GlbInfo | null> {
	try {
		return await glbInfo(buf);
	} catch {
		return null;
	}
}

// --- local helper (candidate for verify.ts): raw bytes of one embedded texture
// glbInfo returns texture META only; side-by-side rasters need the image bytes.
// Duplicates verify.ts's codec-registered NodeIO setup — worth sharing if a
// second spec ever needs texture bytes.
type GltfIo = import('@gltf-transform/core').NodeIO;
let ioReady: Promise<GltfIo> | null = null;

async function texIo(): Promise<GltfIo> {
	ioReady ??= (async () => {
		const { NodeIO } = await import('@gltf-transform/core');
		const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions');
		const draco3d = (await import('draco3d')).default;
		const { MeshoptDecoder, MeshoptEncoder } = await import('meshoptimizer');
		await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
		return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
			'draco3d.encoder': await draco3d.createEncoderModule({}),
			'draco3d.decoder': await draco3d.createDecoderModule({}),
			'meshopt.encoder': MeshoptEncoder,
			'meshopt.decoder': MeshoptDecoder
		});
	})();
	return ioReady;
}

/** First embedded texture's raw image bytes, or null when texture-less. */
async function glbTextureBytes(buf: Buffer): Promise<Buffer | null> {
	const io = await texIo();
	const document = await io.readBinary(new Uint8Array(buf));
	for (const texture of document.getRoot().listTextures()) {
		const image = texture.getImage();
		if (image) return Buffer.from(image);
	}
	return null;
}

/** jpeg/png → png buffer for raster storage (savers expect png-decodable input). */
async function toPng(img: Buffer): Promise<Buffer> {
	const sharp = (await import('sharp')).default;
	return sharp(img).png().toBuffer();
}

/** Texture side-by-side (input | output) when both sides carry a texture. */
async function saveTextureSide(id: string, inBuf: Buffer, outBuf: Buffer): Promise<string[]> {
	try {
		const [inTex, outTex] = await Promise.all([glbTextureBytes(inBuf), glbTextureBytes(outBuf)]);
		if (!inTex || !outTex) return [];
		return [await rec.saveSideBySide(id, 'texture0.png', await toPng(inTex), await toPng(outTex))];
	} catch {
		return []; // rasters are inspection material, never the failure signal
	}
}

// --- A) per .glb × geometry preset -----------------------------------------

for (const f of glbs) {
	for (const preset of PRESETS) {
		test(`MX [models] ${f.rel} :: compress @${preset.level}`, async ({ page }) => {
			const input = readFileSync(f.abs);
			const elapsed = timer();
			const id = rec.id(f.rel, 'compress', preset.level);
			try {
				const inInfo = await tryGlbInfo(input);
				await gotoPath(page, TOOL);
				await upload(page, f.abs);

				if (!inInfo) {
					// Undecodable "glb" — the app must show an honest error, never hang.
					const run = await compress(page, { expectError: true, timeout: 240_000 });
					expect(run.error, 'honest error for an undecodable glb').toBeTruthy();
					rec.cell({
						family: 'models',
						file: f.rel,
						tool: TOOL,
						action: 'compress',
						level: preset.level,
						status: 'pass',
						inBytes: input.length,
						durationMs: elapsed(),
						notes: `undecodable input — honest error: ${(run.error ?? '').slice(0, 200)}`
					});
					return;
				}

				const button = page.getByRole('button', { name: preset.button, exact: true });
				await button.click();
				await expect(button).toHaveAttribute('aria-pressed', 'true');
				await compress(page, { timeout: 240_000 });
				const art = await downloadRow(page);
				const keptOriginal = art.bytes.length === input.length;
				const outInfo = await glbInfo(art.bytes); // decode-back: throws on garbage

				// Structure: connectivity may only shrink (weld/prune), never grow.
				expect(outInfo.triangles, 'triangles > 0').toBeGreaterThan(0);
				expect(outInfo.triangles, 'no simplify → triangles must not grow').toBeLessThanOrEqual(
					inInfo.triangles
				);
				expect(outInfo.vertices, 'vertices > 0').toBeGreaterThan(0);
				expect(outInfo.vertices, 'vertices sane vs input').toBeLessThanOrEqual(
					Math.ceil(inInfo.vertices * 1.05)
				);
				// glbInfo decodes every embedded texture through imageMeta — reaching
				// here proves they all decode; the count must survive too.
				expect(outInfo.textures.length, 'texture count preserved').toBe(inInfo.textures.length);
				expect(outInfo.animations, 'animations preserved').toBe(inInfo.animations);
				expect(outInfo.animationChannels, 'animation channels preserved').toBe(
					inInfo.animationChannels
				);
				expect(art.bytes.length, 'keep-original guard forbids growth').toBeLessThanOrEqual(
					input.length
				);
				if (!keptOriginal) {
					if (preset.requiredExt) {
						expect(outInfo.extensionsRequired, `${preset.level} marks its codec`).toContain(
							preset.requiredExt
						);
					} else {
						expect(
							await glbDecodesWithoutCodecs(art.bytes),
							'preset none must decode without codecs'
						).toBe(true);
					}
				}

				const rasters = await saveTextureSide(id, input, art.bytes);
				rec.cell({
					family: 'models',
					file: f.rel,
					tool: TOOL,
					action: 'compress',
					level: preset.level,
					status: 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal,
					metrics: {
						trianglesIn: inInfo.triangles,
						trianglesOut: outInfo.triangles,
						verticesIn: inInfo.vertices,
						verticesOut: outInfo.vertices,
						textures: outInfo.textures.length,
						texBytesIn: texBytes(inInfo),
						texBytesOut: texBytes(outInfo),
						extensionsRequired: outInfo.extensionsRequired.join(',') || 'none'
					},
					durationMs: elapsed(),
					rasters,
					notes: keptOriginal ? 'keep-original returned input bytes' : ''
				});
			} catch (error) {
				rec.cell({
					family: 'models',
					file: f.rel,
					tool: TOOL,
					action: 'compress',
					level: preset.level,
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				throw error;
			}
		});
	}
}

// --- B) simplify 50% + draco on the largest glb ----------------------------

const simplifyRep = glbs.length ? glbs.reduce((a, b) => (b.bytes > a.bytes ? b : a)) : null;

if (simplifyRep) {
	test(`MX [models] ${simplifyRep.rel} :: simplify @50`, async ({ page }) => {
		const input = readFileSync(simplifyRep.abs);
		const elapsed = timer();
		const id = rec.id(simplifyRep.rel, 'simplify', '50');
		try {
			const inInfo = await glbInfo(input);
			await gotoPath(page, TOOL);
			await upload(page, simplifyRep.abs);
			await page.getByRole('button', { name: 'Draco', exact: true }).click();
			await setModelSimplify(page, 50);
			await compress(page, { timeout: 240_000 });
			const art = await downloadRow(page);
			const keptOriginal = art.bytes.length === input.length;
			const outInfo = await glbInfo(art.bytes);
			expect(outInfo.triangles, 'still a mesh').toBeGreaterThan(0);
			if (!keptOriginal) {
				expect(outInfo.triangles, 'simplify 50% must strictly reduce triangles').toBeLessThan(
					inInfo.triangles
				);
				expect(outInfo.extensionsRequired).toContain('KHR_draco_mesh_compression');
			}
			const rasters = await saveTextureSide(id, input, art.bytes);
			rec.cell({
				family: 'models',
				file: simplifyRep.rel,
				tool: TOOL,
				action: 'simplify',
				level: '50',
				status: 'pass',
				inBytes: input.length,
				outBytes: art.bytes.length,
				keptOriginal,
				metrics: {
					trianglesIn: inInfo.triangles,
					trianglesOut: outInfo.triangles,
					triangleRatio: Number((outInfo.triangles / inInfo.triangles).toFixed(3))
				},
				durationMs: elapsed(),
				rasters,
				notes: keptOriginal ? 'keep-original returned input bytes — no reduction to validate' : ''
			});
		} catch (error) {
			rec.cell({
				family: 'models',
				file: simplifyRep.rel,
				tool: TOOL,
				action: 'simplify',
				level: '50',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}

// --- C) texture-quality ladder (low vs high) on a textured representative ---

if (glbs.length) {
	test(`MX [models] batch texture-quality @q30-q90`, async ({ page }) => {
		// Pick the first glb that actually carries embedded textures (runtime
		// probe — the fixture tree keeps changing and module load must stay sync).
		let rep: (typeof glbs)[number] | null = null;
		let inInfo: GlbInfo | null = null;
		for (const f of glbs) {
			const info = await tryGlbInfo(readFileSync(f.abs));
			if (info && info.textures.length > 0) {
				rep = f;
				inInfo = info;
				break;
			}
		}
		if (!rep || !inInfo) {
			rec.cell({
				family: 'models',
				file: glbs[0].rel,
				tool: TOOL,
				action: 'texture-quality',
				level: 'q30-q90',
				status: 'skip',
				inBytes: glbs[0].bytes,
				durationMs: 0,
				notes: 'no real glb with embedded textures — ladder not applicable'
			});
			return;
		}
		const input = readFileSync(rep.abs);
		const failures: string[] = [];
		const totals: Record<string, number> = {};

		await gotoPath(page, TOOL);
		await upload(page, rep.abs);
		let low: Buffer | null = null;
		for (const q of [30, 90] as const) {
			const elapsed = timer();
			const id = rec.id(rep.rel, 'texture-quality', `q${q}`);
			try {
				await setModelTextureQuality(page, q);
				await compress(page, { timeout: 240_000 });
				const art = await downloadRow(page);
				const outInfo = await glbInfo(art.bytes); // decode-back
				totals[`q${q}`] = texBytes(outInfo);
				if (outInfo.textures.length !== inInfo.textures.length)
					failures.push(
						`q${q}: texture count ${outInfo.textures.length} != ${inInfo.textures.length}`
					);
				// Cap is Off → dims must never exceed the input's, texture by texture.
				outInfo.textures.forEach((t, i) => {
					const src = inInfo!.textures[i];
					if (!src || t.width > src.width || t.height > src.height)
						failures.push(`q${q}: texture[${i}] ${t.width}x${t.height} exceeds input`);
				});
				// Low side is captured on the q30 pass; the q90 pass saves a
				// low|high texture side-by-side as the visual-inspection material.
				let rasters: string[] = [];
				if (q === 30) low = art.bytes;
				else if (low) {
					try {
						const [lowTex, highTex] = await Promise.all([
							glbTextureBytes(low),
							glbTextureBytes(art.bytes)
						]);
						if (lowTex && highTex)
							rasters = [
								await rec.saveSideBySide(
									id,
									'texture0-low-vs-high.png',
									await toPng(lowTex),
									await toPng(highTex)
								)
							];
					} catch {
						// rasters are inspection material, never the failure signal
					}
				}
				rec.cell({
					family: 'models',
					file: rep.rel,
					tool: TOOL,
					action: 'texture-quality',
					level: `q${q}`,
					status: 'pass',
					inBytes: input.length,
					outBytes: art.bytes.length,
					keptOriginal: art.bytes.length === input.length,
					metrics: {
						texBytesIn: texBytes(inInfo),
						texBytesOut: texBytes(outInfo),
						textures: outInfo.textures.length
					},
					durationMs: elapsed(),
					rasters
				});
			} catch (error) {
				rec.cell({
					family: 'models',
					file: rep.rel,
					tool: TOOL,
					action: 'texture-quality',
					level: `q${q}`,
					status: 'error',
					inBytes: input.length,
					durationMs: elapsed(),
					error: String(error).slice(0, 500)
				});
				failures.push(`q${q}: ${String(error).slice(0, 200)}`);
			}
		}
		// Ladder ordering: per-texture grow-guard keeps originals at high q, so
		// low must never come out LARGER than high (PNG-only inputs come out equal).
		if (totals.q30 !== undefined && totals.q90 !== undefined && totals.q30 > totals.q90)
			failures.push(`texture bytes not ordered: q30 ${totals.q30} > q90 ${totals.q90}`);
		expect(failures, failures.join(' | ')).toEqual([]);
	});
}

// --- D) real .gltf inputs: the honest export-as-glb error IS the contract ---

for (const f of gltfs) {
	test(`MX [models] ${f.rel} :: gltf-error @default`, async ({ page }) => {
		const input = readFileSync(f.abs);
		const elapsed = timer();
		try {
			await gotoPath(page, TOOL);
			await upload(page, f.abs);
			const run = await compress(page, { expectError: true, timeout: 240_000 });
			expect(run.error, 'error must point at exporting a self-contained .glb').toMatch(
				/single \.glb|self-contained|export.*\.glb|\.glb/i
			);
			await expect(page.getByTestId('compress-cta')).toBeEnabled();
			rec.cell({
				family: 'models',
				file: f.rel,
				tool: TOOL,
				action: 'gltf-error',
				level: 'default',
				status: 'pass',
				inBytes: input.length,
				durationMs: elapsed(),
				notes: `honest export-as-glb error is the contract: ${(run.error ?? '').slice(0, 200)}`
			});
		} catch (error) {
			rec.cell({
				family: 'models',
				file: f.rel,
				tool: TOOL,
				action: 'gltf-error',
				level: 'default',
				status: 'error',
				inBytes: input.length,
				durationMs: elapsed(),
				error: String(error).slice(0, 500)
			});
			throw error;
		}
	});
}
