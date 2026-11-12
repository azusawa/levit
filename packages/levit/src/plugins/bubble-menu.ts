import { LevitEditor } from '../core/editor.js';
import { normalizeLinkInput } from '../core/model/sanitize.js';
import type { EditorSelection } from '../core/model/types.js';
import { rovingToolbar } from './toolbar-keys.js';

export interface BubbleMenuInstance {
  element: HTMLElement;
  show: (rect: DOMRect) => void;
  hide: () => void;
  destroy: () => void;
}

const bubbleMenus = new WeakMap<LevitEditor, BubbleMenuInstance>();

/** The bubble menu of an editor. An editor has one: calling this again returns it. */
export function createBubbleMenu(editor: LevitEditor): BubbleMenuInstance {
  const existing = bubbleMenus.get(editor);
  if (existing) return existing;
  const m = editor.messages;
  const menu = document.createElement('div');
  menu.className = 'levit-bubble-menu';
  menu.setAttribute('role', 'toolbar');
  menu.setAttribute('aria-label', m.formattingToolbar);
  menu.style.display = 'none';

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'contents';
  menu.appendChild(buttonRow);

  const linkInput = document.createElement('input');
  linkInput.type = 'text';
  linkInput.className = 'levit-bubble-link-input';
  linkInput.placeholder = m.linkPlaceholder;
  linkInput.setAttribute('aria-label', m.linkUrl);
  linkInput.style.display = 'none';
  menu.appendChild(linkInput);

  // While the URL field is open, focus is outside the editor, so remember
  // which text the link is for.
  let linkMode = false;
  let savedSelection: EditorSelection | null = null;
  let lastRect: DOMRect | null = null;

  // `mark` buttons report whether the selection has that mark (aria-pressed).
  const buttons: { label: string; title: string; mark?: string; action: () => void }[] = [
    { label: 'B', title: m.bold, mark: 'bold', action: () => editor.chain().toggleBold().run() },
    { label: 'I', title: m.italic, mark: 'italic', action: () => editor.chain().toggleItalic().run() },
    { label: 'U', title: m.underline, mark: 'underline', action: () => editor.chain().toggleUnderline().run() },
    { label: 'S', title: m.strikethrough, mark: 'strike', action: () => editor.chain().toggleStrike().run() },
    { label: '🖍', title: m.highlight, mark: 'highlight', action: () => editor.chain().toggleHighlight().run() },
    { label: '</>', title: m.code, mark: 'code', action: () => editor.chain().toggleMark({ type: 'code' }).run() },
    { label: '🔗', title: m.link, mark: 'link', action: () => openLinkField() },
    { label: 'H1', title: m.heading1, action: () => editor.chain().setHeading(1).run() },
    { label: 'H2', title: m.heading2, action: () => editor.chain().setHeading(2).run() },
    { label: '”', title: m.quote, action: () => editor.chain().setBlockType('blockquote').run() },
    // Buttons from plugins, like the AI plugin's "Improve writing".
    ...editor.schema.bubbleItems.map((item) => ({
      label: item.label,
      title: typeof item.title === 'function' ? item.title(editor) : item.title,
      action: () => item.action(editor),
    })),
  ];

  const buttonEls: HTMLButtonElement[] = [];

  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'levit-bubble-btn';
    btn.textContent = b.label;
    btn.title = b.title;
    btn.setAttribute('aria-label', b.title);
    // The mouse acts on mousedown so the editor keeps its selection.
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      b.action();
      refreshButtons();
      updateVisibility();
    });
    // Enter or Space on a focused button sends a click without a mouse.
    btn.addEventListener('click', (e) => {
      if (e.detail !== 0) return;
      b.action();
      refreshButtons();
    });
    buttonRow.appendChild(btn);
    buttonEls.push(btn);
  }

  /** Marks the buttons for formats the selection already has. */
  function refreshButtons() {
    buttons.forEach((b, i) => {
      if (!b.mark) return;
      const on = b.mark === 'link' ? editor.getActiveLink() !== null : editor.isActive(b.mark);
      buttonEls[i].setAttribute('aria-pressed', String(on));
      buttonEls[i].classList.toggle('is-active', on);
    });
  }

  const focusButton = rovingToolbar(buttonRow, buttonEls, () => editor.focus());

  // Alt+F10 (as in Google Docs and Word) moves focus from the text to the toolbar.
  function handleEditorKeyDown(e: KeyboardEvent) {
    if (e.key !== 'F10' || !e.altKey || editor.state.selection.isCollapsed) return;
    e.preventDefault();
    refreshButtons();
    const sel = window.getSelection();
    const rect = sel && sel.rangeCount > 0 ? sel.getRangeAt(0).getBoundingClientRect() : null;
    if (rect && rect.width > 0) show(rect);
    else menu.style.display = 'flex';
    focusButton(0);
  }
  editor.container.addEventListener('keydown', handleEditorKeyDown);

  document.body.appendChild(menu);

  function openLinkField() {
    savedSelection = editor.state.selection;
    linkMode = true;
    buttonRow.style.display = 'none';
    linkInput.style.display = 'block';
    linkInput.value = editor.getActiveLink() ?? '';
    linkInput.removeAttribute('aria-invalid');
    // The field is wider than the buttons, so center it again.
    if (lastRect) show(lastRect);
    // Let the mousedown finish before moving focus into the field.
    setTimeout(() => {
      linkInput.focus();
      linkInput.select();
    }, 0);
  }

  function closeLinkField() {
    linkMode = false;
    buttonRow.style.display = 'contents';
    linkInput.style.display = 'none';
  }

  function returnToEditor() {
    const selection = savedSelection;
    closeLinkField();
    editor.container.focus();
    if (selection) editor.dispatch(editor.state.tr.setSelection(selection));
  }

  function submitLink() {
    const href = normalizeLinkInput(linkInput.value);
    if (href === null) {
      linkInput.setAttribute('aria-invalid', 'true');
      return;
    }

    const selection = savedSelection;
    closeLinkField();
    editor.container.focus();
    if (!selection) return;
    const tr = editor.state.tr.setSelection(selection);
    tr.setLink(href === '' ? null : href);
    editor.dispatch(tr);
  }

  linkInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitLink();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      returnToEditor();
    }
  });

  linkInput.addEventListener('input', () => linkInput.removeAttribute('aria-invalid'));

  // Clicking somewhere else cancels the link.
  linkInput.addEventListener('blur', () => {
    if (!linkMode) return;
    closeLinkField();
    updateVisibility();
  });

  function updateVisibility() {
    if (linkMode) return;

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.container.contains(sel.anchorNode)) {
      menu.style.display = 'none';
      return;
    }

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        refreshButtons();
        show(rect);
        return;
      }
    }
    menu.style.display = 'none';
  }

  function show(rect: DOMRect) {
    lastRect = rect;
    menu.style.display = 'flex';
    const menuRect = menu.getBoundingClientRect();
    const top = Math.max(10, rect.top - menuRect.height - 8 + window.scrollY);
    const left = Math.max(10, rect.left + rect.width / 2 - menuRect.width / 2 + window.scrollX);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function hide() {
    closeLinkField();
    menu.style.display = 'none';
  }

  document.addEventListener('selectionchange', updateVisibility);

  const instance: BubbleMenuInstance = {
    element: menu,
    show,
    hide,
    destroy: () => {
      bubbleMenus.delete(editor);
      document.removeEventListener('selectionchange', updateVisibility);
      editor.container.removeEventListener('keydown', handleEditorKeyDown);
      menu.remove();
    },
  };
  bubbleMenus.set(editor, instance);
  return instance;
}
