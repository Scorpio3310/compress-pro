/**
 * FAQ answer building blocks shared across the per-group seo body modules
 * (see ./index.ts). These live with the BODIES — not in seo.ts — because
 * they appear only inside `faq` answers, which are lazy-loaded per page.
 */

// The two-step wording is deliberate: engines cache on first use, so only
// "run one, go offline, run another" is a truthful offline claim.
export const PRIVACY_PROOF =
	' Want proof? Run one file through, switch your connection off, and run another — it still works.';

// One privacy answer per media category — the same facts everywhere (local
// processing, static server, offline proof), phrased for what the page
// actually handles: one paragraph repeated verbatim across 57 pages reads as
// boilerplate to crawlers and to people.
export const PRIVACY_A_IMAGE =
	'Yes. The pixels are decoded and re-encoded right in your browser — images are never uploaded, and the server does nothing but deliver this page. Close the tab and no trace of your photos remains.' +
	PRIVACY_PROOF;

export const PRIVACY_A_IMAGE_CONVERT =
	'Yes. The conversion happens entirely on your device — the image is read, re-encoded and saved without ever touching a network. There is no server-side queue, no temporary copy in some bucket, nothing to expire or leak.' +
	PRIVACY_PROOF;

export const PRIVACY_A_AUDIO =
	'Yes. The audio is decoded and re-encoded entirely in your browser — recordings never leave your device, and the server does nothing but deliver this page. Voice memos, interviews, demos: none of it is uploaded anywhere.' +
	PRIVACY_PROOF;

export const PRIVACY_A_VIDEO =
	'Yes. Every frame is decoded and re-encoded by your own hardware — footage is never uploaded, and the server does nothing but deliver this page. Close the tab and nothing of your video persists.' +
	PRIVACY_PROOF;

export const PRIVACY_A_PDF =
	'Yes. The document never leaves your browser — nothing is uploaded, and the server only delivers this page. That makes it safe for contracts, invoices, medical records — anything you would not email to a stranger.' +
	PRIVACY_PROOF;

export const PRIVACY_A_FONT =
	'Yes. The font is repackaged entirely in your browser — it is never uploaded, and the server does nothing but deliver this page. For licensed fonts that matters twice over: nothing is redistributed to any third party, and no copy lingers on a server afterwards.' +
	PRIVACY_PROOF;

export const PRIVACY_A_ARCHIVE =
	'Yes. Archives are built and converted entirely in your browser — neither the archive nor the files inside it are ever uploaded, and any password you set is applied locally. The server does nothing but deliver this page.' +
	PRIVACY_PROOF;

// Extraction pages ask "Is it private?" — the answer must open with "Yes".
export const PRIVACY_A_EXTRACT =
	'Yes. The archive is opened and unpacked on your own device — its contents are never uploaded, and a password, if one is needed, is used locally and never transmitted. The server does nothing but deliver this page.' +
	PRIVACY_PROOF;

// Same facts for questions phrased as "Are my files uploaded?" — the answer
// must open with "No", not "Yes". HOME uses the bare base: its "How do I
// know?" FAQ already carries the proof, and twice in a row reads canned.
export const PRIVACY_NO_BASE =
	'No — everything runs right in your browser, and the server only delivers this page. Files never leave your device; close the tab and everything is gone.';

export const PRIVACY_NO_IMAGE =
	'No — the pixels never leave your machine. Decoding and re-encoding both happen in your browser; there is no upload to wait for and no server-side copy to worry about afterwards.' +
	PRIVACY_PROOF;

export const PRIVACY_NO_VIDEO =
	'No. Encoding runs on your own hardware from first frame to last — nothing streams to a server, which is also why there is no file-size cap and no queue. Close the tab and every trace of the footage is gone.' +
	PRIVACY_PROOF;

// Fonts are licensed software — web-bound conversion pages carry this answer.
export const FONT_LICENSE_A =
	'Converting a font never changes its license. Many desktop licenses do not cover web embedding (and vice versa), so check yours before publishing a converted font. Fonts under the OFL or Apache licenses and fonts you made yourself are fine. Your file also never leaves your device — nothing is uploaded anywhere.';

// Unwrap directions (web font → desktop file) get the stricter framing:
// recovering a file for inspection is one thing, installing or redistributing
// it is where licenses draw lines.
export const FONT_LICENSE_UNWRAP_A =
	'The wrapper changes, the license does not — and direction matters here: a font licensed for web embedding is not automatically licensed for desktop installation or further distribution. Unwrapping a font you own, or one under the OFL or Apache licenses, is fine; for anything else read the terms before installing. Nothing is uploaded either way — the file stays on your device.';

// Subsetting/instancing MODIFIES the font — a stricter question than converting.
export const FONT_LICENSE_SUBSET_A =
	'Subsetting is a modification of the font file, and licenses differ on it: many web-font licenses explicitly allow subsetting for performance, open licenses (OFL, Apache) allow it, and some commercial desktop licenses forbid modifications entirely. Check yours before shipping the result. Your file never leaves your device — nothing is uploaded anywhere.';
