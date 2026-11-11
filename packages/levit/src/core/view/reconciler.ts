import { BlockNode, InlineMark, InlineNode } from '../model/types.js';
import { EditorState } from '../state/state.js';
import { normalizeCodeLanguage, normalizeHeadingLevel, sanitizeHref, sanitizeImageSrc } from '../model/sanitize.js';
import { isListItem, listIndent } from '../model/document.js';
import { isTableCell, tableAtIndex } from '../model/table.js';
import { defaultSchema, type Schema } from '../plugin/plugin.js';
import { en, format, type LevitMessages } from '../../i18n/messages.js';

export interface ReconcilerOptions {
  highlightCode?: (code: string, language: string) => string;
  /** Block and mark types added by plugins. */
  schema?: Schema;
  messages?: LevitMessages;
}

export class DOMReconciler {
  private container: HTMLElement;
  private options: ReconcilerOptions;
  private renderedSnapshots = new Map<string, string>();

  private schema: Schema;
  private messages: LevitMessages;

  constructor(container: HTMLElement, options: ReconcilerOptions = {}) {
    this.container = container;
    this.options = options;
    this.schema = options.schema ?? defaultSchema;
    this.messages = options.messages ?? en;
  }

  /** Forgets what was rendered, so the next render rebuilds every block. */
  invalidate(): void {
    this.renderedSnapshots.clear();
    this.lastBlocks = null;
  }

  /** The blocks of the last render and their elements, for the fast path. */
  private lastBlocks: readonly BlockNode[] | null = null;
  private elements = new Map<string, HTMLElement>();

  render(state: EditorState): void {
    // A code language label with the keyboard focus is drawn anew with its
    // block; the focus moves to the new one instead of falling out of the editor.
    const active = this.container.ownerDocument.activeElement;
    const labelOf =
      active?.classList.contains('levit-code-language') && this.container.contains(active)
        ? active.closest('[data-block-id]')?.getAttribute('data-block-id')
        : null;
    if (!this.renderChanged(state.doc.blocks)) this.renderAll(state.doc.blocks);
    this.lastBlocks = state.doc.blocks;
    if (labelOf && !active!.isConnected) {
      const label = this.container.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(labelOf)}"] .levit-code-language`);
      label?.focus({ preventScroll: true });
    }
  }

  /** How many elements the last full render put directly in the container. */
  private topCount = 0;
  /** The table each table element was drawn for. */
  private tableKeys = new WeakMap<HTMLElement, string>();

  /**
   * The fast path for the usual edit: same blocks in the same order, a few of
   * them changed. Blocks are immutable, so an unchanged block is the same
   * object, and only changed ones are looked at. Returns false when the full
   * render is needed.
   */
  private renderChanged(blocks: readonly BlockNode[]): boolean {
    const last = this.lastBlocks;
    // Anything else in the container (a node an extension put in place of a
    // block) changes one of these counts, and the full render cleans it up.
    const { childNodes, children } = this.container;
    if (!last || last.length !== blocks.length || childNodes.length !== this.topCount || children.length !== this.topCount) return false;
    const changed: number[] = [];
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i] === last[i]) continue;
      if (blocks[i].id !== last[i].id) return false;
      // A cell that moved to another row or table changes the table's shape.
      if ((isTableCell(blocks[i].type) || isTableCell(last[i].type)) && !sameCellPlace(blocks[i], last[i])) return false;
      changed.push(i);
    }
    let renumber = false;
    for (const i of changed) {
      const block = blocks[i];
      const el = this.elements.get(block.id);
      if (!el || !this.isPlaced(el, block) || el.tagName.toLowerCase() !== this.getBlockTagName(block)) return false;
      const snapshot = this.computeBlockSnapshot(block);
      if (this.renderedSnapshots.get(block.id) !== snapshot) {
        this.applyBlockClasses(el, block);
        this.updateBlockContent(el, block);
        this.renderedSnapshots.set(block.id, snapshot);
      }
      if (last[i].type !== block.type || listIndent(last[i]) !== listIndent(block)) renumber = true;
    }
    if (renumber) this.updateListNumbers(blocks.map((b) => [b, this.elements.get(b.id)!]));
    return true;
  }

  /** True when a block's element is where the last full render put it. */
  private isPlaced(el: HTMLElement, block: BlockNode): boolean {
    if (!isTableCell(block.type)) return el.parentNode === this.container;
    // td > tr > tbody > table > div.levit-table > container
    return el.parentElement?.parentElement?.parentElement?.parentElement?.parentNode === this.container;
  }

  /** Block elements where the last render put them: in the container, or in a table's rows. */
  private placedElements(): Map<string, HTMLElement> {
    const found = new Map<string, HTMLElement>();
    const add = (el: Element) => {
      const id = el.getAttribute('data-block-id');
      if (id && !found.has(id)) found.set(id, el as HTMLElement);
    };
    for (const child of Array.from(this.container.children)) {
      if (child.hasAttribute('data-block-id')) add(child);
      else if (this.tableKeys.has(child as HTMLElement)) {
        for (const row of Array.from(child.querySelector(':scope > table > tbody')?.children ?? [])) {
          for (const cell of Array.from(row.children)) add(cell);
        }
      }
    }
    return found;
  }

  private renderAll(blocks: readonly BlockNode[]): void {
    const domBlockMap = this.placedElements();
    const domTables = new Map<string, HTMLElement>();
    for (const child of Array.from(this.container.children) as HTMLElement[]) {
      const key = this.tableKeys.get(child);
      if (key !== undefined && !domTables.has(key)) domTables.set(key, child);
    }

    const activeBlockIds = new Set<string>();
    const rendered: [BlockNode, HTMLElement][] = [];
    const top: HTMLElement[] = [];

    // The block's element: the one drawn before, brought up to date, or a new one.
    const elementFor = (block: BlockNode): HTMLElement => {
      activeBlockIds.add(block.id);
      const snapshot = this.computeBlockSnapshot(block);
      let el = domBlockMap.get(block.id);
      if (!el || el.tagName.toLowerCase() !== this.getBlockTagName(block)) {
        el = this.createBlockElement(block);
        this.renderedSnapshots.set(block.id, snapshot);
      } else if (this.renderedSnapshots.get(block.id) !== snapshot) {
        this.applyBlockClasses(el, block);
        this.updateBlockContent(el, block);
        this.renderedSnapshots.set(block.id, snapshot);
      }
      rendered.push([block, el]);
      this.elements.set(block.id, el);
      return el;
    };

    let i = 0;
    while (i < blocks.length) {
      const table = tableAtIndex(blocks, i);
      if (!table) {
        top.push(elementFor(blocks[i]));
        i += 1;
        continue;
      }
      const key = String(blocks[i].attrs?.table ?? '');
      let wrapper = domTables.get(key);
      domTables.delete(key);
      let tbody = wrapper?.querySelector<HTMLElement>(':scope > table > tbody');
      if (!wrapper || !tbody) {
        wrapper = document.createElement('div');
        wrapper.className = 'levit-table';
        const el = document.createElement('table');
        tbody = document.createElement('tbody');
        el.appendChild(tbody);
        wrapper.appendChild(el);
        this.tableKeys.set(wrapper, key);
      }
      // Only the table goes in the wrapper, and only the rows in the table.
      placeChildren(wrapper, [wrapper.querySelector(':scope > table')!]);
      placeChildren(wrapper.firstElementChild!, [tbody]);
      const oldRows = Array.from(tbody.children).filter((el) => el.tagName === 'TR') as HTMLElement[];
      const rows = table.rows.map((cells, r) => {
        const tr = oldRows[r] ?? document.createElement('tr');
        placeChildren(tr, cells.map((k) => elementFor(blocks[k])));
        return tr;
      });
      placeChildren(tbody, rows);
      top.push(wrapper);
      i = table.end + 1;
    }

    placeChildren(this.container, top);
    this.topCount = top.length;

    for (const id of domBlockMap.keys()) {
      if (!activeBlockIds.has(id)) {
        this.renderedSnapshots.delete(id);
        this.elements.delete(id);
      }
    }

    this.updateListNumbers(rendered);
  }

  // Numbers each run of ordered items from 1, separately on every nesting
  // level. Runs end at any other block, so this has to look at the whole
  // document, not only changed blocks.
  private updateListNumbers(rendered: [BlockNode, HTMLElement][]): void {
    const counts: number[] = [];
    for (const [block, el] of rendered) {
      let number: string | null = null;
      if (isListItem(block.type)) {
        const level = listIndent(block);
        counts.length = Math.min(counts.length, level + 1);
        for (let i = 0; i < level; i++) counts[i] ??= 0;
        counts[level] = block.type === 'ordered_list_item' ? (counts[level] ?? 0) + 1 : 0;
        if (block.type === 'ordered_list_item') number = String(counts[level]);
      } else {
        counts.length = 0;
      }
      if (number === null) {
        if (el.hasAttribute('data-number')) el.removeAttribute('data-number');
      } else if (el.getAttribute('data-number') !== number) {
        el.setAttribute('data-number', number);
      }
    }
  }

  private computeBlockSnapshot(block: BlockNode): string {
    return JSON.stringify({
      type: block.type,
      attrs: block.attrs,
      content: block.content,
    });
  }

  private getBlockTagName(block: BlockNode): string {
    const spec = this.schema.blocks.get(block.type);
    if (spec) return (spec.tag ?? 'div').toLowerCase();
    switch (block.type) {
      case 'heading': {
        const level = normalizeHeadingLevel(block.attrs?.level);
        return `h${level}`;
      }
      case 'blockquote':
        return 'blockquote';
      case 'code_block':
        return 'pre';
      case 'bullet_list_item':
      case 'ordered_list_item':
      case 'task_list_item':
      case 'horizontal_rule':
        return 'div';
      case 'image':
        return 'figure';
      case 'table_cell':
        return block.attrs?.header === true ? 'th' : 'td';
      default:
        return 'p';
    }
  }

  private createBlockElement(block: BlockNode): HTMLElement {
    const tagName = this.getBlockTagName(block);
    const el = document.createElement(tagName);
    el.setAttribute('data-block-id', block.id);
    this.applyBlockClasses(el, block);

    this.updateBlockContent(el, block);
    return el;
  }

  private applyBlockClasses(el: HTMLElement, block: BlockNode): void {
    el.className = `levit-block levit-block-${block.type}`;
    if (block.type !== 'task_list_item') el.removeAttribute('data-checked');
    if (isListItem(block.type)) el.classList.add('levit-list-item');
    const spec = this.schema.blocks.get(block.type);
    if (spec?.className) el.classList.add(...spec.className.split(/\s+/).filter(Boolean));
    // An element can be reused when a block changes type but keeps its tag,
    // so clear contenteditable for blocks that are not atoms.
    if (this.schema.isAtom(block.type)) {
      el.classList.add('levit-atom');
      el.contentEditable = 'false';
    } else {
      el.removeAttribute('contenteditable');
    }
    if (el.tagName === 'TH') el.setAttribute('scope', 'col');
    const indent = listIndent(block);
    if (indent > 0) el.setAttribute('data-indent', String(indent));
    else el.removeAttribute('data-indent');
  }

  private updateBlockContent(el: HTMLElement, block: BlockNode): void {
    el.innerHTML = '';
    if (block.type === 'horizontal_rule') {
      el.appendChild(document.createElement('hr'));
      return;
    }
    const spec = this.schema.blocks.get(block.type);
    if (spec?.atom) {
      spec.render?.(block, el);
      return;
    }
    if (block.type === 'image') {
      const img = document.createElement('img');
      const src = sanitizeImageSrc(block.attrs?.src);
      if (src) img.src = src;
      img.alt = typeof block.attrs?.alt === 'string' ? block.attrs.alt : '';
      img.draggable = false;
      el.appendChild(img);
      return;
    }
    if (block.type === 'task_list_item') this.addCheckbox(el, block);
    const language = block.type === 'code_block' ? normalizeCodeLanguage(block.attrs?.language) : null;
    if (block.type === 'code_block') this.addLanguageLabel(el, language);

    const hasText = block.content.some((node) => node.text.length > 0);
    if (!hasText) {
      const br = document.createElement('br');
      el.appendChild(br);
      el.classList.add('is-empty');
      return;
    }

    el.classList.remove('is-empty');

    if (block.type === 'code_block') {
      const code = document.createElement('code');
      const text = block.content.map((c) => c.text).join('');
      if (language) code.className = `language-${language}`;
      this.fillCode(code, text, language);
      el.appendChild(code);
      if (text.endsWith('\n')) el.appendChild(document.createElement('br'));
      return;
    }

    for (const node of block.content) {
      if (!node.text) continue;
      const domNode = this.renderInlineNode(node);
      el.appendChild(domNode);
    }

    // A trailing newline only shows an empty last line if a <br> follows it.
    if (block.content.map((c) => c.text).join('').endsWith('\n')) {
      el.appendChild(document.createElement('br'));
    }
  }

  /**
   * A label with the code block's language. It shows the name through CSS
   * (attr()), so it holds no text and caret offsets skip it.
   */
  private addLanguageLabel(el: HTMLElement, language: string | null): void {
    if (language) el.setAttribute('data-language', language);
    else el.removeAttribute('data-language');
    const label = document.createElement('span');
    label.className = 'levit-code-language';
    label.contentEditable = 'false';
    label.setAttribute('role', 'button');
    // Focusable from code (Alt+F10 in the code block), not in the Tab order.
    label.tabIndex = -1;
    const m = this.messages;
    label.setAttribute('aria-label', language ? format(m.codeLanguageLabel, { language }) : m.setCodeLanguage);
    label.setAttribute('data-label', language ?? m.plainText);
    el.appendChild(label);
  }

  /** Puts code into the element, highlighted when a highlighter is set. */
  private fillCode(code: HTMLElement, text: string, language: string | null): void {
    code.textContent = text;
    const highlight = this.options.highlightCode;
    if (!highlight || !language) return;
    try {
      const highlighted = cleanHighlightHTML(highlight(text, language));
      // The model and the DOM must hold the same text, or caret offsets break.
      if (highlighted.textContent !== text) return;
      code.textContent = '';
      code.appendChild(highlighted);
    } catch {
      // Keep the plain text.
    }
  }

  /** A plugin mark's element, or a plain span for marks nobody defined. */
  private createPluginMark(mark: InlineMark): HTMLElement {
    const spec = this.schema.marks.get(mark.type);
    const el = document.createElement(spec?.tag ?? 'span');
    if (spec?.className) el.className = spec.className;
    for (const [name, value] of Object.entries(spec?.attributes?.(mark) ?? {})) {
      // Plugins may set styles and data, but never script.
      if (/^on/i.test(name) || !/^[a-z][a-z0-9-:]*$/i.test(name)) continue;
      if (/^(href|src|xlink:href|action|formaction)$/i.test(name) && !sanitizeHref(value)) continue;
      el.setAttribute(name, String(value));
    }
    el.setAttribute('data-mark', mark.type);
    return el;
  }

  /** The checkbox of a task item. It holds no text, so offsets ignore it. */
  private addCheckbox(el: HTMLElement, block: BlockNode): void {
    const checked = block.attrs?.checked === true;
    el.setAttribute('data-checked', String(checked));
    const box = document.createElement('span');
    box.className = 'levit-task-checkbox';
    box.contentEditable = 'false';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(checked));
    box.setAttribute('aria-label', checked ? this.messages.markNotDone : this.messages.markDone);
    el.appendChild(box);
  }

  private renderInlineNode(node: InlineNode): Node {
    let current: Node = document.createTextNode(node.text);

    if (!node.marks || node.marks.length === 0) {
      return current;
    }

    // Order marks deterministically
    const sortedMarks = [...node.marks].sort((a, b) => a.type.localeCompare(b.type));

    for (const mark of sortedMarks) {
      current = this.wrapWithMark(current, mark);
    }

    return current;
  }

  private wrapWithMark(inner: Node, mark: InlineMark): HTMLElement {
    let el: HTMLElement;

    switch (mark.type) {
      case 'bold':
        el = document.createElement('strong');
        break;
      case 'italic':
        el = document.createElement('em');
        break;
      case 'underline':
        el = document.createElement('u');
        break;
      case 'strike':
        el = document.createElement('s');
        break;
      case 'highlight':
        el = document.createElement('mark');
        el.className = 'levit-highlight';
        break;
      case 'code':
        el = document.createElement('code');
        el.className = 'levit-inline-code';
        break;
      case 'link': {
        el = document.createElement('a');
        const href = sanitizeHref(mark.attrs?.href);
        if (href) {
          (el as HTMLAnchorElement).href = href;
          (el as HTMLAnchorElement).target = '_blank';
          (el as HTMLAnchorElement).rel = 'noopener noreferrer';
        }
        break;
      }
      default:
        el = this.createPluginMark(mark);
        break;
    }

    el.appendChild(inner);
    return el;
  }
}

/** True when two versions of a block sit in the same table row. */
function sameCellPlace(a: BlockNode, b: BlockNode): boolean {
  return a.type === b.type && a.attrs?.table === b.attrs?.table && a.attrs?.row === b.attrs?.row;
}

/**
 * Makes the parent's children exactly `wanted`, in order: other nodes are
 * removed, and nodes already in place are not touched (moving a node would
 * lose the caret in it).
 */
function placeChildren(parent: Element, wanted: readonly Element[]): void {
  const keep = new Set<Node>(wanted);
  for (const child of Array.from(parent.childNodes)) if (!keep.has(child)) child.remove();
  let cursor: ChildNode | null = parent.firstChild;
  for (const el of wanted) {
    if (cursor === el) cursor = cursor.nextSibling;
    else parent.insertBefore(el, cursor);
  }
}

/**
 * Parses highlighter output and keeps only text and <span class style>.
 * Other elements are unwrapped; script and style are dropped with their text.
 */
function cleanHighlightHTML(html: string): DocumentFragment {
  const template = document.createElement('template');
  template.innerHTML = html;
  const out = document.createDocumentFragment();
  const copy = (from: Node, to: Node) => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        to.appendChild(document.createTextNode(child.nodeValue ?? ''));
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = (child as Element).tagName.toLowerCase();
        if (tag === 'script' || tag === 'style') continue;
        if (tag === 'span') {
          const span = document.createElement('span');
          for (const name of ['class', 'style']) {
            const value = (child as Element).getAttribute(name);
            if (value !== null) span.setAttribute(name, value);
          }
          copy(child, span);
          to.appendChild(span);
        } else {
          copy(child, to);
        }
      }
    }
  };
  copy(template.content, out);
  return out;
}
