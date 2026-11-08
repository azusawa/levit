import { LevitEditor } from '../core/editor.js';
import { en, locales } from '../i18n/messages.js';

// On the server (SSR) there is no HTMLElement. Fall back to an empty class so
// importing the package does not throw; the element is only registered in browsers.
const BaseElement = (typeof HTMLElement !== 'undefined' ? HTMLElement : class {}) as typeof HTMLElement;

export class LevitEditorElement extends BaseElement {
  public editor!: LevitEditor;
  private mountPoint!: HTMLElement;

  static get observedAttributes(): string[] {
    return ['placeholder', 'theme'];
  }

  connectedCallback(): void {
    if (this.editor) return;

    this.mountPoint = document.createElement('div');
    this.appendChild(this.mountPoint);

    // lang="ko" (or "ko-KR") picks the built-in Korean messages.
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

  disconnectedCallback(): void {
    if (this.editor) {
      this.editor.destroy();
    }
  }

  attributeChangedCallback(name: string, _oldVal: string, newVal: string): void {
    if (name === 'placeholder' && this.mountPoint) {
      this.mountPoint.setAttribute('data-placeholder', newVal);
    }
    if (name === 'theme') {
      this.setAttribute('data-theme', newVal);
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

