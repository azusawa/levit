import { LevitEditor } from '../core/editor.js';
import { sanitizeImageSrc } from '../core/model/sanitize.js';
import type { EditorSelection } from '../core/model/types.js';
import { format } from '../i18n/messages.js';
import { createAutocomplete } from './autocomplete.js';

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

/** Opens a file picker for the uploadImage option. */
function chooseImageFiles(editor: LevitEditor): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.addEventListener('change', () => {
    void editor.uploadImages(Array.from(input.files ?? []));
  });
  input.click();
}

/** The size grid: up to this many columns and rows. */
const GRID_COLS = 10;
const GRID_ROWS = 8;
/** The biggest table a typed size ("/table 4x3") makes. */
const MAX_TYPED_SIZE = 20;

/**
 * A query for a table of some size, columns first: "table 4x3", "표 4x3" or
 * "4x3". While it is typed ("table ", "table 4", "4x"), size is null. Null
 * when the query is not one: "heading", "2024", "a1".
 */
function tableQuery(query: string): { name: string; size: { cols: number; rows: number } | null } | null {
  const match = /^(\D*?)(\s*)(\d*)\s*([x×]?)\s*(\d*)\s*$/i.exec(query);
  if (!match) return null;
  const [, name, space, cols, x, rows] = match;
  if (!cols && (x || rows)) return null;
  if (!cols && !space) return null;
  if ([cols, rows].some((n) => n && (n.length > 2 || Number(n) < 1 || Number(n) > MAX_TYPED_SIZE))) return null;
  // After a name the size needs a space ("table 4"); alone it needs the x ("4x").
  if (name ? !space : !x) return null;
  return { name, size: cols && rows ? { cols: Number(cols), rows: Number(rows) } : null };
}

const slashMenus = new WeakMap<LevitEditor, SlashMenuInstance>();

/** The slash menu of an editor. An editor has one: calling this again returns it. */
export function createSlashMenu(editor: LevitEditor): SlashMenuInstance {
  const existing = slashMenus.get(editor);
  if (existing) return existing;
  const m = editor.messages;

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
      id: 'callout-block',
      title: m.callout,
      description: m.calloutDescription,
      icon: '💡',
      action: (ed) => ed.dispatch(ed.state.tr.setBlockType('callout_block')),
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
      // Files when uploads are set up, otherwise a URL.
      action: (ed) => (ed.canUploadImages ? chooseImageFiles(ed) : openUrlField()),
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

  const matches = (item: SlashMenuItem, q: string) => {
    const needle = q.toLowerCase();
    return !needle || item.title.toLowerCase().includes(needle) || item.id.toLowerCase().includes(needle);
  };

  /** The entries for a query. A size at its end ("table 4x3") leaves only a table of that size. */
  function itemsFor(q: string): SlashMenuItem[] {
    const list = available();
    if (!list.includes(tableItem)) return list.filter((item) => matches(item, q));
    const sized = tableQuery(q);
    const name = (sized ? sized.name : q).toLowerCase();
    const isTable = !!sized && [tableItem.title, tableItem.id].some((t) => t.toLowerCase().startsWith(name));
    if (sized?.size) {
      const { cols, rows } = sized.size;
      return isTable ? [{ ...tableItem, title: `${tableItem.title} ${cols}×${rows}`, action: (ed) => ed.chain().insertTable(rows, cols).run() }] : [];
    }
    // While a size is being typed ("table 4"), the table entry stays.
    const found = list.filter((item) => matches(item, q) || (item === tableItem && isTable));
    // Names that start with the query first: "/표" is Table before Bulleted List (글머리표 목록).
    const starts = (item: SlashMenuItem) => (name && item.title.toLowerCase().startsWith(name) ? 0 : 1);
    return found.sort((a, b) => starts(a) - starts(b));
  }

  // The size grid's keys come first (capture phase, before the editor's own
  // handler): the Enter that picks Table must not also insert the table.
  editor.container.addEventListener('keydown', handleKeyDown, true);

  // The list itself: "/" at the start of a line or after a space opens it.
  const popup = createAutocomplete(editor, {
    char: '/',
    label: m.slashMenuLabel,
    classPrefix: 'levit-slash',
    // "/table 4x3": the query may hold spaces, though not right after the "/".
    allowSpaces: true,
    // Tab stays with tables and lists: next cell, indent.
    selectOnTab: false,
    items: itemsFor,
    onSelect: (item, range) => {
      // Take out the "/" and what was typed after it; the rest of the line stays.
      if (range) editor.dispatch(editor.state.tr.setSelection({ anchor: range.from, head: range.to, isCollapsed: false }).deleteRange());
      item.action(editor);
    },
  });
  const menu = popup.element;

  /** The grid and the URL field live in <body> too: they take the menu's theme (set by <levit-editor>). */
  function followTheme(el: HTMLElement) {
    const theme = menu.getAttribute('data-theme');
    if (theme) el.setAttribute('data-theme', theme);
    else el.removeAttribute('data-theme');
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
  grid.style.gridTemplateColumns = `repeat(${GRID_COLS}, auto)`;
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
  // Where the caret was when the grid opened: it closes when the caret moves.
  let pickerAt: { blockId: string; offset: number } | null = null;

  function setSize(cols: number, rows: number) {
    size = { cols: Math.min(Math.max(cols, 1), GRID_COLS), rows: Math.min(Math.max(rows, 1), GRID_ROWS) };
    for (const el of gridCells) {
      el.classList.toggle('is-on', Number(el.dataset.cols) <= size.cols && Number(el.dataset.rows) <= size.rows);
    }
    sizeText.textContent = format(m.tableSize, { cols: String(size.cols), rows: String(size.rows) });
  }

  /** Opens the grid under the caret's line, where the table will go. */
  function openPicker() {
    followTheme(picker);
    pickerOpen = true;
    setSize(3, 3);
    const id = editor.state.selection.head.blockId;
    const line = editor.container.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    const rect = (line ?? editor.container).getBoundingClientRect();
    picker.style.display = 'block';
    pickerAt = { ...editor.state.selection.head };
    // Keep it inside the window, like the menu.
    const width = picker.getBoundingClientRect().width;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10));
    picker.style.top = `${rect.bottom + 6 + window.scrollY}px`;
    picker.style.left = `${left + window.scrollX}px`;
  }

  /** Closes the grid when the document changes or the caret moves. */
  function followEditor() {
    if (!pickerOpen) return;
    const { head } = editor.state.selection;
    if (head.blockId !== pickerAt?.blockId || head.offset !== pickerAt.offset) closePicker();
  }

  function closePicker() {
    if (!pickerOpen) return;
    pickerOpen = false;
    picker.style.display = 'none';
  }

  function insertPicked() {
    closePicker();
    editor.chain().insertTable(size.rows, size.cols).run();
  }

  const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'AltGraph']);
  const PICKER_MOVES: Record<string, [number, number]> = {
    ArrowRight: [1, 0],
    ArrowLeft: [-1, 0],
    ArrowDown: [0, 1],
    ArrowUp: [0, -1],
  };

  /** Keys while the grid is open. Returns true when the key was for the grid. */
  function handlePickerKey(e: KeyboardEvent): boolean {
    if (e.isComposing || editor.isComposing) return false;
    // A modifier pressed alone does nothing yet.
    if (MODIFIER_KEYS.has(e.key)) return false;
    const move = !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && PICKER_MOVES[e.key];
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

  // The URL field that choosing "Image" opens when there are no uploads. The
  // focus goes into it; Enter or Insert puts the image where the caret was,
  // Escape (or Enter with nothing typed) closes it.
  const urlBox = part('div', 'levit-image-url');
  urlBox.setAttribute('role', 'group');
  urlBox.setAttribute('aria-label', m.image);
  urlBox.style.display = 'none';
  const urlField = document.createElement('input');
  urlField.type = 'url';
  urlField.className = 'levit-bubble-link-input';
  urlField.placeholder = 'https://';
  urlField.setAttribute('aria-label', m.imageUrlPrompt);
  const urlInsert = part('button', 'levit-bubble-btn', m.insert) as HTMLButtonElement;
  urlInsert.type = 'button';
  urlBox.append(urlField, urlInsert);
  // Where the caret was: the field has the focus while it is open.
  let urlAt: EditorSelection | null = null;

  function openUrlField() {
    followTheme(urlBox);
    urlAt = editor.state.selection;
    const id = urlAt.head.blockId;
    const line = editor.container.querySelector(`[data-block-id="${CSS.escape(id)}"]`);
    const rect = (line ?? editor.container).getBoundingClientRect();
    urlField.value = '';
    urlField.removeAttribute('aria-invalid');
    urlBox.style.display = 'flex';
    const width = urlBox.getBoundingClientRect().width;
    const left = Math.max(10, Math.min(rect.left, window.innerWidth - width - 10));
    urlBox.style.top = `${rect.bottom + 6 + window.scrollY}px`;
    urlBox.style.left = `${left + window.scrollX}px`;
    urlField.focus();
  }

  /** Closes the field and puts the focus and caret back in the editor. */
  function closeUrlField() {
    if (urlBox.style.display === 'none') return;
    const at = urlAt;
    urlAt = null;
    urlBox.style.display = 'none';
    if (!at) return;
    editor.container.focus({ preventScroll: true });
    editor.dispatch(editor.state.tr.setSelection(at));
  }

  function insertUrl() {
    const src = urlField.value.trim();
    if (src && !sanitizeImageSrc(src)) {
      urlField.setAttribute('aria-invalid', 'true');
      urlField.focus();
      return;
    }
    closeUrlField();
    if (src) editor.chain().insertImage({ src }).run();
  }

  urlField.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      insertUrl();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeUrlField();
    }
  });
  urlField.addEventListener('input', () => urlField.removeAttribute('aria-invalid'));
  urlInsert.addEventListener('mousedown', (e) => {
    e.preventDefault();
    insertUrl();
  });
  urlInsert.addEventListener('click', (e) => {
    if (e.detail === 0) insertUrl();
  });
  // Focus going anywhere else closes it, leaving the caret where it is.
  urlBox.addEventListener('focusout', (e) => {
    if (e.relatedTarget instanceof Node && urlBox.contains(e.relatedTarget)) return;
    urlAt = null;
    urlBox.style.display = 'none';
  });

  function handleKeyDown(e: KeyboardEvent) {
    if (pickerOpen) handlePickerKey(e);
  }
  // A click anywhere but the grid closes it.
  const onPointerDown = (e: MouseEvent) => {
    if (pickerOpen && !picker.contains(e.target as Node)) closePicker();
  };
  // Every change and every caret move closes the grid.
  const offPickerUpdate = editor.on('update', closePicker);
  const offPickerSelection = editor.on('selectionUpdate', followEditor);
  const offBlur = editor.on('blur', closePicker);
  document.addEventListener('mousedown', onPointerDown, true);

  document.body.append(picker, urlBox);

  const instance: SlashMenuInstance = {
    element: menu,
    getItems: () => [...available()],
    destroy: () => {
      slashMenus.delete(editor);
      popup.destroy();
      offBlur();
      offPickerUpdate();
      offPickerSelection();
      document.removeEventListener('mousedown', onPointerDown, true);
      editor.container.removeEventListener('keydown', handleKeyDown, true);
      picker.remove();
      urlBox.remove();
    },
  };
  slashMenus.set(editor, instance);
  return instance;
}

