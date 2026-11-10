import { LevitEditor } from '../core/editor.js';
import { en, locales, type LevitMessages } from '../i18n/messages.js';
import { documentFromJSON } from '../serializers/json.js';
import { getBlockText } from '../core/model/document.js';
import type { DocumentData } from '../core/model/types.js';
import { createBubbleMenu } from '../plugins/bubble-menu.js';
import { createSlashMenu } from '../plugins/slash-menu.js';

// On the server (SSR) there is no HTMLElement. Fall back to an empty class so
// importing the package does not throw; the element is only registered in browsers.
const BaseElement = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement;

/** The built-in messages for a lang value: "ko", "ko-KR" and "KO" are the same. */
function messagesFor(lang: string | null): LevitMessages {
  const code = (lang ?? '').toLowerCase().split('-')[0];
  return Object.prototype.hasOwnProperty.call(locales, code) ? locales[code] : en;
}

export class LevitEditorElement extends BaseElement {
  public editor!: LevitEditor;
  private mountPoint!: HTMLElement;
  private menus: { bubble?: { element: HTMLElement; destroy(): void }; slash?: { element: HTMLElement; destroy(): void } } = {};
  /** The document after the element was removed, to give back and to build with again. */
  private saved: DocumentData | null = null;

  static get observedAttributes(): string[] {
    return ['placeholder', 'theme', 'lang', 'bubble-menu', 'slash-menu'];
  }

  connectedCallback(): void {
    if (!this.editor) this.build(this.saved);
  }

  // Moving the element calls this and then connectedCallback right away. The
  // editor is taken down only if the element is still out of the page after
  // that, so a move keeps the same editor, its history and what was attached.
  disconnectedCallback(): void {
    queueMicrotask(() => {
      if (!this.isConnected) this.teardown();
    });
  }

  /** Creates the editor and its menus, with a document if one is given. */
  private build(content: DocumentData | null): void {
    this.mountPoint = document.createElement('div');
    this.appendChild(this.mountPoint);

    const messages = messagesFor(this.getAttribute('lang'));
    this.editor = new LevitEditor({
      element: this.mountPoint,
      placeholder: this.getAttribute('placeholder') || messages.placeholder,
      messages,
      // Given at creation, so building again fires no change.
      initialContent: content ?? undefined,
      onChange: (ed) => {
        this.dispatchEvent(
          new CustomEvent('input', {
            bubbles: true,
            composed: true,
            detail: {
              json: ed.getJSON(),
              text: ed.getText(),
            },
          })
        );
      },
    });
    this.saved = null;
    this.syncMenus();

    if (content) return;
    const initialValue = this.getAttribute('value');
    if (initialValue) {
      try {
        const parsed = JSON.parse(initialValue);
        this.editor.setJSON(parsed);
      } catch {
        this.editor.chain().insertText(initialValue).run();
      }
    }
  }

  /** Removes the editor and its menus, keeping the document. */
  private teardown(): void {
    if (!this.editor) return;
    this.saved = this.editor.getJSON();
    this.menus.bubble?.destroy();
    this.menus.slash?.destroy();
    this.menus = {};
    this.editor.destroy();
    this.mountPoint.remove();
    this.editor = undefined as unknown as LevitEditor;
  }

  /**
   * Menus, as the React and Vue components add them; bubble-menu="false" or
   * slash-menu="false" leaves one out. They live in <body>, so they get the
   * element's theme themselves.
   */
  private syncMenus(): void {
    if (!this.editor) return;
    const want = (name: string) => this.getAttribute(name) !== 'false';
    if (want('bubble-menu') && !this.menus.bubble) this.menus.bubble = createBubbleMenu(this.editor);
    if (!want('bubble-menu') && this.menus.bubble) {
      this.menus.bubble.destroy();
      this.menus.bubble = undefined;
    }
    if (want('slash-menu') && !this.menus.slash) this.menus.slash = createSlashMenu(this.editor);
    if (!want('slash-menu') && this.menus.slash) {
      this.menus.slash.destroy();
      this.menus.slash = undefined;
    }
    const theme = this.getAttribute('theme');
    for (const menu of [this.menus.bubble, this.menus.slash]) {
      if (!menu) continue;
      if (theme) menu.element.setAttribute('data-theme', theme);
      else menu.element.removeAttribute('data-theme');
    }
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
    if (name === 'theme') {
      if (newVal) this.setAttribute('data-theme', newVal);
      else this.removeAttribute('data-theme');
      this.syncMenus();
    }
    if (!this.editor) return;
    if (name === 'placeholder') {
      this.mountPoint.setAttribute('data-placeholder', newVal || this.editor.messages.placeholder);
    }
    if (name === 'bubble-menu' || name === 'slash-menu') this.syncMenus();
    // Other messages: the editor is built again with the same document (a new
    // `editor` object). A lang that maps to the same messages changes nothing.
    if (name === 'lang' && messagesFor(oldVal) !== messagesFor(newVal)) {
      this.teardown();
      this.build(this.saved);
    }
  }

  get value(): string {
    return JSON.stringify(this.getJSON() || {});
  }

  set value(val: string) {
    let doc: DocumentData;
    try {
      doc = JSON.parse(val);
    } catch {
      doc = { version: 1, blocks: [{ id: 'b1', type: 'paragraph', attrs: {}, content: [{ text: val, marks: [] }] }] } as DocumentData;
    }
    this.setJSON(doc);
  }

  /** The document; also after the element was removed from the page. */
  getJSON(): any {
    return this.editor ? this.editor.getJSON() : this.saved ?? undefined;
  }

  setJSON(json: any): void {
    if (this.editor) this.editor.setJSON(json);
    else this.saved = documentFromJSON(json);
  }

  getText(): string {
    if (this.editor) return this.editor.getText();
    return (this.saved?.blocks ?? []).map((block) => getBlockText(block)).join('\n');
  }

  focus(): void {
    this.editor?.focus();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('levit-editor')) {
  customElements.define('levit-editor', LevitEditorElement);
}

