import { LevitEditor } from '../core/editor';

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

  const buttons = [
    { label: 'B', title: 'Bold', action: () => editor.chain().toggleBold().run() },
    { label: 'I', title: 'Italic', action: () => editor.chain().toggleItalic().run() },
    { label: 'U', title: 'Underline', action: () => editor.chain().toggleUnderline().run() },
    { label: '</>', title: 'Code', action: () => editor.chain().toggleMark({ type: 'code' }).run() },
    { label: 'H1', title: 'Heading 1', action: () => editor.chain().setHeading(1).run() },
    { label: 'H2', title: 'Heading 2', action: () => editor.chain().setHeading(2).run() },
    { label: '”', title: 'Quote', action: () => editor.state.tr.setBlockType('blockquote').apply() },
  ];

  for (const b of buttons) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'levit-bubble-btn';
    btn.textContent = b.label;
    btn.title = b.title;
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      b.action();
      updateVisibility();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);

  function updateVisibility() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editor.container.contains(sel.anchorNode)) {
      menu.style.display = 'none';
      return;
    }

    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        show(rect);
        return;
      }
    }
    menu.style.display = 'none';
  }

  function show(rect: DOMRect) {
    menu.style.display = 'flex';
    const menuRect = menu.getBoundingClientRect();
    const top = Math.max(10, rect.top - menuRect.height - 8 + window.scrollY);
    const left = Math.max(10, rect.left + rect.width / 2 - menuRect.width / 2 + window.scrollX);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function hide() {
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

