/**
 * Tab-shell helpers for the [[tool]] page, extracted as pure functions so the
 * user-facing wording and the title-progress pick are unit-testable without
 * mounting the component.
 */
import { FORMATS } from '$lib/seo';
import type { FileFormat } from '$lib/types';

const TAB_LABELS = Object.fromEntries(FORMATS.map((f) => [f.format, f.label])) as Record<
	FileFormat,
	string
>;

/** The label on a tab's nav pill — what the user can actually find on screen
 *  (zip → "Archive", subtitle → "Subs", model → "3D") — never the internal id. */
export function tabLabel(format: FileFormat): string {
	return TAB_LABELS[format] ?? format;
}

/** Banner for files refused because their destination tab is mid-run. */
export function busyTabsMessage(busyCount: number, busyTabs: FileFormat[]): string {
	return (
		`${busyCount === 1 ? '1 file' : `${busyCount} files`} not added — the ` +
		`${busyTabs.map(tabLabel).join(', ')} ${busyTabs.length === 1 ? 'tab is' : 'tabs are'} ` +
		'busy compressing. Cancel the run or wait for it to finish, then add them again.'
	);
}

/**
 * The run whose progress belongs in the browser-tab title: the ACTIVE tab's
 * when it is compressing (that is the run the user is watching), else the
 * first running tab — concurrent runs elsewhere still deserve a pulse while
 * the active tab sits idle.
 */
export function pickTitleRun<T extends { isCompressing: boolean }>(
	states: Record<string, T>,
	active: string
): T | undefined {
	const current = states[active];
	if (current?.isCompressing) return current;
	return Object.values(states).find((s) => s.isCompressing);
}
