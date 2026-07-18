// SI base 1000, matching the target-size math (targetKb * 1000,
// targetMb * 1_000_000) — a "500 KB" target must display as 500 KB.
export function formatBytes(bytes: number, decimals = 1): string {
	if (bytes === 0) return '0 B';
	const k = 1000;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

export function estimateCompressedSize(
	originalSize: number,
	quality: number,
	format: string
): number {
	const q = quality / 100;
	switch (format) {
		case 'jpg':
			return Math.round(originalSize * (0.1 + 0.7 * q));
		case 'png':
			// lossy palette quantization (quality < 100)
			return Math.round(originalSize * (0.2 + 0.4 * q));
		// 'auto' races jpg/webp (and avif for small images) and keeps the
		// smallest — the webp curve is the deliberately conservative estimate.
		case 'webp':
		case 'auto':
			return Math.round(originalSize * (0.05 + 0.55 * q));
		case 'avif':
			return Math.round(originalSize * (0.04 + 0.38 * q));
		case 'jxl':
			return Math.round(originalSize * (0.04 + 0.36 * q));
		default:
			return originalSize;
	}
}

/** Signed percent for savings chips: "−12%" when smaller, "+12%" when it GREW. */
export function formatSignedPercent(n: number): string {
	return `${n < 0 ? '+' : '−'}${Math.abs(Math.round(n))}%`;
}

function generateId(): string {
	return crypto.randomUUID();
}

export function toUploadedFiles(files: File[]): import('$lib/types').UploadedFile[] {
	return files.map((file) => ({
		id: generateId(),
		file,
		name: file.name,
		size: file.size,
		objectUrl: URL.createObjectURL(file)
	}));
}
