// Long-form page bodies (intro/guide/faq) for the 'pdf' tool group —
// extracted verbatim from the pre-split seo.ts (parity was pinned by the
// migration snapshot). This is now the authoring source for this copy;
// loaded lazily via seo-body/index.ts, statically by seo-full.server.ts.
import type { SeoBody } from '$lib/seo';
import { PRIVACY_A_PDF, PRIVACY_NO_IMAGE, PRIVACY_PROOF } from './shared';

export const BODIES: Record<string, SeoBody> = {
	'compress-pdf': {
		intro:
			'Compress PDF files right in your browser — no upload, no waiting on a server. Pick a compression level or a target size like 2 MB — and merge PDFs, extract or remove pages, or convert between PDFs and images with the same tool. **Documents never leave your device.**',
		guide: [
			{
				heading: 'Choosing a preset',
				paragraphs: [
					'Each preset trades image sharpness for size by downsampling the pictures inside the PDF — text always stays crisp, because it is vector data that costs almost nothing.'
				],
				table: {
					columns: ['Preset', 'Image resolution', 'Best for'],
					rows: [
						['Low', '300 DPI', 'Archival copies and print — barely touched'],
						['Medium', '150 DPI', 'The all-round default: email, sharing, filing'],
						['High', '120 DPI', 'Web publishing and internal documents'],
						['Ultra', '72 DPI', 'Screen-only reading, big scans'],
						['Extreme', '50 DPI', 'When only the size limit matters']
					]
				}
			},
			{
				heading: 'Common upload limits — and how to hit them',
				paragraphs: [
					'Most email providers cap attachments around 25 MB — and because attachments are re-encoded for transport, a file should really stay under ~19 MB to send reliably. Government portals, job applications and e-invoicing systems are stricter still, typically 2–5 MB per document.',
					'Instead of guessing which preset gets you there, switch to target-size mode and type the limit itself (say 2 MB): the tool keeps trying stronger settings until the output fits, and tells you honestly if the target is impossible. If several documents must travel together, [merge them](/merge-pdf) first and compress the combined file; if only a few pages matter, [split the PDF](/split-pdf) and send just those.'
				]
			},
			{
				heading: 'Scanned vs. text-only PDFs',
				paragraphs: [
					'Scanned documents shrink dramatically — every page is a photograph, so downsampling and re-encoding routinely cuts 80–90% of the size. Digitally created, text-only PDFs are already compact; if yours barely shrinks, it was efficient to begin with. Image-heavy presentations sit in between and respond very well to the Medium and High presets.'
				]
			},
			{
				heading: 'Under the hood',
				paragraphs: [
					'Compression is done by Ghostscript — the PDF engine that has anchored print and publishing workflows for decades — compiled to WebAssembly and running locally, so a confidential contract gets professional-grade processing without ever touching a server. Merge, split and page extraction run on pdf-lib, and page previews render through pdf.js, the same PDF renderer Firefox uses.'
				]
			}
		],
		faq: [
			{
				q: 'Is it safe to compress confidential PDFs here?',
				a: 'Yes — this is the point of the tool. Compression runs entirely on your own device; documents are never uploaded and no server ever sees them. Close the tab and nothing remains. Want proof? Run one document through, switch your connection off, and run another — it still works.'
			},
			{
				q: 'How small can a PDF get?',
				a: 'It depends on what is inside. Scanned or image-heavy PDFs shrink dramatically because images are downsampled and re-encoded; text-only PDFs are already compact.'
			},
			{
				q: 'Can I hit an exact size like 2 MB?',
				a: 'Yes — target-size mode tries increasingly strong settings until the output fits under your limit, ideal for portals that cap uploads.'
			},
			{
				q: 'Is there a file size limit?',
				a: 'No hard limit — processing is bounded by your device’s memory. Very large files (200 MB+) work, they just take longer. There are no artificial limits either: no daily caps, no ads, no premium tier.'
			}
		]
	},
	'jpg-to-pdf': {
		intro:
			'Combine JPG photos into a single PDF entirely in your browser — **the document is assembled on your device, and nothing is uploaded**. Each image becomes one page sized exactly to the image, in the order you arrange with the list arrows. Other image types work too: PNG, WebP, GIF, and AVIF are re-encoded as JPEG pages, with transparency flattened to white.',
		guide: [
			{
				heading: 'Page layout and ordering',
				paragraphs: [
					'Each image becomes one page sized exactly to its pixels — no cropping, no letterboxing, portrait and landscape mixing freely. The list order is the page order; rearrange with the row arrows before converting, and the result downloads as a single images.pdf.'
				]
			},
			{
				heading: 'Keeping the PDF small',
				paragraphs: [
					'The quality slider re-encodes every page as JPEG inside the document — 80 is visually clean for photos, and receipts tolerate less. If the finished PDF must hit a hard cap (a 2 MB portal limit, say), run it through [Compress PDF](/compress-pdf) in target-size mode as a second step.'
				]
			},
			{
				heading: 'Scans, receipts and forms',
				paragraphs: [
					'Phone photos of paperwork are this tool’s bread and butter: shoot the pages, drop them in order, convert, and send one document instead of eleven photos. For the cleanest result, crop the photos to the paper first and keep every page the same orientation — the PDF preserves exactly what you feed it.'
				]
			}
		],
		faq: [
			{
				q: 'How are the PDF pages laid out?',
				a: 'One image per page, page size equal to the image’s pixel size, in your list order — use the arrows to reorder before converting. The result downloads as a single images.pdf.'
			},
			{
				q: 'Can I mix JPG with PNG or WebP in one PDF?',
				a: 'Yes — the dropzone accepts all common image types. Everything is re-encoded as JPEG inside the PDF; transparent areas turn white and animations keep their first frame.'
			},
			{
				q: 'How do I keep the PDF small?',
				a: 'Lower the JPG quality slider — it controls the re-encode of every page. Around 80 is visually clean and compact for photos.'
			},
			{ q: 'Are my photos uploaded to build the PDF?', a: PRIVACY_NO_IMAGE }
		]
	},
	'png-to-pdf': {
		intro:
			'Bundle PNG screenshots, scans or graphics into a single PDF **without anything leaving your browser**. Each PNG becomes one page sized to the image, in the order you arrange; transparent areas are flattened to white, since PDF pages have no transparency. Perfect for turning a screenshot trail into one shareable document.',
		guide: [
			{
				heading: 'Screenshots to a single document',
				paragraphs: [
					'The classic use: a bug report, a chat export or a step-by-step walkthrough captured as a dozen screenshots. Drop them all, order them with the arrows, convert — and send one PDF instead of twelve attachments that arrive shuffled. Page size follows each image’s pixels, so nothing is cropped or letterboxed.'
				]
			},
			{
				heading: 'Keeping the PDF small',
				paragraphs: [
					'The quality slider re-encodes every page as JPEG inside the document. Screenshots tolerate 75–85 well; photographic PNGs can go lower. If the combined file still needs to hit a limit — a 2 MB application-portal cap, say — run the result through [Compress PDF](/compress-pdf) with target-size mode afterwards.'
				]
			}
		],
		faq: [
			{
				q: 'What happens to PNG transparency?',
				a: 'PDF pages are opaque, so transparent regions are flattened onto white — logos and UI screenshots come out looking like they would on paper. If you need transparency preserved, PDF isn’t the format for it.'
			},
			{
				q: 'How do I order the pages?',
				a: 'Pages follow the file list — use the row arrows to rearrange before converting. The result downloads as a single images.pdf with one PNG per page.'
			},
			{
				q: 'Why is the PDF bigger than my PNGs?',
				a: 'Pages are re-encoded as JPEG inside the PDF, which usually shrinks screenshots — but flat graphics with few colors can grow slightly. Lower the quality slider to trade sharpness for size; around 80 is a good screenshot setting.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_PDF }
		]
	},
	'pdf-to-jpg': {
		intro:
			'Turn PDF pages into JPG images **without uploading the document anywhere** — rendering happens entirely in your browser. Pick a resolution (72, 150, or 300 DPI) and a JPEG quality; every page becomes an image. Single-page PDFs download directly as a .jpg, multi-page ones as a ZIP with one image per page.',
		guide: [
			{
				heading: 'Choosing a DPI',
				table: {
					columns: ['DPI', 'Best for'],
					rows: [
						['72', 'Screen previews, thumbnails, quick shares'],
						['150', 'The all-round default — crisp on screens, reasonable size'],
						['300', 'Print, archives, zooming into fine detail']
					]
				}
			},
			{
				heading: 'JPG or PNG output',
				paragraphs: [
					'JPG is the right pick for pages with photos and scans — small files, no visible artifacts at these DPIs. PNG is lossless and keeps hairline text and diagrams pixel-perfect at the cost of size; pick it when the page is mostly line art, or when the images head into further editing.'
				]
			},
			{
				heading: 'Multi-page documents',
				paragraphs: [
					'Every page renders to its own image, named by page number, and multi-page results download as a single ZIP. Only need a few pages as images? Split the PDF first — extract the range with the [Split tool](/split-pdf), then render just those pages.'
				]
			}
		],
		faq: [
			{
				q: 'Which DPI should I choose?',
				a: '72 DPI for screens and quick previews, 150 DPI as the all-round default, 300 DPI when the images must hold up in print. Higher DPI means larger images and files.'
			},
			{
				q: 'How do multi-page PDFs come out?',
				a: 'As a ZIP containing one numbered JPG per page (name-p01.jpg, name-p02.jpg, …). A single-page PDF skips the ZIP and downloads as an image directly.'
			},
			{
				q: 'Can I get PNG instead of JPG?',
				a: 'Yes — flip the output toggle to PNG for razor-sharp text and graphics. JPG stays the smaller choice for photographic pages.'
			},
			{
				q: 'Is this safe for confidential documents?',
				a: 'Yes — pages are rendered by code running locally in your tab. The PDF is never uploaded and no server ever sees its contents. Want proof? Convert one document, switch your connection off, and convert another — it still works.'
			}
		]
	},
	'pdf-to-png': {
		intro:
			'Render PDF pages to pixel-perfect PNG images **without the file leaving your browser**. PNG is lossless, so hairline text, diagrams and line art come out exactly as the page draws them — no JPEG artifacts around sharp edges. Pick the DPI, drop a document, and multi-page results arrive as one ZIP.',
		guide: [
			{
				heading: 'When PNG beats JPG for pages',
				paragraphs: [
					'PNG wins whenever the page is drawn rather than photographed: contracts and forms with fine print, wireframes, CAD exports, sheet music, charts. JPEG compression smears exactly those high-contrast edges. If your document is a photo scan, the [PDF to JPG](/pdf-to-jpg) converter produces far smaller files with nothing visible lost.'
				]
			},
			{
				heading: 'Choosing a DPI',
				table: {
					columns: ['DPI', 'What you get'],
					rows: [
						['72', 'Screen-size previews — small and fast'],
						['150', 'Sharp on any display — the sensible default'],
						['300', 'Print-grade renders that survive heavy zooming']
					]
				}
			},
			{
				heading: 'Editing the results',
				paragraphs: [
					'Because PNG is lossless, the rendered pages tolerate further work — annotate them, crop them, paste them into slides — without stacking compression artifacts on every save. If the pages end up on a web page afterwards, run them through [Compress PNG](/compress-png) to shrink them losslessly first.'
				]
			}
		],
		faq: [
			{
				q: 'PNG or JPG for PDF pages?',
				a: 'PNG is lossless and keeps thin lines, small text and flat colors pixel-perfect — right for diagrams, forms and anything headed into further editing. For photographic scans, JPG is several times smaller at no visible cost.'
			},
			{
				q: 'What DPI should I pick?',
				a: '150 DPI is the all-round default — crisp on screens with reasonable files. Use 72 for quick previews and thumbnails, 300 when the images go to print or need deep zooming.'
			},
			{
				q: 'How do multi-page PDFs download?',
				a: 'Every page renders to its own numbered PNG, and documents with more than one page download as a single ZIP so nothing gets lost or misordered.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_PDF }
		]
	},
	'unlock-pdf': {
		intro:
			'Remove the password from a PDF you own and get a copy that opens freely. Unlike online unlockers, **both the PDF and the password you type stay on your device** — the whole job runs right in your browser, and nothing is ever sent anywhere.',
		guide: [
			{
				heading: 'Your password never leaves this page',
				paragraphs: [
					'Typing a PDF password into a random website is a leap of faith — you hand a stranger’s server both the document and the key to it. Here there is no server in the loop: the PDF is decrypted and rewritten on your own device, and neither the file nor the password is ever transmitted. The unlocked copy downloads straight from your browser’s memory.'
				]
			},
			{
				heading: 'Two kinds of PDF locks',
				paragraphs: [
					'An open password is the real lock: the file is encrypted and nothing can read it without the password, which is why this tool asks for it once. A permissions lock is softer — the PDF opens fine but printing, copying or editing is restricted. Both come off here, and the unlocked copy behaves like any ordinary PDF.',
					'What this tool never does is guess or crack passwords — if you don’t know the open password, the file stays sealed. Going the other direction, [Protect PDF](/protect-pdf) adds a password to documents you are about to send.'
				]
			}
		],
		faq: [
			{
				q: 'Is unlocking a PDF legal?',
				a: 'Unlocking PDFs you own or have the right to use — like invoices, bank statements or reports sent to you with a password — is fine. This tool requires the correct password; it does not crack or bypass anything.'
			},
			{
				q: 'What if I don’t know the password?',
				a: 'Then the PDF can’t be unlocked here. This tool unlocks with the password you provide — it is not a password recovery or cracking service.'
			},
			{
				q: 'Why does my PDF open fine but refuse printing or editing?',
				a: 'That is a permissions lock — the file is readable, but flags inside it restrict printing, copying or editing. Unlocking rewrites the PDF without those restrictions, so the copy prints and copies normally in every reader.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_PDF }
		]
	},
	'protect-pdf': {
		intro:
			'Add a password to any PDF and download an encrypted copy that no reader opens without it. Everything happens in your browser with standard PDF encryption — the kind every reader supports — and **neither the file nor the password is ever sent anywhere**.',
		guide: [
			{
				heading: 'What the password actually protects',
				paragraphs: [
					'The password encrypts the entire document — without it the contents are unreadable bytes, and every serious reader (Acrobat, Preview, browsers) refuses to open the file until it is entered. That protects the document at rest and in transit: an intercepted email attachment or a PDF on a lost USB stick stays sealed.'
				]
			},
			{
				heading: 'Sending a protected PDF safely',
				paragraphs: [
					'Send the file and the password on different channels — the PDF by email, the password in a text message or a call. Both in the same email defeats the point. And pick a password you don’t use anywhere else: the recipient could try it, and the file may outlive the conversation.',
					'One order-of-operations tip: size first, then seal. Encrypted files can’t be processed further, so run a heavy scan through [Compress PDF](/compress-pdf) before adding the password.'
				]
			}
		],
		faq: [
			{
				q: 'Which encryption does it use?',
				a: 'Standard 128-bit PDF encryption, which every PDF reader supports — Adobe Acrobat, Apple Preview and browsers all require the password to open the file. For highly sensitive material, prefer an encrypted archive or disk image.'
			},
			{
				q: 'What if I forget the password?',
				a: 'There is no recovery. The encryption is real — without the password the content is unreadable, and no service can restore it. Keep the original file or store the password in a password manager.'
			},
			{
				q: 'Can I remove the password later?',
				a: 'Yes — as long as you still know it. Drop the protected file on the Unlock PDF tool, type the password once, and download a copy that opens freely. Keep the original file too, or store the password in a password manager.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_PDF }
		]
	},
	'merge-pdf': {
		intro:
			'Combine any number of PDFs into a single document, assembled entirely in your browser. Drop the files, arrange them with the list arrows, and merge — pages are copied losslessly, so nothing is re-encoded unless you also tick “Compress after merging”. **No server ever touches your documents.**',
		guide: [
			{
				heading: 'Merging without quality loss',
				paragraphs: [
					'The merge itself is lossless: pages are copied from each source PDF into the combined document exactly as they are — text, images, links and fonts are untouched, just reassembled. The output is only as large as its inputs combined, so if the result feels heavy, that weight was already in the sources.'
				]
			},
			{
				heading: 'Merge and compress in one pass',
				paragraphs: [
					'Tick “Compress after merging” to hand the combined file straight to the same compression engine behind the [Compress PDF](/compress-pdf) tool. This is the right order of operations — compressing one merged file beats compressing ten inputs separately, because images are downsampled once, consistently, and you check the size limit against the final document.'
				]
			},
			{
				heading: 'Typical uses',
				table: {
					columns: ['Task', 'How'],
					rows: [
						[
							'Combine scanned pages',
							'Drop the scans in shooting order — each becomes consecutive pages'
						],
						[
							'Assemble a report',
							'Cover, body and appendix PDFs in list order, compress at Medium'
						],
						['Bundle invoices', 'Merge a month of invoices, then compress to email size']
					]
				}
			}
		],
		faq: [
			{
				q: 'How do I control the page order?',
				a: 'The merged PDF follows the list order — use the arrows on each row to rearrange files before merging. Pages inside each file keep their original order.'
			},
			{
				q: 'Can I merge and compress in one step?',
				a: 'Yes — enable “Compress after merging” and the combined document is compressed right after assembly, with the preset you pick. Leave it off for a lossless merge.'
			},
			{
				q: 'What about password-protected PDFs?',
				a: 'Encrypted files can’t be merged directly. Remove the password first with the Unlock tool — it runs locally too — then merge the unlocked copies.'
			},
			{
				q: 'Are my documents uploaded?',
				a:
					'No. The PDFs are opened and stitched together entirely in your browser — the merged document is assembled on your device, and nothing is ever transmitted anywhere.' +
					PRIVACY_PROOF
			}
		]
	},
	'split-pdf': {
		intro:
			'Pull exact pages out of a PDF — or cut pages from it — entirely in your browser. Type a range like 1-3,7,12- and choose whether to keep or remove those pages; the rest assemble into a new document with **nothing re-encoded and nothing uploaded**.',
		guide: [
			{
				heading: 'Page ranges by example',
				table: {
					columns: ['Range', 'Result with Keep'],
					rows: [
						['5', 'Just page five'],
						['1-3,7', 'Pages one to three, plus page seven'],
						['12-', 'Page twelve to the end'],
						['1-3,12-', 'Everything except pages four to eleven']
					]
				}
			},
			{
				heading: 'Extract vs remove',
				paragraphs: [
					'Keep mode answers “I need these pages”: pull the signed page out of a contract, or the one relevant chapter from a manual. Remove mode answers “these pages shouldn’t be here”: strip a blank scan, an outdated appendix or a page with someone else’s data. Both produce a fresh PDF and leave the original untouched.'
				]
			},
			{
				heading: 'Splitting big scans',
				paragraphs: [
					'Scanned bundles are the classic case — a hundred-page scan where you need pages 34–41. Extraction is instant even on huge files because pages are copied, not rendered. If the extracted part is still heavy, run it through [Compress PDF](/compress-pdf) afterwards; scans shrink dramatically there.'
				]
			}
		],
		faq: [
			{
				q: 'How do page ranges work?',
				a: 'Comma-separate pages and ranges: 1-3,7,12- means pages one to three, page seven, and everything from twelve to the end. Open-ended ranges like 12- save you from knowing the page count.'
			},
			{
				q: 'What’s the difference between Keep and Remove?',
				a: 'Keep extracts your selection into the new file; Remove deletes the selection and keeps everything else. The same range means opposite things, so double-check the toggle before running.'
			},
			{
				q: 'Does splitting reduce quality?',
				a: 'No — pages are copied as-is, without re-encoding. Only the pages you excluded are gone. Compress the result separately if you also want it smaller.'
			},
			{ q: 'Is it private?', a: PRIVACY_A_PDF }
		]
	}
};
