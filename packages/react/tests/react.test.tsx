import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StrictMode, act, createRef, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DocumentData, LevitEditor as Editor } from '@yonailab/levit';
import { LevitEditor, useLevitEditor } from '../src/index';

// React only runs act() warnings-free when told it is in a test.
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  document.body.innerHTML = '';
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
});

const doc = (text: string): DocumentData => ({
  version: 1,
  blocks: [{ id: 'p', type: 'paragraph', content: [{ text }] }],
});

const editorEl = () => host.querySelector('.levit-editor-root') as HTMLElement;

describe('<LevitEditor>', () => {
  it('renders the editor with its default content and menus', () => {
    act(() => root.render(<LevitEditor defaultValue={doc('hello')} placeholder="Write" />));
    expect(editorEl().textContent).toBe('hello');
    expect(editorEl().getAttribute('data-placeholder')).toBe('Write');
    expect(document.querySelector('.levit-bubble-menu')).not.toBeNull();
    expect(document.querySelector('.levit-slash-menu')).not.toBeNull();
    expect(document.querySelector('.levit-table-toolbar')).not.toBeNull();
  });

  it('can leave out the menus', () => {
    act(() => root.render(<LevitEditor bubbleMenu={false} slashMenu={false} tableToolbar={false} />));
    expect(document.querySelector('.levit-bubble-menu')).toBeNull();
    expect(document.querySelector('.levit-slash-menu')).toBeNull();
    expect(document.querySelector('.levit-table-toolbar')).toBeNull();
  });

  it('gives the editor through ref and onReady', () => {
    const ref = createRef<Editor | null>();
    const onReady = vi.fn();
    act(() => root.render(<LevitEditor ref={ref} onReady={onReady} />));
    expect(ref.current?.getJSON).toBeTypeOf('function');
    expect(onReady).toHaveBeenCalledWith(ref.current);
  });

  it('calls onChange with the JSON and the editor, using the latest callback', () => {
    const first = vi.fn();
    const second = vi.fn();
    const ref = createRef<Editor | null>();
    act(() => root.render(<LevitEditor ref={ref} defaultValue={doc('a')} onChange={first} />));
    act(() => root.render(<LevitEditor ref={ref} defaultValue={doc('a')} onChange={second} />));
    act(() => {
      ref.current!.chain().insertText('b').run();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    expect(second.mock.calls[0][0].blocks[0].content[0].text).toBe('ba');
    expect(second.mock.calls[0][1]).toBe(ref.current);
  });

  it('works as a controlled component', () => {
    let setOutside: (d: DocumentData) => void = () => {};
    const ref = createRef<Editor | null>();
    function App() {
      const [value, setValue] = useState<DocumentData>(doc('start'));
      setOutside = setValue;
      return <LevitEditor ref={ref} value={value} onChange={setValue} />;
    }
    act(() => root.render(<App />));
    expect(editorEl().textContent).toBe('start');

    // Typing goes through onChange and back in as the same value: no reset.
    act(() => {
      ref.current!.chain().insertText('x').run();
    });
    expect(editorEl().textContent).toBe('xstart');
    expect(ref.current!.state.selection.anchor.offset).toBe(1);

    // A new value from outside replaces the content.
    act(() => setOutside(doc('replaced')));
    expect(editorEl().textContent).toBe('replaced');
  });

  it('passes editor options through (messages, plugins)', () => {
    const ref = createRef<Editor | null>();
    const plugin = { name: 'p', commands: { hello: () => (tr: any) => void tr.insertText('hi') } };
    act(() => root.render(<LevitEditor ref={ref} messages={{ bold: 'Gras' }} plugins={[plugin]} />));
    expect(ref.current!.messages.bold).toBe('Gras');
    expect(ref.current!.commands.hello()).toBe(true);
  });

  it('cleans up the editor and menus on unmount', () => {
    act(() => root.render(<LevitEditor />));
    act(() => root.render(<div />));
    expect(document.querySelector('.levit-bubble-menu')).toBeNull();
    expect(document.querySelector('.levit-slash-menu')).toBeNull();
    expect(document.querySelector('.levit-table-toolbar')).toBeNull();
  });

  it('makes exactly one editor and one set of menus under StrictMode', () => {
    act(() =>
      root.render(
        <StrictMode>
          <LevitEditor defaultValue={doc('strict')} />
        </StrictMode>
      )
    );
    expect(host.querySelectorAll('.levit-editor-root')).toHaveLength(1);
    expect(editorEl().textContent).toBe('strict');
    expect(document.querySelectorAll('.levit-bubble-menu')).toHaveLength(1);
  });
});

describe('useLevitEditor', () => {
  it('returns a ref to attach and the editor once it exists', () => {
    const seen: (Editor | null)[] = [];
    function Custom() {
      const { ref, editor } = useLevitEditor({ initialContent: doc('custom'), bubbleMenu: false, slashMenu: false });
      seen.push(editor);
      return <section ref={ref} className="mine" />;
    }
    act(() => root.render(<Custom />));
    expect(seen[0]).toBeNull();
    expect(seen[seen.length - 1]?.getText()).toBe('custom');
    expect(host.querySelector('section.mine.levit-editor-root')).not.toBeNull();
  });
});
