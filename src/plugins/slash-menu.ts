import { LevitEditor } from '../core/editor.js';
import { getBlockText } from '../core/model/document.js';

export interface SlashMenuItem {
  id: string;
  title: string;
  description: string;
  icon: string;
  action: (editor: LevitEditor) => void;
}

export interface SlashMenuInstance {
  element: HTMLElement;
  getItems: () => SlashMenuItem[];
  destroy: () => void;
}

export function createSlashMenu(editor: LevitEditor): SlashMenuInstance {
  const menu = document.createElement('div');
  menu.className = 'levit-slash-menu';
  menu.style.display = 'none';

  let activeIndex = 0;
  let isOpen = false;

  const items: SlashMenuItem[] = [
    {
      id: 'paragraph',
      title: 'Text',
      description: 'Plain body text',
      icon: '📝',
      action: (ed) => ed.chain().setParagraph().run(),
    },
    {
      id: 'heading-1',
      title: 'Heading 1',
      description: 'Large section heading',
      icon: 'H1',
      action: (ed) => ed.chain().setHeading(1).run(),
    },
    {
      id: 'heading-2',
      title: 'Heading 2',
      description: 'Medium section heading',
      icon: 'H2',
      action: (ed) => ed.chain().setHeading(2).run(),
    },
    {
      id: 'heading-3',
      title: 'Heading 3',
      description: 'Small subsection heading',
      icon: 'H3',
      action: (ed) => ed.chain().setHeading(3).run(),
    },
    {
      id: 'blockquote',
      title: 'Quote',
      description: 'Capture a quote or citation',
      icon: '💬',
      action: (ed) => ed.dispatch(ed.state.tr.setBlockType('blockquote')),
    },
    {
      id: 'code-block',
      title: 'Code Block',
      description: 'Code snippet with syntax format',
      icon: '💻',
      action: (ed) => ed.dispatch(ed.state.tr.setBlockType('code_block')),
    },
    {
      id: 'bullet-list',
      title: 'Bulleted List',
      description: 'Simple list with bullets',
      icon: '•',
      action: (ed) => ed.chain().setBlockType('bullet_list_item').run(),
    },
    {
      id: 'ordered-list',
      title: 'Numbered List',
      description: 'List numbered in order',
      icon: '1.',
      action: (ed) => ed.chain().setBlockType('ordered_list_item').run(),
    },
    {
      id: 'task-list',
      title: 'To-do List',
      description: 'Track tasks with checkboxes',
      icon: '☑',
      action: (ed) => ed.chain().setBlockType('task_list_item', { checked: false }).run(),
    },
  ];

  function renderList() {
    menu.innerHTML = '';
    items.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = `levit-slash-item ${index === activeIndex ? 'is-active' : ''}`;
      el.innerHTML = `
        <span class="levit-slash-icon">${item.icon}</span>
        <div class="levit-slash-content">
          <div class="levit-slash-title">${item.title}</div>
          <div class="levit-slash-desc">${item.description}</div>
        </div>
      `;
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectItem(index);
      });
      menu.appendChild(el);
    });
  }

  function selectItem(index: number) {
    const item = items[index];
    if (item) {
      // Clear slash if present
      const currentBlock = editor.state.doc.blocks.find(
        (b) => b.id === editor.state.selection.anchor.blockId
      );
      if (currentBlock && getBlockText(currentBlock) === '/') {
        editor.chain().deleteBackward().run();
      }
      item.action(editor);
    }
    close();
  }

  let positionTimer: ReturnType<typeof setTimeout> | undefined;

  // Mark the menu open right away so keys pressed before it is shown
  // (Escape, Enter, arrows) are handled by the menu, not the editor.
  function open() {
    isOpen = true;
    activeIndex = 0;
    renderList();
    // Wait for the "/" to be rendered so the caret rect points at it.
    positionTimer = setTimeout(() => {
      positionTimer = undefined;
      const sel = window.getSelection();
      if (!isOpen || !sel || sel.rangeCount === 0) return;
      show(sel.getRangeAt(0).getBoundingClientRect());
    }, 10);
  }

  function show(rect: DOMRect) {
    menu.style.display = 'block';

    const top = rect.bottom + window.scrollY + 6;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 260);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function close() {
    isOpen = false;
    clearTimeout(positionTimer);
    positionTimer = undefined;
    menu.style.display = 'none';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) {
      if (e.key === '/') open();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % items.length;
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + items.length) % items.length;
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  // Capture phase: run before the editor's own keydown handler, so Enter picks
  // the menu item instead of splitting the block.
  editor.container.addEventListener('keydown', handleKeyDown, true);
  document.body.appendChild(menu);

  return {
    element: menu,
    getItems: () => [...items],
    destroy: () => {
      close();
      editor.container.removeEventListener('keydown', handleKeyDown, true);
      menu.remove();
    },
  };
}

