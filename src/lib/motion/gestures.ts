import type { Attachment } from 'svelte/attachments';
import { whenEngine } from './engine';
import { motionOK } from './prefs.svelte';
import { SPRING_POP, SPRING_UI } from './tokens';

// All three gestures register interaction LISTENERS — nothing animates until
// the user presses/hovers, so late-attaching them once the lazy engine lands
// is invisible. Cleanups cancel the pending whenEngine callback too, or an
// element removed during the cold window would leak its queued registration.

/** Press feedback: scale down on pointer-down/Enter, spring back on release. */
export function pressable(scale = 0.97): Attachment {
	return (el) => {
		let stop: VoidFunction | undefined;
		const cancel = whenEngine((m) => {
			stop = m.press(el, (target) => {
				// disabled buttons still receive pointerdown in some browsers — no feedback for them
				if (!motionOK() || (el as HTMLButtonElement).disabled) return;
				m.animate(target, { scale }, { duration: 0.11, ease: 'easeOut' });
				return () => {
					m.animate(target, { scale: 1 }, SPRING_POP);
				};
			});
		});
		return () => {
			cancel();
			stop?.();
		};
	};
}

/** Subtle hover lift for primary CTAs. motion's hover() filters emulated touch-hover. */
export function hoverLift(dy = -1.5): Attachment {
	return (el) => {
		let stop: VoidFunction | undefined;
		const cancel = whenEngine((m) => {
			stop = m.hover(el, (target) => {
				if (!motionOK()) return;
				m.animate(target, { y: dy }, SPRING_UI);
				return () => {
					m.animate(target, { y: 0 }, SPRING_UI);
				};
			});
		});
		return () => {
			cancel();
			stop?.();
		};
	};
}

/** Signature move: on hover the [data-arrow] child exits along `axis` (right/down)
 *  and re-enters from the opposite side. */
export function arrowSwap(distance = 14, axis: 'x' | 'y' = 'x'): Attachment {
	return (el) => {
		const arrow = el.querySelector<HTMLElement>('[data-arrow]');
		if (!arrow) return;
		let seq = 0;
		let stop: VoidFunction | undefined;
		const cancel = whenEngine((m) => {
			stop = m.hover(el, () => {
				if (!motionOK()) return;
				const id = ++seq;
				m.animate(arrow, { [axis]: distance, opacity: 0 }, { duration: 0.15, ease: 'easeIn' }).then(
					() => {
						if (id !== seq) return;
						m.animate(arrow, { [axis]: [-distance, 0], opacity: [0, 1] }, SPRING_UI);
					}
				);
				return () => {
					seq++;
					m.animate(arrow, { [axis]: 0, opacity: 1 }, { duration: 0.15, ease: 'easeOut' });
				};
			});
		});
		return () => {
			cancel();
			stop?.();
		};
	};
}
