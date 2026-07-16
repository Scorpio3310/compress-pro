import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { engine } from './engine';
import { motionOK } from './prefs.svelte';
import { SPRING_UI } from './tokens';

/**
 * Sliding active-indicator for pill tracks (tabs, segmented toggles).
 *
 * Attach to the `relative` container. It must contain:
 * - a `[data-thumb]` absolutely-positioned pill (rendered first, buttons above it)
 * - one `[data-seg="<key>"]` element per option
 *
 * The container gets `data-ready` on mount so CSS fallback backgrounds
 * (used pre-hydration) can be dropped, e.g. `in-data-ready:bg-transparent`.
 *
 * It also maintains `data-scroll` ('start' | 'end' | 'both', or absent when
 * the track isn't scrollable) so CSS can fade the edge(s) that still have
 * more pills to scroll toward — see the `[data-scroll]` rules in layout.css.
 */
export function slideIndicator(getKey: () => string): Attachment {
	return (el) => {
		const container = el as HTMLElement;
		const thumb = container.querySelector<HTMLElement>('[data-thumb]');
		if (!thumb) return;
		container.dataset.ready = '';

		function updateScrollHint() {
			if (container.scrollWidth <= container.clientWidth + 1) {
				delete container.dataset.scroll;
				return;
			}
			const atStart = container.scrollLeft <= 1;
			const atEnd = container.scrollLeft >= container.scrollWidth - container.clientWidth - 1;
			container.dataset.scroll = atStart ? 'end' : atEnd ? 'start' : 'both';
		}

		function measure(key: string) {
			const target = container.querySelector<HTMLElement>(`[data-seg="${key}"]`);
			if (!target) return null;
			// offsetLeft/offsetWidth are integer-rounded while flex/1fr cells are
			// fractional, and a bordered container shifts the absolute-left origin
			// by its border width — measure via rects (border-corrected, scroll-aware)
			// and snap both edges to device pixels so the thumb lands exactly on the
			// segment. The segment's own right separator border stays outside the
			// thumb, so the pill never swallows the cell divider.
			const cRect = container.getBoundingClientRect();
			const tRect = target.getBoundingClientRect();
			const borderR = parseFloat(getComputedStyle(target).borderRightWidth) || 0;
			const left = tRect.left - cRect.left - container.clientLeft + container.scrollLeft;
			const dpr = window.devicePixelRatio || 1;
			const x = Math.round(left * dpr) / dpr;
			const width = Math.round((left + tRect.width - borderR) * dpr) / dpr - x;
			return { x, width };
		}

		function apply(pos: { x: number; width: number }, instant: boolean) {
			if (!thumb) return;
			thumb.style.opacity = '1';
			const m = engine();
			if (!m) {
				// Pre-engine (mount / resize / font-ready inside the cold window —
				// and the whole e2e data-ready path): position directly. No motion
				// animation can be in flight before the module exists, so a plain
				// style write can never fight one; once loaded, ALL writes go
				// through motion again, so the reverse conflict can't happen.
				thumb.style.left = `${pos.x}px`;
				thumb.style.width = `${pos.width}px`;
				return;
			}
			if (instant) {
				m.animate(thumb, { left: `${pos.x}px`, width: `${pos.width}px` }, { duration: 0 });
			} else {
				m.animate(thumb, { left: `${pos.x}px`, width: `${pos.width}px` }, SPRING_UI);
			}
		}

		/** Keep the active segment visible inside a horizontally scrollable track. */
		function scrollIntoView(pos: { x: number; width: number }, smooth: boolean) {
			if (container.scrollWidth <= container.clientWidth) return;
			const viewLeft = container.scrollLeft;
			const viewRight = viewLeft + container.clientWidth;
			if (pos.x < viewLeft + 8 || pos.x + pos.width > viewRight - 8) {
				container.scrollTo({
					left: Math.max(0, pos.x - 24),
					behavior: smooth ? 'smooth' : 'instant'
				});
			}
		}

		$effect(() => {
			const key = getKey();
			const pos = measure(key);
			if (!pos) return;
			const first = thumb.style.opacity === '';
			apply(pos, first || !untrack(motionOK));
			scrollIntoView(pos, !first && untrack(motionOK));
		});

		// Re-measure on resize and once the web font lands. Segments are observed
		// individually too: when the container is width-capped (scrollable tabs on
		// phones) a growing segment — e.g. a count badge appearing — doesn't resize
		// the container, and the thumb would go stale.
		const ro = new ResizeObserver(() => {
			const pos = measure(untrack(getKey));
			if (pos) apply(pos, true);
			updateScrollHint();
		});
		ro.observe(container);
		for (const seg of container.querySelectorAll<HTMLElement>('[data-seg]')) {
			ro.observe(seg);
		}
		document.fonts?.ready.then(() => {
			const pos = measure(untrack(getKey));
			if (pos) apply(pos, true);
			updateScrollHint();
		});

		container.addEventListener('scroll', updateScrollHint, { passive: true });
		updateScrollHint();

		return () => {
			ro.disconnect();
			container.removeEventListener('scroll', updateScrollHint);
		};
	};
}
