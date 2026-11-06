import { BlockNode, InlineMark, InlineNode } from '../model/types';
import { EditorState } from '../state/state';
import { normalizeHeadingLevel, sanitizeHref } from '../model/sanitize';

export class DOMReconciler {
  private container: HTMLElement;
  private renderedSnapshots = new Map<string, string>();

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(state: EditorState): void {
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
    }

    // Remove orphaned DOM elements
    for (const [id, element] of domBlockMap.entries()) {
      if (!activeBlockIds.has(id)) {
        element.remove();
        this.renderedSnapshots.delete(id);
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
      default:
        return 'p';
    }
  }

  private createBlockElement(block: BlockNode): HTMLElement {
    const tagName = this.getBlockTagName(block);
    const el = document.createElement(tagName);
    el.setAttribute('data-block-id', block.id);
    el.className = `levit-block levit-block-${block.type}`;

    this.updateBlockContent(el, block);
    return el;
  }

  private updateBlockContent(el: HTMLElement, block: BlockNode): void {
    el.innerHTML = '';

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
      return;
    }

    for (const node of block.content) {
      if (!node.text) continue;
      const domNode = this.renderInlineNode(node);
      el.appendChild(domNode);
    }
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

