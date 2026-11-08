import { test, expect, type Page } from '@playwright/test';

type Block = {
  type: string;
  attrs?: Record<string, unknown>;
  content: { text: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }[];
};

const blocks = (page: Page): Promise<Block[]> =>
  page.evaluate(() => (window as any).editor.getJSON().blocks);

const text = (b: Block) => b.content.map((c) => c.text).join('');
const editorRoot = (page: Page) => page.locator('#editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test.describe('nested lists', () => {
  test('Tab nests an item, Shift+Tab moves it back, focus stays in the editor', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.type('three');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('!');

    const list = await blocks(page);
    expect(list.map((b) => [text(b), b.attrs?.indent ?? 0])).toEqual([
      ['one', 0],
      ['two', 1],
      ['three!', 0],
    ]);
    await expect(editorRoot(page)).toBeFocused();
    await expect(editorRoot(page).locator('[data-indent="1"]')).toHaveText('two');
  });

  test('a nested item is drawn further right than its parent', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('two');

    const [parent, child] = await editorRoot(page).locator('.levit-list-item').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().left)
    );
    expect(child).toBeGreaterThan(parent);
  });

  test('Backspace at the start of a nested item moves it up a level', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('two');

    const list = await blocks(page);
    expect(list.map((b) => [b.type, text(b), b.attrs?.indent ?? 0])).toEqual([
      ['bullet_list_item', 'one', 0],
      ['bullet_list_item', 'two', 0],
    ]);
  });
});
