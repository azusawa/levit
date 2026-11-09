import { test, expect, type Page } from '@playwright/test';

const textOf = (page: Page, editor: 'a' | 'b') =>
  page.evaluate((e) => (window as any)[e].getText(), editor);

/** Clicks into an editor and puts the caret at the start (Home does not on macOS WebKit). */
async function caretAtStart(page: Page, editor: 'a' | 'b') {
  await page.locator(`#${editor}`).click();
  await page.evaluate((e) => {
    const ed = (window as any)[e];
    ed.dispatch(ed.state.tr.setSelection({ anchor: { blockId: 'p', offset: 0 }, head: { blockId: 'p', offset: 0 }, isCollapsed: true }));
  }, editor);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/collab-fixture.html');
  await page.waitForFunction(() => (window as any).ready === true);
});

test('typing in one editor shows up in the other', async ({ page }) => {
  await page.locator('#a').click();
  await page.keyboard.press('End');
  await page.keyboard.type(' More!');
  await expect.poll(() => textOf(page, 'b')).toBe('Hello world, this is shared. More!');
});

test('the other user’s caret is drawn at their position, with their name', async ({ page }) => {
  // Ben puts the caret right after "Hello".
  await page.locator('#b').click();
  await page.evaluate(() => {
    const b = (window as any).b;
    b.dispatch(b.state.tr.setSelection({ anchor: { blockId: 'p', offset: 5 }, head: { blockId: 'p', offset: 5 }, isCollapsed: true }));
  });
  const caret = page.locator('#a + .levit-remote-cursors .levit-remote-caret');
  await expect(caret).toHaveCount(1);
  await expect(caret.locator('.levit-remote-name')).toHaveText('Ben');

  // Where "Hello" ends in editor A.
  const end = await page.evaluate(() => {
    const text = document.querySelector('#a [data-block-id="p"]')!.firstChild!;
    const r = document.createRange();
    r.setStart(text.nodeType === 3 ? text : text.firstChild!, 5);
    r.collapse(true);
    const rect = r.getClientRects()[0];
    return { x: rect.left, y: rect.top };
  });
  const box = (await caret.boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - end.x)).toBeLessThan(3);
  expect(Math.abs(box.y - end.y)).toBeLessThan(4);

  // Ana types before it: the caret moves right with the text.
  await caretAtStart(page, 'a');
  await page.keyboard.type('Oh! ');
  await expect.poll(async () => (await caret.boundingBox())!.x).toBeGreaterThan(box.x + 10);
});

test('undo takes back only my own change', async ({ page }) => {
  await page.locator('#a').click();
  await page.keyboard.press('End');
  await page.keyboard.type('A');
  await caretAtStart(page, 'b');
  await page.keyboard.type('B');
  await page.locator('#a').click();
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => textOf(page, 'a')).toBe('BHello world, this is shared.');
  await expect.poll(() => textOf(page, 'b')).toBe('BHello world, this is shared.');
});

test('a comment added with the bubble menu shows up for the other user', async ({ page }) => {
  await page.locator('#a').click();
  await page.evaluate(() => {
    const a = (window as any).a;
    a.dispatch(a.state.tr.setSelection({ anchor: { blockId: 'p', offset: 0 }, head: { blockId: 'p', offset: 5 }, isCollapsed: false }));
  });
  await page.getByRole('button', { name: 'Comment' }).click();
  await expect(page.locator('#b .levit-comment')).toHaveText('Hello');
  expect(await page.evaluate(() => (window as any).added.map((c: { text: string }) => c.text))).toEqual(['Hello']);

  // The comment at the caret is highlighted.
  await page.evaluate(() => {
    const a = (window as any).a;
    a.dispatch(a.state.tr.setSelection({ anchor: { blockId: 'p', offset: 2 }, head: { blockId: 'p', offset: 2 }, isCollapsed: true }));
  });
  await expect(page.locator('#a .levit-comment')).toHaveClass(/is-active/);
});
