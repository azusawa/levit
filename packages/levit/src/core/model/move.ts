/**
 * Moving, copying and deleting whole blocks. A table moves as one block (its
 * cells are blocks that follow each other), and a list item takes the items
 * nested under it along.
 */

import { generateBlockId, isListItem, listIndent } from './document.js';
import { isTableCell, rowIdOf, tableAtIndex, tableIdOf } from './table.js';
import type { BlockNode } from './types.js';

/** The first and last index of some blocks that follow each other. */
export type BlockRange = [start: number, end: number];

/** Keys that move the selected blocks one place up or down, as in Notion. */
export const BLOCK_MOVE_SHORTCUTS = { up: 'Mod-Shift-ArrowUp', down: 'Mod-Shift-ArrowDown' } as const;

/** The mark of the comments plugin. A comment stays on its own text, not on a copy of it. */
const COMMENT_MARK = 'comment';

/** The last index of the list items nested under the block at index (index itself when there are none). */
function nestedEnd(blocks: readonly BlockNode[], index: number): number {
  const block = blocks[index];
  if (!isListItem(block.type)) return index;
  const indent = listIndent(block);
  let end = index;
  while (end + 1 < blocks.length && isListItem(blocks[end + 1].type) && listIndent(blocks[end + 1]) > indent) end += 1;
  return end;
}

/** The block at index with what goes with it: its whole table, or the list items nested under it. */
export function blockUnit(blocks: readonly BlockNode[], index: number): BlockRange | null {
  if (!blocks[index]) return null;
  const table = tableAtIndex(blocks as BlockNode[], index);
  if (table) return [table.start, table.end];
  return [index, nestedEnd(blocks, index)];
}

/** The blocks from `from` to `to` (indexes) with what goes with them. */
export function unitRange(blocks: readonly BlockNode[], from: number, to: number): BlockRange | null {
  const first = blockUnit(blocks, Math.min(from, to));
  const last = blockUnit(blocks, Math.max(from, to));
  if (!first || !last) return null;
  return [first[0], Math.max(first[1], last[1])];
}

/**
 * The blocks just above a range that it moves past: the block above, its
 * whole table, or the list item (with its nested items) on the level of the
 * range's first block.
 */
function unitAbove(blocks: readonly BlockNode[], start: number): BlockRange | null {
  const end = start - 1;
  if (end < 0) return null;
  const table = tableAtIndex(blocks as BlockNode[], end);
  if (table) return [table.start, end];
  const level = listIndent(blocks[start]);
  let first = end;
  while (first > 0 && isListItem(blocks[first].type) && listIndent(blocks[first]) > level) first -= 1;
  return [first, end];
}

/**
 * The blocks with the range moved one place up or down, past the block (or
 * table, or list item with its nested items) next to it, or null at the top
 * or bottom.
 */
export function moveRange(blocks: readonly BlockNode[], [start, end]: BlockRange, direction: 'up' | 'down'): BlockNode[] | null {
  const moved = blocks.slice(start, end + 1);
  if (direction === 'up') {
    const above = unitAbove(blocks, start);
    if (!above) return null;
    return [...blocks.slice(0, above[0]), ...moved, ...blocks.slice(above[0], start), ...blocks.slice(end + 1)];
  }
  const below = blockUnit(blocks, end + 1);
  if (!below) return null;
  return [...blocks.slice(0, start), ...blocks.slice(below[0], below[1] + 1), ...moved, ...blocks.slice(below[1] + 1)];
}

/** True when the place (an index between blocks) is between two cells of one table. */
function insideTable(blocks: readonly BlockNode[], place: number): boolean {
  const before = blocks[place - 1];
  const after = blocks[place];
  return !!before && !!after && isTableCell(before.type) && isTableCell(after.type) && tableIdOf(before) === tableIdOf(after);
}

/**
 * The blocks with the range moved to a place: an index between blocks, 0
 * being before the first. A place inside a table is taken as the place
 * before it. Null when the place is outside the document, inside the range,
 * or where the range already is.
 */
export function moveRangeTo(blocks: readonly BlockNode[], [start, end]: BlockRange, place: number): BlockNode[] | null {
  if (!Number.isInteger(place) || place < 0 || place > blocks.length) return null;
  if (insideTable(blocks, place)) place = tableAtIndex(blocks as BlockNode[], place)!.start;
  if (place >= start && place <= end + 1) return null;
  const moved = blocks.slice(start, end + 1);
  const rest = [...blocks.slice(0, start), ...blocks.slice(end + 1)];
  const at = place > end ? place - moved.length : place;
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

/**
 * A copy of some blocks with new ids. Tables in them become new tables, with
 * their own table and row ids, and comments are left off the copy.
 */
export function copyBlocks(blocks: readonly BlockNode[]): BlockNode[] {
  const newIds = new Map<string, string>();
  const renamed = (old: string, prefix: string) => {
    const key = `${prefix}:${old}`;
    if (!newIds.has(key)) newIds.set(key, generateBlockId(prefix));
    return newIds.get(key)!;
  };
  return blocks.map((block) => {
    const attrs = { ...block.attrs };
    if (isTableCell(block.type)) {
      attrs.table = renamed(tableIdOf(block), 't');
      attrs.row = renamed(`${tableIdOf(block)}/${rowIdOf(block)}`, 'r');
    }
    return {
      id: generateBlockId(),
      type: block.type,
      attrs,
      content: block.content.map((node) => ({
        text: node.text,
        marks: (node.marks ?? []).filter((mark) => mark.type !== COMMENT_MARK),
      })),
    };
  });
}
