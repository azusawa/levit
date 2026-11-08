import { test, expect, type Page } from '@playwright/test';

type Block = {
  type: string;
  attrs?: Record<string, unknown>;
  content: { text: string; marks?: { type: string; attrs?: Record<string, unknown> }[] }[];
};

const blocks = (page: Page): Promise<Block[]> =>
  page.evaluate(() => (window as any).editor.getJSON().blocks);

const text = (b: Block) => b.content.map((c) => c.text).join('');
const editorRoot = (page: Page) => page.locator('#editor');

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixture.html');
  await page.waitForFunction(() => (window as any).editorReady === true);
  await editorRoot(page).click();
});

test.describe('nested lists', () => {
  test('Tab nests an item, Shift+Tab moves it back, focus stays in the editor', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('two');
    await page.keyboard.press('Enter');
    await page.keyboard.type('three');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.type('!');

    const list = await blocks(page);
    expect(list.map((b) => [text(b), b.attrs?.indent ?? 0])).toEqual([
      ['one', 0],
      ['two', 1],
      ['three!', 0],
    ]);
    await expect(editorRoot(page)).toBeFocused();
    await expect(editorRoot(page).locator('[data-indent="1"]')).toHaveText('two');
  });

  test('a nested item is drawn further right than its parent', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.type('two');

    const [parent, child] = await editorRoot(page).locator('.levit-list-item').evaluateAll((els) =>
      els.map((el) => el.getBoundingClientRect().left)
    );
    expect(child).toBeGreaterThan(parent);
  });

  test('Backspace at the start of a nested item moves it up a level', async ({ page }) => {
    await page.keyboard.type('- one');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('two');

    const list = await blocks(page);
    expect(list.map((b) => [b.type, text(b), b.attrs?.indent ?? 0])).toEqual([
      ['bullet_list_item', 'one', 0],
      ['bullet_list_item', 'two', 0],
    ]);
  });
});

test.describe('task lists', () => {
  test('"[] " starts a task, clicking the box checks it and typing continues', async ({ page }) => {
    await page.keyboard.type('[] buy milk');
    await page.keyboard.press('Enter');
    await page.keyboard.type('call mom');
    await editorRoot(page).locator('.levit-task-checkbox').first().click();
    await page.keyboard.type('!');

    const list = await blocks(page);
    expect(list.map((b) => [b.type, text(b), b.attrs?.checked])).toEqual([
      ['task_list_item', 'buy milk', true],
      ['task_list_item', 'call mom!', false],
    ]);
    await expect(editorRoot(page).locator('[role="checkbox"]').first()).toHaveAttribute('aria-checked', 'true');
  });

  test('typing in an empty task puts the text after the checkbox', async ({ page }) => {
    await page.keyboard.type('[] ');
    await page.keyboard.type('a');
    const [box, item] = await Promise.all([
      editorRoot(page).locator('.levit-task-checkbox').boundingBox(),
      editorRoot(page).locator('.levit-block-task_list_item').evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el.lastChild!);
        return range.getBoundingClientRect().left;
      }),
    ]);
    expect(item).toBeGreaterThan(box!.x + box!.width);
  });

  test('Mod+Enter checks the task at the caret', async ({ page }) => {
    await page.keyboard.type('[] task');
    await page.keyboard.press('ControlOrMeta+Enter');
    expect((await blocks(page)).map((b) => b.attrs?.checked)).toEqual([true]);
  });
});

const PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGP4z8CAFTEMIwkAZ6s/wdl1JJcAAAAASUVORK5CYII=';

test.describe('dividers and images', () => {
  test('"---" draws a divider and typing continues below it; Backspace removes it', async ({ page }) => {
    await page.keyboard.type('above');
    await page.keyboard.press('Enter');
    await page.keyboard.type('---');
    await page.keyboard.type('below');
    expect((await blocks(page)).map((b) => [b.type, text(b)])).toEqual([
      ['paragraph', 'above'],
      ['horizontal_rule', ''],
      ['paragraph', 'below'],
    ]);
    await expect(editorRoot(page).locator('hr')).toBeVisible();

    // Home does not move the caret on a Mac, so jump back over the one word.
    await page.keyboard.press(process.platform === 'darwin' ? 'Alt+ArrowLeft' : 'Control+ArrowLeft');
    await page.keyboard.press('Backspace');
    expect((await blocks(page)).map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    await page.keyboard.type('!');
    expect((await blocks(page)).map(text)).toEqual(['above', '!below']);
  });

  test('a dropped image file is uploaded and shown', async ({ page }) => {
    await page.keyboard.type('start');
    await page.evaluate((png) => {
      const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], 'dot.png', { type: 'image/png' }));
      const target = document.querySelector('#editor .levit-block')!;
      const r = target.getBoundingClientRect();
      target.dispatchEvent(
        new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 1, clientY: r.top + 5 })
      );
    }, PNG);

    const image = editorRoot(page).locator('figure img');
    await expect(image).toBeVisible();
    expect(await image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(8);
    const list = await blocks(page);
    expect(list.map((b) => b.type)).toEqual(['paragraph', 'image', 'paragraph']);
    expect(String(list[1].attrs?.src)).toMatch(/^blob:/);
  });

  test('select all and delete removes images at the edges too', async ({ page }) => {
    await page.evaluate((png) => {
      (window as any).editor.setJSON({
        version: 1,
        blocks: [
          { type: 'image', attrs: { src: `data:image/png;base64,${png}`, alt: 'dot' }, content: [{ text: '' }] },
          { type: 'paragraph', content: [{ text: 'middle' }] },
          { type: 'image', attrs: { src: `data:image/png;base64,${png}`, alt: 'dot' }, content: [{ text: '' }] },
        ],
      });
    }, PNG);
    await editorRoot(page).locator('p').click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('new');
    expect((await blocks(page)).map((b) => [b.type, text(b)])).toEqual([['paragraph', 'new']]);
  });
});
