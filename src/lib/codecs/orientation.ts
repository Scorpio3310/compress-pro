/**
 * EXIF/TIFF orientation (tag 274) applied to raw RGBA pixels. Browsers bake
 * orientation for the formats THEY decode; wasm/JS decoders (utif2 for TIFF)
 * hand back pixels exactly as stored, so orientation-tagged files rendered
 * rotated or mirrored until this transform runs (quality sweep F-06).
 */

export interface OrientedPixels {
	data: Uint8ClampedArray;
	width: number;
	height: number;
}

/** Orientation 1..8 per TIFF/EXIF; anything else is a no-op passthrough. */
export function applyOrientation(
	data: Uint8ClampedArray,
	width: number,
	height: number,
	orientation: number
): OrientedPixels {
	if (!Number.isInteger(orientation) || orientation < 2 || orientation > 8) {
		return { data, width, height };
	}
	const swap = orientation >= 5;
	const outWidth = swap ? height : width;
	const outHeight = swap ? width : height;
	const out = new Uint8ClampedArray(data.length);
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			let nx: number;
			let ny: number;
			switch (orientation) {
				case 2: // mirror horizontal
					nx = width - 1 - x;
					ny = y;
					break;
				case 3: // rotate 180
					nx = width - 1 - x;
					ny = height - 1 - y;
					break;
				case 4: // mirror vertical
					nx = x;
					ny = height - 1 - y;
					break;
				case 5: // transpose (mirror along top-left diagonal)
					nx = y;
					ny = x;
					break;
				case 6: // rotate 90 CW
					nx = height - 1 - y;
					ny = x;
					break;
				case 7: // transverse (mirror along top-right diagonal)
					nx = height - 1 - y;
					ny = width - 1 - x;
					break;
				default: // 8: rotate 270 CW
					nx = y;
					ny = width - 1 - x;
					break;
			}
			const si = (y * width + x) * 4;
			const di = (ny * outWidth + nx) * 4;
			out[di] = data[si];
			out[di + 1] = data[si + 1];
			out[di + 2] = data[si + 2];
			out[di + 3] = data[si + 3];
		}
	}
	return { data: out, width: outWidth, height: outHeight };
}
