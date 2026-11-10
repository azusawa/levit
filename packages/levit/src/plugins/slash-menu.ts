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

/** Opens a file picker when uploads are set up, otherwise asks for a URL. */
function chooseImage(editor: LevitEditor): void {
  if (editor.canUploadImages) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.addEventListener('change', () => {
      void editor.uploadImages(Array.from(input.files ?? []));
    });
    input.click();
    return;
  }
  const src = window.prompt(editor.messages.imageUrlPrompt);
  if (src && src.trim()) editor.chain().insertImage({ src: src.trim() }).run();
}

let menuCount = 0;

export function createSlashMenu(editor: LevitEditor): SlashMenuInstance {
  const m = editor.messages;
  const menu = document.createElement('div');
  menu.className = 'levit-slash-menu';
  // A listbox the editor points at with aria-activedescendant, so screen
  // readers announce the highlighted entry while focus stays in the text.
  menu.id = `levit-slash-menu-${++menuCount}`;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', m.slashMenuLabel);
  menu.style.display = 'none';

  let activeIndex = 0;
  let isOpen = false;

  const items: SlashMenuItem[] = [
    {
      id: 'paragraph',
      title: m.paragraph,
      description: m.paragraphDescription,
      icon: '📝',
      action: (ed) => ed.chain().setParagraph().run(),
    },
    {
      id: 'heading-1',
      title: m.heading1,
      description: m.heading1Description,
      icon: 'H1',
      action: (ed) => ed.chain().setHeading(1).run(),
    },
    {
      id: 'heading-2',
      title: m.heading2,
      description: m.heading2Description,
      icon: 'H2',
      action: (ed) => ed.chain().setHeading(2).run(),
    },
    {
      id: 'heading-3',
      title: m.heading3,
      description: m.heading3Description,
      icon: 'H3',
      action: (ed) => ed.chain().setHeading(3).run(),
    },
    {
      id: 'blockquote',
      title: m.quote,
      description: m.quoteDescription,
      icon: '💬',
      action: (ed) => ed.dispatch(ed.state.tr.setBlockType('blockquote')),
    },
    {
      id: 'code-block',
      title: m.codeBlock,
      description: m.codeBlockDescription,
      icon: '💻',
      action: (ed) => ed.dispatch(ed.state.tr.setBlockType('code_block')),
    },
    {
      id: 'bullet-list',
      title: m.bulletList,
      description: m.bulletListDescription,
      icon: '•',
      action: (ed) => ed.chain().setBlockType('bullet_list_item').run(),
    },
    {
      id: 'ordered-list',
      title: m.orderedList,
      description: m.orderedListDescription,
      icon: '1.',
      action: (ed) => ed.chain().setBlockType('ordered_list_item').run(),
    },
    {
      id: 'task-list',
      title: m.taskList,
      description: m.taskListDescription,
      icon: '☑',
      action: (ed) => ed.chain().setBlockType('task_list_item', { checked: false }).run(),
    },
    {
      id: 'divider',
      title: m.divider,
      description: m.dividerDescription,
      icon: '—',
      action: (ed) => ed.chain().insertHorizontalRule().run(),
    },
    {
      id: 'image',
      title: m.image,
      description: m.imageDescription,
      icon: '🖼',
      action: (ed) => chooseImage(ed),
    },
  ];

  // Entries from the editor's plugins go after the built-in ones.
  const text = (value: string | ((ed: LevitEditor) => string)) => (typeof value === 'function' ? value(editor) : value);
  items.push(...editor.schema.slashItems.map((item) => ({ ...item, title: text(item.title), description: text(item.description) })));

  // Built with textContent: titles can come from plugins and messages.
  const part = (tag: string, className: string, text?: string) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  /** Where the "/" that opened the menu is, and what was typed after it. */
  let slash: { blockId: string; offset: number } | null = null;
  // True from the "/" keydown until the "/" is in the document.
  let pending = false;
  let query = '';
  let shownItems: SlashMenuItem[] = items;

  const matches = (item: SlashMenuItem, q: string) => {
    const needle = q.trim().toLowerCase();
    return !needle || item.title.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle);
  };

  function renderList() {
    menu.replaceChildren();
    shownItems.forEach((item, index) => {
      const el = part('div', `levit-slash-item${index === activeIndex ? ' is-active' : ''}`);
      el.id = `${menu.id}-${index}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(index === activeIndex));
      const icon = part('span', 'levit-slash-icon', item.icon);
      icon.setAttribute('aria-hidden', 'true');
      const content = part('div', 'levit-slash-content');
      content.append(part('div', 'levit-slash-title', item.title), part('div', 'levit-slash-desc', item.description));
      el.append(icon, content);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectItem(index);
      });
      menu.appendChild(el);
    });
    if (isOpen) {
      editor.container.setAttribute('aria-controls', menu.id);
      editor.container.setAttribute('aria-activedescendant', `${menu.id}-${activeIndex}`);
    }
  }

  function selectItem(index: number) {
    const item = shownItems[index];
    const at = slash;
    close();
    if (!item) return;
    // Take out the "/" and what was typed after it; the rest of the line stays.
    if (at && editor.state.doc.blocks.some((b) => b.id === at.blockId)) {
      const end = { blockId: at.blockId, offset: at.offset + 1 + query.length };
      const start = { blockId: at.blockId, offset: at.offset };
      editor.dispatch(editor.state.tr.setSelection({ anchor: start, head: end, isCollapsed: false }).deleteRange());
    }
    item.action(editor);
  }

  /** Follows the document after each change: the query, or closing. */
  function sync() {
    if (!isOpen || !slash) return;
    const { selection, doc } = editor.state;
    const block = doc.blocks.find((b) => b.id === slash!.blockId);
    if (!block || !selection.isCollapsed || selection.head.blockId !== slash.blockId) return close();
    const text = getBlockText(block);
    if (text[slash.offset] !== '/' || selection.head.offset <= slash.offset) {
      // Before the "/" goes in, the caret is still in front of it.
      if (pending && selection.head.offset === slash.offset) return;
      return close();
    }
    pending = false;
    const next = text.slice(slash.offset + 1, selection.head.offset);
    if (next !== query) {
      query = next;
      shownItems = items.filter((item) => matches(item, query));
      if (shownItems.length === 0 || query.includes('\n')) return close();
      activeIndex = 0;
      renderList();
    }
  }

  /** "/" opens the menu at the start of a line or after a space, never inside a word or code. */
  function opensHere(): { blockId: string; offset: number } | null {
    const { selection, doc } = editor.state;
    if (!selection.isCollapsed) return null;
    const block = doc.blocks.find((b) => b.id === selection.head.blockId);
    if (!block || block.type === 'code_block') return null;
    const offset = selection.head.offset;
    const before = getBlockText(block)[offset - 1];
    return offset === 0 || /\s/.test(before) ? { blockId: block.id, offset } : null;
  }

  let positionTimer: ReturnType<typeof setTimeout> | undefined;

  // Mark the menu open right away so keys pressed before it is shown
  // (Escape, Enter, arrows) are handled by the menu, not the editor.
  function open(at: { blockId: string; offset: number }) {
    isOpen = true;
    pending = true;
    slash = at;
    query = '';
    shownItems = items;
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
    pending = false;
    slash = null;
    editor.container.removeAttribute('aria-controls');
    editor.container.removeAttribute('aria-activedescendant');
    clearTimeout(positionTimer);
    positionTimer = undefined;
    menu.style.display = 'none';
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!isOpen) {
      if (e.key === '/') {
        const at = opensHere();
        if (at) open(at);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % shownItems.length;
      renderList();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = (activeIndex - 1 + shownItems.length) % shownItems.length;
      renderList();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  // A click anywhere but the menu closes it.
  const onPointerDown = (e: MouseEvent) => {
    if (isOpen && !menu.contains(e.target as Node)) close();
  };
  const offTransaction = editor.on('transaction', sync);
  const offBlur = editor.on('blur', close);
  document.addEventListener('mousedown', onPointerDown, true);

  // Capture phase: run before the editor's own keydown handler, so Enter picks
  // the menu item instead of splitting the block.
  editor.container.addEventListener('keydown', handleKeyDown, true);
  document.body.appendChild(menu);

  return {
    element: menu,
    getItems: () => [...items],
    destroy: () => {
      close();
      offTransaction();
      offBlur();
      document.removeEventListener('mousedown', onPointerDown, true);
      editor.container.removeEventListener('keydown', handleKeyDown, true);
      menu.remove();
    },
  };
}

