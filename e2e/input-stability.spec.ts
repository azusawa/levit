import { test, expect, type Page } from '@playwright/test';

type Block = { type: string; content: { text: string; marks?: { type: string }[] }[] };

const blocks = (page: Page): Promise<Block[]> =>
  page.evaluate(() => (window as any).editor.getJSON().blocks);
const texts = async (page: Page) => (await blocks(page)).map((b) => b.content.map((c) => c.text).join(''));
const summary = async (page: Page) =>
  (await blocks(page)).map((b) => [b.type, b.content.map((c) => c.text).join('')]);
const editorRoot = (page: Page) => page.locator('#editor');

const isMac = process.platform === 'darwin';
const WORD_DELETE = isMac ? 'Alt+Backspace' : 'Control+Backspace';

async function setDoc(page: Page, blockList: unknown[]) {
  await page.evaluate((b) => (window as any).editor.setJSON({ version: 1, blocks: b }), blockList);
}

/** Puts the caret at a character offset inside the n-th block. */
async function caretAt(page: Page, blockIndex: number, offset: number) {
  await page.evaluate(
    ([i, o]) => {
      const ed = (window as any).editor;
      const id = ed.getJSON().blocks[i].id;
      ed.dispatch(ed.state.tr.setSelection({
        anchor: { blockId: id, offset: o },
        head: { blockId: id, offset: o },
        isCollapsed: true,
      }));
    },
    [blockIndex, offset]
  );
}

/** Fires a paste event with the given clipboard data, like Cmd/Ctrl+V would. */
async function pasteData(page: Page, data: Record<string, string>) {
  await page.evaluate((d) => {
    const dt = new DataTransfer();
    for (const [type, value] of Object.entries(d)) dt.setData(type, value);
    const target = getSelection()!.anchorNode!.parentElement ?? document.querySelector('#editor')!;
    target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, data);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test.describe('deleting', () => {
  test('Delete removes the next character and pulls the next block up', async ({ page }) => {
    await setDoc(page, [
      { type: 'paragraph', content: [{ text: 'abc' }] },
      { type: 'paragraph', content: [{ text: 'next' }] },
    ]);
    await caretAt(page, 0, 1);
    await page.keyboard.press('Delete');
    expect(await texts(page)).toEqual(['ac', 'next']);

    await caretAt(page, 0, 2);
    await page.keyboard.press('Delete');
    expect(await texts(page)).toEqual(['acnext']);
    await expect(editorRoot(page)).toHaveText('acnext');
  });

  test('word delete removes the previous word', async ({ page }) => {
    await page.keyboard.type('hello big world');
    await page.keyboard.press(WORD_DELETE);
    expect(await texts(page)).toEqual(['hello big ']);
    await expect(editorRoot(page)).toHaveText('hello big ');
  });

  test('Cmd+Backspace removes the line before the caret (macOS)', async ({ page }) => {
    test.skip(!isMac, 'Line delete shortcut is macOS-only');
    await page.keyboard.type('remove all this');
    await page.keyboard.press('Meta+Backspace');
    expect(await texts(page)).toEqual(['']);
  });

  test('Backspace removes a whole emoji', async ({ page }) => {
    await page.keyboard.type('a');
    await page.keyboard.insertText('👨‍👩‍👧');
    await page.keyboard.press('Backspace');
    expect(await texts(page)).toEqual(['a']);
    await expect(editorRoot(page)).toHaveText('a');
  });

  test('typing over a selection across blocks replaces it', async ({ page }) => {
    await setDoc(page, [
      { type: 'paragraph', content: [{ text: 'one' }] },
      { type: 'paragraph', content: [{ text: 'two' }] },
    ]);
    await page.evaluate(() => {
      const [a, b] = Array.from(document.querySelectorAll('#editor p')).map((p) => p.firstChild!);
      const range = document.createRange();
      range.setStart(a, 1);
      range.setEnd(b, 2);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.keyboard.type('X');
    expect(await texts(page)).toEqual(['oXo']);
  });
});

test.describe('Shift+Enter', () => {
  test('adds a visible line break inside the block', async ({ page }) => {
    await page.keyboard.type('line one');
    const oneLine = await editorRoot(page).locator('p').evaluate((el) => el.getBoundingClientRect().height);
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('line two');

    expect(await summary(page)).toEqual([['paragraph', 'line one\nline two']]);
    const twoLines = await editorRoot(page).locator('p').evaluate((el) => el.getBoundingClientRect().height);
    expect(twoLines).toBeGreaterThan(oneLine * 1.5);
  });

  test('a break at the end shows an empty line the caret can type on', async ({ page }) => {
    await page.keyboard.type('end');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('x');
    expect(await texts(page)).toEqual(['end\nx']);
  });
});

test.describe('paste', () => {
  test('HTML from another page becomes blocks with formatting', async ({ page }) => {
    await pasteData(page, {
      'text/html': '<meta charset="utf-8"><h2>Title</h2><div><p>Some <b>bold</b> text</p></div><ul><li>a</li><li>b</li></ul>',
      'text/plain': 'Title\nSome bold text\na\nb',
    });
    expect(await summary(page)).toEqual([
      ['heading', 'Title'],
      ['paragraph', 'Some bold text'],
      ['bullet_list_item', 'a'],
      ['bullet_list_item', 'b'],
    ]);
    await expect(editorRoot(page).locator('h2')).toHaveText('Title');
    await expect(editorRoot(page).locator('strong')).toHaveText('bold');
    await expect(editorRoot(page).locator('.levit-list-item')).toHaveCount(2);
  });

  test('typing continues right after the pasted text', async ({ page }) => {
    await page.keyboard.type('ab');
    await page.keyboard.press('ArrowLeft');
    await pasteData(page, { 'text/plain': 'one\ntwo' });
    await page.keyboard.type('!');
    expect(await texts(page)).toEqual(['aone', 'two!b']);
  });

  test('pasting into a code block keeps plain text', async ({ page }) => {
    await setDoc(page, [{ type: 'code_block', content: [{ text: '' }] }]);
    await caretAt(page, 0, 0);
    await pasteData(page, { 'text/html': '<h1>x</h1>', 'text/plain': 'const a = 1;\n  b();' });
    expect(await summary(page)).toEqual([['code_block', 'const a = 1;\n  b();']]);
  });

  test('undo removes the whole paste', async ({ page }) => {
    await page.keyboard.type('start ');
    await pasteData(page, { 'text/plain': 'pasted\ntext' });
    await page.keyboard.press('ControlOrMeta+z');
    expect(await texts(page)).toEqual(['start ']);
  });
});

test.describe('real clipboard (Chrome)', () => {
  test('copy and paste with the keyboard keeps list items and marks', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await setDoc(page, [
      { type: 'ordered_list_item', content: [{ text: 'first' }] },
      { type: 'ordered_list_item', content: [{ text: 'second', marks: [{ type: 'bold' }] }] },
      { type: 'paragraph', content: [{ text: '' }] },
    ]);
    await page.evaluate(() => {
      const items = document.querySelectorAll('#editor .levit-list-item');
      const range = document.createRange();
      range.setStart(items[0].firstChild!, 0);
      range.setEnd(items[1].querySelector('strong')!.firstChild!, 6);
      getSelection()!.removeAllRanges();
      getSelection()!.addRange(range);
    });
    await page.keyboard.press('ControlOrMeta+c');
    await caretAt(page, 2, 0);
    await page.keyboard.press('ControlOrMeta+v');

    expect((await summary(page)).slice(2)).toEqual([
      ['ordered_list_item', 'first'],
      ['ordered_list_item', 'second'],
    ]);
    expect((await blocks(page))[3].content[0].marks).toEqual([{ type: 'bold' }]);
  });

  test('cut with the keyboard removes the text and puts it on the clipboard', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'Clipboard permissions are Chromium-only in Playwright');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.keyboard.type('keep cut');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('ControlOrMeta+x');
    expect(await texts(page)).toEqual(['keep ']);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('cut');
  });
});

test.describe('drop', () => {
  test('dropping text from outside inserts it where it lands', async ({ page }) => {
    await setDoc(page, [{ type: 'paragraph', content: [{ text: 'left right' }] }]);
    await page.evaluate(() => {
      const text = document.querySelector('#editor p')!.firstChild!;
      const range = document.createRange();
      range.setStart(text, 5);
      range.setEnd(text, 5);
      const rect = range.getBoundingClientRect();
      const dt = new DataTransfer();
      dt.setData('text/plain', 'MID ');
      text.parentElement!.dispatchEvent(new DragEvent('drop', {
        dataTransfer: dt, bubbles: true, cancelable: true,
        clientX: rect.left + 1, clientY: rect.top + rect.height / 2,
      }));
    });
    expect(await texts(page)).toEqual(['left MID right']);
  });
});

test.describe('DOM guard', () => {
  test('changes made to the DOM by scripts are rolled back', async ({ page }) => {
    await page.keyboard.type('model');
    await page.evaluate(() => {
      const p = document.querySelector('#editor p')!;
      p.firstChild!.nodeValue = 'tampered';
      const font = document.createElement('font');
      font.textContent = 'junk';
      p.appendChild(font);
    });
    await expect(editorRoot(page)).toHaveText('model');
    await page.keyboard.type('!');
    expect(await texts(page)).toEqual(['model!']);
  });
});
