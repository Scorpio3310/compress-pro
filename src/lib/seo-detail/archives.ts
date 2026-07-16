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
		related: ['/zip-to-7z', '/7z-to-zip', '/zip-files']
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
