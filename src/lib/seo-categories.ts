// Category hub pages — one entry per TOOL_GROUPS bucket, rendered by
// src/routes/[category=category]/. Shaped like FullSeoEntry so the hubs ride
// the same uniqueness/length unit tests and the shared markdown emitter, plus
// a computed `directory` that links EVERY tool in the group (a new tool
// appears here with zero hub edits). Loaded lazily by the category route and
// statically by seo-full.server.ts — same dual pattern as seo-detail groups.
//
// Copy rule: no numeric tool counts in title/description/tagline (lengths are
// test-locked and counts drift as tools ship) — rendered pages show live
// counts derived from `directory` instead.
import { CONVERTERS, FORMATS, TOOLS, TOOL_GROUPS, type FullSeoEntry, type SeoLite } from '$lib/seo';

export interface CategoryDirectorySection {
	heading: string;
	items: { name: string; path: string }[];
}

export type FullCategoryEntry = FullSeoEntry & {
	directory: CategoryDirectorySection[];
};

const toItem = (e: SeoLite) => ({ name: e.h1.replace(/\.$/, ''), path: e.path });

/** The group's tools, sub-sectioned in registry order — FORMATS (the hub-grade
 *  landing pages) first, then converters, then standalone tools. */
function directoryFor(categoryPath: string): CategoryDirectorySection[] {
	const group = TOOL_GROUPS.find((g) => g.categoryPath === categoryPath);
	if (!group) throw new Error(`seo-categories: no TOOL_GROUPS entry for ${categoryPath}`);
	const inGroup = (e: SeoLite) => e.format !== null && group.formats.includes(e.format);
	const sections = [
		{ heading: 'Compress & core tools', items: FORMATS.filter(inGroup).map(toItem) },
		{ heading: 'Convert', items: CONVERTERS.filter(inGroup).map(toItem) },
		{ heading: 'More tools', items: TOOLS.filter(inGroup).map(toItem) }
	];
	return sections.filter((s) => s.items.length > 0);
}

export const CATEGORIES: readonly FullCategoryEntry[] = [
	{
		format: null,
		path: '/image-tools',
		label: 'Image tools',
		h1: 'Image tools.',
		title: 'Image Tools — Compress, Convert & Resize Online | Compress Pro',
		description:
			'Every image tool in one place — compress JPG, PNG, WebP or GIF, convert HEIC and RAW, resize, OCR and more. Free, private, entirely in your browser.',
		tagline: 'Compress, convert and resize images — locally, for free.',
		ogImage: '/og/image-tools.jpg',
		steps: [
			'Pick the tool that fits the job — compress, convert, resize or read text.',
			'Drop your images; every pixel is processed locally in your browser.',
			'Download the results — nothing was ever uploaded.'
		],
		intro:
			'One engine room, many doors. Every image tool here shares the same local pipeline — MozJPEG, OxiPNG, libwebp, LibRaw and Tesseract compiled to WebAssembly — so whichever door you walk through, photos are processed on your own device and never uploaded. **The pages differ only in what they preconfigure.**',
		directory: directoryFor('/image-tools'),
		faq: [
			{
				q: 'Which image tool should I start with?',
				a: 'If you just want a smaller file, the compressor for your format (JPG, PNG, WebP, GIF). If the format itself is the problem — HEIC that will not open, RAW that needs developing — pick the matching converter. Resize and OCR have their own pages.'
			},
			{
				q: 'Do all these pages use the same engines?',
				a: 'Yes — one shared pipeline: MozJPEG for JPG, OxiPNG and libimagequant for PNG, libwebp for WebP, LibRaw for camera RAW, Tesseract for text recognition. Each page just opens it with different settings.'
			},
			{
				q: 'Can I process many images at once?',
				a: 'Every tool accepts batches — drop a whole folder’s worth and the results download together as a ZIP when there is more than one file.'
			},
			{
				q: 'Are my images uploaded anywhere?',
				a: 'No — every image tool runs entirely in your browser via WebAssembly. Files never leave your device; you can switch your connection off mid-batch and it keeps working.'
			}
		]
	},
	{
		format: null,
		path: '/video-audio-tools',
		label: 'Video & audio tools',
		h1: 'Video & audio tools.',
		title: 'Video & Audio Tools — Compress and Convert | Compress Pro',
		description:
			'All video and audio tools in one place — compress MP4 or MOV, convert formats, extract audio, make GIFs, fix subtitles. Private, free, in your browser.',
		tagline: 'Shrink and convert video or audio — right in your browser.',
		ogImage: '/og/video-audio-tools.jpg',
		steps: [
			'Choose a tool — compress a video, convert a format or pull the audio out.',
			'Drop the file; your device’s own hardware decoder does the work.',
			'Download the result — no upload, no queue, no watermark.'
		],
		intro:
			'Video work in a browser used to mean uploading gigabytes to someone’s server and waiting in line. These pages use your device’s own hardware codecs through WebCodecs instead — **compression and conversion at native speed, with the file never leaving your machine**. Audio rides the same pipeline, from MP3 encodes to lossless FLAC.',
		directory: directoryFor('/video-audio-tools'),
		faq: [
			{
				q: 'How can a browser compress video this fast?',
				a: 'The same way native apps do — through your device’s hardware encoder, exposed to the page by WebCodecs. There is no upload and no server queue, which is where web tools usually lose their time.'
			},
			{
				q: 'Video or audio page — which do I need?',
				a: 'If the picture matters, a video tool; if only the sound does, an extractor like MP4 to MP3 gives you a small audio file and discards the rest. Subtitle converters handle the text side.'
			},
			{
				q: 'Is there a length or size limit?',
				a: 'No hard limit — processing is bounded by your device’s memory and speed, not by an upload cap. Hour-long recordings are routine.'
			},
			{
				q: 'Do my videos get uploaded?',
				a: 'Never — decoding, re-encoding and muxing all happen locally. A video is the largest, most personal file most people handle; that is exactly why this site processes it on your device.'
			}
		]
	},
	{
		format: null,
		path: '/pdf-tools',
		label: 'PDF tools',
		h1: 'PDF tools.',
		title: 'PDF Tools — Compress, Merge, Split & Convert | Compress Pro',
		description:
			'The complete PDF toolbox — compress, merge, split, protect, unlock, rotate, watermark and convert PDFs. Free and private: files never leave your browser.',
		tagline: 'Compress, merge, split and edit PDFs without any uploads.',
		ogImage: '/og/pdf-tools.jpg',
		steps: [
			'Pick the operation — compress, merge, split, protect or convert.',
			'Drop the documents; Ghostscript and pdf-lib run locally in the tab.',
			'Download the finished PDF — it never left your device.'
		],
		intro:
			'PDFs are where the sensitive documents live — contracts, medical records, applications — which makes “upload it to compress it” a strange ritual. Every PDF tool here runs Ghostscript and pdf-lib **in your browser**: the same professional-grade engines, zero uploads, from squeezing a scan under a portal’s cap to stamping, protecting and reorganizing pages.',
		directory: directoryFor('/pdf-tools'),
		faq: [
			{
				q: 'Which PDF tool do I need?',
				a: 'Size problems → Compress PDF (target-size mode hits exact caps). Many files → Merge. Too many pages → Split, extract or delete pages. Access control → Protect and Unlock. Presentation → rotate, watermark, page numbers, grayscale.'
			},
			{
				q: 'Are these real PDF engines?',
				a: 'Yes — compression runs Ghostscript, the engine print workflows have trusted for decades, compiled to WebAssembly. Page operations use pdf-lib and previews render through pdf.js, the same renderer Firefox uses.'
			},
			{
				q: 'Can I chain operations?',
				a: 'Yes, and it is the intended pattern — merge first, then number pages, then compress to the cap. Each step downloads a file the next page accepts.'
			},
			{
				q: 'Is it safe for confidential documents?',
				a: 'That is the design goal — documents are processed entirely on your device and never uploaded. Close the tab and nothing remains anywhere.'
			}
		]
	},
	{
		format: null,
		path: '/font-tools',
		label: 'Font tools',
		h1: 'Font tools.',
		title: 'Font Tools — Convert, Subset & Instance | Compress Pro',
		description:
			'Web font tooling without installs — convert TTF, OTF, WOFF and WOFF2, subset character sets, instance variable fonts. Free, private, in your browser.',
		tagline: 'Convert, subset and instance fonts — all on your device.',
		ogImage: '/og/font-tools.jpg',
		steps: [
			'Pick a direction — convert between formats, subset, or instance.',
			'Drop the font; HarfBuzz and Brotli process it locally.',
			'Download web-ready files — licensing stays your responsibility.'
		],
		intro:
			'Font work usually means a Python toolchain or a paid app for what is, at heart, one transform: get this typeface into the format and size the web wants. These pages run HarfBuzz and Brotli **locally in your browser** — TTF and OTF to WOFF2 and back, character-set subsetting, and static instances cut from variable fonts.',
		directory: directoryFor('/font-tools'),
		faq: [
			{
				q: 'Which format should web fonts use?',
				a: 'WOFF2, full stop — Brotli compression makes it the smallest, and every browser that matters supports it. The converters exist mostly to get things INTO woff2, and back out when a desktop app needs TTF.'
			},
			{
				q: 'What does subsetting actually do?',
				a: 'It keeps only the glyphs you name — a Latin-only subset of a big multilingual font routinely drops 70–90% of the bytes. The subsetter page previews exactly which characters survive.'
			},
			{
				q: 'What about variable fonts?',
				a: 'Two options: convert them as they are, or use the instancer to freeze one weight/width combination into a small static font — the right pick when you only use Regular and Bold.'
			},
			{
				q: 'Am I allowed to convert this font?',
				a: 'That depends on its license, not on the tool — conversion happens on your device, but a font’s EULA may restrict web embedding or modification. Check it; open-license fonts (OFL) are safe.'
			}
		]
	},
	{
		format: null,
		path: '/archive-tools',
		label: 'Archive & data tools',
		h1: 'Archive & data tools.',
		title: 'Archive & Data Tools — Zip, Extract, Convert | Compress Pro',
		description:
			'Create, extract and convert archives — ZIP, 7Z, RAR, TAR and more — plus ebook, 3D model and data tools. Free, private, entirely in your browser.',
		tagline: 'Zip, extract and convert archives, ebooks, models & data.',
		ogImage: '/og/archive-tools.jpg',
		steps: [
			'Pick the container — create, extract or convert between formats.',
			'Drop the files; the 7-Zip engine runs locally in your browser.',
			'Download the archive or its contents — nothing was uploaded.'
		],
		intro:
			'One 7-Zip engine, compiled to WebAssembly, opens more or less everything ever called an archive — ZIP and 7Z through RAR, ISO, DEB and formats from the floppy era. The same corner of the site houses the structured-file tools: **ebooks, 3D models and spreadsheet data**, each recompressed or converted with its own specialist engine, all locally.',
		directory: directoryFor('/archive-tools'),
		faq: [
			{
				q: 'What can this corner of the site open?',
				a: 'Modern archives (ZIP, 7Z, RAR, TAR families), package formats (DEB, RPM, CAB), disc images (ISO), retro formats (LHA, ARJ, .Z) — plus EPUB and comic books, GLB 3D models, and CSV/XLSX/JSON/YAML data files.'
			},
			{
				q: 'Can I password-protect what I create?',
				a: 'Yes — ZIP and 7Z creation both offer AES-256 encryption, and 7Z can additionally hide the file listing until the password is entered. Encryption happens locally, and the password never leaves your device.'
			},
			{
				q: 'Why do ebooks and 3D models live here?',
				a: 'Because they are archives inside — an EPUB is a ZIP of pages and images, a GLB bundles meshes and textures. The tools re-compress what is inside those containers without breaking their structure.'
			},
			{
				q: 'Are my files uploaded?',
				a: 'No — creating, extracting and converting all run in your browser. Archives are often the most private thing on a disk (backups, handoffs, records); they never leave your machine here.'
			}
		]
	}
];

export const CATEGORY_BY_SLUG: ReadonlyMap<string, FullCategoryEntry> = new Map(
	CATEGORIES.map((c) => [c.path.slice(1), c])
);
