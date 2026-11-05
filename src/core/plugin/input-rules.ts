import { Transaction } from '../state/transaction';
import { findBlockIndex, getBlockText } from '../model/document';

export interface InputRule {
  match: RegExp;
  handler: (tr: Transaction, match: RegExpMatchArray, blockId: string) => boolean;
}

export const defaultInputRules: InputRule[] = [
  // Heading rule: # , ## , ### , etc.
  {
    match: /^(#{1,6})\s$/,
    handler: (tr, match, blockId) => {
      const level = match[1].length;
      const idx = findBlockIndex(tr.doc, blockId);
      if (idx === -1) return false;

      const block = tr.doc.blocks[idx];
      block.type = 'heading';
      block.attrs = { level };
      block.content = [{ text: '', marks: [] }];

      tr.selection = {
        anchor: { blockId, offset: 0 },
        head: { blockId, offset: 0 },
        isCollapsed: true,
      };
      tr.docChanged = true;
      tr.selectionChanged = true;
      return true;
    },
  },
  // Blockquote rule: > 
  {
    match: /^>\s$/,
    handler: (tr, _match, blockId) => {
      const idx = findBlockIndex(tr.doc, blockId);
      if (idx === -1) return false;

      const block = tr.doc.blocks[idx];
      block.type = 'blockquote';
      block.attrs = {};
      block.content = [{ text: '', marks: [] }];

      tr.selection = {
        anchor: { blockId, offset: 0 },
        head: { blockId, offset: 0 },
        isCollapsed: true,
      };
      tr.docChanged = true;
      tr.selectionChanged = true;
      return true;
    },
  },
  // Code block rule: ```
  {
    match: /^```$/,
    handler: (tr, _match, blockId) => {
      const idx = findBlockIndex(tr.doc, blockId);
      if (idx === -1) return false;

      const block = tr.doc.blocks[idx];
      block.type = 'code_block';
      block.attrs = {};
      block.content = [{ text: '', marks: [] }];

      tr.selection = {
        anchor: { blockId, offset: 0 },
        head: { blockId, offset: 0 },
        isCollapsed: true,
      };
      tr.docChanged = true;
      tr.selectionChanged = true;
      return true;
    },
  },
];

export function applyInputRules(tr: Transaction, rules: InputRule[] = defaultInputRules): boolean {
  if (!tr.selection.isCollapsed) return false;

  const blockId = tr.selection.anchor.blockId;
  const idx = findBlockIndex(tr.doc, blockId);
  if (idx === -1) return false;

  const block = tr.doc.blocks[idx];
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

