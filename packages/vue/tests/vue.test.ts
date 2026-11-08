import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import type { DocumentData, LevitEditor as Editor } from '@yonailab/levit';
import { LevitEditor, useLevitEditor } from '../src/index';

let host: HTMLDivElement;
let app: App | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  app?.unmount();
  app = null;
});

const doc = (text: string): DocumentData => ({
  version: 1,
  blocks: [{ id: 'p', type: 'paragraph', content: [{ text }] }],
});

const editorEl = () => host.querySelector('.levit-editor-root') as HTMLElement;

function mount(render: () => any, setup?: () => void) {
  app = createApp(defineComponent({ setup() { setup?.(); return render; } }));
  app.mount(host);
}

describe('<LevitEditor>', () => {
  it('renders the editor with its content and menus', async () => {
    mount(() => h(LevitEditor, { modelValue: doc('hello'), placeholder: 'Write' }));
    await nextTick();
    expect(editorEl().textContent).toBe('hello');
    expect(editorEl().getAttribute('data-placeholder')).toBe('Write');
    expect(document.querySelector('.levit-bubble-menu')).not.toBeNull();
    expect(document.querySelector('.levit-slash-menu')).not.toBeNull();
  });

  it('can leave out the menus', async () => {
    mount(() => h(LevitEditor, { bubbleMenu: false, slashMenu: false }));
    await nextTick();
    expect(document.querySelector('.levit-bubble-menu')).toBeNull();
    expect(document.querySelector('.levit-slash-menu')).toBeNull();
  });

  it('supports v-model and emits ready with the editor', async () => {
    const value = ref<DocumentData>(doc('start'));
    let editor: Editor | null = null;
    mount(() =>
      h(LevitEditor, {
        modelValue: value.value,
        'onUpdate:modelValue': (v: DocumentData) => (value.value = v),
        onReady: (e: Editor) => (editor = e),
      })
    );
    await nextTick();
    expect(editor).not.toBeNull();

    editor!.chain().insertText('x').run();
    await nextTick();
    expect(value.value.blocks[0].content[0].text).toBe('xstart');
    // The value coming back does not reset the caret.
    expect(editor!.state.selection.anchor.offset).toBe(1);

    value.value = doc('replaced');
    await nextTick();
    expect(editorEl().textContent).toBe('replaced');
  });

  it('passes editor options through and exposes the editor', async () => {
    const component = ref<{ editor: Editor | null } | null>(null);
    mount(() => h(LevitEditor, { ref: component, messages: { bold: 'Gras' } }));
    await nextTick();
    expect(component.value!.editor!.messages.bold).toBe('Gras');
  });

  it('cleans up on unmount', async () => {
    mount(() => h(LevitEditor));
    await nextTick();
    app!.unmount();
    app = null;
    expect(document.querySelector('.levit-bubble-menu')).toBeNull();
    expect(document.querySelector('.levit-slash-menu')).toBeNull();
  });
});

describe('useLevitEditor', () => {
  it('creates the editor on the element ref after mount', async () => {
    const onChange = vi.fn();
    let result!: ReturnType<typeof useLevitEditor>;
    mount(
      () => h('section', { ref: result.element, class: 'mine' }),
      () => {
        result = useLevitEditor({ initialContent: doc('custom'), bubbleMenu: false, slashMenu: false, onChange });
      }
    );
    await nextTick();
    expect(result.editor.value?.getText()).toBe('custom');
    expect(host.querySelector('section.mine.levit-editor-root')).not.toBeNull();
    result.editor.value!.chain().insertText('!').run();
    expect(onChange).toHaveBeenCalledWith(result.editor.value);
  });
});

describe('errors', () => {
  it('@error receives background errors', async () => {
    const onError = vi.fn();
    let editor: Editor | null = null;
    mount(() =>
      h(LevitEditor, {
        onError,
        uploadImage: async () => {
          throw new Error('offline');
        },
        onReady: (e: Editor) => (editor = e),
      })
    );
    await nextTick();
    await editor!.uploadImages([new File(['x'], 'a.png', { type: 'image/png' })]);
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'offline' }));
  });
});
