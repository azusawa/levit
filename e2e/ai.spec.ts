import { test, expect, type Page } from '@playwright/test';

const editorRoot = (page: Page) => page.locator('#editor');
const texts = (page: Page) =>
  page.evaluate(() => (window as any).editor.getJSON().blocks.map((b: any) => [b.type, b.content.map((c: any) => c.text).join('')]));

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/ai-fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

async function typeAndSelectAll(page: Page, text: string) {
  await page.keyboard.type(text);
  await page.keyboard.press('ControlOrMeta+a');
}

test('Improve from the bubble menu shows a suggestion; Accept applies it', async ({ page }) => {
  await typeAndSelectAll(page, 'Teh cat sat on teh mat.');
  await page.getByRole('button', { name: 'Improve writing' }).click();

  await expect(editorRoot(page).locator('del').first()).toHaveText('Teh');
  await expect(editorRoot(page).locator('ins').first()).toHaveText('The');
  const bar = page.getByRole('toolbar', { name: 'AI suggestion' });
  await expect(bar).toBeVisible();

  await bar.getByRole('button', { name: 'Accept' }).click();
  expect(await texts(page)).toEqual([['paragraph', 'The cat sat on the mat.']]);
  await expect(bar).toBeHidden();
  await expect(editorRoot(page).locator('ins, del')).toHaveCount(0);
});

test('Mod+Shift+Backspace rejects a suggestion', async ({ page }) => {
  await typeAndSelectAll(page, 'Teh cat sat on teh mat.');
  await page.getByRole('button', { name: 'Improve writing' }).click();
  await expect(page.getByRole('toolbar', { name: 'AI suggestion' })).toBeVisible();
  await editorRoot(page).click();
  await page.keyboard.press('ControlOrMeta+Shift+Backspace');
  expect(await texts(page)).toEqual([['paragraph', 'Teh cat sat on teh mat.']]);
});

test('Continue writing from the slash menu streams formatted text, undone in one step', async ({ page }) => {
  await page.keyboard.type('The cat sat');
  await page.keyboard.press('Enter');
  await page.keyboard.type('/');
  await page.getByRole('option', { name: /Continue writing/ }).click();

  await expect(editorRoot(page).locator('h2')).toHaveText('Later');
  await expect(editorRoot(page).locator('strong')).toHaveText('ate');
  await expect(editorRoot(page)).toHaveAttribute('contenteditable', 'true');
  expect(await texts(page)).toEqual([
    ['paragraph', 'The cat sat'],
    ['paragraph', 'and then it slept.'],
    ['heading', 'Later'],
    ['bullet_list_item', 'it woke up'],
    ['bullet_list_item', 'it ate'],
  ]);
  const request = await page.evaluate(() => (window as any).aiRequests[0]);
  expect(request.before).toBe('The cat sat');

  await editorRoot(page).click();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await texts(page)).toEqual([['paragraph', 'The cat sat'], ['paragraph', '']]);
});

test('Escape stops an answer and keeps what arrived; the editor is locked meanwhile', async ({ page }) => {
  await page.evaluate(() => ((window as any).slowAnswer = 'one two three four five six seven eight nine ten'));
  await page.keyboard.type('/');
  await page.getByRole('option', { name: /Continue writing/ }).click();
  await expect(editorRoot(page)).toHaveAttribute('aria-busy', 'true');
  await expect(editorRoot(page)).toHaveAttribute('contenteditable', 'false');
  await expect(editorRoot(page)).toContainText('one');
  await page.keyboard.press('Escape');

  await expect(editorRoot(page)).toHaveAttribute('contenteditable', 'true');
  const kept = (await texts(page))[0][1];
  expect(kept.length).toBeGreaterThan(0);
  expect(kept.length).toBeLessThan('one two three four five six seven eight nine ten'.length);
  await page.waitForTimeout(400);
  expect((await texts(page))[0][1]).toBe(kept);
});
