import { test, expect } from '@playwright/test';

const editorRoot = (page: import('@playwright/test').Page) => page.locator('#editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test('the editor is a named multi-line text box', async ({ page }) => {
  await expect(page.getByRole('textbox', { name: 'Rich text editor' })).toHaveAttribute('aria-multiline', 'true');
});

test('keyboard only: select text, Alt+F10 to the toolbar, arrow to Italic, Enter, Escape back', async ({ page }) => {
  await page.keyboard.type('hello');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('Alt+F10');

  const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
  await expect(toolbar.getByRole('button', { name: 'Bold' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(toolbar.getByRole('button', { name: 'Italic' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(toolbar.getByRole('button', { name: 'Italic' })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('Escape');
  await expect(editorRoot(page)).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('!');

  const content = await page.evaluate(() => (window as any).editor.getJSON().blocks[0].content);
  expect(content).toEqual([
    { text: 'hel', marks: [] },
    { text: 'lo!', marks: [{ type: 'italic' }] },
  ]);
});

test('the slash menu is announced through aria-activedescendant', async ({ page }) => {
  await page.keyboard.type('/');
  const listbox = page.getByRole('listbox', { name: 'Insert a block' });
  await expect(listbox).toBeVisible();
  const first = listbox.getByRole('option').first();
  await expect(editorRoot(page)).toHaveAttribute('aria-activedescendant', (await first.getAttribute('id'))!);
  await page.keyboard.press('ArrowDown');
  await expect(listbox.getByRole('option', { selected: true })).toContainText('Heading 1');
  await page.keyboard.press('Escape');
  await expect(editorRoot(page)).not.toHaveAttribute('aria-activedescendant', /.*/);
});
