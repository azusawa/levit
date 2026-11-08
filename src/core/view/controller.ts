import { LevitEditor } from '../editor.js';
import { findBlockIndex, sliceDocument } from '../model/document.js';
import { readClipboard, writeClipboard } from './clipboard.js';
import {
  domRangeToEditorSelection,
  domSelectionToEditorSelection,
  positionFromPoint,
} from './selection.js';

type Chain = ReturnType<LevitEditor['chain']>;

/** beforeinput types that map straight to one editor command. */
const INPUT_COMMANDS: Record<string, (chain: Chain) => Chain> = {
  insertParagraph: (c) => c.splitBlock(),
  insertLineBreak: (c) => c.insertLineBreak(),
  deleteContentBackward: (c) => c.deleteBackward(),
  deleteContentForward: (c) => c.deleteForward(),
  deleteWordBackward: (c) => c.deleteWordBackward(),
  deleteWordForward: (c) => c.deleteWordForward(),
  deleteSoftLineBackward: (c) => c.deleteLineBackward(),
  deleteHardLineBackward: (c) => c.deleteLineBackward(),
  deleteSoftLineForward: (c) => c.deleteLineForward(),
  deleteHardLineForward: (c) => c.deleteLineForward(),
  deleteContent: (c) => c.deleteSelection(),
  deleteByCut: (c) => c.deleteSelection(),
  formatBold: (c) => c.toggleBold(),
  formatItalic: (c) => c.toggleItalic(),
  formatUnderline: (c) => c.toggleUnderline(),
  formatStrikeThrough: (c) => c.toggleStrike(),
};

/** IME input. The browser edits the DOM; the result is applied on compositionend. */
const COMPOSITION_INPUT = new Set([
  'insertCompositionText',
  'deleteCompositionText',
  'insertFromComposition',
  'deleteByComposition',
]);

/**
 * Turns browser input into editor commands. Every edit is cancelled and
 * replayed on the document model, so the DOM never drifts away from it.
 */
export class InputController {
  private editor: LevitEditor;
  private container: HTMLElement;
  private isComposing = false;
  private isDraggingFromEditor = false;
  private listeners: [EventTarget, string, EventListener, boolean?][] = [];

  constructor(editor: LevitEditor, container: HTMLElement) {
    this.editor = editor;
    this.container = container;
    this.attach();
  }

  private on<E extends Event>(target: EventTarget, type: string, handler: (e: E) => void, capture?: boolean) {
    const listener = handler.bind(this) as EventListener;
    target.addEventListener(type, listener, capture);
    this.listeners.push([target, type, listener, capture]);
  }

  private attach(): void {
    this.on(this.container, 'beforeinput', this.handleBeforeInput);
    this.on(this.container, 'keydown', this.handleKeyDown);
    this.on(this.container, 'compositionstart', this.handleCompositionStart);
    this.on(this.container, 'compositionend', this.handleCompositionEnd);
    this.on(this.container, 'paste', this.handlePaste);
    this.on(this.container, 'copy', this.handleCopy);
    this.on(this.container, 'cut', this.handleCut);
    this.on(this.container, 'dragstart', this.handleDragStart);
    this.on(this.container, 'dragend', this.handleDragEnd);
    this.on(this.container, 'drop', this.handleDrop);
    this.on(document, 'selectionchange', this.handleSelectionChange);
  }

  destroy(): void {
    for (const [target, type, listener, capture] of this.listeners) {
      target.removeEventListener(type, listener, capture);
    }
    this.listeners = [];
  }

  get composing(): boolean {
    return this.isComposing;
  }

  private handleCompositionStart(): void {
    this.isComposing = true;
  }

  private handleCompositionEnd(e: CompositionEvent): void {
    this.isComposing = false;
    // When composition finishes, insert the composed text cleanly
    if (e.data) {
      this.editor.chain().insertText(e.data).run();
    } else {
      // Cancelled composition: throw away whatever the IME left in the DOM.
      this.editor.repairDOM();
    }
  }

  private handleBeforeInput(e: InputEvent): void {
    if (this.isComposing || COMPOSITION_INPUT.has(e.inputType)) return;
    // Nothing else may change the DOM behind the model's back.
    e.preventDefault();
    this.syncSelectionFromDOM();

    const type = e.inputType;
    const command = INPUT_COMMANDS[type];
    if (command) {
      command(this.editor.chain()).run();
      return;
    }

    switch (type) {
      case 'insertText': {
        const text = e.data || e.dataTransfer?.getData('text/plain');
        if (text) this.editor.chain().insertText(text).run();
        return;
      }
      case 'insertReplacementText': {
        // Autocorrect / spelling: replace the range the browser targets.
        const target = e.getTargetRanges?.()[0];
        const sel = target && domRangeToEditorSelection(this.container, target);
        if (sel) this.editor.setSelectionQuietly(sel);
        const text = e.data || e.dataTransfer?.getData('text/plain');
        if (text) this.editor.chain().insertPlainText(text).run();
        return;
      }
      case 'insertFromPaste':
      case 'insertFromPasteAsQuotation':
      case 'insertFromDrop':
      case 'insertFromYank':
        // Usually handled by the paste/drop events; this covers browsers that skip them.
        if (e.dataTransfer) this.insertData(e.dataTransfer);
        return;
      case 'historyUndo':
        this.editor.undo();
        return;
      case 'historyRedo':
        this.editor.redo();
        return;
      default:
        // Unsupported (lists via execCommand, colors, alignment, deleteByDrag...).
        return;
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isComposing) return;
    this.syncSelectionFromDOM();

    const isMod = e.metaKey || e.ctrlKey;
    const hasModifier = isMod || e.altKey;

    if (isMod && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        this.editor.redo();
      } else {
        this.editor.undo();
      }
      return;
    }

    if (isMod && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      this.editor.redo();
      return;
    }

    if (isMod && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      this.editor.chain().toggleBold().run();
      return;
    }

    if (isMod && e.key.toLowerCase() === 'i') {
      e.preventDefault();
      this.editor.chain().toggleItalic().run();
      return;
    }

    if (isMod && e.key.toLowerCase() === 'u') {
      e.preventDefault();
      this.editor.chain().toggleUnderline().run();
      return;
    }

    if (e.key === 'Enter' && !e.defaultPrevented) {
      e.preventDefault();
      // Browsers disagree on what Shift+Enter means (WebKit sends insertParagraph).
      if (e.shiftKey) this.editor.chain().insertLineBreak().run();
      else this.editor.chain().splitBlock().run();
      return;
    }

    // With a modifier, Backspace/Delete delete a word or line. The browser
    // reports which one through beforeinput, so leave those to it.
    if (e.key === 'Backspace' && !hasModifier && !e.defaultPrevented) {
      e.preventDefault();
      this.editor.chain().deleteBackward().run();
      return;
    }

    if (e.key === 'Delete' && !hasModifier && !e.defaultPrevented) {
      e.preventDefault();
      this.editor.chain().deleteForward().run();
      return;
    }
  }

  private handlePaste(e: ClipboardEvent): void {
    if (this.isComposing) return;
    e.preventDefault();
    this.syncSelectionFromDOM();
    if (e.clipboardData) this.insertData(e.clipboardData);
  }

  private handleCopy(e: ClipboardEvent): void {
    this.writeSelection(e);
  }

  private handleCut(e: ClipboardEvent): void {
    if (this.writeSelection(e)) this.editor.chain().deleteSelection().run();
  }

  /** Puts the selection on the clipboard in Levit's own HTML. */
  private writeSelection(e: ClipboardEvent): boolean {
    this.syncSelectionFromDOM();
    const blocks = sliceDocument(this.editor.state.doc, this.editor.state.selection);
    if (blocks.length === 0 || !e.clipboardData) return false;
    e.preventDefault();
    writeClipboard(e.clipboardData, blocks);
    return true;
  }

  private handleDragStart(): void {
    this.isDraggingFromEditor = true;
  }

  private handleDragEnd(): void {
    this.isDraggingFromEditor = false;
  }

  private handleDrop(e: DragEvent): void {
    // The browser would move or insert DOM nodes itself, so always cancel.
    e.preventDefault();
    if (this.isDraggingFromEditor) {
      // Moving text inside the editor is not supported yet.
      this.isDraggingFromEditor = false;
      return;
    }
    const data = e.dataTransfer;
    if (!data || data.types.includes('Files')) return;

    const pos = positionFromPoint(this.container, e.clientX, e.clientY);
    if (pos) this.editor.setSelectionQuietly({ anchor: pos, head: pos, isCollapsed: true });
    else this.syncSelectionFromDOM();
    this.insertData(data);
  }

  /** Inserts pasted or dropped data at the selection as one undo step. */
  private insertData(data: DataTransfer): void {
    const { doc, selection } = this.editor.state;
    const block = doc.blocks[findBlockIndex(doc, selection.anchor.blockId)];
    const content = readClipboard(data, block?.type === 'code_block');
    if (!content) return;
    if ('text' in content) this.editor.chain().insertPlainText(content.text).run();
    else this.editor.chain().insertFragment(content.blocks).run();
  }

  private handleSelectionChange(): void {
    if (this.isComposing) return;
    this.syncSelectionFromDOM();
  }

  // selectionchange fires asynchronously, so a key pressed right after the caret
  // moves can arrive before it. Read the DOM selection before every edit instead.
  private syncSelectionFromDOM(): void {
    const newSel = domSelectionToEditorSelection(this.container);
    if (newSel) {
      this.editor.setSelectionQuietly(newSel);
    }
  }
}
