import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as Y from 'yjs';
import { LevitEditor, createBlock, createDocument, createTextNode, getBlockText, type BlockNode, type DocumentData } from '@yonailab/levit';
import { bindYjs, type YjsBinding } from '../src/index';

const made: { editor: LevitEditor; binding?: YjsBinding }[] = [];

function makeEditor(blocks?: BlockNode[]): LevitEditor {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const editor = new LevitEditor({ element: container, initialContent: blocks ? createDocument(blocks) : undefined });
  made.push({ editor });
  return editor;
}

function bind(editor: LevitEditor, ydoc: Y.Doc): YjsBinding {
  const binding = bindYjs(editor, ydoc.getArray('blocks'));
  made.find((m) => m.editor === editor)!.binding = binding;
  return binding;
}

/** Sends every update of one doc to the other, like a network that is always on. */
function connect(a: Y.Doc, b: Y.Doc): () => void {
  const toB = (update: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(b, update, 'net');
  const toA = (update: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(a, update, 'net');
  a.on('update', toB);
  b.on('update', toA);
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'net');
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b), 'net');
  return () => {
    a.off('update', toB);
    b.off('update', toA);
  };
}

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const caret = (blockId: string, offset: number) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });
const range = (a: string, ao: number, h: string, ho: number) => ({ anchor: { blockId: a, offset: ao }, head: { blockId: h, offset: ho }, isCollapsed: false });
const texts = (editor: LevitEditor) => editor.state.doc.blocks.map((b) => getBlockText(b));
const json = (editor: LevitEditor): DocumentData => editor.getJSON();

/** Two editors on two connected docs; the first one's content is shared. */
function pair(blocks: BlockNode[] = [para('a', 'Hello world'), para('b', 'Second line')]) {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const a = makeEditor(blocks);
  bind(a, docA);
  const disconnect = connect(docA, docB);
  const b = makeEditor();
  bind(b, docB);
  return { a, b, docA, docB, disconnect };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  for (const { editor, binding } of made.splice(0)) {
    binding?.destroy();
    editor.destroy();
  }
});

describe('bindYjs', () => {
  it('shares the first editor’s document with an editor that joins later', () => {
    const { a, b } = pair();
    expect(json(b)).toEqual(json(a));
    expect(texts(b)).toEqual(['Hello world', 'Second line']);
  });

  it('sends typing, with formatting, to the other editor', () => {
    const { a, b } = pair();
    a.dispatch(a.state.tr.setSelection(caret('a', 5)).insertText(','));
    a.dispatch(a.state.tr.setSelection(range('a', 7, 'a', 12)).toggleMark({ type: 'bold' }));
    expect(texts(b)).toEqual(['Hello, world', 'Second line']);
    expect(b.state.doc.blocks[0].content).toEqual([
      { text: 'Hello, ', marks: [] },
      { text: 'world', marks: [{ type: 'bold' }] },
    ]);
    expect(json(b)).toEqual(json(a));
  });

  it('sends links with their attributes, and removing a mark', () => {
    const { a, b } = pair();
    a.dispatch(a.state.tr.setSelection(range('a', 0, 'a', 5)).setLink('https://x.test'));
    expect(b.state.doc.blocks[0].content[0]).toEqual({ text: 'Hello', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] });
    a.dispatch(a.state.tr.setSelection(range('a', 0, 'a', 5)).setLink(null));
    expect(b.state.doc.blocks[0].content).toEqual([{ text: 'Hello world', marks: [] }]);
  });

  it('sends block changes: split, merge, type, attributes, deletion across blocks', () => {
    const { a, b } = pair();
    a.dispatch(a.state.tr.setSelection(caret('a', 5)).splitBlock());
    expect(json(b)).toEqual(json(a));
    a.dispatch(a.state.tr.setSelection(caret('b', 0)).setBlockType('heading', { level: 2 }));
    expect(b.state.doc.blocks.map((x) => x.type)).toEqual(['paragraph', 'paragraph', 'heading']);
    expect(json(b)).toEqual(json(a));
    const second = a.state.doc.blocks[1].id;
    a.dispatch(a.state.tr.setSelection(caret(second, 0)).deleteBackward());
    expect(json(b)).toEqual(json(a));
    a.dispatch(a.state.tr.setSelection(range('a', 3, 'b', 3)).deleteRange());
    expect(texts(b)).toEqual(['Helond line']);
    expect(json(b)).toEqual(json(a));
  });

  it('sends images and dividers, and setJSON', () => {
    const { a, b } = pair();
    a.dispatch(a.state.tr.setSelection(caret('b', 11)).insertImage({ src: 'https://x.test/a.png', alt: 'A' }));
    expect(json(b)).toEqual(json(a));
    a.setJSON({ version: 1, blocks: [{ id: 'n', type: 'heading', attrs: { level: 1 }, content: [{ text: 'New' }] }] });
    expect(json(b)).toEqual(json(a));
  });

  it('merges edits made at the same time in the same block', () => {
    const { a, b, docA, docB, disconnect } = pair();
    disconnect();
    a.dispatch(a.state.tr.setSelection(caret('a', 0)).insertText('A: '));
    b.dispatch(b.state.tr.setSelection(caret('a', 11)).insertText(' (B)'));
    connect(docA, docB);
    expect(texts(a)).toEqual(['A: Hello world (B)', 'Second line']);
    expect(json(b)).toEqual(json(a));
  });

  it('keeps the caret on the same character when someone types before it', () => {
    const { a, b } = pair();
    b.dispatch(b.state.tr.setSelection(caret('a', 6)));
    a.dispatch(a.state.tr.setSelection(caret('a', 0)).insertText('>> '));
    expect(b.state.selection.anchor).toEqual({ blockId: 'a', offset: 9 });
    expect(getBlockText(b.state.doc.blocks[0]).slice(b.state.selection.anchor.offset)).toBe('world');
  });

  it('keeps others’ changes out of undo: undo takes back only my own change', () => {
    const { a, b } = pair();
    a.dispatch(a.state.tr.setSelection(caret('a', 11)).insertText('!'));
    b.dispatch(b.state.tr.setSelection(caret('b', 11)).insertText('?'));
    expect(texts(a)).toEqual(['Hello world!', 'Second line?']);
    a.undo();
    expect(texts(a)).toEqual(['Hello world', 'Second line?']);
    expect(texts(b)).toEqual(['Hello world', 'Second line?']);
    a.redo();
    expect(texts(b)).toEqual(['Hello world!', 'Second line?']);
    // Nothing of B's can be undone in A.
    a.undo();
    expect(a.undo()).toBe(false);
    expect(texts(a)).toEqual(['Hello world', 'Second line?']);
  });

  it('waits with others’ changes until IME composition ends', () => {
    const { a, b } = pair();
    b.container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    a.dispatch(a.state.tr.setSelection(caret('b', 0)).insertText('x'));
    expect(texts(b)).toEqual(['Hello world', 'Second line']);
    b.container.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '' }));
    expect(texts(b)).toEqual(['Hello world', 'xSecond line']);
  });

  it('puts text composed meanwhile in the right place when someone typed before it', () => {
    const { a, b } = pair();
    b.dispatch(b.state.tr.setSelection(caret('a', 5)));
    b.container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    a.dispatch(a.state.tr.setSelection(caret('a', 0)).insertText('>> '));
    // happy-dom ignores `data` in the CompositionEvent constructor.
    const end = new CompositionEvent('compositionend', { bubbles: true });
    Object.defineProperty(end, 'data', { value: '한' });
    b.container.dispatchEvent(end);
    expect(texts(b)).toEqual(['>> Hello한 world', 'Second line']);
    expect(json(a)).toEqual(json(b));
    expect(b.state.selection.anchor).toEqual({ blockId: 'a', offset: 9 });
  });

  it('stops after destroy, and gives undo back to the editor', () => {
    const { a, b } = pair();
    made[0].binding!.destroy();
    a.dispatch(a.state.tr.setSelection(caret('a', 0)).insertText('x'));
    expect(texts(b)).toEqual(['Hello world', 'Second line']);
    a.undo();
    expect(texts(a)).toEqual(['Hello world', 'Second line']);
  });

  it('two editors that edit at random end up with the same document', () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const { a, b, docA, docB, disconnect } = pair([para('a', 'alpha beta'), para('b', 'gamma'), para('c', 'delta epsilon')]);
    disconnect();
    const edit = (editor: LevitEditor) => {
      const blocks = editor.state.doc.blocks;
      const block = blocks[random(blocks.length)];
      const length = getBlockText(block).length;
      const at = random(length + 1);
      let tr = editor.state.tr.setSelection(caret(block.id, at));
      switch (random(6)) {
        case 0: tr = tr.insertText(['x', 'yz ', 'Q'][random(3)]); break;
        case 1: tr = tr.deleteBackward(); break;
        case 2: tr = tr.splitBlock(); break;
        case 3: tr = tr.setSelection(range(block.id, 0, block.id, Math.max(at, 1))).toggleMark({ type: random(2) ? 'bold' : 'italic' }); break;
        case 4: tr = tr.setBlockType(random(2) ? 'heading' : 'paragraph', random(2) ? { level: 2 } : {}); break;
        default: tr = tr.deleteForward();
      }
      editor.dispatch(tr);
    };
    for (let round = 0; round < 15; round++) {
      for (let i = 0; i < 6; i++) {
        edit(a);
        edit(b);
      }
      const reconnect = connect(docA, docB);
      expect(json(b)).toEqual(json(a));
      reconnect();
    }
  });
});

describe('comments with Yjs', () => {
  it('are shared, overlapping ones too', async () => {
    const { commentsPlugin } = await import('@yonailab/levit');
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const make = () => {
      const el = document.createElement('div');
      document.body.appendChild(el);
      return el;
    };
    let n = 0;
    const a = new LevitEditor({ element: make(), plugins: [commentsPlugin({ createId: () => `c${++n}` })], initialContent: createDocument([para('p', 'The quick brown fox')]) });
    made.push({ editor: a, binding: bindYjs(a, docA.getArray('blocks')) });
    connect(docA, docB);
    const b = new LevitEditor({ element: make(), plugins: [commentsPlugin()] });
    made.push({ editor: b, binding: bindYjs(b, docB.getArray('blocks')) });
    a.dispatch(a.state.tr.setSelection(range('p', 4, 'p', 15)));
    a.commands.addComment();
    a.dispatch(a.state.tr.setSelection(range('p', 10, 'p', 19)));
    a.commands.addComment();
    expect(json(b)).toEqual(json(a));
    expect(b.container.querySelectorAll('.levit-comment')).toHaveLength(3);
  });
});

describe('review fixes: binding', () => {
  it('updates blocks between two separate block changes in place, keeping others’ edits to them', () => {
    const blocks = ['A', 'B', 'C', 'D', 'E'].map((id) => para(id, `text ${id}`));
    const { a, docA } = pair(blocks);
    const yblocks = docA.getArray('blocks') as Y.Array<Y.Map<unknown>>;
    const before = yblocks.toArray();
    const [A, , C, D, E] = a.state.doc.blocks;
    const C2 = { ...C, content: [{ text: 'text C changed', marks: [] }] };
    a.dispatch(a.state.tr.setBlocks([A, C2, D, para('X', 'new'), E]));
    const after = yblocks.toArray();
    expect(after.map((m) => m.get('id'))).toEqual(['A', 'C', 'D', 'X', 'E']);
    expect(after[1]).toBe(before[2]);
    expect(after[2]).toBe(before[3]);
  });

  it('sends changes that a listener makes while a remote change is applied', () => {
    const { a, b } = pair();
    let done = false;
    b.on('update', () => {
      if (done || !texts(b)[1].includes('ping')) return;
      done = true;
      b.dispatch(b.state.tr.setSelection(caret('b', getBlockText(b.state.doc.blocks[1]).length)).insertText(' pong'));
    });
    a.dispatch(a.state.tr.setSelection(caret('b', 11)).insertText(' ping'));
    expect(texts(b)[1]).toBe('Second line ping pong');
    expect(texts(a)[1]).toBe('Second line ping pong');
    expect(json(a)).toEqual(json(b));
  });

  it('puts a block added while changes wait after the closest block that still exists', () => {
    const { a, b } = pair([para('a', 'one'), para('b', 'two'), para('c', 'three')]);
    b.dispatch(b.state.tr.setSelection(caret('b', 3)));
    b.container.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    a.dispatch(a.state.tr.setSelection({ anchor: { blockId: 'a', offset: 3 }, head: { blockId: 'b', offset: 3 }, isCollapsed: false }).deleteRange());
    b.dispatch(b.state.tr.setSelection(caret('b', 3)).splitBlock());
    expect(texts(a)).toEqual(['one', '', 'three']);
    expect(a.state.doc.blocks[0].id).toBe('a');
  });

  it('stops when the editor is destroyed', () => {
    const { a, b } = pair();
    const before = b.state;
    b.destroy();
    a.dispatch(a.state.tr.setSelection(caret('a', 0)).insertText('x'));
    expect(b.state).toBe(before);
  });

  it('after destroy, undo does not bring back what was there before binding', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const a = makeEditor([para('a', 'shared')]);
    bind(a, docA);
    connect(docA, docB);
    const b = makeEditor([para('x', 'mine')]);
    b.dispatch(b.state.tr.setSelection(caret('x', 4)).insertText(' before'));
    const binding = bind(b, docB);
    expect(texts(b)).toEqual(['shared']);
    binding.destroy();
    expect(b.undo()).toBe(false);
    expect(texts(b)).toEqual(['shared']);
  });

  it('does not redraw the block I am typing in when others change another block', () => {
    const { a, b } = pair();
    a.dispatch(a.state.tr.setSelection(caret('a', 11)).insertText('!'));
    const typed = a.state.doc.blocks[0];
    b.dispatch(b.state.tr.setSelection(caret('b', 0)).insertText('x'));
    expect(texts(a)[1]).toBe('xSecond line');
    expect(a.state.doc.blocks[0]).toBe(typed);
  });

  it('keeps comments that two people add at the same time on overlapping text', async () => {
    const { commentsPlugin, getComments } = await import('@yonailab/levit');
    const docA = new Y.Doc();
    const docB = new Y.Doc();
    const el = () => document.body.appendChild(document.createElement('div'));
    const a = new LevitEditor({ element: el(), plugins: [commentsPlugin({ createId: () => 'c1' })], initialContent: createDocument([para('p', 'hello world')]) });
    made.push({ editor: a, binding: bindYjs(a, docA.getArray('blocks')) });
    const disconnect = connect(docA, docB);
    const b = new LevitEditor({ element: el(), plugins: [commentsPlugin({ createId: () => 'c2' })] });
    made.push({ editor: b, binding: bindYjs(b, docB.getArray('blocks')) });
    disconnect();
    a.dispatch(a.state.tr.setSelection(range('p', 0, 'p', 11)));
    a.commands.addComment();
    b.dispatch(b.state.tr.setSelection(range('p', 6, 'p', 11)));
    b.commands.addComment();
    connect(docA, docB);
    expect(getComments(a).map((c) => [c.id, c.text])).toEqual([['c1', 'hello world'], ['c2', 'world']]);
    expect(json(b)).toEqual(json(a));
  });
});

describe('tables with Yjs', () => {
  const cell = (id: string, row: string, text = '') => createBlock('table_cell', { table: 't', row }, [createTextNode(text)], id);
  /** Each row of the table as cell texts, cells grouped by their row. */
  const rows = (editor: LevitEditor) => {
    const out = new Map<string, string[]>();
    for (const b of editor.state.doc.blocks) {
      if (b.type !== 'table_cell') continue;
      if (!out.has(b.attrs!.row)) out.set(b.attrs!.row, []);
      out.get(b.attrs!.row)!.push(getBlockText(b));
    }
    return Array.from(out.values());
  };

  it('sends a table and typing in its cells', () => {
    const { a, b } = pair([cell('c1', 'r1', 'A'), cell('c2', 'r1', 'B'), para('p', '')]);
    a.dispatch(a.state.tr.setSelection(caret('c2', 1)).insertText('!'));
    expect(rows(b)).toEqual([['A', 'B!']]);
    expect(b.container.querySelectorAll('td')).toHaveLength(2);
  });

  it('keeps rows that two people add at the same time', () => {
    const { a, b, docA, docB, disconnect } = pair([cell('c1', 'r1', 'A'), cell('c2', 'r1', 'B'), para('p', '')]);
    disconnect();
    a.dispatch(a.state.tr.setSelection(caret('c1', 0)).addRow('after').insertText('from a'));
    b.dispatch(b.state.tr.setSelection(caret('c1', 0)).addRow('after').insertText('from b'));
    connect(docA, docB);
    expect(rows(a)).toHaveLength(3);
    expect(rows(a).flat()).toEqual(expect.arrayContaining(['from a', 'from b']));
    expect(json(b)).toEqual(json(a));
  });

  it('a row and a column added at the same time leave a table both can keep editing', () => {
    const { a, b, docA, docB, disconnect } = pair([cell('c1', 'r1', 'A'), cell('c2', 'r2', 'B'), para('p', '')]);
    disconnect();
    a.dispatch(a.state.tr.setSelection(caret('c1', 0)).addColumn('after'));
    b.dispatch(b.state.tr.setSelection(caret('c2', 0)).addRow('after'));
    connect(docA, docB);
    expect(json(b)).toEqual(json(a));
    // The row added by b is one cell short; adding a column still works on every row.
    expect(rows(a).map((r) => r.length)).toEqual([2, 2, 1]);
    a.dispatch(a.state.tr.setSelection(caret('c1', 0)).addColumn('after'));
    expect(rows(b).map((r) => r.length)).toEqual([3, 3, 2]);
  });
});
