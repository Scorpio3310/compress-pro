import { untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { engine, whenEngine, type MotionModule } from './engine';
import { motionOK } from './prefs.svelte';
import { SPRING_POP } from './tokens';

// viewBox units: +3 lands the chevron tips exactly on the bar's stroke edge
const SQUEEZE = 3;
const BAR_SQUASH = 0.8;
const IN = { duration: 0.14, ease: 'easeIn' } as const;
// starts right as the header's .reveal-css rise (0.55s) settles
const ENTRANCE_DELAY = 600;
// beat at full squeeze so the entrance pulse reads as "compress", not a twitch
const PULSE_HOLD = 140;

// Lazy-engine degradation: timed entrance pulses check engine() AT FIRE TIME
// and skip when it hasn't loaded — a pulse queued for later would fire
// detached from the CSS rise it echoes. Hover/press registrations late-attach
// via whenEngine (nothing animates until the user interacts, so attaching a
// few hundred ms late is invisible); cleanups cancel the pending callback.

/** Logo "compress": chevrons squeeze toward the bar — one pulse on load, held while hovered. */
export function logoSqueeze(): Attachment {
	return (el) => {
		const [top, bar, bottom] = el.querySelectorAll<SVGPathElement>('svg path');
		if (!bottom) return;
		// the bar's scaleX must squash around its own center
		bar.style.transformBox = 'fill-box';
		bar.style.transformOrigin = 'center';

		const compress = (m: MotionModule) => {
			m.animate(top, { y: SQUEEZE }, IN);
			m.animate(bar, { scaleX: BAR_SQUASH }, IN);
			return m.animate(bottom, { y: -SQUEEZE }, IN);
		};
		const release = (m: MotionModule) => {
			m.animate(top, { y: 0 }, SPRING_POP);
			m.animate(bar, { scaleX: 1 }, SPRING_POP);
			m.animate(bottom, { y: 0 }, SPRING_POP);
		};

		// untrack: flipping the OS motion preference must not re-run a one-shot entrance.
		let held = false;
		let pulse: ReturnType<typeof setTimeout> | undefined;
		if (untrack(motionOK)) {
			pulse = setTimeout(() => {
				const m = engine();
				if (!m) return; // engine still cold at fire time — skip, never queue
				compress(m).then(() => {
					pulse = setTimeout(() => {
						if (!held) release(m);
					}, PULSE_HOLD);
				});
			}, ENTRANCE_DELAY);
		}

		let stopHover: VoidFunction | undefined;
		const cancel = whenEngine((m) => {
			stopHover = m.hover(el, () => {
				if (!motionOK()) return;
				clearTimeout(pulse); // hovering during the entrance takes over
				held = true;
				compress(m);
				return () => {
					held = false;
					release(m);
				};
			});
		});
		return () => {
			clearTimeout(pulse);
			cancel();
			stopHover?.();
		};
	};
}

// Error-page squeeze: here the DIGITS do the squashing, so chevron travel must
// cover the resting gap PLUS the glyph edge's recession toward its own center.
const DIGIT_SQUASH = 0.7;
const DIGIT_BULGE = 1.04;
const PRESS_K = 1.6; // a pointer press squeezes harder than the pulse
const IDLE_MS = 6000;

/**
 * Error-page "compress": the status digits squash between two brand chevrons —
 * entrance pulse, slow idle loop, hover holds, press flattens harder. The
 * `[data-sq-tick]` size readout (if present) fades in after the first release.
 */
export function errorSqueeze(): Attachment {
	return (el) => {
		const q = (sel: string) => el.querySelector<HTMLElement>(sel);
		const top = q('[data-sq-top]');
		const digits = q('[data-sq-digits]');
		const bottom = q('[data-sq-bottom]');
		const tick = q('[data-sq-tick]');
		const hit = q('[data-sq-hit]') ?? (el as HTMLElement);
		if (!top || !digits || !bottom) return;

		// untrack: flipping the OS motion preference must not re-run a one-shot entrance.
		// The tick pre-hide additionally requires a LOADED engine: hiding it on the
		// promise of a later release would strand the "→ 0 B" readout invisible if
		// the engine never lands (offline) — better a static tick than a missing one.
		const animated = untrack(motionOK);
		let ticked = true;
		if (animated && tick && engine()) {
			tick.style.opacity = '0';
			ticked = false;
		}

		// measured at rest; reveal-css only translates ancestors, so both stay true
		const gap = digits.getBoundingClientRect().top - top.getBoundingClientRect().bottom;
		const half = digits.getBoundingClientRect().height / 2;

		const compress = (m: MotionModule, k = 1) => {
			const squash = 1 - (1 - DIGIT_SQUASH) * k;
			// +2 lets the tips just kiss the squashed glyph
			const travel = gap + half * (1 - squash) + 2;
			m.animate(top, { y: travel }, IN);
			m.animate(digits, { scaleY: squash, scaleX: 1 + (DIGIT_BULGE - 1) * k }, IN);
			return m.animate(bottom, { y: -travel }, IN);
		};
		const release = (m: MotionModule) => {
			m.animate(top, { y: 0 }, SPRING_POP);
			m.animate(digits, { scaleY: 1, scaleX: 1 }, SPRING_POP);
			m.animate(bottom, { y: 0 }, SPRING_POP);
			if (tick && !ticked) {
				ticked = true;
				m.animate(tick, { opacity: [0, 1], x: [-6, 0] }, { ...SPRING_POP, delay: 0.06 });
			}
		};

		let hovered = false;
		let pressed = false;
		let hold: ReturnType<typeof setTimeout> | undefined;
		const pulse = () => {
			const m = engine();
			if (!m) return; // cold at fire time — the idle loop self-heals later
			compress(m).then(() => {
				hold = setTimeout(() => {
					if (!hovered && !pressed) release(m);
				}, PULSE_HOLD);
			});
		};
		let entrance: ReturnType<typeof setTimeout> | undefined;
		if (animated) entrance = setTimeout(pulse, ENTRANCE_DELAY);
		const idle = setInterval(() => {
			if (motionOK() && !hovered && !pressed) pulse();
		}, IDLE_MS);

		let stopHover: VoidFunction | undefined;
		let stopPress: VoidFunction | undefined;
		const cancel = whenEngine((m) => {
			stopHover = m.hover(hit, () => {
				if (!motionOK()) return;
				clearTimeout(entrance); // hovering during the entrance takes over
				hovered = true;
				compress(m);
				return () => {
					hovered = false;
					if (!pressed) release(m);
				};
			});
			stopPress = m.press(hit, () => {
				if (!motionOK()) return;
				clearTimeout(entrance);
				pressed = true;
				compress(m, PRESS_K);
				return () => {
					pressed = false;
					// still hovered → settle back to hover depth, not all the way out
					if (hovered) compress(m);
					else release(m);
				};
			});
		});

		return () => {
			clearTimeout(entrance);
			clearTimeout(hold);
			clearInterval(idle);
			cancel();
			stopHover?.();
			stopPress?.();
		};
	};
}

/**
 * Hero h1 "compress": the `[data-squeeze]` word squashes once as the hero's
 * reveal settles, echoing the logo pulse. Attach to the persistent `<h1>` —
 * tab navigations only swap its text, so the entrance never re-fires.
 */
export function heroSqueeze(): Attachment {
	return (el) => {
		// untrack: flipping the OS motion preference must not re-run a one-shot entrance.
		if (!untrack(motionOK)) return;
		let pulse: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
			const m = engine();
			if (!m) return; // engine still cold at fire time — skip, never queue
			// resolved at fire time — a fast tab switch may have swapped the span
			const word = el.querySelector<HTMLElement>('[data-squeeze]');
			if (!word) return;
			// pure vertical squash — a scaleX bulge would transiently swallow the
			// space between the word and the rest of the heading
			word.style.transformOrigin = 'center 70%';
			m.animate(word, { scaleY: 0.78 }, IN).then(() => {
				pulse = setTimeout(() => {
					m.animate(word, { scaleY: 1 }, SPRING_POP);
				}, PULSE_HOLD);
			});
		}, ENTRANCE_DELAY + 60); // h1 sits at --reveal-i:1 — fire as its rise settles
		return () => clearTimeout(pulse);
	};
}
