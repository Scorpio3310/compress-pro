// Per-page head/meta + intake details (title/description/tagline/og, steps,
// related, converter preset/accept) for the 'images' tool group — extracted
// verbatim from the pre-split seo.ts (parity is pinned by the byte-identical
// prerender diff). This is now the authoring source for these fields; loaded
// lazily via seo-detail/index.ts, statically by seo-full.server.ts.
import type { ConverterDetail, SeoDetail } from '$lib/seo';

export const DETAILS: Record<string, SeoDetail | ConverterDetail> = {
	'compress-jpg': {
		ogImage: '/og/compress-jpg.jpg',
		title: 'Compress JPG (JPEG) Online — Private, No Upload | Compress Pro',
		description:
			'Shrink JPG (JPEG) photos right in your browser. Set a quality or a target size like 500 KB. No uploads — files stay on your device. Free & private.',
		tagline: 'Smaller JPG photos in your browser — nothing is uploaded.',
		related: ['/remove-exif', '/jpg-to-webp', '/jpg-to-pdf', '/compress-png']
	},
	'compress-png': {
		ogImage: '/og/compress-png.jpg',
		title: 'Compress PNG Online — Private, No Upload | Compress Pro',
		description:
			'Compress PNG images in your browser — fully lossless or with smart color reduction, resizing and target file size. No uploads, no accounts. Free and private.',
		tagline: 'Lossless or lossy — your PNGs never leave your browser.',
		related: ['/png-to-webp', '/png-to-jpg', '/compress-jpg', '/compress-svg']
	},
	'compress-webp': {
		ogImage: '/og/compress-webp.jpg',
		title: 'Compress WebP Online — Private, No Upload | Compress Pro',
		description:
			'Compress WebP images — even animated ones — right in your browser. Quality or target-size modes, resizing, JPG/PNG conversion. No uploads. Free and private.',
		tagline: 'Still or animated — re-encoded locally, never uploaded.',
		related: ['/webp-to-jpg', '/webp-to-png', '/compress-jpg', '/compress-gif']
	},
	'compress-gif': {
		ogImage: '/og/compress-gif.jpg',
		title: 'Compress GIF Online — Keep Animation, No Upload | Compress Pro',
		description:
			'Compress animated GIFs right in your browser. Keep the animation, resize, or hit a target size. No uploads — GIFs never leave your device. Free & private.',
		tagline: 'Shrink GIFs in your browser — they stay animated & local.',
		related: ['/compress-webp', '/compress-video']
	},
	'compress-heic': {
		ogImage: '/og/compress-heic.jpg',
		title: 'Compress HEIC Photos — Private, No Upload | Compress Pro',
		description:
			'Compress iPhone HEIC photos in your browser — pick a quality or an exact target size and export as JPG, PNG, WebP or AVIF. No uploads. Free and private.',
		tagline: 'Shrink iPhone HEIC photos locally — nothing is uploaded.',
		related: ['/heic-to-jpg', '/compress-jpg', '/resize-image']
	},
	'compress-svg': {
		ogImage: '/og/compress-svg.jpg',
		title: 'Compress SVG Online — Private, No Upload | Compress Pro',
		description:
			'Minify SVG files right in your browser: strip metadata, comments and editor junk, round coordinates. No uploads — your artwork never leaves your device.',
		tagline: 'Smaller SVG files in your browser — nothing is uploaded.',
		related: ['/compress-png', '/svg-to-png', '/svg-to-ico']
	},
	'heic-to-jpg': {
		ogImage: '/og/heic-to-jpg.jpg',
		preset: { kind: 'image', tab: 'heic', to: 'jpg' },
		title: 'HEIC to JPG Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert iPhone HEIC photos to JPG right in your browser — no uploads, no accounts. Batch-convert whole camera rolls, tune quality, download as a ZIP. Free.',
		tagline: 'iPhone HEIC to JPG in your browser — photos never leave.',
		related: ['/compress-heic', '/compress-jpg', '/jpg-to-pdf', '/heic-to-png']
	},
	'heic-to-png': {
		ogImage: '/og/heic-to-png.jpg',
		preset: { kind: 'image', tab: 'heic', to: 'png', quality: 100 },
		accept: 'image/heic,image/heif,.heic,.heif',
		dropSubject: 'HEIC files',
		dropHint: 'iPhone HEIC photos · decoded to PNG locally',
		title: 'HEIC to PNG Converter — Lossless & Private | Compress Pro',
		description:
			'Convert iPhone HEIC photos to lossless PNG in your browser — batch whole albums, download as a ZIP, nothing uploaded. Ideal for editing and archiving.',
		tagline: 'iPhone HEIC decoded to lossless PNG — on your own device.',
		related: ['/heic-to-jpg', '/compress-heic', '/compress-png']
	},
	'heic-to-avif': {
		ogImage: '/og/heic-to-avif.jpg',
		preset: { kind: 'image', tab: 'heic', to: 'avif' },
		accept: 'image/heic,image/heif,.heic,.heif',
		dropSubject: 'HEIC files',
		dropHint: 'iPhone HEIC photos · converted to AVIF locally',
		title: 'HEIC to AVIF Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert iPhone HEIC photos to AVIF right in your browser — smaller than JPG and web-ready. Batch whole albums, download as a ZIP, zero uploads. Free.',
		tagline: 'iPhone HEIC to web-ready AVIF — converted on your device.',
		related: ['/heic-to-jpg', '/compress-heic', '/compress-avif']
	},
	'heic-to-webp': {
		ogImage: '/og/heic-to-webp.jpg',
		preset: { kind: 'image', tab: 'heic', to: 'webp' },
		accept: 'image/heic,image/heif,.heic,.heif',
		dropSubject: 'HEIC files',
		dropHint: 'iPhone HEIC photos · converted to WebP locally',
		title: 'HEIC to WebP Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert iPhone HEIC photos to WebP right in your browser — web-ready files at a fraction of JPG size. Batch whole albums, ZIP download, zero uploads.',
		tagline: 'iPhone HEIC photos to web-ready WebP — all on your device.',
		related: ['/heic-to-jpg', '/compress-heic', '/heic-to-avif']
	},
	'webp-to-jpg': {
		ogImage: '/og/webp-to-jpg.jpg',
		preset: { kind: 'image', tab: 'webp', to: 'jpg' },
		title: 'WebP to JPG Converter — Free, No Upload | Compress Pro',
		description:
			'Convert WebP images to JPG in your browser. Transparency is flattened to white, batches download as a ZIP, and files are never uploaded anywhere. Free.',
		tagline: 'WebP to JPG re-encoded locally — nothing ever uploaded.',
		related: ['/compress-webp', '/webp-to-png', '/avif-to-jpg']
	},
	'webp-to-png': {
		ogImage: '/og/webp-to-png.jpg',
		preset: { kind: 'image', tab: 'webp', to: 'png', quality: 100 },
		title: 'WebP to PNG Converter — Lossless, No Upload | Compress Pro',
		description:
			'Convert WebP to lossless PNG in your browser — transparency preserved, pixels untouched. Batch conversion with ZIP download. No uploads, no accounts. Free.',
		tagline: 'WebP to lossless PNG in your browser — files stay local.',
		related: ['/webp-to-jpg', '/compress-png', '/png-to-webp']
	},
	'gif-to-webp': {
		ogImage: '/og/gif-to-webp.jpg',
		preset: { kind: 'image', tab: 'gif', to: 'webp' },
		dropSubject: 'GIF files',
		dropHint: 'Animated GIFs · re-encoded to WebP locally',
		title: 'GIF to WebP Converter — Keep the Animation | Compress Pro',
		description:
			'Convert animated GIFs to WebP right in your browser — the animation survives and files land 50–70% smaller. Batch conversion, ZIP download, no uploads.',
		tagline: 'GIFs re-encoded to animated WebP, 50–70% smaller — local.',
		related: ['/compress-gif', '/compress-webp', '/gif-to-mp4']
	},
	'avif-to-jpg': {
		ogImage: '/og/avif-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/avif,.avif',
		dropSubject: 'AVIF files',
		dropHint: 'AVIF only · multiple files supported',
		title: 'AVIF to JPG Converter — Private, In-Browser | Compress Pro',
		description:
			'Convert AVIF images to JPG locally in your browser — perfect when an app or site cannot open AVIF yet. Batch support, ZIP download, zero uploads. Free.',
		tagline: 'AVIF decoded to JPG in your browser — nothing uploaded.',
		related: ['/compress-jpg', '/jpg-to-webp', '/webp-to-jpg']
	},
	'avif-to-png': {
		ogImage: '/og/avif-to-png.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'png', quality: 100 },
		accept: 'image/avif,.avif',
		dropSubject: 'AVIF files',
		dropHint: 'AVIF only · decoded to PNG locally',
		title: 'AVIF to PNG Converter — Lossless & Private | Compress Pro',
		description:
			'Convert AVIF images to lossless PNG in your browser — transparency preserved, pixels untouched. Batch support with ZIP download, zero uploads. Free.',
		tagline: 'AVIF decoded to lossless PNG — right on your own device.',
		related: ['/avif-to-jpg', '/compress-png', '/compress-avif']
	},
	'jpg-to-avif': {
		ogImage: '/og/jpg-to-avif.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'avif' },
		title: 'JPG to AVIF Converter — Smaller Files, Private | Compress Pro',
		description:
			'Convert JPG photos to AVIF right in your browser — often 30–50% smaller than the JPG at the same visual quality. Batch conversion, ZIP download, no uploads.',
		tagline: 'JPG to AVIF, up to half the size — all in your browser.',
		related: ['/compress-avif', '/avif-to-jpg', '/jpg-to-webp']
	},
	'png-to-avif': {
		ogImage: '/og/png-to-avif.jpg',
		preset: { kind: 'image', tab: 'png', to: 'avif' },
		title: 'PNG to AVIF Converter — Keep Alpha, No Upload | Compress Pro',
		description:
			'Convert PNG to AVIF in your browser and keep full transparency. Graphics and screenshots shrink dramatically, and nothing is ever uploaded. Free & private.',
		tagline: 'PNG to AVIF with transparency kept — converted locally.',
		related: ['/compress-png', '/png-to-webp', '/compress-avif']
	},
	'png-to-svg': {
		ogImage: '/og/png-to-svg.jpg',
		preset: { kind: 'image', tab: 'png', to: 'svg' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG logos & graphics · vectorized locally',
		title: 'PNG to SVG Converter — Vectorize Images | Compress Pro',
		description:
			'Convert PNG logos and graphics to true vector SVG right in your browser — color or black & white tracing, batch support, nothing uploaded. Free.',
		tagline: 'PNG traced into real vector paths — all in your browser.',
		related: ['/jpg-to-svg', '/compress-svg', '/svg-to-png']
	},
	'jpg-to-svg': {
		ogImage: '/og/jpg-to-svg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'svg' },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG logos & drawings · vectorized locally',
		title: 'JPG to SVG Converter — Vectorize Images | Compress Pro',
		description:
			'Convert JPG images to vector SVG right in your browser — trace logos and drawings into scalable paths, in color or black & white. No uploads. Free.',
		tagline: 'JPG traced into scalable vector paths — right on-device.',
		related: ['/png-to-svg', '/compress-svg', '/compress-jpg']
	},
	'webp-to-avif': {
		ogImage: '/og/webp-to-avif.jpg',
		preset: { kind: 'image', tab: 'webp', to: 'avif' },
		title: 'WebP to AVIF Converter — Free, No Upload | Compress Pro',
		description:
			'Convert WebP images to AVIF right in your browser — the next step down in size at the same visual quality. Transparency survives, nothing is uploaded. Free.',
		tagline: 'WebP re-encoded to smaller AVIF — right in your browser.',
		related: ['/compress-webp', '/jpg-to-avif', '/avif-to-jpg']
	},
	'png-to-jpg': {
		ogImage: '/og/png-to-jpg.jpg',
		preset: { kind: 'image', tab: 'png', to: 'jpg' },
		title: 'PNG to JPG Converter — Batch, No Upload | Compress Pro',
		description:
			'Convert PNG images to JPG right in your browser. Transparency flattens to white, photos get dramatically smaller, and nothing is uploaded. Free & private.',
		tagline: 'PNG to JPG converted in your browser — files stay local.',
		related: ['/compress-png', '/png-to-webp', '/compress-jpg']
	},
	'jpg-to-webp': {
		ogImage: '/og/jpg-to-webp.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'webp' },
		title: 'JPG to WebP Converter — Smaller Files, Private | Compress Pro',
		description:
			'Convert JPG photos to WebP right in your browser — typically 25–35% smaller at the same visual quality. Batch conversion, ZIP download, no uploads. Free.',
		tagline: 'JPG to WebP, typically 30% smaller — all in your browser.',
		related: ['/compress-jpg', '/compress-webp', '/png-to-webp']
	},
	'png-to-webp': {
		ogImage: '/og/png-to-webp.jpg',
		preset: { kind: 'image', tab: 'png', to: 'webp' },
		title: 'PNG to WebP Converter — Keep Alpha, No Upload | Compress Pro',
		description:
			'Convert PNG to WebP in your browser and keep full transparency. Graphics shrink dramatically, batches download as a ZIP, and nothing is uploaded. Free.',
		tagline: 'PNG to WebP with transparency kept — converted locally.',
		related: ['/compress-png', '/jpg-to-webp', '/webp-to-png']
	},
	'bmp-to-jpg': {
		ogImage: '/og/bmp-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/bmp,.bmp',
		dropSubject: 'BMP files',
		dropHint: 'BMP bitmaps · converted to JPG locally',
		title: 'BMP to JPG Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert BMP images to JPG in your browser — typically 10–20× smaller. Drop the files, download the JPGs; nothing is uploaded. Free and unlimited.',
		tagline: 'Turn bulky BMP bitmaps into small JPGs — in your browser.',
		related: ['/compress-jpg', '/png-to-jpg', '/tiff-to-jpg']
	},
	'bmp-to-png': {
		ogImage: '/og/bmp-to-png.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'png', quality: 100 },
		accept: 'image/bmp,.bmp',
		dropSubject: 'BMP files',
		dropHint: 'BMP bitmaps · converted to lossless PNG locally',
		title: 'BMP to PNG Converter — Lossless, No Upload | Compress Pro',
		description:
			'Convert BMP bitmaps to lossless PNG in your browser — same pixels at a fraction of the size, transparency kept. Batch support, nothing uploaded. Free.',
		tagline: 'Raw BMP bitmaps into tidy lossless PNGs — all in-browser.',
		related: ['/bmp-to-jpg', '/compress-png', '/tiff-to-png']
	},
	'tiff-to-jpg': {
		ogImage: '/og/tiff-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/tiff,.tif,.tiff',
		dropSubject: 'TIFF files',
		dropHint: 'TIFF scans & photos · converted to JPG locally',
		title: 'TIFF to JPG Converter — Free & Private | Compress Pro',
		description:
			'Convert TIFF scans and photos to JPG in your browser — no upload, no size limits. Multi-page TIFFs keep the first page. Free, private, unlimited.',
		tagline: 'Scanner TIFFs become shareable JPGs — locally, for free.',
		related: ['/compress-jpg', '/jpg-to-pdf', '/bmp-to-jpg']
	},
	'tiff-to-png': {
		ogImage: '/og/tiff-to-png.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'png', quality: 100 },
		accept: 'image/tiff,.tif,.tiff',
		dropSubject: 'TIFF files',
		dropHint: 'TIFF scans · converted to lossless PNG locally',
		title: 'TIFF to PNG Converter — Lossless & Private | Compress Pro',
		description:
			'Convert TIFF scans and photos to lossless PNG in your browser — pixels untouched, no upload, no size limits. Multi-page TIFFs keep the first page. Free.',
		tagline: 'Scanner TIFFs to lossless PNG — right on your own device.',
		related: ['/tiff-to-jpg', '/compress-png', '/bmp-to-png']
	},
	'raw-to-jpg': {
		ogImage: '/og/raw-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept:
			'image/x-adobe-dng,image/x-canon-cr2,image/x-nikon-nef,image/x-sony-arw,.cr2,.nef,.arw,.dng,.raf,.rw2,.orf',
		dropSubject: 'RAW files',
		dropHint: 'CR2, NEF, ARW, DNG & more · developed locally',
		title: 'RAW to JPG Converter — CR2, NEF, ARW, DNG | Compress Pro',
		description:
			'Convert camera RAW photos to JPG right in your browser — CR2, NEF, ARW, DNG and more, demosaiced locally by LibRaw. No uploads, no sign-up. Free.',
		tagline: 'Camera RAW developed into JPGs — right on your own device.',
		related: ['/cr2-to-jpg', '/dng-to-jpg', '/compress-jpg']
	},
	'cr2-to-jpg': {
		ogImage: '/og/cr2-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/x-canon-cr2,.cr2',
		dropSubject: 'CR2 files',
		dropHint: 'Canon CR2 RAW · developed to JPG locally',
		title: 'CR2 to JPG Converter — Canon RAW, Private | Compress Pro',
		description:
			'Convert Canon CR2 RAW photos to JPG in your browser — demosaiced locally with LibRaw, never uploaded. Batch whole shoots, download as a ZIP. Free.',
		tagline: 'Canon CR2 RAW developed to JPG — photos never leave home.',
		related: ['/raw-to-jpg', '/nef-to-jpg', '/compress-jpg']
	},
	'nef-to-jpg': {
		ogImage: '/og/nef-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/x-nikon-nef,.nef',
		dropSubject: 'NEF files',
		dropHint: 'Nikon NEF RAW · developed to JPG locally',
		title: 'NEF to JPG Converter — Nikon RAW, Private | Compress Pro',
		description:
			'Convert Nikon NEF RAW photos to JPG right in your browser — decoded locally, nothing uploaded. Batch conversion with ZIP download, no sign-up. Free.',
		tagline: 'Nikon NEF RAW developed to JPG — all on your own device.',
		related: ['/raw-to-jpg', '/cr2-to-jpg', '/compress-jpg']
	},
	'arw-to-jpg': {
		ogImage: '/og/arw-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/x-sony-arw,.arw',
		dropSubject: 'ARW files',
		dropHint: 'Sony ARW RAW · developed to JPG locally',
		title: 'ARW to JPG Converter — Sony RAW, Private | Compress Pro',
		description:
			'Convert Sony ARW RAW photos to JPG in your browser — demosaiced on your device, never uploaded. Batch whole shoots, tune quality, download a ZIP. Free.',
		tagline: 'Sony ARW RAW developed to JPG — nothing is ever uploaded.',
		related: ['/raw-to-jpg', '/dng-to-jpg', '/compress-jpg']
	},
	'dng-to-jpg': {
		ogImage: '/og/dng-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg' },
		accept: 'image/x-adobe-dng,.dng',
		dropSubject: 'DNG files',
		dropHint: 'Adobe DNG RAW · developed to JPG locally',
		title: 'DNG to JPG Converter — Adobe RAW, Private | Compress Pro',
		description:
			'Convert DNG photos to JPG right in your browser — Adobe’s universal RAW format, decoded locally by LibRaw. Batch support, ZIP download, no uploads.',
		tagline: 'DNG negatives developed into JPGs — right in your browser.',
		related: ['/raw-to-jpg', '/compress-jpg', '/jpg-to-webp']
	},
	'png-to-ico': {
		ogImage: '/og/png-to-ico.jpg',
		preset: { kind: 'image', tab: 'png', to: 'ico' },
		accept: 'image/png,.png',
		dropSubject: 'PNG files',
		dropHint: 'PNG logos · turned into a multi-size favicon',
		title: 'PNG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert PNG to a multi-size ICO favicon (16–256 px) right in your browser. Transparency is preserved and nothing gets uploaded. Free and unlimited.',
		tagline: 'Turn a PNG into a multi-size favicon ICO, in your browser.',
		related: ['/compress-png', '/webp-to-png', '/jpg-to-ico', '/svg-to-ico']
	},
	'jpg-to-ico': {
		ogImage: '/og/jpg-to-ico.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'ico' },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG logos & photos · turned into a multi-size favicon',
		title: 'JPG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert JPG to a multi-size ICO favicon (16–256 px) right in your browser. Non-square photos are centered and nothing gets uploaded. Free and unlimited.',
		tagline: 'Turn a JPG logo into a multi-size favicon ICO — locally.',
		related: ['/png-to-ico', '/svg-to-ico', '/compress-jpg']
	},
	'svg-to-png': {
		ogImage: '/og/svg-to-png.jpg',
		preset: { kind: 'svg', to: 'png' },
		accept: 'image/svg+xml,.svg',
		dropSubject: 'SVG files',
		dropHint: 'SVG artwork · rendered to PNG locally',
		title: 'SVG to PNG Converter — Free & Private | Compress Pro',
		description:
			'Convert SVG to PNG right in your browser — pick the output size, keep transparency, and batch-convert files. No uploads, no limits. Free and private.',
		tagline: 'Crisp PNGs from SVG at any size — right in your browser.',
		related: ['/compress-svg', '/svg-to-ico', '/compress-png']
	},
	'svg-to-ico': {
		ogImage: '/og/svg-to-ico.jpg',
		preset: { kind: 'svg', to: 'ico' },
		accept: 'image/svg+xml,.svg',
		dropSubject: 'SVG files',
		dropHint: 'SVG logos · turned into a multi-size favicon',
		title: 'SVG to ICO Converter — Favicon Generator | Compress Pro',
		description:
			'Convert an SVG logo to a multi-size ICO favicon (16–256 px) in your browser. Vector sharpness at every size, nothing uploaded. Free and unlimited.',
		tagline: 'Vector-sharp favicons — SVG to a multi-size ICO, locally.',
		related: ['/png-to-ico', '/svg-to-png', '/compress-svg']
	},
	'resize-image': {
		ogImage: '/og/resize-image.jpg',
		preset: { kind: 'resize', maxDimension: 1920 },
		accept:
			'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif',
		dropSubject: 'images',
		dropHint: 'JPG, PNG, WebP, GIF & HEIC · resized locally',
		title: 'Resize Images Online — Fast, Private, No Upload | Compress Pro',
		description:
			'Resize images right in your browser — set a longest-side limit like 1920 px and photos scale down with their aspect ratio intact. No uploads, no limits. Free.',
		tagline: 'Downscale photos to any pixel size — all in your browser.',
		related: ['/compress-jpg', '/compress-png', '/compress-heic']
	},
	'compress-image': {
		ogImage: '/og/compress-image.jpg',
		preset: { kind: 'image-any' },
		accept:
			'image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic,.heif',
		dropSubject: 'images',
		dropHint: 'JPG, PNG, WebP, GIF, HEIC & AVIF · compressed locally',
		title: 'Image Compressor — Free & Private, No Upload | Compress Pro',
		description:
			'Free image compressor that runs in your browser. Compress JPG, PNG, WebP, GIF, HEIC or AVIF — pick a quality or an exact target size. No uploads, no ads.',
		tagline: 'JPG, PNG, WebP, HEIC & more — compressed on your device.',
		related: ['/compress-jpg', '/compress-png', '/compress-heic', '/resize-image']
	},
	'compress-jpg-to-100kb': {
		ogImage: '/og/compress-jpg-to-100kb.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg', mode: 'target', targetKb: 100 },
		accept: 'image/jpeg,.jpg,.jpeg',
		dropSubject: 'JPG files',
		dropHint: 'JPG photos · squeezed under 100 KB locally',
		title: 'Compress JPEG to 100 KB Online — Free & Private | Compress Pro',
		description:
			'Compress JPG (JPEG) photos to 100 KB right in your browser — target-size mode finds the best quality that fits under the cap. No uploads, no ads. Free.',
		tagline: 'JPG photos squeezed under 100 KB — right in your browser.',
		related: ['/compress-jpg', '/resize-image', '/compress-image']
	},
	'psd-to-jpg': {
		ogImage: '/og/psd-to-jpg.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jpg', quality: 90 },
		accept: 'image/vnd.adobe.photoshop,.psd',
		dropSubject: 'PSD files',
		dropHint: 'Photoshop files · flattened locally',
		title: 'PSD to JPG Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert Photoshop PSD files to JPG right in your browser — the flattened image, decoded and saved on your device. No uploads, no accounts. Free.',
		tagline: 'Photoshop files opened as JPG — right on your own device.',
		related: ['/psd-to-png', '/compress-jpg', '/tiff-to-jpg']
	},
	'psd-to-png': {
		ogImage: '/og/psd-to-png.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'png', quality: 100 },
		accept: 'image/vnd.adobe.photoshop,.psd',
		dropSubject: 'PSD files',
		dropHint: 'Photoshop files · transparency kept',
		title: 'PSD to PNG Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert Photoshop PSD files to lossless PNG right in your browser — transparency kept, nothing uploaded. Batch files, download a ZIP. Free, private.',
		tagline: 'PSD flattened to a lossless PNG — nothing gets uploaded.',
		related: ['/psd-to-jpg', '/compress-png', '/png-to-webp']
	},
	'jxl-to-jpg': {
		ogImage: '/og/jxl-to-jpg.jpg',
		// quality 90: the source is an archival format — coming OUT of it
		// should default to a faithful copy, not the everyday-web setting.
		preset: { kind: 'image', tab: 'jpg', to: 'jpg', quality: 90 },
		accept: 'image/jxl,.jxl',
		dropSubject: 'JXL files',
		dropHint: 'JPEG XL · decoded locally',
		title: 'JXL to JPG Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert JPEG XL images to universal JPG right in your browser — nothing is uploaded. Batch files, adjust quality, download a ZIP. Free, no accounts.',
		tagline: 'JXL opened and saved as JPG — right on your own device.',
		related: ['/jpg-to-jxl', '/compress-jxl', '/avif-to-jpg']
	},
	'jpg-to-jxl': {
		ogImage: '/og/jpg-to-jxl.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jxl' },
		title: 'JPG to JXL Converter — JPEG XL, No Upload | Compress Pro',
		description:
			'Convert JPG photos to JPEG XL right in your browser — typically 20–40% smaller at the same quality. Batch conversion, no uploads, free, no limits.',
		tagline: 'JPG to JPEG XL on your device — smaller, nothing uploaded.',
		related: ['/jxl-to-jpg', '/compress-jxl', '/jpg-to-avif']
	},
	'compress-jxl': {
		ogImage: '/og/compress-jxl.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'jxl' },
		accept: 'image/jxl,.jxl',
		dropSubject: 'JXL files',
		dropHint: 'JPEG XL · re-encoded locally',
		title: 'Compress JXL Online — JPEG XL, No Upload | Compress Pro',
		description:
			'Compress JPEG XL images right in your browser — pick a quality or an exact target size and re-encode locally. No uploads, no accounts. Free and private.',
		tagline: 'Smaller JXL files made locally — nothing ever uploaded.',
		related: ['/jpg-to-jxl', '/jxl-to-jpg', '/compress-image']
	},
	'compress-avif': {
		ogImage: '/og/compress-avif.jpg',
		preset: { kind: 'image', tab: 'jpg', to: 'avif' },
		accept: 'image/avif,.avif',
		dropSubject: 'AVIF files',
		dropHint: 'AVIF images · recompressed locally',
		title: 'Compress AVIF Online — Private, No Upload | Compress Pro',
		description:
			'Compress AVIF images right in your browser — pick a quality or an exact target size and re-encode locally. No uploads, no accounts. Free and private.',
		tagline: 'Smaller AVIF files in your browser — nothing is uploaded.',
		related: ['/jpg-to-avif', '/avif-to-jpg', '/compress-image']
	},
	'image-to-text': {
		ogImage: '/og/image-to-text.jpg',
		title: 'Image to Text (OCR) — Free, Private, Local | Compress Pro',
		description:
			'Extract text from images right in your browser — Tesseract OCR in 8 languages, run entirely on your device. No uploads, no accounts, no limits. Free.',
		tagline: 'Words read out of images, right on your device — free OCR.',
		related: ['/ocr-pdf', '/remove-exif', '/compress-image']
	},
	'ocr-pdf': {
		ogImage: '/og/ocr-pdf.jpg',
		preset: { kind: 'ocr', op: 'toPdf' },
		accept: 'application/pdf,.pdf',
		dropSubject: 'PDF files',
		dropHint: 'Scanned PDFs · recognized locally',
		title: 'OCR PDF — Make Scanned PDFs Searchable | Compress Pro',
		description:
			'Make scanned PDFs searchable right in your browser — an invisible text layer is added over the original pages. Local Tesseract OCR, zero uploads. Free.',
		tagline: 'Scanned PDFs become searchable — all recognized on-device.',
		related: ['/image-to-text', '/compress-pdf', '/merge-pdf']
	}
};
