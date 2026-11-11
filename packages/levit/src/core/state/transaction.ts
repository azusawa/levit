import {
  DocumentData,
  EditorPosition,
  EditorSelection,
  InlineMark,
  InlineNode,
} from '../model/types.js';
import {
  createBlock,
  findBlockIndex,
  generateBlockId,
  getBlockText,
  isListItem,
  listIndent,
  MAX_LIST_INDENT,
  mergeBlockContent,
  normalizeInlineNodes,
  orderedSelection,
  setListIndent,
  sliceBlockContent,
  splitBlockContent,
} from '../model/document.js';
import { normalizeCodeLanguage, sanitizeHref, sanitizeImageSrc } from '../model/sanitize.js';
import {
  lineEndOffset,
  lineStartOffset,
  nextCharOffset,
  nextWordOffset,
  previousCharOffset,
  previousWordOffset,
} from '../model/text.js';
import { BlockNode } from '../model/types.js';
import { cellContent, createCell, createTable, isTableCell, tableAtIndex, tableIdOf, rowIdOf, type TablePosition } from '../model/table.js';
import { EditorState } from './state.js';

export function cloneDocument(doc: DocumentData): DocumentData {
  return {
    version: doc.version,
    blocks: doc.blocks.map((b) => ({
      id: b.id,
      type: b.type,
      attrs: { ...b.attrs },
      content: b.content.map((c) => ({
        text: c.text,
        marks: c.marks ? [...c.marks] : [],
      })),
    })),
  };
}

export function cloneSelection(sel: EditorSelection): EditorSelection {
  return {
    anchor: { ...sel.anchor },
    head: { ...sel.head },
    isCollapsed: sel.isCollapsed,
  };
}

export class Transaction {
  private state: EditorState;
  public doc: DocumentData;
  public selection: EditorSelection;
  public storedMarks: InlineMark[] | null = null;
  public docChanged = false;
  public selectionChanged = false;

  /** Blocks this transaction copied, so it may change them. */
  private owned = new WeakSet<BlockNode>();

  constructor(state: EditorState) {
    this.state = state;
    // Committed blocks are frozen and shared: a block is copied only when this
    // transaction changes it (editBlock), so unchanged blocks keep their
    // identity. The list itself is this transaction's own.
    this.doc = { version: state.doc.version, blocks: state.doc.blocks.slice() };
    this.selection = cloneSelection(state.selection);
    this.storedMarks = state.storedMarks ? [...state.storedMarks] : null;
  }

  /**
   * The block (by index or id) as a copy that this transaction may change.
   * Change blocks only through this: the document's blocks are frozen and
   * shared with the previous state and undo history.
   */
  editBlock(at: number | string): BlockNode | undefined {
    const index = typeof at === 'number' ? at : findBlockIndex(this.doc, at);
    const block = this.doc.blocks[index];
    if (!block) return undefined;
    if (this.owned.has(block) || !Object.isFrozen(block)) return block;
    const copy: BlockNode = {
      id: block.id,
      type: block.type,
      attrs: { ...block.attrs },
      content: block.content.map((n) => ({ text: n.text, marks: n.marks ? [...n.marks] : [] })),
    };
    this.doc.blocks[index] = copy;
    this.owned.add(copy);
    return copy;
  }

  private meta = new Map<string, unknown>();

  /**
   * Attaches a value for listeners of the 'transaction' event, like where a
   * change came from. `addToHistory: false` keeps the change out of undo.
   */
  setMeta(key: string, value: unknown): this {
    this.meta.set(key, value);
    return this;
  }

  getMeta(key: string): unknown {
    return this.meta.get(key);
  }

  /**
   * Replaces all blocks, for example with a document that changed elsewhere.
   * Pass unchanged blocks as they are, so they are not redrawn. An empty list
   * leaves one empty paragraph; a caret in a block that is gone moves to the
   * start of the first block.
   */
  setBlocks(blocks: BlockNode[]): this {
    this.doc.blocks = blocks.length > 0 ? blocks.slice() : [createBlock('paragraph')];
    const ids = new Set(this.doc.blocks.map((b) => b.id));
    if (!ids.has(this.selection.anchor.blockId) || !ids.has(this.selection.head.blockId)) {
      this.setCaret(this.doc.blocks[0].id, 0);
    }
    this.docChanged = true;
    return this;
  }

  /** editBlock for an index that is known to exist. */
  private edit(index: number): BlockNode {
    return this.editBlock(index)!;
  }

  /** True for blocks without text (dividers, images, atom plugin blocks). */
  isAtom(type: string): boolean {
    return this.state.schema.isAtom(type);
  }

  setSelection(selection: EditorSelection): this {
    this.selection = cloneSelection(selection);
    this.selectionChanged = true;
    return this;
  }

  private normalizeSelectionOrder(): { from: EditorPosition; to: EditorPosition } {
    return orderedSelection(this.doc, this.selection);
  }

  deleteRange(): this {
    if (this.selection.isCollapsed) return this;

    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);

    if (fromIdx === -1 || toIdx === -1) return this;

    if (fromIdx === toIdx) {
      const block = this.edit(fromIdx);
      const [left] = splitBlockContent(block, from.offset);
      const [, right] = splitBlockContent(block, to.offset);
      block.content = mergeBlockContent(left, right);
    } else if (this.doc.blocks.slice(fromIdx, toIdx + 1).some((b) => isTableCell(b.type))) {
      return this.deleteRangeWithCells(fromIdx, toIdx, from, to);
    } else {
      const startBlock = this.edit(fromIdx);
      const endBlock = this.doc.blocks[toIdx];

      const [startLeft] = splitBlockContent(startBlock, from.offset);
      const [, endRight] = splitBlockContent(endBlock, to.offset);

      // A selection that starts at an image or divider removes it too.
      if (this.isAtom(startBlock.type)) {
        startBlock.type = 'paragraph';
        startBlock.attrs = {};
      }
      startBlock.content = mergeBlockContent(startLeft, endRight);
      // Remove blocks from fromIdx + 1 to toIdx
      this.doc.blocks.splice(fromIdx + 1, toIdx - fromIdx);
    }

    this.selection = {
      anchor: { blockId: from.blockId, offset: from.offset },
      head: { blockId: from.blockId, offset: from.offset },
      isCollapsed: true,
    };
    this.docChanged = true;
    this.selectionChanged = true;
    return this;
  }

  /**
   * deleteRange for a selection that touches a table. Cells are never merged
   * or split: selected cells are emptied, and a table is removed only when
   * the selection covers all of it and more (or the whole document).
   */
  private deleteRangeWithCells(fromIdx: number, toIdx: number, from: EditorPosition, to: EditorPosition): this {
    const blocks = this.doc.blocks;
    const covered = new Set<number>();
    for (let i = fromIdx; i <= toIdx; i++) {
      const t = tableAtIndex(blocks, i);
      if (!t) continue;
      const startsBefore = t.start > fromIdx;
      const endsAfter = t.end < toIdx;
      const all = (startsBefore || (t.start === fromIdx && from.offset === 0)) &&
        (endsAfter || (t.end === toIdx && to.offset >= getBlockText(blocks[toIdx]).length));
      // Selecting all the cells empties them; the table goes only when the
      // selection reaches past it, or is the whole document.
      const wholeDocument = fromIdx === 0 && toIdx === blocks.length - 1;
      if (all && (startsBefore || endsAfter || wholeDocument)) for (let k = t.start; k <= t.end; k++) covered.add(k);
      i = t.end;
    }

    const kept: BlockNode[] = [];
    let first: BlockNode | null = null;
    let last: BlockNode | null = null;
    for (let i = fromIdx; i <= toIdx; i++) {
      if (covered.has(i)) continue;
      const type = blocks[i].type;
      const edge = i === fromIdx || i === toIdx;
      // Blocks between the ends go, except cells of a table that stays.
      if (!edge && !isTableCell(type)) continue;
      // Selected images and dividers go too.
      if (edge && this.isAtom(type)) continue;
      const block = this.edit(i);
      const start = i === fromIdx ? from.offset : 0;
      const end = i === toIdx ? to.offset : getBlockText(block).length;
      const [left] = splitBlockContent(block, start);
      const [, right] = splitBlockContent(block, end);
      block.content = mergeBlockContent(left, right);
      kept.push(block);
      if (i === fromIdx) first = block;
      if (i === toIdx) last = block;
    }
    // Text on both sides of a removed table joins up, as with no table between.
    if (first && last && !isTableCell(first.type) && !isTableCell(last.type)) {
      first.content = mergeBlockContent(first.content, last.content);
      kept.pop();
    }
    if (kept.length === 0) kept.push(createBlock('paragraph'));
    this.doc.blocks.splice(fromIdx, toIdx - fromIdx + 1, ...kept);
    if (first) this.setCaret(first.id, from.offset);
    else this.setCaret(kept[0].id, 0);
    this.docChanged = true;
    return this;
  }

  insertText(text: string): this {
    if (!text) return this;

    if (!this.selection.isCollapsed) {
      this.deleteRange();
    }
    this.leaveAtomBlock();

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.edit(blockIdx);
    const offset = this.selection.anchor.offset;

    const [left, right] = splitBlockContent(block, offset);

    // Determine marks for new text: storedMarks if set, else mark at insertion point
    let marks: InlineMark[] = [];
    if (this.storedMarks) {
      marks = [...this.storedMarks];
    } else if (left.length > 0 && left[left.length - 1].text) {
      // Marks of the text before the caret carry on, except non-inclusive ones.
      marks = (left[left.length - 1].marks ?? []).filter((m) => this.state.schema.marks.get(m.type)?.inclusive !== false);
    }

    const insertedNode: InlineNode = { text, marks };
    block.content = normalizeInlineNodes([...left, insertedNode, ...right]);

    const newOffset = offset + text.length;
    this.selection = {
      anchor: { blockId: block.id, offset: newOffset },
      head: { blockId: block.id, offset: newOffset },
      isCollapsed: true,
    };

    this.docChanged = true;
    this.selectionChanged = true;
    return this;
  }

  /** Removes text between two offsets of one block and puts the caret at `start`. */
  private deleteInBlock(blockIdx: number, start: number, end: number): this {
    if (start >= end) return this;
    const block = this.edit(blockIdx);
    const [left] = splitBlockContent(block, start);
    const [, right] = splitBlockContent(block, end);
    block.content = mergeBlockContent(left, right);
    this.selection = {
      anchor: { blockId: block.id, offset: start },
      head: { blockId: block.id, offset: start },
      isCollapsed: true,
    };
    this.docChanged = true;
    this.selectionChanged = true;
    return this;
  }

  /**
   * Deletes backward from the caret to `target(text, offset)`. At the start of
   * a block, leaves a list or merges with the previous block instead.
   */
  private deleteBackwardTo(target: (text: string, offset: number) => number): this {
    if (!this.selection.isCollapsed) {
      return this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.doc.blocks[blockIdx];
    const offset = this.selection.anchor.offset;

    if (this.isAtom(block.type)) return this.removeAtomBlock(blockIdx);

    if (offset > 0) {
      return this.deleteInBlock(blockIdx, target(getBlockText(block), offset), offset);
    }

    // Cells are never merged: Backspace at the start of one does nothing.
    if (isTableCell(block.type)) return this;

    // Offset is 0 in a nested list item: move it up a level first.
    if (listIndent(block) > 0) {
      return this.outdentListItem();
    }

    // Offset is 0 in a list item: leave the list, keep the text
    if (isListItem(block.type)) {
      const edited = this.edit(blockIdx);
      edited.type = 'paragraph';
      edited.attrs = {};
      this.docChanged = true;
      return this;
    }

    // Offset is 0 after a table: go into its last cell instead of merging.
    const prev = this.doc.blocks[blockIdx - 1];
    if (prev && isTableCell(prev.type)) {
      this.setCaret(prev.id, getBlockText(prev).length);
      return this;
    }

    // Offset is 0 after an image or divider: remove it, keep the caret.
    if (blockIdx > 0 && this.isAtom(this.doc.blocks[blockIdx - 1].type)) {
      this.doc.blocks.splice(blockIdx - 1, 1);
      this.docChanged = true;
      return this;
    }

    // Offset is 0: merge with previous block if exists
    if (blockIdx > 0) {
      const prevBlock = this.edit(blockIdx - 1);
      const prevTextLen = getBlockText(prevBlock).length;

      prevBlock.content = mergeBlockContent(prevBlock.content, block.content);
      // Remove current block
      this.doc.blocks.splice(blockIdx, 1);

      this.selection = {
        anchor: { blockId: prevBlock.id, offset: prevTextLen },
        head: { blockId: prevBlock.id, offset: prevTextLen },
        isCollapsed: true,
      };
      this.docChanged = true;
      this.selectionChanged = true;
      return this;
    }

    // Offset is 0 and it's the first block: if not paragraph, reset to paragraph
    if (block.type !== 'paragraph') {
      const edited = this.edit(blockIdx);
      edited.type = 'paragraph';
      edited.attrs = {};
      this.docChanged = true;
    }

    return this;
  }

  /**
   * Deletes forward from the caret to `target(text, offset)`. At the end of a
   * block, pulls the next block up into this one.
   */
  private deleteForwardTo(target: (text: string, offset: number) => number): this {
    if (!this.selection.isCollapsed) {
      return this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.doc.blocks[blockIdx];
    const text = getBlockText(block);
    const offset = this.selection.anchor.offset;

    if (this.isAtom(block.type)) return this.removeAtomBlock(blockIdx);

    if (offset < text.length) {
      return this.deleteInBlock(blockIdx, offset, target(text, offset));
    }

    const next = this.doc.blocks[blockIdx + 1];
    // Cells are never merged with each other or with the text around a table.
    if (!next || isTableCell(block.type) || isTableCell(next.type)) return this;
    if (this.isAtom(next.type)) {
      this.doc.blocks.splice(blockIdx + 1, 1);
      this.docChanged = true;
      return this;
    }
    this.edit(blockIdx).content = mergeBlockContent(block.content, next.content);
    this.doc.blocks.splice(blockIdx + 1, 1);
    this.selection = {
      anchor: { blockId: block.id, offset },
      head: { blockId: block.id, offset },
      isCollapsed: true,
    };
    this.docChanged = true;
    this.selectionChanged = true;
    return this;
  }

  deleteBackward(): this {
    return this.deleteBackwardTo(previousCharOffset);
  }

  deleteForward(): this {
    return this.deleteForwardTo(nextCharOffset);
  }

  deleteWordBackward(): this {
    return this.deleteBackwardTo(previousWordOffset);
  }

  deleteWordForward(): this {
    return this.deleteForwardTo(nextWordOffset);
  }

  /** Deletes back to the start of the line. If already there, acts like Backspace. */
  deleteLineBackward(): this {
    return this.deleteBackwardTo((text, offset) => {
      const start = lineStartOffset(text, offset);
      return start < offset ? start : previousCharOffset(text, offset);
    });
  }

  /** Deletes up to the end of the line. If already there, acts like Delete. */
  deleteLineForward(): this {
    return this.deleteForwardTo((text, offset) => {
      const end = lineEndOffset(text, offset);
      return end > offset ? end : nextCharOffset(text, offset);
    });
  }

  /** Inserts a line break inside the current block (Shift+Enter). */
  insertLineBreak(): this {
    return this.insertText('\n');
  }

  /**
   * Inserts pasted blocks at the caret. A single block is inserted inline.
   * Several blocks split the current block: its start joins the first pasted
   * block, its end joins the last one.
   */
  insertFragment(fragment: BlockNode[], options: { keepIds?: boolean } = {}): this {
    if (fragment.length === 0) return this;

    if (!this.selection.isCollapsed) {
      this.deleteRange();
    }
    this.leaveAtomBlock();

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.edit(blockIdx);
    // A cell holds only text: what is pasted into one goes on its lines. A
    // single cell (text copied from inside a cell, or one spreadsheet cell)
    // is pasted as its text anywhere.
    if (isTableCell(block.type) || (fragment.length === 1 && isTableCell(fragment[0].type))) {
      const lines = cellContent(fragment, (type) => this.isAtom(type));
      if (!lines) return this;
      fragment = [createBlock('paragraph', {}, lines)];
    }
    const offset = this.selection.anchor.offset;
    const [left, right] = splitBlockContent(block, offset);
    // Pasted blocks get new ids, unless the caller keeps them (streaming
    // keeps ids so finished blocks are not redrawn). Pasted tables get new
    // table and row ids too, so they never join a table already here.
    const renamed = new Map<string, string>();
    const rename = (key: string, prefix: string) => {
      if (!renamed.has(key)) renamed.set(key, generateBlockId(prefix));
      return renamed.get(key)!;
    };
    const pasted = fragment.map((b) => {
      const attrs = { ...b.attrs };
      if (isTableCell(b.type) && !options.keepIds) {
        attrs.table = rename(`t:${attrs.table}`, 't');
        attrs.row = rename(`r:${attrs.table}:${b.attrs?.row}`, 'r');
      }
      return createBlock(
        b.type,
        attrs,
        b.content.map((c) => ({ text: c.text, marks: [...(c.marks ?? [])] })),
        options.keepIds ? b.id : undefined
      );
    });

    // Images, dividers and tables cannot share a block with text, so they
    // are put between the two halves of the current block.
    const first = pasted[0];
    const last = pasted[pasted.length - 1];
    const standsAlone = (type: string) => this.isAtom(type) || isTableCell(type);
    if (standsAlone(first.type) || standsAlone(last.type)) {
      // Text before the first atom joins the left half, like any paste.
      const inserted = [...pasted];
      if (!standsAlone(first.type)) {
        block.content = normalizeInlineNodes([...left, ...first.content]);
        inserted.shift();
      } else {
        block.content = left;
      }
      const after: BlockNode[] = [];
      if (standsAlone(last.type)) after.push(createBlock(block.type, { ...block.attrs }, right));
      else last.content = normalizeInlineNodes([...last.content, ...right]);
      this.doc.blocks.splice(blockIdx + 1, 0, ...inserted, ...after);
      // An empty left half (caret at the start, or an empty line) goes away.
      if (getBlockText(block) === '') this.doc.blocks.splice(blockIdx, 1);
      if (after[0]) this.setCaret(after[0].id, 0);
      else this.setCaret(last.id, getBlockText(last).length - getBlockText({ ...last, content: right }).length);
      this.docChanged = true;
      return this;
    }

    if (pasted.length === 1) {
      // An empty paragraph takes the type of the pasted block, as below.
      if (block.type === 'paragraph' && getBlockText(block) === '') {
        block.type = pasted[0].type;
        block.attrs = { ...pasted[0].attrs };
      }
      const inserted = normalizeInlineNodes(pasted[0].content);
      block.content = normalizeInlineNodes([...left, ...inserted, ...right]);
      const caretOffset = offset + getBlockText(pasted[0]).length;
      this.selection = {
        anchor: { blockId: block.id, offset: caretOffset },
        head: { blockId: block.id, offset: caretOffset },
        isCollapsed: true,
      };
      this.docChanged = true;
      this.selectionChanged = true;
      return this;
    }

    const lastLength = getBlockText(last).length;

    // An empty paragraph takes the type of the first pasted block.
    if (block.type === 'paragraph' && getBlockText(block) === '') {
      block.type = first.type;
      block.attrs = { ...first.attrs };
    }
    block.content = normalizeInlineNodes([...left, ...first.content]);
    last.content = normalizeInlineNodes([...last.content, ...right]);
    this.doc.blocks.splice(blockIdx + 1, 0, ...pasted.slice(1));

    this.selection = {
      anchor: { blockId: last.id, offset: lastLength },
      head: { blockId: last.id, offset: lastLength },
      isCollapsed: true,
    };
    this.docChanged = true;
    this.selectionChanged = true;
    return this;
  }

  /** Moves the caret out of an image or divider into a new paragraph after it. */
  private leaveAtomBlock(): void {
    const idx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (idx === -1 || !this.isAtom(this.doc.blocks[idx].type)) return;
    const paragraph = createBlock('paragraph');
    this.doc.blocks.splice(idx + 1, 0, paragraph);
    this.setCaret(paragraph.id, 0);
    this.docChanged = true;
  }

  /** Removes the image or divider at idx and puts the caret next to where it was. */
  private removeAtomBlock(idx: number): this {
    this.doc.blocks.splice(idx, 1);
    if (this.doc.blocks.length === 0) this.doc.blocks.push(createBlock('paragraph'));
    const prev = this.doc.blocks[idx - 1];
    if (prev && !this.isAtom(prev.type)) this.setCaret(prev.id, getBlockText(prev).length);
    else this.setCaret(this.doc.blocks[Math.min(idx, this.doc.blocks.length - 1)].id, 0);
    this.docChanged = true;
    return this;
  }

  private setCaret(blockId: string, offset: number): void {
    this.selection = {
      anchor: { blockId, offset },
      head: { blockId, offset },
      isCollapsed: true,
    };
    this.selectionChanged = true;
  }

  /**
   * Inserts a block without text at the caret: an empty paragraph becomes it,
   * otherwise it goes after the caret's block, splitting it if needed. The
   * caret moves to the block after it, which is a new paragraph if needed.
   */
  insertAtom(type: string, attrs: Record<string, any> = {}): this {
    // Only blocks without text go here, and images keep their src check.
    if (!this.isAtom(type)) return this;
    if (type === 'image') {
      const src = sanitizeImageSrc(attrs.src);
      if (!src) return this;
      attrs = { ...attrs, src };
    }
    if (!this.selection.isCollapsed) this.deleteRange();
    const idx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (idx === -1) return this;

    // In a table, the block goes after the table.
    const table = tableAtIndex(this.doc.blocks, idx);
    if (table) {
      const last = this.doc.blocks[table.end];
      this.setCaret(last.id, getBlockText(last).length);
    }
    const next = this.placeAlone([createBlock(type, attrs)]);
    this.setCaret(next.id, 0);
    return this;
  }

  /**
   * Puts blocks that cannot share a block with text (an image, a divider, a
   * table) at the caret: in place of an empty paragraph, or after the caret's
   * block, splitting it at the caret. Makes sure a paragraph follows them, so
   * writing can go on below, and returns the block after them.
   */
  private placeAlone(blocks: BlockNode[]): BlockNode {
    let idx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    const block = this.doc.blocks[idx];
    const text = getBlockText(block);
    // A table never takes the place of the only paragraph between it and another table.
    const prev = this.doc.blocks[idx - 1];
    const wouldTouch = isTableCell(blocks[0].type) && !!prev && isTableCell(prev.type);
    if (block.type === 'paragraph' && text === '' && !wouldTouch) {
      this.doc.blocks.splice(idx, 1, ...blocks);
    } else {
      const offset = this.selection.anchor.offset;
      if (offset < text.length && !this.isAtom(block.type) && !isTableCell(block.type)) {
        const edited = this.edit(idx);
        const [left, right] = splitBlockContent(edited, offset);
        edited.content = left;
        this.doc.blocks.splice(idx + 1, 0, createBlock(edited.type, { ...edited.attrs }, right));
      }
      idx += 1;
      this.doc.blocks.splice(idx, 0, ...blocks);
    }
    let next = this.doc.blocks[idx + blocks.length];
    if (!next || this.isAtom(next.type) || isTableCell(next.type)) {
      next = createBlock('paragraph');
      this.doc.blocks.splice(idx + blocks.length, 0, next);
    }
    this.docChanged = true;
    return next;
  }

  /**
   * Inserts an empty table at the caret, like a divider: an empty paragraph
   * becomes the table, otherwise it goes after the caret's block, splitting it
   * at the caret. A paragraph follows the table so writing can go on below it.
   * The caret goes to the first cell. Does nothing inside a table.
   */
  insertTable(rows: number, cols: number, options: { header?: boolean } = {}): this {
    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 1 || cols < 1) return this;
    if (!this.selection.isCollapsed) this.deleteRange();
    const block = this.doc.blocks[findBlockIndex(this.doc, this.selection.anchor.blockId)];
    if (!block || isTableCell(block.type)) return this;

    const cells = createTable(rows, cols, options);
    this.placeAlone(cells);
    this.setCaret(cells[0].id, 0);
    return this;
  }

  /** The table at the caret, with the caret's block index. */
  private tableAtCaret(): (TablePosition & { index: number }) | null {
    const index = findBlockIndex(this.doc, this.selection.head.blockId);
    const table = tableAtIndex(this.doc.blocks, index);
    return table && { ...table, index };
  }

  /** Moves the caret to the end of the next cell (Tab). After the last cell, adds a row. */
  goToNextCell(): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    const order = t.rows.flat();
    const at = order.indexOf(t.index);
    if (at === order.length - 1) return this.addRow('after', 0);
    const next = this.doc.blocks[order[at + 1]];
    this.setCaret(next.id, getBlockText(next).length);
    return this;
  }

  /** Moves the caret to the end of the previous cell (Shift+Tab). */
  goToPreviousCell(): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    const order = t.rows.flat();
    const at = order.indexOf(t.index);
    if (at === 0) return this;
    const prev = this.doc.blocks[order[at - 1]];
    this.setCaret(prev.id, getBlockText(prev).length);
    return this;
  }

  /** Adds an empty row before or after the caret's row, and puts the caret in it. */
  addRow(where: 'before' | 'after', column?: number): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    const current = t.rows[t.row];
    const table = tableIdOf(this.doc.blocks[t.index]);
    const row = generateBlockId('r');
    const cols = Math.max(...t.rows.map((r) => r.length));
    // A row added above a header row is a header too, so the header stays on top.
    const header = where === 'before' && current.every((i) => this.doc.blocks[i].attrs?.header === true);
    const cells = Array.from({ length: cols }, () => createCell(table, row, header));
    const at = where === 'before' ? current[0] : current[current.length - 1] + 1;
    this.doc.blocks.splice(at, 0, ...cells);
    this.setCaret(cells[Math.min(column ?? t.col, cols - 1)].id, 0);
    this.docChanged = true;
    return this;
  }

  /** Adds an empty column left (before) or right (after) of the caret's column, and puts the caret in it. */
  addColumn(where: 'before' | 'after'): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    const table = tableIdOf(this.doc.blocks[t.index]);
    const position = where === 'before' ? t.col : t.col + 1;
    const inserts = t.rows.map((row) => {
      const first = this.doc.blocks[row[0]];
      const cell = createCell(table, rowIdOf(first), first.attrs?.header === true);
      const append = position >= row.length;
      return { cell, append, at: append ? row[row.length - 1] + 1 : row[position] };
    });
    // From the end of the document back, so earlier indexes stay right. At
    // the same index, a cell that goes after its row's last cell goes first.
    const order = [...inserts].sort((x, y) => y.at - x.at || Number(x.append) - Number(y.append));
    for (const { cell, at } of order) this.doc.blocks.splice(at, 0, cell);
    this.setCaret(inserts[t.row].cell.id, 0);
    this.docChanged = true;
    return this;
  }

  /** Deletes the caret's row. The caret goes to the row that takes its place. Deleting the only row deletes the table. */
  deleteRow(): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    if (t.rows.length === 1) return this.deleteTable();
    const other = t.rows[t.row + 1] ?? t.rows[t.row - 1];
    const target = this.doc.blocks[other[Math.min(t.col, other.length - 1)]];
    for (const i of [...t.rows[t.row]].sort((x, y) => y - x)) this.doc.blocks.splice(i, 1);
    this.setCaret(target.id, getBlockText(target).length);
    this.docChanged = true;
    return this;
  }

  /** Deletes the caret's column. Deleting the only column deletes the table. */
  deleteColumn(): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    const doomed = t.rows.map((row) => row[t.col]).filter((i) => i !== undefined);
    if (doomed.length === t.end - t.start + 1) return this.deleteTable();
    const current = t.rows[t.row];
    const left = new Set(doomed);
    const nearby = [current[t.col + 1], current[t.col - 1], ...t.rows.flat()].find((i) => i !== undefined && !left.has(i))!;
    const target = this.doc.blocks[nearby];
    for (const i of [...doomed].sort((x, y) => y - x)) this.doc.blocks.splice(i, 1);
    this.setCaret(target.id, getBlockText(target).length);
    this.docChanged = true;
    return this;
  }

  /** Deletes the caret's table. The caret goes to the text after it, or before it. */
  deleteTable(): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    this.doc.blocks.splice(t.start, t.end - t.start + 1);
    const takesCaret = (b: BlockNode | undefined) => !!b && !this.isAtom(b.type) && !isTableCell(b.type);
    const after = this.doc.blocks[t.start];
    const before = this.doc.blocks[t.start - 1];
    if (takesCaret(after)) this.setCaret(after.id, 0);
    else if (takesCaret(before)) this.setCaret(before.id, getBlockText(before).length);
    else {
      const paragraph = createBlock('paragraph');
      this.doc.blocks.splice(t.start, 0, paragraph);
      this.setCaret(paragraph.id, 0);
    }
    this.docChanged = true;
    return this;
  }

  /** Turns the first row of the caret's table into a header row, or back. */
  toggleHeaderRow(): this {
    const t = this.tableAtCaret();
    if (!t) return this;
    const first = t.rows[0];
    const on = !first.every((i) => this.doc.blocks[i].attrs?.header === true);
    for (const i of first) {
      const attrs = { ...this.doc.blocks[i].attrs };
      if (on) attrs.header = true;
      else delete attrs.header;
      this.edit(i).attrs = attrs;
    }
    this.docChanged = true;
    return this;
  }

  /**
   * Sets the language of a code block: the one with blockId, or the selected
   * ones. An empty or invalid name clears it.
   */
  setCodeLanguage(language: string, blockId?: string): this {
    const name = normalizeCodeLanguage(language);
    for (const index of blockId ? [findBlockIndex(this.doc, blockId)] : this.selectedIndexes()) {
      const block = this.doc.blocks[index];
      if (block?.type !== 'code_block') continue;
      const attrs = { ...block.attrs };
      if (name) attrs.language = name;
      else delete attrs.language;
      this.edit(index).attrs = attrs;
      this.docChanged = true;
    }
    return this;
  }

  private selectedIndexes(): number[] {
    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);
    if (fromIdx === -1 || toIdx === -1) return [];
    return Array.from({ length: toIdx - fromIdx + 1 }, (_, k) => fromIdx + k);
  }

  /** Indexes of the list items between two indexes. */
  private listItemIndexes(fromIdx: number, toIdx: number): number[] {
    const out: number[] = [];
    for (let i = fromIdx; i <= toIdx; i++) if (isListItem(this.doc.blocks[i].type)) out.push(i);
    return out;
  }

  /** Selects the whole document. */
  selectAll(): this {
    const first = this.doc.blocks[0];
    const last = this.doc.blocks[this.doc.blocks.length - 1];
    return this.setSelection({
      anchor: { blockId: first.id, offset: 0 },
      head: { blockId: last.id, offset: getBlockText(last).length },
      isCollapsed: first === last && getBlockText(last).length === 0,
    });
  }

  /** Inserts a divider (horizontal rule) at the caret. */
  insertHorizontalRule(): this {
    return this.insertAtom('horizontal_rule', {});
  }

  /** Inserts an image at the caret. Does nothing when src is not a safe image URL. */
  insertImage({ src, alt = '' }: { src: string; alt?: string }): this {
    const safe = sanitizeImageSrc(src);
    if (!safe) return this;
    return this.insertAtom('image', { src: safe, alt });
  }

  /**
   * Splits the current block at the caret. Without a type, the new block is a
   * paragraph, except in a list item, where it continues the list (or leaves
   * the list when the item is empty).
   */
  splitBlock(type?: string, attrs?: Record<string, any>): this {
    if (!this.selection.isCollapsed) {
      this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    // A cell is never split: Enter starts a new line in it.
    if (isTableCell(this.doc.blocks[blockIdx].type)) return this.insertText('\n');

    const block = this.edit(blockIdx);
    const offset = this.selection.anchor.offset;

    if (type === undefined && isListItem(block.type)) {
      if (getBlockText(block) === '' && listIndent(block) > 0) {
        return this.outdentListItem();
      }
      if (getBlockText(block) === '') {
        block.type = 'paragraph';
        block.attrs = {};
        this.docChanged = true;
        return this;
      }
      type = block.type;
      attrs = { ...block.attrs };
      // A new task starts unchecked.
      if (type === 'task_list_item') attrs.checked = false;
    }
    type ??= 'paragraph';
    attrs ??= {};

    const [left, right] = splitBlockContent(block, offset);
    block.content = left;

    const newBlock = createBlock(type, attrs, right);
    this.doc.blocks.splice(blockIdx + 1, 0, newBlock);

    this.selection = {
      anchor: { blockId: newBlock.id, offset: 0 },
      head: { blockId: newBlock.id, offset: 0 },
      isCollapsed: true,
    };

    this.docChanged = true;
    this.selectionChanged = true;
    return this;
  }

  toggleMark(mark: InlineMark): this {
    if (this.selection.isCollapsed) {
      // Toggle stored marks for next typed character
      if (!this.storedMarks) this.storedMarks = [];
      const hasMark = this.storedMarks.some((m) => m.type === mark.type);
      if (hasMark) {
        this.storedMarks = this.storedMarks.filter((m) => m.type !== mark.type);
      } else {
        this.storedMarks.push(mark);
      }
      return this;
    }

    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);
    if (fromIdx === -1 || toIdx === -1) return this;

    // Check if the whole selection has this mark
    let allHaveMark = true;
    for (let i = fromIdx; i <= toIdx; i++) {
      const b = this.doc.blocks[i];
      const start = i === fromIdx ? from.offset : 0;
      const end = i === toIdx ? to.offset : getBlockText(b).length;

      const [, selectedPlusRight] = splitBlockContent(b, start);
      const [selected] = splitBlockContent({ ...b, content: selectedPlusRight }, end - start);

      for (const node of selected) {
        if (!node.marks?.some((m) => m.type === mark.type)) {
          allHaveMark = false;
          break;
        }
      }
      if (!allHaveMark) break;
    }

    // Apply or remove mark across the range
    for (let i = fromIdx; i <= toIdx; i++) {
      const b = this.edit(i);
      const start = i === fromIdx ? from.offset : 0;
      const end = i === toIdx ? to.offset : getBlockText(b).length;

      const [left, midRight] = splitBlockContent(b, start);
      const [mid, right] = splitBlockContent({ ...b, content: midRight }, end - start);

      const modifiedMid: InlineNode[] = mid.map((node) => {
        let marks = node.marks ? [...node.marks] : [];
        if (allHaveMark) {
          marks = marks.filter((m) => m.type !== mark.type);
        } else {
          if (!marks.some((m) => m.type === mark.type)) {
            marks.push({ ...mark });
          }
        }
        return { text: node.text, marks };
      });

      b.content = normalizeInlineNodes([...left, ...modifiedMid, ...right]);
    }

    this.docChanged = true;
    return this;
  }

  /**
   * Links the selected text to href, replacing any existing link.
   * null removes links. Unsafe URLs are ignored.
   */
  setLink(href: string | null): this {
    if (this.selection.isCollapsed) return this;

    let safeHref: string | null = null;
    if (href !== null) {
      safeHref = sanitizeHref(href);
      if (!safeHref) return this;
    }

    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);
    if (fromIdx === -1 || toIdx === -1) return this;

    for (let i = fromIdx; i <= toIdx; i++) {
      const b = this.edit(i);
      const start = i === fromIdx ? from.offset : 0;
      const end = i === toIdx ? to.offset : getBlockText(b).length;

      const [left] = splitBlockContent(b, start);
      const [, right] = splitBlockContent(b, end);
      const mid = sliceBlockContent(b, start, end).map((node) => {
        const marks = (node.marks ?? []).filter((m) => m.type !== 'link');
        if (safeHref) marks.push({ type: 'link', attrs: { href: safeHref } });
        return { text: node.text, marks };
      });

      b.content = normalizeInlineNodes([...left, ...mid, ...right]);
    }

    this.docChanged = true;
    return this;
  }

  /**
   * The selected blocks plus the nested items under the last one, so that
   * moving an item also moves its children.
   */
  private listItemRange(): [number, number] | null {
    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    let toIdx = findBlockIndex(this.doc, to.blockId);
    if (fromIdx === -1 || toIdx === -1) return null;

    const selected = this.doc.blocks.slice(fromIdx, toIdx + 1).filter((b) => isListItem(b.type));
    if (selected.length === 0) return null;
    const minIndent = Math.min(...selected.map(listIndent));
    while (toIdx + 1 < this.doc.blocks.length) {
      const next = this.doc.blocks[toIdx + 1];
      if (!isListItem(next.type) || listIndent(next) <= minIndent) break;
      toIdx += 1;
    }
    return [fromIdx, toIdx];
  }

  /** Checks or unchecks a task item: the one with blockId, or the one at the caret. */
  toggleTaskChecked(blockId = this.selection.anchor.blockId): this {
    const index = findBlockIndex(this.doc, blockId);
    const block = this.doc.blocks[index];
    if (!block || block.type !== 'task_list_item') return this;
    this.edit(index).attrs = { ...block.attrs, checked: block.attrs?.checked !== true };
    this.docChanged = true;
    return this;
  }

  /** Nests the selected list items one level deeper (Tab). */
  indentListItem(): this {
    const range = this.listItemRange();
    if (!range) return this;
    const [fromIdx, toIdx] = range;
    const items = this.listItemIndexes(fromIdx, toIdx);
    const blocks = this.doc.blocks;

    // The first item can only go one level below the item above it.
    const first = blocks[items[0]];
    const above = blocks[items[0] - 1];
    if (!above || !isListItem(above.type) || listIndent(above) < listIndent(first)) return this;
    if (items.some((i) => listIndent(blocks[i]) >= MAX_LIST_INDENT)) return this;

    for (const i of items) setListIndent(this.edit(i), listIndent(blocks[i]) + 1);
    this.docChanged = true;
    return this;
  }

  /** Moves the selected list items one level up (Shift+Tab). */
  outdentListItem(): this {
    const range = this.listItemRange();
    if (!range) return this;
    const [fromIdx, toIdx] = range;
    const items = this.listItemIndexes(fromIdx, toIdx);
    if (listIndent(this.doc.blocks[items[0]]) === 0) return this;

    for (const i of items) {
      const indent = listIndent(this.doc.blocks[i]);
      if (indent > 0) setListIndent(this.edit(i), indent - 1);
    }
    this.docChanged = true;
    return this;
  }

  setBlockType(type: string, attrs: Record<string, any> = {}): this {
    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);

    if (fromIdx === -1 || toIdx === -1) return this;

    for (let i = fromIdx; i <= toIdx; i++) {
      // Images, dividers and other blocks without text keep their type, and
      // table cells stay cells.
      const current = this.doc.blocks[i].type;
      if (this.isAtom(current) || isTableCell(current)) continue;
      const block = this.edit(i);
      block.type = type;
      block.attrs = { ...attrs };
      this.docChanged = true;
    }
    return this;
  }

  apply(): EditorState {
    return this.state.apply(this);
  }
}
