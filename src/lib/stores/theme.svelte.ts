import { browser } from '$app/environment';
import { MediaQuery } from 'svelte/reactivity';
import type { ThemeMode } from '$lib/types';

let mode: ThemeMode = $state('system');
// Server fallback is false → resolved 'light' while prerendering, same as the
// old $state(false); the pre-hydration class comes from app.html's IIFE.
const systemDark = new MediaQuery('(prefers-color-scheme: dark)');

if (browser) {
	// Blocked storage (strict privacy modes) throws on ACCESS — an uncaught
	// throw here takes the whole app down at module init (F-61). Degrade to
	// the system theme instead.
	try {
		const stored = localStorage.getItem('theme') as ThemeMode | null;
		if (stored === 'dark' || stored === 'light') mode = stored;
	} catch {
		// No storage — 'system' default stands.
	}
}

const resolved: 'light' | 'dark' = $derived(
	mode === 'system' ? (systemDark.current ? 'dark' : 'light') : mode
);

if (browser) {
	$effect.root(() => {
		$effect(() => {
			document.documentElement.classList.toggle('dark', resolved === 'dark');
			try {
				localStorage.setItem('theme', mode);
			} catch {
				// Blocked/quota storage — the theme still applies, just not persisted.
			}
		});
	});
}

export const theme = {
	get mode() {
		return mode;
	},
	set mode(v: ThemeMode) {
		mode = v;
	},
	get resolved() {
		return resolved;
	},
	cycle() {
		mode = mode === 'system' ? 'dark' : mode === 'dark' ? 'light' : 'system';
	}
};
