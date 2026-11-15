import type { LevitEditor } from '../core/editor.js';
import { COLORS, colorCSS, normalizeColor, type ColorKind } from '../core/model/colors.js';
import type { LevitMessages } from '../i18n/messages.js';
import { rovingToolbar } from './toolbar-keys.js';

export interface ColorPanel {
  element: HTMLElement;
  readonly isOpen: boolean;
  /** Shows the panel with the current colors marked. */
  open: () => void;
  close: () => void;
  /** Focuses the first swatch, for keyboard use. */
  focusFirst: () => void;
}

export interface ColorPanelOptions {
  /** The rows: text colors, background colors, or both. */
  kinds: ColorKind[];
  /** The color of what the panel is for; null for the default. */
  active: (kind: ColorKind) => string | null;
  /** Gives a color, or takes it off (null). */
  apply: (kind: ColorKind, color: string | null) => void;
  /** After a color is picked (picked) or Escape is pressed. */
  onDone: (how: { picked: boolean; keyboard: boolean }) => void;
  /** Labels of a row: the row, its "no color" swatch and its color picker. */
  labels: (kind: ColorKind) => { group: string; none: string; other: string };
}

/** A color's name in the editor's language, like "Red" or "빨강". */
export function colorLabel(m: LevitMessages, name: string): string {
  const key = `color${name[0].toUpperCase()}${name.slice(1)}` as keyof LevitMessages;
  return typeof m[key] === 'string' ? (m[key] as string) : name;
}

/** The value a color picker starts at: a hex color, or the light value of a name. */
function pickerValue(color: string | null, kind: ColorKind): string {
  if (color?.startsWith('#')) return color;
  const known = COLORS.find((c) => c.name === color);
  if (known) return kind === 'background' ? known.background : known.text;
  return kind === 'background' ? '#ffffff' : '#000000';
}

/**
 * A palette of the named colors, one row per kind, each ending in a color
 * picker for any other color. Swatches act on mousedown, so the editor keeps
 * its selection.
 */
export function createColorPanel(editor: LevitEditor, options: ColorPanelOptions): ColorPanel {
  const panel = document.createElement('div');
  panel.className = 'levit-color-panel';
  panel.hidden = true;

  const focusable: HTMLElement[] = [];
  const swatches: { kind: ColorKind; color: string | null; el: HTMLButtonElement }[] = [];
  const pickers = new Map<ColorKind, HTMLInputElement>();

  const pick = (kind: ColorKind, color: string | null, keyboard: boolean) => {
    options.apply(kind, color);
    close();
    options.onDone({ picked: true, keyboard });
  };

  for (const kind of options.kinds) {
    const labels = options.labels(kind);
    const row = document.createElement('div');
    row.className = `levit-color-row levit-color-row-${kind}`;
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', labels.group);

    for (const entry of [null, ...editor.colors]) {
      const color = entry?.name ?? null;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'levit-color-swatch';
      btn.textContent = 'A';
      const label = entry === null ? labels.none : (entry.label ?? colorLabel(editor.messages, entry.name));
      btn.title = label;
      btn.setAttribute('aria-label', label);
      if (color === null) btn.classList.add('levit-color-none');
      else if (kind === 'text') btn.style.color = colorCSS(color, 'text')!;
      else if (kind === 'border') btn.style.borderColor = colorCSS(color, 'border')!;
      else btn.style.backgroundColor = colorCSS(color, 'background')!;
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(kind, color, false);
      });
      btn.addEventListener('click', (e) => {
        if (e.detail === 0) pick(kind, color, true);
      });
      row.appendChild(btn);
      swatches.push({ kind, color, el: btn });
      focusable.push(btn);
    }

    panel.appendChild(row);
    if (!editor.colorPicker) continue;

    const picker = document.createElement('input');
    picker.type = 'color';
    picker.className = 'levit-color-picker';
    picker.title = labels.other;
    picker.setAttribute('aria-label', labels.other);
    picker.addEventListener('change', () => {
      const color = normalizeColor(picker.value);
      if (color) pick(kind, color, false);
    });
    row.appendChild(picker);
    pickers.set(kind, picker);
    focusable.push(picker);
  }

  const focusAt = rovingToolbar(panel, focusable, () => {
    close();
    options.onDone({ picked: false, keyboard: true });
  });

  function open() {
    for (const kind of options.kinds) {
      const active = options.active(kind);
      for (const s of swatches) if (s.kind === kind) s.el.setAttribute('aria-pressed', String(s.color !== null && s.color === active));
      const picker = pickers.get(kind);
      if (picker) picker.value = pickerValue(active, kind);
    }
    panel.hidden = false;
  }

  function close() {
    panel.hidden = true;
  }

  return {
    element: panel,
    get isOpen() {
      return !panel.hidden;
    },
    open,
    close,
    focusFirst: () => focusAt(0),
  };
}
