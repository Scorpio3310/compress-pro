/**
 * In-page font rendering — the "mangled glyphs" check that structural
 * byte-compares cannot see. Loads arbitrary font bytes via FontFace, renders a
 * sample string in a DOM probe element, and screenshots it (canvas 2d cannot
 * express font-variation-settings; an element screenshot can). Before/after
 * renders of a lossless conversion should be near-pixel-identical (same
 * rasterizer, same px size); variable fonts render at explicit wght stops.
 */
import type { Page } from '@playwright/test';

export const PANGRAM = 'Sphinx of black quartz, judge my vow. 0123456789';
/** Javanese sample (NotoSansJavanese) — "hanacaraka" in Javanese script. */
export const JAVANESE_SAMPLE = 'ꦲꦏꦤꦴꦏꦠꦴ';
/** Shavian sample (NotoSansShavian). */
export const SHAVIAN_SAMPLE = '\u{10456}\u{10471}\u{1045D}\u{1047E}\u{1046F}';

export interface FontRenderOpts {
	text?: string;
	px?: number;
	/** e.g. "'wght' 800" — font-variation-settings for VF stops. */
	variation?: string;
}

/**
 * Render `text` in the given font bytes inside the app page; returns a PNG.
 * Throws when FontFace.load() rejects (corrupt/unsupported container) — that
 * itself is the decode-back check for font outputs.
 */
export async function renderFontSampleInPage(
	page: Page,
	fontBytes: Buffer,
	opts: FontRenderOpts = {}
): Promise<Buffer> {
	const { text = PANGRAM, px = 48, variation = '' } = opts;
	await page.evaluate(
		async (args: { b64: string; text: string; px: number; variation: string }) => {
			const bin = atob(args.b64);
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			// Unique family per call — repeated loads must not hit a stale face.
			const family = `probe-${Math.random().toString(36).slice(2)}`;
			const face = new FontFace(family, bytes.buffer as ArrayBuffer);
			await face.load();
			document.fonts.add(face);
			document.getElementById('matrix-font-probe')?.remove();
			const el = document.createElement('div');
			el.id = 'matrix-font-probe';
			el.textContent = args.text;
			Object.assign(el.style, {
				position: 'fixed',
				top: '0',
				left: '0',
				zIndex: '99999',
				background: '#ffffff',
				color: '#111111',
				padding: `${Math.ceil(args.px / 2)}px`,
				fontFamily: `"${family}"`,
				fontSize: `${args.px}px`,
				lineHeight: '1.4',
				whiteSpace: 'pre',
				fontVariationSettings: args.variation || 'normal'
			});
			document.body.appendChild(el);
			// The face is intentionally NOT deleted here — the screenshot below
			// happens after evaluate returns; cleanup is a separate call.
		},
		{ b64: fontBytes.toString('base64'), text, px, variation }
	);
	const shot = await page.locator('#matrix-font-probe').screenshot({ type: 'png' });
	await page.evaluate(() => document.getElementById('matrix-font-probe')?.remove());
	return shot;
}

/** Ratio of non-background pixels — a blank render means unmapped glyphs
 *  (.notdef tofu still draws ink, full blank = catastrophic). */
export async function inkRatio(png: Buffer): Promise<number> {
	const sharp = (await import('sharp')).default;
	const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
	let ink = 0;
	const n = info.width * info.height;
	for (let i = 0; i < data.length; i += info.channels) {
		if (data[i] < 240) ink++;
	}
	return ink / n;
}
