import type { LevitEditor } from '../core/editor.js';
import type { EditorPosition } from '../core/model/types.js';
import { findMatches, replaceMatches, type SearchMatch } from '../core/model/search.js';
import { findBlockIndex, getBlockText, orderedSelection } from '../core/model/document.js';
import { matchesShortcut } from '../core/plugin/plugin.js';
import { buildSearchPanelView, createMatchPainter, type SearchPanelView } from './search-panel-view.js';

export interface SearchPanelInstance {
  element: HTMLElement;
  readonly isOpen: boolean;
  /** Every match of the query, in document order (none while closed). */
  readonly matches: readonly SearchMatch[];
  /** Index of the current match in `matches`, or -1 when there is none. */
  readonly current: number;
  /** Shows the panel and focuses the find field. `replace: true` also shows the replace field. */
  open(options?: { replace?: boolean }): void;
  /** Hides the panel; the current match is selected in the editor. */
  close(): void;
  next(): void;
  previous(): void;
  /** Replaces the current match and goes to the next. Default text: the replace field's. */
  replace(text?: string): void;
  /** Replaces every match in one change. Returns how many were replaced. */
  replaceAll(text?: string): number;
  destroy(): void;
}

const SHORTCUT_FIND = 'Mod-f';
const SHORTCUT_REPLACE = 'Mod-Alt-f';
const EDGE = 8;
/** keyCode of a key that an IME is handling (Safari ends a composition with Enter like this). */
const IME_KEY_CODE = 229;

/** What the panel's controls do. */
interface PanelActions {
  search(): void;
  step(by: number): void;
  close(): void;
  replace(): void;
  replaceAll(): void;
  toggleReplace(): void;
  toggleCase(): void;
  /** Mod+F (with replace: Mod+Alt+F) while the panel has focus. */
  refocus(replace: boolean): void;
}

/** Mod+F or Mod+Alt+F, or null. On a Mac, Ctrl+F moves the caret and is left alone. */
function findShortcut(e: KeyboardEvent, mac: boolean): 'find' | 'replace' | null {
  if (mac && e.ctrlKey && !e.metaKey) return null;
  if (matchesShortcut(e, SHORTCUT_REPLACE)) return 'replace';
  return matchesShortcut(e, SHORTCUT_FIND) ? 'find' : null;
}

const isPlainEnter = (e: KeyboardEvent) => e.key === 'Enter' && !e.isComposing && e.keyCode !== IME_KEY_CODE;

function bindPanelEvents(view: SearchPanelView, actions: PanelActions, mac: boolean): void {
  view.findField.addEventListener('input', actions.search);
  view.toggle.addEventListener('click', actions.toggleReplace);
  view.caseButton.addEventListener('click', actions.toggleCase);
  view.previousButton.addEventListener('click', () => actions.step(-1));
  view.nextButton.addEventListener('click', () => actions.step(1));
  view.closeButton.addEventListener('click', actions.close);
  view.replaceButton.addEventListener('click', actions.replace);
  view.replaceAllButton.addEventListener('click', actions.replaceAll);

  view.panel.addEventListener('keydown', (e) => {
    const shortcut = findShortcut(e, mac);
    if (e.key === 'Escape') {
      e.preventDefault();
      actions.close();
    } else if (shortcut) {
      // Not the browser's own find bar.
      e.preventDefault();
      actions.refocus(shortcut === 'replace');
    } else if (!isPlainEnter(e)) {
      // An Enter that ends a composition only commits the text.
    } else if (e.target === view.findField) {
      e.preventDefault();
      actions.step(e.shiftKey ? -1 : 1);
    } else if (e.target === view.replaceField) {
      e.preventDefault();
      actions.replace();
    }
  });
}

/** Puts the panel at the top right of the editor's part of the window. */
function placePanel(panel: HTMLElement, editor: LevitEditor): void {
  const rect = editor.container.getBoundingClientRect();
  const width = panel.getBoundingClientRect().width;
  const right = Math.min(rect.right, window.innerWidth) - EDGE;
  panel.style.top = `${Math.max(rect.top, 0) + EDGE + window.scrollY}px`;
  panel.style.left = `${Math.max(EDGE, right - width) + window.scrollX}px`;
}

/** The selected text, when it is on one line (a field holds no line breaks): a good first query. */
function selectedText(editor: LevitEditor): string {
  const { doc, selection } = editor.state;
  if (selection.isCollapsed || selection.anchor.blockId !== selection.head.blockId) return '';
  const block = doc.blocks[findBlockIndex(doc, selection.anchor.blockId)];
  const { from, to } = orderedSelection(doc, selection);
  const text = block ? getBlockText(block).slice(from.offset, to.offset) : '';
  return text.includes('\n') ? '' : text;
}

/** Index of the first match at or after `start`, or -1 when there are none. */
function firstFrom(editor: LevitEditor, matches: readonly SearchMatch[], start: EditorPosition): number {
  if (matches.length === 0) return -1;
  const doc = editor.state.doc;
  const startIndex = findBlockIndex(doc, start.blockId);
  const index = matches.findIndex((match) => {
    const block = findBlockIndex(doc, match.blockId);
    return block > startIndex || (block === startIndex && match.from >= start.offset);
  });
  return Math.max(index, 0);
}

/** Runs a change from the panel, keeping focus on the panel's control. */
function dispatchKeepingFocus(panel: HTMLElement, run: () => void): void {
  const focused = document.activeElement;
  run();
  // The editor puts the page selection back into itself, which moves focus there.
  if (focused instanceof HTMLElement && panel.contains(focused) && document.activeElement !== focused) focused.focus();
}

const panels = new WeakMap<LevitEditor, SearchPanelInstance>();

/**
 * A find and replace panel for an editor: Mod+F in the editor opens it,
 * Mod+Alt+F opens it with the replace field. Enter and Shift+Enter go to the
 * next and previous match, Escape closes it. Matches are painted with the
 * CSS Custom Highlight API where the browser has it. An editor has one:
 * calling this again returns it.
 */
export function createSearchPanel(editor: LevitEditor): SearchPanelInstance {
  const existing = panels.get(editor);
  if (existing) return existing;
  const m = editor.messages;
  const view = buildSearchPanelView(m);
  const { panel, findField, replaceField, status } = view;
  const painter = createMatchPainter(editor);
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

  let isOpen = false;
  let caseSensitive = false;
  let matches: readonly SearchMatch[] = [];
  let current = -1;
  /** Where the search began: matches are counted from here. */
  let origin: EditorPosition | null = null;
  /** Where to search from after the panel's own replace, instead of the current match. */
  let afterReplace: EditorPosition | null = null;

  const caret = (): EditorPosition => orderedSelection(editor.state.doc, editor.state.selection).from;
  const currentStart = (): EditorPosition | null =>
    current === -1 ? null : { blockId: matches[current].blockId, offset: matches[current].from };

  function showCount() {
    if (!findField.value) status.textContent = '';
    else if (matches.length === 0) status.textContent = m.noResults;
    else status.textContent = editor.t('searchCount', { current: String(current + 1), total: String(matches.length) });
  }

  /** Paints the matches; `scroll` brings the current one into view (not on changes made elsewhere). */
  function draw(scroll: boolean) {
    showCount();
    const range = painter.paint(matches, current);
    if (!scroll || !range) return;
    const node = range.startContainer;
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /** Finds the query again; the current match becomes the first at or after `from`. */
  function search(from: EditorPosition | null, scroll: boolean) {
    matches = findMatches(editor.state.doc, findField.value, { caseSensitive });
    const start = from && findBlockIndex(editor.state.doc, from.blockId) !== -1 ? from : caret();
    current = firstFrom(editor, matches, start);
    draw(scroll);
  }

  function step(by: number) {
    if (!isOpen || matches.length === 0) return;
    current = (current + by + matches.length) % matches.length;
    draw(true);
  }

  function setReplaceShown(shown: boolean) {
    const canReplace = shown && editor.isEditable;
    view.replaceRow.hidden = !canReplace;
    view.toggle.setAttribute('aria-expanded', String(canReplace));
    panel.classList.toggle('is-replacing', canReplace);
  }

  function focusFind() {
    findField.focus();
    findField.select();
  }

  function open(options: { replace?: boolean } = {}) {
    const query = selectedText(editor);
    if (query) findField.value = query;
    view.toggle.hidden = !editor.isEditable;
    if (options.replace) setReplaceShown(true);
    else if (!editor.isEditable) setReplaceShown(false);
    isOpen = true;
    panel.hidden = false;
    origin = caret();
    search(origin, true);
    placePanel(panel, editor);
    focusFind();
  }

  function close() {
    if (!isOpen) return;
    const match = current === -1 ? null : matches[current];
    isOpen = false;
    panel.hidden = true;
    // Matches go stale once the panel stops following the document.
    matches = [];
    current = -1;
    painter.clear();
    editor.focus();
    if (!match) return;
    const anchor = { blockId: match.blockId, offset: match.from };
    const head = { blockId: match.blockId, offset: match.to };
    editor.dispatch(editor.state.tr.setSelection({ anchor, head, isCollapsed: false }));
  }

  function replace(text = replaceField.value) {
    if (!isOpen || !editor.isEditable || current === -1) return;
    const match = matches[current];
    const tr = editor.state.tr;
    if (replaceMatches(tr, [match], text) === 0) return;
    afterReplace = { blockId: match.blockId, offset: match.from + text.length };
    dispatchKeepingFocus(panel, () => editor.dispatch(tr));
  }

  function replaceAll(text = replaceField.value): number {
    if (!isOpen || !editor.isEditable || matches.length === 0) return 0;
    const tr = editor.state.tr;
    const count = replaceMatches(tr, matches, text);
    if (count === 0) return 0;
    dispatchKeepingFocus(panel, () => editor.dispatch(tr));
    status.textContent = editor.t('replacedCount', { count: String(count) });
    return count;
  }

  bindPanelEvents(view, {
    search: () => search(origin, true),
    step,
    close,
    replace: () => replace(),
    replaceAll: () => void replaceAll(),
    toggleReplace: () => setReplaceShown(view.replaceRow.hidden),
    toggleCase: () => {
      caseSensitive = !caseSensitive;
      view.caseButton.setAttribute('aria-pressed', String(caseSensitive));
      search(currentStart() ?? origin, true);
    },
    refocus: (withReplace) => {
      if (withReplace) setReplaceShown(true);
      focusFind();
    },
  }, mac);

  function handleEditorKeyDown(e: KeyboardEvent) {
    // A plugin's own Mod+F, or a key that belongs to an IME composition.
    if (e.defaultPrevented || e.isComposing) return;
    const shortcut = findShortcut(e, mac);
    if (!shortcut) return;
    e.preventDefault();
    open({ replace: shortcut === 'replace' });
  }
  editor.container.addEventListener('keydown', handleEditorKeyDown);

  const onMove = () => {
    if (isOpen) placePanel(panel, editor);
  };
  const stops = [
    editor.on('update', () => {
      if (!isOpen) return;
      const from = afterReplace ?? currentStart() ?? origin;
      afterReplace = null;
      search(from, false);
    }),
  ];
  window.addEventListener('resize', onMove);
  document.addEventListener('scroll', onMove, true);
  document.body.appendChild(panel);

  const instance: SearchPanelInstance = {
    element: panel,
    get isOpen() {
      return isOpen;
    },
    get matches() {
      return matches;
    },
    get current() {
      return current;
    },
    open,
    close,
    next: () => step(1),
    previous: () => step(-1),
    replace,
    replaceAll,
    destroy: () => {
      if (panels.get(editor) !== instance) return;
      panels.delete(editor);
      painter.clear();
      stops.forEach((stop) => stop());
      window.removeEventListener('resize', onMove);
      document.removeEventListener('scroll', onMove, true);
      editor.container.removeEventListener('keydown', handleEditorKeyDown);
      panel.remove();
    },
  };
  stops.push(editor.on('destroy', () => instance.destroy()));
  panels.set(editor, instance);
  return instance;
}
