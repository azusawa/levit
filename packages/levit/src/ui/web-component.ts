import { LevitEditor } from '../core/editor.js';
import { en, locales } from '../i18n/messages.js';
import type { DocumentData } from '../core/model/types.js';
import { createBubbleMenu } from '../plugins/bubble-menu.js';
import { createSlashMenu } from '../plugins/slash-menu.js';

// On the server (SSR) there is no HTMLElement. Fall back to an empty class so
// importing the package does not throw; the element is only registered in browsers.
const BaseElement = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement;

export class LevitEditorElement extends BaseElement {
  public editor!: LevitEditor;
  private mountPoint!: HTMLElement;
  private menus: { destroy(): void }[] = [];
  /** The document while the element is out of the page (moved), or before a rebuild. */
  private saved: DocumentData | null = null;

  static get observedAttributes(): string[] {
    return ['placeholder', 'theme', 'lang'];
  }

  connectedCallback(): void {
    if (this.editor) return;
    this.build();
  }

  /** Creates the editor and its menus, with the saved document if there is one. */
  private build(): void {
    this.mountPoint = document.createElement('div');
    this.appendChild(this.mountPoint);

    // lang="ko" (or "ko-KR") picks the built-in Korean messages; "ja" Japanese.
    const lang = (this.getAttribute('lang') ?? '').toLowerCase().split('-')[0];
    const messages = locales[lang] ?? en;
    const placeholder = this.getAttribute('placeholder') || messages.placeholder;

    this.editor = new LevitEditor({
      element: this.mountPoint,
      placeholder,
      messages,
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

    // Menus, as the React and Vue components add them; slash-menu="false" or
    // bubble-menu="false" leaves one out.
    if (this.getAttribute('bubble-menu') !== 'false') this.menus.push(createBubbleMenu(this.editor));
    if (this.getAttribute('slash-menu') !== 'false') this.menus.push(createSlashMenu(this.editor));

    if (this.saved) {
      this.editor.setJSON(this.saved);
      this.saved = null;
      return;
    }
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

  /** Removes the editor and its menus, keeping the document for build(). */
  private teardown(): void {
    if (!this.editor) return;
    this.saved = this.editor.getJSON();
    for (const menu of this.menus.splice(0)) menu.destroy();
    this.editor.destroy();
    this.mountPoint.remove();
    this.editor = undefined as unknown as LevitEditor;
  }

  // Moving the element calls this and then connectedCallback: the editor is
  // built again with the same document.
  disconnectedCallback(): void {
    this.teardown();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string): void {
    if (name === 'placeholder' && this.mountPoint) {
      this.mountPoint.setAttribute('data-placeholder', newVal);
    }
    if (name === 'theme') {
      this.setAttribute('data-theme', newVal);
    }
    // A new language: build the editor again with its messages.
    if (name === 'lang' && oldVal !== newVal && this.editor) {
      this.teardown();
      this.build();
    }
  }

  get value(): string {
    return JSON.stringify(this.editor?.getJSON() || {});
  }

  set value(val: string) {
    if (!this.editor) return;
    try {
      const parsed = JSON.parse(val);
      this.editor.setJSON(parsed);
    } catch {
      this.editor.setJSON({
        version: 1,
        blocks: [
          {
            id: 'b1',
            type: 'paragraph',
            content: [{ text: val, marks: [] }],
          },
        ],
      });
    }
  }

  getJSON(): any {
    return this.editor?.getJSON();
  }

  setJSON(json: any): void {
    this.editor?.setJSON(json);
  }

  getText(): string {
    return this.editor?.getText() || '';
  }

  focus(): void {
    this.editor?.focus();
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('levit-editor')) {
  customElements.define('levit-editor', LevitEditorElement);
}

