import { test, expect, type Page } from '@playwright/test';

const texts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as any).editor.getJSON().blocks.map((b: { content: { text: string }[] }) => b.content.map((c) => c.text).join(''))
  );
const editorRoot = (page: Page) => page.locator('#editor');
const line = (page: Page, n: number) => editorRoot(page).locator(':scope > [data-block-id]').nth(n);
const handle = (page: Page) => page.getByRole('button', { name: 'Block menu' });

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
  for (const [i, word] of ['one', 'two', 'three'].entries()) {
    if (i > 0) await page.keyboard.press('Enter');
    await page.keyboard.type(word);
  }
});

test('Mod+Shift+Up and Down move the line with the caret, and the caret stays in it', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Shift+ArrowUp');
  expect(await texts(page)).toEqual(['one', 'three', 'two']);
  await page.keyboard.press('ControlOrMeta+Shift+ArrowUp');
  expect(await texts(page)).toEqual(['three', 'one', 'two']);
  await page.keyboard.type('!');
  expect(await texts(page)).toEqual(['three!', 'one', 'two']);
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await texts(page)).toEqual(['one', 'three', 'two']);
});

test('dragging the handle moves the block to where it is dropped', async ({ page }) => {
  await line(page, 0).hover();
  await expect(handle(page)).toBeVisible();
  const grip = await handle(page).boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip!.x, grip!.y + 20, { steps: 4 });
  // Measured once the drag has started: WebKit can lay the lines out again
  // then (it sometimes keeps old margins after typing until a class changes).
  const target = (await line(page, 2).boundingBox())!;
  // Into the lower half of the last line: the block goes after it.
  await page.mouse.move(grip!.x, target.y + target.height * 0.75, { steps: 8 });
  await expect(page.locator('.levit-block-drop-indicator')).toBeVisible();
  await page.mouse.up();
  expect(await texts(page)).toEqual(['two', 'three', 'one']);
  await expect(page.locator('.levit-block-drop-indicator')).toBeHidden();
});

test('the block menu turns a block into a heading and duplicates it, from the mouse and the keyboard', async ({ page }) => {
  await line(page, 1).hover();
  await handle(page).click();
  const menu = page.getByRole('menu', { name: 'Block menu' });
  await expect(menu).toBeVisible();
  await menu.getByRole('menuitemradio', { name: 'Heading 2' }).click();
  await expect(menu).toBeHidden();
  await expect(line(page, 1)).toHaveJSProperty('tagName', 'H2');

  await line(page, 1).hover();
  await handle(page).click();
  await expect(menu.getByRole('menuitemradio', { name: 'Heading 2' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('End');
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Duplicate' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect(await texts(page)).toEqual(['one', 'two', 'two', 'three']);
  // Back in the text, in the copy.
  await page.keyboard.type('!');
  expect(await texts(page)).toEqual(['one', 'two', 'two!', 'three']);
});
