import { test, expect, type Page } from '@playwright/test';

const texts = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    (window as any).editor.getJSON().blocks.map((b: { content: { text: string }[] }) => b.content.map((c) => c.text).join(''))
  );
const editorRoot = (page: Page) => page.locator('#editor');
const panel = (page: Page) => page.getByRole('search', { name: 'Find and replace' });
const findField = (page: Page) => panel(page).getByRole('textbox', { name: 'Find', exact: true });

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
  await page.keyboard.type('the cat sat');
  await page.keyboard.press('Enter');
  await page.keyboard.type('a Cat and a cat');
});

test('Mod+F opens the panel, Enter moves through the matches, Escape selects the current one', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+f');
  await expect(panel(page)).toBeVisible();
  await expect(findField(page)).toBeFocused();

  await page.keyboard.type('cat');
  await expect(panel(page).getByRole('status')).toHaveText('1 of 3');
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('status')).toHaveText('2 of 3');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.press('Shift+Enter');
  await expect(panel(page).getByRole('status')).toHaveText('3 of 3');

  await page.keyboard.press('Escape');
  await expect(panel(page)).toBeHidden();
  await expect(editorRoot(page)).toBeFocused();
  expect(await page.evaluate(() => getSelection()!.toString())).toBe('cat');
  // Typing replaces the selected match, as in any editor.
  await page.keyboard.type('dog');
  expect(await texts(page)).toEqual(['the cat sat', 'a Cat and a dog']);
});

test('the matches are painted over the text where the browser can, without changing it', async ({ page }) => {
  const word = editorRoot(page).locator('p').first();
  const before = await word.screenshot();
  await page.keyboard.press('ControlOrMeta+f');
  await page.keyboard.type('cat');
  const supported = await page.evaluate(() => typeof (window as any).Highlight !== 'undefined' && !!(CSS as any).highlights);
  test.skip(!supported, 'no CSS Custom Highlight API in this browser');
  expect(await page.evaluate(() => (CSS as any).highlights.get('levit-search').size)).toBe(3);
  expect(Buffer.compare(before, await word.screenshot())).not.toBe(0);
  // The editor's DOM is the same: no marks were added for the matches.
  await expect(word).toHaveText('the cat sat');
  expect(await word.evaluate((el) => el.querySelectorAll('mark, .levit-search').length)).toBe(0);
});

test('Mod+Alt+F shows the replace field; Replace all is undone in one step', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Alt+f');
  const replaceField = panel(page).getByRole('textbox', { name: 'Replace with' });
  await expect(replaceField).toBeVisible();
  await page.keyboard.type('cat');
  await replaceField.fill('dog');
  await panel(page).getByRole('button', { name: 'Replace all' }).click();
  expect(await texts(page)).toEqual(['the dog sat', 'a dog and a dog']);
  await expect(panel(page).getByRole('status')).toHaveText('3 replaced');

  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  expect(await texts(page)).toEqual(['the cat sat', 'a Cat and a cat']);
});

test('Replace changes the current match and moves on', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Alt+f');
  await page.keyboard.type('cat');
  const replaceField = panel(page).getByRole('textbox', { name: 'Replace with' });
  await replaceField.fill('cats');
  await replaceField.press('Enter');
  await replaceField.press('Enter');
  // "cats" holds "cat" again, but the panel goes on past what it put in.
  expect(await texts(page)).toEqual(['the cats sat', 'a cats and a cat']);
  await expect(panel(page).getByRole('status')).toHaveText('3 of 3');
});

test('focus stays in the replace field, so Enter after Enter replaces again', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+Alt+f');
  await page.keyboard.type('cat');
  const replaceField = panel(page).getByRole('textbox', { name: 'Replace with' });
  await replaceField.fill('dog');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(replaceField).toBeFocused();
  expect(await texts(page)).toEqual(['the dog sat', 'a dog and a cat']);
  await panel(page).getByRole('button', { name: 'Replace all' }).focus();
  await page.keyboard.press('Enter');
  await expect(panel(page).getByRole('button', { name: 'Replace all' })).toBeFocused();
});
