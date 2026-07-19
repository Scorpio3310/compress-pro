// Per-page head/meta + intake details (title/description/tagline/og, steps,
// related, converter preset/accept) for the 'archives' tool group — extracted
// verbatim from the pre-split seo.ts (parity is pinned by the byte-identical
// prerender diff). This is now the authoring source for these fields; loaded
// lazily via seo-detail/index.ts, statically by seo-full.server.ts.
import type { ConverterDetail, SeoDetail } from '$lib/seo';

export const DETAILS: Record<string, SeoDetail | ConverterDetail> = {
	'zip-files': {
		ogImage: '/og/zip-files.jpg',
		title: 'Create & Extract ZIP Files Online — Private | Compress Pro',
		description:
			'Create ZIP, 7Z or TAR archives from any files, or extract ZIP, RAR, 7Z, ISO and more — entirely in your browser. No upload, no size caps. Free & private.',
		tagline: 'Zip and unzip files locally — nothing ever gets uploaded.',
		related: ['/rar-to-zip', '/create-7z', '/extract-rar', '/compress-jpg']
	},
	'remove-exif': {
		ogImage: '/og/remove-exif.jpg',
		title: 'Remove EXIF Data Online — Private, No Upload | Compress Pro',
		description:
			'See the GPS location, camera and dates hidden in your photos — and strip them in your browser. Lossless, pixels untouched, nothing uploaded. Free.',
		tagline: 'GPS, camera & date wiped locally — pixels stay untouched.',
		related: ['/compress-jpg', '/compress-png', '/compress-webp']
	},
	'rar-to-zip': {
		ogImage: '/og/rar-to-zip.jpg',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.rar,application/vnd.rar,application/x-rar-compressed',
		dropSubject: 'RAR archives',
		dropHint: 'RAR v4 & v5 · repacked to ZIP locally',
		title: 'RAR to ZIP Converter — Private, No Upload | Compress Pro',
		description:
			'Convert RAR to ZIP right in your browser — no WinRAR, no upload. Handles RAR v4 and v5, password-protected ones included. Files stay on your device.',
		tagline: 'Open-anywhere ZIP from RAR — converted on your own device.',
		related: ['/7z-to-zip', '/zip-files', '/zip-to-7z']
	},
	'7z-to-zip': {
		ogImage: '/og/7z-to-zip.jpg',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.7z,application/x-7z-compressed',
		dropSubject: '7Z archives',
		dropHint: '7-Zip archives · repacked to ZIP locally',
		title: '7Z to ZIP Converter — Private, No Upload | Compress Pro',
		description:
			'Convert 7Z archives to ZIP in your browser — nothing to install, nothing uploaded. Password-protected 7Z files work too. Free, fast and private.',
		tagline: 'Turn 7Z archives into ZIPs that open everywhere, locally.',
		related: ['/zip-to-7z', '/rar-to-zip', '/zip-files']
	},
	'zip-to-7z': {
		ogImage: '/og/zip-to-7z.jpg',
		preset: { kind: 'archive', op: 'convert', to: '7z' },
		accept: '.zip,application/zip,application/x-zip-compressed',
		dropSubject: 'ZIP archives',
		dropHint: 'ZIP archives · repacked to 7Z locally',
		title: 'ZIP to 7Z Converter — Smaller Archives | Compress Pro',
		description:
			'Repack ZIP archives as 7Z right in your browser and shave off extra megabytes — LZMA2 compresses harder than deflate. No upload, free and private.',
		tagline: 'Repack ZIP as 7Z for the strongest everyday compression.',
		related: ['/7z-to-zip', '/zip-files', '/rar-to-zip']
	},
	'tar-gz-to-zip': {
		ogImage: '/og/tar-gz-to-zip.jpg',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.gz,.tgz,.tar,.tbz2,.txz,application/gzip,application/x-tar',
		dropSubject: 'tarballs',
		dropHint: 'tar.gz / tgz / tar · repacked to ZIP locally',
		title: 'TAR.GZ to ZIP Converter — Private, No Upload | Compress Pro',
		description:
			'Convert tar.gz and tgz tarballs to ZIP in your browser — double-click friendly on Windows, no extra tools. Plain tar, tar.bz2 and tar.xz work too.',
		tagline: 'Unix tar.gz in, Windows-friendly ZIP out — all on-device.',
		related: ['/zip-to-tar-gz', '/zip-files', '/rar-to-zip']
	},
	'iso-to-zip': {
		ogImage: '/og/iso-to-zip.jpg',
		preset: { kind: 'archive', op: 'convert', to: 'zip' },
		accept: '.iso,application/x-iso9660-image',
		dropSubject: 'ISO images',
		dropHint: 'Disc images · files repacked to ZIP locally',
		title: 'ISO to ZIP Converter — Extract & Repack | Compress Pro',
		description:
			'Pull the files out of an ISO disc image and repack them as a ZIP — entirely in your browser, no mounting, no drive letters, nothing uploaded anywhere.',
		tagline: 'Disc image in, plain ZIP of its files out — no installs.',
		related: ['/zip-files', '/rar-to-zip', '/zip-to-7z']
	},
	'zip-to-tar-gz': {
		ogImage: '/og/zip-to-tar-gz.jpg',
		preset: { kind: 'archive', op: 'convert', to: 'tgz' },
		accept: '.zip,application/zip,application/x-zip-compressed',
		dropSubject: 'ZIP archives',
		dropHint: 'ZIP archives · repacked to tar.gz locally',
		title: 'ZIP to TAR.GZ Converter — Private, No Upload | Compress Pro',
		description:
			'Turn a ZIP into a unix-style tar.gz tarball right in your browser — for build pipelines, servers and tools that expect tarballs. Free and private.',
		tagline: 'ZIP from Windows in, unix-ready tar.gz out — on-device.',
		related: ['/tar-gz-to-zip', '/zip-files', '/7z-to-zip']
	},
	'create-7z': {
		ogImage: '/og/create-7z.jpg',
		preset: { kind: 'archive', op: 'create', to: '7z' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · bundled into one 7Z locally',
		title: 'Create 7Z Archives Online — AES-256, Private | Compress Pro',
		description:
			'Make a 7Z archive from any files right in your browser — the strongest everyday compression, optional AES-256 password, nothing uploaded anywhere.',
		tagline: 'Build 7Z archives in your browser — small, AES, private.',
		related: ['/zip-to-7z', '/7z-to-zip', '/protect-7z', '/zip-files']
	},
	// The protect pages preset the SAME create op as create-7z/zip-files — the
	// password field renders automatically (canEncrypt: create + zip/7z). The
	// pages exist so "password protect zip" searches land on a page whose copy
	// leads with the password, not the bundling.
	'protect-zip': {
		ogImage: '/og/protect-zip.jpg',
		preset: { kind: 'archive', op: 'create', to: 'zip' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · zipped & AES-256 encrypted locally',
		title: 'Password Protect ZIP — AES-256, No Upload | Compress Pro',
		description:
			'Password-protect a ZIP right in your browser — files are bundled and encrypted with AES-256 locally, nothing is uploaded. Free, no accounts, no limits.',
		tagline: 'ZIPs locked with AES-256 — encrypted on your own device.',
		related: ['/protect-7z', '/create-7z', '/protect-pdf', '/zip-files']
	},
	'protect-7z': {
		ogImage: '/og/protect-7z.jpg',
		preset: { kind: 'archive', op: 'create', to: '7z' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · 7Z with AES-256, built locally',
		title: 'Password Protect 7Z — AES-256 & Hidden Names | Compress Pro',
		description:
			'Create a password-protected 7Z in your browser — AES-256 encryption with optional hidden file names, all local. Nothing uploaded, nothing stored. Free.',
		tagline: '7Z with AES-256 and hidden file names — built on-device.',
		related: ['/protect-zip', '/create-7z', '/extract-7z']
	},
	'create-tar': {
		ogImage: '/og/create-tar.jpg',
		preset: { kind: 'archive', op: 'create', to: 'tar' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · bundled into one TAR locally',
		title: 'Create TAR Files Online — Private, No Upload | Compress Pro',
		description:
			'Bundle files into a plain .tar archive right in your browser — the unix standard for grouping files, uncompressed by design. Free, private, local.',
		tagline: 'Bundle files into a tar archive — built on your device.',
		related: ['/create-tar-gz', '/gzip-files', '/zip-files']
	},
	'create-tar-gz': {
		ogImage: '/og/create-tar-gz.jpg',
		preset: { kind: 'archive', op: 'create', to: 'tgz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · packed into one tar.gz locally',
		title: 'Create TAR.GZ Online — Private, No Upload | Compress Pro',
		description:
			'Build a tar.gz tarball from any files in your browser — the standard unix distribution format, also as tar.bz2 or tar.xz. Nothing gets uploaded.',
		tagline: 'Make tar.gz tarballs in your browser — nothing uploaded.',
		related: ['/zip-to-tar-gz', '/tar-gz-to-zip', '/create-tar']
	},
	'create-tar-bz2': {
		ogImage: '/og/create-tar-bz2.jpg',
		preset: { kind: 'archive', op: 'create', to: 'tbz2' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · packed into one tar.bz2 locally',
		title: 'Create TAR.BZ2 Online — Private, No Upload | Compress Pro',
		description:
			'Bundle files into a .tar.bz2 right in your browser — bzip2 squeezes tighter than gzip for text and source trees. Nothing is uploaded anywhere. Free.',
		tagline: 'Tarballs with bzip2 compression — built in your browser.',
		related: ['/create-tar-gz', '/create-tar', '/bzip2-files']
	},
	'create-tar-xz': {
		ogImage: '/og/create-tar-xz.jpg',
		preset: { kind: 'archive', op: 'create', to: 'txz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Any files · packed into one tar.xz locally',
		title: 'Create TAR.XZ Online — Private, No Upload | Compress Pro',
		description:
			'Bundle files into a .tar.xz right in your browser — the tightest mainstream tarball format, ideal for releases. Nothing is uploaded anywhere. Free.',
		tagline: 'The hardest-squeezing tarballs — built in your browser.',
		related: ['/create-tar-gz', '/xz-files', '/create-7z']
	},
	'gzip-files': {
		ogImage: '/og/gzip-files.jpg',
		preset: { kind: 'archive', op: 'create', to: 'gz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Each file compressed to its own .gz locally',
		title: 'Gzip Files Online — Compress to .GZ Locally | Compress Pro',
		description:
			'Gzip any file in your browser — each input becomes its own .gz, the format servers, log tooling and unix pipelines expect. Free, private, no upload.',
		tagline: 'Gzip any file right in your browser — nothing uploaded.',
		related: ['/bzip2-files', '/xz-files', '/create-tar-gz']
	},
	'bzip2-files': {
		ogImage: '/og/bzip2-files.jpg',
		preset: { kind: 'archive', op: 'create', to: 'bz2' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Each file compressed to its own .bz2 locally',
		title: 'Bzip2 Files Online — Compress to .BZ2 Locally | Compress Pro',
		description:
			'Compress files to .bz2 right in your browser — bzip2 squeezes text harder than gzip, one output per input, nothing uploaded. Free and private.',
		tagline: 'Bzip2-compress files in your browser — smaller than gzip.',
		related: ['/gzip-files', '/xz-files', '/create-tar-gz']
	},
	'xz-files': {
		ogImage: '/og/xz-files.jpg',
		preset: { kind: 'archive', op: 'create', to: 'xz' },
		accept: '',
		dropSubject: 'any files',
		dropHint: 'Each file compressed to its own .xz locally',
		title: 'XZ Compress Online — Smallest Single Files | Compress Pro',
		description:
			'Compress files to .xz in your browser — LZMA2 squeezes text and data harder than gzip or bzip2. One output per input, private, nothing uploaded.',
		tagline: 'XZ squeezes hardest — compress files on your own device.',
		related: ['/gzip-files', '/bzip2-files', '/create-7z']
	},
	'extract-rar': {
		ogImage: '/og/extract-rar.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.rar,application/vnd.rar,application/x-rar-compressed',
		dropSubject: 'RAR archives',
		dropHint: 'RAR v4 & v5 · extracted locally',
		title: 'Extract RAR Online — Open RAR Without WinRAR | Compress Pro',
		description:
			'Open RAR archives right in your browser — no WinRAR, no install, no upload. RAR v4 and v5, password-protected included. Every file its own download.',
		tagline: 'Open RAR archives in your browser — files out, no apps.',
		related: ['/rar-to-zip', '/extract-7z', '/zip-files']
	},
	'extract-7z': {
		ogImage: '/og/extract-7z.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.7z,application/x-7z-compressed',
		dropSubject: '7Z archives',
		dropHint: '7-Zip archives · extracted locally',
		title: 'Extract 7Z Online — Unpack 7-Zip Archives | Compress Pro',
		description:
			'Unpack .7z archives in your browser — no 7-Zip install needed, nothing uploaded. Password-protected and header-encrypted archives both supported.',
		tagline: 'Unpack 7Z archives locally — every file its own download.',
		related: ['/7z-to-zip', '/create-7z', '/extract-rar']
	},
	'extract-tar-gz': {
		ogImage: '/og/extract-tar-gz.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.gz,.tgz,.tar,.tbz2,.txz,application/gzip,application/x-tar',
		dropSubject: 'tarballs',
		dropHint: 'tar.gz / tgz / tar.xz · unpacked locally',
		title: 'Extract TAR.GZ Online — Open Tarballs Easily | Compress Pro',
		description:
			'Open tar.gz, tgz, tar.bz2 and tar.xz tarballs in your browser — both layers unpacked automatically, every file its own download. Nothing uploaded.',
		tagline: 'Open tar.gz tarballs in your browser — no terminal used.',
		related: ['/tar-gz-to-zip', '/create-tar-gz', '/extract-gz']
	},
	'extract-gz': {
		ogImage: '/og/extract-gz.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.gz,application/gzip,application/x-gzip',
		dropSubject: 'GZ files',
		dropHint: 'gzip streams · decompressed locally',
		title: 'Extract GZ Online — Gunzip in the Browser | Compress Pro',
		description:
			'Decompress .gz files right in your browser — server logs, database dumps, exports. The original file comes straight back; nothing is ever uploaded.',
		tagline: 'Gunzip .gz files in your browser — nothing gets uploaded.',
		related: ['/gzip-files', '/extract-tar-gz', '/zip-files']
	},
	'extract-z': {
		ogImage: '/og/extract-z.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.z,application/x-compress',
		dropSubject: '.Z files',
		dropHint: 'Unix compress .Z · decompressed locally',
		title: 'Extract .Z Files Online — Unix Compress | Compress Pro',
		description:
			'Open unix .Z (compress) files right in your browser — decompress ancient archives and .tar.Z chains without installing anything. No uploads. Free.',
		tagline: 'Ancient unix .Z archives, opened right in your browser.',
		related: ['/extract-gz', '/zip-files', '/extract-tar-gz']
	},
	'extract-iso': {
		ogImage: '/og/extract-iso.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.iso,application/x-iso9660-image',
		dropSubject: 'ISO images',
		dropHint: 'Disc images · files listed locally',
		title: 'Extract ISO Online — Open Disc Images | Compress Pro',
		description:
			'Open ISO disc images in your browser and pull out the files — no mounting, no virtual drives, no admin rights. Runs locally; nothing is uploaded.',
		tagline: 'Look inside ISO disc images — files out, never mounted.',
		related: ['/iso-to-zip', '/zip-files', '/extract-rar']
	},
	'extract-cab': {
		ogImage: '/og/extract-cab.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.cab,application/vnd.ms-cab-compressed',
		dropSubject: 'CAB archives',
		dropHint: 'Windows cabinets · extracted locally',
		title: 'Extract CAB Online — Open Cabinet Files | Compress Pro',
		description:
			'Open Windows .cab cabinet archives in your browser — driver packages, installer payloads and update files, extracted locally with nothing uploaded.',
		tagline: 'Open Windows CAB archives right in your browser — free.',
		related: ['/extract-iso', '/zip-files', '/extract-rar']
	},
	'extract-deb': {
		ogImage: '/og/extract-deb.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.deb,application/vnd.debian.binary-package',
		dropSubject: 'DEB packages',
		dropHint: 'Debian packages · payload unpacked locally',
		title: 'Extract DEB Online — Open Debian Packages | Compress Pro',
		description:
			'Look inside .deb packages in your browser — the data payload unpacks automatically, every file its own download. No dpkg, no Linux box, no upload.',
		tagline: 'See inside Debian .deb packages — unpacked on your device.',
		related: ['/extract-rpm', '/extract-tar-gz', '/zip-files']
	},
	'extract-rpm': {
		ogImage: '/og/extract-rpm.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.rpm,application/x-rpm',
		dropSubject: 'RPM packages',
		dropHint: 'RPM packages · payload unpacked locally',
		title: 'Extract RPM Online — Open RPM Packages | Compress Pro',
		description:
			'Open .rpm packages in your browser — the cpio payload unwraps automatically to the real files. No rpm2cpio, no Linux needed, nothing uploaded.',
		tagline: 'Open RPM packages in your browser — the payload files out.',
		related: ['/extract-deb', '/extract-cpio', '/zip-files']
	},
	'extract-cpio': {
		ogImage: '/og/extract-cpio.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.cpio,application/x-cpio',
		dropSubject: 'cpio archives',
		dropHint: 'cpio archives · extracted locally',
		title: 'Extract CPIO Online — Open cpio Archives | Compress Pro',
		description:
			'Open cpio archives in your browser — initramfs images, rpm payloads and unix backups, extracted locally with every file its own download. Free.',
		tagline: 'Unpack cpio archives in your browser — nothing uploaded.',
		related: ['/extract-rpm', '/extract-tar-gz', '/zip-files']
	},
	'extract-lha': {
		ogImage: '/og/extract-lha.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.lha,.lzh,application/x-lzh-compressed',
		dropSubject: 'LHA/LZH archives',
		dropHint: 'LHA & LZH · retro archives, extracted locally',
		title: 'Extract LHA / LZH Online — Retro Archives | Compress Pro',
		description:
			'Open LHA and LZH archives in your browser — the format of 90s Japan, Amiga scenes and retro software. Extracted locally; nothing gets uploaded.',
		tagline: 'Open LHA and LZH archives — retro formats, done locally.',
		related: ['/extract-arj', '/zip-files', '/create-7z']
	},
	// Hub page of the ebook tab (pathFor target) — converterFor never resolves
	// it, so accept/dropSubject stay off (tab defaults + TAB_ACCEPT are the
	// behavior). The bare preset resets a persisted `to` (txt/pdf) back to
	// compress: without it, a /cbz-to-pdf visit would make this page convert.
	'compress-epub': {
		ogImage: '/og/compress-epub.jpg',
		preset: { kind: 'ebook' },
		title: 'Compress EPUB Online — Free, Private, No Upload | Compress Pro',
		description:
			'Compress EPUB e-books right in your browser — the images inside are re-encoded, text and layout stay untouched. No uploads, no accounts. Free & private.',
		tagline: 'Lighter e-books, same text — shrunk on your own device.',
		related: ['/compress-cbz', '/cbr-to-cbz', '/epub-to-txt', '/compress-image']
	},
	'compress-cbz': {
		ogImage: '/og/compress-cbz.jpg',
		preset: { kind: 'ebook' },
		accept: '.cbz',
		dropSubject: 'CBZ comics',
		dropHint: 'CBZ archives · pages recompressed locally',
		title: 'Compress CBZ Comics Online — Private, No Upload | Compress Pro',
		description:
			'Compress CBZ comic archives right in your browser — pages re-encoded at your quality, optional downscale for e-readers. Nothing is uploaded. Free.',
		tagline: 'Comic archives slimmed page by page — all on your device.',
		related: ['/compress-epub', '/cbr-to-cbz', '/cbz-to-pdf', '/compress-jpg']
	},
	'cbr-to-cbz': {
		ogImage: '/og/cbr-to-cbz.jpg',
		// quality 100: the per-entry keep-original guard then returns every
		// page bit-identical — the converter promises a container change only.
		preset: { kind: 'ebook', quality: 100 },
		accept: '.cbr',
		dropSubject: 'CBR comics',
		dropHint: 'RAR comics · repacked as CBZ locally',
		title: 'CBR to CBZ Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert CBR comics to CBZ right in your browser — pages carried over bit-exact by default, optional recompression. Nothing uploaded. Free, no limits.',
		tagline: 'RAR comics repacked as CBZ locally — pages bit-identical.',
		related: ['/compress-cbz', '/extract-rar', '/cbr-to-pdf', '/compress-epub']
	},
	'epub-to-txt': {
		ogImage: '/og/epub-to-txt.jpg',
		preset: { kind: 'ebook', to: 'txt' },
		accept: '.epub',
		dropSubject: 'EPUB books',
		dropHint: 'EPUB books · text extracted locally',
		title: 'EPUB to TXT Converter — Extract Books Free | Compress Pro',
		description:
			'Extract the full text of an EPUB as a plain .txt file right in your browser — chapters in reading order, paragraphs kept, markup dropped. Nothing uploaded.',
		tagline: 'A whole book as plain text — extracted on your own device.',
		related: ['/compress-epub', '/pdf-to-text', '/cbz-to-pdf']
	},
	'cbz-to-pdf': {
		ogImage: '/og/cbz-to-pdf.jpg',
		// quality 90 only touches WebP/GIF pages — JPEG/PNG embed byte-exact.
		preset: { kind: 'ebook', to: 'pdf', quality: 90 },
		accept: '.cbz',
		dropSubject: 'CBZ comics',
		dropHint: 'CBZ comics · pages embedded into a PDF locally',
		title: 'CBZ to PDF Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert CBZ comics to PDF right in your browser — JPEG and PNG pages are embedded losslessly, one page per image, in reading order. Nothing is uploaded.',
		tagline: 'Comic pages embedded into a PDF losslessly — on-device.',
		related: ['/cbr-to-pdf', '/compress-cbz', '/jpg-to-pdf']
	},
	'cbr-to-pdf': {
		ogImage: '/og/cbr-to-pdf.jpg',
		preset: { kind: 'ebook', to: 'pdf', quality: 90 },
		accept: '.cbr',
		dropSubject: 'CBR comics',
		dropHint: 'RAR comics · pages embedded into a PDF locally',
		title: 'CBR to PDF Converter — Free, Private, No Upload | Compress Pro',
		description:
			'Convert CBR comics to PDF right in your browser — the RAR is unpacked locally and JPEG/PNG pages embed losslessly, one page per image. Nothing uploaded.',
		tagline: 'RAR comics turned into PDFs locally — pages stay lossless.',
		related: ['/cbz-to-pdf', '/cbr-to-cbz', '/extract-rar']
	},
	// Hub page of the model tab (pathFor target) — FORMATS entries carry no
	// preset and converterFor never resolves them (no accept/dropSubject here).
	'compress-glb': {
		ogImage: '/og/compress-glb.jpg',
		title: 'Compress GLB 3D Models — Draco, Free, No Upload | Compress Pro',
		description:
			'Compress GLB 3D models right in your browser — Draco or Meshopt geometry, texture recompression, optional simplify. Nothing is uploaded. Free & private.',
		tagline: '3D models crushed with Draco — right on your own device.',
		related: ['/compress-image', '/compress-video', '/zip-files']
	},
	// Hub page of the data tab (pathFor target) — FORMATS entries carry no
	// preset and converterFor never resolves them (no accept/dropSubject here).
	'csv-to-xlsx': {
		ogImage: '/og/csv-to-xlsx.jpg',
		title: 'CSV to Excel (XLSX) — Free, Private, No Upload | Compress Pro',
		description:
			'Convert CSV files to Excel XLSX right in your browser — delimiters auto-detected, numbers typed, nothing uploaded. Free, no accounts, no limits.',
		tagline: 'CSV turned into a real Excel workbook — on your device.',
		related: ['/xlsx-to-csv', '/json-to-yaml', '/zip-files']
	},
	'xlsx-to-csv': {
		ogImage: '/og/xlsx-to-csv.jpg',
		preset: { kind: 'data' },
		accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xlsx,.xls',
		dropSubject: 'Excel files',
		dropHint: 'XLSX & legacy XLS · first sheet exported locally',
		title: 'XLSX to CSV — Excel Export, Private, Free | Compress Pro',
		description:
			'Convert Excel XLSX files to clean CSV right in your browser — pick the delimiter, dates and formulas come out as values. Nothing is uploaded. Free.',
		tagline: 'Excel sheets exported as clean CSV — all on your device.',
		related: ['/csv-to-xlsx', '/yaml-to-json', '/zip-files']
	},
	'json-to-yaml': {
		ogImage: '/og/json-to-yaml.jpg',
		preset: { kind: 'data' },
		accept: 'application/json,.json',
		dropSubject: 'JSON files',
		dropHint: 'JSON · rewritten as YAML locally',
		title: 'JSON to YAML — Free, Private, No Upload | Compress Pro',
		description:
			'Convert JSON to readable YAML right in your browser — key order kept, values untouched, nothing uploaded. Free, no accounts, works offline too.',
		tagline: 'JSON rewritten as readable YAML — right on your device.',
		related: ['/yaml-to-json', '/csv-to-xlsx', '/compress-image']
	},
	'yaml-to-json': {
		ogImage: '/og/yaml-to-json.jpg',
		preset: { kind: 'data' },
		accept: '.yaml,.yml',
		dropSubject: 'YAML files',
		dropHint: 'YAML · anchors resolved, output JSON',
		title: 'YAML to JSON — Free, Private, No Upload | Compress Pro',
		description:
			'Convert YAML to JSON right in your browser — anchors resolved, pretty or minified output, nothing uploaded. Free, no accounts, works offline too.',
		tagline: 'YAML flattened to portable JSON — right on your device.',
		related: ['/json-to-yaml', '/csv-to-xlsx', '/compress-pdf']
	},
	'extract-arj': {
		ogImage: '/og/extract-arj.jpg',
		preset: { kind: 'archive', op: 'extract' },
		accept: '.arj,application/x-arj',
		dropSubject: 'ARJ archives',
		dropHint: 'ARJ archives · DOS-era files, extracted locally',
		title: 'Extract ARJ Online — Open DOS-Era Archives | Compress Pro',
		description:
			'Open ARJ archives in your browser — the DOS-era format of BBS downloads and floppy backups. Files extract locally; nothing is ever uploaded.',
		tagline: 'Open ARJ archives in your browser — DOS-era files freed.',
		related: ['/extract-lha', '/create-7z', '/zip-files']
	}
};
