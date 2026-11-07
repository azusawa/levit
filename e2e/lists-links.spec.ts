import { test, expect, type Page } from '@playwright/test';

type Block = {
  type: string;
  content: { text: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }[];
};

const blocks = (page: Page): Promise<Block[]> =>
  page.evaluate(() => (window as any).editor.getJSON().blocks);

const summary = async (page: Page) =>
  (await blocks(page)).map((b) => [b.type, b.content.map((c) => c.text).join('')]);

const editorRoot = (page: Page) => page.locator('#editor');
const bubble = (page: Page) => page.locator('.levit-bubble-menu');

async function setDoc(page: Page, blockList: unknown[]) {
  await page.evaluate((b) => (window as any).editor.setJSON({ version: 1, blocks: b }), blockList);
}

async function selectText(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const range = document.createRange();
    range.selectNodeContents(el);
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(range);
  }, selector);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test.describe('lists', () => {
  test('"- " starts a bulleted list, Enter continues it, Enter on an empty item leaves it', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('after');

    expect(await summary(page)).toEqual([
      ['bullet_list_item', 'one'],
      ['bullet_list_item', 'two'],
      ['paragraph', 'after'],
    ]);
    await expect(editorRoot(page).locator('.levit-list-item')).toHaveCount(2);
  });

  test('"1. " starts a numbered list that is numbered in order', async ({ page }) => {
    await page.keyboard.type('1. a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('c');

    const numbers = await editorRoot(page)
      .locator('.levit-block-ordered_list_item')
      .evaluateAll((els) => els.map((e) => e.getAttribute('data-number')));
    expect(numbers).toEqual(['1', '2', '3']);

    const marker = await editorRoot(page)
      .locator('.levit-block-ordered_list_item')
      .nth(1)
      .evaluate((el) => getComputedStyle(el, '::before').content);
    expect(marker).toContain('2');
  });

  test('empty list items still show their bullet', async ({ page }) => {
    await page.keyboard.type('- ');
    const marker = await editorRoot(page)
      .locator('.levit-block-bullet_list_item')
      .evaluate((el) => getComputedStyle(el, '::before').content);
    expect(marker).not.toBe('none');
    expect(marker).not.toBe('""');
  });

  test('Backspace at the start of an item turns it back into a paragraph', async ({ page }) => {
    await page.keyboard.type('- item');
    await page.evaluate(() => {
      const el = document.querySelector('#editor .levit-list-item')!.firstChild!;
      const range = document.createRange();
      range.setStart(el, 0);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.keyboard.press('Backspace');
    expect(await summary(page)).toEqual([['paragraph', 'item']]);
  });

  test('slash menu offers bulleted and numbered lists', async ({ page }) => {
    await page.keyboard.type('/');
    await page.locator('.levit-slash-item', { hasText: 'Bulleted List' }).click();
    expect(await summary(page)).toEqual([['bullet_list_item', '']]);

    await page.keyboard.type('x');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('/');
    await page.locator('.levit-slash-item', { hasText: 'Numbered List' }).click();
    expect((await summary(page)).at(-1)).toEqual(['ordered_list_item', '']);
  });
});

test.describe('links in the bubble menu', () => {
  test.beforeEach(async ({ page }) => {
    await setDoc(page, [{ type: 'paragraph', content: [{ text: 'read the docs' }] }]);
  });

  async function selectDocs(page: Page) {
    await page.evaluate(() => {
      const text = document.querySelector('#editor p')!.firstChild!;
      const range = document.createRange();
      range.setStart(text, 5);
      range.setEnd(text, 13);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await expect(bubble(page)).toBeVisible();
  }

  test('adds a link from the URL field', async ({ page }) => {
    await selectDocs(page);
    await bubble(page).getByRole('button', { name: 'Link' }).click();

    const input = bubble(page).getByRole('textbox', { name: 'Link URL' });
    await expect(input).toBeFocused();
    await input.fill('https://example.com/docs');
    await input.press('Enter');

    const [b] = await blocks(page);
    expect(b.content).toEqual([
      { text: 'read ', marks: [] },
      { text: 'the docs', marks: [{ type: 'link', attrs: { href: 'https://example.com/docs' } }] },
    ]);
    await expect(editorRoot(page).locator('a')).toHaveAttribute('href', 'https://example.com/docs');
    await expect(editorRoot(page)).toBeFocused();
  });

  test('the URL field is centered over the selected text', async ({ page }) => {
    // Keep the selection away from the page edge, where the menu is clamped.
    const prefix = 'A longer sentence so the selected words sit in the middle, ';
    await setDoc(page, [{ type: 'paragraph', content: [{ text: `${prefix}the docs` }] }]);
    const selectionCenter = await page.evaluate((start) => {
      const text = document.querySelector('#editor p')!.firstChild!;
      const range = document.createRange();
      range.setStart(text, start);
      range.setEnd(text, start + 8);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
      const r = range.getBoundingClientRect();
      return r.left + r.width / 2;
    }, prefix.length);
    await expect(bubble(page)).toBeVisible();

    await bubble(page).getByRole('button', { name: 'Link' }).click();
    await expect(bubble(page).getByRole('textbox', { name: 'Link URL' })).toBeVisible();
    const box = (await bubble(page).boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - selectionCenter)).toBeLessThan(4);
  });

  test('rejects unsafe URLs and keeps the field open', async ({ page }) => {
    await selectDocs(page);
    await bubble(page).getByRole('button', { name: 'Link' }).click();
    const input = bubble(page).getByRole('textbox', { name: 'Link URL' });
    await input.fill('javascript:alert(1)');
    await input.press('Enter');

    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(JSON.stringify(await blocks(page))).not.toContain('link');
  });

  test('Escape closes the field without changes', async ({ page }) => {
    await selectDocs(page);
    await bubble(page).getByRole('button', { name: 'Link' }).click();
    const input = bubble(page).getByRole('textbox', { name: 'Link URL' });
    await input.fill('https://example.com');
    await input.press('Escape');

    await expect(input).toBeHidden();
    expect(JSON.stringify(await blocks(page))).not.toContain('link');
    await expect(editorRoot(page)).toBeFocused();
  });

  test('editing a link shows its URL, and clearing it removes the link', async ({ page }) => {
    await setDoc(page, [{ type: 'paragraph', content: [
      { text: 'read ' },
      { text: 'the docs', marks: [{ type: 'link', attrs: { href: 'https://old.example' } }] },
    ] }]);
    await editorRoot(page).click();
    await selectText(page, '#editor a');
    await expect(bubble(page)).toBeVisible();
    await bubble(page).getByRole('button', { name: 'Link' }).click();

    const input = bubble(page).getByRole('textbox', { name: 'Link URL' });
    await expect(input).toHaveValue('https://old.example');
    await input.fill('');
    await input.press('Enter');

    expect(JSON.stringify(await blocks(page))).not.toContain('link');
  });
});

test.describe('bubble menu block buttons', () => {
  test('Quote button turns the block into a quote', async ({ page }) => {
    await setDoc(page, [{ type: 'paragraph', content: [{ text: 'quote me' }] }]);
    await editorRoot(page).click();
    await selectText(page, '#editor p');
    await bubble(page).getByRole('button', { name: 'Quote' }).click();
    expect(await summary(page)).toEqual([['blockquote', 'quote me']]);
  });
});
