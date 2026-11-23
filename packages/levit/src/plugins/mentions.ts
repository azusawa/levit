import type { LevitEditor } from '../core/editor.js';
import type { LevitPlugin } from '../core/plugin/plugin.js';
import type { BlockNode, EditorPosition, InlineMark, InlineNode } from '../core/model/types.js';
import type { Transaction } from '../core/state/transaction.js';
import { findBlockIndex, getBlockText, normalizeInlineNodes, splitBlockContent } from '../core/model/document.js';
import { createAutocomplete, type AutocompleteRange } from './autocomplete.js';

export const MENTION_MARK = 'mention';

/** A person (or anything else) that can be mentioned. */
export interface MentionItem {
  /** The app's id for it, kept in the document. */
  id: string;
  /** The name shown after the "@". */
  label: string;
  /** A second line in the list, like a team or an email address. */
  description?: string;
  /** A short text before the name, like an emoji or initials. */
  icon?: string;
}

export interface MentionsOptions {
  /**
   * Who can be mentioned: a list (filtered by name as the user types), or a
   * function that gives the people for what was typed after the "@", now or
   * later (a Promise, for example from a server).
   */
  items: readonly MentionItem[] | ((query: string) => readonly MentionItem[] | Promise<readonly MentionItem[]>);
}

/** A mention in the document, and where it starts. */
export interface MentionRange {
  id: string;
  label: string;
  blockId: string;
  offset: number;
}

/** At most this many people show for a list. */
const LIST_LIMIT = 10;
/** Ids are the app's; one longer than this is not one. */
const MAX_ID_LENGTH = 200;

const mentionOf = (node: InlineNode): InlineMark | undefined => node.marks?.find((m) => m.type === MENTION_MARK);
/** True for a whole mention: its text is still "@" and the name. */
const isWhole = (node: InlineNode, mark: InlineMark) => node.text === `@${mark.attrs?.label ?? ''}`;
const validId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH;

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The mentions in a document, in order. */
export function getMentions(editor: LevitEditor): MentionRange[] {
  const found: MentionRange[] = [];
  for (const block of editor.state.doc.blocks) {
    let offset = 0;
    for (const node of block.content) {
      const mark = mentionOf(node);
      if (mark && validId(mark.attrs?.id) && isWhole(node, mark)) found.push({ id: mark.attrs.id, label: String(mark.attrs.label ?? ''), blockId: block.id, offset });
      offset += node.text.length;
    }
  }
  return found;
}

/** Where the mention around a part of a block is: [start, end), or null. */
function mentionAround(block: BlockNode, from: number, to: number): [number, number] | null {
  let offset = 0;
  for (const node of block.content) {
    const end = offset + node.text.length;
    if (mentionOf(node) && offset < to && end > from) return [offset, end];
    offset = end;
  }
  return null;
}

/** Backspace (-1) or Delete (1) next to or inside a mention removes it whole. */
function removeWhole(editor: LevitEditor, direction: -1 | 1): boolean {
  const { selection, doc } = editor.state;
  if (!selection.isCollapsed) return false;
  const { blockId, offset } = selection.head;
  const index = findBlockIndex(doc, blockId);
  if (index === -1) return false;
  const block = doc.blocks[index];
  const range = direction === -1 ? mentionAround(block, offset - 1, offset) : mentionAround(block, offset, offset + 1);
  if (!range) return false;
  const tr = editor.state.tr;
  const anchor = { blockId, offset: range[0] };
  editor.dispatch(tr.setSelection({ anchor, head: { blockId, offset: range[1] }, isCollapsed: false }).deleteRange());
  return true;
}

/**
 * Keeps the caret out of mentions, so nothing is typed into one: a caret
 * inside goes after it, or before it when it stepped in from the end.
 */
function keepCaretOut(editor: LevitEditor): () => void {
  let last: EditorPosition | null = null;
  return () => {
    const { selection, doc } = editor.state;
    const head = selection.head;
    const block = selection.isCollapsed && !editor.isComposing ? doc.blocks[findBlockIndex(doc, head.blockId)] : undefined;
    const range = block ? mentionAround(block, head.offset, head.offset) : null;
    if (!range || head.offset <= range[0] || head.offset >= range[1]) {
      last = { ...head };
      return;
    }
    // One step left from its end (ArrowLeft): before it. Anything else, such as a click: after it.
    const fromEnd = !!last && last.blockId === head.blockId && last.offset === range[1];
    const to = { blockId: head.blockId, offset: fromEnd ? range[0] : range[1] };
    last = to;
    editor.dispatch(editor.state.tr.setSelection({ anchor: to, head: to, isCollapsed: true }));
  };
}

/** Puts a mention (and a space after it) in place of a range, or at the caret. */
function insertMention(tr: Transaction, item: MentionItem, range: AutocompleteRange | null): boolean {
  if (!validId(item.id) || !item.label) return false;
  if (range) tr.setSelection({ anchor: range.from, head: range.to, isCollapsed: false });
  if (!tr.selection.isCollapsed) tr.deleteRange();
  const { blockId, offset } = tr.selection.head;
  const index = findBlockIndex(tr.doc, blockId);
  if (index === -1) return false;
  const block = tr.editBlock(index)!;
  const [left, right] = splitBlockContent(block, offset);
  const text = `@${item.label}`;
  const mention: InlineNode = { text, marks: [{ type: MENTION_MARK, attrs: { id: item.id, label: item.label } }] };
  // A space after it, unless one is already there.
  const spaced = /^\s/.test(getBlockText({ ...block, content: right }));
  block.content = normalizeInlineNodes([...left, mention, ...(spaced ? [] : [{ text: ' ', marks: [] }]), ...right]);
  const caret = { blockId, offset: offset + text.length + 1 };
  tr.setSelection({ anchor: caret, head: caret, isCollapsed: true });
  tr.docChanged = true;
  return true;
}

/**
 * The people as popup entries; ones without an id are left out. Once a
 * space is typed, only names that have the whole query stay, so the list
 * closes when the sentence goes on ("@Kim please ...").
 */
const asEntries = (list: readonly MentionItem[], query: string) => {
  const needle = query.toLowerCase();
  return list
    .filter((item) => validId(item.id) && item.label && (!/\s/.test(query) || item.label.toLowerCase().includes(needle)))
    .map((item) => ({ ...item, title: item.label }));
};

/** The people for a query, from a list: those whose name has it. */
function filterList(list: readonly MentionItem[], query: string): MentionItem[] {
  const needle = query.toLowerCase();
  return list.filter((item) => item.label.toLowerCase().includes(needle)).slice(0, LIST_LIMIT);
}

/**
 * @mentions. Typing "@" at the start of a line or after a space lists the
 * people from `items`; picking one puts a `mention` mark (with the person's
 * id and name) on "@Name". Backspace and Delete remove a mention whole.
 * HTML keeps mentions as <span data-mention-id>; Markdown has the name.
 */
export function mentionsPlugin(options: MentionsOptions): LevitPlugin {
  const items = (query: string) => (typeof options.items === 'function' ? options.items(query) : filterList(options.items, query));
  return {
    name: 'mentions',
    marks: [
      {
        type: MENTION_MARK,
        className: 'levit-mention',
        inclusive: false,
        attributes: (mark): Record<string, string> => (validId(mark.attrs?.id) ? { 'data-mention-id': mark.attrs.id } : {}),
        toHTML: (text, mark) =>
          validId(mark.attrs?.id) ? `<span class="levit-mention" data-mention-id="${escapeAttr(mark.attrs.id)}">${text}</span>` : text,
        toMarkdown: (text) => text,
        parseHTML: (el) => {
          const id = el.getAttribute('data-mention-id');
          if (el.tagName !== 'SPAN' || !validId(id)) return null;
          return { id, label: (el.textContent ?? '').replace(/^@/, '') };
        },
        attrsSchema: {
          type: 'object',
          properties: { id: { type: 'string' }, label: { type: 'string' } },
          required: ['id', 'label'],
        },
      },
    ],
    commands: {
      /** Puts a mention of this person at the caret. */
      insertMention: (item: MentionItem) => (tr) => insertMention(tr, item, null),
    },
    keymap: {
      Backspace: (editor) => removeWhole(editor, -1),
      Delete: (editor) => removeWhole(editor, 1),
    },
    setup: (editor) => {
      const popup = createAutocomplete<MentionItem & { title: string }>(editor, {
        char: '@',
        label: editor.messages.mentionMenuLabel,
        className: 'levit-mention-menu',
        // Names have spaces: "@Kim Min".
        allowSpaces: true,
        items: (query) => {
          const found = items(query);
          return found instanceof Promise ? found.then((list) => asEntries(list, query)) : asEntries(found, query);
        },
        onSelect: (item, range) => {
          const tr = editor.state.tr;
          if (insertMention(tr, item, range)) editor.dispatch(tr);
        },
      });
      const stop = editor.on('selectionUpdate', keepCaretOut(editor));
      return () => {
        popup.destroy();
        stop();
      };
    },
  };
}
