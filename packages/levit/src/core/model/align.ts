/**
 * How the lines of a paragraph, heading or quote line up. Left is the
 * default and is not kept in the document: a block without `align` is left.
 */

export type TextAlign = 'left' | 'center' | 'right' | 'justify';

/** Alignments kept in the document (attrs.align). */
export const TEXT_ALIGNS: readonly Exclude<TextAlign, 'left'>[] = ['center', 'right', 'justify'];

/** The block types that can be aligned. */
export const ALIGNABLE_TYPES: readonly string[] = ['paragraph', 'heading', 'blockquote'];

/** 'center', 'right' or 'justify', or null for the default (left) and anything else. */
export function normalizeTextAlign(value: unknown): Exclude<TextAlign, 'left'> | null {
  return TEXT_ALIGNS.includes(value as 'center') ? (value as Exclude<TextAlign, 'left'>) : null;
}

export function canAlignText(type: string): boolean {
  return ALIGNABLE_TYPES.includes(type);
}

/** The alignment a block keeps in its attrs, or null (left, or a block that cannot be aligned). */
export function blockTextAlign(block: { type: string; attrs?: Record<string, any> }): Exclude<TextAlign, 'left'> | null {
  return canAlignText(block.type) ? normalizeTextAlign(block.attrs?.align) : null;
}

/** Keyboard shortcuts for each alignment, as in Google Docs. */
export const TEXT_ALIGN_SHORTCUTS: Readonly<Record<TextAlign, string>> = {
  left: 'Mod-Shift-l',
  center: 'Mod-Shift-e',
  right: 'Mod-Shift-r',
  justify: 'Mod-Shift-j',
};
