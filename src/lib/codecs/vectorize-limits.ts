/**
 * Trace-size ceiling for raster → SVG vectorization. visioncortex clustering
 * is superlinear in pixels and runs as ONE synchronous, progress-less to_svg
 * call inside a 32-bit wasm heap: beyond a few MP it grinds for minutes with
 * a frozen bar and can abort the instance outright. Tracing gains nothing up
 * there — curves are fitted, not sampled — so the worker downscales bigger
 * rasters (aspect preserved) before the wasm ever sees them; the SVG stays
 * resolution-independent either way.
 */
export const VECTORIZE_MAX_PIXELS = 2_000_000;

export function vectorizeTraceSize(
	width: number,
	height: number,
	maxDimension: number | null = null
): { width: number; height: number; scaled: boolean } {
	// The user's Advanced cap applies first (aspect preserved); the pixel
	// ceiling below stays the hard upper bound regardless.
	if (maxDimension !== null && maxDimension > 0 && Math.max(width, height) > maxDimension) {
		const s = maxDimension / Math.max(width, height);
		const capped = vectorizeTraceSize(
			Math.max(1, Math.round(width * s)),
			Math.max(1, Math.round(height * s))
		);
		return { ...capped, scaled: true };
	}
	const pixels = width * height;
	if (pixels <= VECTORIZE_MAX_PIXELS) return { width, height, scaled: false };
	const scale = Math.sqrt(VECTORIZE_MAX_PIXELS / pixels);
	let w = Math.max(1, Math.floor(width * scale));
	let h = Math.max(1, Math.floor(height * scale));
	// A degenerate aspect can clamp one side to 1 — re-fit the other so the
	// ceiling is a hard invariant.
	if (w * h > VECTORIZE_MAX_PIXELS) {
		if (w >= h) w = Math.max(1, Math.floor(VECTORIZE_MAX_PIXELS / h));
		else h = Math.max(1, Math.floor(VECTORIZE_MAX_PIXELS / w));
	}
	return { width: w, height: h, scaled: true };
}
