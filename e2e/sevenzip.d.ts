// The package's types map only to its root import; verify.ts deep-imports the
// ES module directly (node picks the CJS "main" otherwise), so mirror the type.
declare module '7z-wasm/7zz.es6.js' {
	import factory from '7z-wasm';
	export default factory;
}
