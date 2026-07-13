/**
 * The woff2 submodule ships untyped (and unexported upstream — see
 * patches/fonteditor-core@2.6.3.patch). CJS: the module object is the default.
 */
declare module 'fonteditor-core/woff2' {
	interface Woff2Module {
		isInited(): boolean;
		/** Browser: pass the woff2.wasm URL. Node resolves it from __dirname. */
		init(wasmUrl?: string | ArrayBuffer): Promise<Woff2Module>;
		/** Whole raw sfnt (TTF or OTF flavor) → WOFF2 bytes. */
		encode(buffer: ArrayBuffer | Uint8Array | number[]): Uint8Array;
		/** WOFF2 bytes → whole raw sfnt. */
		decode(buffer: ArrayBuffer | Uint8Array | number[]): Uint8Array;
	}
	const woff2: Woff2Module;
	export default woff2;
}

declare module 'fonteditor-core/woff2/woff2.wasm?url' {
	const url: string;
	export default url;
}
