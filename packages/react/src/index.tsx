'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  createBubbleMenu,
  createLevitEditor,
  createSlashMenu,
  createTableToolbar,
  sameContent,
  type DocumentData,
  type EditorOptions,
  type LevitEditor as Editor,
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
 * Creates a Levit editor on the element you attach `ref` to. The editor is
 * made after mount (so this is safe in server rendering) and destroyed on
 * unmount. Options are read when the editor is made; callbacks always call
 * the latest version you passed.
 */
export function useLevitEditor(options: UseLevitEditorOptions = {}): {
  ref: (element: HTMLElement | null) => void;
  editor: Editor | null;
} {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const latest = useRef(options);
  latest.current = options;

  useEffect(() => {
    if (!element) return;
    const { bubbleMenu = true, slashMenu = true, tableToolbar = true, ...editorOptions } = latest.current;
    const instance = createLevitEditor(element, {
      ...editorOptions,
      onChange: (ed) => latest.current.onChange?.(ed),
      onSelectionChange: (selection) => latest.current.onSelectionChange?.(selection),
      onError: (error) => {
        if (latest.current.onError) latest.current.onError(error);
        else console.error(error);
      },
    });
    const menus = [
      bubbleMenu && createBubbleMenu(instance),
      slashMenu && createSlashMenu(instance),
      tableToolbar && createTableToolbar(instance),
    ];
    setEditor(instance);
    latest.current.onReady?.(instance);

    return () => {
      for (const menu of menus) if (menu) menu.destroy();
      instance.destroy();
      setEditor(null);
    };
  }, [element]);

  return { ref: setElement, editor };
}

export interface LevitEditorProps extends Omit<UseLevitEditorOptions, 'initialContent' | 'onChange'> {
  /** The document, for a controlled editor. Pass back what onChange gives you. */
  value?: DocumentData;
  /** The starting document, for an uncontrolled editor. */
  defaultValue?: DocumentData;
  /** Called with the document JSON after every change. */
  onChange?: (value: DocumentData, editor: Editor) => void;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/**
 * A Levit editor with its menus. Use `defaultValue` for an uncontrolled
 * editor, or `value` with `onChange` for a controlled one. The ref gives the
 * editor instance.
 */
export const LevitEditor = forwardRef<Editor | null, LevitEditorProps>(function LevitEditor(
  { value, defaultValue, onChange, className, style, id, ...options },
  ref
) {
  const handleChange = useCallback((ed: Editor) => onChange?.(ed.getJSON(), ed), [onChange]);
  const { ref: elementRef, editor } = useLevitEditor({
    ...options,
    initialContent: value ?? defaultValue,
    onChange: handleChange,
  });

  useImperativeHandle(ref, () => editor as Editor, [editor]);

  // A controlled value replaces the content only when it differs, so the
  // value that comes back from onChange does not reset the caret.
  useEffect(() => {
    if (!editor || value === undefined) return;
    if (!sameContent(value, editor.getJSON())) editor.setJSON(value);
  }, [editor, value]);

  return <div ref={elementRef} className={className} style={style} id={id} />;
});
