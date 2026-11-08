import { BlockNode, DocumentData, EditorSelection, InlineMark } from './model/types.js';
import { EditorState } from './state/state.js';
import { Transaction } from './state/transaction.js';
import { DOMReconciler } from './view/reconciler.js';
import { restoreDOMSelection } from './view/selection.js';
import { InputController } from './view/controller.js';
import { DOMGuard } from './view/dom-guard.js';
import { documentFromJSON, documentToJSON } from '../serializers/json.js';
import { findBlockIndex, getBlockText, sliceBlockContent } from './model/document.js';
import { applyInputRules, defaultInputRules } from './plugin/input-rules.js';
import { Schema, type LevitPlugin } from './plugin/plugin.js';
import { documentToHTML } from '../serializers/html.js';
import { documentToMarkdown } from '../serializers/markdown.js';
import { EventEmitter, type EditorEventHandler, type EditorEventName } from './events.js';

export interface EditorOptions {
  element: HTMLElement;
  initialContent?: DocumentData | any;
  placeholder?: string;
  onChange?: (editor: LevitEditor) => void;
  onSelectionChange?: (selection: EditorSelection) => void;
  /**
   * Uploads an image file and returns its URL. When set, pasted and dropped
   * image files are uploaded and inserted; without it they are ignored.
   */
  uploadImage?: (file: File) => Promise<string>;
  /** Called when something fails in the background, such as an image upload. */
  onError?: (error: unknown) => void;
  /**
   * Highlights code blocks that have a language. Returns HTML for the code,
   * for example from highlight.js or Shiki. Only <span> elements with class
   * and style are kept, and the text must stay the same.
   */
  highlightCode?: (code: string, language: string) => string;
  /** Plugins that add blocks, marks, commands, keys and shortcuts. */
  plugins?: LevitPlugin[];
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
    applyInputRules(this.tr, [...this.editor.schema.inputRules, ...defaultInputRules]);
    return this;
  }

  /** Runs a plugin command by name as part of this chain. */
  exec(name: string, ...args: any[]): this {
    const command = this.editor.schema.commands.get(name);
    if (!command) throw new Error(`Unknown command "${name}"`);
    command(...args)(this.tr, this.editor);
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

  /** Turns the selected blocks into code, optionally with a language. */
  setCodeBlock(language?: string): this {
    this.tr.setBlockType('code_block', {});
    if (language) this.tr.setCodeLanguage(language);
    return this;
  }

  /** Sets the language of the selected code block, or of the one with blockId. */
  setCodeLanguage(language: string, blockId?: string): this {
    this.tr.setCodeLanguage(language, blockId);
    return this;
  }

  selectAll(): this {
    this.tr.selectAll();
    return this;
  }

  /** Inserts a divider (horizontal rule) at the caret. */
  insertHorizontalRule(): this {
    this.tr.insertHorizontalRule();
    return this;
  }

  /** Inserts an image at the caret. Unsafe URLs are ignored. */
  insertImage(image: { src: string; alt?: string }): this {
    this.tr.insertImage(image);
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
  /** Block and mark types, commands and keys added by plugins. */
  public readonly schema: Schema;
  /** Plugin commands, run at once: editor.commands.name(...args). */
  public readonly commands: Record<string, (...args: any[]) => boolean>;
  private cleanups: (() => void)[] = [];
  private reconciler: DOMReconciler;
  private controller: InputController;
  private guard: DOMGuard;
  private options: EditorOptions;
  private events: EventEmitter;
  private domListeners: [string, EventListener][] = [];

  constructor(options: EditorOptions) {
    this.options = options;
    this.container = options.element;
    this.events = new EventEmitter((error) => this.reportError(error));
    this.schema = new Schema(options.plugins ?? []);
    this.commands = {};
    for (const [name, command] of this.schema.commands) {
      this.commands[name] = (...args) => {
        const tr = this.state.tr;
        if (command(...args)(tr, this) === false) return false;
        this.dispatch(tr);
        return true;
      };
    }

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

    this.state = EditorState.create({ doc: initialDoc, schema: this.schema });
    this.reconciler = new DOMReconciler(this.container, { highlightCode: options.highlightCode, schema: this.schema });
    this.controller = new InputController(this, this.container);

    // Initial render
    this.reconciler.render(this.state);
    this.guard = new DOMGuard(this.container, () => this.controller.composing, () => this.repairDOM());

    for (const name of ['focus', 'blur'] as const) {
      const listener = (event: Event) => this.events.emit(name, { editor: this, event: event as FocusEvent });
      this.container.addEventListener(name, listener);
      this.domListeners.push([name, listener]);
    }

    for (const plugin of this.schema.plugins) {
      const cleanup = plugin.setup?.(this);
      if (typeof cleanup === 'function') this.cleanups.push(cleanup);
    }
  }

  /** Listens to an editor event. Returns a function that stops listening. */
  on<K extends EditorEventName>(name: K, handler: EditorEventHandler<K>): () => void {
    return this.events.on(name, handler);
  }

  off<K extends EditorEventName>(name: K, handler: EditorEventHandler<K>): void {
    this.events.off(name, handler);
  }

  /** Sends an error to onError, or to the console when there is none. */
  private reportError(error: unknown): void {
    if (this.options.onError) this.options.onError(error);
    else console.error(error);
  }

  /** Tells listeners that the document changed. */
  private notifyUpdate(transaction?: Transaction): void {
    this.events.emit('update', { editor: this, transaction });
    this.options.onChange?.(this);
  }

  private notifySelection(): void {
    this.events.emit('selectionUpdate', { editor: this, selection: this.state.selection });
    this.options.onSelectionChange?.(this.state.selection);
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
    }
    if (tr.selectionChanged || tr.docChanged) {
      restoreDOMSelection(this.container, this.state.selection);
    }

    this.events.emit('transaction', { editor: this, transaction: tr });
    if (tr.docChanged) this.notifyUpdate(tr);
    if (tr.selectionChanged || tr.docChanged) this.notifySelection();
  }

  /** True when an uploadImage option was given. */
  get canUploadImages(): boolean {
    return typeof this.options.uploadImage === 'function';
  }

  /**
   * Uploads image files one by one with the uploadImage option and inserts
   * each at the caret as it finishes. Failures go to onError.
   */
  async uploadImages(files: File[]): Promise<void> {
    const upload = this.options.uploadImage;
    if (!upload) return;
    for (const file of files.filter((f) => f.type.startsWith('image/'))) {
      try {
        const src = await upload(file);
        this.chain().insertImage({ src, alt: file.name }).run();
      } catch (error) {
        this.reportError(error);
      }
    }
  }

  /** Rebuilds the DOM from the document model, undoing any outside change. */
  repairDOM(): void {
    this.reconciler.invalidate();
    this.render();
    restoreDOMSelection(this.container, this.state.selection);
  }

  setSelectionQuietly(selection: EditorSelection): void {
    if (sameSelection(selection, this.state.selection)) return;
    this.state = this.state.setSelection(selection);
    this.notifySelection();
  }

  undo(): boolean {
    if (!this.state.history.canUndo()) return false;
    this.state = this.state.undo();
    this.render();
    restoreDOMSelection(this.container, this.state.selection);
    this.notifyUpdate();
    this.notifySelection();
    return true;
  }

  redo(): boolean {
    if (!this.state.history.canRedo()) return false;
    this.state = this.state.redo();
    this.render();
    restoreDOMSelection(this.container, this.state.selection);
    this.notifyUpdate();
    this.notifySelection();
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

  /** The document as HTML, including plugin blocks and marks. */
  getHTML(): string {
    return documentToHTML(this.state.doc, { plugins: this.schema.plugins });
  }

  /** The document as Markdown, including plugin blocks and marks. */
  getMarkdown(): string {
    return documentToMarkdown(this.state.doc, { plugins: this.schema.plugins });
  }

  setJSON(json: any): void {
    const doc = documentFromJSON(json);
    this.state = EditorState.create({ doc, schema: this.schema });
    this.render();
    this.notifyUpdate();
  }

  focus(): void {
    this.container.focus();
    restoreDOMSelection(this.container, this.state.selection);
  }

  destroy(): void {
    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch (error) {
        this.reportError(error);
      }
    }
    this.events.emit('destroy', { editor: this });
    this.events.clear();
    for (const [name, listener] of this.domListeners) this.container.removeEventListener(name, listener);
    this.guard.disconnect();
    this.controller.destroy();
    this.container.innerHTML = '';
  }
}

function sameSelection(a: EditorSelection, b: EditorSelection): boolean {
  return (
    a.anchor.blockId === b.anchor.blockId &&
    a.anchor.offset === b.anchor.offset &&
    a.head.blockId === b.head.blockId &&
    a.head.offset === b.head.offset
  );
}

export function createLevitEditor(element: HTMLElement, options: Omit<EditorOptions, 'element'> = {}): LevitEditor {
  return new LevitEditor({ ...options, element });
}
