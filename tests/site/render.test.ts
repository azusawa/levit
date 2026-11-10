import { describe, it, expect } from 'vitest';
import { renderDoc } from '../../site/lib/render';

describe('renderDoc: a Markdown page for the site', () => {
  const md = [
    '# Using the editor',
    'Levit is **fast**.',
    '## Writing text',
    'Type.',
    '### Line breaks',
    'Shift+Enter.',
    '## 블록과 / 메뉴',
    '```ts\nconst a = 1;\n\nconst b = 2;\n```',
    '## Writing text',
    'Again.',
  ].join('\n\n');

  it('takes the first heading as the title and leaves it out of the body', () => {
    const page = renderDoc(md);
    expect(page.title).toBe('Using the editor');
    expect(page.html).not.toContain('<h1');
    expect(page.html).toContain('<p>Levit is <strong>fast</strong>.</p>');
  });

  it('gives sections ids that work in any language, unique on the page', () => {
    const { html } = renderDoc(md);
    expect(html).toContain('<h2 id="writing-text">Writing text</h2>');
    expect(html).toContain('<h3 id="line-breaks">Line breaks</h3>');
    expect(html).toContain('<h2 id="블록과-메뉴">블록과 / 메뉴</h2>');
    expect(html).toContain('<h2 id="writing-text-2">Writing text</h2>');
  });

  it('lists the sections for the table of contents, with their subsections', () => {
    expect(renderDoc(md).toc).toEqual([
      { id: 'writing-text', text: 'Writing text', children: [{ id: 'line-breaks', text: 'Line breaks' }] },
      { id: '블록과-메뉴', text: '블록과 / 메뉴', children: [] },
      { id: 'writing-text-2', text: 'Writing text', children: [] },
    ]);
  });

  it('keeps code blocks whole, with their language', () => {
    const { html } = renderDoc(md);
    expect(html).toContain('data-language="ts"');
    expect(html).toContain('const a = 1;\n\nconst b = 2;');
  });

  it('keeps ids in order when the body has another top-level heading', () => {
    const { html } = renderDoc('# T\n\n## A\n\n# Again\n\n## B');
    expect(html).toContain('<h2 id="a">A</h2>');
    expect(html).toContain('<h2 id="b">B</h2>');
  });

  it('escapes text, so a page cannot inject markup', () => {
    const { html, toc } = renderDoc('# T\n\n## <img src=x onerror=alert(1)>\n\nUse `<levit-editor>`.');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;levit-editor&gt;');
    expect(toc[0].text).toBe('<img src=x onerror=alert(1)>');
  });
});
