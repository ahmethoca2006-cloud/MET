import { test, expect } from '@playwright/test';
import { openStudio } from './studioFixture';

/**
 * Move tool dragging pixel content trapped inside an active marquee selection.
 *
 * Paints a black square at a known spot on a fresh clean-patch layer, marquee-selects exactly
 * that square, then drags it 100px to the right with the Move tool. If the drag works, the
 * original spot goes back to the seeded grey background (the content was cut out) and the new
 * spot turns black (the content landed there).
 */

async function pixelAt(page: import('@playwright/test').Page, x: number, y: number): Promise<{ r: number; g: number; b: number }> {
  const shot = await page.screenshot({ clip: { x: x - 4, y: y - 4, width: 8, height: 8 } });
  return page.evaluate(async (b64) => {
    const img = new Image();
    await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); img.src = `data:image/png;base64,${b64}`; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let r = 0, g = 0, bl = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i + 1]; bl += data[i + 2]; }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(bl / n) };
  }, shot.toString('base64'));
}

const isBlack = (c: { r: number; g: number; b: number }) => c.r < 40 && c.g < 40 && c.b < 40;
const isGrey = (c: { r: number; g: number; b: number }) => Math.abs(c.r - 128) < 20 && Math.abs(c.g - 128) < 20 && Math.abs(c.b - 128) < 20;

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => { throw new Error(`Uncaught page error: ${e.message}`); });
  await openStudio(page);
});

test('dragging inside a marquee selection moves the selected pixel content', async ({ page }) => {
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.waitForTimeout(400);

  const box = (await page.locator('canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  // Paint a filled black square centred on the stage using the Rectangle shape tool.
  await page.keyboard.press('u');
  await page.mouse.move(cx - 30, cy - 30);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  expect(isBlack(await pixelAt(page, cx, cy)), 'square should be painted black').toBe(true);

  // Marquee-select exactly around the square.
  await page.keyboard.press('m');
  await page.mouse.move(cx - 40, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Move tool: drag from inside the selection 100px to the right.
  await page.keyboard.press('v');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 100, cy, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const original = await pixelAt(page, cx, cy);
  const moved = await pixelAt(page, cx + 100, cy);
  expect(isGrey(original), `original spot should be cut back to background grey, got ${JSON.stringify(original)}`).toBe(true);
  expect(isBlack(moved), `moved spot should now be black, got ${JSON.stringify(moved)}`).toBe(true);
});

test('a click with no drag inside a selection does not cut the content', async ({ page }) => {
  await page.getByRole('button', { name: 'Add layer' }).click();
  await page.waitForTimeout(400);

  const box = (await page.locator('canvas').first().boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  await page.keyboard.press('u');
  await page.mouse.move(cx - 30, cy - 30);
  await page.mouse.down();
  await page.mouse.move(cx + 30, cy + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  await page.keyboard.press('m');
  await page.mouse.move(cx - 40, cy - 40);
  await page.mouse.down();
  await page.mouse.move(cx + 40, cy + 40, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  // Move tool: press and release without moving, squarely inside the selection.
  await page.keyboard.press('v');
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);

  expect(isBlack(await pixelAt(page, cx, cy)), 'a stray click should not cut the selected content').toBe(true);
});
