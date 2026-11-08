import { describe, it, expect } from 'vitest';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import { documentToHTML, htmlToDocument } from '../../src/serializers/html';
import { documentToMarkdown, markdownToDocument } from '../../src/serializers/markdown';
import type { DocumentData } from '../../src/core/model/types';

const summary = (doc: DocumentData) => doc.blocks.map((b) => [b.type, getBlockText(b)]);
const marksOf = (doc: DocumentData, i = 0) =>
  doc.blocks[i].content.map((c) => [c.text, (c.marks ?? []).map((m) => m.type).sort()]);

describe('line breaks inside a block', () => {
  const doc = () => createDocument([createBlock('paragraph', {}, [createTextNode('one\ntwo')])]);

  it('HTML export writes <br>', () => {
    expect(documentToHTML(doc())).toBe('<p>one<br>two</p>');
  });

  it('HTML export keeps a trailing line break visible', () => {
    const d = createDocument([createBlock('paragraph', {}, [createTextNode('end\n')])]);
    expect(documentToHTML(d)).toBe('<p>end<br><br></p>');
    expect(summary(htmlToDocument(documentToHTML(d)))).toEqual([['paragraph', 'end\n']]);
  });

  it('code blocks keep raw newlines in HTML', () => {
    const d = createDocument([createBlock('code_block', {}, [createTextNode('a\nb')])]);
    expect(documentToHTML(d)).toBe('<pre><code>a\nb</code></pre>');
  });

  it('HTML import turns <br> into a line break', () => {
    expect(summary(htmlToDocument('<p>one<br>two</p>'))).toEqual([['paragraph', 'one\ntwo']]);
  });

  it('Markdown export writes a hard break and import reads it back', () => {
    const md = documentToMarkdown(doc());
    expect(md).toBe('one\\\ntwo');
    expect(summary(markdownToDocument(md))).toEqual([['paragraph', 'one\ntwo']]);
  });

  it('Markdown import also reads two-space hard breaks', () => {
    expect(summary(markdownToDocument('one  \ntwo'))).toEqual([['paragraph', 'one\ntwo']]);
  });

  it('Markdown round-trips line breaks in quotes and list items', () => {
    const d = createDocument([
      createBlock('blockquote', {}, [createTextNode('q1\nq2')]),
      createBlock('bullet_list_item', {}, [createTextNode('i1\ni2')]),
      createBlock('bullet_list_item', {}, [createTextNode('j')]),
    ]);
    expect(summary(markdownToDocument(documentToMarkdown(d)))).toEqual(summary(d));
  });
});

describe('HTML import of pasted content', () => {
  it('collapses source formatting whitespace', () => {
    const html = `
      <p>
        Hello   <b>big</b>
        world
      </p>
    `;
    expect(summary(htmlToDocument(html))).toEqual([['paragraph', 'Hello big world']]);
  });

  it('collapses spaces correctly after emoji', () => {
    expect(summary(htmlToDocument('<p>😀  a <b> b</b></p>'))).toEqual([['paragraph', '😀 a b']]);
  });

  it('turns non-breaking spaces into normal spaces', () => {
    expect(summary(htmlToDocument('<p>a&nbsp;&nbsp;b</p>'))).toEqual([['paragraph', 'a  b']]);
  });

  it('ignores Chrome clipboard markers, meta and style', () => {
    const html =
      '<meta charset="utf-8"><style>p{color:red}</style><!--StartFragment--><p>text</p><!--EndFragment-->';
    expect(summary(htmlToDocument(html))).toEqual([['paragraph', 'text']]);
  });

  it('never imports script contents', () => {
    const doc = htmlToDocument('<p>a</p><script>alert(1)</script><p>b<script>x()</script></p>');
    expect(summary(doc)).toEqual([['paragraph', 'a'], ['paragraph', 'b']]);
  });

  it('reads blocks nested in div wrappers', () => {
    const html = '<div><div><h2>T</h2><p>one</p></div><p>two</p></div>';
    expect(summary(htmlToDocument(html))).toEqual([
      ['heading', 'T'],
      ['paragraph', 'one'],
      ['paragraph', 'two'],
    ]);
  });

  it('treats plain div lines as paragraphs', () => {
    expect(summary(htmlToDocument('<div>line 1</div><div>line 2</div>'))).toEqual([
      ['paragraph', 'line 1'],
      ['paragraph', 'line 2'],
    ]);
  });

  it('wraps loose top-level text and inline elements into one paragraph', () => {
    const doc = htmlToDocument('plain <b>bold</b> text<p>next</p>');
    expect(summary(doc)).toEqual([['paragraph', 'plain bold text'], ['paragraph', 'next']]);
    expect(marksOf(doc)).toEqual([['plain ', []], ['bold', ['bold']], [' text', []]]);
  });

  it('handles the Google Docs <b> wrapper without making everything bold', () => {
    const html =
      '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1">' +
      '<p dir="ltr"><span style="font-weight:400;">normal </span><span style="font-weight:700;">strong</span></p>' +
      '<p dir="ltr"><span style="font-style:italic;">slanted</span></p></b>';
    const doc = htmlToDocument(html);
    expect(summary(doc)).toEqual([['paragraph', 'normal strong'], ['paragraph', 'slanted']]);
    expect(marksOf(doc, 0)).toEqual([['normal ', []], ['strong', ['bold']]]);
    expect(marksOf(doc, 1)).toEqual([['slanted', ['italic']]]);
  });

  it('reads underline and strike from inline styles', () => {
    const doc = htmlToDocument(
      '<p><span style="text-decoration: underline">u</span><span style="text-decoration-line: line-through">s</span></p>'
    );
    expect(marksOf(doc)).toEqual([['u', ['underline']], ['s', ['strike']]]);
  });

  it('flattens nested lists and paragraphs inside list items', () => {
    const html = '<ul><li><p>a</p></li><li>b<ul><li>b1</li></ul></li></ul><ol><li>c</li></ol>';
    expect(summary(htmlToDocument(html))).toEqual([
      ['bullet_list_item', 'a'],
      ['bullet_list_item', 'b'],
      ['bullet_list_item', 'b1'],
      ['ordered_list_item', 'c'],
    ]);
  });

  it('keeps paragraphs inside a blockquote as quotes', () => {
    expect(summary(htmlToDocument('<blockquote><p>q1</p><p>q2</p></blockquote>'))).toEqual([
      ['blockquote', 'q1'],
      ['blockquote', 'q2'],
    ]);
  });

  it('keeps code whitespace exactly', () => {
    const doc = htmlToDocument('<pre><code>if (a) {\n  b();\n}\n</code></pre>');
    expect(summary(doc)).toEqual([['code_block', 'if (a) {\n  b();\n}']]);
  });

  it('drops a trailing <br> that browsers add to blocks', () => {
    expect(summary(htmlToDocument('<p>text<br></p>'))).toEqual([['paragraph', 'text']]);
  });

  it('keeps explicitly empty paragraphs but not whitespace between blocks', () => {
    expect(summary(htmlToDocument('<p>a</p>\n  \n<p><br></p>\n<p>b</p>'))).toEqual([
      ['paragraph', 'a'],
      ['paragraph', ''],
      ['paragraph', 'b'],
    ]);
  });

  it('turns table cells into paragraphs instead of losing them', () => {
    const doc = htmlToDocument('<table><tr><td>x</td><td>y</td></tr></table>');
    expect(summary(doc)).toEqual([['paragraph', 'x'], ['paragraph', 'y']]);
  });
});
