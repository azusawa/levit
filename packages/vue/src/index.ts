import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type PropType,
  type Ref,
  type ShallowRef,
} from 'vue';
import {
  createBubbleMenu,
  createLevitEditor,
  createSlashMenu,
  createTableToolbar,
  sameContent,
  type DocumentData,
  type EditorOptions,
  type LevitEditor as Editor,
  type LevitMessages,
  type LevitPlugin,
} from '@yonailab/levit';

export type { Editor };

/** Editor options, plus whether to add the bubble and slash menus and the table toolbar. */
export interface UseLevitEditorOptions extends Omit<EditorOptions, 'element'> {
  /** Show the formatting toolbar on selected text. Default: true. */
  bubbleMenu?: boolean;
  /** Open the block menu with "/". Default: true. */
  slashMenu?: boolean;
  /** Show the table toolbar above the table the caret is in. Default: true. */
  tableToolbar?: boolean;
  /** Called once the editor exists. */
  onReady?: (editor: Editor) => void;
}

/**
 * Creates a Levit editor on the element you bind to `element` (with
 * `ref="element"` or `h('div', { ref: element })`). The editor is made on
 * mount and destroyed before unmount.
 */
export function useLevitEditor(options: UseLevitEditorOptions = {}): {
  element: Ref<HTMLElement | null>;
  editor: ShallowRef<Editor | null>;
} {
  const element = ref<HTMLElement | null>(null);
  // shallowRef: Vue must not wrap the editor in a reactive proxy.
  const editor = shallowRef<Editor | null>(null);
  let cleanup = () => {};

  onMounted(() => {
    if (!element.value) return;
    const { bubbleMenu = true, slashMenu = true, tableToolbar = true, ...editorOptions } = options;
    const instance = createLevitEditor(element.value, editorOptions);
    const menus = [
      bubbleMenu && createBubbleMenu(instance),
      slashMenu && createSlashMenu(instance),
      tableToolbar && createTableToolbar(instance),
    ];
    editor.value = instance;
    options.onReady?.(instance);
    cleanup = () => {
      for (const menu of menus) if (menu) menu.destroy();
      instance.destroy();
      editor.value = null;
    };
  });

  onBeforeUnmount(() => cleanup());

  return { element, editor };
}

/**
 * A Levit editor with its menus. Bind the document with v-model; listen to
 * `ready` for the editor instance, or read it from the component ref.
 */
export const LevitEditor = defineComponent({
  name: 'LevitEditor',
  props: {
    modelValue: { type: Object as PropType<DocumentData>, default: undefined },
    placeholder: { type: String, default: undefined },
    plugins: { type: Array as PropType<LevitPlugin[]>, default: undefined },
    messages: { type: Object as PropType<Partial<LevitMessages>>, default: undefined },
    uploadImage: { type: Function as PropType<EditorOptions['uploadImage']>, default: undefined },
    highlightCode: { type: Function as PropType<EditorOptions['highlightCode']>, default: undefined },
    bubbleMenu: { type: Boolean, default: true },
    slashMenu: { type: Boolean, default: true },
    tableToolbar: { type: Boolean, default: true },
    // A prop rather than an emit, so without an @error listener the editor
    // falls back to logging errors to the console.
    onError: { type: Function as PropType<(error: unknown) => void>, default: undefined },
  },
  emits: {
    'update:modelValue': (_value: DocumentData) => true,
    ready: (_editor: Editor) => true,
  },
  setup(props, { emit, expose }) {
    const { element, editor } = useLevitEditor({
      initialContent: props.modelValue,
      placeholder: props.placeholder,
      plugins: props.plugins,
      messages: props.messages,
      uploadImage: props.uploadImage,
      highlightCode: props.highlightCode,
      bubbleMenu: props.bubbleMenu,
      slashMenu: props.slashMenu,
      tableToolbar: props.tableToolbar,
      onChange: (ed) => emit('update:modelValue', ed.getJSON()),
      onError: props.onError,
      onReady: (ed) => emit('ready', ed),
    });

    // Replace the content only when the bound value differs, so the value
    // that comes back from update:modelValue does not reset the caret.
    watch(
      () => props.modelValue,
      (value) => {
        if (!editor.value || value === undefined) return;
        if (!sameContent(value, editor.value.getJSON())) editor.value.setJSON(value);
      }
    );

    expose({
      get editor() {
        return editor.value;
      },
    });

    return () => h('div', { ref: element });
  },
});
