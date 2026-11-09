import type { LevitEditor } from '../core/editor.js';
import type { LevitPlugin } from '../core/plugin/plugin.js';
import type { EditorPosition, InlineMark, InlineNode } from '../core/model/types.js';
import { findBlockIndex, getBlockText, normalizeInlineNodes, orderedSelection, splitBlockContent } from '../core/model/document.js';

export const COMMENT_MARK = 'comment';
const ADDED = 'commentAdded';

export interface CommentsOptions {
  /** Called after a comment is added: store its thread under this id. */
  onAdd?: (comment: { id: string; text: string }, editor: LevitEditor) => void;
  /** Called when the caret moves into or out of comments, with their ids (or []). */
  onSelect?: (ids: string[], editor: LevitEditor) => void;
  /** Makes the id of a new comment. Default: a random id. */
  createId?: () => string;
}

/** Where a comment is, and the text it is on. */
export interface CommentRange {
  id: string;
  text: string;
  from: EditorPosition;
  to: EditorPosition;
}

/** Comment ids are plain names; anything else (they can come from other users) is left out. */
const ID = /^[\w-]{1,64}$/;

const idsOf = (mark: InlineMark | undefined): string[] =>
  String(mark?.attrs?.ids ?? '')
    .split(/\s+/)
    .filter((id) => ID.test(id));

const commentOf = (node: InlineNode) => node.marks?.find((m) => m.type === COMMENT_MARK);

/** Gives the nodes the comment ids that `change` returns (no ids: no mark). */
function withIds(nodes: InlineNode[], change: (ids: string[]) => string[]): InlineNode[] {
  return nodes.map((node) => {
    const ids = change(idsOf(commentOf(node)));
    const marks = (node.marks ?? []).filter((m) => m.type !== COMMENT_MARK);
    if (ids.length > 0) marks.push({ type: COMMENT_MARK, attrs: { ids: [...new Set(ids)].join(' ') } });
    return { text: node.text, marks };
  });
}

const randomId = () =>
  `c-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;

/** The comments in a document, in order, each with the text it covers. */
export function getComments(editor: LevitEditor): CommentRange[] {
  const found = new Map<string, CommentRange>();
  const blocks = editor.state.doc.blocks;
  blocks.forEach((block, index) => {
    let offset = 0;
    for (const node of block.content) {
      for (const id of idsOf(commentOf(node))) {
        const range = found.get(id);
        const end = { blockId: block.id, offset: offset + node.text.length };
        if (!range) {
          found.set(id, { id, text: node.text, from: { blockId: block.id, offset }, to: end });
        } else {
          // Text between the parts (other text, block breaks) is part of it too.
          const fromIndex = findBlockIndex(editor.state.doc, range.to.blockId);
          let between = '';
          for (let k = fromIndex; k <= index; k++) {
            const text = getBlockText(blocks[k]);
            const start = k === fromIndex ? range.to.offset : 0;
            const stop = k === index ? offset : text.length;
            between += (k > fromIndex ? '\n' : '') + text.slice(start, stop);
          }
          range.text += between + node.text;
          range.to = end;
        }
      }
      offset += node.text.length;
    }
  });
  return [...found.values()];
}

/** The ids of the comments at the caret (or around the selection start). */
function idsAt(editor: LevitEditor): string[] {
  const { doc, selection } = editor.state;
  const { from } = orderedSelection(doc, selection);
  const block = doc.blocks[findBlockIndex(doc, from.blockId)];
  if (!block) return [];
  let offset = 0;
  for (const node of block.content) {
    const end = offset + node.text.length;
    // Inside the text, not at its edges.
    if (from.offset > offset && from.offset < end) return idsOf(commentOf(node));
    if (!selection.isCollapsed && from.offset === offset && node.text) return idsOf(commentOf(node));
    offset = end;
  }
  return [];
}

/**
 * Comments on text. The editor keeps where each comment is (a `comment`
 * mark with its ids); the app keeps the threads (text, author, replies),
 * found by id. Adds a comment button to the bubble menu and the commands
 * addComment(), removeComment(id) and selectComment(id). Comments are left
 * out of HTML and Markdown exports.
 */
export function commentsPlugin(options: CommentsOptions = {}): LevitPlugin {
  const createId = options.createId ?? randomId;
  let active: string[] = [];

  const highlight = (editor: LevitEditor) => {
    for (const el of editor.container.querySelectorAll<HTMLElement>('.levit-comment')) {
      const ids = (el.getAttribute('data-comment-ids') ?? '').split(' ');
      el.classList.toggle('is-active', ids.some((id) => active.includes(id)));
    }
  };

  return {
    name: 'comments',
    marks: [
      {
        type: COMMENT_MARK,
        className: 'levit-comment',
        inclusive: false,
        attributes: (mark) => ({ 'data-comment-ids': idsOf(mark).join(' ') }),
        toHTML: (text) => text,
        toMarkdown: (text) => text,
        attrsSchema: { type: 'object', properties: { ids: { type: 'string' } }, required: ['ids'] },
      },
    ],
    commands: {
      /** Adds a comment on the selected text. The new id goes to onAdd. */
      addComment: (id: string = createId()) => (tr) => {
        if (tr.selection.isCollapsed || !ID.test(id)) return false;
        const { from, to } = orderedSelection(tr.doc, tr.selection);
        const fromIndex = findBlockIndex(tr.doc, from.blockId);
        const toIndex = findBlockIndex(tr.doc, to.blockId);
        let text = '';
        for (let i = fromIndex; i <= toIndex; i++) {
          const block = tr.editBlock(i)!;
          const start = i === fromIndex ? from.offset : 0;
          const end = i === toIndex ? to.offset : getBlockText(block).length;
          const [left, rest] = splitBlockContent(block, start);
          const [middle, right] = splitBlockContent({ ...block, content: rest }, end - start);
          block.content = normalizeInlineNodes([...left, ...withIds(middle, (ids) => [...ids, id]), ...right]);
          text += (i > fromIndex ? '\n' : '') + getBlockText(block).slice(start, end);
        }
        if (!text) return false;
        tr.docChanged = true;
        // onAdd runs once the change is in the editor (see setup).
        tr.setMeta(ADDED, { id, text });
        return true;
      },
      /** Removes a comment from the text (its thread is the app's to delete). */
      removeComment: (id: string) => (tr) => {
        let found = false;
        tr.doc.blocks.forEach((block, i) => {
          if (!block.content.some((n) => idsOf(commentOf(n)).includes(id))) return;
          found = true;
          const edited = tr.editBlock(i)!;
          edited.content = normalizeInlineNodes(withIds(edited.content, (ids) => ids.filter((x) => x !== id)));
        });
        if (!found) return false;
        tr.docChanged = true;
        return true;
      },
      /** Selects the text of a comment, for example when its thread is clicked. */
      selectComment: (id: string) => (tr, editor) => {
        const range = getComments(editor).find((c) => c.id === id);
        if (!range) return false;
        tr.setSelection({ anchor: range.from, head: range.to, isCollapsed: false });
        return true;
      },
    },
    bubbleItems: [{ label: '💬', title: (editor) => editor.messages.comment, action: (editor) => void editor.commands.addComment() }],
    setup: (editor) => {
      const update = () => {
        const ids = idsAt(editor);
        const changed = ids.length !== active.length || ids.some((id, k) => id !== active[k]);
        active = ids;
        highlight(editor);
        if (changed) options.onSelect?.(ids, editor);
      };
      const stopSelection = editor.on('selectionUpdate', update);
      const stopAdded = editor.on('transaction', ({ transaction }) => {
        const added = transaction.getMeta(ADDED) as { id: string; text: string } | undefined;
        if (added) options.onAdd?.(added, editor);
      });
      // Redrawn blocks lose the highlight.
      const stopUpdate = editor.on('update', () => highlight(editor));
      return () => {
        stopSelection();
        stopUpdate();
        stopAdded();
      };
    },
  };
}
