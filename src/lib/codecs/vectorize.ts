import type { ImageCompressionSettings } from '$lib/types';
import type { VtracerConfig } from '$lib/workers/protocol';
import { callWorker } from '$lib/workers/rpc';

/**
 * Raster → SVG vectorization (png-to-svg / jpg-to-svg pages). The heavy work
 * runs in the vtracer worker; this maps the two user-facing controls onto
 * vtracer's parameter surface and wraps the result string as an SVG blob.
 */

/**
 * One Detail dial → the three vtracer knobs that matter for output fidelity;
 * everything else stays at vtracer's defaults. At detail 60 (our default) the
 * mapping lands exactly on vtracer's own defaults (speckle 4, color precision
 * 6, layer difference 16); higher detail keeps smaller speckles, more color
 * levels and thinner layers, lower detail simplifies harder.
 */
export function vectorizeParams(mode: 'color' | 'bw', detail: number): VtracerConfig {
	const d = Math.min(100, Math.max(0, Math.round(detail)));
	// vtracer-CLI-style precision bits (6 at the default detail), clamped to 7
	// because 8 trips a visioncortex assert in this build (measured panic).
	const precisionBits = Math.min(7, Math.max(3, Math.round(3 + d * 0.05)));
	return {
		binary: mode === 'bw',
		mode: 'spline',
		hierarchical: 'stacked',
		filterSpeckle: Math.min(10, Math.max(1, Math.round(1 + (100 - d) * 0.075))),
		// INVERTED SEMANTICS: this wrapper wants "bits treated as the same
		// color" (visioncortex's same_color_a), not the CLI's kept-bits — the
		// CLI computes 8 - precision before calling in. Passing CLI numbers
		// here merges everything into color mush (measured: an orange circle
		// vanished into its purple parent at 6, correct at 8-6=2).
		colorPrecision: 8 - precisionBits,
		layerDifference: Math.min(48, Math.max(4, Math.round(4 + (100 - d) * 0.3))),
		// ANGLES ARE RADIANS: this wrapper feeds visioncortex directly — the
		// familiar vtracer CLI numbers (60°/45°) are converted by the CLI, not
		// here. Degrees at this boundary melt every corner into blob soup
		// (measured on the fixture set).
		cornerThreshold: (60 * Math.PI) / 180,
		lengthThreshold: 4,
		maxIterations: 10,
		spliceThreshold: (45 * Math.PI) / 180,
		pathPrecision: 2
	};
}

export async function vectorizeImage(
	file: File,
	settings: ImageCompressionSettings,
	signal?: AbortSignal
): Promise<Blob> {
	const svg = await callWorker(
		'vtracer',
		'vectorize',
		{
			file,
			config: vectorizeParams(settings.vectorMode, settings.vectorDetail),
			maxDimension: settings.maxDimension
		},
		[],
		undefined,
		{ owner: signal }
	);
	return new Blob([svg], { type: 'image/svg+xml' });
}
