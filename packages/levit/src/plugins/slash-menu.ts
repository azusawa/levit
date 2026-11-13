import { LevitEditor } from '../core/editor.js';
import { getBlockText } from '../core/model/document.js';
import { format } from '../i18n/messages.js';

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

/** The size grid: up to this many columns and rows. */
const GRID_COLS = 10;
const GRID_ROWS = 8;
/** The biggest table a typed size ("/table 4x3") makes. */
const MAX_TYPED_SIZE = 20;

/** A query that ends in a table size, columns first: "table 4x3", "4×3". */
function sizedQuery(query: string): { name: string; cols: number; rows: number } | null {
  const match = /^(.*?)\s*(\d+)\s*[x×]\s*(\d+)$/i.exec(query);
  return match && { name: match[1], cols: Number(match[2]), rows: Number(match[3]) };
}

/** The query without a size being typed at its end: "table 4x" is "table". */
const withoutPartialSize = (query: string) => /^(.*?)\s*(\d+\s*[x×]?)?\s*$/i.exec(query)![1];

const slashMenus = new WeakMap<LevitEditor, SlashMenuInstance>();

/** The slash menu of an editor. An editor has one: calling this again returns it. */
export function createSlashMenu(editor: LevitEditor): SlashMenuInstance {
  const existing = slashMenus.get(editor);
  if (existing) return existing;
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
    {
      id: 'table',
      title: m.table,
      description: m.tableDescription,
      icon: '▦',
      action: () => openPicker(),
    },
  ];
  const tableItem = items[items.length - 1];

  // In a table, the menu changes the table instead: block types do not apply to cells.
  const tableItems: SlashMenuItem[] = [
    { id: 'add-row-above', title: m.addRowAbove, description: m.addRowAboveDescription, icon: '↑', action: (ed) => ed.chain().addRowBefore().run() },
    { id: 'add-row-below', title: m.addRowBelow, description: m.addRowBelowDescription, icon: '↓', action: (ed) => ed.chain().addRowAfter().run() },
    { id: 'add-column-left', title: m.addColumnLeft, description: m.addColumnLeftDescription, icon: '←', action: (ed) => ed.chain().addColumnBefore().run() },
    { id: 'add-column-right', title: m.addColumnRight, description: m.addColumnRightDescription, icon: '→', action: (ed) => ed.chain().addColumnAfter().run() },
    { id: 'delete-row', title: m.deleteRow, description: m.deleteRowDescription, icon: '−', action: (ed) => ed.chain().deleteRow().run() },
    { id: 'delete-column', title: m.deleteColumn, description: m.deleteColumnDescription, icon: '−', action: (ed) => ed.chain().deleteColumn().run() },
    { id: 'header-row', title: m.headerRow, description: m.headerRowDescription, icon: 'H', action: (ed) => ed.chain().toggleHeaderRow().run() },
    { id: 'delete-table', title: m.deleteTable, description: m.deleteTableDescription, icon: '✕', action: (ed) => ed.chain().deleteTable().run() },
  ];

  // Entries from the editor's plugins go after the built-in ones.
  const text = (value: string | ((ed: LevitEditor) => string)) => (typeof value === 'function' ? value(editor) : value);
  const pluginItems = editor.schema.slashItems.map((item) => ({ ...item, title: text(item.title), description: text(item.description) }));
  items.push(...pluginItems);
  tableItems.push(...pluginItems);

  /** The entries for where the caret is. */
  const available = () => (editor.isInTable() ? tableItems : items);

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
  let shownItems: SlashMenuItem[] = [];

  const matches = (item: SlashMenuItem, q: string) => {
    const needle = q.toLowerCase();
    return !needle || item.title.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle);
  };

  /** The entries for a query. A size at its end ("table 4x3") leaves only a table of that size. */
  function itemsFor(q: string): SlashMenuItem[] {
    const list = available();
    if (!list.includes(tableItem)) return list.filter((item) => matches(item, q));
    const sized = sizedQuery(q);
    if (sized) {
      const { name, cols, rows } = sized;
      const fits = cols >= 1 && rows >= 1 && cols <= MAX_TYPED_SIZE && rows <= MAX_TYPED_SIZE;
      if (!fits || !matches(tableItem, name)) return [];
      return [{ ...tableItem, title: `${tableItem.title} ${cols}×${rows}`, action: (ed) => ed.chain().insertTable(rows, cols).run() }];
    }
    // While a size is being typed ("table 4"), the table entry stays.
    const found = list.filter((item) => matches(item, q) || (item === tableItem && matches(item, withoutPartialSize(q))));
    // Names that start with the query first: "/표" is Table before Bulleted List (글머리표 목록).
    const name = withoutPartialSize(q).toLowerCase();
    const starts = (item: SlashMenuItem) => (name && item.title.toLowerCase().startsWith(name) ? 0 : 1);
    return found.sort((a, b) => starts(a) - starts(b));
  }

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
    const typed = at && editor.state.doc.blocks.find((b) => b.id === at.blockId);
    // Only when the text there is still exactly what was typed.
    if (at && typed && getBlockText(typed).slice(at.offset, at.offset + 1 + query.length) === `/${query}`) {
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
    // "red / blue": a space right after the "/" means it was just a slash.
    if (/^\s/.test(next)) return close();
    if (next !== query) {
      query = next;
      shownItems = itemsFor(query);
      if (shownItems.length === 0) return close();
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

  // The size grid that choosing "Table" opens. Focus stays in the text, as
  // with the menu: the arrows change the size, Enter inserts the table and
  // Escape closes the grid. The size is read out as it changes.
  const picker = part('div', 'levit-table-picker');
  picker.setAttribute('role', 'group');
  picker.setAttribute('aria-label', m.tableSizeLabel);
  picker.style.display = 'none';
  const grid = part('div', 'levit-table-picker-grid');
  grid.setAttribute('aria-hidden', 'true');
  const sizeText = part('div', 'levit-table-picker-size');
  sizeText.setAttribute('role', 'status');
  picker.append(grid, sizeText);
  const gridCells: HTMLElement[] = [];
  for (let r = 1; r <= GRID_ROWS; r++) {
    for (let c = 1; c <= GRID_COLS; c++) {
      const el = part('span', 'levit-table-picker-cell');
      el.dataset.cols = String(c);
      el.dataset.rows = String(r);
      el.addEventListener('mouseover', () => setSize(c, r));
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        setSize(c, r);
        insertPicked();
      });
      gridCells.push(el);
    }
  }
  grid.append(...gridCells);

  let pickerOpen = false;
  let size = { cols: 3, rows: 3 };

  function setSize(cols: number, rows: number) {
    size = { cols: Math.min(Math.max(cols, 1), GRID_COLS), rows: Math.min(Math.max(rows, 1), GRID_ROWS) };
    for (const el of gridCells) {
      el.classList.toggle('is-on', Number(el.dataset.cols) <= size.cols && Number(el.dataset.rows) <= size.rows);
    }
    sizeText.textContent = format(m.tableSize, { cols: String(size.cols), rows: String(size.rows) });
  }

  /** Opens the grid under the caret's line, where the table will go. */
  function openPicker() {
    pickerOpen = true;
    setSize(3, 3);
    const id = editor.state.selection.head.blockId;
    const line = editor.container.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    const rect = (line ?? editor.container).getBoundingClientRect();
    picker.style.top = `${rect.bottom + 6 + window.scrollY}px`;
    picker.style.left = `${rect.left + window.scrollX}px`;
    picker.style.display = 'block';
  }

  function closePicker() {
    pickerOpen = false;
    picker.style.display = 'none';
  }

  function insertPicked() {
    closePicker();
    editor.chain().insertTable(size.rows, size.cols).run();
  }

  const PICKER_MOVES: Record<string, [number, number]> = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  };

  /** Keys while the grid is open. Returns true when the key was for the grid. */
  function handlePickerKey(e: KeyboardEvent): boolean {
    if (e.isComposing || editor.isComposing) return false;
    const move = PICKER_MOVES[e.key];
    if (move) {
      setSize(size.cols + move[0], size.rows + move[1]);
    } else if (e.key === 'Enter') {
      insertPicked();
    } else if (e.key === 'Escape') {
      closePicker();
    } else {
      // Any other key closes the grid and does what it always does.
      closePicker();
      return false;
    }
    e.preventDefault();
    return true;
  }

  let positionTimer: ReturnType<typeof setTimeout> | undefined;

  // Mark the menu open right away so keys pressed before it is shown
  // (Escape, Enter, arrows) are handled by the menu, not the editor.
  function open(at: { blockId: string; offset: number }) {
    isOpen = true;
    pending = true;
    slash = at;
    query = '';
    shownItems = available();
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
    if (pickerOpen && handlePickerKey(e)) return;
    if (!isOpen) {
      // Mod+/ and other shortcuts type nothing.
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const at = opensHere();
        if (at) open(at);
      }
      return;
    }
    // While an IME composes text, Enter and the arrows belong to it.
    if (e.isComposing || editor.isComposing) return;

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
    if (pickerOpen && !picker.contains(e.target as Node)) closePicker();
  };
  // Every change and every caret move, including undo and quiet selection moves.
  const offTransaction = editor.on('transaction', sync);
  const offUpdate = editor.on('update', sync);
  const offSelection = editor.on('selectionUpdate', sync);
  const offBlur = editor.on('blur', () => {
    close();
    closePicker();
  });
  document.addEventListener('mousedown', onPointerDown, true);

  // Capture phase: run before the editor's own keydown handler, so Enter picks
  // the menu item instead of splitting the block.
  editor.container.addEventListener('keydown', handleKeyDown, true);
  document.body.append(menu, picker);

  const instance: SlashMenuInstance = {
    element: menu,
    getItems: () => [...available()],
    destroy: () => {
      slashMenus.delete(editor);
      close();
      offTransaction();
      offUpdate();
      offSelection();
      offBlur();
      document.removeEventListener('mousedown', onPointerDown, true);
      editor.container.removeEventListener('keydown', handleKeyDown, true);
      menu.remove();
      picker.remove();
    },
  };
  slashMenus.set(editor, instance);
  return instance;
}

