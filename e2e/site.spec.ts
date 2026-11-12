import { test, expect, type Page } from '@playwright/test';

// The website (site/), served by its own Vite server: see playwright.config.ts.
const SITE = process.env.LEVIT_SITE_URL ?? 'http://localhost:5193/levit/';

const panel = (page: Page, name: string) => page.locator(`[data-panel="${name}"]`);
const editor = (page: Page, name: string) => page.locator(`[data-editor="${name}"]`);

test.describe('landing page', () => {
  test('opens in each language with its title and a working editor', async ({ page }) => {
    for (const [path, lang, title] of [
      ['', 'en', 'Rich text, zero dependencies.'],
      ['ko/', 'ko', '의존성 없는 리치 텍스트 에디터'],
      ['ja/', 'ja', '依存ゼロのリッチテキストエディター'],
    ]) {
      await page.goto(SITE + path);
      await expect(page.locator('html')).toHaveAttribute('lang', lang);
      await expect(page.locator('h1')).toHaveText(title);
      await expect(editor(page, 'write').locator('.levit-block').first()).toBeVisible();
    }
  });

  test('the editor takes typing, and the slash menu follows the chosen menu language', async ({ page }) => {
    await page.goto(SITE);
    const quote = editor(page, 'write').locator('blockquote, .levit-block-blockquote').first();
    await quote.click();
    await page.keyboard.type(' Really.');
    await expect(editor(page, 'write')).toContainText('Really.');

    await page.locator('[data-menus]').selectOption('ja');
    await editor(page, 'write').locator('.levit-block-paragraph').first().click();
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await expect(page.getByRole('option', { name: /見出し1/ })).toBeVisible();
  });

  test('the table toolbar shows over the sample table, in the menu language', async ({ page }) => {
    await page.goto(SITE + 'ko/');
    await editor(page, 'write').locator('td').first().click();
    const bar = page.getByRole('toolbar', { name: '표 도구' });
    await expect(bar).toBeVisible();
    await bar.getByRole('button', { name: '아래에 행 추가' }).click();
    await expect(editor(page, 'write').locator('tr')).toHaveCount(4);

    // One toolbar for each editor on the page, also after the menus are made again.
    const count = await page.locator('.levit-table-toolbar').count();
    await page.locator('[data-menus]').selectOption('ja');
    await editor(page, 'write').locator('td').first().click();
    await expect(page.getByRole('toolbar', { name: '表ツール' })).toBeVisible();
    await expect(page.locator('.levit-table-toolbar')).toHaveCount(count);
  });

  test('AI: improving the sample sentence shows a suggestion to accept', async ({ page }) => {
    await page.goto(SITE);
    await page.getByRole('tab', { name: 'AI' }).click();
    await expect(panel(page, 'ai')).toBeVisible();
    await page.locator('[data-ai="improve"]').click();
    await expect(editor(page, 'ai').locator('ins').first()).toBeVisible();
    await expect.poll(() => editor(page, 'ai').locator('ins').allTextContents().then((t) => t.join(''))).toContain('dependencies');
    await expect(page.locator('[data-ai="stop"]')).toBeDisabled();
    await page.getByRole('button', { name: 'Accept' }).click();
    await expect(editor(page, 'ai').locator('ins, del')).toHaveCount(0);
    await expect(editor(page, 'ai')).toContainText('Our new editor is fast and has no dependencies');
  });

  test('AI and comment buttons still work after the sample text is deleted', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(SITE);
    for (const tab of ['AI', 'Comments']) {
      await page.getByRole('tab', { name: tab }).click();
      const name = tab === 'AI' ? 'ai' : 'comments';
      await editor(page, name).click();
      await page.keyboard.press('ControlOrMeta+a');
      await page.keyboard.press('Backspace');
      await page.keyboard.type('Short');
    }
    await page.getByRole('tab', { name: 'AI' }).click();
    await page.locator('[data-ai="improve"]').click();
    await expect(editor(page, 'ai').locator('ins').first()).toBeVisible();
    await page.getByRole('tab', { name: 'Comments' }).click();
    await page.locator('[data-comment-add]').click();
    await expect(page.locator('[data-comment-list] > li')).toHaveCount(1);
    expect(errors).toEqual([]);
  });

  test('while an AI answer streams, the other AI buttons wait and Stop works', async ({ page }) => {
    await page.goto(SITE);
    await page.getByRole('tab', { name: 'AI' }).click();
    await page.locator('[data-ai="continue"]').click();
    await expect(page.locator('[data-ai="summarize"]')).toBeDisabled();
    await expect(page.locator('[data-menus]')).toBeDisabled();
    await page.locator('[data-ai="stop"]').click();
    await expect(page.locator('[data-ai="summarize"]')).toBeEnabled();
    await expect(page.locator('[data-ai="stop"]')).toBeDisabled();
    await expect(page.locator('[data-menus]')).toBeEnabled();
  });

  test('Together: what one person types shows up for the other', async ({ page }) => {
    await page.goto(SITE);
    await page.getByRole('tab', { name: 'Together' }).click();
    await editor(page, 'left').locator('.levit-block-paragraph').last().click();
    await page.keyboard.type(' Hi Joon!');
    await expect(editor(page, 'right')).toContainText('Hi Joon!');
  });

  test('Comments: one to start with, and another on the selection', async ({ page }) => {
    await page.goto(SITE);
    await page.getByRole('tab', { name: 'Comments' }).click();
    const items = page.locator('[data-comment-list] > li');
    await expect(items).toHaveCount(1);
    await expect(items.first()).toContainText('about 5 ms');
    await page.locator('[data-comment-add]').click();
    await expect(items).toHaveCount(2);
    await expect(editor(page, 'comments').locator('.levit-comment')).toHaveCount(2);
    await items.first().getByRole('button', { name: 'Resolve' }).click();
    await expect(items).toHaveCount(1);
  });

  test('the formats line shows the document as Levit, HTML and JSON', async ({ page }) => {
    await page.goto(SITE);
    const input = page.locator('[data-formats-input]');
    await input.fill('# Hello **there**');
    await expect(page.locator('[data-out="preview"] h1')).toHaveText('Hello there');
    await expect(page.locator('[data-out="html"]')).toHaveText('<h1>Hello <strong>there</strong></h1>');
    await expect(page.locator('[data-out="json"]')).toContainText('"heading"');
  });

  test('pasted HTML in the feature band comes out without scripts or handlers', async ({ page }) => {
    await page.goto(SITE);
    const kept = page.locator('[data-paste-out]');
    await expect(kept).toContainText('Hello');
    await expect(kept).not.toContainText('onclick');
    await expect(kept).not.toContainText('script');
    await expect(kept).not.toContainText('javascript:');
  });

  test('a feature switch shows and hides its detail', async ({ page }) => {
    await page.goto(SITE);
    const sw = page.locator('[data-band="2"] .switch');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(page.locator('[data-band="2"]')).toHaveClass(/is-on/);
  });
});

test.describe('guide and docs', () => {
  test('docs open with a table of contents that leads to its sections', async ({ page }) => {
    await page.goto(SITE + 'ko/docs/');
    await expect(page.locator('h1')).toHaveText('개발 문서');
    const link = page.locator('.toc a').nth(1);
    const target = decodeURIComponent((await link.getAttribute('href'))!.slice(1));
    await link.click();
    await expect(page.locator(`[id="${target}"]`)).toBeInViewport();
  });

  test('a code copy button goes back to its label, even after two quick clicks', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard permission is a Chromium feature');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(SITE + 'ja/docs/');
    const button = page.locator('.prose pre .code-copy').first();
    await expect(button).toHaveText('コピー');
    await button.dblclick();
    await expect(button).toHaveText('コピーしました');
    await expect(button).toHaveText('コピー', { timeout: 5000 });
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('npm install');
  });

  test('the language links lead to the same page in another language', async ({ page }) => {
    await page.goto(SITE + 'guide/');
    await page.locator('.langs a[hreflang="ja"]').click();
    await expect(page).toHaveURL(SITE + 'ja/guide/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  });
});
