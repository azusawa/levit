/**
 * Levit Web Editor
 * A modern, zero-dependency, AI-ready hybrid web editor.
 * 
 * Copyright (c) 2026 Levit Authors. All rights reserved.
 * Licensed under the MIT License.
 */

import './ui/theme.css';

// Core Editor & Commands
export {
  LevitEditor,
  createLevitEditor,
  ChainedCommands,
  type EditorOptions,
} from './core/editor';

// State & Transactions
export { EditorState, type EditorStateConfig } from './core/state/state';
export { Transaction } from './core/state/transaction';
export { HistoryManager, type HistoryItem } from './core/state/history';

// Model & Types
export {
  createDocument,
  createBlock,
  createTextNode,
  getBlockText,
  findBlockIndex,
  splitBlockContent,
  mergeBlockContent,
  normalizeInlineNodes,
} from './core/model/document';

export type {
  DocumentData,
  BlockNode,
  InlineNode,
  InlineMark,
  EditorPosition,
  EditorSelection,
} from './core/model/types';

// Serializers
export { documentToJSON, documentFromJSON } from './serializers/json';
export { documentToMarkdown, markdownToDocument } from './serializers/markdown';
export { documentToHTML, htmlToDocument } from './serializers/html';

// Floating Menus
export { createBubbleMenu, type BubbleMenuInstance } from './plugins/bubble-menu';
export { createSlashMenu, type SlashMenuInstance, type SlashMenuItem } from './plugins/slash-menu';

// AI Integration Helpers
export { getAIContext, streamAIResponse, type AIContext } from './ai/stream';

// Web Component (<levit-editor>)
export { LevitEditorElement } from './ui/web-component';

