import { BlockNode, DocumentData, EditorSelection, InlineMark } from '../model/types.js';
import { createDocument } from '../model/document.js';
import { cloneDocument, cloneSelection, Transaction } from './transaction.js';
import { HistoryItem, HistoryManager } from './history.js';
import { defaultSchema, type Schema } from '../plugin/plugin.js';

export interface EditorStateConfig {
  doc?: DocumentData;
  selection?: EditorSelection;
  history?: HistoryManager;
  storedMarks?: InlineMark[] | null;
  /** Block and mark types added by plugins. */
  schema?: Schema;
}

export class EditorState {
  public readonly doc: DocumentData;
  public readonly selection: EditorSelection;
  public readonly history: HistoryManager;
  public readonly storedMarks: InlineMark[] | null;
  public readonly schema: Schema;

  constructor(
    doc: DocumentData,
    selection: EditorSelection,
    history: HistoryManager,
    storedMarks: InlineMark[] | null = null,
    schema: Schema = defaultSchema
  ) {
    this.doc = freezeDocument(doc);
    this.selection = selection;
    this.history = history;
    this.storedMarks = storedMarks;
    this.schema = schema;
  }

  static create(config?: EditorStateConfig): EditorState {
    const doc = config?.doc ? cloneDocument(config.doc) : createDocument();
    const firstBlock = doc.blocks[0];
    const selection = config?.selection
      ? cloneSelection(config.selection)
      : {
          anchor: { blockId: firstBlock.id, offset: 0 },
          head: { blockId: firstBlock.id, offset: 0 },
          isCollapsed: true,
        };
    const history = config?.history?.clone() || new HistoryManager();
    return new EditorState(doc, selection, history, config?.storedMarks || null, config?.schema);
  }

  get tr(): Transaction {
    return new Transaction(this);
  }

  setSelection(selection: EditorSelection): EditorState {
    return new EditorState(
      this.doc,
      cloneSelection(selection),
      this.history,
      this.storedMarks,
      this.schema
    );
  }

  apply(tr: Transaction): EditorState {
    let newHistory = this.history;

    // Documents are frozen, so history keeps them as they are, without copies.
    if (tr.docChanged && tr.getMeta('addToHistory') !== false) {
      newHistory = this.history.push({
        doc: this.doc,
        selection: cloneSelection(this.selection),
        timestamp: Date.now(),
      });
    }

    return new EditorState(
      tr.doc,
      tr.selection,
      newHistory,
      tr.storedMarks,
      this.schema
    );
  }

  undo(): EditorState {
    const currentState: HistoryItem = {
      doc: this.doc,
      selection: cloneSelection(this.selection),
      timestamp: Date.now(),
    };

    const result = this.history.popUndo(currentState);
    if (!result) return this;

    return new EditorState(
      result.previous.doc,
      result.previous.selection,
      result.newHistory,
      null,
      this.schema
    );
  }

  redo(): EditorState {
    const currentState: HistoryItem = {
      doc: this.doc,
      selection: cloneSelection(this.selection),
      timestamp: Date.now(),
    };

    const result = this.history.popRedo(currentState);
    if (!result) return this;

    return new EditorState(
      result.next.doc,
      result.next.selection,
      result.newHistory,
      null,
      this.schema
    );
  }
}


/**
 * Freezes a document's list and its blocks, so blocks can be shared between
 * states and history: a change has to copy the block (Transaction.editBlock).
 * Blocks that are already frozen are skipped, so this is quick after an edit.
 */
function freezeDocument(doc: DocumentData): DocumentData {
  for (const block of doc.blocks) {
    if (!Object.isFrozen(block)) freezeBlock(block);
  }
  Object.freeze(doc.blocks);
  return Object.freeze(doc);
}

function freezeBlock(block: BlockNode): void {
  for (const node of block.content) {
    for (const mark of node.marks ?? []) {
      if (mark.attrs) Object.freeze(mark.attrs);
      Object.freeze(mark);
    }
    if (node.marks) Object.freeze(node.marks);
    Object.freeze(node);
  }
  Object.freeze(block.content);
  if (block.attrs) Object.freeze(block.attrs);
  Object.freeze(block);
}
