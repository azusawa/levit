import { test, expect, type Page } from '@playwright/test';

const blocks = (page: Page) => page.evaluate(() => (window as any).editor.getJSON().blocks.map((b: any) => [b.type, b.content.map((c: any) => c.text).join(''), b.attrs ?? {}]));

test.describe('toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/fixture.html');
    await page.waitForFunction(() => (window as any).editorReady === true);
    await page.locator('#editor').click();
  });

  test('the slash menu makes an open toggle; its lines hide when it closes', async ({ page }) => {
    await page.keyboard.type('/toggle');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Title');
    await page.keyboard.press('Enter');
    await page.keyboard.type('hidden line');
    expect(await blocks(page)).toEqual([['toggle_block', 'Title\nhidden line', { open: true }]]);
    const body = page.locator('.levit-toggle-body');
    await expect(body).toBeVisible();
    await page.locator('.levit-toggle-button').click();
    await expect(body).toBeHidden();
    await expect(page.locator('.levit-toggle-button')).toHaveAttribute('aria-expanded', 'false');
  });

  test('typing after Enter in the summary goes into the body, and Enter on an empty last line leaves', async ({ page }) => {
    await page.evaluate(() => (window as any).editor.setJSON({ version: 1, blocks: [{ id: 't', type: 'toggle_block', attrs: { open: true }, content: [{ text: 'Title', marks: [] }] }] }));
    await page.locator('.levit-toggle-summary').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('one');
    await expect(page.locator('.levit-toggle-body')).toHaveText('one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    expect(await blocks(page)).toEqual([['toggle_block', 'Title\none', { open: true }], ['paragraph', 'after', {}]]);
  });

  test('Enter in the summary of a closed toggle starts a paragraph below it', async ({ page }) => {
    await page.evaluate(() => (window as any).editor.setJSON({ version: 1, blocks: [{ id: 't', type: 'toggle_block', content: [{ text: 'Title\nbody', marks: [] }] }] }));
    await page.locator('.levit-toggle-summary').click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('next');
    expect(await blocks(page)).toEqual([['toggle_block', 'Title\nbody', {}], ['paragraph', 'next', {}]]);
  });
});
