import { LevitEditor } from '../core/editor';

export class LevitEditorElement extends HTMLElement {
  public editor!: LevitEditor;
  private mountPoint!: HTMLElement;

  static get observedAttributes(): string[] {
    return ['placeholder', 'theme'];
  }

  connectedCallback(): void {
    if (this.editor) return;

    this.mountPoint = document.createElement('div');
    this.appendChild(this.mountPoint);

    const placeholder = this.getAttribute('placeholder') || 'Type something or press "/" for commands...';

    this.editor = new LevitEditor({
      element: this.mountPoint,
      placeholder,
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

