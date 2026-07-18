/**
 * ST-01…02: per-tab settings persist across reloads (localStorage store).
 */
import { expect, fx, test } from '../fixtures';
import { gotoTab, setOutputFormat, setQuality, setTargetKb, upload } from '../helpers';

test('ST-01: quality survives a reload', async ({ page }) => {
	await gotoTab(page, 'jpg');
	await upload(page, fx('tiny-optimized.jpg')); // controls render once files exist
	await setQuality(page, 55);

	await page.reload();
	await gotoTab(page, 'jpg');
	await upload(page, fx('tiny-optimized.jpg'));
	await expect(page.locator('#quality')).toHaveValue('55');
	await expect(page.getByText('55%')).toBeVisible();
});

test('ST-02: output format and target mode survive a reload', async ({ page }) => {
	await gotoTab(page, 'png');
	await upload(page, fx('graphic-alpha.png'));
	await setOutputFormat(page, 'WebP');
	await setTargetKb(page, 250);

	await page.reload();
	await gotoTab(page, 'png');
	await upload(page, fx('graphic-alpha.png'));
	await expect(page.getByRole('button', { name: 'WebP', exact: true })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
	await expect(page.locator('button[data-seg="target"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('#target-size-kb')).toHaveValue('250');
});

test('ST-20: blocked localStorage must not take the app down', async ({ page }) => {
	// F-61: strict privacy modes throw on ANY localStorage access — theme read
	// at module init used to crash hydration; the persist effects threw on
	// every settings change. The app must degrade to non-persisting instead.
	await page.addInitScript(() => {
		Object.defineProperty(window, 'localStorage', {
			get() {
				throw new DOMException('denied', 'SecurityError');
			}
		});
	});
	await gotoTab(page, 'jpg'); // hydration itself must survive
	await upload(page, fx('tiny-optimized.jpg'));
	await setQuality(page, 60); // triggers the persist effect — must not throw
	await expect(page.getByTestId('compress-cta')).toBeEnabled();
});
