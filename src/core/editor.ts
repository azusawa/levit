import { DocumentData, EditorSelection, InlineMark } from './model/types';
import { EditorState } from './state/state';
import { Transaction } from './state/transaction';
import { DOMReconciler } from './view/reconciler';
import { restoreDOMSelection } from './view/selection';
import { InputController } from './view/controller';
import { documentFromJSON, documentToJSON } from '../serializers/json';
import { getBlockText } from './model/document';
import { applyInputRules } from './plugin/input-rules';

export interface EditorOptions {
  element: HTMLElement;
  initialContent?: DocumentData | any;
  placeholder?: string;
  onChange?: (editor: LevitEditor) => void;
  onSelectionChange?: (selection: EditorSelection) => void;
}

export class ChainedCommands {
  private editor: LevitEditor;
  private tr: Transaction;

  constructor(editor: LevitEditor) {
    this.editor = editor;
    this.tr = editor.state.tr;
  }

  insertText(text: string): this {
    this.tr.insertText(text);
    applyInputRules(this.tr);
    return this;
  }

  deleteBackward(): this {
    this.tr.deleteBackward();
    return this;
  }

  splitBlock(type = 'paragraph', attrs: Record<string, any> = {}): this {
    this.tr.splitBlock(type, attrs);
    return this;
  }

  toggleMark(mark: InlineMark): this {
    this.tr.toggleMark(mark);
    return this;
  }

  toggleBold(): this {
    return this.toggleMark({ type: 'bold' });
  }

  toggleItalic(): this {
    return this.toggleMark({ type: 'italic' });
  }

  toggleUnderline(): this {
    return this.toggleMark({ type: 'underline' });
  }

  setHeading(level = 1): this {
    this.tr.setBlockType('heading', { level });
    return this;
  }

  setParagraph(): this {
    this.tr.setBlockType('paragraph', {});
    return this;
  }

  run(): boolean {
    this.editor.dispatch(this.tr);
    return true;
  }
}

export class LevitEditor {
  public state: EditorState;
  public readonly container: HTMLElement;
  private reconciler: DOMReconciler;
  private controller: InputController;
  private options: EditorOptions;

  constructor(options: EditorOptions) {
    this.options = options;
    this.container = options.element;

    // Configure container
    this.container.classList.add('levit-editor-root');
    this.container.contentEditable = 'true';
    this.container.spellcheck = false;

    if (options.placeholder) {
      this.container.setAttribute('data-placeholder', options.placeholder);
    }

    // Initialize document
    const initialDoc = options.initialContent
      ? documentFromJSON(options.initialContent)
      : undefined;

    this.state = EditorState.create({ doc: initialDoc });
    this.reconciler = new DOMReconciler(this.container);
    this.controller = new InputController(this, this.container);

    // Initial render
    this.reconciler.render(this.state);
  }

  chain(): ChainedCommands {
    return new ChainedCommands(this);
  }

  dispatch(tr: Transaction): void {
    this.state = this.state.apply(tr);

    if (tr.docChanged) {
      this.reconciler.render(this.state);
      this.options.onChange?.(this);
    }

    if (tr.selectionChanged || tr.docChanged) {
      restoreDOMSelection(this.container, this.state.selection);
      this.options.onSelectionChange?.(this.state.selection);
    }
  }

  setSelectionQuietly(selection: EditorSelection): void {
    this.state = this.state.setSelection(selection);
    this.options.onSelectionChange?.(selection);
  }

  undo(): boolean {
    if (!this.state.history.canUndo()) return false;
    this.state = this.state.undo();
    this.reconciler.render(this.state);
    restoreDOMSelection(this.container, this.state.selection);
    this.options.onChange?.(this);
    return true;
  }

  redo(): boolean {
    if (!this.state.history.canRedo()) return false;
    this.state = this.state.redo();
    this.reconciler.render(this.state);
    restoreDOMSelection(this.container, this.state.selection);
    this.options.onChange?.(this);
    return true;
  }

  getText(): string {
    return this.state.doc.blocks
      .map((block) => getBlockText(block))
      .join('\n');
  }

  getJSON(): DocumentData {
    return documentToJSON(this.state.doc);
  }

  setJSON(json: any): void {
    const doc = documentFromJSON(json);
    this.state = EditorState.create({ doc });
    this.reconciler.render(this.state);
    this.options.onChange?.(this);
  }

  focus(): void {
    this.container.focus();
    restoreDOMSelection(this.container, this.state.selection);
  }

  destroy(): void {
    this.controller.destroy();
    this.container.innerHTML = '';
  }
}

export function createLevitEditor(element: HTMLElement, options: Omit<EditorOptions, 'element'> = {}): LevitEditor {
  return new LevitEditor({ ...options, element });
}
