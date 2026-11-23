import type { LevitEditor } from '../core/editor.js';
import { getBlockText } from '../core/model/document.js';
import type { EditorPosition } from '../core/model/types.js';

/** An entry of an autocomplete popup. */
export interface AutocompleteItem {
  id: string;
  title: string;
  description?: string;
  /** A short text drawn before the title, like an emoji or "H1". */
  icon?: string;
}

/** The character that opened the popup and what was typed after it. */
export interface AutocompleteRange {
  from: EditorPosition;
  to: EditorPosition;
}

export interface AutocompleteOptions<T extends AutocompleteItem> {
  /** The character that opens the popup, like "@" or ":". */
  char: string;
  /** The popup's name for screen readers. */
  label: string;
  /** The entries for what was typed after the character, now or later (a Promise). */
  items: (query: string) => readonly T[] | Promise<readonly T[]>;
  /**
   * Runs when an entry is picked. `range` is the character and what was
   * typed after it, to replace; null when that text has changed meanwhile.
   */
  onSelect: (item: T, range: AutocompleteRange | null) => void;
  /** Spaces may be typed after the first character ("@Kim Min"). Default false. */
  allowSpaces?: boolean;
  /** How many characters must follow before anything shows. Default 0. */
  minQuery?: number;
  /** The start of the popup's class names. Default 'levit-autocomplete'. */
  classPrefix?: string;
  /** Another class name for the popup, like 'levit-mention-menu'. */
  className?: string;
  /** Tab picks the highlighted entry too. Default true; false leaves Tab to the editor. */
  selectOnTab?: boolean;
}

export interface AutocompleteInstance {
  element: HTMLElement;
  /** True while the popup shows entries and takes the arrows and Enter. */
  isOpen: () => boolean;
  close: () => void;
  destroy: () => void;
}

let popupCount = 0;

/** How far the popup stays from the right edge of the window. */
const RIGHT_ROOM = 260;
/** The gap between the caret's line and the popup. */
const GAP = 6;

/**
 * A popup of entries that opens when a character is typed at the start of a
 * line or after a space, narrows as more is typed, and is picked with the
 * arrows and Enter (or Tab) or the mouse. Focus stays in the text: the
 * editor points at the highlighted entry with aria-activedescendant.
 */
export function createAutocomplete<T extends AutocompleteItem>(editor: LevitEditor, options: AutocompleteOptions<T>): AutocompleteInstance {
  const { char, minQuery = 0, allowSpaces = false, selectOnTab = true } = options;
  const prefix = options.classPrefix ?? 'levit-autocomplete';
  const menu = document.createElement('div');
  menu.className = options.className ? `${prefix}-menu ${options.className}` : `${prefix}-menu`;
  menu.id = `${prefix}-menu-${++popupCount}`;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', options.label);
  menu.style.display = 'none';

  /** Where the character is, while the popup follows what is typed after it. */
  let at: EditorPosition | null = null;
  // True from the keydown until the character is in the document.
  let pending = false;
  let query = '';
  let shownItems: readonly T[] = [];
  let activeIndex = 0;
  // Counts queries, so a late answer for an old one is dropped.
  let request = 0;
  // While newer entries are on the way, Enter waits for them.
  let loading = false;
  let pickWhenLoaded = false;
  let positionTimer: ReturnType<typeof setTimeout> | undefined;

  const visible = () => at !== null && shownItems.length > 0;

  // Built with textContent: entries can come from apps and other users.
  const part = (tag: string, className: string, text?: string) => {
    const el = document.createElement(tag);
    el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  };

  function point() {
    if (visible()) {
      editor.container.setAttribute('aria-controls', menu.id);
      editor.container.setAttribute('aria-activedescendant', `${menu.id}-${activeIndex}`);
    } else if (editor.container.getAttribute('aria-controls') === menu.id) {
      editor.container.removeAttribute('aria-controls');
      editor.container.removeAttribute('aria-activedescendant');
    }
  }

  function renderList() {
    menu.replaceChildren();
    shownItems.forEach((item, index) => {
      const el = part('div', `${prefix}-item${index === activeIndex ? ' is-active' : ''}`);
      el.id = `${menu.id}-${index}`;
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(index === activeIndex));
      if (item.icon !== undefined) {
        const icon = part('span', `${prefix}-icon`, item.icon);
        icon.setAttribute('aria-hidden', 'true');
        el.append(icon);
      }
      const content = part('div', `${prefix}-content`);
      content.append(part('div', `${prefix}-title`, item.title));
      if (item.description !== undefined) content.append(part('div', `${prefix}-desc`, item.description));
      el.append(content);
      el.addEventListener('mousedown', (e) => {
        e.preventDefault();
        select(index);
      });
      menu.appendChild(el);
    });
    // Keep the highlighted entry in view when the list scrolls.
    (menu.children[activeIndex] as HTMLElement | undefined)?.scrollIntoView?.({ block: 'nearest' });
    point();
  }

  /** Shows the popup under the caret once the typed text is drawn. */
  function place() {
    if (menu.style.display !== 'none' || positionTimer !== undefined) return;
    positionTimer = setTimeout(() => {
      positionTimer = undefined;
      const sel = window.getSelection();
      if (!visible() || !sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      menu.style.display = 'block';
      menu.style.top = `${rect.bottom + window.scrollY + GAP}px`;
      menu.style.left = `${Math.min(rect.left + window.scrollX, window.innerWidth - RIGHT_ROOM)}px`;
    }, 10);
  }

  function show(list: readonly T[]) {
    loading = false;
    if (!at) return;
    if (list.length === 0) return close();
    shownItems = list;
    activeIndex = 0;
    renderList();
    place();
    if (pickWhenLoaded) select(0);
  }

  function load(q: string) {
    const token = ++request;
    if (q.length < minQuery) {
      shownItems = [];
      menu.style.display = 'none';
      menu.replaceChildren();
      point();
      return;
    }
    const result = options.items(q);
    if (result instanceof Promise) {
      loading = true;
      result.then(
        (list) => token === request && show(list),
        () => token === request && close()
      );
    } else show(result);
  }

  function select(index: number) {
    const item = shownItems[index];
    const from = at;
    const typed = `${char}${query}`;
    close();
    if (!item || !from) return;
    const block = editor.state.doc.blocks.find((b) => b.id === from.blockId);
    // Only when the text there is still exactly what was typed.
    const same = !!block && getBlockText(block).slice(from.offset, from.offset + typed.length) === typed;
    options.onSelect(item, same ? { from, to: { blockId: from.blockId, offset: from.offset + typed.length } } : null);
  }

  /** Follows the document after each change: the query, or closing. */
  function sync() {
    if (!at) return;
    const { selection, doc } = editor.state;
    const block = doc.blocks.find((b) => b.id === at!.blockId);
    if (!block || !selection.isCollapsed || selection.head.blockId !== at.blockId) return close();
    const text = getBlockText(block);
    if (text[at.offset] !== char || selection.head.offset <= at.offset) {
      // Before the character goes in, the caret is still in front of it.
      if (pending && selection.head.offset === at.offset) return;
      return close();
    }
    pending = false;
    const next = text.slice(at.offset + 1, selection.head.offset);
    // "a @ b": a space right after the character means it was just the character.
    if (/^\s/.test(next) || (!allowSpaces && /\s/.test(next))) return close();
    if (next !== query) {
      query = next;
      load(query);
    }
  }

  /** The character opens the popup at the start of a line or after a space, never inside a word or code. */
  function opensHere(): EditorPosition | null {
    const { selection, doc } = editor.state;
    if (!selection.isCollapsed) return null;
    const block = doc.blocks.find((b) => b.id === selection.head.blockId);
    if (!block || block.type === 'code_block') return null;
    const offset = selection.head.offset;
    const before = getBlockText(block)[offset - 1];
    return offset === 0 || /\s/.test(before) ? { blockId: block.id, offset } : null;
  }

  function open(from: EditorPosition) {
    at = from;
    pending = true;
    query = '';
    load(query);
  }

  function close() {
    at = null;
    loading = false;
    pickWhenLoaded = false;
    pending = false;
    query = '';
    shownItems = [];
    request++;
    clearTimeout(positionTimer);
    positionTimer = undefined;
    menu.style.display = 'none';
    point();
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (!at) {
      // Shortcuts such as Mod+/ type nothing; Option on a Mac and AltGr
      // (Ctrl+Alt) type characters, like "@" on German keyboards.
      if (e.key === char && !e.metaKey && !(e.ctrlKey && !e.altKey)) {
        const from = opensHere();
        if (from) open(from);
      }
      return;
    }
    // While an IME composes text, Enter and the arrows belong to it.
    if (!visible() || e.isComposing || editor.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      activeIndex = (activeIndex + step + shownItems.length) % shownItems.length;
      renderList();
    } else if (e.key === 'Enter' || (selectOnTab && e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      // The list is for an older query: pick from the newer one once it is here.
      if (loading) pickWhenLoaded = true;
      else select(activeIndex);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  // A click anywhere but the popup closes it.
  const onPointerDown = (e: MouseEvent) => {
    if (at && !menu.contains(e.target as Node)) close();
  };
  // Every change and every caret move, including undo and quiet selection moves.
  const stops = [editor.on('transaction', sync), editor.on('update', sync), editor.on('selectionUpdate', sync), editor.on('blur', close)];
  document.addEventListener('mousedown', onPointerDown, true);
  // Capture phase: before the editor's own keydown handler, so Enter picks
  // the entry instead of splitting the line.
  editor.container.addEventListener('keydown', handleKeyDown, true);
  document.body.append(menu);

  return {
    element: menu,
    isOpen: visible,
    close,
    destroy: () => {
      close();
      for (const stop of stops) stop();
      document.removeEventListener('mousedown', onPointerDown, true);
      editor.container.removeEventListener('keydown', handleKeyDown, true);
      menu.remove();
    },
  };
}
