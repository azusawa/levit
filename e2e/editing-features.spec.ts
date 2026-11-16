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

  async function textImageText(page: Page) {
    await page.evaluate((png) => {
      (window as any).editor.setJSON({
        version: 1,
        blocks: [
          { id: 'a', type: 'paragraph', content: [{ text: 'before' }] },
          { id: 'i', type: 'image', attrs: { src: `data:image/png;base64,${png}`, alt: 'dot' }, content: [{ text: '' }] },
          { id: 'b', type: 'paragraph', content: [{ text: 'after' }] },
        ],
      });
    }, PNG);
  }
  const head = (page: Page) => page.evaluate(() => (window as any).editor.state.selection.head);
  const figure = (page: Page) => editorRoot(page).locator('figure');

  test('a click selects an image with an outline; Backspace deletes it', async ({ page }) => {
    await textImageText(page);
    await figure(page).locator('img').click();
    await expect(figure(page)).toHaveAttribute('data-selected', '');
    expect(await head(page)).toEqual({ blockId: 'i', offset: 0 });
    expect(await figure(page).locator('img').evaluate((img) => getComputedStyle(img).outlineStyle)).toBe('solid');
    await page.keyboard.press('Backspace');
    expect((await blocks(page)).map((b) => b.type)).toEqual(['paragraph', 'paragraph']);
    await page.keyboard.type('!');
    expect((await blocks(page)).map(text)).toEqual(['before!', 'after']);
  });

  test('the arrow keys stop on an image and go on past it', async ({ page }) => {
    await textImageText(page);
    await editorRoot(page).locator('[data-block-id="b"]').click();
    await page.evaluate(() => {
      const e = (window as any).editor;
      e.dispatch(e.state.tr.setSelection({ anchor: { blockId: 'b', offset: 0 }, head: { blockId: 'b', offset: 0 }, isCollapsed: true }));
    });
    await page.keyboard.press('ArrowLeft');
    await expect(figure(page)).toHaveAttribute('data-selected', '');
    await page.keyboard.press('ArrowLeft');
    expect(await head(page)).toEqual({ blockId: 'a', offset: 6 });
    await expect(figure(page)).not.toHaveAttribute('data-selected', '');
    await page.keyboard.press('ArrowRight');
    await expect(figure(page)).toHaveAttribute('data-selected', '');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.type('>');
    expect((await blocks(page)).map(text)).toEqual(['before', '', '>after']);
  });

  test('typing or Enter on a selected image writes in a new line after it', async ({ page }) => {
    await textImageText(page);
    await figure(page).locator('img').click();
    await page.keyboard.type('x');
    expect((await blocks(page)).map((b) => [b.type, text(b)])).toEqual([
      ['paragraph', 'before'],
      ['image', ''],
      ['paragraph', 'x'],
      ['paragraph', 'after'],
    ]);
  });

  test('a size and an alignment show on the page', async ({ page }) => {
    await textImageText(page);
    const width = () => figure(page).locator('img').evaluate((img) => img.getBoundingClientRect().width);
    const editorWidth = await editorRoot(page).evaluate((el) => el.getBoundingClientRect().width);
    await figure(page).locator('img').click();
    await page.evaluate(() => (window as any).editor.chain().updateImage({ size: 'medium', align: 'right' }).run());
    const img = await figure(page).locator('img').boundingBox();
    const box = await figure(page).boundingBox();
    expect(Math.abs((await width()) - box!.width / 2)).toBeLessThan(2);
    expect(Math.abs(img!.x + img!.width - (box!.x + box!.width))).toBeLessThan(2);
    expect(box!.width).toBeLessThanOrEqual(editorWidth);
    await expect(figure(page)).toHaveAttribute('data-selected', '');
  });
});

test.describe('image toolbar', () => {
  test.beforeEach(async ({ page }) => {
    await page.evaluate((png) => {
      (window as any).editor.setJSON({
        version: 1,
        blocks: [
          { id: 'a', type: 'paragraph', content: [{ text: 'before' }] },
          { id: 'i', type: 'image', attrs: { src: `data:image/png;base64,${png}`, alt: 'dot' }, content: [{ text: '' }] },
          { id: 'b', type: 'paragraph', content: [{ text: 'after' }] },
        ],
      });
    }, PNG);
  });
  const toolbar = (page: Page) => page.locator('.levit-image-toolbar');
  const image = (page: Page) => editorRoot(page).locator('figure img');
  const attrs = (page: Page) => page.evaluate(() => (window as any).editor.getJSON().blocks[1].attrs);

  test('shows above a clicked image; the buttons size and align it', async ({ page }) => {
    await expect(toolbar(page)).toBeHidden();
    await image(page).click();
    await expect(toolbar(page)).toBeVisible();
    // The formatting toolbar is for text: it stays away from a selected image.
    await page.waitForTimeout(200);
    await expect(page.locator('.levit-bubble-menu')).toBeHidden();
    const bar = (await toolbar(page).boundingBox())!;
    const img = (await image(page).boundingBox())!;
    expect(bar.y + bar.height).toBeLessThanOrEqual(img.y);
    await toolbar(page).getByRole('button', { name: 'Medium' }).click();
    await toolbar(page).getByRole('button', { name: 'Center' }).click();
    expect(await attrs(page)).toMatchObject({ size: 'medium', align: 'center' });
    await expect(toolbar(page).getByRole('button', { name: 'Medium' })).toHaveAttribute('aria-pressed', 'true');
    // The toolbar follows the image as it changes.
    const moved = (await image(page).boundingBox())!;
    const barNow = (await toolbar(page).boundingBox())!;
    expect(Math.abs(barNow.x - moved.x)).toBeLessThan(2);
    await editorRoot(page).locator('[data-block-id="b"]').click();
    await expect(toolbar(page)).toBeHidden();
  });

  test('alt text: typed in the field and saved with Enter, also in Korean', async ({ page }) => {
    await image(page).click();
    await toolbar(page).getByRole('button', { name: 'Alt text' }).click();
    const field = toolbar(page).getByRole('textbox', { name: 'Alt text' });
    await expect(field).toBeFocused();
    await expect(field).toHaveValue('dot');
    await field.fill('빨간 점');
    await field.press('Enter');
    expect((await attrs(page)).alt).toBe('빨간 점');
    await expect(image(page)).toHaveAttribute('alt', '빨간 점');
    await expect(editorRoot(page).locator('figure')).toHaveAttribute('data-selected', '');
    await expect(toolbar(page).getByRole('button', { name: 'Alt text' })).toBeVisible();
  });

  test('from the keyboard: Alt+F10, the arrows, Enter, and delete', async ({ page }) => {
    await image(page).click();
    await page.keyboard.press('Alt+F10');
    await expect(toolbar(page).getByRole('button', { name: 'Alt text' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    expect((await attrs(page)).size).toBe('medium');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    expect((await page.evaluate(() => (window as any).editor.getJSON().blocks)).map((b: any) => b.type)).toEqual(['paragraph', 'paragraph']);
    await page.keyboard.type('!');
    expect((await blocks(page)).map(text)).toEqual(['before!', 'after']);
  });
});

test.describe('code block languages', () => {
  async function codeBlock(page: Page, text: string, language?: string) {
    await page.evaluate(
      ([t, l]) =>
        (window as any).editor.setJSON({
          version: 1,
          blocks: [{ type: 'code_block', attrs: l ? { language: l } : {}, content: [{ text: t }] }],
        }),
      [text, language] as const
    );
  }

  test('clicking the label sets the language', async ({ page }) => {
    await codeBlock(page, 'print(1)');
    page.once('dialog', (d) => d.accept('python'));
    const pre = editorRoot(page).locator('pre');
    await pre.hover();
    await pre.locator('.levit-code-language').click();
    expect((await blocks(page))[0].attrs).toEqual({ language: 'python' });
    await expect(pre).toHaveAttribute('data-language', 'python');
  });

  test('the keyboard reaches the label: Alt+F10, then Enter to set the language', async ({ page }) => {
    await codeBlock(page, 'print(1)');
    await editorRoot(page).locator('code').click();
    await page.keyboard.press('Alt+F10');
    const label = editorRoot(page).locator('.levit-code-language');
    await expect(label).toBeFocused();
    page.once('dialog', (d) => d.accept('python'));
    await page.keyboard.press('Enter');
    expect((await blocks(page))[0]).toMatchObject({ attrs: { language: 'python' } });
    expect(text((await blocks(page))[0])).toBe('print(1)');
    await page.keyboard.type('x');
    expect(text((await blocks(page))[0])).toContain('x');
  });

  test('typing inside highlighted code keeps text and caret right', async ({ page }) => {
    await codeBlock(page, 'let a = 1', 'js');
    await expect(editorRoot(page).locator('code .kw')).toHaveText('let');
    await editorRoot(page).locator('code').click();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('return a');

    expect(text((await blocks(page))[0])).toBe('let a = 1\nreturn a');
    await expect(editorRoot(page).locator('code .kw')).toHaveText(['let', 'return']);
  });
});
