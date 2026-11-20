import { test, expect, type Page } from '@playwright/test';

const aligns = (page: Page): Promise<(string | undefined)[]> =>
  page.evaluate(() => (window as any).editor.getJSON().blocks.map((b: { attrs: { align?: string } }) => b.attrs.align));
const editorRoot = (page: Page) => page.locator('#editor');
const line = (page: Page, n: number) => editorRoot(page).locator('[data-block-id]').nth(n);

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
  await page.keyboard.type('Title');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Some words that make a line');
});

test('Mod+Shift+E centers the line, Enter keeps it, and Mod+Shift+L takes it back to the left', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Shift+e');
  expect(await aligns(page)).toEqual([undefined, 'center']);
  await expect(line(page, 1)).toHaveCSS('text-align', 'center');

  await page.keyboard.press('Enter');
  await page.keyboard.type('more');
  expect(await aligns(page)).toEqual([undefined, 'center', 'center']);

  await page.keyboard.press('ControlOrMeta+Shift+l');
  expect(await aligns(page)).toEqual([undefined, 'center', undefined]);
  await expect(line(page, 2)).not.toHaveCSS('text-align', 'center');

  // The text is still typed where the caret is.
  await page.keyboard.type('!');
  await expect(line(page, 2)).toHaveText('more!');
});

test('the bubble menu aligns the selected lines', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+a');
  const menu = page.getByRole('toolbar', { name: 'Formatting' });
  await expect(menu).toBeVisible();
  await menu.getByRole('button', { name: 'Align right' }).click();
  expect(await aligns(page)).toEqual(['right', 'right']);
  await expect(line(page, 0)).toHaveCSS('text-align', 'right');
  await expect(menu.getByRole('button', { name: 'Align right' })).toHaveAttribute('aria-pressed', 'true');

  // One undo brings both lines back.
  await page.keyboard.press('ControlOrMeta+z');
  expect(await aligns(page)).toEqual([undefined, undefined]);
});
