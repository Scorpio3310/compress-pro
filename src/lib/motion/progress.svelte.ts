import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { engine } from './engine';
import { motionOK } from './prefs.svelte';
import { SPRING_GENTLE, SPRING_UI } from './tokens';

/**
 * Attach to the FILL of a progress bar: a full-width rounded element inside an
 * overflow-hidden track. Animates x from -100% → 0% so the rounded caps never
 * squash (unlike scaleX) and the work stays transform-only.
 *
 * Getter pattern: the attachment itself never re-runs; only the inner $effect
 * tracks the fraction.
 */
export function progressFill(getFraction: () => number): Attachment {
	return (el) => {
		const node = el as HTMLElement;
		let last = -1;
		let initialized = false;
		$effect(() => {
			// keep a 2% sliver visible so the bar reads as "started"
			const f = Math.max(0.02, Math.min(1, getFraction()));
			const done = f >= 1;
			if (!done && Math.abs(f - last) < 0.01) return; // epsilon gate for chatty updates
			last = f;
			const x = `${(f - 1) * 100}%`;
			const m = engine();
			if (!m) {
				// Pre-engine: write the transform directly — the bar still tracks
				// progress, just without the spring. `initialized` intentionally
				// stays false so the FIRST motion write after load is the
				// duration-0 init set, never a spring starting from a transform
				// motion didn't write.
				node.style.transform = `translateX(${x})`;
				return;
			}
			if (!initialized || !untrack(motionOK)) {
				initialized = true;
				m.animate(node, { x }, { duration: 0 });
				return;
			}
			// motion auto-interrupts the previous spring and keeps its velocity
			m.animate(node, { x }, SPRING_GENTLE);
		});
	};
}

/** Spring the element's scale while `getActive()` is true (dropzone drag-over). */
export function springScale(getActive: () => boolean, activeScale = 1.01): Attachment {
	return (el) => {
		const node = el as HTMLElement;
		let initialized = false;
		$effect(() => {
			const active = getActive();
			if (!initialized) {
				initialized = true;
				if (!active) return; // don't animate the resting state on mount
			}
			const m = engine();
			if (!m || !untrack(motionOK)) return;
			m.animate(node, { scale: active ? activeScale : 1 }, SPRING_UI);
		});
	};
}
