import { describe, it, expect, beforeEach, vi } from 'vitest';
import '../../src/ui/web-component';
import { LevitEditorElement } from '../../src/ui/web-component';

describe('Levit Web Component (<levit-editor>)', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('is registered in customElements registry', () => {
    expect(customElements.get('levit-editor')).toBeDefined();
  });

  it('renders and mounts an editor instance on connectedCallback', () => {
    const el = document.createElement('levit-editor') as LevitEditorElement;
    document.body.appendChild(el);

    expect(el.editor).toBeDefined();
    expect(el.querySelector('.levit-editor-root')).not.toBeNull();
  });

  it('dispatches input event and updates value when editor content changes', () => {
    const el = document.createElement('levit-editor') as LevitEditorElement;
    document.body.appendChild(el);

    const onInput = vi.fn();
    el.addEventListener('input', onInput);

    el.editor.chain().insertText('Testing Web Component').run();

    expect(onInput).toHaveBeenCalled();
    expect(el.value).toContain('Testing Web Component');
  });
});

