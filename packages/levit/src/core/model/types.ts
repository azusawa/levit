/**
 * Levit Web Editor - Core Model Types
 * Clean-room implementation of Document Model, Blocks, and Selections.
 */

export interface InlineMark {
  type: string;
  attrs?: Record<string, string | number | boolean>;
}

export interface InlineNode {
  text: string;
  marks?: InlineMark[];
}

export interface BlockNode {
  id: string;
  type: string;
  attrs?: Record<string, any>;
  content: InlineNode[];
}

export interface DocumentData {
  version: number;
  blocks: BlockNode[];
}

export interface EditorPosition {
  blockId: string;
  offset: number; // character offset within the concatenated text of the block
}

export interface EditorSelection {
  anchor: EditorPosition;
  head: EditorPosition;
  isCollapsed: boolean;
}

