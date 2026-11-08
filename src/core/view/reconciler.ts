import { BlockNode, InlineMark, InlineNode } from '../model/types.js';
import { EditorState } from '../state/state.js';
import { normalizeHeadingLevel, sanitizeHref } from '../model/sanitize.js';
import { isListItem, listIndent } from '../model/document.js';

export class DOMReconciler {
  private container: HTMLElement;
  private renderedSnapshots = new Map<string, string>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /** Forgets what was rendered, so the next render rebuilds every block. */
  invalidate(): void {
    this.renderedSnapshots.clear();
  }

  render(state: EditorState): void {
    // Drop anything the browser put directly into the container.
    for (const node of Array.from(this.container.childNodes)) {
      if (!(node instanceof HTMLElement) || !node.hasAttribute('data-block-id')) {
        node.remove();
      }
    }

    const activeBlockIds = new Set<string>();
    const currentChildren = Array.from(this.container.children) as HTMLElement[];
    const domBlockMap = new Map<string, HTMLElement>();

    for (const child of currentChildren) {
      const id = child.getAttribute('data-block-id');
      if (id) {
        domBlockMap.set(id, child);
      }
    }

    let previousSibling: HTMLElement | null = null;
    const rendered: [BlockNode, HTMLElement][] = [];

    for (let i = 0; i < state.doc.blocks.length; i++) {
      const block = state.doc.blocks[i];
      activeBlockIds.add(block.id);

      const blockSnapshot = this.computeBlockSnapshot(block);
      let blockEl = domBlockMap.get(block.id);

      const expectedTagName = this.getBlockTagName(block);

      if (!blockEl || blockEl.tagName.toLowerCase() !== expectedTagName) {
        // Need to create element
        const newEl = this.createBlockElement(block);
        if (blockEl && blockEl.parentNode === this.container) {
          this.container.replaceChild(newEl, blockEl);
        } else if (previousSibling) {
          previousSibling.after(newEl);
        } else {
          this.container.prepend(newEl);
        }
        blockEl = newEl;
        this.renderedSnapshots.set(block.id, blockSnapshot);
      } else {
        // Element exists, check if content changed
        const lastSnapshot = this.renderedSnapshots.get(block.id);
        if (lastSnapshot !== blockSnapshot) {
          this.applyBlockClasses(blockEl, block);
          this.updateBlockContent(blockEl, block);
          this.renderedSnapshots.set(block.id, blockSnapshot);
        }

        // Ensure correct position in DOM
        const currentSibling = blockEl.previousElementSibling;
        if (currentSibling !== previousSibling) {
          if (previousSibling) {
            previousSibling.after(blockEl);
          } else {
            this.container.prepend(blockEl);
          }
        }
      }

      previousSibling = blockEl;
      rendered.push([block, blockEl]);
    }

    // Remove orphaned DOM elements
    for (const [id, element] of domBlockMap.entries()) {
      if (!activeBlockIds.has(id)) {
        element.remove();
        this.renderedSnapshots.delete(id);
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
        return 'div';
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
    const indent = listIndent(block);
    if (indent > 0) el.setAttribute('data-indent', String(indent));
    else el.removeAttribute('data-indent');
  }

  private updateBlockContent(el: HTMLElement, block: BlockNode): void {
    el.innerHTML = '';
    if (block.type === 'task_list_item') this.addCheckbox(el, block);

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
      code.textContent = text;
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

  /** The checkbox of a task item. It holds no text, so offsets ignore it. */
  private addCheckbox(el: HTMLElement, block: BlockNode): void {
    const checked = block.attrs?.checked === true;
    el.setAttribute('data-checked', String(checked));
    const box = document.createElement('span');
    box.className = 'levit-task-checkbox';
    box.contentEditable = 'false';
    box.setAttribute('role', 'checkbox');
    box.setAttribute('aria-checked', String(checked));
    box.setAttribute('aria-label', checked ? 'Mark as not done' : 'Mark as done');
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
        el = document.createElement('span');
        el.setAttribute('data-mark', mark.type);
        break;
    }

    el.appendChild(inner);
    return el;
  }
}

