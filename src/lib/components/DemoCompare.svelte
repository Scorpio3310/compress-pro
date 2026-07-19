<script lang="ts">
	import statsJson from '$lib/demo-stats.json';
	import { formatBytes } from '$lib/utils';
	import { resolve } from '$app/paths';
	import { OCR_LANGUAGES, type DemoKind, type DemoStats } from '$lib/types';
	import ImageSlider from './ImageSlider.svelte';

	// font: the specimen is rendered BY the converted WOFF2 — loaded under a
	// unique family via the FontFace API (no CSS injection, CSP-safe). The
	// serif fallback makes a load failure visible instead of silently falling
	// back to the site's own copy of the same typeface.
	const DEMO_FONT_FAMILY = 'Compress Pro Font Demo';
	$effect(() => {
		if (kind !== 'font' || !afterSrc || typeof document === 'undefined') return;
		const face = new FontFace(DEMO_FONT_FAMILY, `url(${afterSrc}) format('woff2-variations')`, {
			weight: '200 800'
		});
		let cancelled = false;
		face.load().then(
			(loaded) => {
				if (!cancelled) document.fonts.add(loaded);
			},
			() => {
				// The serif fallback IS the failure signal — an unhandled
				// rejection here would only add console noise.
			}
		);
		return () => {
			// document.fonts is a document-global Set keyed by OBJECT identity —
			// without delete, every visit to the demo stacks another decoded copy.
			cancelled = true;
			document.fonts.delete(face);
		};
	});

	// Static before/after proof. Everything shown here — images AND numbers —
	// comes from `pnpm demo-assets`, which runs each source file through the
	// REAL tool page and writes the manifest + display assets together, so a
	// page can never show numbers that drifted from the shipped images.
	// Honesty rule: a kind renders only on the page whose pipeline produced it
	// (seo.test.ts pins the kind↔page map).

	interface Props {
		kind?: DemoKind;
		/** Render the home-style microlabel + statement heading above the demo. */
		hero?: boolean;
	}

	let { kind = 'photo', hero = false }: Props = $props();

	const ALL = statsJson as Record<DemoKind, DemoStats>;
	// Globbed so the module tracks whatever `pnpm demo-assets` produced —
	// URL strings are free; only the rendered pair's images actually load.
	const ASSET_URLS = import.meta.glob('$lib/assets/demo/*', {
		eager: true,
		query: '?url',
		import: 'default'
	}) as Record<string, string>;
	// Soft-missing (undefined hides the section via the guard below) so a page
	// stays alive mid-regeneration — the generator itself must be able to
	// drive a page whose old assets were just deleted. demo-stats.test.ts is
	// what guarantees production completeness.
	const assetUrl = (file: string) =>
		Object.entries(ASSET_URLS).find(([path]) => path.endsWith('/' + file))?.[1];

	// Undefined while a kind's assets haven't been generated yet — the whole
	// section stays hidden then (demo-stats.test.ts requires every kind in the
	// committed manifest, so production can never silently miss one).
	const stats = $derived(ALL[kind] as DemoStats | undefined);
	const beforeSrc = $derived(stats && assetUrl(stats.display.before));
	const afterSrc = $derived(stats && assetUrl(stats.display.after));

	// Kinds that render without a display-asset pair: archive/subtitle/data/
	// merge are tables and text panels straight from the manifest; ocr anchors
	// on the scan alone — its "after" side is the recognized text.
	const hasDisplay = $derived(
		kind === 'archive' || kind === 'subtitle' || kind === 'data' || kind === 'merge'
			? true
			: kind === 'ocr'
				? !!beforeSrc
				: !!(beforeSrc && afterSrc)
	);

	// Slider corner labels — heic flips format mid-run, say so right on the image.
	const beforeLabel = $derived(
		!stats
			? ''
			: stats.formatChanged
				? `${stats.input.name.split('.').pop()!.toUpperCase()} — ${formatBytes(stats.originalBytes)}`
				: `Original — ${formatBytes(stats.originalBytes)}`
	);
	const afterLabel = $derived(
		!stats
			? ''
			: stats.formatChanged
				? `${stats.outputFormat.toUpperCase()} — ${formatBytes(stats.compressedBytes)}`
				: `Compressed — ${formatBytes(stats.compressedBytes)}`
	);

	const CARDS = $derived.by(() => {
		if (!stats) return [];
		// archive compares two containers; exif's story is fields, not bytes.
		if (kind === 'archive' && stats.display.archive) {
			return [
				{ label: 'Folder', value: formatBytes(stats.originalBytes), emphasize: false },
				{ label: 'ZIP', value: formatBytes(stats.display.archive.zipBytes), emphasize: false },
				{ label: '7Z', value: formatBytes(stats.compressedBytes), emphasize: true }
			];
		}
		if (kind === 'exif' && stats.display.metadata) {
			return [
				{
					label: 'Metadata fields',
					value: `${stats.display.metadata.fields} → 0`,
					emphasize: true
				},
				{ label: 'Pixels changed', value: '0', emphasize: false },
				{ label: 'Size', value: `−${stats.savingsPercent}%`, emphasize: false }
			];
		}
		// ocr/subtitle/data tell structure stories, not byte stories — a picture
		// became text, a dialect flipped, rows became real cells.
		if (kind === 'ocr' && stats.display.ocr) {
			const o = stats.display.ocr;
			return [
				{ label: 'Words recognized', value: o.words.toLocaleString('en-US'), emphasize: true },
				{
					label: 'Language',
					value: OCR_LANGUAGES.find((l) => l.code === o.lang)?.label ?? o.lang.toUpperCase(),
					emphasize: false
				},
				{ label: 'Output', value: `.txt — ${formatBytes(stats.compressedBytes)}`, emphasize: false }
			];
		}
		if (kind === 'subtitle' && stats.display.subtitle) {
			const sub = stats.display.subtitle;
			return [
				{ label: 'Cues', value: String(sub.cues), emphasize: false },
				{
					label: 'Format',
					value: `${sub.from.toUpperCase()} → ${sub.to.toUpperCase()}`,
					emphasize: true
				},
				{
					label: 'Size',
					value: `${formatBytes(stats.originalBytes)} → ${formatBytes(stats.compressedBytes)}`,
					emphasize: false
				}
			];
		}
		if (kind === 'data' && stats.display.sheet) {
			const rows = stats.display.sheet.rows;
			return [
				{ label: 'Rows', value: String(rows.length), emphasize: false },
				{ label: 'Columns', value: String(rows[0]?.length ?? 0), emphasize: false },
				{ label: 'Format', value: 'CSV → XLSX', emphasize: true }
			];
		}
		if (kind === 'merge' && stats.display.merge) {
			const m = stats.display.merge;
			return [
				{ label: 'Files', value: `${m.files.length} → 1`, emphasize: true },
				{
					label: 'Pages',
					value: `${m.files.map((f) => f.pages).join(' + ')} → ${m.pages}`,
					emphasize: false
				},
				{ label: 'Size', value: formatBytes(stats.compressedBytes), emphasize: false }
			];
		}
		// webp-to-jpg trades bytes for compatibility — a −% card would show 0
		// (savingsPercent clamps); the format flip IS the story.
		if (kind === 'webp-to-jpg') {
			return [
				{ label: 'Format', value: 'WEBP → JPG', emphasize: true },
				{
					label: 'Size',
					value: `${formatBytes(stats.originalBytes)} → ${formatBytes(stats.compressedBytes)}`,
					emphasize: false
				},
				{ label: 'Opens', value: 'Everywhere', emphasize: false }
			];
		}
		return [
			{ label: 'Original', value: formatBytes(stats.originalBytes), emphasize: false },
			{ label: 'Compressed', value: formatBytes(stats.compressedBytes), emphasize: false },
			{ label: 'Saved', value: `−${stats.savingsPercent}%`, emphasize: true }
		];
	});

	// Per-kind copy: everything numeric interpolates from the manifest — copy
	// edits never require regenerating assets. Engine names must stay
	// consistent with each page's "Under the hood" section (test-enforced).
	// Built lazily from the CURRENT kind's stats only, so pages keep working
	// while other kinds' manifest entries don't exist yet.
	type Copy = {
		toolName: string;
		lede: string;
		body: string;
		beforeAlt: string;
		afterAlt: string;
		/** Lead-in of the credit line ("Photo by …"); empty when the credit is
		 *  a work citation rather than an author credit (pdf). */
		creditPrefix: string;
	};
	function buildCopy(k: DemoKind, s: DemoStats): Copy {
		const orig = formatBytes(s.originalBytes);
		const comp = formatBytes(s.compressedBytes);
		switch (k) {
			case 'photo':
				return {
					creditPrefix: 'Photo by',
					toolName: 'Compress JPG',
					lede: `this ${s.input.megapixels}-megapixel photo (${s.input.width} × ${s.input.height}) went through the`,
					body: `tool — MozJPEG at quality ${s.quality} — and dropped from ${orig} to ${comp}. What you're dragging is a 100% detail crop of both files, so any compression artifacts would be visible at full size; the byte counts refer to the complete files. Drop the same photo in yourself and you'll get the same number.`,
					beforeAlt: `Detail crop of the original ${s.input.megapixels}-megapixel photo: an alpine meadow below the Langkofel peaks in hazy morning light, at 100% zoom`,
					afterAlt: `The same detail after compression to JPG at quality ${s.quality} — visually near-identical`
				};
			case 'png':
				return {
					creditPrefix: 'Artwork by',
					toolName: 'Compress PNG',
					lede: `this ${s.input.width} × ${s.input.height} watercolor illustration went through the`,
					body: `tool — libimagequant palette quantization at quality ${s.quality}, repacked by OxiPNG — and dropped from ${orig} to ${comp}. What you're dragging is a 100% detail crop of both files, delivered identically on both sides, so the dithering the palette produced shows plainly; the byte counts refer to the complete files.`,
					beforeAlt: `Detail crop of the original watercolor mountain illustration at 100% zoom`,
					afterAlt: `The same detail after palette quantization at quality ${s.quality} — visually near-identical`
				};
			case 'webp':
				return {
					creditPrefix: 'Photo by',
					toolName: 'Compress WebP',
					lede: `this ${s.input.megapixels}-megapixel WebP photo went through the`,
					body: `tool — libwebp, Google's reference encoder, at quality ${s.quality} — and dropped from ${orig} to ${comp}. What you're dragging is a 100% detail crop of both files, delivered as WebP; the byte counts refer to the complete files. Drop the same photo in yourself and you'll get the same number.`,
					beforeAlt: `Detail crop of the original ${s.input.megapixels}-megapixel WebP photo: a rugged mountain ridge before snow-capped peaks, at 100% zoom`,
					afterAlt: `The same detail after WebP compression at quality ${s.quality} — visually near-identical`
				};
			case 'heic':
				return {
					creditPrefix: 'Photo by',
					toolName: 'Compress HEIC',
					lede: `this ${s.input.megapixels}-megapixel HEIC went through the`,
					body: `tool — decoded by libheif, re-encoded by MozJPEG at quality ${s.quality} — and dropped from ${orig} (HEIC) to ${comp} (JPG). Browsers can open HEIC but not save it, so the output is a universal JPG — the format change is part of the result. The slider shows a 100% detail crop of both files; the byte counts refer to the complete files.`,
					beforeAlt: `Detail crop of the original ${s.input.megapixels}-megapixel HEIC photo of colorful sewing thread spools, at 100% zoom`,
					afterAlt: `The same detail after conversion to JPG at quality ${s.quality} — visually near-identical`
				};
			case 'merge': {
				const m = s.display.merge;
				const parts = m?.files.map((f) => f.pages).join(' and ') ?? '';
				return {
					creditPrefix: '',
					toolName: 'Merge PDF',
					lede: `these two documents — ${parts} pages — went through the`,
					body: `tool and came out as one ${m?.pages}-page PDF, assembled by pdf-lib on your device. Pages are copied structurally — nothing is re-encoded, so text and images stay byte-identical to their sources. The order you add them is the page order; drop your own files in and the table above is exactly what you'll see.`,
					beforeAlt: '',
					afterAlt: ''
				};
			}
			case 'png-to-webp':
				return {
					creditPrefix: 'Artwork by',
					toolName: 'PNG to WebP',
					lede: `this ${s.input.width} × ${s.input.height} watercolor illustration went through the`,
					body: `converter — libwebp at quality ${s.quality} — and dropped from ${orig} (PNG) to ${comp} (WebP), with alpha support intact where a PNG carries it. What you're dragging is a 100% detail crop of both files, delivered identically on both sides; the byte counts refer to the complete files.`,
					beforeAlt: `Detail crop of the original watercolor mountain illustration PNG at 100% zoom`,
					afterAlt: `The same detail after conversion to WebP at quality ${s.quality} — visually near-identical`
				};
			case 'jpg-to-webp':
				return {
					creditPrefix: 'Photo by',
					toolName: 'JPG to WebP',
					lede: `this ${s.input.megapixels}-megapixel JPG (${s.input.width} × ${s.input.height}) went through the`,
					body: `converter — libwebp at quality ${s.quality} — and dropped from ${orig} (JPG) to ${comp} (WebP): the class of savings WebP was built for, at matching visual quality. What you're dragging is a 100% detail crop of both files; the byte counts refer to the complete files. Drop the same photo in yourself and you'll get the same number.`,
					beforeAlt: `Detail crop of the original ${s.input.megapixels}-megapixel JPG: an alpine meadow below the Langkofel peaks in hazy morning light, at 100% zoom`,
					afterAlt: `The same detail after conversion to WebP at quality ${s.quality} — visually near-identical`
				};
			case 'webp-to-jpg':
				return {
					creditPrefix: 'Photo by',
					toolName: 'WebP to JPG',
					lede: `this ${s.input.megapixels}-megapixel WebP went through the`,
					body: `converter — MozJPEG at quality ${s.quality} — and came out as a JPG that opens absolutely everywhere: ${orig} (WebP) in, ${comp} (JPG) out. A ${s.input.megapixels}-megapixel JPG legitimately spends more bytes than the lossy WebP it came from — this trip buys compatibility, not size. The slider is a 100% detail crop of both files; the byte counts refer to the complete files.`,
					beforeAlt: `Detail crop of the original ${s.input.megapixels}-megapixel WebP photo: a rugged mountain ridge before snow-capped peaks, at 100% zoom`,
					afterAlt: `The same detail after conversion to JPG at quality ${s.quality} — visually identical, universally openable`
				};
			case 'resize':
				return {
					creditPrefix: 'Photo by',
					toolName: 'Resize Image',
					lede: `this ${s.input.megapixels}-megapixel photo (${s.input.width} × ${s.input.height}) went through the`,
					body: `tool with a ${s.maxDimension} px cap — resized first, then re-encoded by MozJPEG at quality ${s.quality} — and collapsed from ${orig} to ${comp}. The aspect ratio stays exact. Both sides of the slider are shown at the output's scale (what any screen does with the original anyway), cropped 1:1, so what you're comparing is the honest on-screen difference; the byte counts refer to the complete files.`,
					beforeAlt: `Detail crop of the original ${s.input.megapixels}-megapixel photo shown at the resized scale: an alpine meadow below the Langkofel peaks, at 100% zoom`,
					afterAlt: `The same detail from the ${s.maxDimension} px resized JPG at quality ${s.quality} — the honest on-screen comparison`
				};
			case 'gif':
				return {
					creditPrefix: 'Animation by',
					toolName: 'Compress GIF',
					lede: `this ${s.input.width} × ${s.input.height} animated GIF (${s.display.frame?.ofFrames} frames) went through the`,
					body: `tool — gifsicle at quality ${s.quality} — and dropped from ${orig} to ${comp}. The slider compares the first frame of both files, delivered losslessly, so the palette change is exactly what the tool produced; the byte counts refer to the complete animations.`,
					beforeAlt: `First frame of the original animated GIF`,
					afterAlt: `First frame of the same animation after gifsicle optimization at quality ${s.quality}`
				};
			case 'svg':
				return {
					creditPrefix: 'Artwork by',
					toolName: 'Compress SVG',
					lede: `what you're dragging is the two actual SVG files — the original and the output of the`,
					body: `tool, SVGO with default settings — rendered live by your browser. Same pixels, ${s.savingsPercent}% fewer bytes: comments, editor metadata and excess coordinate precision are gone, and the file dropped from ${orig} to ${comp}. Drag all you like — nothing changes, which is the point.`,
					beforeAlt: `The original SVG file, rendered by your browser`,
					afterAlt: `The SVGO-minified SVG file — pixel-identical to the original`
				};
			case 'pdf': {
				const preset = s.level ? s.level[0].toUpperCase() + s.level.slice(1) : '';
				return {
					creditPrefix: '',
					toolName: 'Compress PDF',
					lede: `this ${s.input.pages}-page NASA reference guide — ${orig}, more than twice the ~25 MB e-mail attachment cap — went through the`,
					body: `tool — Ghostscript at the ${preset} preset — and came out at ${comp}, small enough to attach anywhere. What you're dragging is the same page of both documents, rendered at ${s.display.render?.dpi} DPI and cropped 1:1: the photos inside were downsampled to 150 DPI, while the text is vector data and stays razor-sharp — that's the trade every preset makes. The byte counts refer to the complete files; run the same guide through yourself and you'll get the same number.`,
					beforeAlt: `Detail crop of page ${s.display.render?.page} of the original ${s.input.pages}-page NASA SLS reference guide PDF, rendered at ${s.display.render?.dpi} DPI: body text beside a photo of NASA rocket hardware, at 100% zoom`,
					afterAlt: `The same page detail after the ${preset} preset — the photo re-encoded at 150 DPI and visibly softer, the text still perfectly sharp`
				};
			}
			case 'video':
				return {
					creditPrefix: 'Video by',
					toolName: 'Compress MP4',
					lede: `this ${s.input.width} × ${s.input.height} (4K), ${s.input.durationSec}-second MP4 clip went through the`,
					body: `tool — H.264 via WebCodecs, the encoder built into your browser, at quality ${s.quality} with a ${s.maxDimension} px cap, the guide's own website preset — and dropped from ${orig} to ${comp}. The slider compares the same frame of both files, ${Math.round((s.display.still?.atSec ?? 0) * 10) / 10} seconds in: the original at native 4K, the compressed clip scaled back up for like-for-like framing, so the slight softness you can find is the real cost of the 1080p trade. Quality ${s.quality} maps to a bitrate matched to the new resolution; the byte counts refer to the complete clips. Press play below to watch the result in motion — or drop the same video in yourself and you'll get the same number.`,
					beforeAlt: `Detail crop of one frame of the original ${s.input.width} × ${s.input.height} 4K MP4 video: a young woman filming herself with a smartphone on a selfie stick in a city street, at 100% zoom`,
					afterAlt: `The same frame after the resize to ${s.maxDimension} px and H.264 re-encoding at quality ${s.quality} — slightly softer, ${s.savingsPercent}% smaller`
				};
			case 'audio': {
				const total = Math.round(s.input.durationSec ?? 0);
				const len = `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
				return {
					creditPrefix: 'Music by',
					toolName: 'Compress Audio',
					lede: `this ${len} track went through the`,
					body: `tool — LAME, the canonical MP3 encoder, at ${s.bitrateKbps} kbps — and dropped from ${orig} to ${comp}. Both players hold the actual files, byte for byte. Press play and try to hear the difference — on most speakers you can't, and that's the point.`,
					// Audio renders players, not images — alts are unused.
					beforeAlt: '',
					afterAlt: ''
				};
			}
			case 'font':
				return {
					creditPrefix: 'Typeface by',
					toolName: 'Font Converter',
					lede: `the typeface this site is set in — Plus Jakarta Sans — went through the`,
					body: `tool as a desktop TTF and came out as WOFF2, packed by Google's woff2 encoder with Brotli inside: ${orig} down to ${comp}. The specimen below is rendered live by that exact output file. Same letterforms, byte for byte — just a much tighter wrapper for the web.`,
					beforeAlt: '',
					afterAlt: ''
				};
			case 'archive': {
				const n = s.display.archive?.entries.length ?? 0;
				const zip = formatBytes(s.display.archive?.zipBytes ?? 0);
				return {
					creditPrefix: '',
					toolName: 'archive tool',
					lede: `this folder — ${n} plain-text classics from Project Gutenberg, ${orig} together — went through the`,
					body: `twice: once as ZIP (deflate) and once as 7Z (LZMA2 — the real 7-Zip, compiled to WebAssembly). Same folder, two containers: ZIP lands at ${zip}, 7Z at ${comp}. Text is where archives shine — and the gap between the two numbers is exactly what switching the format pill buys you, measured live.`,
					beforeAlt: '',
					afterAlt: ''
				};
			}
			case 'exif':
				return {
					creditPrefix: 'Photo by',
					toolName: 'Remove EXIF',
					lede: `this photo of Lake Bled went through the`,
					body: `tool. The table shows what its metadata revealed before — the camera, the timestamp, and the exact GPS point where the shot was taken — and what's left afterwards: nothing. The pixels stay byte-identical; only the metadata is gone. (The location data was embedded the same way every phone camera embeds it into every shot.)`,
					beforeAlt: `Detail of the photo: the island church of Lake Bled, Slovenia, with Bled Castle on the cliff behind`,
					afterAlt: ''
				};
			case 'ocr': {
				const lang = OCR_LANGUAGES.find((l) => l.code === s.display.ocr?.lang)?.label ?? 'English';
				return {
					creditPrefix: 'Book by',
					toolName: 'Image to Text',
					lede: `the opening page of "A Scandal in Bohemia" — the 1892 first book edition of The Adventures of Sherlock Holmes — went through the`,
					body: `tool — Tesseract, the OCR engine that has read the world's paper for decades, compiled to WebAssembly — with the language set to ${lang}. The panel above is the verbatim output: ${s.display.ocr?.words.toLocaleString('en-US')} words of selectable, copyable text out of a flat scan, uncorrected. The Victorian body type comes out nearly flawless — "To Sherlock Holmes she is always the woman" and all; only the ornamental drop capital and the blackletter heading defeat the engine, which is the honest trade a 130-year-old page offers. Drop the same scan in yourself and you'll get the same text.`,
					beforeAlt: `Scan of the opening page of "A Scandal in Bohemia" from the 1892 first edition of The Adventures of Sherlock Holmes — the page the text below was recognized from`,
					afterAlt: ''
				};
			}
			case 'subtitle':
				return {
					creditPrefix: '',
					toolName: 'SRT to VTT',
					lede: `the ${s.display.subtitle?.cues}-cue SRT file on the left went through the`,
					body: `tool — a few hundred lines of pure JavaScript, no WebAssembly, no server — and came out as the WebVTT file on the right: same text, same timing, with the cue numbers dropped, the WEBVTT header added and the millisecond comma swapped for a dot. Both panels are the complete actual files, byte for byte — the entire dialect gap, visible in one glance.`,
					beforeAlt: '',
					afterAlt: ''
				};
			case 'ebook':
				return {
					creditPrefix: 'Book by',
					toolName: 'Compress EPUB',
					lede: `this illustrated children's classic — ${orig} with 29 of Beatrix Potter's watercolours, as it left Project Gutenberg — went through the`,
					body: `tool — MozJPEG and OxiPNG, the same engines as the image tabs, re-encoding every image while the container is rebuilt locally — and came out at ${comp}. What you're dragging is the same plate from inside both books, shown 1:1; the text is carried over byte-identical, and the byte counts refer to the complete files. A Gutenberg production is already optimized and still dropped ${s.savingsPercent}% — a typical export or DRM-free purchase has far more to give.`,
					beforeAlt: `The cover plate of the original EPUB, shown 1:1`,
					afterAlt: `The same plate after re-encoding at quality ${s.quality} — visually near-identical`
				};
			case 'model': {
				const m = s.display.model;
				const codec = m?.codec === 'meshopt' ? 'Meshopt' : 'Draco';
				return {
					creditPrefix: 'Model by',
					toolName: 'Compress GLB',
					lede: `this ${m ? Math.round(m.triangles / 100) / 10 + 'k-triangle ' : ''}photoscanned camera went through the`,
					body: `tool — glTF Transform with the ${codec} geometry codec compiled to WebAssembly, plus the Max texture size cap at ${m?.textureMaxDimension} px, the "usual culprit" fix the guide itself teaches — and dropped from ${orig} to ${comp}. Both sides of the slider are the same fixed-camera render of the actual files: every triangle survives${m ? `, all ${m.texturesTotal} textures re-encoded` : ''}, only the bytes leave. Drag away — any softness you can find is the texture cap at work, not the geometry.`,
					beforeAlt: `Render of the original 3D camera model at a fixed camera angle`,
					afterAlt: `Render of the same model after Draco compression and the texture cap — visually near-identical`
				};
			}
			case 'data': {
				const rows = s.display.sheet?.rows.length ?? 0;
				return {
					creditPrefix: '',
					toolName: 'CSV to XLSX',
					lede: `the ${rows}-row CSV on the left went through the`,
					body: `tool — SheetJS, the library behind most of the JavaScript spreadsheet world — and came out as a real .xlsx workbook. The table on the right is read straight back from the downloaded file: numbers became real numeric cells, date-looking strings deliberately stayed text, and none of it ever left the browser.`,
					beforeAlt: '',
					afterAlt: ''
				};
			}
		}
	}
	const copy = $derived(stats && buildCopy(kind, stats));

	// Credit line variants: "Photo by <author> on <source>." for people,
	// "Photo via <source>." when the source site is its own author, license
	// citation ("— public domain.") for PD works.
	const credit = $derived.by(() => {
		if (!stats?.credit || !copy) return null;
		const c = stats.credit;
		const sameName = c.author === c.source;
		return {
			url: c.url,
			author: c.author,
			prefix: sameName ? copy.creditPrefix.replace(/ by$/, ' via') : copy.creditPrefix,
			suffix: c.license ? ` — ${c.license}.` : sameName ? '.' : ` on ${c.source}.`
		};
	});

	// gif anim preview: intrinsic dims from the display aspect at maxDimension.
	const animSrc = $derived(stats?.display.anim && assetUrl(stats.display.anim.file));
	const animHeight = $derived(
		stats?.display.anim
			? Math.round((stats.display.height / stats.display.width) * stats.display.anim.maxDimension)
			: 0
	);

	// video clip preview: preload="none" + committed poster — zero video bytes
	// until the visitor presses play.
	const clipSrc = $derived(stats?.display.clip && assetUrl(stats.display.clip.file));
	const clipPosterSrc = $derived(stats?.display.clip && assetUrl(stats.display.clip.poster));
</script>

{#if stats && copy && hasDisplay}
	<div>
		{#if hero}
			<p class="microlabel text-muted">Before / after</p>
			<h2 class="text-stat mt-3 max-w-2xl text-balance text-ink">
				Same photo. {stats.savingsPercent}% fewer bytes.
			</h2>
		{/if}

		{#if kind === 'audio'}
			<!-- Audio has no visual side — a LISTENING comparison instead: both
			     players hold the complete actual files; preload="none" keeps the
			     page from moving a single audio byte until Play. -->
			<div class="{hero ? 'mt-6 ' : ''}space-y-3">
				{#each [{ label: beforeLabel, src: beforeSrc }, { label: afterLabel, src: afterSrc }] as player (player.label)}
					<div class="rounded-xl bg-card p-4">
						<p class="text-[11px] font-medium tracking-label text-muted uppercase">
							{player.label}
						</p>
						<audio controls preload="none" src={player.src} class="mt-2 w-full"></audio>
					</div>
				{/each}
			</div>
		{:else if kind === 'font'}
			<!-- The specimen is rendered live by the converted WOFF2 itself. -->
			<div class="{hero ? 'mt-6 ' : ''}rounded-xl bg-card p-5" data-demo-specimen>
				<p class="text-[11px] font-medium tracking-label text-muted uppercase">
					{afterLabel} — rendering this specimen
				</p>
				<p
					class="mt-4 text-2xl leading-snug text-ink"
					style="font-family: '{DEMO_FONT_FAMILY}', serif;"
				>
					Sphinx of black quartz, judge my vow.
				</p>
				<p
					class="mt-1 text-2xl leading-snug text-ink"
					style="font-family: '{DEMO_FONT_FAMILY}', serif; font-weight: 700;"
				>
					0123456789 — “fjord” &amp; ligatures.
				</p>
			</div>
		{:else if kind === 'merge'}
			<!-- File table — the demo is the page math, no display assets. -->
			{#if stats.display.merge}
				{@const m = stats.display.merge}
				<div class="{hero ? 'mt-6 ' : ''}overflow-x-auto rounded-xl" data-demo-merge>
					<table class="w-full bg-card text-left text-[13px] leading-relaxed tabular-nums">
						<thead>
							<tr class="microlabel border-b border-line text-faint">
								<th class="px-4 py-2.5 font-medium">File</th>
								<th class="px-4 py-2.5 text-right font-medium">Pages</th>
								<th class="px-4 py-2.5 text-right font-medium">Size</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line">
							{#each m.files as file (file.name)}
								<tr>
									<td class="px-4 py-2 font-medium text-ink">{file.name}</td>
									<td class="px-4 py-2 text-right">{file.pages}</td>
									<td class="px-4 py-2 text-right">{formatBytes(file.bytes)}</td>
								</tr>
							{/each}
							<tr>
								<td class="px-4 py-2 font-semibold text-ink">merged.pdf</td>
								<td class="px-4 py-2 text-right font-semibold text-ink">{m.pages}</td>
								<td class="px-4 py-2 text-right font-semibold text-ink">
									{formatBytes(stats.compressedBytes)}
								</td>
							</tr>
						</tbody>
					</table>
				</div>
			{/if}
		{:else if kind === 'archive'}
			<!-- Folder manifest — every entry is a committed fixture of this repo. -->
			{#if stats.display.archive}
				<div class="{hero ? 'mt-6 ' : ''}overflow-x-auto rounded-xl" data-demo-archive>
					<table class="w-full bg-card text-left text-[13px] leading-relaxed tabular-nums">
						<thead>
							<tr class="microlabel border-b border-line text-faint">
								<th class="px-4 py-2.5 font-medium">File</th>
								<th class="px-4 py-2.5 text-right font-medium">Size</th>
							</tr>
						</thead>
						<tbody class="divide-y divide-line">
							{#each stats.display.archive.entries as entry (entry.name)}
								<tr>
									<td class="px-4 py-2 font-medium text-ink">{entry.name}</td>
									<td class="px-4 py-2 text-right">{formatBytes(entry.bytes)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else if kind === 'exif'}
			<!-- The metadata table IS the demo; the photo is just the anchor. -->
			{#if stats.display.metadata}
				{@const m = stats.display.metadata}
				<div class={hero ? 'mt-6' : ''} data-demo-exif>
					<img
						src={beforeSrc}
						alt={copy.beforeAlt}
						width={stats.display.width}
						height={stats.display.height}
						loading="lazy"
						decoding="async"
						class="block w-full rounded-xl"
					/>
					<div class="mt-3 overflow-x-auto rounded-xl">
						<table class="w-full bg-card text-left text-[13px] leading-relaxed tabular-nums">
							<thead>
								<tr class="microlabel border-b border-line text-faint">
									<th class="px-4 py-2.5 font-medium">Metadata</th>
									<th class="px-4 py-2.5 font-medium">Before</th>
									<th class="px-4 py-2.5 font-medium">After</th>
								</tr>
							</thead>
							<tbody class="divide-y divide-line">
								{#each [{ label: 'GPS location', value: m.gps }, { label: 'Camera', value: m.camera }, { label: 'Taken', value: m.taken }, { label: 'Metadata fields', value: String(m.fields) }] as row (row.label)}
									{#if row.value}
										<tr>
											<td class="px-4 py-2 font-medium text-ink">{row.label}</td>
											<td class="px-4 py-2">{row.value}</td>
											<td class="px-4 py-2 text-ok">removed</td>
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				</div>
			{/if}
		{:else if kind === 'ocr'}
			<!-- The scan is the anchor; the RECOGNIZED TEXT is the demo. -->
			{#if stats.display.text?.after}
				<div class={hero ? 'mt-6' : ''} data-demo-ocr>
					<img
						src={beforeSrc}
						alt={copy.beforeAlt}
						width={stats.display.width}
						height={stats.display.height}
						loading="lazy"
						decoding="async"
						class="block w-full rounded-xl"
					/>
					<div class="mt-3 rounded-xl bg-card p-4">
						<p class="text-[11px] font-medium tracking-label text-muted uppercase">
							Extracted text — verbatim tool output
						</p>
						<!-- Ligatures off: the panel is verbatim tool output — show the
						     actual characters. -->
						<pre
							class="mt-3 max-h-72 overflow-y-auto font-mono text-[12.5px] leading-relaxed whitespace-pre-wrap text-ink"
							style="font-variant-ligatures: none">{stats.display.text.after}</pre>
					</div>
				</div>
			{/if}
		{:else if kind === 'subtitle'}
			<!-- Both panels hold the complete actual files, inlined verbatim from
			     the manifest — subtitle files are small enough to ship as text. -->
			{#if stats.display.text?.before && stats.display.text?.after}
				<div
					class="{hero ? 'mt-6 ' : ''}grid grid-cols-2 gap-3 max-sm:grid-cols-1"
					data-demo-subtitle
				>
					{#each [{ label: beforeLabel, body: stats.display.text.before }, { label: afterLabel, body: stats.display.text.after }] as panel (panel.label)}
						<div class="rounded-xl bg-card p-4">
							<p class="text-[11px] font-medium tracking-label text-muted uppercase">
								{panel.label}
							</p>
							<!-- Ligatures off: Geist Mono would render the SRT arrow as one
							     glyph — these panels claim byte-for-byte, so show the bytes. -->
							<pre
								class="mt-3 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-ink"
								style="font-variant-ligatures: none">{panel.body}</pre>
						</div>
					{/each}
				</div>
			{/if}
		{:else if kind === 'data'}
			<!-- Left: the CSV verbatim. Right: rows read back from the DOWNLOADED
			     xlsx by the generator — a spreadsheet, rendered as one. -->
			{#if stats.display.text?.before && stats.display.sheet}
				<div class="{hero ? 'mt-6 ' : ''}grid grid-cols-2 gap-3 max-sm:grid-cols-1" data-demo-data>
					<div class="rounded-xl bg-card p-4">
						<p class="text-[11px] font-medium tracking-label text-muted uppercase">{beforeLabel}</p>
						<pre
							class="mt-3 overflow-x-auto font-mono text-[12.5px] leading-relaxed text-ink"
							style="font-variant-ligatures: none">{stats.display.text.before}</pre>
					</div>
					<div class="rounded-xl bg-card p-4">
						<p class="text-[11px] font-medium tracking-label text-muted uppercase">{afterLabel}</p>
						<div class="mt-3 overflow-x-auto">
							<table class="w-full text-left text-[12.5px] leading-relaxed tabular-nums">
								<thead>
									<tr class="microlabel border-b border-line text-faint">
										{#each stats.display.sheet.rows[0] as cell, i (i)}
											<th class="px-2 py-1.5 font-medium">{cell}</th>
										{/each}
									</tr>
								</thead>
								<tbody class="divide-y divide-line">
									{#each stats.display.sheet.rows.slice(1) as row, i (i)}
										<tr>
											{#each row as cell, j (j)}
												<td class="px-2 py-1.5">{cell}</td>
											{/each}
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}
		{:else}
			<!-- pdf: the clean single-column window of a letter page is ~1224 px, not
			     1440 — cap the slider at width/2 CSS px so the crop still displays
			     1:1 on 2x screens instead of being upscaled to the container.
			     ebook: the plate is only ~620 px wide — cap at its own width so the
			     slider never stretches it past 1:1 CSS pixels. -->
			<div
				class={hero ? 'mt-6' : ''}
				style={kind === 'pdf'
					? `max-width:${stats.display.width / 2}px`
					: kind === 'ebook'
						? `max-width:${stats.display.width}px`
						: undefined}
			>
				<ImageSlider
					beforeSrc={beforeSrc ?? ''}
					afterSrc={afterSrc ?? ''}
					width={stats.display.width}
					height={stats.display.height}
					lazy
					{beforeLabel}
					{afterLabel}
					beforeAlt={copy.beforeAlt}
					afterAlt={copy.afterAlt}
				/>
			</div>
		{/if}

		<div class="mt-3 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
			{#each CARDS as card (card.label)}
				<div
					class="rounded-xl bg-card p-4 max-sm:flex max-sm:items-center max-sm:justify-between max-sm:p-3"
				>
					<p class="text-[11px] font-medium tracking-label text-muted uppercase">{card.label}</p>
					<p
						class="mt-1 text-xl font-semibold tracking-tight tabular-nums max-sm:mt-0 max-sm:text-base {card.emphasize
							? 'text-ok'
							: 'text-ink'}"
					>
						{card.value}
					</p>
				</div>
			{/each}
		</div>

		{#if stats.display.anim && animSrc}
			<div class="mt-3 overflow-hidden rounded-xl bg-card">
				<img
					src={animSrc}
					alt="The compressed animation itself, playing at its real quality"
					width={stats.display.anim.maxDimension}
					height={animHeight}
					loading="lazy"
					decoding="async"
					class="block w-full"
				/>
			</div>
			<p class="mt-2 text-xs text-faint">
				The animation above is a real second run through the same tool — quality {stats.quality}
				plus a {stats.display.anim.maxDimension} px resize: {formatBytes(stats.originalBytes)} →
				{formatBytes(stats.display.anim.bytes)}, playing exactly as the tool wrote it.
			</p>
		{/if}

		{#if stats.display.clip && clipSrc && clipPosterSrc}
			<div class="mt-3 overflow-hidden rounded-xl bg-card">
				<video
					data-testid="demo-clip"
					src={clipSrc}
					poster={clipPosterSrc}
					width={stats.display.clip.width}
					height={stats.display.clip.height}
					controls
					muted
					loop
					playsinline
					preload="none"
					class="mx-auto block"
				></video>
			</div>
			<p class="mt-2 text-xs text-faint">
				The clip above is a real second run through the same tool — quality {stats.display.clip
					.quality} plus a {stats.display.clip.maxDimension} px resize: {formatBytes(
					stats.originalBytes
				)} → {formatBytes(stats.display.clip.bytes)}, playing exactly as the tool wrote it.
			</p>
		{/if}

		<p class="mt-4 max-w-2xl text-sm leading-relaxed">
			<span class="font-medium text-ink">Real result, not a mock-up:</span>
			{copy.lede}
			<a
				href={resolve(stats.tool)}
				class="font-medium text-ink underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
			>
				{copy.toolName}</a
			>
			{copy.body}
		</p>
		{#if credit}
			<p class="mt-2 text-xs text-faint">
				{credit.prefix}
				<!-- external credit URL from the generated manifest -->
				<!-- eslint-disable svelte/no-navigation-without-resolve -->
				<a
					href={credit.url}
					target="_blank"
					rel="noopener"
					class="underline decoration-line underline-offset-4 transition-colors hover:decoration-ink"
				>
					{credit.author}</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				{credit.suffix}
			</p>
		{/if}
	</div>
{/if}
