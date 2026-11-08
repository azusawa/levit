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
  getBlockText,
  isListItem,
  mergeBlockContent,
  normalizeInlineNodes,
  sliceBlockContent,
  splitBlockContent,
} from '../model/document.js';
import { sanitizeHref } from '../model/sanitize.js';
import {
  lineEndOffset,
  lineStartOffset,
  nextCharOffset,
  nextWordOffset,
  previousCharOffset,
  previousWordOffset,
} from '../model/text.js';
import { BlockNode } from '../model/types.js';
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

  constructor(state: EditorState) {
    this.state = state;
    this.doc = cloneDocument(state.doc);
    this.selection = cloneSelection(state.selection);
    this.storedMarks = state.storedMarks ? [...state.storedMarks] : null;
  }

  setSelection(selection: EditorSelection): this {
    this.selection = cloneSelection(selection);
    this.selectionChanged = true;
    return this;
  }

  private normalizeSelectionOrder(): { from: EditorPosition; to: EditorPosition } {
    const { anchor, head } = this.selection;
    if (anchor.blockId === head.blockId) {
      if (anchor.offset <= head.offset) {
        return { from: { ...anchor }, to: { ...head } };
      } else {
        return { from: { ...head }, to: { ...anchor } };
      }
    }

    const anchorIdx = findBlockIndex(this.doc, anchor.blockId);
    const headIdx = findBlockIndex(this.doc, head.blockId);

    if (anchorIdx <= headIdx) {
      return { from: { ...anchor }, to: { ...head } };
    } else {
      return { from: { ...head }, to: { ...anchor } };
    }
  }

  deleteRange(): this {
    if (this.selection.isCollapsed) return this;

    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);

    if (fromIdx === -1 || toIdx === -1) return this;

    if (fromIdx === toIdx) {
      const block = this.doc.blocks[fromIdx];
      const [left] = splitBlockContent(block, from.offset);
      const [, right] = splitBlockContent(block, to.offset);
      block.content = mergeBlockContent(left, right);
    } else {
      const startBlock = this.doc.blocks[fromIdx];
      const endBlock = this.doc.blocks[toIdx];

      const [startLeft] = splitBlockContent(startBlock, from.offset);
      const [, endRight] = splitBlockContent(endBlock, to.offset);

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

  insertText(text: string): this {
    if (!text) return this;

    if (!this.selection.isCollapsed) {
      this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.doc.blocks[blockIdx];
    const offset = this.selection.anchor.offset;

    const [left, right] = splitBlockContent(block, offset);

    // Determine marks for new text: storedMarks if set, else mark at insertion point
    let marks: InlineMark[] = [];
    if (this.storedMarks) {
      marks = [...this.storedMarks];
    } else if (left.length > 0 && left[left.length - 1].text) {
      marks = left[left.length - 1].marks ? [...left[left.length - 1].marks!] : [];
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
    const block = this.doc.blocks[blockIdx];
    if (start >= end) return this;
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

    if (offset > 0) {
      return this.deleteInBlock(blockIdx, target(getBlockText(block), offset), offset);
    }

    // Offset is 0 in a list item: leave the list, keep the text
    if (isListItem(block.type)) {
      block.type = 'paragraph';
      block.attrs = {};
      this.docChanged = true;
      return this;
    }

    // Offset is 0: merge with previous block if exists
    if (blockIdx > 0) {
      const prevBlock = this.doc.blocks[blockIdx - 1];
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
      block.type = 'paragraph';
      block.attrs = {};
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

    if (offset < text.length) {
      return this.deleteInBlock(blockIdx, offset, target(text, offset));
    }

    const next = this.doc.blocks[blockIdx + 1];
    if (!next) return this;
    block.content = mergeBlockContent(block.content, next.content);
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
  insertFragment(fragment: BlockNode[]): this {
    if (fragment.length === 0) return this;

    if (!this.selection.isCollapsed) {
      this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.doc.blocks[blockIdx];
    const offset = this.selection.anchor.offset;
    const [left, right] = splitBlockContent(block, offset);
    const pasted = fragment.map((b) =>
      createBlock(b.type, { ...b.attrs }, b.content.map((c) => ({ text: c.text, marks: [...(c.marks ?? [])] })))
    );

    if (pasted.length === 1) {
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

    const first = pasted[0];
    const last = pasted[pasted.length - 1];
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

    const block = this.doc.blocks[blockIdx];
    const offset = this.selection.anchor.offset;

    if (type === undefined && isListItem(block.type)) {
      if (getBlockText(block) === '') {
        block.type = 'paragraph';
        block.attrs = {};
        this.docChanged = true;
        return this;
      }
      type = block.type;
      attrs = { ...block.attrs };
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
      const b = this.doc.blocks[i];
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
      const b = this.doc.blocks[i];
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

  setBlockType(type: string, attrs: Record<string, any> = {}): this {
    const { from, to } = this.normalizeSelectionOrder();
    const fromIdx = findBlockIndex(this.doc, from.blockId);
    const toIdx = findBlockIndex(this.doc, to.blockId);

    if (fromIdx === -1 || toIdx === -1) return this;

    for (let i = fromIdx; i <= toIdx; i++) {
      this.doc.blocks[i].type = type;
      this.doc.blocks[i].attrs = { ...attrs };
    }

    this.docChanged = true;
    return this;
  }

  apply(): EditorState {
    return this.state.apply(this);
  }
}
