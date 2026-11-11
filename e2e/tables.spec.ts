import { test, expect, type Page } from '@playwright/test';

type Block = { id: string; type: string; attrs?: Record<string, unknown>; content: { text: string }[] };

async function blocks(page: Page): Promise<Block[]> {
  return page.evaluate(() => (window as any).editor.getJSON().blocks);
}

/** Each table's rows of cell text; other blocks as "type:text". */
async function shape(page: Page): Promise<unknown[]> {
  const out: unknown[] = [];
  let lastTable: unknown = null;
  let lastRow: unknown = null;
  for (const b of await blocks(page)) {
    const text = b.content.map((c) => c.text).join('');
    if (b.type !== 'table_cell') {
      out.push(`${b.type}:${text}`);
      lastTable = lastRow = null;
      continue;
    }
    if (b.attrs!.table !== lastTable) out.push([]);
    const table = out[out.length - 1] as string[][];
    if (b.attrs!.table !== lastTable || b.attrs!.row !== lastRow) table.push([]);
    table[table.length - 1].push(text);
    lastTable = b.attrs!.table;
    lastRow = b.attrs!.row;
  }
  return out;
}

const editorRoot = (page: Page) => page.locator('#editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

/** Inserts a table with the slash menu: "/table" and Enter. */
async function insertTable(page: Page) {
  await page.keyboard.type('/table');
  await expect(page.locator('.levit-slash-menu')).toBeVisible();
  await page.keyboard.press('Enter');
}

test('a table from the slash menu, filled in with Tab', async ({ page }) => {
  await insertTable(page);
  await page.keyboard.type('Name');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Price');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Total');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Tea');
  await page.keyboard.press('Tab');
  await page.keyboard.type('3');
  expect(await shape(page)).toEqual([[['Name', 'Price', 'Total'], ['Tea', '3', ''], ['', '', '']], 'paragraph:']);
  await expect(page.locator('#editor th')).toHaveCount(3);
  await expect(page.locator('#editor tr').nth(1)).toHaveText('Tea3');
});

test('Tab in the last cell adds a row; Enter makes a line in the cell', async ({ page }) => {
  await page.evaluate(() => (window as any).editor.chain().insertTable(1, 2).run());
  await page.keyboard.type('a');
  await page.keyboard.press('Enter');
  await page.keyboard.type('b');
  await page.keyboard.press('Tab');
  await page.keyboard.type('c');
  await page.keyboard.press('Tab');
  await page.keyboard.type('d');
  expect(await shape(page)).toEqual([[['a\nb', 'c'], ['d', '']], 'paragraph:']);
});

test('clicking a cell puts the caret there', async ({ page }) => {
  await page.evaluate(() => (window as any).editor.chain().insertTable(2, 2).run());
  await page.locator('#editor td').nth(1).click();
  await page.keyboard.type('x');
  expect(await shape(page)).toEqual([[['', ''], ['', 'x']], 'paragraph:']);
});

test('Backspace in an empty cell and after the table keeps the table', async ({ page }) => {
  await page.evaluate(() => (window as any).editor.chain().insertTable(1, 2).run());
  await page.keyboard.type('a');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  expect(await shape(page)).toEqual([[['a', '']], 'paragraph:']);
  await page.locator('#editor p').click();
  await page.keyboard.press('Backspace');
  await page.keyboard.type('!');
  expect(await shape(page)).toEqual([[['a', '!']], 'paragraph:']);
});

test('typing Korean in a cell', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Uses the Chrome DevTools protocol');
  await page.evaluate(() => (window as any).editor.chain().insertTable(1, 2).run());
  await page.keyboard.press('Tab');
  const cdp = await page.context().newCDPSession(page);
  for (const partial of ['ㅍ', '표']) {
    await cdp.send('Input.imeSetComposition', { text: partial, selectionStart: partial.length, selectionEnd: partial.length });
  }
  await cdp.send('Input.insertText', { text: '표' });
  expect(await shape(page)).toEqual([[['', '표']], 'paragraph:']);
  await expect(page.locator('#editor th').nth(1)).toHaveText('표');
});

test('selecting across cells and deleting empties them', async ({ page }) => {
  await page.evaluate(() => {
    const ed = (window as any).editor;
    ed.setJSON({
      version: 1,
      blocks: [
        { type: 'table_cell', attrs: { table: 't', row: 'r1' }, content: [{ text: 'one' }] },
        { type: 'table_cell', attrs: { table: 't', row: 'r1' }, content: [{ text: 'two' }] },
        { type: 'paragraph', content: [{ text: 'after' }] },
      ],
    });
  });
  const first = page.locator('#editor td').first();
  const second = page.locator('#editor td').nth(1);
  const a = await first.boundingBox();
  const b = await second.boundingBox();
  await page.mouse.move(a!.x + 4, a!.y + a!.height / 2);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width - 4, b!.y + b!.height / 2);
  await page.mouse.up();
  await page.keyboard.press('Backspace');
  expect(await shape(page)).toEqual([[['', '']], 'paragraph:after']);
});

test('pasting a table from HTML', async ({ page }) => {
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');
    data.setData('text/plain', 'A\tB\n1\t2');
    // Firefox ignores clipboardData passed to new ClipboardEvent(), so set it on the event.
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: data });
    document.querySelector('#editor')!.dispatchEvent(event);
  });
  expect(await shape(page)).toEqual([[['A', 'B'], ['1', '2']], 'paragraph:']);
});

test('the slash menu in a cell adds a column', async ({ page }) => {
  await page.evaluate(() => (window as any).editor.chain().insertTable(2, 2).run());
  await page.keyboard.type('/column right');
  await page.keyboard.press('Enter');
  expect(await shape(page)).toEqual([[['', '', ''], ['', '', '']], 'paragraph:']);
});
