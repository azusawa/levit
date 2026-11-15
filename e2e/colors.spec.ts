import { test, expect, type Page } from '@playwright/test';

const editorRoot = (page: Page) => page.locator('#editor');
const bubble = (page: Page) => page.locator('.levit-bubble-menu');

async function setDoc(page: Page, blocks: unknown[]) {
  await page.evaluate((b) => (window as any).editor.setJSON({ version: 1, blocks: b }), blocks);
}

async function selectText(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector(sel)!);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, selector);
}

const marks = (page: Page) => page.evaluate(() => (window as any).editor.getJSON().blocks[0].content.map((n: any) => n.marks ?? []));
const style = (page: Page, selector: string, property: string) =>
  page.evaluate(([sel, prop]) => getComputedStyle(document.querySelector(sel)!).getPropertyValue(prop), [selector, property]);

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test.describe('text colors', () => {
  test('the palette colors the selected text, readable in light and dark themes', async ({ page }) => {
    await setDoc(page, [{ id: 'p', type: 'paragraph', content: [{ text: 'hello' }] }]);
    await selectText(page, '#editor p');
    await bubble(page).getByRole('button', { name: 'Color' }).click();
    const panel = bubble(page).locator('.levit-color-panel');
    await expect(panel).toBeVisible();
    // The palette fits in a phone-sized window.
    expect((await panel.boundingBox())!.width).toBeLessThan(340);

    await panel.getByRole('group', { name: 'Text color' }).getByRole('button', { name: 'Red' }).click();
    expect(await marks(page)).toEqual([[{ type: 'color', attrs: { color: 'red' } }]]);
    await expect(panel).toBeHidden();
    expect(await style(page, '#editor .levit-color', 'color')).toBe('rgb(185, 28, 28)');

    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
    expect(await style(page, '#editor .levit-color', 'color')).toBe('rgb(248, 113, 113)');
  });

  test('highlights in a color', async ({ page }) => {
    await setDoc(page, [{ id: 'p', type: 'paragraph', content: [{ text: 'hello' }] }]);
    await selectText(page, '#editor p');
    await bubble(page).getByRole('button', { name: 'Color' }).click();
    await bubble(page).getByRole('group', { name: 'Highlight color' }).getByRole('button', { name: 'Blue' }).click();
    expect(await style(page, '#editor mark', 'background-color')).toBe('rgb(219, 234, 254)');
  });

  test('works from the keyboard', async ({ page }) => {
    await setDoc(page, [{ id: 'p', type: 'paragraph', content: [{ text: 'hello' }] }]);
    await selectText(page, '#editor p');
    await page.keyboard.press('Alt+F10');
    const colorButton = bubble(page).getByRole('button', { name: 'Color' });
    while (!(await colorButton.evaluate((b) => b === document.activeElement))) await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(bubble(page).getByRole('button', { name: 'Default' })).toBeFocused();
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');
    await expect(bubble(page).getByRole('group', { name: 'Text color' }).getByRole('button', { name: 'Red' })).toBeFocused();
    await page.keyboard.press('Enter');
    expect(await marks(page)).toEqual([[{ type: 'color', attrs: { color: 'red' } }]]);
    await expect(colorButton).toBeFocused();
  });
});

test.describe('cell colors', () => {
  test('the table toolbar colors the cell with the caret', async ({ page }) => {
    await setDoc(page, [
      { id: 'a', type: 'table_cell', attrs: { table: 't', row: 'r' }, content: [{ text: 'A' }] },
      { id: 'b', type: 'table_cell', attrs: { table: 't', row: 'r' }, content: [{ text: 'B' }] },
    ]);
    await page.locator('[data-block-id="b"]').click();
    const toolbar = page.locator('.levit-table-toolbar');
    await toolbar.getByRole('button', { name: 'Cell color' }).click();
    await toolbar.getByRole('group', { name: 'Cell color' }).getByRole('button', { name: 'Green' }).click();
    expect(await style(page, '[data-block-id="b"]', 'background-color')).toBe('rgb(220, 252, 231)');
    expect(await style(page, '[data-block-id="a"]', 'background-color')).toBe('rgba(0, 0, 0, 0)');
    await expect(toolbar.getByRole('button', { name: 'Cell color' })).toBeVisible();
  });
});
