import { Transaction } from '../state/transaction';
import { findBlockIndex, getBlockText } from '../model/document';

export interface InputRule {
  match: RegExp;
  handler: (tr: Transaction, match: RegExpMatchArray, blockId: string) => boolean;
}

/** Clears the block, changes its type and puts the caret at its start. */
function convertBlock(tr: Transaction, blockId: string, type: string, attrs: Record<string, any> = {}): boolean {
  const idx = findBlockIndex(tr.doc, blockId);
  if (idx === -1) return false;

  const block = tr.doc.blocks[idx];
  block.type = type;
  block.attrs = attrs;
  block.content = [{ text: '', marks: [] }];

  tr.selection = {
    anchor: { blockId, offset: 0 },
    head: { blockId, offset: 0 },
    isCollapsed: true,
  };
  tr.docChanged = true;
  tr.selectionChanged = true;
  return true;
}

export const defaultInputRules: InputRule[] = [
  // Heading: "# " to "###### "
  {
    match: /^(#{1,6})\s$/,
    handler: (tr, match, blockId) => convertBlock(tr, blockId, 'heading', { level: match[1].length }),
  },
  // Blockquote: "> "
  {
    match: /^>\s$/,
    handler: (tr, _match, blockId) => convertBlock(tr, blockId, 'blockquote'),
  },
  // Code block: ```
  {
    match: /^```$/,
    handler: (tr, _match, blockId) => convertBlock(tr, blockId, 'code_block'),
  },
  // Bulleted list: "- " or "* "
  {
    match: /^[-*]\s$/,
    handler: (tr, _match, blockId) => convertBlock(tr, blockId, 'bullet_list_item'),
  },
  // Numbered list: "1. "
  {
    match: /^\d+\.\s$/,
    handler: (tr, _match, blockId) => convertBlock(tr, blockId, 'ordered_list_item'),
  },
];

export function applyInputRules(tr: Transaction, rules: InputRule[] = defaultInputRules): boolean {
  if (!tr.selection.isCollapsed) return false;

  const blockId = tr.selection.anchor.blockId;
  const idx = findBlockIndex(tr.doc, blockId);
  if (idx === -1) return false;

  const block = tr.doc.blocks[idx];
  // Code is literal text: "# " or "- " there must stay as typed.
  if (block.type === 'code_block') return false;
  const text = getBlockText(block);

  for (const rule of rules) {
    const match = text.match(rule.match);
    if (match) {
      const handled = rule.handler(tr, match, blockId);
      if (handled) return true;
    }
  }

  return false;
}

