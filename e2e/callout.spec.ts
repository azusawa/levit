import { test, expect } from '@playwright/test';

test.describe('callout', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/e2e/fixture.html');
    await page.waitForFunction(() => (window as any).editorReady === true);
    await page.locator('#editor').click();
  });

  test('typing makes one, Enter adds a line, and Enter on an empty line leaves it', async ({ page }) => {
    await page.keyboard.type('[!warning] one');
    const box = page.locator('.levit-block-callout_block');
    await expect(box).toHaveAttribute('data-kind', 'warning');
    const height = (await box.boundingBox())!.height;
    await page.keyboard.press('Enter');
    // The new empty line shows at once.
    await expect.poll(async () => (await box.boundingBox())!.height).toBeGreaterThan(height);
    await page.keyboard.type('two');
    await expect(box).toContainText('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');
    await expect(page.locator('.levit-block-callout_block')).toHaveCount(1);
    await expect(page.locator('p.levit-block-paragraph', { hasText: 'after' })).toHaveCount(1);
  });

  test('an empty callout shows its mark, not the placeholder', async ({ page }) => {
    await page.keyboard.type('[!warning] ');
    const mark = await page.locator('.levit-block-callout_block').evaluate((el) => getComputedStyle(el, '::before').content);
    expect(mark).toContain('!');
    expect(mark).not.toContain('Type something');
  });
});
