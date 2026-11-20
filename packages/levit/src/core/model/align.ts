/**
 * How the lines of a paragraph, heading or quote line up. Left is the
 * default and is not kept in the document: a block without `align` is left.
 */

import { findBlockIndex, orderedSelection } from './document.js';
import type { BlockNode, DocumentData, EditorSelection } from './types.js';

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

/** The indexes of the selected blocks that can be aligned, top to bottom. */
export function alignableIndexes(doc: DocumentData, selection: EditorSelection): number[] {
  const { from, to } = orderedSelection(doc, selection);
  const start = findBlockIndex(doc, from.blockId);
  const end = findBlockIndex(doc, to.blockId);
  if (start === -1 || end === -1) return [];
  const indexes: number[] = [];
  for (let i = start; i <= end; i++) if (canAlignText(doc.blocks[i].type)) indexes.push(i);
  return indexes;
}

/**
 * The alignment all selected lines that can be aligned share, or null when
 * they differ or none can be aligned.
 */
export function selectionTextAlign(doc: DocumentData, selection: EditorSelection): TextAlign | null {
  const aligns = new Set(alignableIndexes(doc, selection).map((i) => blockTextAlign(doc.blocks[i]) ?? 'left'));
  return aligns.size === 1 ? [...aligns][0] : null;
}

/** The block's attrs with this alignment ('left' or null takes it off). */
export function withTextAlign(block: BlockNode, align: TextAlign | null): Record<string, any> {
  const { align: _old, ...rest } = block.attrs ?? {};
  const value = normalizeTextAlign(align);
  return value ? { ...rest, align: value } : rest;
}

/** Keyboard shortcuts for each alignment, as in Google Docs. */
export const TEXT_ALIGN_SHORTCUTS: Readonly<Record<TextAlign, string>> = {
  left: 'Mod-Shift-l',
  center: 'Mod-Shift-e',
  right: 'Mod-Shift-r',
  justify: 'Mod-Shift-j',
};
