import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { engine } from './engine';
import { motionOK } from './prefs.svelte';
import { SPRING_POP, SPRING_REVEAL, STAGGER_CAP, STAGGER_STEP } from './tokens';

// Everything mounted in the same microtask flush forms one stagger batch —
// covers "controls + progress + list appear together" and "5 rows added at once".
let batch = 0;
let scheduled = false;
function nextIndex(): number {
	if (!scheduled) {
		scheduled = true;
		queueMicrotask(() => {
			batch = 0;
			scheduled = false;
		});
	}
	return batch++;
}

/** Enter: rise + fade, with automatic same-flush staggering.
 *  Engine not loaded yet (the first ~200 ms of a cold visit): NO-OP — the
 *  element simply renders static at opacity 1. Entrances must never run late
 *  (the content would paint, blink out, then fade back in), so there is
 *  deliberately no whenEngine upgrade here. Synchronous when the engine is
 *  ready, which preserves same-flush stagger batching. */
export function reveal(opts: { y?: number; delay?: number; stagger?: boolean } = {}): Attachment {
	return (el) => {
		const m = engine();
		if (!m) return;
		const node = el as HTMLElement;
		// untrack: flipping the OS motion preference must not re-run a one-shot entrance.
		if (!untrack(motionOK)) {
			const controls = m.animate(node, { opacity: [0, 1] }, { duration: 0.15 });
			return () => controls.stop();
		}
		const delay =
			(opts.delay ?? 0) +
			(opts.stagger === false ? 0 : Math.min(nextIndex() * STAGGER_STEP, STAGGER_CAP));
		const controls = m.animate(
			node,
			{ opacity: [0, 1], y: [opts.y ?? 12, 0] },
			{ ...SPRING_REVEAL, delay }
		);
		return () => controls.stop();
	};
}

/** Enter: springy scale pop (chips, modal panel). Same no-op-when-cold rule. */
export function pop(opts: { delay?: number; from?: number } = {}): Attachment {
	return (el) => {
		const m = engine();
		if (!m) return;
		const node = el as HTMLElement;
		if (!untrack(motionOK)) {
			const controls = m.animate(node, { opacity: [0, 1] }, { duration: 0.15 });
			return () => controls.stop();
		}
		const controls = m.animate(
			node,
			{ opacity: [0, 1], scale: [opts.from ?? 0.8, 1] },
			{ ...SPRING_POP, delay: opts.delay ?? 0 }
		);
		return () => controls.stop();
	};
}

/** One-shot feedback pulse (e.g. after a successful drop). Call from event handlers. */
export function pulse(el: HTMLElement | undefined | null) {
	const m = engine();
	if (!el || !m || !motionOK()) return;
	m.animate(el, { scale: [0.985, 1] }, SPRING_POP);
}
