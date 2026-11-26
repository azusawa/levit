/**
 * A toggle: a block whose first line is a summary and whose other lines fold
 * away under it. It is closed unless attrs.open is true.
 */

import type { BlockNode } from './types.js';
import { getBlockText } from './document.js';

export function isToggleOpen(block: { attrs?: Record<string, any> }): boolean {
  return block.attrs?.open === true;
}

/** The attrs for a toggle: { open: true } when open, nothing when closed. */
export function toggleAttrs(open: boolean): Record<string, true> {
  return open ? { open: true } : {};
}

/** How many characters the summary (the first line) has. */
export function toggleSummaryLength(block: BlockNode): number {
  const text = getBlockText(block);
  const end = text.indexOf('\n');
  return end === -1 ? text.length : end;
}
