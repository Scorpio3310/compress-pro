import { browser } from '$app/environment';
import type { SettingsMap } from '$lib/types';
import { defaultSettings, mergeStoredSettings, serializeSettings } from './settings-merge';

/** Bump when the persisted shape changes incompatibly — old data is discarded. */
export const SETTINGS_VERSION = 2; // v2: outputFormat gained 'auto' (new default)
const STORAGE_KEY = 'settings';

/**
 * Per-tab compression settings, persisted across visits (same pattern as
 * theme.svelte.ts). Consumers mutate nested properties (`settings.jpg.quality`
 * etc. via bind:) — the deep $state proxy makes every change persist.
 */
export const settings: SettingsMap = $state(defaultSettings());

if (browser) {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (raw) {
			const parsed: unknown = JSON.parse(raw);
			if (
				typeof parsed === 'object' &&
				parsed !== null &&
				(parsed as { version?: unknown }).version === SETTINGS_VERSION
			) {
				mergeStoredSettings(settings, (parsed as { data?: unknown }).data);
			}
		}
	} catch {
		// Corrupted storage → keep defaults; the effect below rewrites it.
	}

	// Module scope has no component owner — root the persisting effect manually.
	$effect.root(() => {
		$effect(() => {
			// Guarded like the read above: quota-exceeded / blocked storage must
			// degrade to "settings don't persist", never to an uncaught throw on
			// every settings mutation (quality sweep F-61).
			try {
				localStorage.setItem(
					STORAGE_KEY,
					serializeSettings(SETTINGS_VERSION, $state.snapshot(settings))
				);
			} catch {
				// Private-mode/quota storage — in-memory settings keep working.
			}
		});
	});
}
