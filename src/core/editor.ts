import { BlockNode, DocumentData, EditorSelection, InlineMark } from './model/types.js';
import { EditorState } from './state/state.js';
import { Transaction } from './state/transaction.js';
import { DOMReconciler } from './view/reconciler.js';
import { restoreDOMSelection } from './view/selection.js';
import { InputController } from './view/controller.js';
import { DOMGuard } from './view/dom-guard.js';
import { documentFromJSON, documentToJSON } from '../serializers/json.js';
import { findBlockIndex, getBlockText, sliceBlockContent } from './model/document.js';
import { applyInputRules } from './plugin/input-rules.js';

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

  /** Inserts text as it is, without Markdown shortcuts (used for pasting). */
  insertPlainText(text: string): this {
    this.tr.insertText(text);
    return this;
  }

  insertLineBreak(): this {
    this.tr.insertLineBreak();
    return this;
  }

  insertFragment(blocks: BlockNode[]): this {
    this.tr.insertFragment(blocks);
    return this;
  }

  deleteSelection(): this {
    this.tr.deleteRange();
    return this;
  }

  deleteBackward(): this {
    this.tr.deleteBackward();
    return this;
  }

  deleteForward(): this {
    this.tr.deleteForward();
    return this;
  }

  deleteWordBackward(): this {
    this.tr.deleteWordBackward();
    return this;
  }

  deleteWordForward(): this {
    this.tr.deleteWordForward();
    return this;
  }

  deleteLineBackward(): this {
    this.tr.deleteLineBackward();
    return this;
  }

  deleteLineForward(): this {
    this.tr.deleteLineForward();
    return this;
  }

  splitBlock(type?: string, attrs?: Record<string, any>): this {
    this.tr.splitBlock(type, attrs);
    return this;
  }

  setBlockType(type: string, attrs: Record<string, any> = {}): this {
    this.tr.setBlockType(type, attrs);
    return this;
  }

  /** Checks or unchecks a task item (the one at the caret by default). */
  toggleTaskChecked(blockId?: string): this {
    this.tr.toggleTaskChecked(blockId);
    return this;
  }

  /** Nests the selected list items one level deeper. */
  indentListItem(): this {
    this.tr.indentListItem();
    return this;
  }

  /** Moves the selected list items one level up. */
  outdentListItem(): this {
    this.tr.outdentListItem();
    return this;
  }

  setLink(href: string): this {
    this.tr.setLink(href);
    return this;
  }

  unsetLink(): this {
    this.tr.setLink(null);
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

  toggleStrike(): this {
    return this.toggleMark({ type: 'strike' });
  }

  toggleHighlight(): this {
    return this.toggleMark({ type: 'highlight' });
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
  private guard: DOMGuard;
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
    this.guard = new DOMGuard(this.container, () => this.controller.composing, () => this.repairDOM());
  }

  /** Renders the model and tells the guard that these DOM changes are ours. */
  private render(): void {
    this.reconciler.render(this.state);
    this.guard?.ignorePending();
  }

  chain(): ChainedCommands {
    return new ChainedCommands(this);
  }

  dispatch(tr: Transaction): void {
    this.state = this.state.apply(tr);

    if (tr.docChanged) {
      this.render();
      this.options.onChange?.(this);
    }

    if (tr.selectionChanged || tr.docChanged) {
      restoreDOMSelection(this.container, this.state.selection);
      this.options.onSelectionChange?.(this.state.selection);
    }
  }

  /** Rebuilds the DOM from the document model, undoing any outside change. */
  repairDOM(): void {
    this.reconciler.invalidate();
    this.render();
    restoreDOMSelection(this.container, this.state.selection);
  }

  setSelectionQuietly(selection: EditorSelection): void {
    this.state = this.state.setSelection(selection);
    this.options.onSelectionChange?.(selection);
  }

  undo(): boolean {
    if (!this.state.history.canUndo()) return false;
    this.state = this.state.undo();
    this.render();
    restoreDOMSelection(this.container, this.state.selection);
    this.options.onChange?.(this);
    return true;
  }

  redo(): boolean {
    if (!this.state.history.canRedo()) return false;
    this.state = this.state.redo();
    this.render();
    restoreDOMSelection(this.container, this.state.selection);
    this.options.onChange?.(this);
    return true;
  }

  /** The href shared by all selected text, or null if the selection is not one link. */
  getActiveLink(): string | null {
    const { anchor, head, isCollapsed } = this.state.selection;
    if (isCollapsed) return null;

    const blocks = this.state.doc.blocks;
    let fromIdx = findBlockIndex(this.state.doc, anchor.blockId);
    let toIdx = findBlockIndex(this.state.doc, head.blockId);
    let from = anchor;
    let to = head;
    if (fromIdx > toIdx || (fromIdx === toIdx && anchor.offset > head.offset)) {
      [fromIdx, toIdx, from, to] = [toIdx, fromIdx, head, anchor];
    }
    if (fromIdx === -1 || toIdx === -1) return null;

    let href: string | null = null;
    for (let i = fromIdx; i <= toIdx; i++) {
      const start = i === fromIdx ? from.offset : 0;
      const end = i === toIdx ? to.offset : getBlockText(blocks[i]).length;
      for (const node of sliceBlockContent(blocks[i], start, end)) {
        const link = node.marks?.find((m) => m.type === 'link')?.attrs?.href;
        if (typeof link !== 'string') return null;
        if (href !== null && link !== href) return null;
        href = link;
      }
    }
    return href;
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
    this.render();
    this.options.onChange?.(this);
  }

  focus(): void {
    this.container.focus();
    restoreDOMSelection(this.container, this.state.selection);
  }

  destroy(): void {
    this.guard.disconnect();
    this.controller.destroy();
    this.container.innerHTML = '';
  }
}

export function createLevitEditor(element: HTMLElement, options: Omit<EditorOptions, 'element'> = {}): LevitEditor {
  return new LevitEditor({ ...options, element });
}
