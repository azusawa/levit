import { test, expect, type Page } from '@playwright/test';

const editorRoot = (page: Page) => page.locator('#editor');
const text = (page: Page): Promise<string> => page.evaluate(() => (window as any).editor.getText());

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test('"@" lists people under the caret, and Enter puts a mention that Backspace removes whole', async ({ page }) => {
  await page.keyboard.type('Hi @le');
  const list = page.getByRole('listbox', { name: 'Mentions' });
  await expect(list).toBeVisible();
  await expect(list.getByRole('option')).toHaveText(['Lee Jiwoo']);
  // Under the line being typed.
  const caretLine = (await editorRoot(page).locator('p').first().boundingBox())!;
  const box = (await list.boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(caretLine.y + caretLine.height - 1);
  await page.keyboard.press('Enter');
  await expect(list).toBeHidden();
  await expect(editorRoot(page).locator('.levit-mention')).toHaveText('@Lee Jiwoo');
  await page.keyboard.type('ok');
  expect(await text(page)).toBe('Hi @Lee Jiwoo ok');
  for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  expect(await text(page)).toBe('Hi ');
});

test('a mention is picked with the mouse too', async ({ page }) => {
  await page.keyboard.type('@');
  await page.getByRole('option', { name: 'Kim Minsu' }).click();
  await expect(editorRoot(page).locator('.levit-mention')).toHaveText('@Kim Minsu');
  await page.keyboard.type('!');
  expect(await text(page)).toBe('@Kim Minsu !');
});

test('":" with a name lists emoji, and a closing ":" turns a known name into its emoji', async ({ page }) => {
  await page.keyboard.type('Ship it :roc');
  const list = page.getByRole('listbox', { name: 'Emoji' });
  await expect(list).toBeVisible();
  await page.keyboard.press('Enter');
  expect(await text(page)).toBe('Ship it 🚀');
  await page.keyboard.type(' :fire: at 10:30 :)');
  expect(await text(page)).toBe('Ship it 🚀 🔥 at 10:30 :)');
  await expect(list).toBeHidden();
});
