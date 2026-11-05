import { LevitEditor } from '../core/editor';
import { getBlockText } from '../core/model/document';

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

  function open(rect: DOMRect) {
    isOpen = true;
    activeIndex = 0;
    renderList();
    menu.style.display = 'block';

    const top = rect.bottom + window.scrollY + 6;
    const left = Math.min(rect.left + window.scrollX, window.innerWidth - 260);
    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
  }

  function close() {
    isOpen = false;
    menu.style.display = 'none';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) {
      if (e.key === '/') {
        setTimeout(() => {
          const sel = window.getSelection();
          if (sel && sel.rangeCount > 0) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            open(rect);
          }
        }, 10);
      }
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

  editor.container.addEventListener('keydown', handleKeyDown);
  document.body.appendChild(menu);

  return {
    element: menu,
    getItems: () => [...items],
    destroy: () => {
      editor.container.removeEventListener('keydown', handleKeyDown);
      menu.remove();
    },
  };
}

