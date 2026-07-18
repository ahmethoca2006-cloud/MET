import { test, expect } from '@playwright/test';
import { openStudio, typeIntoTextLayer } from './studioFixture';

/**
 * Regression for a bug where the canvas view would suddenly snap to a different pan/zoom whenever
 * the Studio's canvas container resized — most visibly when selecting a text layer with the Move
 * tool, since text/adjustment layer selection auto-opens that layer's dock panel (`Studio.tsx`'s
 * `selectLayer` calls `dock.selectTab`), shrinking the canvas container mid-interaction.
 *
 * Cause: `StudioCanvas.tsx`'s fitToScreen effect re-ran on *every* container resize, not just on
 * page-open or an explicit Fit command, recentring/rescaling the view out from under the user.
 *
 * The zoom-percentage readout (bottom-right of the canvas) is real, on-screen state driven directly
 * by the `scale` value fitToScreen would overwrite, so reading it before/after is a reliable signal
 * without needing to reach into React internals.
 */
test('canvas pan/zoom survives a container resize instead of snapping back to fit', async ({ page }) => {
  page.on('pageerror', (e) => { throw new Error(`Uncaught page error: ${e.message}`); });
  await openStudio(page);

  const zoomReadout = page.locator('.font-mono.text-micro', { hasText: '%' });
  await expect(zoomReadout).toBeVisible();

  // Zoom to a value nothing would coincidentally recompute to via fitToScreen.
  await page.keyboard.press('=');
  await page.keyboard.press('=');
  await page.keyboard.press('=');
  await page.waitForTimeout(200);
  const zoomedIn = await zoomReadout.textContent();

  // Place and select a text layer with the Move tool — this used to open the Text panel, shrink
  // the canvas container, and trigger an unwanted re-fit.
  await page.keyboard.press('t');
  const canvas = page.locator('canvas').first();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await typeIntoTextLayer(page, 'hello');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const afterTextPanelOpened = await zoomReadout.textContent();
  expect(afterTextPanelOpened, 'zoom should be unchanged after the Text panel auto-opens').toBe(zoomedIn);

  await page.keyboard.press('v');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(300);

  const afterReselecting = await zoomReadout.textContent();
  expect(afterReselecting, 'zoom should still be unchanged after reselecting the text layer').toBe(zoomedIn);
});
