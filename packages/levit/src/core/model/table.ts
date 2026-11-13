import { BlockNode, DocumentData, InlineNode } from './types.js';
import { createBlock, createTextNode, findBlockIndex, generateBlockId, normalizeInlineNodes } from './document.js';

/**
 * Tables. The document stays a flat list of blocks: every cell is a
 * `table_cell` block, and its attrs say which table (`table`) and which row
 * (`row`) it belongs to. The cells of a table follow each other, row after
 * row, left to right. Header cells have `header: true`.
 *
 * Keeping cells as blocks means the caret, selections, undo and
 * collaboration work in tables as they do anywhere else. Adding a row or a
 * column only adds blocks, so two people can do it at the same time.
 */
export const TABLE_CELL = 'table_cell';

export function isTableCell(type: string): boolean {
  return type === TABLE_CELL;
}

/**
 * Where a cell is: its table's first and last block, the rows (each a list
 * of block indexes, left to right), and its own row and column.
 */
export interface TablePosition {
  start: number;
  end: number;
  rows: number[][];
  row: number;
  col: number;
}

/** A table or row id as a string. Anything else (from a bad document) counts as no id. */
const idOf = (value: unknown) => (typeof value === 'string' || typeof value === 'number' ? String(value) : '');
export const tableIdOf = (block: BlockNode) => idOf(block.attrs?.table);
export const rowIdOf = (block: BlockNode) => idOf(block.attrs?.row);
const tableOf = tableIdOf;
const rowOf = rowIdOf;

/** The table the block at index belongs to, or null when it is not a cell. */
export function tableAtIndex(blocks: readonly BlockNode[], index: number): TablePosition | null {
  const block = blocks[index];
  if (!block || !isTableCell(block.type)) return null;
  const table = tableOf(block);
  const inTable = (i: number) => blocks[i] && isTableCell(blocks[i].type) && tableOf(blocks[i]) === table;
  let start = index;
  while (inTable(start - 1)) start -= 1;
  let end = index;
  while (inTable(end + 1)) end += 1;

  // Cells of one row usually follow each other, but after two people
  // changed the table at once another row's cell can sit between them, so
  // cells are grouped by their row. Rows keep the order they first appear in.
  const byRow = new Map<string, number[]>();
  for (let i = start; i <= end; i++) {
    const key = rowOf(blocks[i]);
    if (!byRow.has(key)) byRow.set(key, []);
    byRow.get(key)!.push(i);
  }
  const rows = Array.from(byRow.values());
  const row = rows.findIndex((cells) => cells.includes(index));
  const col = rows[row].indexOf(index);
  return { start, end, rows, row, col };
}

/** The table the block belongs to, or null when it is not a cell. */
export function tableAt(doc: DocumentData, blockId: string): TablePosition | null {
  return tableAtIndex(doc.blocks, findBlockIndex(doc, blockId));
}

/** A new empty cell. */
export function createCell(table: string, row: string, header = false): BlockNode {
  return createBlock(TABLE_CELL, header ? { table, row, header: true } : { table, row });
}

/** The cells of a new empty table, row after row. The first row is a header unless told otherwise. */
export function createTable(rows: number, cols: number, { header = true }: { header?: boolean } = {}): BlockNode[] {
  const table = generateBlockId('t');
  const out: BlockNode[] = [];
  for (let r = 0; r < rows; r++) {
    const row = generateBlockId('r');
    for (let c = 0; c < cols; c++) out.push(createCell(table, row, header && r === 0));
  }
  return out;
}

/**
 * Splits a table row at pipes that are not escaped, without the outer pipes.
 * "\\|" in a cell is a pipe.
 */
export function splitTableRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|') && !text.endsWith('\\|')) text = text.slice(0, -1);
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\' && text[i + 1] === '|') {
      current += '|';
      i += 1;
    } else if (text[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += text[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

/**
 * The cells of a Markdown table row such as "| Name | Price |": bars at
 * both ends and at least two cells. Null when the text is not such a row.
 */
export function markdownTableRow(text: string): string[] | null {
  const line = text.trim();
  if (line.length < 2 || !line.startsWith('|') || !line.endsWith('|') || line.endsWith('\\|')) return null;
  const cells = splitTableRow(line);
  return cells.length >= 2 ? cells : null;
}

/**
 * The text of some blocks as the lines of one cell: images and other blocks
 * without text are left out. Null when nothing with text is left.
 */
export function cellContent(blocks: readonly BlockNode[], isAtom: (type: string) => boolean): InlineNode[] | null {
  const texts = blocks.filter((b) => !isAtom(b.type));
  if (texts.length === 0) return null;
  const lines: InlineNode[] = [];
  texts.forEach((b, i) => {
    if (i > 0) lines.push(createTextNode('\n'));
    lines.push(...b.content);
  });
  return normalizeInlineNodes(lines);
}
