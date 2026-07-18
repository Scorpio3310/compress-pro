/**
 * Per-cell result recording + raster export for the real-file matrix.
 * One JSON per cell (CaseRecorder's parallel-safety model — no shared append
 * file under concurrent workers), written IMMEDIATELY so a crashed run keeps
 * every completed cell. scripts/matrix-report.mjs merges cells → results.jsonl,
 * a markdown table and per-family raster manifests for visual inspection.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../fixtures';
import { cellId } from './walk';

const MATRIX_DIR = join(ROOT, 'test-results', 'matrix');
const CELLS_DIR = join(MATRIX_DIR, 'cells');
const RASTERS_DIR = join(MATRIX_DIR, 'rasters');

/** Longest raster side — under the ~1568 px vision-model sweet spot, and keeps
 *  the scratch dir sane against 6 GB of inputs. */
const MAX_RASTER_SIDE = 1400;

export type CellStatus = 'pass' | 'fail' | 'error' | 'skip';

export interface CellResult {
	family: string;
	/** Path relative to tests/fixtures/real. */
	file: string;
	/** The app page driven, e.g. '/compress-pdf'. */
	tool: string;
	/** 'compress' | 'convert:webp' | 'extract' | 'unlock' | … */
	action: string;
	/** 'q80' | 'high' | 'draco' | 'default' | '150dpi' | … */
	level: string;
	status: CellStatus;
	inBytes: number;
	outBytes?: number;
	/** True when the app returned the original bytes (keep-original guard). */
	keptOriginal?: boolean;
	metrics?: Record<string, number | string | boolean | null>;
	durationMs: number;
	notes?: string;
	error?: string | null;
	/** Report-relative raster paths (rasters/<family>/<cellId>/…). */
	rasters?: string[];
}

export class MatrixRecorder {
	constructor(private family: string) {}

	id(fileRel: string, action: string, level: string): string {
		return cellId(this.family, fileRel, action, level);
	}

	/** Write the cell result NOW (crash-safe; unique cellId ⇒ parallel-safe). */
	cell(data: CellResult): void {
		mkdirSync(CELLS_DIR, { recursive: true });
		const id = this.id(data.file, data.action, data.level);
		const savingsPct =
			data.outBytes !== undefined && data.inBytes > 0
				? Number((((data.inBytes - data.outBytes) / data.inBytes) * 100).toFixed(1))
				: null;
		writeFileSync(
			join(CELLS_DIR, `${id}.json`),
			JSON.stringify({ cellId: id, savingsPct, ...data }, null, '\t')
		);
	}

	/** Downscale + save one raster; returns the matrix-relative path. */
	async saveRaster(id: string, name: string, png: Buffer): Promise<string> {
		const dir = join(RASTERS_DIR, this.family, id);
		mkdirSync(dir, { recursive: true });
		const meta = await sharp(png).metadata();
		const side = Math.max(meta.width ?? 0, meta.height ?? 0);
		const out =
			side > MAX_RASTER_SIDE
				? await sharp(png)
						.resize({ width: MAX_RASTER_SIDE, height: MAX_RASTER_SIDE, fit: 'inside' })
						.png()
						.toBuffer()
				: png;
		writeFileSync(join(dir, name), out);
		return `rasters/${this.family}/${id}/${name}`;
	}

	/** Before|after side-by-side (each panel ≤ half the max side), one file. */
	async saveSideBySide(id: string, name: string, before: Buffer, after: Buffer): Promise<string> {
		const half = Math.floor(MAX_RASTER_SIDE / 2) - 4;
		const panel = (b: Buffer) =>
			sharp(b).resize({ width: half, height: MAX_RASTER_SIDE, fit: 'inside' }).png().toBuffer();
		const [a, b] = await Promise.all([panel(before), panel(after)]);
		const [ma, mb] = await Promise.all([sharp(a).metadata(), sharp(b).metadata()]);
		const height = Math.max(ma.height ?? 0, mb.height ?? 0);
		const stitched = await sharp({
			create: {
				width: (ma.width ?? 0) + (mb.width ?? 0) + 8,
				height,
				channels: 3,
				background: { r: 17, g: 17, b: 17 }
			}
		})
			.composite([
				{ input: a, left: 0, top: 0 },
				{ input: b, left: (ma.width ?? 0) + 8, top: 0 }
			])
			.png()
			.toBuffer();
		const dir = join(RASTERS_DIR, this.family, id);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, name), stitched);
		return `rasters/${this.family}/${id}/${name}`;
	}
}

/** Elapsed-ms helper so specs don't hand-roll Date.now() pairs. */
export function timer(): () => number {
	const t0 = Date.now();
	return () => Date.now() - t0;
}
