// Build-time constants from vite.config.js `define` — ISO date of the build
// and the short git commit the build was made from ('dev' outside a repo,
// '<sha>-dirty' when the working tree had uncommitted changes).
declare const __BUILD_DATE__: string;
declare const __COMMIT__: string;

// Vite aliases (see vite.config.js) straight to icodec's modules.
declare module 'icodec-heic' {
	export function loadDecoder(moduleOrPath?: string | WebAssembly.Module): Promise<unknown>;
	/** Returns ImageData for 8-bit sources; ImageData-like with depth 10/12 otherwise. */
	export function decode(input: BufferSource): ImageData & { depth?: number };
}

declare module 'icodec-jxl' {
	export interface JxlEncodeOptions {
		/** libjpeg-style 0–100 (default 75) — mapped to libjxl distance internally. */
		quality?: number;
		/** 1–9, default 7. */
		effort?: number;
		lossless?: boolean;
		alphaQuality?: number;
	}
	export function loadDecoder(moduleOrPath?: string | WebAssembly.Module): Promise<unknown>;
	export function loadEncoder(moduleOrPath?: string | WebAssembly.Module): Promise<unknown>;
	/** Returns ImageData for 8-bit sources; ImageData-like with higher depth otherwise. */
	export function decode(input: BufferSource): ImageData & { depth?: number };
	export function encode(
		image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
		options?: JxlEncodeOptions
	): Uint8Array;
}

declare module 'icodec-common' {
	export function toBitDepth(
		image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number; depth?: number },
		value: number
	): { data: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; depth: number };
}

declare module 'icodec-png' {
	export interface QuantizeOptions {
		speed?: number;
		quality?: number;
		colors?: number;
		dithering?: number;
	}
	export function loadEncoder(moduleOrPath?: string | WebAssembly.Module): Promise<unknown>;
	export function reduceColors(
		image: { data: Uint8ClampedArray | Uint8Array; width: number; height: number; depth: 8 | 16 },
		options?: QuantizeOptions
	): Uint8Array;
}

declare module 'draco3d' {
	/** Emscripten factory pair; wasmBinary skips the glue's own file loading
	 *  (its fs/path requires live in dead Node branches). Module type is
	 *  opaque — gltf-transform's registerDependencies is the only consumer. */
	const draco3d: {
		createEncoderModule(config?: { wasmBinary?: ArrayBuffer }): Promise<object>;
		createDecoderModule(config?: { wasmBinary?: ArrayBuffer }): Promise<object>;
	};
	export default draco3d;
}

declare module 'gifsicle-wasm-browser' {
	interface GifsicleInput {
		file: File | Blob | string;
		name: string;
	}
	const gifsicle: {
		run(options: { input: GifsicleInput[]; command: string[] }): Promise<File[]>;
	};
	export default gifsicle;
}

declare module 'utif2' {
	interface UtifIfd {
		width: number;
		height: number;
		[tag: string]: unknown;
	}
	export function decode(buffer: ArrayBuffer | Uint8Array): UtifIfd[];
	export function decodeImage(buffer: ArrayBuffer | Uint8Array, ifd: UtifIfd): void;
	export function toRGBA8(ifd: UtifIfd): Uint8Array;
}

declare module 'gifenc' {
	export function quantize(
		rgba: Uint8Array | Uint8ClampedArray,
		maxColors: number,
		options?: Record<string, unknown>
	): number[][];
	export function applyPalette(
		rgba: Uint8Array | Uint8ClampedArray,
		palette: number[][],
		format?: string
	): Uint8Array;
	export function GIFEncoder(): {
		writeFrame(
			index: Uint8Array,
			width: number,
			height: number,
			options?: {
				palette?: number[][];
				transparent?: boolean;
				transparentIndex?: number;
				delay?: number;
			}
		): void;
		finish(): void;
		bytes(): Uint8Array;
	};
}
