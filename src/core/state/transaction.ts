import {
  DocumentData,
  EditorPosition,
  EditorSelection,
  InlineMark,
  InlineNode,
} from '../model/types';
import {
  createBlock,
  findBlockIndex,
  getBlockText,
  mergeBlockContent,
  normalizeInlineNodes,
  splitBlockContent,
} from '../model/document';
import { EditorState } from './state';

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

  deleteBackward(): this {
    if (!this.selection.isCollapsed) {
      return this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.doc.blocks[blockIdx];
    const offset = this.selection.anchor.offset;

    if (offset > 0) {
      // Delete 1 character backward
      const [left, right] = splitBlockContent(block, offset);
      const [kept] = splitBlockContent({ ...block, content: left }, offset - 1);
      block.content = mergeBlockContent(kept, right);

      this.selection = {
        anchor: { blockId: block.id, offset: offset - 1 },
        head: { blockId: block.id, offset: offset - 1 },
        isCollapsed: true,
      };
      this.docChanged = true;
      this.selectionChanged = true;
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

  splitBlock(type = 'paragraph', attrs: Record<string, any> = {}): this {
    if (!this.selection.isCollapsed) {
      this.deleteRange();
    }

    const blockIdx = findBlockIndex(this.doc, this.selection.anchor.blockId);
    if (blockIdx === -1) return this;

    const block = this.doc.blocks[blockIdx];
    const offset = this.selection.anchor.offset;

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
