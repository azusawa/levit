import { describe, it, expect } from 'vitest';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { tableAt } from '../../src/core/model/table';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { DocumentData, InlineNode } from '../../src/core/model/types';

const cell = (row: string, content: InlineNode[] | string, header = false, table = 't') =>
  createBlock('table_cell', header ? { table, row, header: true } : { table, row }, typeof content === 'string' ? [createTextNode(content)] : content);
const para = (text: string) => createBlock('paragraph', {}, [createTextNode(text)]);

/** Each table as rows of "text" (header cells as "#text"), other blocks as "type:text". */
function shape(doc: DocumentData): unknown[] {
  const out: unknown[] = [];
  let i = 0;
  while (i < doc.blocks.length) {
    const t = tableAt(doc, doc.blocks[i].id);
    if (!t) {
      out.push(`${doc.blocks[i].type}:${getBlockText(doc.blocks[i])}`);
      i += 1;
      continue;
    }
    out.push(t.rows.map((row) => row.map((k) => `${doc.blocks[k].attrs?.header ? '#' : ''}${getBlockText(doc.blocks[k])}`)));
    i = t.end + 1;
  }
  return out;
}

const grid = () => createDocument([
  cell('r1', 'A', true), cell('r1', 'B', true),
  cell('r2', [createTextNode('C', [{ type: 'bold' }])]), cell('r2', 'x<y\nz'),
]);

describe('tables to HTML', () => {
  it('writes a table, the header row in thead', () => {
    expect(documentToHTML(grid())).toBe(
      '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
      '<tbody><tr><td><strong>C</strong></td><td>x&lt;y<br>z</td></tr></tbody></table>'
    );
  });

  it('writes a table without a header', () => {
    const doc = createDocument([cell('r1', 'A'), cell('r2', 'B')]);
    expect(documentToHTML(doc)).toBe('<table><tbody><tr><td>A</td></tr><tr><td>B</td></tr></tbody></table>');
  });

  it('keeps tables apart from each other and from lists', () => {
    const doc = createDocument([
      createBlock('bullet_list_item', {}, [createTextNode('i')]),
      cell('r1', 'A', false, 't1'), cell('r1', 'B', false, 't2'), para('p'),
    ]);
    expect(documentToHTML(doc)).toBe(
      '<ul><li>i</li></ul><table><tbody><tr><td>A</td></tr></tbody></table><table><tbody><tr><td>B</td></tr></tbody></table><p>p</p>'
    );
  });
});

describe('tables from HTML', () => {
  it('reads rows and cells, th as header cells', () => {
    const doc = htmlToDocument('<p>before</p><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><b>C</b></td><td>D</td></tr></tbody></table><p>after</p>');
    expect(shape(doc)).toEqual(['paragraph:before', [['#A', '#B'], ['C', 'D']], 'paragraph:after']);
    expect(doc.blocks[3].content[0].marks).toEqual([{ type: 'bold' }]);
  });

  it('reads the HTML it writes', () => {
    expect(shape(htmlToDocument(documentToHTML(grid())))).toEqual(shape(grid()));
  });

  it('puts paragraphs and list items in a cell on lines of the cell', () => {
    const doc = htmlToDocument('<table><tr><td><p>one</p><ul><li>two</li></ul>three</td></tr></table>');
    expect(shape(doc)).toEqual([[['one\ntwo\nthree']]]);
  });

  it('fills the columns a wide cell spans with empty cells', () => {
    const doc = htmlToDocument('<table><tr><td colspan="2">A</td></tr><tr><td>B</td><td>C</td></tr></table>');
    expect(shape(doc)).toEqual([[['A', ''], ['B', 'C']]]);
  });

  it('caps a huge colspan', () => {
    const doc = htmlToDocument('<table><tr><td colspan="100000">A</td></tr></table>');
    expect(doc.blocks.length).toBeLessThanOrEqual(64);
  });

  it('reads a table inside a cell as text', () => {
    const doc = htmlToDocument('<table><tr><td>A<table><tr><td>x</td><td>y</td></tr></table></td></tr></table>');
    expect(shape(doc)).toEqual([[['A\nx\ny']]]);
  });

  it('keeps the caption as a paragraph before the table', () => {
    const doc = htmlToDocument('<table><caption>Prices</caption><tr><td>A</td></tr></table>');
    expect(shape(doc)).toEqual(['paragraph:Prices', [['A']]]);
  });

  it('skips a table without cells', () => {
    expect(shape(htmlToDocument('<p>a</p><table></table>'))).toEqual(['paragraph:a']);
  });

  it('gives two tables their own ids', () => {
    const doc = htmlToDocument('<table><tr><td>A</td></tr></table><table><tr><td>B</td></tr></table>');
    expect(shape(doc)).toEqual([[['A']], [['B']]]);
  });

  it('drops images in cells but keeps their text', () => {
    const doc = htmlToDocument('<table><tr><td><img src="https://x.test/a.png">A</td></tr></table>');
    expect(shape(doc)).toEqual([[['A']]]);
  });
});

describe('tables to Markdown', () => {
  it('writes a GitHub table', () => {
    expect(documentToMarkdown(grid())).toBe('| A | B |\n| --- | --- |\n| **C** | x<y<br>z |');
  });

  it('writes an empty header row for a table without one, and pads short rows', () => {
    const doc = createDocument([para('p'), cell('r1', 'A'), cell('r1', 'B'), cell('r2', 'C'), para('q')]);
    expect(documentToMarkdown(doc)).toBe('p\n\n|  |  |\n| --- | --- |\n| A | B |\n| C |  |\n\nq');
  });

  it('escapes pipes in cells', () => {
    const doc = createDocument([cell('r1', 'a|b', true)]);
    expect(documentToMarkdown(doc)).toBe('| a\\|b |\n| --- |');
  });
});

describe('tables from Markdown', () => {
  it('reads a GitHub table, the first row as header', () => {
    const doc = markdownToDocument('before\n\n| A | **B** |\n|---|:-:|\n| C | D<br>E |\n\nafter');
    expect(shape(doc)).toEqual(['paragraph:before', [['#A', '#B'], ['C', 'D\nE']], 'paragraph:after']);
    expect(doc.blocks[2].content[0].marks).toEqual([{ type: 'bold' }]);
  });

  it('reads tables without the outer pipes', () => {
    expect(shape(markdownToDocument('A | B\n--- | ---\nC | D'))).toEqual([[['#A', '#B'], ['C', 'D']]]);
  });

  it('reads escaped pipes as text and pads or cuts rows to the header', () => {
    const doc = markdownToDocument('| a\\|b | c |\n| - | - |\n| 1 |\n| 1 | 2 | 3 |');
    expect(shape(doc)).toEqual([[['#a|b', '#c'], ['1', ''], ['1', '2']]]);
  });

  it('reads the Markdown it writes', () => {
    expect(shape(markdownToDocument(documentToMarkdown(grid())))).toEqual(shape(grid()));
  });

  it('leaves text with pipes but no delimiter row alone', () => {
    expect(shape(markdownToDocument('a | b\nc | d'))).toEqual(['paragraph:a | b\nc | d']);
  });

  it('reads a long delimiter row quickly', () => {
    const start = Date.now();
    markdownToDocument(`| a |\n|${' '.repeat(50000)}-${' '.repeat(50000)}x`);
    markdownToDocument(`a|${'|-'.repeat(30000)}`);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('review fixes: Markdown tables', () => {
  it('a table without a header row keeps none through Markdown', () => {
    const doc = createDocument([cell('r1', 'A'), cell('r1', 'B'), cell('r2', 'C'), cell('r2', 'D')]);
    const md = documentToMarkdown(doc);
    expect(md).toBe('|  |  |\n| --- | --- |\n| A | B |\n| C | D |');
    expect(shape(markdownToDocument(md))).toEqual([[['A', 'B'], ['C', 'D']]]);
  });

  it('reads a table that follows a line of text without a blank line', () => {
    const doc = markdownToDocument('Results:\n| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(shape(doc)).toEqual(['paragraph:Results:', [['#a', '#b'], ['1', '2']]]);
  });
});
