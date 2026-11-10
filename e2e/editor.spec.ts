import { test, expect, type Page } from '@playwright/test';

type Block = { type: string; attrs?: Record<string, unknown>; content: { text: string; marks?: { type: string }[] }[] };

async function blocks(page: Page): Promise<Block[]> {
  return page.evaluate(() => (window as any).editor.getJSON().blocks);
}

async function texts(page: Page): Promise<string[]> {
  return (await blocks(page)).map((b) => b.content.map((c) => c.text).join(''));
}

async function setDoc(page: Page, blockList: unknown[]) {
  await page.evaluate((b) => (window as any).editor.setJSON({ version: 1, blocks: b }), blockList);
}

const editorRoot = (page: Page) => page.locator('#editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test.describe('typing', () => {
  test('typed text lands in the model and the DOM once', async ({ page }) => {
    await page.keyboard.type('Hello world');
    expect(await texts(page)).toEqual(['Hello world']);
    await expect(editorRoot(page)).toHaveText('Hello world');
  });

  test('typing in the middle of a word inserts at the caret', async ({ page }) => {
    await page.keyboard.type('abcd');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type('X');
    expect(await texts(page)).toEqual(['abXcd']);
  });

  test('Enter splits the block and the caret moves to the new block', async ({ page }) => {
    await page.keyboard.type('first');
    await page.keyboard.press('Enter');
    await page.keyboard.type('second');
    expect(await texts(page)).toEqual(['first', 'second']);
  });

  test('Backspace at the start of a block merges it into the previous one', async ({ page }) => {
    await page.keyboard.type('ab');
    await page.keyboard.press('Enter');
    await page.keyboard.type('cd');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Backspace');
    expect(await texts(page)).toEqual(['abcd']);
    await page.keyboard.type('X');
    expect(await texts(page)).toEqual(['abXcd']);
  });

  test('undo and redo with the keyboard', async ({ page }) => {
    await page.keyboard.type('abc');
    await page.keyboard.press('ControlOrMeta+z');
    expect((await texts(page)).join('')).not.toBe('abc');
    await page.keyboard.press('ControlOrMeta+Shift+z');
    expect(await texts(page)).toEqual(['abc']);
  });
});

test.describe('Korean IME composition', () => {
  // Drive Chrome's real IME pipeline through the DevTools protocol:
  // imeSetComposition = text still being composed, insertText = commit.
  test.skip(({ browserName }) => browserName !== 'chromium', 'Uses the Chrome DevTools protocol');
  async function composeKorean(page: Page, steps: string[][]) {
    const cdp = await page.context().newCDPSession(page);
    for (const syllable of steps) {
      const committed = syllable[syllable.length - 1];
      for (const partial of syllable.slice(0, -1)) {
        await cdp.send('Input.imeSetComposition', {
          text: partial,
          selectionStart: partial.length,
          selectionEnd: partial.length,
        });
      }
      await cdp.send('Input.insertText', { text: committed });
    }
  }

  test('composed syllables are inserted exactly once', async ({ page }) => {
    await composeKorean(page, [
      ['ㅎ', '하', '한', '한'],
      ['ㄱ', '그', '글', '글'],
    ]);
    expect(await texts(page)).toEqual(['한글']);
    await expect(editorRoot(page)).toHaveText('한글');
  });

  test('composition after existing text keeps the order', async ({ page }) => {
    await page.keyboard.type('abc ');
    await composeKorean(page, [['ㄷ', '다', '다']]);
    await page.keyboard.type('!');
    expect(await texts(page)).toEqual(['abc 다!']);
    await expect(editorRoot(page)).toHaveText('abc 다!');
  });
});

test.describe('markdown shortcuts', () => {
  test('"# " turns the block into a heading', async ({ page }) => {
    await page.keyboard.type('# Title');
    const [b] = await blocks(page);
    expect(b.type).toBe('heading');
    expect(b.attrs?.level).toBe(1);
    expect(await texts(page)).toEqual(['Title']);
    await expect(editorRoot(page).locator('h1')).toHaveText('Title');
  });

  test('"> " turns the block into a quote', async ({ page }) => {
    await page.keyboard.type('> quoted');
    expect((await blocks(page))[0].type).toBe('blockquote');
    await expect(editorRoot(page).locator('blockquote')).toHaveText('quoted');
  });
});

test.describe('bubble menu', () => {
  test('appears on selection and bolds the selected text', async ({ page }) => {
    await setDoc(page, [{ type: 'paragraph', content: [{ text: 'make me bold' }] }]);
    await page.evaluate(() => {
      const p = document.querySelector('#editor p')!;
      const range = document.createRange();
      range.selectNodeContents(p);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });

    const menu = page.locator('.levit-bubble-menu');
    await expect(menu).toBeVisible();
    await menu.getByRole('button', { name: 'Bold', exact: true }).click();

    const [b] = await blocks(page);
    expect(b.content.every((c) => c.marks?.some((m) => m.type === 'bold'))).toBe(true);
    await expect(editorRoot(page).locator('strong')).toHaveText('make me bold');
  });

  test('hides when the selection collapses', async ({ page }) => {
    await page.keyboard.type('some text');
    await page.keyboard.press('Shift+ArrowLeft');
    await expect(page.locator('.levit-bubble-menu')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.levit-bubble-menu')).toBeHidden();
  });
});

test.describe('slash menu', () => {
  test('opens on "/" in an empty block', async ({ page }) => {
    await page.keyboard.type('/');
    await expect(page.locator('.levit-slash-menu')).toBeVisible();
  });

  test('Escape closes it and keeps the slash', async ({ page }) => {
    await page.keyboard.type('/');
    await page.keyboard.press('Escape');
    await expect(page.locator('.levit-slash-menu')).toBeHidden();
    expect(await texts(page)).toEqual(['/']);
  });

  test('choosing Heading 1 with the keyboard converts the block without splitting it', async ({ page }) => {
    await page.keyboard.type('/');
    await expect(page.locator('.levit-slash-menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');

    await expect(page.locator('.levit-slash-menu')).toBeHidden();
    const result = await blocks(page);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('heading');
    expect(await texts(page)).toEqual(['']);

    await page.keyboard.type('Heading');
    expect(await texts(page)).toEqual(['Heading']);
  });

  test('typing after "/" narrows the list, and Enter takes the match without leaving the "/"', async ({ page }) => {
    await page.keyboard.type('Note /quo');
    await expect(page.locator('.levit-slash-item')).toHaveCount(1);
    await expect(page.locator('.levit-slash-item')).toContainText('Quote');
    await page.keyboard.press('Enter');
    await expect(page.locator('.levit-slash-menu')).toBeHidden();
    expect((await blocks(page))[0].type).toBe('blockquote');
    expect(await texts(page)).toEqual(['Note ']);
  });

  test('does not open for "/" inside a word, and Enter still makes a new line', async ({ page }) => {
    await page.keyboard.type('and/or');
    await expect(page.locator('.levit-slash-menu')).toBeHidden();
    await page.keyboard.press('Enter');
    expect(await texts(page)).toEqual(['and/or', '']);
  });

  test('closes when you click elsewhere on the page', async ({ page }) => {
    await page.keyboard.type('/');
    await expect(page.locator('.levit-slash-menu')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.locator('.levit-slash-menu')).toBeHidden();
  });

  test('choosing an item with the mouse converts the block', async ({ page }) => {
    await page.keyboard.type('/');
    await page.locator('.levit-slash-item', { hasText: 'Quote' }).click();
    const result = await blocks(page);
    expect(result.length).toBe(1);
    expect(result[0].type).toBe('blockquote');
    expect(await texts(page)).toEqual(['']);
  });
});
