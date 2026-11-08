import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LevitEditor } from '../../src/core/editor';
import { getBlockText } from '../../src/core/model/document';
import type { BlockNode } from '../../src/core/model/types';

let container: HTMLDivElement;
let editor: LevitEditor;

function setup(blocks: Partial<BlockNode>[]) {
  editor = new LevitEditor({
    element: container,
    initialContent: { version: 1, blocks: blocks.map((b, i) => ({ id: `b${i}`, type: 'paragraph', content: [{ text: '' }], ...b })) },
  });
}

const p = (text: string, extra: Partial<BlockNode> = {}): Partial<BlockNode> => ({ content: [{ text }], ...extra });
const summary = () => editor.state.doc.blocks.map((b) => [b.type, getBlockText(b)]);
const texts = () => editor.state.doc.blocks.map((b) => getBlockText(b));

function select(blockId: string, from: number, to = from, toBlock = blockId) {
  editor.dispatch(editor.state.tr.setSelection({
    anchor: { blockId, offset: from },
    head: { blockId: toBlock, offset: to },
    isCollapsed: blockId === toBlock && from === to,
  }));
}

function beforeInput(inputType: string, init: Record<string, unknown> = {}) {
  const ev = new InputEvent('beforeinput', { inputType, cancelable: true, bubbles: true, ...init } as InputEventInit);
  container.dispatchEvent(ev);
  return ev;
}

function clipboard(data: Record<string, string>) {
  const dt = new DataTransfer();
  for (const [type, value] of Object.entries(data)) dt.setData(type, value);
  return dt;
}

function paste(data: Record<string, string>) {
  const ev = new ClipboardEvent('paste', { clipboardData: clipboard(data), cancelable: true, bubbles: true });
  container.dispatchEvent(ev);
  return ev;
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  editor?.destroy();
  container.remove();
});

describe('beforeinput: every edit goes through the model', () => {
  it.each([
    ['deleteContentForward', 'ac'],
    ['deleteWordBackward', 'bc'],
    ['deleteWordForward', 'a'],
    ['deleteSoftLineBackward', 'bc'],
    ['deleteHardLineBackward', 'bc'],
    ['deleteSoftLineForward', 'a'],
    ['deleteHardLineForward', 'a'],
  ])('%s', (inputType, expected) => {
    setup([p('abc')]);
    select('b0', 1);
    const ev = beforeInput(inputType);
    expect(ev.defaultPrevented).toBe(true);
    expect(texts()).toEqual([expected]);
  });

  it('insertLineBreak (Shift+Enter) adds a newline in the block', () => {
    setup([p('ab')]);
    select('b0', 1);
    expect(beforeInput('insertLineBreak').defaultPrevented).toBe(true);
    expect(texts()).toEqual(['a\nb']);
  });

  it('deleteContent and deleteByCut remove the selection', () => {
    for (const inputType of ['deleteContent', 'deleteByCut']) {
      setup([p('abcd')]);
      select('b0', 1, 3);
      expect(beforeInput(inputType).defaultPrevented).toBe(true);
      expect(texts()).toEqual(['ad']);
      editor.destroy();
    }
  });

  it('insertReplacementText (autocorrect) replaces the selected word', () => {
    setup([p('teh cat')]);
    select('b0', 0, 3);
    const dt = clipboard({ 'text/plain': 'the' });
    expect(beforeInput('insertReplacementText', { dataTransfer: dt }).defaultPrevented).toBe(true);
    expect(texts()).toEqual(['the cat']);
  });

  it('historyUndo and historyRedo use the editor history', () => {
    setup([p('')]);
    select('b0', 0);
    beforeInput('insertText', { data: 'x' });
    expect(texts()).toEqual(['x']);
    beforeInput('historyUndo');
    expect(texts()).toEqual(['']);
    beforeInput('historyRedo');
    expect(texts()).toEqual(['x']);
  });

  it.each([
    ['formatBold', 'bold'],
    ['formatItalic', 'italic'],
    ['formatUnderline', 'underline'],
    ['formatStrikeThrough', 'strike'],
  ])('%s toggles the %s mark', (inputType, mark) => {
    setup([p('word')]);
    select('b0', 0, 4);
    expect(beforeInput(inputType).defaultPrevented).toBe(true);
    expect(editor.state.doc.blocks[0].content[0].marks).toEqual([{ type: mark }]);
  });

  it('blocks input types the editor does not support', () => {
    setup([p('abc')]);
    select('b0', 1);
    for (const inputType of ['insertOrderedList', 'formatJustifyCenter', 'insertHorizontalRule', 'formatFontColor', 'deleteByDrag']) {
      expect(beforeInput(inputType).defaultPrevented).toBe(true);
    }
    expect(texts()).toEqual(['abc']);
  });

  it('leaves composition input to the IME', () => {
    setup([p('')]);
    container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    expect(beforeInput('insertCompositionText', { data: 'ㅎ' }).defaultPrevented).toBe(false);
    // happy-dom ignores `data` in the CompositionEvent constructor.
    const end = new CompositionEvent('compositionend', { bubbles: true });
    Object.defineProperty(end, 'data', { value: '한' });
    container.dispatchEvent(end);
    expect(texts()).toEqual(['한']);
  });
});

describe('keyboard', () => {
  const key = (k: string, init: KeyboardEventInit = {}) => {
    const ev = new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true, ...init });
    container.dispatchEvent(ev);
    return ev;
  };

  it('Delete removes the next character', () => {
    setup([p('abc')]);
    select('b0', 1);
    expect(key('Delete').defaultPrevented).toBe(true);
    expect(texts()).toEqual(['ac']);
  });

  it('Alt/Meta/Ctrl + Backspace are left to beforeinput (word and line deletion)', () => {
    setup([p('one two')]);
    select('b0', 7);
    for (const mod of [{ altKey: true }, { metaKey: true }, { ctrlKey: true }]) {
      expect(key('Backspace', mod).defaultPrevented).toBe(false);
    }
    expect(texts()).toEqual(['one two']);
  });
});

describe('paste', () => {
  it('plain text on one line is inserted at the caret', () => {
    setup([p('ab')]);
    select('b0', 1);
    expect(paste({ 'text/plain': 'XY' }).defaultPrevented).toBe(true);
    expect(texts()).toEqual(['aXYb']);
    expect(editor.state.selection.anchor.offset).toBe(3);
  });

  it('plain text with several lines becomes several paragraphs', () => {
    setup([p('[]')]);
    select('b0', 1);
    paste({ 'text/plain': 'one\r\ntwo\nthree' });
    expect(texts()).toEqual(['[one', 'two', 'three]']);
  });

  it('HTML is converted to blocks and marks', () => {
    setup([p('')]);
    select('b0', 0);
    paste({ 'text/html': '<h2>T</h2><p>a <b>b</b></p>', 'text/plain': 'T\na b' });
    expect(summary()).toEqual([['heading', 'T'], ['paragraph', 'a b']]);
    expect(editor.state.doc.blocks[1].content[1]).toEqual({ text: 'b', marks: [{ type: 'bold' }] });
  });

  it('HTML with unsafe links keeps the text but not the link', () => {
    setup([p('')]);
    select('b0', 0);
    paste({ 'text/html': '<p><a href="javascript:alert(1)">x</a></p>' });
    expect(JSON.stringify(editor.getJSON())).not.toContain('javascript');
    expect(texts()).toEqual(['x']);
  });

  it('multi-line Markdown text is converted', () => {
    setup([p('')]);
    select('b0', 0);
    paste({ 'text/plain': '# Title\n\n- a\n- **b**' });
    expect(summary()).toEqual([
      ['heading', 'Title'],
      ['bullet_list_item', 'a'],
      ['bullet_list_item', 'b'],
    ]);
  });

  it('a single line that looks like Markdown is pasted as it is', () => {
    setup([p('see ')]);
    select('b0', 4);
    paste({ 'text/plain': '- not a list' });
    expect(summary()).toEqual([['paragraph', 'see - not a list']]);
  });

  it('inside a code block, pastes plain text with newlines and no conversion', () => {
    setup([p('', { type: 'code_block' })]);
    select('b0', 0);
    paste({ 'text/html': '<h1>x</h1><p>y</p>', 'text/plain': '# x\n  y' });
    expect(summary()).toEqual([['code_block', '# x\n  y']]);
  });

  it('replaces the selection', () => {
    setup([p('hello world')]);
    select('b0', 6, 11);
    paste({ 'text/plain': 'there' });
    expect(texts()).toEqual(['hello there']);
  });

  it('is one undo step', () => {
    setup([p('')]);
    select('b0', 0);
    paste({ 'text/plain': 'a\nb' });
    editor.undo();
    expect(texts()).toEqual(['']);
  });
});

describe('copy and cut', () => {
  function copyEvent(type: 'copy' | 'cut') {
    const dt = new DataTransfer();
    const ev = new ClipboardEvent(type, { clipboardData: dt, cancelable: true, bubbles: true });
    container.dispatchEvent(ev);
    return { ev, dt };
  }

  it('copy writes the selection as HTML and plain text', () => {
    setup([
      p('', { type: 'bullet_list_item', content: [{ text: 'one' }] }),
      p('', { type: 'bullet_list_item', content: [{ text: 'two', marks: [{ type: 'bold' }] }] }),
    ]);
    select('b0', 1, 2, 'b1');
    const { ev, dt } = copyEvent('copy');
    expect(ev.defaultPrevented).toBe(true);
    expect(dt.getData('text/plain')).toBe('ne\ntw');
    expect(dt.getData('text/html')).toBe('<ul><li>ne</li><li><strong>tw</strong></li></ul>');
    expect(texts()).toEqual(['one', 'two']);
  });

  it('copy with a collapsed selection does nothing', () => {
    setup([p('abc')]);
    select('b0', 1);
    expect(copyEvent('copy').ev.defaultPrevented).toBe(false);
  });

  it('cut copies and then deletes', () => {
    setup([p('abcd')]);
    select('b0', 1, 3);
    const { ev, dt } = copyEvent('cut');
    expect(ev.defaultPrevented).toBe(true);
    expect(dt.getData('text/plain')).toBe('bc');
    expect(texts()).toEqual(['ad']);
  });

  it('copy then paste keeps list items and marks', () => {
    setup([
      p('', { type: 'ordered_list_item', content: [{ text: 'first' }] }),
      p('', { type: 'ordered_list_item', content: [{ text: 'second', marks: [{ type: 'italic' }] }] }),
      p(''),
    ]);
    select('b0', 0, 6, 'b1');
    const { dt } = copyEvent('copy');
    select('b2', 0);
    paste({ 'text/html': dt.getData('text/html'), 'text/plain': dt.getData('text/plain') });
    expect(summary().slice(2)).toEqual([
      ['ordered_list_item', 'first'],
      ['ordered_list_item', 'second'],
    ]);
    expect(editor.state.doc.blocks[3].content[0].marks).toEqual([{ type: 'italic' }]);
  });
});

describe('drag and drop', () => {
  function dragEvent(type: string, data?: Record<string, string>) {
    const ev = new Event(type, { cancelable: true, bubbles: true });
    Object.defineProperty(ev, 'dataTransfer', { value: data ? clipboard(data) : null });
    return ev;
  }

  it('dropping text from outside inserts it through the model', () => {
    setup([p('ab')]);
    select('b0', 1);
    const ev = dragEvent('drop', { 'text/plain': 'X' });
    container.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(texts()).toEqual(['aXb']);
  });

  it('dragging text inside the editor and dropping it is ignored', () => {
    setup([p('abc')]);
    select('b0', 0, 1);
    container.firstElementChild!.dispatchEvent(dragEvent('dragstart', {}));
    const drop = dragEvent('drop', { 'text/plain': 'a' });
    container.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(texts()).toEqual(['abc']);
  });

  it('dropping files is ignored', () => {
    setup([p('ab')]);
    const ev = dragEvent('drop', { Files: '' });
    container.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(texts()).toEqual(['ab']);
  });
});
