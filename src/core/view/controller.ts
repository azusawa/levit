import { LevitEditor } from '../editor';
import { domSelectionToEditorSelection } from './selection';

export class InputController {
  private editor: LevitEditor;
  private container: HTMLElement;
  private isComposing = false;
  private boundBeforeInput: (e: InputEvent) => void;
  private boundKeyDown: (e: KeyboardEvent) => void;
  private boundCompositionStart: (e: CompositionEvent) => void;
  private boundCompositionEnd: (e: CompositionEvent) => void;
  private boundSelectionChange: () => void;

  constructor(editor: LevitEditor, container: HTMLElement) {
    this.editor = editor;
    this.container = container;

    this.boundBeforeInput = this.handleBeforeInput.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundCompositionStart = this.handleCompositionStart.bind(this);
    this.boundCompositionEnd = this.handleCompositionEnd.bind(this);
    this.boundSelectionChange = this.handleSelectionChange.bind(this);

    this.attach();
  }

  private attach(): void {
    this.container.addEventListener('beforeinput', this.boundBeforeInput as any);
    this.container.addEventListener('keydown', this.boundKeyDown);
    this.container.addEventListener('compositionstart', this.boundCompositionStart);
    this.container.addEventListener('compositionend', this.boundCompositionEnd);
    document.addEventListener('selectionchange', this.boundSelectionChange);
  }

  destroy(): void {
    this.container.removeEventListener('beforeinput', this.boundBeforeInput as any);
    this.container.removeEventListener('keydown', this.boundKeyDown);
    this.container.removeEventListener('compositionstart', this.boundCompositionStart);
    this.container.removeEventListener('compositionend', this.boundCompositionEnd);
    document.removeEventListener('selectionchange', this.boundSelectionChange);
  }

  private handleCompositionStart(): void {
    this.isComposing = true;
  }

  private handleCompositionEnd(e: CompositionEvent): void {
    this.isComposing = false;
    // When composition finishes, insert the composed text cleanly
    if (e.data) {
      this.editor.chain().insertText(e.data).run();
    }
  }

  private handleBeforeInput(e: InputEvent): void {
    if (this.isComposing) return;
    this.syncSelectionFromDOM();

    if (e.inputType === 'insertText' && e.data) {
      e.preventDefault();
      this.editor.chain().insertText(e.data).run();
    } else if (e.inputType === 'deleteContentBackward') {
      e.preventDefault();
      this.editor.chain().deleteBackward().run();
    } else if (e.inputType === 'insertParagraph') {
      e.preventDefault();
      this.editor.chain().splitBlock().run();
    }
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.isComposing) return;
    this.syncSelectionFromDOM();

    const isMod = e.metaKey || e.ctrlKey;

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

    if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
      e.preventDefault();
      this.editor.chain().splitBlock().run();
      return;
    }

    if (e.key === 'Backspace' && !e.defaultPrevented) {
      e.preventDefault();
      this.editor.chain().deleteBackward().run();
      return;
    }
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

