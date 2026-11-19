import type { LevitEditor } from '../core/editor.js';
import type { LevitMessages } from '../i18n/messages.js';
import type { SearchMatch } from '../core/model/search.js';
import { positionToDOMPoint } from '../core/view/selection.js';
import { lineIcon } from './toolbar-icons.js';

/** The elements of the search panel. */
export interface SearchPanelView {
  panel: HTMLElement;
  toggle: HTMLButtonElement;
  findField: HTMLInputElement;
  status: HTMLElement;
  caseButton: HTMLButtonElement;
  previousButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  replaceRow: HTMLElement;
  replaceField: HTMLInputElement;
  replaceButton: HTMLButtonElement;
  replaceAllButton: HTMLButtonElement;
}

const ICONS: Record<string, string[]> = {
  toggle: ['M6 4l4 4-4 4'],
  previous: ['M4 10l4-4 4 4'],
  next: ['M4 6l4 4 4-4'],
  close: ['M4 4l8 8M12 4l-8 8'],
};

function button(className: string, label: string, content: string | SVGSVGElement): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.append(content);
  return btn;
}

const iconButton = (className: string, label: string, icon: string) =>
  button(className, label, lineIcon(ICONS[icon], 'levit-search-fill'));

function textField(label: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'levit-search-input';
  input.placeholder = label;
  input.spellcheck = false;
  input.setAttribute('aria-label', label);
  return input;
}

function row(className: string, ...children: HTMLElement[]): HTMLElement {
  const el = document.createElement('div');
  el.className = className;
  el.append(...children);
  return el;
}

/** Builds the panel, hidden: a find row and a replace row under it. */
export function buildSearchPanelView(m: LevitMessages): SearchPanelView {
  const status = document.createElement('span');
  status.className = 'levit-search-status';
  status.setAttribute('role', 'status');
  const view: Omit<SearchPanelView, 'panel' | 'replaceRow'> = {
    toggle: iconButton('levit-search-btn levit-search-toggle', m.showReplace, 'toggle'),
    findField: textField(m.find),
    status,
    caseButton: button('levit-search-btn levit-search-case', m.matchCase, 'Aa'),
    previousButton: iconButton('levit-search-btn', m.previousMatch, 'previous'),
    nextButton: iconButton('levit-search-btn', m.nextMatch, 'next'),
    closeButton: iconButton('levit-search-btn', m.closeSearch, 'close'),
    replaceField: textField(m.replaceWith),
    replaceButton: button('levit-search-btn levit-search-text-btn', m.replace, m.replace),
    replaceAllButton: button('levit-search-btn levit-search-text-btn', m.replaceAll, m.replaceAll),
  };
  view.caseButton.setAttribute('aria-pressed', 'false');

  const findRow = row('levit-search-row', view.toggle, view.findField, status, view.caseButton, view.previousButton, view.nextButton, view.closeButton);
  const replaceRow = row('levit-search-row levit-search-replace', view.replaceField, view.replaceButton, view.replaceAllButton);
  replaceRow.id = `levit-search-replace-${Math.random().toString(36).slice(2)}`;
  replaceRow.hidden = true;
  view.toggle.setAttribute('aria-controls', replaceRow.id);
  view.toggle.setAttribute('aria-expanded', 'false');

  const panel = row('levit-search', findRow, replaceRow);
  panel.setAttribute('role', 'search');
  panel.setAttribute('aria-label', m.findAndReplace);
  panel.hidden = true;
  return { ...view, panel, replaceRow };
}

const HIGHLIGHT_ALL = 'levit-search';
const HIGHLIGHT_CURRENT = 'levit-search-current';

/**
 * The page's highlight for a name (CSS Custom Highlight API), shared by all
 * editors on the page; each panel adds and removes only its own ranges.
 * Null in browsers without the API: matches are then counted, not painted.
 */
function sharedHighlight(name: string, priority: number): Highlight | null {
  if (typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !CSS.highlights) return null;
  const existing = CSS.highlights.get(name);
  if (existing) return existing;
  const highlight = new Highlight();
  highlight.priority = priority;
  CSS.highlights.set(name, highlight);
  return highlight;
}

/** The DOM range of a match, or null when its block is not drawn. */
function rangeOf(editor: LevitEditor, match: SearchMatch): Range | null {
  const root = editor.container;
  const blockEl = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(match.blockId)}"]`);
  if (!blockEl) return null;
  const start = positionToDOMPoint(root, blockEl, match.from, true);
  const end = positionToDOMPoint(root, blockEl, match.to, false);
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

export interface MatchPainter {
  /** Paints the matches and the current one (-1: none); returns the current one's range. */
  paint(matches: readonly SearchMatch[], current: number): Range | null;
  clear(): void;
}

/** Paints one editor's matches without touching its DOM. */
export function createMatchPainter(editor: LevitEditor): MatchPainter {
  let painted: { all: readonly Range[]; current: Range | null } = { all: [], current: null };

  const clear = () => {
    const all = sharedHighlight(HIGHLIGHT_ALL, 0);
    const now = sharedHighlight(HIGHLIGHT_CURRENT, 1);
    for (const range of painted.all) all?.delete(range);
    if (painted.current) now?.delete(painted.current);
    painted = { all: [], current: null };
  };

  const paint = (matches: readonly SearchMatch[], current: number): Range | null => {
    clear();
    const all = sharedHighlight(HIGHLIGHT_ALL, 0);
    const now = sharedHighlight(HIGHLIGHT_CURRENT, 1);
    const ranges = all ? matches.map((match) => rangeOf(editor, match)).filter((r): r is Range => r !== null) : [];
    for (const range of ranges) all!.add(range);
    const currentRange = current === -1 ? null : rangeOf(editor, matches[current]);
    if (currentRange) now?.add(currentRange);
    painted = { all: ranges, current: now ? currentRange : null };
    return currentRange;
  };

  return { paint, clear };
}
