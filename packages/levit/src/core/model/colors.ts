/**
 * Colors a writer can give text (the `color` mark) and highlights (the
 * `highlight` mark's `color` attr). The document keeps a color name such as
 * "red", drawn with the theme's --levit-color-red or --levit-bg-red, so it is
 * readable in light and dark themes. A hex color (#rrggbb) from the color
 * picker is kept and drawn as it is, in every theme.
 */

export interface NamedColor {
  name: string;
  /** Light theme text color, the fallback where theme.css is not loaded. */
  text: string;
  /** Light theme background color, the same way. */
  background: string;
}

export const COLORS: readonly NamedColor[] = [
  { name: 'gray', text: '#64748b', background: '#f1f5f9' },
  { name: 'brown', text: '#92573a', background: '#f4e9e1' },
  { name: 'orange', text: '#c2410c', background: '#ffedd5' },
  { name: 'yellow', text: '#a16207', background: '#fef08a' },
  { name: 'green', text: '#15803d', background: '#dcfce7' },
  { name: 'blue', text: '#1d4ed8', background: '#dbeafe' },
  { name: 'purple', text: '#7e22ce', background: '#f3e8ff' },
  { name: 'pink', text: '#be185d', background: '#fce7f3' },
  { name: 'red', text: '#b91c1c', background: '#fee2e2' },
];

/** Text, a background, or the lines of a table, which take the text colors. */
export type ColorKind = 'text' | 'background' | 'border';

/** A highlight in a color the theme does not know shows yellow. */
export const HIGHLIGHT_FALLBACK = '#fef08a';

const NAME = /^[a-z][a-z0-9-]{0,31}$/;

/**
 * A color name (lowercase letters, digits and "-") or a hex color as
 * #rrggbb, or null for anything else. Only these reach a style.
 */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  if (NAME.test(value)) return value;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : null;
}

/**
 * The CSS value for a color, or null when it is not a color. A name the
 * theme does not know falls back to `fallback`, if given.
 */
export function colorCSS(value: unknown, kind: ColorKind, fallback?: string): string | null {
  const color = normalizeColor(value);
  if (!color) return null;
  if (color.startsWith('#')) return color;
  const known = COLORS.find((c) => c.name === color);
  const background = kind === 'background';
  const variable = `--levit-${background ? 'bg' : 'color'}-${color}`;
  if (known) return `var(${variable}, ${background ? known.background : known.text})`;
  return fallback ? `var(${variable}, ${fallback})` : `var(${variable})`;
}

/** Red, green, blue and alpha of a CSS color as browsers write it, or null. */
function parseCSSColor(css: string): [number, number, number, number] | null {
  const value = css.trim().toLowerCase();
  const hex = normalizeColor(value);
  if (hex?.startsWith('#')) return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).concat(1) as [number, number, number, number];
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/.exec(value);
  if (!rgb) return null;
  const alpha = rgb[4] === undefined ? 1 : rgb[4].endsWith('%') ? parseFloat(rgb[4]) / 100 : parseFloat(rgb[4]);
  return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), alpha];
}

/** True for a CSS color that shows nothing, like `transparent`. */
export function isClearColor(css: string): boolean {
  return css.trim().toLowerCase() === 'transparent' || parseCSSColor(css)?.[3] === 0;
}

/**
 * The named color closest to a pasted CSS color, by hue. The palette's own
 * values are themselves. Body text colors (dark grays, and light grays from
 * dark pages) and page backgrounds (white, and dark grays) are the default:
 * null.
 */
export function nearestColor(css: string, of: ColorKind): string | null {
  // Lines are like text: dark ones are the default. Gray lines are too: pages
  // draw their tables in grays, and that is not a color someone picked.
  const kind = of === 'border' ? 'text' : of;
  const lines = of === 'border';
  const rgba = parseCSSColor(css);
  if (!rgba || rgba[3] === 0) return null;
  const hex = `#${rgba.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  const own = COLORS.find((c) => (kind === 'text' ? c.text : c.background) === hex);
  if (own) return own.name;
  const [r, g, b] = rgba.slice(0, 3).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  const grayish = s < 0.2;
  if (kind === 'text' && l < 0.35 && s < 0.4) return null;
  if (kind === 'text' && grayish && l > 0.75) return null;
  if (kind === 'background' && (l > 0.98 || (grayish && (l > 0.9 || l < 0.3)))) return null;
  if (grayish) return lines ? null : 'gray';

  let h = 0;
  if (max === r) h = ((g - b) / d + 6) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;

  if (h >= 15 && h < 45 && l < 0.45) return 'brown';
  if (h < 15 || h >= 345) return 'red';
  if (h < 45) return 'orange';
  if (h < 70) return 'yellow';
  if (h < 170) return 'green';
  if (h < 260) return 'blue';
  if (h < 310) return 'purple';
  return 'pink';
}
