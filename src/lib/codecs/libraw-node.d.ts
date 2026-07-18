/** Node single-thread factory build of libraw-wasm — used by raw.test.ts to
 *  prove the develop settings' wasm-level effect (the app itself goes through
 *  the package's worker entry, which types itself). */
declare module 'libraw-wasm/dist/libraw.js' {
	interface NodeLibRawImage {
		width: number;
		height: number;
		colors: number;
		bits: number;
		data: Uint8Array;
	}
	interface NodeLibRawInstance {
		open(bytes: Uint8Array, settings: object): void;
		imageData(): NodeLibRawImage;
	}
	interface NodeLibRawModule {
		LibRaw: new () => NodeLibRawInstance;
	}
	const factory: (opts: { wasmBinary: Uint8Array | Buffer }) => Promise<NodeLibRawModule>;
	export default factory;
}
