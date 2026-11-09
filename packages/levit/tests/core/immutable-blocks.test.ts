import { describe, it, expect } from 'vitest';
import { EditorState } from '../../src/core/state/state';
import { createBlock, createDocument, createTextNode, getBlockText } from '../../src/core/model/document';
import type { BlockNode } from '../../src/core/model/types';

const para = (id: string, text: string) => createBlock('paragraph', {}, [createTextNode(text)], id);
const caret = (blockId: string, offset: number) => ({ anchor: { blockId, offset }, head: { blockId, offset }, isCollapsed: true });

function stateWith(blocks: BlockNode[], blockId = blocks[0].id, offset = 0) {
  return EditorState.create({ doc: createDocument(blocks) }).tr.setSelection(caret(blockId, offset)).apply();
}

describe('blocks a transaction does not change', () => {
  it('stay the same objects, so they need no copying, diffing or redrawing', () => {
    const before = stateWith([para('a', 'one'), para('b', 'two'), para('c', 'three')], 'b', 3);
    const after = before.tr.insertText('!').apply();
    expect(after.doc.blocks[0]).toBe(before.doc.blocks[0]);
    expect(after.doc.blocks[2]).toBe(before.doc.blocks[2]);
    expect(after.doc.blocks[1]).not.toBe(before.doc.blocks[1]);
    expect(getBlockText(before.doc.blocks[1])).toBe('two');
    expect(getBlockText(after.doc.blocks[1])).toBe('two!');
  });

  it('are kept by every kind of edit', () => {
    const blocks = () => [
      para('a', 'keep'),
      createBlock('bullet_list_item', {}, [createTextNode('item one')], 'l1'),
      createBlock('bullet_list_item', {}, [createTextNode('item two')], 'l2'),
      para('z', 'keep too'),
    ];
    const edits: [string, (s: EditorState) => EditorState][] = [
      ['split', (s) => s.tr.setSelection(caret('l1', 4)).splitBlock().apply()],
      ['delete backward', (s) => s.tr.setSelection(caret('l2', 0)).deleteBackward().apply()],
      ['delete forward', (s) => s.tr.setSelection(caret('l1', 8)).deleteForward().apply()],
      ['indent', (s) => s.tr.setSelection(caret('l2', 0)).indentListItem().apply()],
      ['block type', (s) => s.tr.setSelection(caret('l1', 0)).setBlockType('heading', { level: 2 }).apply()],
      ['mark', (s) => s.tr.setSelection({ anchor: { blockId: 'l1', offset: 0 }, head: { blockId: 'l2', offset: 4 }, isCollapsed: false }).toggleMark({ type: 'bold' }).apply()],
      ['link', (s) => s.tr.setSelection({ anchor: { blockId: 'l1', offset: 0 }, head: { blockId: 'l1', offset: 4 }, isCollapsed: false }).setLink('https://x.test').apply()],
      ['divider', (s) => s.tr.setSelection(caret('l1', 4)).insertHorizontalRule().apply()],
      ['paste', (s) => s.tr.setSelection(caret('l1', 4)).insertFragment([para('p1', 'x'), para('p2', 'y')]).apply()],
    ];
    for (const [name, edit] of edits) {
      const before = stateWith(blocks());
      const after = edit(before);
      expect(after.doc.blocks[0], name).toBe(before.doc.blocks[0]);
      expect(after.doc.blocks[after.doc.blocks.length - 1], name).toBe(before.doc.blocks[3]);
    }
  });
});

describe('a committed document', () => {
  it('is frozen, so a missed copy fails loudly instead of changing history', () => {
    const state = stateWith([createBlock('paragraph', {}, [{ text: 'hi', marks: [{ type: 'bold' }] }], 'a')]);
    const block = state.doc.blocks[0];
    expect(Object.isFrozen(state.doc.blocks)).toBe(true);
    expect(Object.isFrozen(block)).toBe(true);
    expect(Object.isFrozen(block.attrs)).toBe(true);
    expect(Object.isFrozen(block.content)).toBe(true);
    expect(Object.isFrozen(block.content[0])).toBe(true);
    expect(Object.isFrozen(block.content[0].marks![0])).toBe(true);
    expect(() => {
      (block as BlockNode).type = 'heading';
    }).toThrow(TypeError);
  });

  it('is not copied into undo history: undo gives back the same block objects', () => {
    const before = stateWith([para('a', 'one'), para('b', 'two')], 'b', 3);
    const typed = before.tr.insertText('!').apply();
    const undone = typed.undo();
    expect(undone.doc.blocks[0]).toBe(before.doc.blocks[0]);
    expect(undone.doc.blocks[1]).toBe(before.doc.blocks[1]);
    expect(undone.redo().doc.blocks[1]).toBe(typed.doc.blocks[1]);
  });
});

describe('tr.editBlock', () => {
  it('gives a copy of a block that the transaction may change (for plugins)', () => {
    const before = stateWith([para('a', 'one'), para('b', 'two')]);
    const tr = before.tr;
    const block = tr.editBlock('b')!;
    block.attrs = { ...block.attrs, color: 'red' };
    block.content = [{ text: 'TWO', marks: [] }];
    expect(tr.editBlock('b')).toBe(block);
    const after = tr.apply();
    expect(after.doc.blocks[1]).toMatchObject({ id: 'b', attrs: { color: 'red' } });
    expect(getBlockText(after.doc.blocks[1])).toBe('TWO');
    expect(getBlockText(before.doc.blocks[1])).toBe('two');
    expect(after.doc.blocks[0]).toBe(before.doc.blocks[0]);
    expect(tr.editBlock('missing')).toBeUndefined();
  });
});

describe('getJSON', () => {
  it('returns a copy the app may change, with no frozen parts', async () => {
    const { documentToJSON } = await import('../../src/serializers/json');
    const state = stateWith([createBlock('paragraph', { x: 1 }, [{ text: 'a', marks: [{ type: 'link', attrs: { href: 'https://x.test' } }] }], 'a')]);
    const json = documentToJSON(state.doc);
    const mark = json.blocks[0].content[0].marks![0];
    expect(Object.isFrozen(mark) || Object.isFrozen(mark.attrs) || Object.isFrozen(json.blocks[0].attrs)).toBe(false);
  });
});
