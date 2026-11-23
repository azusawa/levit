import type { LevitEditor } from '../core/editor.js';
import type { LevitPlugin } from '../core/plugin/plugin.js';
import { findBlockIndex, getBlockText } from '../core/model/document.js';
import type { EditorPosition } from '../core/model/types.js';
import { createAutocomplete } from './autocomplete.js';

/** An emoji and the name typed for it after ":". */
export interface EmojiItem {
  emoji: string;
  /** Lowercase letters, digits, "_", "+" and "-", as in :thumbsup:. */
  name: string;
  /** Other words that find it. */
  keywords?: string[];
}

export interface EmojiOptions {
  /** The emoji to offer. Default: DEFAULT_EMOJI, a short list of everyday ones. */
  emoji?: readonly EmojiItem[];
}

/** At most this many emoji show at once. */
const SHOWN_LIMIT = 8;
/** Letters typed after ":" before the list shows: ":)" and ":D" stay as typed. */
const MIN_QUERY = 2;

const e = (emoji: string, name: string, ...keywords: string[]): EmojiItem => ({ emoji, name, ...(keywords.length ? { keywords } : {}) });

/** A short list of everyday emoji, named as on GitHub and Slack. */
export const DEFAULT_EMOJI: readonly EmojiItem[] = [
  e('😄', 'smile', 'happy', 'joy'),
  e('😁', 'grin'),
  e('😂', 'joy', 'laugh', 'tears'),
  e('🤣', 'rofl', 'laugh'),
  e('🙂', 'slightly_smiling_face'),
  e('😉', 'wink'),
  e('😊', 'blush', 'smile'),
  e('😍', 'heart_eyes', 'love'),
  e('😘', 'kissing_heart'),
  e('😋', 'yum'),
  e('😛', 'stuck_out_tongue'),
  e('🤔', 'thinking'),
  e('😐', 'neutral_face'),
  e('🙄', 'roll_eyes'),
  e('😏', 'smirk'),
  e('😌', 'relieved'),
  e('😔', 'pensive'),
  e('😴', 'sleeping'),
  e('😎', 'sunglasses', 'cool'),
  e('🤓', 'nerd_face'),
  e('😕', 'confused'),
  e('😮', 'open_mouth', 'wow'),
  e('😳', 'flushed'),
  e('🥺', 'pleading_face'),
  e('😢', 'cry', 'sad'),
  e('😭', 'sob', 'sad'),
  e('😱', 'scream'),
  e('😠', 'angry'),
  e('😅', 'sweat_smile'),
  e('🙃', 'upside_down_face'),
  e('🤗', 'hugs'),
  e('💀', 'skull'),
  e('👋', 'wave', 'hello', 'bye'),
  e('👌', 'ok_hand'),
  e('✌️', 'v', 'peace'),
  e('🤞', 'crossed_fingers', 'luck'),
  e('👍', 'thumbsup', '+1', 'like', 'yes'),
  e('👎', 'thumbsdown', '-1', 'no'),
  e('👏', 'clap'),
  e('🙌', 'raised_hands'),
  e('🙏', 'pray', 'thanks', 'please'),
  e('💪', 'muscle', 'strong'),
  e('👉', 'point_right'),
  e('👀', 'eyes', 'look'),
  e('❤️', 'heart', 'love'),
  e('🧡', 'orange_heart'),
  e('💛', 'yellow_heart'),
  e('💚', 'green_heart'),
  e('💙', 'blue_heart'),
  e('💜', 'purple_heart'),
  e('💔', 'broken_heart'),
  e('✨', 'sparkles'),
  e('⭐', 'star'),
  e('🔥', 'fire', 'hot'),
  e('💯', '100', 'perfect'),
  e('🎉', 'tada', 'party', 'congrats'),
  e('🎁', 'gift', 'present'),
  e('🏆', 'trophy', 'win'),
  e('🚀', 'rocket', 'launch', 'ship'),
  e('⚡', 'zap', 'fast'),
  e('💥', 'boom'),
  e('💡', 'bulb', 'idea'),
  e('📝', 'memo', 'note'),
  e('📌', 'pushpin', 'pin'),
  e('🔗', 'link'),
  e('🔒', 'lock'),
  e('🔑', 'key'),
  e('🔔', 'bell'),
  e('📅', 'calendar', 'date'),
  e('📈', 'chart_with_upwards_trend', 'growth'),
  e('📊', 'bar_chart'),
  e('✅', 'check', 'white_check_mark', 'done'),
  e('❌', 'x', 'cross'),
  e('⚠️', 'warning'),
  e('❓', 'question'),
  e('❗', 'exclamation'),
  e('⛔', 'no_entry', 'stop'),
  e('⏳', 'hourglass', 'wait'),
  e('☕', 'coffee'),
  e('🍕', 'pizza'),
  e('🍰', 'cake'),
  e('☀️', 'sunny', 'sun'),
  e('🌈', 'rainbow'),
  e('❄️', 'snowflake'),
  e('🐶', 'dog'),
  e('🐱', 'cat'),
  e('🐛', 'bug'),
  e('🌱', 'seedling', 'plant'),
];

/** The emoji for a query: names that start with it first, then names and keywords that have it. */
export function findEmoji(list: readonly EmojiItem[], query: string): EmojiItem[] {
  const needle = query.toLowerCase();
  const starts = list.filter((item) => item.name.startsWith(needle));
  const has = list.filter((item) => !starts.includes(item) && (item.name.includes(needle) || item.keywords?.some((k) => k.includes(needle))));
  return [...starts, ...has];
}

/** ":name" right before the caret (after a space or at the start), or null. */
function typedName(editor: LevitEditor): { from: EditorPosition; to: EditorPosition; name: string } | null {
  const { selection, doc } = editor.state;
  if (!selection.isCollapsed) return null;
  const { blockId, offset } = selection.head;
  const block = doc.blocks[findBlockIndex(doc, blockId)];
  if (!block || block.type === 'code_block') return null;
  const match = /(^|\s):([\w+-]+)$/.exec(getBlockText(block).slice(0, offset));
  if (!match) return null;
  return { from: { blockId, offset: offset - match[2].length - 1 }, to: { blockId, offset }, name: match[2].toLowerCase() };
}

/** Puts an emoji in place of what was typed for it. */
function replaceWith(editor: LevitEditor, from: EditorPosition, to: EditorPosition, emoji: string) {
  editor.dispatch(editor.state.tr.setSelection({ anchor: from, head: to, isCollapsed: false }).insertText(emoji));
}

/**
 * :emoji: shortcodes. Typing ":" and two letters lists the emoji whose
 * names have them; picking one puts it in place of what was typed. Typing a
 * whole known name with its closing ":" (":fire:") also turns it into the
 * emoji. The emoji go in as text.
 */
export function emojiPlugin(options: EmojiOptions = {}): LevitPlugin {
  const list = options.emoji ?? DEFAULT_EMOJI;
  const byName = new Map(list.map((item) => [item.name, item]));
  return {
    name: 'emoji',
    setup: (editor) => {
      const popup = createAutocomplete(editor, {
        char: ':',
        label: editor.messages.emojiMenuLabel,
        className: 'levit-emoji-menu',
        minQuery: MIN_QUERY,
        items: (query) => findEmoji(list, query).slice(0, SHOWN_LIMIT).map((item) => ({ id: item.name, title: item.name, icon: item.emoji, item })),
        onSelect: (entry, range) => {
          if (range) replaceWith(editor, range.from, range.to, entry.item.emoji);
          else editor.dispatch(editor.state.tr.insertText(entry.item.emoji));
        },
      });
      // The closing ":" of a known name: the emoji instead of the ":".
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== ':' || event.isComposing || editor.isComposing || !editor.isEditable) return;
        const typed = typedName(editor);
        const item = typed && byName.get(typed.name);
        if (!typed || !item) return;
        event.preventDefault();
        replaceWith(editor, typed.from, typed.to, item.emoji);
      };
      editor.container.addEventListener('keydown', onKeyDown, true);
      return () => {
        popup.destroy();
        editor.container.removeEventListener('keydown', onKeyDown, true);
      };
    },
  };
}
