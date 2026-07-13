/**
 * The wasm subpath exists via patches/harfbuzzjs@1.4.0.patch (upstream's
 * exports map only exposes the package root).
 */
declare module 'harfbuzzjs/dist/harfbuzz-subset.wasm?url' {
	const url: string;
	export default url;
}
