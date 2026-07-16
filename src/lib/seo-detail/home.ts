// Per-page head/meta + intake details (title/description/tagline/og, steps,
// related, converter preset/accept) for the 'home' tool group — extracted
// verbatim from the pre-split seo.ts (parity is pinned by the byte-identical
// prerender diff). This is now the authoring source for these fields; loaded
// lazily via seo-detail/index.ts, statically by seo-full.server.ts.
import type { SeoDetail } from '$lib/seo';

export const DETAILS: Record<string, SeoDetail> = {
	'': {
		title: 'Compress Images, Video & PDFs — Private, Free | Compress Pro',
		description:
			'Compress JPG, PNG, WebP, GIF, HEIC, SVG, PDF, video & audio entirely in your browser. No uploads, no ads, no limits — files never leave your device. Free.',
		tagline: 'Images, video, audio & PDFs — compressed, never uploaded.'
	}
};
