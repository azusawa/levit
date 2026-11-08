import type { BlockNode, InlineMark } from '../model/types.js';
import type { Transaction } from '../state/transaction.js';
import type { LevitEditor } from '../editor.js';
import type { InputRule } from './input-rules.js';
import { ATOM_BLOCK_TYPES, BUILT_IN_BLOCK_TYPES } from '../model/document.js';

/** A block type added by a plugin. */
export interface BlockSpec {
  type: string;
  /** Element for the block. Default: 'div'. */
  tag?: string;
  /** Extra class names on the block element. */
  className?: string;
  /**
   * A block without text, like an image: it cannot hold the caret, and
   * Backspace after it removes it. Its content is drawn by render().
   */
  atom?: boolean;
  /** Draws an atom block into its (empty, non-editable) element. */
  render?: (block: BlockNode, el: HTMLElement) => void;
  /** HTML for the block. `content` is its text as HTML. */
  toHTML?: (block: BlockNode, content: string) => string;
  /** Markdown for the block. `text` is its text as Markdown. */
  toMarkdown?: (block: BlockNode, text: string) => string;
  /** Claims an element when reading HTML: return its attrs, or null to skip it. */
  parseHTML?: (el: Element) => Record<string, any> | null;
  /**
   * Claims a Markdown block (text between blank lines) when reading
   * Markdown: return its text (read as Markdown) and attrs, or null.
   */
  parseMarkdown?: (raw: string) => { text?: string; attrs?: Record<string, any> } | null;
  /** JSON Schema of the block's attrs, used by getDocumentSchema() (for AI output). */
  attrsSchema?: Record<string, unknown>;
}

/** An inline mark added by a plugin. */
export interface MarkSpec {
  type: string;
  /** Element that wraps marked text. Default: 'span'. */
  tag?: string;
  className?: string;
  /** Attributes for the element. Event handler attributes (on...) are ignored. */
  attributes?: (mark: InlineMark) => Record<string, string>;
  /** HTML for marked text. `text` is already HTML. Default: just the text. */
  toHTML?: (text: string, mark: InlineMark) => string;
  /** Markdown for marked text. Default: just the text. */
  toMarkdown?: (text: string, mark: InlineMark) => string;
  /** Claims an element when reading HTML: return the mark's attrs, or null. */
  parseHTML?: (el: Element) => Record<string, any> | null;
  /** JSON Schema of the mark's attrs, used by getDocumentSchema() (for AI output). */
  attrsSchema?: Record<string, unknown>;
}

/** A command factory: takes arguments, returns a change to a transaction. */
export type PluginCommand = (...args: any[]) => (tr: Transaction, editor: LevitEditor) => boolean | void;

/** Text, or a function that picks it for an editor (for example from editor.messages). */
export type EditorText = string | ((editor: LevitEditor) => string);

/** A slash menu entry. */
export interface PluginSlashItem {
  id: string;
  title: EditorText;
  description: EditorText;
  icon: string;
  action: (editor: LevitEditor) => void;
}

/** A button in the bubble menu (shown when text is selected). */
export interface PluginBubbleItem {
  /** Text on the button, like "✨". */
  label: string;
  /** Tooltip and name for screen readers. */
  title: EditorText;
  action: (editor: LevitEditor) => void;
}

/** Adds blocks, marks, commands, keys and shortcuts to an editor. */
export interface LevitPlugin {
  name: string;
  blocks?: BlockSpec[];
  marks?: MarkSpec[];
  /** Run with editor.commands.name(...) or editor.chain().exec('name', ...). */
  commands?: Record<string, PluginCommand>;
  /**
   * Keyboard shortcuts such as 'Mod-Shift-k' (Mod is Cmd on macOS, Ctrl
   * elsewhere). Return false to let the editor handle the key as usual.
   */
  keymap?: Record<string, (editor: LevitEditor) => boolean | void>;
  /** Shortcuts typed at the start of a block, checked before the built-in ones. */
  inputRules?: InputRule[];
  /** Entries added to the slash menu. */
  slashItems?: PluginSlashItem[];
  /** Buttons added to the bubble menu. */
  bubbleItems?: PluginBubbleItem[];
  /** Runs once the editor is ready. May return a cleanup function for destroy(). */
  setup?: (editor: LevitEditor) => void | (() => void);
}

const BUILT_IN_BLOCKS = new Set(BUILT_IN_BLOCK_TYPES);
const BUILT_IN_MARKS = new Set(['bold', 'italic', 'underline', 'strike', 'highlight', 'code', 'link']);

/** Everything the plugins of one editor add, looked up by name. */
export class Schema {
  readonly blocks = new Map<string, BlockSpec>();
  readonly marks = new Map<string, MarkSpec>();
  readonly commands = new Map<string, PluginCommand>();
  readonly inputRules: InputRule[] = [];
  readonly keymap: { shortcut: string; run: (editor: LevitEditor) => boolean | void }[] = [];
  readonly slashItems: PluginSlashItem[] = [];
  readonly bubbleItems: PluginBubbleItem[] = [];

  constructor(readonly plugins: readonly LevitPlugin[] = []) {
    for (const plugin of plugins) {
      for (const spec of plugin.blocks ?? []) {
        if (BUILT_IN_BLOCKS.has(spec.type)) throw new Error(`Plugin "${plugin.name}": block "${spec.type}" is built in`);
        if (this.blocks.has(spec.type)) throw new Error(`Plugin "${plugin.name}": block "${spec.type}" is already defined`);
        this.blocks.set(spec.type, spec);
      }
      for (const spec of plugin.marks ?? []) {
        if (BUILT_IN_MARKS.has(spec.type)) throw new Error(`Plugin "${plugin.name}": mark "${spec.type}" is built in`);
        if (this.marks.has(spec.type)) throw new Error(`Plugin "${plugin.name}": mark "${spec.type}" is already defined`);
        this.marks.set(spec.type, spec);
      }
      for (const [name, command] of Object.entries(plugin.commands ?? {})) {
        if (this.commands.has(name)) throw new Error(`Plugin "${plugin.name}": command "${name}" is already defined`);
        this.commands.set(name, command);
      }
      for (const [shortcut, run] of Object.entries(plugin.keymap ?? {})) this.keymap.push({ shortcut, run });
      this.inputRules.push(...(plugin.inputRules ?? []));
      this.slashItems.push(...(plugin.slashItems ?? []));
      this.bubbleItems.push(...(plugin.bubbleItems ?? []));
    }
  }

  /** True for blocks without text: dividers, images and atom plugin blocks. */
  isAtom(type: string): boolean {
    return (ATOM_BLOCK_TYPES as readonly string[]).includes(type) || this.blocks.get(type)?.atom === true;
  }
}

/** The schema of an editor without plugins. */
export const defaultSchema = new Schema();

/** Options taken by the serializers. */
export interface SerializerOptions {
  plugins?: readonly LevitPlugin[];
}

const schemaCache = new WeakMap<readonly LevitPlugin[], Schema>();

/** The schema for a list of plugins, built once per list. */
export function schemaFor(plugins?: readonly LevitPlugin[]): Schema {
  if (!plugins || plugins.length === 0) return defaultSchema;
  let schema = schemaCache.get(plugins);
  if (!schema) schemaCache.set(plugins, (schema = new Schema(plugins)));
  return schema;
}

/** True when a keydown matches a shortcut like 'Mod-Shift-k' or 'Alt-Enter'. */
export function matchesShortcut(e: KeyboardEvent, shortcut: string): boolean {
  // 'Mod--' binds the minus key: the last '-' is the key, not a separator.
  const parts = shortcut.endsWith('--') ? [...shortcut.slice(0, -2).split('-'), '-'] : shortcut.split('-');
  const key = parts.pop()!.toLowerCase();
  const want = { ctrl: false, meta: false, alt: false, shift: false };
  for (const part of parts) {
    const name = part.toLowerCase();
    if (name === 'mod') {
      // Accept either key for Mod, so shortcuts also work in tests and on
      // keyboards where the platform guess is wrong.
      if (!(e.metaKey || e.ctrlKey)) return false;
      continue;
    }
    if (name === 'cmd' || name === 'meta') want.meta = true;
    else if (name === 'ctrl' || name === 'control') want.ctrl = true;
    else if (name === 'alt' || name === 'option') want.alt = true;
    else if (name === 'shift') want.shift = true;
  }
  const usesMod = parts.some((p) => p.toLowerCase() === 'mod');
  if (!usesMod && (e.metaKey !== want.meta || e.ctrlKey !== want.ctrl)) return false;
  if (e.altKey !== want.alt || e.shiftKey !== want.shift) return false;
  // e.code catches keys whose character changes with Shift or Alt
  // (Shift+1 gives '!', Alt+letter on macOS gives a symbol).
  const code = (e.code ?? '').toLowerCase();
  return e.key.toLowerCase() === key || code === `key${key}` || code === `digit${key}` || (key === '-' && code === 'minus');
}
