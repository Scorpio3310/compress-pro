// Long-form page bodies (intro/guide/faq) for the 'archives' tool group —
// extracted verbatim from the pre-split seo.ts (parity was pinned by the
// migration snapshot). This is now the authoring source for this copy;
// loaded lazily via seo-body/index.ts, statically by seo-full.server.ts.
import type { SeoBody } from '$lib/seo';
import { PRIVACY_A_ARCHIVE, PRIVACY_A_EXTRACT, PRIVACY_PROOF } from './shared';

export const BODIES: Record<string, SeoBody> = {
	'zip-files': {
		intro:
			'Bundle any files into one archive — ZIP, 7Z, TAR, TAR.GZ and more, with optional AES-256 password protection — or drop an archive (ZIP, RAR, 7Z, TAR, ISO, CAB…) and pull its contents out: each file becomes its own download. Everything runs in your browser, so **even huge archives never leave your machine**.',
		guide: [
			{
				heading: 'Compression levels',
				table: {
					columns: ['Level', 'What it does'],
					rows: [
						['Store', 'No compression — instant, right for already-compressed files'],
						['Fast', 'Light compression — quick, modest savings'],
						['Balanced', 'The usual default'],
						['Max', 'Smallest output, noticeably slower on big batches']
					]
				}
			},
			{
				heading: 'What actually compresses',
				paragraphs: [
					'ZIP compression loves redundancy: text, code, CSVs, logs and office documents often shrink 60–90%. Photos, video and audio are already compressed — zipping them mostly just bundles bytes, so pick Store and save the time. A mixed folder lands somewhere in between, and the per-file rows show exactly where the savings came from. When the contents themselves need to shrink, run them through the [image](/compress-jpg), [video](/compress-video) or [PDF](/compress-pdf) compressors first — then Store the results.'
				]
			},
			{
				heading: 'One archive, or files out of one',
				paragraphs: [
					'Zipping shines when the point is a single attachment: a project folder, a batch of scans, a handoff. Extraction works the other way — drop an archive (ZIP, [RAR](/extract-rar), [7Z](/extract-7z), [tarball](/extract-tar-gz), [ISO](/extract-iso), CAB, DEB, RPM, CPIO, LHA, ARJ or .Z) and every file inside becomes its own row, downloadable individually or all at once, without the archive ever leaving your machine. Convert switches container without touching content — [RAR to ZIP](/rar-to-zip) is the classic trip.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Archives here are handled by 7-Zip 24.09 itself — the real desktop engine, compiled to WebAssembly — so 7Z creation gets the same LZMA2 ratios and the same AES-256 encryption you would get from the app, and extraction reads every format 7-Zip reads. For everyday ZIP and gzip work, the bundled fflate library takes the fast path. Nothing is ever uploaded.'
				]
			}
		],
		faq: [
			{
				q: 'Why do my photos barely shrink in a ZIP?',
				a: 'JPGs, PNGs, videos and PDFs are already compressed — ZIP’s compression can only shave a percent or two off them. ZIP shines for text, code, spreadsheets and for bundling many files into one attachment. 7Z squeezes hardest of the formats offered here, but the same physics applies.'
			},
			{
				q: 'Is there a size limit?',
				a: 'No server means no upload cap — the practical limit is your device’s memory. Multi-gigabyte archives work, they just take a moment.'
			},
			{
				q: 'Can it open password-protected archives?',
				a: 'Yes — enter the password in the panel and protected ZIP, 7Z and RAR archives extract right in your browser. The password is only used locally, never stored or sent anywhere. Creating AES-256-encrypted ZIP and 7Z archives works too.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'remove-exif': {
		intro:
			'Photos carry more than pixels: GPS coordinates of where they were taken, the exact time, your camera or phone model. Drop a JPG, PNG, or WebP here to see what your files reveal — then strip it in one click. Removal is lossless byte surgery: metadata segments are cut out without re-encoding, so pixels stay exactly identical. Orientation is preserved so phone photos never turn sideways, and **nothing is ever uploaded**.',
		guide: [
			{
				heading: 'What hides inside a photo',
				paragraphs: [
					'Cameras and phones write far more than pixels. This is what a typical photo quietly carries — and what this tool lists per file as it wipes it:'
				],
				table: {
					columns: ['Data', 'Example', 'Why it matters'],
					rows: [
						['GPS location', '46.0511°N, 14.5051°E', 'Reveals your home, workplace or routine'],
						['Timestamps', 'Taken 2026-05-14, 18:42', 'Places you somewhere at an exact time'],
						['Device model', 'Apple iPhone 15 Pro', 'Narrows down who took the photo'],
						[
							'Editing history (XMP)',
							'Lightroom edits, creator name',
							'Can carry names and software trails'
						],
						[
							'Comments & text chunks',
							'Notes left by apps and tools',
							'Often forgotten, rarely reviewed'
						]
					]
				}
			},
			{
				heading: 'What gets removed — and what stays',
				paragraphs: [
					'Removal is byte surgery, not re-encoding: metadata segments are cut out and the image data is copied verbatim, so pixels stay byte-identical and files only get smaller.'
				],
				table: {
					columns: ['Item', 'What happens'],
					rows: [
						['EXIF — including GPS, camera, dates', 'Removed'],
						['XMP metadata (incl. extended)', 'Removed'],
						['Photoshop metadata', 'Removed'],
						['Comments & PNG text/time chunks', 'Removed'],
						['ICC color profile', 'Kept by default — toggle to remove'],
						['Orientation', 'Preserved, re-embedded as the only remaining field'],
						['Pixels', 'Byte-identical — completely lossless']
					]
				}
			},
			{
				heading: 'When should you strip metadata?',
				paragraphs: [
					'Any time a photo leaves your control with the file intact: selling something on a marketplace, posting to a forum or blog, sending originals by email or a cloud link. One honest caveat — big social networks usually strip EXIF on upload themselves, but messengers sending “as document”, email attachments, and most forums and marketplaces do not. The safe assumption is that metadata survives unless you removed it yourself. Photos that also need to be smaller can go through [Compress JPG](/compress-jpg) afterwards — compression writes a brand-new file, so metadata stays gone. iPhone HEIC photos get the same cleanup as a side effect of [converting to JPG](/heic-to-jpg).'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'There is no encoder here — deliberately. Metadata removal is hand-written byte surgery: the file’s structure is parsed directly, EXIF, XMP and comment segments are cut out, and everything else is copied verbatim. Because no image engine ever decodes or re-encodes your photo, the lossless guarantee is literal — pixels are byte-identical, and files can only get smaller.'
				]
			}
		],
		faq: [
			{
				q: 'What do my photos reveal about me?',
				a: 'Often more than you think: the exact GPS coordinates of your home or workplace, timestamps, device model, even editing software. This tool lists what it found in each file — GPS, camera, dates — as it wipes it.'
			},
			{
				q: 'Are my photos uploaded to be cleaned?',
				a: 'No — everything runs right in your browser, which is the whole point of a privacy tool: photos with your GPS location inside never touch a server. Close the tab and everything is gone. Want proof? Clean one photo, switch your connection off, and clean another — it still works.'
			},
			{
				q: 'Is removing EXIF data lossless?',
				a: 'Completely. Metadata lives in separate segments of the file, so they are removed byte-for-byte without re-encoding the image. Pixels stay identical — verify with the built-in compare — and files only get smaller. Orientation is written back as the only remaining field, so phone photos keep displaying upright everywhere.'
			},
			{
				q: 'Is the color profile removed too?',
				a: 'Not by default — the ICC profile affects how colors render, so it is kept. Enable “Also remove color profile” to strip it as well; EXIF, GPS, XMP and comments are always removed.'
			}
		]
	},
	'rar-to-zip': {
		intro:
			'RAR needs WinRAR or 7-Zip; ZIP opens with a double-click on every Windows, Mac and Linux machine made this century. Drop a RAR, get the same files repacked as a ZIP — extraction and repacking run entirely in your browser, so **the archive never touches a server**.',
		guide: [
			{
				heading: 'Folder structure survives the trip',
				paragraphs: [
					'The conversion unpacks the RAR in memory and rebuilds the same tree as a ZIP — nested folders, file names and timestamps travel along; nothing is flattened. If you only need the files themselves rather than a new archive, the [archive tool](/zip-files) extracts each entry as its own download. Prefer a smaller result over a universal one? Repack into 7Z with [ZIP to 7Z](/zip-to-7z) instead.'
				]
			}
		],
		faq: [
			{
				q: 'Why convert RAR to ZIP?',
				a: 'Compatibility. ZIP opens natively everywhere — no extra software, no nag screens. RAR needs WinRAR, 7-Zip or a paid unarchiver, which is exactly the kind of thing you cannot ask a client or a colleague to install just to open one attachment.'
			},
			{
				q: 'Does it handle password-protected RARs?',
				a: 'Yes — type the password into the panel and the archive decrypts locally, both RAR4 and RAR5 encryption. The repacked ZIP itself is not encrypted; protect it again on the archive tab if you need to.'
			},
			{
				q: 'Why is there no ZIP to RAR converter?',
				a: 'RAR compression is proprietary — its author licenses decompression freely but has never released the compressor, so no website or library anywhere can legally create RAR files. Every honest tool converts out of RAR, never into it. 7Z is the free format that compresses comparably.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'7z-to-zip': {
		intro:
			'7Z compresses harder, but plenty of computers cannot open it without extra software. Drop a 7Z, get a ZIP with the same files and folders — every machine from the office PC to a locked-down work laptop opens it natively. **The whole conversion runs in your browser**.',
		guide: [
			{
				heading: 'When to keep 7Z instead',
				paragraphs: [
					'If everyone involved has 7-Zip, keep the 7Z — it is the better compressor. Convert to ZIP when the recipient is unknown, the file goes to a web form that only accepts .zip, or an old tool chokes on 7Z. The reverse trip lives at [ZIP to 7Z](/zip-to-7z); creating fresh archives from loose files is the [archive tool](/zip-files).'
				]
			}
		],
		faq: [
			{
				q: 'Will the ZIP be bigger than my 7Z?',
				a: 'Usually a little — 7Z (LZMA2) compresses tighter than ZIP (deflate). For already-compressed content like photos or video the difference is a rounding error; for text and code expect the ZIP to grow some percent. That is the price of a format everything can open.'
			},
			{
				q: 'Do encrypted 7Z archives work?',
				a: 'Yes — enter the password and the archive decrypts locally, including 7Z files with encrypted file lists (-mhe). The resulting ZIP is unencrypted by design, so the recipient does not need the password.'
			},
			{
				q: 'Does the folder structure survive?',
				a: 'Fully. The 7Z is unpacked in memory and the same tree is rebuilt inside the ZIP — nested folders, names and paths stay exactly as they were.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'zip-to-7z': {
		intro:
			'ZIP is universal; 7Z is efficient. Repacking a ZIP as 7Z re-compresses the same files with LZMA2, which routinely lands noticeably smaller on documents, code and mixed folders. **The conversion runs entirely in your browser** — drop a ZIP, download a 7Z.',
		guide: [
			{
				heading: 'Deflate vs LZMA2 in one breath',
				paragraphs: [
					'ZIP compresses every file on its own with deflate, a 1990s algorithm tuned for speed. 7Z packs files into one solid stream and runs LZMA2 with a real dictionary over it, finding repetition across files — that is where the extra percent comes from, and why 7Z is slower to build. Going the other way is [7Z to ZIP](/7z-to-zip); starting from loose files, the [archive tool](/zip-files) creates either format directly.'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller does 7Z get?',
				a: 'Depends on the content. Text, code, spreadsheets and databases often shrink 20-40% versus ZIP; photos, video and other already-compressed files barely move. The output size shows next to the input, so the verdict is immediate.'
			},
			{
				q: 'What opens 7Z files?',
				a: '7-Zip on Windows (free), Keka or The Unarchiver on macOS, p7zip on Linux — and any modern archive manager. What does NOT open them is the built-in Windows Explorer extractor before Windows 11 24H2, so know your recipient.'
			},
			{
				q: 'Can I make the 7Z password-protected?',
				a: 'Conversion keeps the output unencrypted so it opens without friction. To create an encrypted 7Z, use the Create op on the archive tab — it offers AES-256, optionally with hidden file names.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'tar-gz-to-zip': {
		intro:
			'Tarballs are the lingua franca of unix and the bane of Windows — Explorer will not open a .tar.gz without help. Drop one here and get a ZIP with the same files: **the gzip layer and the tar layer are both unpacked in your browser** and repacked as a plain ZIP anyone can open.',
		guide: [
			{
				heading: 'Two layers, one archive',
				paragraphs: [
					'A .tar.gz is two formats stacked: tar glues files into one stream, gzip squeezes that stream. That is why Windows needs two rounds to open one — and why this converter unwraps both layers before building the ZIP. Source releases, GitHub downloads and node module tarballs all come this shape; convert them once and forget the trivia.'
				]
			}
		],
		faq: [
			{
				q: 'Which tarball flavors are supported?',
				a: 'tar.gz and .tgz, plus plain .tar, tar.bz2 and tar.xz — the decompressor recognizes the layer stack automatically, so a double-wrapped archive unwraps all the way down to the files before the ZIP is built.'
			},
			{
				q: 'What happens to unix permissions and symlinks?',
				a: 'ZIP has no real place for them, so permissions are dropped and symlinks are skipped — same as every tar-to-zip converter. For moving source code or documents that is irrelevant; for deployable server artifacts, keep the tarball.'
			},
			{
				q: 'Can it go the other way?',
				a: 'Yes — the ZIP to TAR.GZ converter repacks a ZIP as a tarball for toolchains that expect one, and the archive tab creates tar, tar.gz, tar.bz2 or tar.xz from loose files directly.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'iso-to-zip': {
		intro:
			'An ISO is a snapshot of a whole disc; sometimes all you want is the files inside without mounting anything. Drop the image here and its file tree is read in your browser and repacked as an ordinary ZIP — **no virtual drives, no admin rights, no upload**.',
		guide: [
			{
				heading: 'ISO is an archive that pretends to be a disc',
				paragraphs: [
					'File managers treat ISOs specially because they emulate optical media, but structurally an ISO is just a read-only archive with a filesystem inside. Reading it as one — the way this converter does — skips the whole mount-extract-unmount dance. The files land in a [ZIP](/zip-files) that opens anywhere, or convert onward to [7Z](/zip-to-7z) if size matters more.'
				]
			}
		],
		faq: [
			{
				q: 'Will the ZIP still be bootable like the ISO?',
				a: 'No — boot sectors and disc metadata are not files, so they do not survive any ISO-to-ZIP conversion. This is for getting at the CONTENT of an image. To write a bootable USB stick, use the original ISO with a tool like Rufus or balenaEtcher.'
			},
			{
				q: 'Which ISO variants are readable?',
				a: 'Standard ISO9660 with Joliet and Rock Ridge extensions — which covers software discs, driver CDs and most downloads. UDF-based video DVDs generally read too; copy-protected commercial discs do not.'
			},
			{
				q: 'Can I just browse the ISO without making a ZIP?',
				a: 'Yes — the Extract op on the archive tab lists every file in the image as its own download, no repacking involved. This page is the one-click version for when a single ZIP is the goal.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'zip-to-tar-gz': {
		intro:
			'Docker contexts, CI pipelines, Linux servers and package tooling all speak tar.gz; the file you were sent is a ZIP. Drop it here and the same tree comes back as a gzipped tarball — **unpacked and repacked entirely in your browser, nothing installed and nothing uploaded**.',
		guide: [
			{
				heading: 'Pick the right tarball compressor',
				paragraphs: [
					'gzip is the default for a reason: universal and quick. bzip2 lands a bit smaller, xz smaller still at real CPU cost — worth it for release artifacts downloaded thousands of times, overkill for a one-off transfer. The reverse direction is [TAR.GZ to ZIP](/tar-gz-to-zip); building tarballs from loose files lives in the [archive tool](/zip-files).'
				]
			}
		],
		faq: [
			{
				q: 'Why do unix tools prefer tar.gz over ZIP?',
				a: 'tar predates ZIP and is woven into unix workflows — it streams, it concatenates, it preserves permissions and it compresses as one solid stream, which squeezes source trees tighter than per-file ZIP deflate. When a Makefile or a server script expects a tarball, handing it a ZIP just adds friction.'
			},
			{
				q: 'Are file permissions restored in the tarball?',
				a: 'Files arrive with standard default permissions — a ZIP made on Windows never contained unix modes to begin with, so there is nothing to restore. For executables, run chmod +x after unpacking on the target machine.'
			},
			{
				q: 'Can I pick tar.bz2 or tar.xz instead?',
				a: 'Yes — this page presets tar.gz, and the format pills switch to TAR.BZ2, TAR.XZ or plain TAR before you convert. xz compresses smallest, gzip stays the fastest and most compatible.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'create-7z': {
		intro:
			'7Z out-compresses ZIP on almost everything and encrypts with AES-256 when you set a password — it can even hide the file names inside. Drop any files, pick a compression level, download one .7z. The whole build runs locally, so **your files never leave the machine**.',
		guide: [
			{
				heading: '7Z or ZIP — a one-line decision',
				paragraphs: [
					'Sending to an unknown recipient or a web form: [ZIP](/zip-files), because everything opens it. Archiving for yourself, moving big text-heavy folders, or encrypting properly: 7Z. Already have a ZIP and want it smaller? [ZIP to 7Z](/zip-to-7z) repacks it; the reverse trip is [7Z to ZIP](/7z-to-zip).'
				]
			}
		],
		faq: [
			{
				q: 'How is 7Z better than ZIP?',
				a: 'Stronger compression (LZMA2 with a real dictionary vs per-file deflate), solid archiving that exploits similarity between files, and proper AES-256 encryption with optional hidden file names. The trade-off is compatibility: recipients need 7-Zip, Keka or another modern unarchiver.'
			},
			{
				q: 'How does the password protection work?',
				a: 'Set a password and the archive encrypts with AES-256 as it is built — on your device, so the password never travels anywhere. Tick "hide file names" and even the list of contents is unreadable without it.'
			},
			{
				q: 'Which compression level should I pick?',
				a: 'Balanced is right for almost everything. Max squeezes a few extra percent out of text-heavy content at a real speed cost; Store skips compression entirely — the right call when the inputs are already-compressed photos or video and you only want one file.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'protect-zip': {
		intro:
			'Put a password on a ZIP entirely in your browser — **your files are bundled and encrypted with AES-256 on your own device**, so neither the files nor the password ever travel anywhere. Drop files, set a password, download one locked .zip.',
		guide: [
			{
				heading: 'Real encryption, not the broken kind',
				paragraphs: [
					'ZIPs can be "protected" two ways: the legacy ZipCrypto scheme, which has been practically crackable for decades, and AES-256, which is the same encryption class banks and disk encryption use. This tool always writes AES-256 — a password here actually protects the contents. The encryption happens inside the page as the archive is built; the password is used in memory and never stored or transmitted.',
					'One honest limit of the ZIP format itself: the **file names stay visible** even in an encrypted ZIP — anyone can list the contents, they just can’t open them. If the names are sensitive too, [Protect 7Z](/protect-7z) can hide the entire file list behind the password.'
				]
			},
			{
				heading: 'Opening it on the other side',
				paragraphs: [
					'Because ZipCrypto is broken, this tool doesn’t write it — but that means the built-in extractors in Windows Explorer and macOS Finder, which only understand the legacy scheme, will ask for the password and then fail. Recipients need a free unarchiver: 7-Zip or WinRAR on Windows, Keka or The Unarchiver on macOS, and most Linux file managers handle it out of the box. Mention that when you share the file.'
				]
			}
		],
		faq: [
			{
				q: 'What if I forget the password?',
				a: 'The files are gone — that is what real AES-256 encryption means. There is no backdoor, no recovery, and this site never sees or stores the password, so it cannot help either. Keep the password somewhere safe.'
			},
			{
				q: 'Why won’t Windows Explorer open my protected ZIP?',
				a: 'Built-in extractors only support the obsolete ZipCrypto scheme, which is trivially crackable — this tool deliberately writes AES-256 instead. Free tools like 7-Zip, WinRAR or Keka open it with the password.'
			},
			{
				q: 'Are the file names hidden too?',
				a: 'No — that is a limit of the ZIP format itself: contents are encrypted, the file list is not. If the names must be secret as well, use Protect 7Z, which can encrypt the headers so even the list needs the password.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'protect-7z': {
		intro:
			'Create a password-protected 7Z entirely in your browser — **AES-256 encryption with an option to hide even the file names**, built locally so files and password never leave your device. Drop files, set a password, download one locked .7z.',
		guide: [
			{
				heading: 'AES-256, and nothing to list without the password',
				paragraphs: [
					'7Z encrypts with AES-256 as the archive is built. Tick “Also hide file names inside the archive” and the archive headers are encrypted too — without the password an attacker cannot even see what files are inside, let alone open them. That header encryption is something the ZIP format cannot do ([Protect ZIP](/protect-zip) explains the difference), and it is the reason 7Z is the better choice when the file names themselves are sensitive.',
					'The password is used in memory on your device and never stored or transmitted; there is no account, no cloud, no recovery service. Compression still applies before encryption, so a protected 7Z is usually also the smallest way to ship the files — [Create 7Z](/create-7z) covers the compression side in detail.'
				]
			},
			{
				heading: 'Opening it on the other side',
				paragraphs: [
					'Recipients open the archive with any modern unarchiver — 7-Zip on Windows, Keka on macOS, p7zip on Linux, all free. On the way back, [Extract 7Z](/extract-7z) opens password-protected 7Z archives right in the browser, including ones with hidden file names.'
				]
			}
		],
		faq: [
			{
				q: 'What does “hide file names” actually do?',
				a: 'It encrypts the archive headers (7-Zip’s -mhe switch), so the list of contents is unreadable without the password. Without it, an encrypted 7Z still shows its file names — like a locked box with a printed inventory.'
			},
			{
				q: 'Can the password be recovered?',
				a: 'No. AES-256 has no backdoor, and this site never sees or stores the password — the encryption runs entirely on your device. A forgotten password means the contents are permanently unreadable.'
			},
			{
				q: 'Does the protection weaken the compression?',
				a: 'No — files are compressed first and encrypted after, so a protected 7Z is the same size as an unprotected one. Encrypted data itself cannot be compressed, which is why the order matters and why the tool handles it for you.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'create-tar': {
		intro:
			'A tar file glues many files into one stream without compressing them — the format unix tooling has expected since the tape-drive era. Drop files, download one .tar. **Built entirely in your browser**; combine it with gzip or xz here too if you want it compressed.',
		guide: [
			{
				heading: 'tar, tar.gz, tgz — the family tree',
				paragraphs: [
					'tar bundles; gzip/bzip2/xz compress the bundle. tar.gz (or .tgz — same thing) is the everyday combination, and [Create TAR.GZ](/create-tar-gz) builds it in one step. A plain tar from this page can also be compressed later with [Gzip](/gzip-files) — the result is byte-for-byte a tar.gz.'
				]
			},
			{
				heading: 'tar for machines',
				paragraphs: [
					'tar’s real audience today is software, not people. The format is one strictly sequential stream — no index to seek, no directory at the end — which makes it perfect for pipes: a producer can start writing while the consumer starts reading, and two tars concatenate into a valid third.',
					'That is why machine interfaces keep asking for it: docker build sends your context to the daemon as a tar stream, kubectl cp moves files in and out of containers the same way, CI systems tar cache directories between jobs, and plenty of upload APIs accept exactly one uncompressed .tar. When the consumer is a program, plain tar is not a missing feature — it is the spec.'
				]
			}
		],
		faq: [
			{
				q: 'Why is my tar as big as the inputs combined?',
				a: 'Because tar does not compress — it only concatenates files with headers. That is by design: compression is a separate layer (gzip, bzip2, xz) applied over the tar. Pick TAR.GZ on this page instead if you want the compressed kind.'
			},
			{
				q: 'When is a plain uncompressed tar actually right?',
				a: 'When the consumer expects one: docker build contexts, some upload APIs, streaming pipelines, and cases where the content is already compressed (photos, video) so a gzip layer would only waste time.'
			},
			{
				q: 'Does it preserve folder structure?',
				a: 'Files land at the archive root with their names — the browser does not hand websites full folder trees on drop. For nested structure, tar an existing archive after converting it, or accept the flat layout most transfers actually need.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'create-tar-gz': {
		intro:
			'The tarball is how source code, releases and server payloads travel in the unix world. Drop files, get one .tar.gz — **tarred and gzipped entirely in your browser**. The format pills switch to tar.bz2 for a smaller file or tar.xz for the smallest, when the extra build time is worth it.',
		guide: [
			{
				heading: 'One stream beats many small ones',
				paragraphs: [
					'ZIP compresses each file separately, so a thousand small source files each pay the overhead alone. A tarball compresses the whole tar as one stream, letting the compressor exploit repetition ACROSS files — that is why source releases ship as .tar.gz. Already have a ZIP? [ZIP to TAR.GZ](/zip-to-tar-gz) converts it; the other direction is [TAR.GZ to ZIP](/tar-gz-to-zip).'
				]
			},
			{
				heading: 'The tarball compressors, measured',
				paragraphs: [
					'Same tar underneath, three squeezes — the format pills switch between them. On a typical source tree or text-heavy payload the trade looks like this:'
				],
				table: {
					columns: ['Compressor', 'Size', 'Speed'],
					rows: [
						[
							'gzip (.tar.gz)',
							'Baseline — roughly a third of the original',
							'Fast to build, fast to unpack'
						],
						['bzip2 (.tar.bz2)', '10–20% below gzip', 'Noticeably slower to build'],
						['xz (.tar.xz)', '25–40% below gzip', 'Slowest build by far; unpacking stays quick']
					]
				}
			}
		],
		faq: [
			{
				q: 'tar.gz or .tgz — is there a difference?',
				a: 'None — .tgz is just the DOS-era short spelling of .tar.gz. Every tool that opens one opens the other; this page names outputs .tar.gz, the long form most tooling writes today.'
			},
			{
				q: 'gzip, bzip2 or xz for my tarball?',
				a: 'gzip is the compatibility-and-speed default. bzip2 lands a bit smaller and slower. xz compresses smallest of the three at a real CPU cost — the usual pick for release artifacts that get downloaded many times but built once.'
			},
			{
				q: 'Why a tarball instead of a ZIP?',
				a: 'Unix toolchains, Makefiles, CI pipelines and package managers expect tarballs — and compressing the whole bundle as one stream squeezes source trees tighter than per-file ZIP compression. For sending files to people rather than machines, ZIP stays the friendlier pick.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'create-tar-bz2': {
		intro:
			'Bundle any files into a .tar.bz2 right in your browser — **tar joins them, bzip2 squeezes them, nothing is uploaded**. The classic unix pairing for source trees and text-heavy payloads, built without touching a terminal.',
		guide: [
			{
				heading: 'Where bz2 sits between gz and xz',
				paragraphs: [
					'bzip2 lands noticeably smaller than gzip on text and source code, at a real speed cost — the middle child of the tarball family. [Create TAR.GZ](/create-tar-gz) stays the fast, maximally compatible default; [Create TAR.XZ](/create-tar-xz) squeezes hardest of the three. Compressing single files without the tar wrapper is [Bzip2 files](/bzip2-files).'
				]
			},
			{
				heading: 'Where .tar.bz2 survives today',
				paragraphs: [
					'bzip2’s decade as the ratio champion ended when xz arrived, and new projects rarely pick it — but the format is far from dead. Long-lived build pipelines and Makefiles stay pinned to the .tar.bz2 they were written against, mirrored archives keep historical releases in the format their checksums were published for, and a mountain of scientific datasets was archived in it during the 2000s.',
					'It also kept one technical card: bzip2 compresses in independent 900 KB blocks, which makes parallel decompression natural — tools like pbzip2 saturate every core, something classic single-stream gzip cannot do. If a consumer on the other end expects .tar.bz2, producing exactly that here is the whole point of this page.'
				]
			}
		],
		faq: [
			{
				q: 'Why choose bz2 over gz?',
				a: 'Better ratios on text, logs and source trees — typically 10–20% smaller than gzip — in exchange for slower compression. For payloads downloaded many times, the trade pays for itself.'
			},
			{
				q: 'Will Windows open a .tar.bz2?',
				a: '7-Zip, WinRAR and PeaZip all open it; stock Explorer does not. For non-technical recipients a ZIP is the friendlier handoff — tarballs are for unix-shaped destinations.'
			},
			{
				q: 'Is there a file-size limit?',
				a: 'Only your device’s memory — nothing is uploaded, so no server cap applies. Multi-hundred-MB bundles are routine.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'create-tar-xz': {
		intro:
			'Bundle files into a .tar.xz entirely in your browser — **the tightest mainstream tarball format, built locally with nothing uploaded**. The packaging Linux distributions and software releases standardized on, one drag-and-drop away.',
		guide: [
			{
				heading: 'Maximum squeeze, understood trade-offs',
				paragraphs: [
					'xz (LZMA2) typically undercuts gzip by 25–40% on compressible payloads, which is why release artifacts ship as .tar.xz — built once, downloaded many times. The price is CPU: creation is the slowest of the family, so patience on big trees is normal. [Create TAR.GZ](/create-tar-gz) wins when speed or maximum compatibility matters, and [Create 7Z](/create-7z) offers the same LZMA family plus AES-256 encryption.'
				]
			},
			{
				heading: 'What ships as .tar.xz',
				paragraphs: [
					'The format earned its place at the top of the food chain — where a file is built once and downloaded millions of times, the extra build minutes buy real bandwidth:'
				],
				table: {
					columns: ['Ecosystem', 'Why xz'],
					rows: [
						[
							'kernel.org',
							'Linux kernel sources ship as .tar.xz — bandwidth at that scale is money'
						],
						['GNU and GNOME releases', 'The project standard for source tarballs'],
						['Debian source packages', 'orig tarballs moved from gz to xz years ago'],
						['Slackware packages', 'The distribution’s .txz package is a tar.xz by another name']
					]
				}
			}
		],
		faq: [
			{
				q: 'How much smaller than tar.gz?',
				a: 'Typically 25–40% on source code, text and mixed payloads. Already-compressed content (media, existing archives) barely budges in any format.'
			},
			{
				q: 'Why does creating it take so long?',
				a: 'xz trades CPU for ratio by design — it searches much harder for redundancy than gzip. The decompress side is fast; only creation is slow.'
			},
			{
				q: 'Who can open .tar.xz?',
				a: 'Every modern unix out of the box, and 7-Zip or PeaZip on Windows. For non-technical recipients, ZIP remains the safer handoff.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'gzip-files': {
		intro:
			'Gzip compresses a single file into a single .gz — no bundling, no archive semantics, just the exact stream format web servers, log rotators and unix tools speak. Drop files and each one comes back as its own .gz, **compressed entirely on your device**.',
		guide: [
			{
				heading: 'Stream formats vs archives',
				paragraphs: [
					'gzip, bzip2 and xz compress ONE stream; tar, zip and 7z hold MANY files. The unix convention stacks them — tar bundles, gzip compresses, giving tar.gz. When one download containing everything is the goal, [Create TAR.GZ](/create-tar-gz) or the [archive tool](/zip-files) is the right shape; when a pipeline wants file.gz, this page is.'
				]
			}
		],
		faq: [
			{
				q: 'Why did I get three .gz files instead of one archive?',
				a: 'Because gzip is a stream compressor, not an archive format — one input, one output, no file list inside. That is the correct behavior: report.csv becomes report.csv.gz. To bundle many files into ONE download, create a tar.gz or a ZIP instead.'
			},
			{
				q: 'What actually shrinks with gzip?',
				a: 'Text of every kind — logs, CSV, JSON, SQL dumps, SVG, HTML — routinely drops 70-90%. Already-compressed formats (JPG, MP4, ZIP) barely move; gzipping those just costs time.'
			},
			{
				q: 'Will servers and command-line tools accept these files?',
				a: 'Yes — the output is standard RFC 1952 gzip, identical to what the gzip command produces. gunzip, zcat, pandas, nginx and every HTTP client that speaks Content-Encoding: gzip read it directly.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'bzip2-files': {
		intro:
			'Bzip2 sits between gzip and xz: noticeably smaller output than gzip on text, without the xz build times. Drop files and each comes back as its own .bz2, **compressed on your device** — the exact format bunzip2 and every unix toolchain expect.',
		guide: [
			{
				heading: 'The three unix compressors, ranked',
				paragraphs: [
					'gzip: fastest, universal, good-enough ratios. bzip2: slower, ~10-20% smaller on text. xz: slowest, smallest, the modern archival pick — [XZ files](/xz-files) builds those. All three wrap around tar the same way; [Create TAR.GZ](/create-tar-gz) offers each as a one-step tarball.'
				]
			}
		],
		faq: [
			{
				q: 'When is bzip2 the right pick?',
				a: 'When a consumer specifically expects .bz2 (plenty of scientific datasets, Wikipedia dumps and older pipelines do), or when you want better-than-gzip text compression and xz feels slow. For new greenfield choices, gzip for speed or xz for size are the usual endpoints.'
			},
			{
				q: 'Why is my .bz2 not smaller than a .gz of the same file?',
				a: 'On already-compressed content (media, archives) no compressor helps — all of them hover near the original size. Bzip2 wins on text and structured data; that is where its block-sorting algorithm gets traction.'
			},
			{
				q: 'One file in, one file out — where is the archive?',
				a: 'Bzip2 is a stream compressor like gzip: no bundling, no file list. Each input becomes input.bz2. For one archive holding everything, build a tar.bz2 on the Create TAR.GZ page (switch the format pill) or a ZIP.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'xz-files': {
		intro:
			'XZ is the strongest of the classic unix compressors — the same LZMA2 engine 7Z uses, wrapped in a single-file stream. Drop files and each returns as its own .xz, **built locally**. Expect the smallest results on text and data, at the cost of more compute than gzip.',
		guide: [
			{
				heading: 'Where xz earns its CPU bill',
				paragraphs: [
					'Compress once, download many — that is the xz sweet spot: release artifacts, datasets, backups. For quick one-off transfers [gzip](/gzip-files) finishes faster than xz starts mattering. Bundling a folder first? [Create TAR.GZ](/create-tar-gz) switches to tar.xz with one pill; a full archive with encryption is [Create 7Z](/create-7z).'
				]
			}
		],
		faq: [
			{
				q: 'How much smaller is xz than gzip really?',
				a: 'On text, source code and databases, 25-40% smaller output is typical; on mixed content less; on already-compressed media, nothing — no compressor beats entropy. The Max level widens the gap further at a real time cost.'
			},
			{
				q: 'What opens .xz files?',
				a: 'xz and unxz on every unix, 7-Zip and modern archive managers on Windows, The Unarchiver or Keka on macOS. It has been the default compression of kernel releases and many Linux packages for over a decade — support is everywhere that matters.'
			},
			{
				q: 'Why not just use 7Z?',
				a: 'Same engine, different wrapper: .xz holds exactly one stream and slots into unix pipelines (tar.xz, xz -d, streaming); .7z is a full archive with a file list, encryption and per-file access. Machines usually want xz, humans usually want 7z.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'extract-rar': {
		intro:
			'Someone sent a .rar and Windows just shrugs. Drop it here instead: every file inside becomes its own download, straight in your browser — RAR v4 and v5, password-protected ones too. No WinRAR trial, no sketchy installer, **no upload to a stranger with a server**.',
		guide: [
			{
				heading: 'Out of RAR, into anything',
				paragraphs: [
					'Extraction gives you the files; sometimes you want them back in an archive that opens everywhere. [RAR to ZIP](/rar-to-zip) does exactly that in one step. The [archive tool](/zip-files) is the general-purpose version of this page — every format, create and extract, one place.'
				]
			},
			{
				heading: 'Where RARs still come from',
				paragraphs: [
					'RAR thrives where something was archived once and downloaded for years — so the .rar reaching you today usually fits a recognizable pattern:'
				],
				table: {
					columns: ['The source', 'What to expect inside'],
					rows: [
						[
							'A photo or design studio handoff',
							'Multi-GB image sets — studios standardized on WinRAR long ago'
						],
						['Game mods and fan patches', 'Loose files meant to be dropped into a game folder'],
						['Old forums and download portals', 'Software and media packs from RAR’s heyday'],
						[
							'A family backup from a past decade',
							'Documents and photos worth more than the format holding them'
						]
					]
				}
			}
		],
		faq: [
			{
				q: 'Do password-protected RARs work?',
				a: 'Yes — enter the password in the panel and the archive decrypts locally, including RAR5 archives with encrypted file names. A wrong password gets a clear message, not a folder of corrupted files.'
			},
			{
				q: 'Is this legal without WinRAR?',
				a: 'Completely. RAR decompression is freely licensed — that is why 7-Zip and every unarchiver can open RARs. Only CREATING rar files requires WinRAR, because the compressor is proprietary.'
			},
			{
				q: 'What about multi-part archives (.part1.rar, .r00)?',
				a: 'Multi-volume sets need every volume present at once, which browser file handling does not guarantee — single-file archives are the supported case. Join the set with a desktop tool once, then any single .rar works here.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-7z': {
		intro:
			'A .7z on a machine without 7-Zip is a locked box. This page is the key: drop the archive and each file inside becomes its own download, **decompressed entirely in your browser** — LZMA2, encrypted archives, even ones whose file list is hidden behind the password.',
		guide: [
			{
				heading: 'Loose files or a friendlier archive',
				paragraphs: [
					'Need the contents once? Extract here and grab the files. Passing the archive along? [7Z to ZIP](/7z-to-zip) rebuilds it as a ZIP anyone can open, and [Create 7Z](/create-7z) makes fresh 7Z archives — with AES-256 if you set a password.'
				]
			},
			{
				heading: 'What tends to travel as 7Z',
				paragraphs: ['Nobody picks 7Z casually — it shows up where its strengths were the point:'],
				table: {
					columns: ['The source', 'Why it came as 7Z'],
					rows: [
						['Dataset and database dumps', 'LZMA2 lands text and CSV 20–40% below ZIP'],
						[
							'A power user’s backup or handoff',
							'7-Zip is simply the default archiver on their machine'
						],
						['Encrypted deliveries', 'AES-256 with hidden file names beats ZIP’s aging crypto'],
						['Firmware and driver mirrors', 'Compressed once, downloaded thousands of times']
					]
				}
			}
		],
		faq: [
			{
				q: 'Do encrypted 7Z archives open?',
				a: 'Yes — both flavors. Data-encrypted archives list their contents and ask the password to extract; header-encrypted ones (-mhe) reveal nothing until the password is right. Either way decryption happens locally.'
			},
			{
				q: 'Why do people ship 7Z instead of ZIP anyway?',
				a: 'Compression. On text, code and databases 7Z routinely lands 20-40% smaller than ZIP — worth the compatibility tax inside teams that all run 7-Zip. This page removes that tax for everyone else.'
			},
			{
				q: 'Can I turn the 7Z into a ZIP instead of loose files?',
				a: 'Yes — the 7Z to ZIP converter repacks the whole archive in one step, folders intact, so you get a single file that opens everywhere instead of individual downloads.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-tar-gz': {
		intro:
			'A .tar.gz is two wrappers deep — gzip around tar around your files — which is why double-clicking one on Windows goes nowhere. Drop it here and **both layers unwrap automatically**; plain .tar, .tar.bz2 and .tar.xz work the same way. Each file inside becomes its own download.',
		guide: [
			{
				heading: 'The tarball, translated',
				paragraphs: [
					'Source releases, GitHub archive downloads and node package tarballs all arrive as .tar.gz. Want a single Windows-friendly file instead of loose downloads? [TAR.GZ to ZIP](/tar-gz-to-zip) repacks in one step. Building tarballs from scratch is [Create TAR.GZ](/create-tar-gz).'
				]
			},
			{
				heading: 'The tarballs that land on non-unix desks',
				paragraphs: [
					'A tarball on a Windows or phone screen almost always arrived one of a few ways — and knowing which tells you what is inside:'
				],
				table: {
					columns: ['You got it from', 'Inside'],
					rows: [
						[
							'GitHub’s “Download source” button',
							'The repository tree at that tag, one folder deep'
						],
						['An npm package download', 'A package/ folder with the published files'],
						['A server or hosting backup', 'Site files and database dumps, usually timestamped'],
						[
							'A Linux-first vendor’s download page',
							'Binaries and a README expecting a unix unpack'
						]
					]
				}
			}
		],
		faq: [
			{
				q: 'Why does Windows open tar.gz in two steps?',
				a: 'Because it really is two formats: unzipping the gzip layer yields a .tar, which needs opening again. This page runs the whole chain in one pass — you never see the intermediate tar.'
			},
			{
				q: 'Which tarball variants unpack here?',
				a: 'tar.gz and .tgz, plain .tar, tar.bz2 and tar.xz — the layer stack is detected from the bytes, not the file name, so mislabeled downloads unpack fine too.'
			},
			{
				q: 'What happens to file permissions and symlinks?',
				a: 'Browsers have no concept of unix permissions, so files download with defaults and symlinks are skipped. For source code and documents that is irrelevant; to deploy something executable, unpack on the target machine instead.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-gz': {
		intro:
			'Log rotations, database dumps and API exports land as .gz — one compressed file, no archive inside. Drop them here and the original comes back: access.log.gz turns into access.log, **decompressed entirely on your device**. A .tar.gz unwraps all the way to its files automatically.',
		guide: [
			{
				heading: 'gunzip, minus the terminal',
				paragraphs: [
					'On a machine with a shell, gunzip does this in a keystroke; on a locked-down laptop or a phone, this page is the shell-free equivalent. The reverse — making .gz files — is [Gzip files](/gzip-files); bundling many files into one compressed download is [Create TAR.GZ](/create-tar-gz).'
				]
			},
			{
				heading: 'The everyday .gz, by habitat',
				paragraphs: [
					'Single-file gzip is infrastructure’s favorite wrapper, and the file name usually announces exactly what came out of where:'
				],
				table: {
					columns: ['File', 'What it is'],
					rows: [
						[
							'access.log.gz, error.log.1.gz',
							'Rotated web-server logs — logrotate gzips the older days'
						],
						['dump.sql.gz', 'A database export; many restore tools read it compressed'],
						[
							'export.csv.gz, data.json.gz',
							'API and analytics exports shipped small to save bandwidth'
						],
						['anything.tar.gz', 'Not a single file — a tarball, and it unwraps fully here too']
					]
				}
			}
		],
		faq: [
			{
				q: 'Is .gz the same as .zip?',
				a: 'No — gzip compresses exactly one file and holds no file list. ZIP is an archive of many. The confusion comes from tar.gz, where a tar bundle rides inside the gzip; this page recognizes that case and unpacks both layers.'
			},
			{
				q: 'Can I open huge server logs this way?',
				a: 'Yes — the practical ceiling is your device memory, not an upload cap, because nothing uploads. A multi-hundred-MB log.gz decompresses in seconds; the browser downloads the result like any file.'
			},
			{
				q: 'What about .bz2 and .xz files?',
				a: 'Same story, different compressor — and the same answer: drop them on this page or the archive tab and they decompress locally. All three families share one engine here.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-z': {
		intro:
			'Decompress unix .Z files right in your browser — **the 1980s compress format, opened with nothing installed and nothing uploaded**. Old distribution archives, university mirrors and legacy backups come back as their original files; a .tar.Z unwraps all the way through.',
		guide: [
			{
				heading: 'A format older than the web',
				paragraphs: [
					'.Z predates gzip: it is the output of compress(1), built on 1984-vintage LZW, and modern systems often ship without the tool that reads it — exactly why a browser page is the convenient way in. Chains like source.tar.Z unwrap both layers automatically, first the .Z stream, then the tar bundle. Newer single-file cousins live on [Extract GZ](/extract-gz), and everything else archive-shaped opens on [Zip & Unzip](/zip-files).'
				]
			},
			{
				heading: '.Z and .gz, side by side',
				paragraphs: [
					'gzip was written specifically to replace compress — LZW was patent-encumbered in the early 90s, and the free replacement also happened to compress better. The family resemblance comes with clear tells:'
				],
				table: {
					columns: ['Trait', '.Z (compress)', '.gz (gzip)'],
					rows: [
						['Era', '1984 to the early 90s', '1992 onward'],
						['Algorithm', 'LZW — the patent that started it all', 'DEFLATE, patent-free by design'],
						['Natural habitat', 'FTP mirrors, tape backups, SunOS-era sources', 'Everything since'],
						['Compression', 'Modest', 'Noticeably tighter on the same input']
					]
				}
			}
		],
		faq: [
			{
				q: 'What created these .Z files?',
				a: 'The unix compress utility, standard through the eighties and nineties — FTP mirrors, tape backups and source distributions of that era are full of them.'
			},
			{
				q: 'What about .tar.Z files?',
				a: 'Recognized and unwrapped in one pass — the .Z layer is decompressed, then the tar bundle inside unpacks to its files automatically.'
			},
			{
				q: 'Can I create .Z files here?',
				a: 'No — the format is obsolete for new archives. Make .gz or .xz instead; every system that reads .Z also reads those.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-iso': {
		intro:
			'An ISO wants to be mounted as a virtual disc before it shows its files — an odd ceremony when you just need one installer or driver out of it. Drop the image here and **its file tree reads directly in your browser**: every file becomes its own download, no drive letters involved.',
		guide: [
			{
				heading: 'What survives, what cannot',
				paragraphs: [
					'Every FILE on the disc extracts byte-perfect. What does not survive is bootability — boot sectors are disc plumbing, not files, so extracting (or [converting to ZIP](/iso-to-zip)) never yields a bootable copy. To write a bootable USB, hand the original ISO to Rufus or balenaEtcher and let it do its thing.'
				]
			},
			{
				heading: 'Anatomy of a disc image',
				paragraphs: [
					'An ISO is a filesystem frozen into a file, and its layers explain both what you get here and what no extractor can give you:'
				],
				table: {
					columns: ['Piece', 'What it holds'],
					rows: [
						['ISO9660 file tree', 'Every file and folder on the disc — extracts byte-perfect'],
						[
							'Joliet / Rock Ridge extensions',
							'Long and unicode file names — applied automatically'
						],
						[
							'El Torito boot record',
							'The bootable part — plumbing, not a file; it cannot survive extraction'
						],
						[
							'UDF layer (newer media)',
							'Readable in most cases; copy-protected video discs are the exception'
						]
					]
				}
			}
		],
		faq: [
			{
				q: 'Do I need admin rights or a virtual drive?',
				a: 'No — that is the point. The image is parsed as a file, in the browser sandbox; nothing touches the operating system, so it works on locked-down work machines where mounting is blocked.'
			},
			{
				q: 'Which disc formats read correctly?',
				a: 'ISO9660 with Joliet and Rock Ridge — the shape of software discs, driver CDs and OS images — plus UDF-based media in most cases. Copy-protected commercial video discs are the exception.'
			},
			{
				q: 'Can I make the ISO into a ZIP instead?',
				a: 'Yes — the ISO to ZIP converter repacks the whole image as one ZIP in a single step, which beats downloading files one by one when you want everything.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-cab': {
		intro:
			'CAB is the archive format Windows itself ships in — drivers, installers and updates all travel as cabinets. When you need one file out of a driver package (or you are just curious), drop the .cab here: **contents extract in your browser**, each file its own download.',
		guide: [
			{
				heading: 'From cabinet to anywhere',
				paragraphs: [
					'Extracted driver files usually go straight to Device Manager, but when a set of files should travel on, repack them via the [archive tool](/zip-files) into a [ZIP](/zip-files) or [7Z](/create-7z). Old software archives often nest formats — a CAB inside a ZIP inside an ISO all opens here, one layer per drop.'
				]
			},
			{
				heading: 'What cabinets carry',
				paragraphs: [
					'Microsoft has shipped its platform in cabinets for thirty years, so the contents follow the job the .cab arrived to do:'
				],
				table: {
					columns: ['Cabinet', 'Typical contents'],
					rows: [
						['A driver package', 'The INF, SYS, DLL and CAT files Device Manager asks for'],
						['A Windows Update payload', 'System files staged for servicing'],
						['Inside an .msi installer', 'The application files the installer copies out'],
						['A printer or vendor bundle', 'Firmware blobs and setup utilities']
					]
				}
			}
		],
		faq: [
			{
				q: 'Where do CAB files even come from?',
				a: 'Driver downloads, Windows Update payloads, installer internals (.msi files often embed cabinets) and printer packages. Vendors still ship raw .cab driver bundles, and manually extracting one INF or DLL from them is the classic use case.'
			},
			{
				q: 'Which CAB compression variants are supported?',
				a: 'MSZIP and LZX — which covers essentially every cabinet Microsoft tooling produces. Multi-part cabinet SETS (spanning several .cab files) need all parts and are not supported; single cabinets, the overwhelmingly common case, extract fine.'
			},
			{
				q: 'Can it open .msi or .exe installers too?',
				a: 'Not directly — those are container formats around cabinets. If you can get the .cab out (many installers unpack with /extract or similar switches), it opens here.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-deb': {
		intro:
			'A .deb is an archive-in-an-archive: an ar wrapper holding control metadata and a data tarball with the actual files. Drop one here and **the chain unwraps automatically down to the real payload** — binaries, configs, docs — each file its own download, no Linux machine required.',
		guide: [
			{
				heading: 'deb and rpm are cousins',
				paragraphs: [
					'Both package formats are thin wrappers around a standard archive — deb wraps a tar, [rpm](/extract-rpm) wraps a cpio. That is why one engine opens both, and why the files inside look so ordinary once unwrapped. For repacking extracted files, the [archive tool](/zip-files) builds any format.'
				]
			},
			{
				heading: 'Anatomy of a .deb',
				paragraphs: [
					'Under the extension sits an ar archive holding exactly three members, in strict order — and only the last one is what you came for:'
				],
				table: {
					columns: ['Member', 'What it holds'],
					rows: [
						['debian-binary', 'The format version — four bytes of ceremony (“2.0”)'],
						['control.tar.(gz|xz)', 'Metadata: dependencies, checksums, maintainer scripts'],
						['data.tar.(gz|xz|zst)', 'The payload — every file the package would install']
					]
				}
			}
		],
		faq: [
			{
				q: 'Why do other tools show me data.tar.xz instead of files?',
				a: 'Because they stop at the ar layer. A .deb holds data.tar.(gz|xz|zst) inside; this page detects that payload and unpacks it in the same pass, so you land on the files, not on another archive.'
			},
			{
				q: 'Does extracting a deb install anything?',
				a: 'No — installation is what dpkg does with the payload plus its maintainer scripts. Extraction here just reads files out; nothing runs, nothing touches your system. It is the safe way to inspect a package before trusting it.'
			},
			{
				q: 'What are the control files it mentions skipping?',
				a: 'Package metadata — dependency lists, maintainer scripts, checksums — that lives in a separate control tarball. The extraction focuses on the data payload where the actual files are; the note just tells you the metadata was left out.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-rpm': {
		intro:
			'Fedora, RHEL and SUSE ship software as .rpm — a header stapled to a compressed cpio payload. The classic unix answer is rpm2cpio piped through cpio; **the browser answer is this page**. Drop the package and the payload unwraps to its actual files automatically.',
		guide: [
			{
				heading: 'rpm2cpio, retired',
				paragraphs: [
					'The rpm payload chain (rpm → cpio.xz → cpio → files) is exactly the kind of nesting the extractor chases automatically — same as [deb packages](/extract-deb) and [tarballs](/extract-tar-gz). Plain [cpio archives](/extract-cpio) open directly too.'
				]
			},
			{
				heading: 'Anatomy of an .rpm',
				paragraphs: [
					'An rpm reads like a stack of stapled sections, and only the bottom one holds files:'
				],
				table: {
					columns: ['Section', 'What it holds'],
					rows: [
						['Lead + signature', 'Magic bytes and GPG signatures — package-manager territory'],
						['Header', 'Name, version, dependencies and the promised file list'],
						['Payload', 'A compressed cpio archive with the actual files — what extracts here']
					]
				}
			}
		],
		faq: [
			{
				q: 'Why does my rpm show a .cpio file in other tools?',
				a: 'Those tools peel only the first layer. The payload inside an rpm is a cpio archive (gzip-, xz- or zstd-compressed); this page detects it and unpacks that too, so you get files instead of homework.'
			},
			{
				q: 'Can I extract an rpm on Windows or macOS?',
				a: 'That is exactly the point — no rpm tooling exists there by default, and installing a Linux VM to peek at one package is absurd. Everything runs in the browser, on any OS.'
			},
			{
				q: 'Does this install or run the package?',
				a: 'No — scripts and triggers inside packages never execute. Files are read out passively, which makes this a safe way to audit what a package would put on disk.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-cpio': {
		intro:
			'cpio is tar’s older sibling — still underneath rpm packages, initramfs images and plenty of unix backup scripts. Drop a .cpio (or a .cpio.gz) here and **its files extract right in the browser**, no pipe incantations required.',
		guide: [
			{
				heading: 'The pipeline, without the pipes',
				paragraphs: [
					'The terminal recipe — gunzip | cpio -idmv — assumes a shell, the right flags and some scar tissue. Dropping the file here is the flat-pack version. Related plumbing: [rpm packages](/extract-rpm) unwrap to cpio automatically, and [tarballs](/extract-tar-gz) get the same treatment on their side of the family.'
				]
			},
			{
				heading: 'Where cpio still lives',
				paragraphs: [
					'cpio lost the human-facing war to tar decades ago, but it never left the plumbing:'
				],
				table: {
					columns: ['Habitat', 'What it is doing there'],
					rows: [
						['initramfs / initrd images', 'The early-boot filesystem Linux unpacks into RAM'],
						['rpm package payloads', 'The file archive under every Fedora and SUSE package'],
						['Firmware update bundles', 'Vendors staple cpio blobs into their updaters'],
						['Old backup scripts', 'find | cpio pipelines from before tar won']
					]
				}
			}
		],
		faq: [
			{
				q: 'Where would I even meet a cpio file?',
				a: 'Inside rpm packages (their payload is cpio), Linux initramfs/initrd images, some firmware update bundles and old-school backup scripts. When one surfaces, this page opens it without remembering cpio flag soup.'
			},
			{
				q: 'Which cpio variants are readable?',
				a: 'The common ones — newc/SVR4 (what rpm and initramfs use) and the classic formats. Compressed variants like .cpio.gz unwrap their compression layer automatically first.'
			},
			{
				q: 'Why does the unix world have both tar and cpio?',
				a: 'History — they solved the same problem in different 1970s corners. tar won the human-facing war; cpio survives embedded in formats that picked it decades ago and never needed to change.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-lha': {
		intro:
			'LHA (.lzh) ruled Japanese software distribution and the Amiga scene long before ZIP won globally — and retro archives, abandonware collections and old game mods still carry it. Drop one here and **its files extract in your browser**, no vintage tooling required.',
		guide: [
			{
				heading: 'Rescuing old archives',
				paragraphs: [
					'Retro collections mix formats freely — LHA next to [ARJ](/extract-arj) next to early ZIP. Everything opens on the same [archive tab](/zip-files), and once extracted, repacking into a modern [7Z](/create-7z) keeps the bytes and drops the archaeology.'
				]
			},
			{
				heading: 'Where .lzh files surface today',
				paragraphs: [
					'The format faded from daily use around the millennium, but whole preservation scenes still speak it fluently:'
				],
				table: {
					columns: ['The trove', 'What is inside'],
					rows: [
						['Amiga software collections', 'Games and demos — .lha was the platform’s standard'],
						['Japanese BBS-era archives', 'Software and doujin works; names may be Shift-JIS'],
						['PC-98 preservation sites', 'A whole Japanese computing lineage packed in .lzh'],
						['Shareware CD-ROMs', 'Thousands of small archives pressed in the early 90s']
					]
				}
			}
		],
		faq: [
			{
				q: 'LHA or LZH — which is it?',
				a: 'The same format: LHA is the archiver, .lzh its usual extension (with .lha common on Amiga). Both extensions open identically here.'
			},
			{
				q: 'Do Japanese file names decode correctly?',
				a: 'Usually — but archives from 90s Japanese systems often store names in Shift-JIS, which no modern tool can always guess right. File CONTENT extracts perfectly either way; a garbled name is cosmetic and can be fixed after download.'
			},
			{
				q: 'What made LHA special back then?',
				a: 'It was free with source code when PKZIP was shareware — so Japanese vendors, id Software (DOOM shipped in LHA!) and the Amiga community standardized on it. A nice reminder that formats win on licensing as much as on ratio.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'extract-arj': {
		intro:
			'ARJ compressed half the BBS scene and a generation of floppy backups before ZIP took the crown. The files still exist; the tooling mostly does not. Drop an .arj here and **its contents extract right in your browser** — old family backups included.',
		guide: [
			{
				heading: 'Digital archaeology, in a tab',
				paragraphs: [
					'ARJ sits alongside [LHA](/extract-lha) and early ZIP in most retro collections — all three open here. Once rescued, files worth keeping deserve a modern container: [7Z with AES](/create-7z) for private archives, [ZIP](/zip-files) for anything meant to be shared.'
				]
			},
			{
				heading: 'What an .arj usually turns out to be',
				paragraphs: [
					'ARJ’s window was narrow — roughly 1991 to 1995 — which makes the contents unusually predictable:'
				],
				table: {
					columns: ['The source', 'Expect inside'],
					rows: [
						['A DOS-era backup run', 'Documents, spreadsheets and dBase files from the family 386'],
						['BBS download folders', 'Shareware, text-file zines and door games'],
						[
							'A floppy-spanned set (.a01, .a02…)',
							'Only a joined single archive opens — see the FAQ'
						],
						['Driver disks from the attic', 'Sound-card and modem installers nobody dares delete']
					]
				}
			}
		],
		faq: [
			{
				q: 'Why would I have ARJ files in 2026?',
				a: 'Old backups, BBS-era downloads, shareware CDs and files inherited from a DOS machine. ARJ was mainstream from roughly 1991 to 1995 — anything archived then has decent odds of wearing this extension.'
			},
			{
				q: 'Are multi-volume ARJ sets (.a01, .a02) supported?',
				a: 'No — split sets were designed for floppy spanning and need every volume joined in order. Single .arj files, which is what most surviving archives are, extract fine.'
			},
			{
				q: 'Is the extraction faithful to the original bytes?',
				a: 'Yes — ARJ stored CRCs per file and the decoder verifies them, so what comes out is exactly what went in three decades ago, or you get an error instead of silent corruption.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_EXTRACT }
		]
	},
	'compress-epub': {
		intro:
			'Compress EPUB e-books entirely in your browser — **only the images inside are re-encoded; every word, style and page break stays byte-identical**. Drop the .epub files, pick a quality, and download lighter books that read exactly the same. Nothing is uploaded.',
		guide: [
			{
				heading: 'Where the weight in an EPUB lives',
				paragraphs: [
					'The text of a novel is a few hundred kilobytes; the covers, illustrations and publisher logos around it are usually the other 90%. This tool opens the EPUB, re-encodes each raster image in its own format at your chosen quality — JPEG stays JPEG, PNG stays PNG, transparency included — and repacks the book. Any image that would come out bigger is kept untouched, so a run can only ever help. An optional size cap downscales oversized images to e-reader resolution for the biggest wins.'
				]
			},
			{
				heading: 'What never changes',
				paragraphs: [
					'Chapters, styles, fonts, metadata and reading order pass through byte-for-byte, and the EPUB container rules (the mimetype entry first, stored) are preserved — the result opens in every reader the original did. DRM-protected books are refused with a clear message rather than silently corrupted: encrypted content cannot be recompressed. Comics in ZIP form have their own tool — [Compress CBZ](/compress-cbz).'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Images are re-encoded by the same engines as the image tabs — MozJPEG for JPEGs, OxiPNG with palette quantization for PNGs, libwebp for WebP — all compiled to WebAssembly and running in workers on your device. The container is unpacked and rebuilt locally too, so the book never leaves your browser: no queue, no server, no copy of your library anywhere.'
				]
			}
		],
		faq: [
			{
				q: 'Will the book look or read differently?',
				a: 'The text will not change at all — it is carried over byte-identical. Images are re-encoded at your chosen quality; at the default the difference is hard to spot, and any image that would grow is kept as-is.'
			},
			{
				q: 'Why was my EPUB refused?',
				a: 'It is DRM-protected (META-INF/encryption.xml with real encryption). Recompressing encrypted content would corrupt the book, so the tool refuses instead. Books whose fonts are merely obfuscated — an InDesign habit — are fine and convert normally.'
			},
			{
				q: 'How much smaller do books get?',
				a: 'Image-heavy books routinely drop 30–60%; text-only novels have little to give. The per-image guard means the output is never bigger than the input.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'compress-cbz': {
		intro:
			'Compress CBZ comic archives entirely in your browser — **every page re-encoded in its own format at the quality you pick, with an optional downscale for e-readers**. Filenames, page order and metadata stay exactly as they were. Nothing is uploaded.',
		guide: [
			{
				heading: 'Comics are the perfect target',
				paragraphs: [
					'A CBZ is just a ZIP of page images, and scans are usually saved far larger than any screen can show — high resolutions, generous quality settings. Re-encoding at a sensible quality halves many archives outright, and the Max image size cap (1600 px covers tablets and e-readers comfortably) multiplies the savings on oversized scans. Pages that would grow are kept untouched, and page filenames never change, so reading order is exactly preserved.'
				]
			},
			{
				heading: 'Formats and edge cases, honestly',
				paragraphs: [
					'JPEG pages stay JPEG, PNG stays PNG (with transparency), WebP stays WebP; GIFs and ComicInfo.xml pass through untouched. Mislabeled archives are handled too — a "CBZ" that is really a RAR is read all the same. For actual .cbr files, [CBR to CBZ](/cbr-to-cbz) does the container conversion; at quality 100 this tool is a lossless repack that only restructures the archive.'
				]
			}
		],
		faq: [
			{
				q: 'Does the page order survive?',
				a: 'Yes — readers order pages by filename and every filename is preserved exactly, along with ComicInfo.xml metadata. Only the image bytes inside get lighter.'
			},
			{
				q: 'What quality should I pick?',
				a: 'The default (80) is visually transparent for most scans. For archival copies use 100 — pages that cannot shrink losslessly are simply kept, so nothing degrades.'
			},
			{
				q: 'Can I shrink pages for an e-reader?',
				a: 'Yes — set Max image size to 1600 px (or 1200 for small readers) and oversized scans are downscaled to fit, which is where the biggest savings usually come from.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'csv-to-xlsx': {
		intro:
			'Convert CSV files to real Excel workbooks entirely in your browser — **delimiters auto-detected (comma, semicolon, tab), numbers typed as numbers, text kept as text**. Drop the .csv, download the .xlsx. Nothing is ever uploaded.',
		guide: [
			{
				heading: 'What a proper conversion gets right',
				paragraphs: [
					'CSV has no types — everything is text until something interprets it. This tool re-types pure numbers as numeric cells so sums and charts work immediately, while anything ambiguous stays text: date-looking strings, fractions like 1/2 and codes like MARCH1 are NOT silently turned into dates, the classic spreadsheet-import disaster. Quoted fields, embedded commas and multi-line cells all survive; semicolon and tab files (European Excel exports) are detected automatically.'
				]
			},
			{
				heading: 'The whole family on one tab',
				paragraphs: [
					'This page is the front door of the data tab: drop any of the four formats and the direction follows the file — [XLSX back to CSV](/xlsx-to-csv), [JSON to YAML](/json-to-yaml) and [YAML to JSON](/yaml-to-json) all run through the same engine. Batch a mixed folder and every file comes back converted the right way.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Spreadsheets are read and written by SheetJS — the open-source library behind most of the JavaScript spreadsheet world — and the JSON/YAML side runs on the standard `yaml` parser, both loaded on demand in your browser. Your data never leaves the device: no upload, no server-side copy, and the tools keep working offline once loaded. For business and personal data that is not a nice-to-have — it is the point.'
				]
			}
		],
		faq: [
			{
				q: 'Will my numbers and dates survive?',
				a: 'Numbers become real numeric cells. Date-looking strings deliberately stay text — automatic date guessing is how "1/2" becomes January 2nd in other tools. Format columns as dates in Excel afterwards if you need them typed.'
			},
			{
				q: 'Does it handle semicolon CSVs from European Excel?',
				a: 'Yes — the delimiter is sniffed per file, so comma, semicolon and tab files all convert correctly, decimal commas included.'
			},
			{
				q: 'Is there a size limit?',
				a: 'No hard limit — typical exports convert instantly. Very large files (tens of MB) take a few seconds since everything runs on your own machine.'
			},
			{
				q: 'Is my data uploaded?',
				a:
					'No. The conversion runs entirely in your browser — the server only delivers this page. Spreadsheets full of names, prices or personal data never leave your device.' +
					PRIVACY_PROOF
			}
		]
	},
	'xlsx-to-csv': {
		intro:
			'Convert Excel workbooks to clean CSV entirely in your browser — **dates and formulas come out as the values you see in Excel, and the delimiter is yours to pick**. Drop .xlsx or legacy .xls, download the .csv. Nothing is uploaded.',
		guide: [
			{
				heading: 'Values, not surprises',
				paragraphs: [
					'Cells export as Excel displays them: formulas become their computed values (never `=SUM(...)` text), dates keep their formatted form, and the file starts with a UTF-8 byte-order mark so Excel re-opens č, š, ž and every other accent correctly — the silent encoding bug this tool exists to avoid. Fully empty trailing rows are dropped, matching Excel’s own export.'
				]
			},
			{
				heading: 'Delimiters and multiple sheets',
				paragraphs: [
					'Comma is the default; pick semicolon for European Excel locales (where comma is the decimal separator) or tab for TSV. Workbooks with several sheets export the first one — the row note says so explicitly, nothing disappears silently. Need the reverse trip? [CSV to XLSX](/csv-to-xlsx) is one click away.'
				]
			}
		],
		faq: [
			{
				q: 'What happens to formulas?',
				a: 'They export as their last computed values — exactly what the cells showed in Excel. A formula that was never calculated exports as an empty field rather than formula text.'
			},
			{
				q: 'Why does the CSV start with an invisible character?',
				a: 'That is the UTF-8 byte-order mark. Excel needs it to read accented characters correctly; every other tool simply ignores it.'
			},
			{
				q: 'My workbook has several sheets — which one converts?',
				a: 'The first sheet, and the result row tells you when others were present. Duplicate the workbook with the sheet you need first, or export sheet by sheet.'
			},
			{
				q: 'Is my spreadsheet uploaded?',
				a:
					'No. The whole conversion runs in your browser — the server only delivers this page. Financials, client lists, inventories: none of it leaves your device.' +
					PRIVACY_PROOF
			}
		]
	},
	'json-to-yaml': {
		intro:
			'Convert JSON to readable YAML entirely in your browser — **key order preserved, values untouched, block style throughout**. Config files, API payloads and exports become something a human can actually review. Nothing is uploaded.',
		guide: [
			{
				heading: 'Faithful by construction',
				paragraphs: [
					'The JSON is parsed and re-serialized — never string-mangled — so every value survives exactly: numbers stay numbers, null stays null, unicode stays unicode, and keys keep their original order. Long strings are not folded across lines, which keeps diffs readable. Invalid JSON fails with the parser’s own message instead of producing half a file.'
				]
			},
			{
				heading: 'When YAML is the right target',
				paragraphs: [
					'YAML is the lingua franca of configuration — CI pipelines, Kubernetes, docker-compose — and far easier to read and comment than JSON. The reverse trip is [YAML to JSON](/yaml-to-json); both directions ride the same data tab, alongside the [CSV](/csv-to-xlsx) and [Excel](/xlsx-to-csv) converters.'
				]
			}
		],
		faq: [
			{
				q: 'Is the output valid YAML 1.2?',
				a: 'Yes — produced by the standard yaml library in block style with 2-space indentation, ready for any modern parser or CI system.'
			},
			{
				q: 'Does the key order change?',
				a: 'No — keys come out exactly in the order they appear in the JSON. Nothing is sorted or normalized behind your back.'
			},
			{
				q: 'Can I convert several files at once?',
				a: 'Yes — drop a folder’s worth; each file converts independently, and mixed batches (JSON alongside CSV or YAML) each go their own way.'
			},
			{
				q: 'Is my data uploaded?',
				a:
					'No. The conversion is plain parsing that runs entirely in your browser — the server only delivers this page. API keys or secrets inside your configs never leave your device.' +
					PRIVACY_PROOF
			}
		]
	},
	'yaml-to-json': {
		intro:
			'Convert YAML to JSON entirely in your browser — **anchors and aliases resolved, pretty or minified output, strict validation with real error messages**. Configs become portable JSON any tool can read. Nothing is uploaded.',
		guide: [
			{
				heading: 'What conversion resolves',
				paragraphs: [
					'YAML’s conveniences are expanded into plain data: anchors and aliases become the values they reference, block scalars become normal strings, and the result is exactly what a YAML parser would hand your program — now portable to anything that speaks JSON. Comments have no JSON form and are dropped; that is inherent to the format, not a bug.'
				]
			},
			{
				heading: 'Strict where it matters',
				paragraphs: [
					'Duplicate keys and syntax errors fail loudly with the parser’s message instead of guessing, and multi-document files are refused with a clear note rather than silently truncated. Dates written like 2024-01-15 stay strings — YAML 1.2 semantics, and what you want in JSON. The reverse trip is [JSON to YAML](/json-to-yaml).'
				]
			}
		],
		faq: [
			{
				q: 'What happens to anchors and aliases?',
				a: 'They are resolved — each alias becomes a full copy of the anchored value, which is exactly how any YAML-consuming program sees the data.'
			},
			{
				q: 'Pretty or minified?',
				a: 'Your pick — 2-space pretty printing for reading and diffs, or minified single-line output for payloads. The toggle sits right on the page.'
			},
			{
				q: 'Why was my file refused?',
				a: 'Usually a syntax error, a duplicate key, or a multi-document stream (---separated). The error message quotes the parser so you can fix the exact line.'
			},
			{
				q: 'Is my data uploaded?',
				a:
					'No. The conversion is plain parsing that runs entirely in your browser — the server only delivers this page. Kubernetes secrets and CI configs never leave your device.' +
					PRIVACY_PROOF
			}
		]
	},
	'compress-glb': {
		intro:
			'Compress GLB 3D models entirely in your browser — **geometry crushed with Draco or Meshopt, embedded textures re-encoded, optionally fewer triangles**. Product models, scans and game assets shrink dramatically; nothing is ever uploaded.',
		guide: [
			{
				heading: 'Three ways to compress geometry',
				paragraphs: [
					'Draco (Google) packs vertex data and connectivity the tightest and is decoded by three.js, Babylon.js, <model-viewer> and every major engine. Meshopt (EXT_meshopt_compression) trades a little size for very fast, GPU-friendly decoding — also widely supported. And None quantizes the numbers without any compression extension at all: the output opens in every glTF viewer with zero extra decoders, which makes it the safe pick when you don’t control the viewer.'
				]
			},
			{
				heading: 'Textures and triangles',
				paragraphs: [
					'Embedded JPEG textures re-encode at your chosen quality and PNGs can be downscaled — 4K textures are the usual culprit in oversized web models, and the Max texture size cap alone often halves a file. Any texture that would grow is kept untouched, and GPU-compressed formats (KTX2) pass through as-is. The optional Simplify slider decimates the mesh itself — permanent detail loss, but the biggest wins on dense photogrammetry scans.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'The pipeline is glTF Transform — the reference glTF processing library — running with Google’s Draco codec and meshoptimizer compiled to WebAssembly, all inside a worker on your device. Deduplication, welding and pruning run first, then your chosen codec; animations, materials and scene structure are carried over untouched. Your model never leaves the browser — no queue, no server, no copy of your asset anywhere.'
				]
			}
		],
		faq: [
			{
				q: 'Will the compressed model open in my viewer?',
				a: 'Draco and Meshopt output needs a viewer with the matching decoder — three.js, Babylon.js, <model-viewer> and the major engines all bundle both. If you can’t control the viewer, pick None: that output needs no decoder at all.'
			},
			{
				q: 'Are animations and materials preserved?',
				a: 'Yes — animations, skins, materials and the node hierarchy pass through untouched. Only vertex data is compressed and textures re-encoded; nothing is restructured.'
			},
			{
				q: 'Why is my .gltf file rejected?',
				a: 'A .gltf keeps geometry and textures in separate files this browser tool can’t reach. Export as a single .glb (Binary glTF) — every DCC tool and engine has that option — and it will convert.'
			},
			{
				q: 'Is my model uploaded?',
				a:
					'No. The whole pipeline — parsing, compression, texture re-encoding — runs in your browser. The server only delivers this page; your asset never leaves your device.' +
					PRIVACY_PROOF
			}
		]
	},
	'cbr-to-cbz': {
		intro:
			'Convert CBR comics to CBZ entirely in your browser — **the RAR container becomes a ZIP; every page rides across bit-identical by default**. CBZ opens in more readers, and unlike RAR it is a format tools can also write. Nothing is uploaded.',
		guide: [
			{
				heading: 'Why CBZ over CBR',
				paragraphs: [
					'CBR is a RAR archive, and RAR is a proprietary format most software can read but almost none may write — which is why comic tools, readers and libraries have standardized on CBZ (ZIP) instead. This converter reads the RAR locally, keeps every page and the metadata exactly as they are, and writes a clean CBZ with the same filenames and order.'
				]
			},
			{
				heading: 'Bit-exact by default, smaller on request',
				paragraphs: [
					'The page arrives with quality preset to 100: every page is carried over bit-identical, so the conversion is purely structural. Lower the quality slider and the same run also re-encodes the pages — the [Compress CBZ](/compress-cbz) machinery working during the conversion. Password-protected CBRs are not supported; extract them first with [Extract RAR](/extract-rar).'
				]
			}
		],
		faq: [
			{
				q: 'Are the pages altered?',
				a: 'Not by default — at the preset quality 100 every page is byte-identical to the original. Only the container around them changes from RAR to ZIP.'
			},
			{
				q: 'Why is my CBZ bigger than the CBR was?',
				a: 'RAR sometimes compresses a hair tighter than ZIP. The difference is small (pages are already-compressed images), and the trade is compatibility — CBZ opens everywhere. Lower the quality slider if size matters more.'
			},
			{
				q: 'Do reading order and metadata survive?',
				a: 'Yes — filenames, folder structure and ComicInfo.xml all carry over unchanged, so readers show the exact same book.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'epub-to-txt': {
		intro:
			'Extract the full text of an EPUB as a plain .txt file entirely in your browser — **chapters in the book’s reading order, paragraphs and headings kept, all markup dropped**. Nothing is uploaded; the book never leaves your device.',
		guide: [
			{
				heading: 'How the text comes out',
				paragraphs: [
					'An EPUB is a ZIP of XHTML chapters plus a manifest that records their reading order (the spine). This tool opens the archive locally, follows container.xml to the book’s package file, and walks the spine so chapters land in the order you would read them — not the order they happen to sit in the ZIP. Each chapter is parsed with the browser’s own HTML engine, so entities, footnote markup and the odd unclosed tag all resolve cleanly.',
					'Paragraphs, headings and list items become plain-text paragraphs separated by blank lines; scripts, styles and other invisible machinery are dropped. Tables and footnotes degrade gently — their text survives as plain lines. The result is one .txt file: ideal for full-text search, text-to-speech, word counts or feeding a book to other text tools.'
				]
			},
			{
				heading: 'What it won’t read',
				paragraphs: [
					'DRM-protected books are refused with a clear message — their chapters are encrypted and no browser tool can decrypt them. Image-only books (scans wrapped in an EPUB) are refused too, since there is no text layer to extract; for scans, [OCR](/image-to-text) is the right tool. To make the book itself smaller instead of extracting from it, use [Compress EPUB](/compress-epub).'
				]
			}
		],
		faq: [
			{
				q: 'Does the text come out in the right order?',
				a: 'Yes — chapters follow the EPUB spine, the same reading order your e-reader uses. If a book’s manifest is malformed, the tool falls back to the chapters in archive order rather than failing.'
			},
			{
				q: 'What happens to images, tables and footnotes?',
				a: 'Images are dropped (this is a text extractor). Tables and footnotes keep their text as plain lines — readable, if less pretty than the original layout.'
			},
			{
				q: 'Can it read DRM-protected books?',
				a: 'No. DRM encrypts the chapter files themselves, and the tool tells you so honestly instead of producing garbage. Books you own DRM-free extract completely.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'cbz-to-pdf': {
		intro:
			'Convert CBZ comics to PDF entirely in your browser — **JPEG pages are embedded byte-for-byte, PNG pages pixel-exact, one PDF page per image in reading order**. Nothing is uploaded; the comic never leaves your device.',
		guide: [
			{
				heading: 'Lossless by construction',
				paragraphs: [
					'PDF can carry JPEG and PNG-style image data natively, so this converter embeds each page without touching its pixels — JPEG bytes ride across verbatim, PNG pixel data is re-wrapped into the PDF’s own lossless encoding. The pixels you get in the PDF are exactly the pixels that were in the archive. Each PDF page takes the dimensions of its image, so nothing is cropped, padded or rescaled. WebP and GIF pages are the one exception: PDF has no native encoding for them, so they take a single re-encode to JPEG at the quality you set.',
					'Pages are ordered filename-naturally (page2 before page10), matching how every comic reader presents the archive, and non-page entries like ComicInfo.xml are skipped automatically. The result opens in any PDF viewer, prints cleanly, and works on devices with no comic reader installed.'
				]
			},
			{
				heading: 'Size expectations and limits',
				paragraphs: [
					'Because the image bytes ride across unchanged, the PDF ends up roughly the size of the CBZ (plus a little PDF framing) — this is a format conversion, not a compression pass. To shrink the comic first, run it through [Compress CBZ](/compress-cbz) and convert the result. Very large collections have a hard 1 GB ceiling: a PDF is built in browser memory, and past that point the tab itself runs out — split the archive and convert the parts.'
				]
			}
		],
		faq: [
			{
				q: 'Are the pages recompressed?',
				a: 'No — JPEG bytes are embedded verbatim and PNG pixels are carried over exactly into the PDF’s lossless encoding. Only WebP and GIF pages are re-encoded (to JPEG), because PDF cannot carry them natively.'
			},
			{
				q: 'Is the page order preserved?',
				a: 'Yes — pages sort filename-naturally, the same order comic readers use, so page2 comes before page10 even without zero-padding.'
			},
			{
				q: 'Why is the PDF about as big as the CBZ — or a bit bigger?',
				a: 'Because nothing is recompressed — the same pixels plus PDF structure around them. PNG-heavy comics can even grow slightly: the PDF’s lossless encoding is not always as tight as a well-optimized PNG. Compress the CBZ first if you want a smaller PDF.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	},
	'cbr-to-pdf': {
		intro:
			'Convert CBR comics to PDF entirely in your browser — **the RAR is unpacked locally, then JPEG and PNG pages embed into the PDF byte-for-byte, one page per image**. Nothing is uploaded; the comic never leaves your device.',
		guide: [
			{
				heading: 'From RAR straight to PDF',
				paragraphs: [
					'CBR is a RAR archive, a proprietary format many devices cannot open. This converter reads the RAR with an in-browser extraction engine, sorts the pages filename-naturally (page2 before page10, the order comic readers use), and builds a PDF where each page carries its image untouched — JPEG bytes embed verbatim, PNG pixels re-wrap losslessly, nothing is re-encoded. WebP or GIF pages take one re-encode to JPEG at your chosen quality, since PDF has no native encoding for them.',
					'The result reads anywhere a PDF reads: phones, tablets, e-readers, print. To stay in the comic-archive world instead, [CBR to CBZ](/cbr-to-cbz) converts the container losslessly.'
				]
			},
			{
				heading: 'Limits worth knowing',
				paragraphs: [
					'Password-protected CBRs are not supported — extract them first with [Extract RAR](/extract-rar), then create a PDF from the images. The PDF is assembled in browser memory, so comics whose pages sum past 1 GB are refused with a clear message rather than crashing the tab; split those and convert the parts. Expect the PDF to be roughly the archive’s size — pages are embedded, not recompressed.'
				]
			}
		],
		faq: [
			{
				q: 'Does the image quality change?',
				a: 'Not for JPEG and PNG pages — JPEG bytes embed verbatim and PNG pixels carry over exactly. Only WebP and GIF pages are re-encoded to JPEG, at the quality you set.'
			},
			{
				q: 'Do I need RAR software installed?',
				a: 'No — the RAR is unpacked by an extraction engine running inside the page, so it works on any device with a browser, including ones that cannot open CBR at all.'
			},
			{
				q: 'What about password-protected CBRs?',
				a: 'They are refused with an honest message. Extract the archive with Extract RAR (which supports passwords) and then convert the images.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_ARCHIVE }
		]
	}
};
