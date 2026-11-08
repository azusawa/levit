import { LevitEditor } from '../core/editor.js';
import { normalizeLinkInput } from '../core/model/sanitize.js';
import type { EditorSelection } from '../core/model/types.js';

export interface BubbleMenuInstance {
  element: HTMLElement;
  show: (rect: DOMRect) => void;
  hide: () => void;
  destroy: () => void;
}

export function createBubbleMenu(editor: LevitEditor): BubbleMenuInstance {
  const menu = document.createElement('div');
  menu.className = 'levit-bubble-menu';
  menu.style.display = 'none';

  const buttonRow = document.createElement('div');
  buttonRow.style.display = 'contents';
  menu.appendChild(buttonRow);

  const linkInput = document.createElement('input');
  linkInput.type = 'text';
  linkInput.className = 'levit-bubble-link-input';
  linkInput.placeholder = 'https://example.com';
  linkInput.setAttribute('aria-label', 'Link URL');
  linkInput.style.display = 'none';
  menu.appendChild(linkInput);

  // While the URL field is open, focus is outside the editor, so remember
  // which text the link is for.
  let linkMode = false;
  let savedSelection: EditorSelection | null = null;
  let lastRect: DOMRect | null = null;

  const buttons = [
    { label: 'B', title: 'Bold', action: () => editor.chain().toggleBold().run() },
    { label: 'I', title: 'Italic', action: () => editor.chain().toggleItalic().run() },
    { label: 'U', title: 'Underline', action: () => editor.chain().toggleUnderline().run() },
    { label: 'S', title: 'Strikethrough', action: () => editor.chain().toggleStrike().run() },
    { label: '🖍', title: 'Highlight', action: () => editor.chain().toggleHighlight().run() },
    { label: '</>', title: 'Code', action: () => editor.chain().toggleMark({ type: 'code' }).run() },
    { label: '🔗', title: 'Link', action: () => openLinkField() },
    { label: 'H1', title: 'Heading 1', action: () => editor.chain().setHeading(1).run() },
    { label: 'H2', title: 'Heading 2', action: () => editor.chain().setHeading(2).run() },
    { label: '”', title: 'Quote', action: () => editor.chain().setBlockType('blockquote').run() },
  ];

  let linkButton: HTMLButtonElement | null = null;

  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'levit-bubble-btn';
    btn.textContent = b.label;
    btn.title = b.title;
    btn.setAttribute('aria-label', b.title);
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      b.action();
      updateVisibility();
    });
    if (b.title === 'Link') linkButton = btn;
    buttonRow.appendChild(btn);
  }

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
        linkButton?.classList.toggle('is-active', editor.getActiveLink() !== null);
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

  return {
    element: menu,
    show,
    hide,
    destroy: () => {
      document.removeEventListener('selectionchange', updateVisibility);
      menu.remove();
    },
  };
}
