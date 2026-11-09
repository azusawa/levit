/**
 * Levit Web Editor
 * A modern, zero-dependency, AI-ready hybrid web editor.
 * 
 * Copyright (c) 2026 yonailab. All rights reserved.
 * Licensed under the MIT License.
 */

import './ui/theme.css';

// Core Editor & Commands
export {
  LevitEditor,
  createLevitEditor,
  ChainedCommands,
  type EditorOptions,
  type EditorHistory,
} from './core/editor.js';
export type { EditorEvents, EditorEventName, EditorEventHandler } from './core/events.js';

// Messages (i18n)
export { en, ko, locales, type LevitMessages } from './i18n/messages.js';

// Plugins
export type {
  LevitPlugin,
  BlockSpec,
  MarkSpec,
  PluginCommand,
  PluginSlashItem,
  PluginBubbleItem,
  EditorText,
  SerializerOptions,
} from './core/plugin/plugin.js';
export type { InputRule } from './core/plugin/input-rules.js';

// State & Transactions
export { EditorState, type EditorStateConfig } from './core/state/state.js';
export { Transaction } from './core/state/transaction.js';
export { HistoryManager, type HistoryItem } from './core/state/history.js';

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
} from './core/model/document.js';

export type {
  DocumentData,
  BlockNode,
  InlineNode,
  InlineMark,
  EditorPosition,
  EditorSelection,
} from './core/model/types.js';

// Serializers
export { documentToJSON, documentFromJSON, sameContent } from './serializers/json.js';
export { documentToMarkdown, markdownToDocument } from './serializers/markdown.js';
export { documentToHTML, htmlToDocument } from './serializers/html.js';

// Floating Menus
export { createBubbleMenu, type BubbleMenuInstance } from './plugins/bubble-menu.js';
export { createSlashMenu, type SlashMenuInstance, type SlashMenuItem } from './plugins/slash-menu.js';
export { createRemoteCursors, type RemoteCursor, type RemoteCursorsInstance } from './plugins/remote-cursors.js';
export { commentsPlugin, getComments, type CommentsOptions, type CommentRange } from './plugins/comments.js';

// AI Integration Helpers
export { getAIContext, streamAIResponse, type AIContext } from './ai/stream.js';

// Web Component (<levit-editor>)
export { LevitEditorElement } from './ui/web-component.js';

