import * as Y from 'yjs';
import { createRemoteCursors } from '@yonailab/levit';
import type { BlockNode, EditorPosition, EditorSelection, InlineMark, InlineNode, LevitEditor, RemoteCursor } from '@yonailab/levit';

/**
 * How a Levit document is kept in Yjs: a Y.Array of blocks, each a Y.Map with
 * `id`, `type`, `attrs` (a plain object) and `text` (a Y.Text). Marks are
 * Y.Text formatting: `{ bold: true }`, `{ link: { href } }`.
 */
export type YBlocks = Y.Array<Y.Map<unknown>>;

/**
 * The part of y-protocols' Awareness the binding uses. Providers like
 * y-websocket create one: `provider.awareness`.
 */
export interface AwarenessLike {
  clientID: number;
  getStates(): Map<number, Record<string, any>>;
  setLocalStateField(field: string, value: unknown): void;
  on(event: 'change', handler: () => void): void;
  off(event: 'change', handler: () => void): void;
}

export interface YjsBindingOptions {
  /**
   * Undo groups changes made within this many milliseconds. Default 500.
   */
  captureTimeout?: number;
  /** Shares this user's caret and shows the others' (see `user`). */
  awareness?: AwarenessLike;
  /** How this user is shown to the others. */
  user?: { name: string; color: string };
}

export interface YjsBinding {
  /** The undo manager: it undoes only this editor's changes. */
  readonly undoManager: Y.UndoManager;
  /** The Yjs position of an editor position, for cursors of other users. */
  relativePosition(position: EditorPosition): Y.RelativePosition | null;
  /** The editor position of a Yjs position, or null when its block is gone. */
  editorPosition(position: Y.RelativePosition): EditorPosition | null;
  /** The other users' cursors, as they are shown (with `awareness`). */
  remoteCursors(): RemoteCursor[];
  /** Stops syncing and gives undo back to the editor. */
  destroy(): void;
}

type RelativeSelection = { anchor: Y.RelativePosition; head: Y.RelativePosition } | null;

/**
 * Keeps the editor and a shared Y.Array in sync, so several people can edit
 * one document. Bind after the provider has loaded the shared document: when
 * the array is empty, the editor's document is put into it; otherwise the
 * editor shows what is in it. Undo and redo then take back only this
 * editor's changes.
 *
 * ```ts
 * const ydoc = new Y.Doc();
 * const provider = new WebsocketProvider(url, room, ydoc);
 * provider.once('sync', () => bindYjs(editor, ydoc.getArray('blocks')));
 * ```
 */
export function bindYjs(editor: LevitEditor, yblocks: YBlocks, options: YjsBindingOptions = {}): YjsBinding {
  const ydoc = yblocks.doc;
  if (!ydoc) throw new Error('bindYjs: the Y.Array must belong to a Y.Doc');
  // Changes this binding makes to Yjs carry this origin; the undo manager
  // tracks only them.
  const origin = { levit: true };

  let synced: readonly BlockNode[] = [];
  // Blocks made from each Y.Map, until it changes.
  const fromY = new WeakMap<Y.Map<unknown>, BlockNode>();
  let applying = false;
  let pending = false;
  // While others' changes wait (IME composition), Yjs is ahead of the
  // editor: the selection when they started waiting, to place local edits.
  let waitingFrom: { selection: EditorSelection; relative: RelativeSelection } | null = null;
  let selectionBefore: RelativeSelection = null;
  let destroyed = false;

  const idIndex = new Map<string, Y.Map<unknown>>();
  let idIndexStale = true;
  const yblockById = (id: string): Y.Map<unknown> | undefined => {
    if (idIndexStale) {
      idIndex.clear();
      yblocks.forEach((ymap) => idIndex.set(ymap.get('id') as string, ymap));
      idIndexStale = false;
    }
    return idIndex.get(id);
  };

  const relativePosition = (position: EditorPosition): Y.RelativePosition | null => {
    const ytext = yblockById(position.blockId)?.get('text') as Y.Text | undefined;
    return ytext ? Y.createRelativePositionFromTypeIndex(ytext, position.offset) : null;
  };

  const editorPosition = (position: Y.RelativePosition): EditorPosition | null => {
    const absolute = Y.createAbsolutePositionFromRelativePosition(position, ydoc);
    if (!absolute || !(absolute.type instanceof Y.Text)) return null;
    const ymap = absolute.type.parent;
    if (!(ymap instanceof Y.Map) || ymap.parent !== yblocks) return null;
    return { blockId: ymap.get('id') as string, offset: absolute.index };
  };

  const relativeSelection = (selection: EditorSelection): RelativeSelection => {
    const anchor = relativePosition(selection.anchor);
    const head = relativePosition(selection.head);
    return anchor && head ? { anchor, head } : null;
  };

  // --- Editor -> Yjs ---------------------------------------------------------

  const writeLocal = () => {
    if (applying || destroyed) return;
    const blocks = editor.state.doc.blocks;
    if (blocks === synced) return;
    const previous = synced;
    synced = blocks;
    const mapIndex = waitingFrom ? indexMapper(waitingFrom) : undefined;
    ydoc.transact(() => writeBlocks(yblocks, previous, blocks, mapIndex && { mapIndex, byId: yblockById }), origin);
  };

  /**
   * Maps an offset in the editor's (older) text of a block to the shared
   * text: offsets from the caret on move by what others added before it.
   */
  const indexMapper = ({ selection, relative }: { selection: EditorSelection; relative: RelativeSelection }) => {
    const caret = selection.anchor;
    const now = relative && editorPosition(relative.anchor);
    const shift = now && now.blockId === caret.blockId ? now.offset - caret.offset : 0;
    return (blockId: string, index: number) => (blockId === caret.blockId && index >= caret.offset ? index + shift : index);
  };

  // --- Yjs -> Editor ---------------------------------------------------------

  const readRemote = () => {
    if (destroyed) return;
    if (editor.isComposing) {
      // Redrawing the block being composed would break the IME.
      if (!pending) waitingFrom = { selection: editor.state.selection, relative: selectionBefore };
      pending = true;
      return;
    }
    pending = false;
    waitingFrom = null;
    const blocks = yblocks.map((ymap) => {
      let block = fromY.get(ymap);
      if (!block) {
        block = readBlock(ymap);
        fromY.set(ymap, block);
      }
      return block;
    });
    const tr = editor.state.tr.setBlocks(blocks).setMeta('remote', true).setMeta('addToHistory', false).setMeta('yjs', true);
    const anchor = selectionBefore && editorPosition(selectionBefore.anchor);
    const head = selectionBefore && editorPosition(selectionBefore.head);
    if (anchor && head) {
      tr.setSelection({ anchor, head, isCollapsed: anchor.blockId === head.blockId && anchor.offset === head.offset });
    }
    applying = true;
    try {
      editor.dispatch(tr);
    } finally {
      applying = false;
    }
    synced = editor.state.doc.blocks;
  };

  // Before a change from elsewhere, remember the selection as Yjs positions:
  // they follow the text, so the caret stays on the same character.
  const onBeforeTransaction = (txn: Y.Transaction) => {
    if (txn.origin !== origin && !pending) selectionBefore = relativeSelection(editor.state.selection);
  };

  const onDeepChange = (events: Y.YEvent<any>[], txn: Y.Transaction) => {
    for (const event of events) {
      if (event.target === yblocks) {
        idIndexStale = true;
        continue;
      }
      // A change inside a block: forget the block made from it.
      let type: Y.AbstractType<any> | null = event.target;
      while (type && type.parent !== yblocks) type = type.parent as Y.AbstractType<any> | null;
      if (type instanceof Y.Map) fromY.delete(type);
    }
    if (txn.origin !== origin) readRemote();
  };

  const onCompositionEnd = () => {
    // The editor has already put the composed text in (its listener runs first).
    if (pending) readRemote();
  };

  // --- Start -----------------------------------------------------------------

  ydoc.on('beforeTransaction', onBeforeTransaction);
  yblocks.observeDeep(onDeepChange);
  editor.container.addEventListener('compositionend', onCompositionEnd);
  const stopUpdates = editor.on('update', writeLocal);

  if (yblocks.length === 0) {
    synced = editor.state.doc.blocks;
    // Not tracked by undo: the starting document cannot be undone.
    ydoc.transact(() => writeBlocks(yblocks, [], synced), 'levit-init');
  } else {
    selectionBefore = null;
    readRemote();
  }

  const undoManager = new Y.UndoManager(yblocks, {
    trackedOrigins: new Set([origin]),
    captureTimeout: options.captureTimeout ?? 500,
  });
  // Put the caret back where it was when a change is undone or redone.
  let selectionBeforeEdit: RelativeSelection = relativeSelection(editor.state.selection);
  const stopSelection = editor.on('selectionUpdate', () => {
    if (!applying) selectionBeforeEdit = relativeSelection(editor.state.selection);
  });
  undoManager.on('stack-item-added', ({ stackItem, type }: { stackItem: { meta: Map<string, unknown> }; type: string }) => {
    if (type === 'undo' && !stackItem.meta.has('selection')) stackItem.meta.set('selection', selectionBeforeEdit);
  });
  undoManager.on('stack-item-popped', ({ stackItem }: { stackItem: { meta: Map<string, unknown> } }) => {
    const saved = stackItem.meta.get('selection') as RelativeSelection | undefined;
    const anchor = saved && editorPosition(saved.anchor);
    const head = saved && editorPosition(saved.head);
    if (anchor && head) {
      editor.dispatch(
        editor.state.tr
          .setSelection({ anchor, head, isCollapsed: anchor.blockId === head.blockId && anchor.offset === head.offset })
          .setMeta('yjs', true)
      );
    }
  });
  editor.setHistory({
    undo: () => undoManager.undo() !== null,
    redo: () => undoManager.redo() !== null,
  });

  // --- Cursors of other users --------------------------------------------------

  const awareness = options.awareness;
  const cursorLayer = awareness ? createRemoteCursors(editor) : null;
  const remoteCursors = (): RemoteCursor[] => {
    if (!awareness) return [];
    const out: RemoteCursor[] = [];
    awareness.getStates().forEach((state, clientID) => {
      if (clientID === awareness.clientID || !state?.cursor) return;
      try {
        const anchor = editorPosition(Y.createRelativePositionFromJSON(state.cursor.anchor));
        const head = editorPosition(Y.createRelativePositionFromJSON(state.cursor.head));
        if (!anchor || !head) return;
        const user = state.user ?? {};
        out.push({
          id: String(clientID),
          name: typeof user.name === 'string' ? user.name : '',
          color: typeof user.color === 'string' ? user.color : '',
          anchor,
          head,
        });
      } catch {
        // A malformed state from another client is left out.
      }
    });
    return out;
  };
  const showCursors = () => cursorLayer?.set(remoteCursors());
  const shareCursor = () => {
    if (!awareness || destroyed) return;
    const rel = relativeSelection(editor.state.selection);
    awareness.setLocalStateField(
      'cursor',
      rel ? { anchor: Y.relativePositionToJSON(rel.anchor), head: Y.relativePositionToJSON(rel.head) } : null
    );
  };
  let stopCursorSharing = () => {};
  if (awareness) {
    if (options.user) awareness.setLocalStateField('user', { name: options.user.name, color: options.user.color });
    awareness.on('change', showCursors);
    // Others' cursors move when the text changes; mine is shared when it moves.
    const stopUpdate = editor.on('update', showCursors);
    const stopShare = editor.on('selectionUpdate', shareCursor);
    stopCursorSharing = () => {
      awareness.off('change', showCursors);
      stopUpdate();
      stopShare();
      awareness.setLocalStateField('cursor', null);
      cursorLayer?.destroy();
    };
    shareCursor();
    showCursors();
  }

  return {
    undoManager,
    relativePosition,
    editorPosition,
    remoteCursors,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      ydoc.off('beforeTransaction', onBeforeTransaction);
      yblocks.unobserveDeep(onDeepChange);
      editor.container.removeEventListener('compositionend', onCompositionEnd);
      stopUpdates();
      stopSelection();
      stopCursorSharing();
      undoManager.destroy();
      editor.setHistory(null);
    },
  };
}

// --- Converting --------------------------------------------------------------

type Attributes = Record<string, unknown>;

/** Y.Text formatting for a list of marks. */
function markAttributes(marks: readonly InlineMark[] | undefined): Attributes {
  const out: Attributes = {};
  for (const mark of marks ?? []) out[mark.type] = mark.attrs ? { ...mark.attrs } : true;
  return out;
}

function marksFrom(attributes: Attributes | undefined): InlineMark[] {
  const marks: InlineMark[] = [];
  for (const [type, value] of Object.entries(attributes ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    marks.push(value === true ? { type } : { type, attrs: { ...(value as Record<string, string | number | boolean>) } });
  }
  return marks;
}

function readBlock(ymap: Y.Map<unknown>): BlockNode {
  const ytext = ymap.get('text') as Y.Text | undefined;
  const delta = (ytext?.toDelta() ?? []) as { insert: unknown; attributes?: Attributes }[];
  const content: InlineNode[] = delta
    .filter((op) => typeof op.insert === 'string' && op.insert.length > 0)
    .map((op) => ({ text: op.insert as string, marks: marksFrom(op.attributes) }));
  return {
    id: String(ymap.get('id')),
    type: String(ymap.get('type') ?? 'paragraph'),
    attrs: { ...((ymap.get('attrs') as Record<string, unknown>) ?? {}) },
    content: content.length > 0 ? content : [{ text: '', marks: [] }],
  };
}

function newYBlock(block: BlockNode): Y.Map<unknown> {
  const ymap = new Y.Map<unknown>();
  ymap.set('id', block.id);
  ymap.set('type', block.type);
  ymap.set('attrs', { ...block.attrs });
  const ytext = new Y.Text();
  let at = 0;
  for (const node of block.content) {
    if (!node.text) continue;
    ytext.insert(at, node.text, markAttributes(node.marks));
    at += node.text.length;
  }
  ymap.set('text', ytext);
  return ymap;
}

interface Rebase {
  /** Maps a text offset of the editor's older document to the shared text. */
  mapIndex: (blockId: string, index: number) => number;
  byId: (id: string) => Y.Map<unknown> | undefined;
}

/**
 * Writes the difference between two block lists. Unchanged blocks are the same
 * objects. With `rebase`, the shared list may already hold others' changes
 * the editor has not shown yet, so blocks are found by id.
 */
function writeBlocks(yblocks: YBlocks, before: readonly BlockNode[], after: readonly BlockNode[], rebase?: Rebase): void {
  // Blocks keep their ids, so the lists line up by id at both ends.
  let start = 0;
  while (start < before.length && start < after.length && before[start].id === after[start].id) start++;
  let endBefore = before.length;
  let endAfter = after.length;
  while (endBefore > start && endAfter > start && before[endBefore - 1].id === after[endAfter - 1].id) {
    endBefore--;
    endAfter--;
  }
  // In the middle, blocks were removed and added.
  if (rebase) {
    const indexOf = (id: string) => yblocks.toArray().findIndex((ymap) => ymap.get('id') === id);
    for (let i = start; i < endBefore; i++) {
      const at = indexOf(before[i].id);
      if (at !== -1) yblocks.delete(at, 1);
    }
    if (endAfter > start) {
      const at = start > 0 ? indexOf(after[start - 1].id) + 1 : 0;
      yblocks.insert(at, after.slice(start, endAfter).map(newYBlock));
    }
  } else {
    if (endBefore > start) yblocks.delete(start, endBefore - start);
    if (endAfter > start) yblocks.insert(start, after.slice(start, endAfter).map(newYBlock));
  }

  // Blocks at both ends with the same id may have changed.
  const update = (i: number, j: number) => {
    if (before[i] === after[j]) return;
    const ymap = rebase ? rebase.byId(after[j].id) : yblocks.get(j);
    if (!ymap) return; // removed by someone else meanwhile
    const map = rebase ? (index: number) => rebase.mapIndex(after[j].id, index) : undefined;
    writeBlock(ymap, before[i], after[j], map);
  };
  for (let i = 0; i < start; i++) update(i, i);
  for (let k = 0; k < before.length - endBefore; k++) update(endBefore + k, endAfter + k);
}

const sameJSON = (a: unknown, b: unknown) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

function writeBlock(ymap: Y.Map<unknown>, before: BlockNode, after: BlockNode, mapIndex?: (index: number) => number): void {
  if (before.type !== after.type) ymap.set('type', after.type);
  if (!sameJSON(before.attrs, after.attrs)) ymap.set('attrs', { ...after.attrs });
  writeText(ymap.get('text') as Y.Text, before.content, after.content, mapIndex);
}

/** Characters with their formatting as one key, for comparing. */
function runs(content: readonly InlineNode[]): { text: string; keys: string[]; attrs: Attributes[] } {
  let text = '';
  const keys: string[] = [];
  const attrs: Attributes[] = [];
  for (const node of content) {
    if (!node.text) continue;
    const a = markAttributes(node.marks);
    const key = JSON.stringify(Object.entries(a).sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)));
    text += node.text;
    for (let k = 0; k < node.text.length; k++) {
      keys.push(key);
      attrs.push(a);
    }
  }
  return { text, keys, attrs };
}

/** Changes the Y.Text from `before` to `after`: the changed middle, then formatting. */
function writeText(ytext: Y.Text, before: readonly InlineNode[], after: readonly InlineNode[], mapIndex = (index: number) => index): void {
  const a = runs(before);
  const b = runs(after);
  let prefix = 0;
  const max = Math.min(a.text.length, b.text.length);
  while (prefix < max && a.text[prefix] === b.text[prefix]) prefix++;
  let suffix = 0;
  while (suffix < max - prefix && a.text[a.text.length - 1 - suffix] === b.text[b.text.length - 1 - suffix]) suffix++;

  const removed = a.text.length - prefix - suffix;
  const where = mapIndex(prefix);
  if (removed > 0) ytext.delete(where, removed);
  // Insert the new middle run by run, each with exactly its own formatting.
  let at = prefix;
  const end = b.text.length - suffix;
  while (at < end) {
    let next = at + 1;
    while (next < end && b.keys[next] === b.keys[at]) next++;
    ytext.insert(where + at - prefix, b.text.slice(at, next), { ...b.attrs[at] });
    at = next;
  }

  // Text kept at both ends may have new formatting. Offsets in the old text
  // are mapped like the change itself.
  const shiftAt = (indexInA: number) => mapIndex(indexInA) - indexInA;
  const reformat = (fromA: number, fromB: number, length: number) => {
    let k = 0;
    while (k < length) {
      if (a.keys[fromA + k] === b.keys[fromB + k]) {
        k++;
        continue;
      }
      let next = k + 1;
      while (next < length && a.keys[fromA + next] !== b.keys[fromB + next] && a.keys[fromA + next] === a.keys[fromA + k] && b.keys[fromB + next] === b.keys[fromB + k]) next++;
      const change: Attributes = { ...b.attrs[fromB + k] };
      for (const type of Object.keys(a.attrs[fromA + k])) if (!(type in change)) change[type] = null;
      ytext.format(fromB + k + shiftAt(fromA + k), next - k, change);
      k = next;
    }
  };
  reformat(0, 0, prefix);
  reformat(a.text.length - suffix, b.text.length - suffix, suffix);
}
