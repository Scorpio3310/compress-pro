import { describe, expect, it } from 'vitest';
import { busyTabsMessage, pickTitleRun, tabLabel } from './tab-ui';

describe('tabLabel', () => {
	it('maps internal ids to the labels on the nav pills', () => {
		expect(tabLabel('zip')).toBe('Archive');
		expect(tabLabel('subtitle')).toBe('Subs');
		expect(tabLabel('ebook')).toBe('Books');
		expect(tabLabel('model')).toBe('3D');
		expect(tabLabel('font')).toBe('Fonts');
		expect(tabLabel('jpg')).toBe('JPG');
	});
});

describe('busyTabsMessage', () => {
	it('names tabs by their UI labels, never internal ids', () => {
		const msg = busyTabsMessage(1, ['zip']);
		expect(msg).toContain('1 file not added — the Archive tab is busy compressing.');
		expect(msg).not.toMatch(/\bzip\b/);
	});

	it('pluralizes both the file count and the tab list', () => {
		const msg = busyTabsMessage(3, ['subtitle', 'model']);
		expect(msg).toContain('3 files not added — the Subs, 3D tabs are busy compressing.');
		expect(msg).not.toMatch(/\bsubtitle\b|\bmodel\b/);
	});

	it('keeps the actionable instruction', () => {
		expect(busyTabsMessage(1, ['pdf'])).toMatch(
			/Cancel the run or wait for it to finish, then add them again\./
		);
	});
});

describe('pickTitleRun', () => {
	const idle = () => ({ isCompressing: false, progress: 0 });
	const runningAt = (progress: number) => ({ isCompressing: true, progress });

	it('prefers the ACTIVE tab when it is compressing, regardless of object order', () => {
		// jpg precedes video in declaration order — the watched (active) video
		// run must still win the title.
		const states = { jpg: runningAt(0.9), video: runningAt(0.3) };
		expect(pickTitleRun(states, 'video')).toBe(states.video);
	});

	it('falls back to the first running tab when the active tab is idle', () => {
		const states = { jpg: idle(), video: runningAt(0.3) };
		expect(pickTitleRun(states, 'jpg')).toBe(states.video);
	});

	it('returns undefined when nothing runs', () => {
		expect(pickTitleRun({ jpg: idle(), video: idle() }, 'jpg')).toBeUndefined();
	});
});
