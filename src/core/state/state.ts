import { DocumentData, EditorSelection, InlineMark } from '../model/types.js';
import { createDocument } from '../model/document.js';
import { cloneDocument, cloneSelection, Transaction } from './transaction.js';
import { HistoryItem, HistoryManager } from './history.js';

export interface EditorStateConfig {
  doc?: DocumentData;
  selection?: EditorSelection;
  history?: HistoryManager;
  storedMarks?: InlineMark[] | null;
}

export class EditorState {
  public readonly doc: DocumentData;
  public readonly selection: EditorSelection;
  public readonly history: HistoryManager;
  public readonly storedMarks: InlineMark[] | null;

  constructor(
    doc: DocumentData,
    selection: EditorSelection,
    history: HistoryManager,
    storedMarks: InlineMark[] | null = null
  ) {
    this.doc = doc;
    this.selection = selection;
    this.history = history;
    this.storedMarks = storedMarks;
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
    return new EditorState(doc, selection, history, config?.storedMarks || null);
  }

  get tr(): Transaction {
    return new Transaction(this);
  }

  setSelection(selection: EditorSelection): EditorState {
    return new EditorState(
      this.doc,
      cloneSelection(selection),
      this.history,
      this.storedMarks
    );
  }

  apply(tr: Transaction): EditorState {
    let newHistory = this.history;

    if (tr.docChanged) {
      newHistory = this.history.push({
        doc: cloneDocument(this.doc),
        selection: cloneSelection(this.selection),
        timestamp: Date.now(),
      });
    }

    return new EditorState(
      tr.doc,
      tr.selection,
      newHistory,
      tr.storedMarks
    );
  }

  undo(): EditorState {
    const currentState: HistoryItem = {
      doc: cloneDocument(this.doc),
      selection: cloneSelection(this.selection),
      timestamp: Date.now(),
    };

    const result = this.history.popUndo(currentState);
    if (!result) return this;

    return new EditorState(
      result.previous.doc,
      result.previous.selection,
      result.newHistory,
      null
    );
  }

  redo(): EditorState {
    const currentState: HistoryItem = {
      doc: cloneDocument(this.doc),
      selection: cloneSelection(this.selection),
      timestamp: Date.now(),
    };

    const result = this.history.popRedo(currentState);
    if (!result) return this;

    return new EditorState(
      result.next.doc,
      result.next.selection,
      result.newHistory,
      null
    );
  }
}

