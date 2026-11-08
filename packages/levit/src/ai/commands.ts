import type { LevitEditor } from '../core/editor.js';
import type { LevitPlugin } from '../core/plugin/plugin.js';
import type { EditorSelection } from '../core/model/types.js';
import type { LevitMessages } from '../i18n/messages.js';
import { getBlockText, orderedSelection, sliceDocument } from '../core/model/document.js';
import { documentToMarkdown } from '../serializers/markdown.js';
import { streamMarkdown } from './stream-markdown.js';
import { proposeReplacement, resolveSuggestions, suggestionMarks, hasSuggestions } from './suggestions.js';

/** What the AI provider is asked to do. Texts are Markdown. */
export interface AIRequest {
  /** The command id, like "improve". */
  command: string;
  /** Instructions for the model. */
  prompt: string;
  /** The text to work on: the selection, or the whole document for a summary. */
  text: string;
  /** Text before the selection or caret (up to contextLength characters). */
  before: string;
  /** Text after the selection or caret (up to contextLength characters). */
  after: string;
  /** Aborted when the user stops the answer (Escape). Pass it to fetch(). */
  signal: AbortSignal;
}

/**
 * Connects any AI model: returns the answer as a stream of Markdown text.
 * Levit never calls an AI service itself.
 */
export type AIProvider = (request: AIRequest) => AsyncIterable<string> | Promise<AsyncIterable<string>>;

export interface AICommand {
  id: string;
  /** Menu title. Built-in commands use the editor's messages. */
  title?: string;
  description?: string;
  icon?: string;
  /** Instructions sent to the model as request.prompt. */
  prompt: string;
  /**
   * Where the answer goes: 'replace' the selection, write at the 'cursor'
   * (the end of the selection), or a new block 'below' the selection.
   */
  insert: 'replace' | 'cursor' | 'below';
  /** Only run with selected text (the menu item does nothing without it). */
  needsSelection?: boolean;
  /** Also show a button in the bubble menu. */
  bubble?: boolean;
  /**
   * For 'replace': show the answer as a suggestion to accept or reject
   * instead of replacing the text. Default: the plugin's `suggestions`.
   */
  suggest?: boolean;
}

export interface AIPluginOptions {
  provider: AIProvider;
  /** Extra commands; one with a built-in id replaces it. */
  commands?: AICommand[];
  /** Characters of text before and after to send as context. Default 4000. */
  contextLength?: number;
  /** Show 'replace' answers (like Improve) as suggestions to accept or reject. Default true. */
  suggestions?: boolean;
}

/** The built-in commands, with the message keys of their titles. */
const BUILT_IN: (AICommand & { titleKey: keyof LevitMessages; descriptionKey: keyof LevitMessages })[] = [
  {
    id: 'improve',
    titleKey: 'aiImprove',
    descriptionKey: 'aiImproveDescription',
    icon: '✨',
    prompt:
      'Improve the writing of the text: fix spelling and grammar and make it clear and natural. Keep its meaning, its language and its Markdown formatting. Reply with the improved text only.',
    insert: 'replace',
    needsSelection: true,
    bubble: true,
  },
  {
    id: 'continue',
    titleKey: 'aiContinue',
    descriptionKey: 'aiContinueDescription',
    icon: '✍️',
    prompt:
      'Continue writing from the end of the text before, in the same language, tone and format. Reply with the new text only, without repeating what is already there.',
    insert: 'cursor',
  },
  {
    id: 'summarize',
    titleKey: 'aiSummarize',
    descriptionKey: 'aiSummarizeDescription',
    icon: '📝',
    prompt: 'Summarize the text in a few short sentences or bullet points, in the same language. Reply with the summary only.',
    insert: 'below',
  },
];

const configs = new WeakMap<LevitPlugin, AIPluginOptions>();
let suggestionCount = 0;
const barUpdates = new WeakMap<LevitEditor, () => void>();
const running = new WeakMap<LevitEditor, AbortController>();

/**
 * The AI plugin: adds "Improve writing", "Continue writing" and "Summarize"
 * (and your own commands) to the slash and bubble menus, answered by your
 * provider. Run a command from code with runAICommand().
 */
export function aiPlugin(options: AIPluginOptions): LevitPlugin {
  const commands = allCommands(options);
  const title = (command: AICommand) => (editor: LevitEditor) => command.title ?? editor.messages[builtInKey(command.id, 'titleKey')];
  const description = (command: AICommand) => (editor: LevitEditor) =>
    command.description ?? editor.messages[builtInKey(command.id, 'descriptionKey')];
  const run = (id: string) => (editor: LevitEditor) => {
    runAICommand(editor, id).catch((error) => editor.reportError(error));
  };

  const plugin: LevitPlugin = {
    name: 'ai',
    marks: suggestionMarks,
    commands: {
      /** Accepts the open AI suggestions (or the one with this id). */
      // Not while an answer is still streaming in.
      acceptSuggestions: (id?: string) => (tr, editor) => !running.has(editor) && resolveSuggestions(tr, true, id),
      /** Rejects the open AI suggestions (or the one with this id). */
      rejectSuggestions: (id?: string) => (tr, editor) => !running.has(editor) && resolveSuggestions(tr, false, id),
    },
    // Only act while there is a suggestion; otherwise the key passes on.
    keymap: {
      'Mod-Shift-Enter': (editor) => editor.commands.acceptSuggestions(),
      'Mod-Shift-Backspace': (editor) => editor.commands.rejectSuggestions(),
    },
    setup: (editor) => createSuggestionBar(editor),
    slashItems: commands.map((command) => ({
      id: `ai-${command.id}`,
      title: title(command),
      description: description(command),
      icon: command.icon ?? '✨',
      action: run(command.id),
    })),
    bubbleItems: commands
      .filter((command) => command.bubble)
      .map((command) => ({ label: command.icon ?? '✨', title: title(command), action: run(command.id) })),
  };
  configs.set(plugin, options);
  return plugin;
}

function allCommands(options: AIPluginOptions): AICommand[] {
  const custom = options.commands ?? [];
  return [...BUILT_IN.filter((b) => !custom.some((c) => c.id === b.id)), ...custom];
}

function builtInKey(id: string, key: 'titleKey' | 'descriptionKey'): keyof LevitMessages {
  return BUILT_IN.find((b) => b.id === id)?.[key] ?? 'aiImprove';
}

/**
 * Runs an AI command on the editor's selection and streams the answer in.
 * Resolves with the Markdown received (and whether it was stopped), or null
 * when the command needs selected text and there is none. Escape stops it.
 */
export async function runAICommand(
  editor: LevitEditor,
  id: string,
  overrides: { prompt?: string } = {}
): Promise<{ markdown: string; aborted: boolean } | null> {
  const plugin = editor.schema.plugins.find((p) => configs.has(p));
  if (!plugin) throw new Error('This editor has no AI provider: add aiPlugin({ provider }) to its plugins');
  const options = configs.get(plugin)!;
  const command = allCommands(options).find((c) => c.id === id);
  if (!command) throw new Error(`Unknown AI command "${id}"`);
  if (running.has(editor)) throw new Error('An AI command is already running in this editor');

  const { doc, selection } = editor.state;
  if (command.needsSelection && selection.isCollapsed) return null;

  const limit = options.contextLength ?? 4000;
  const { before, after } = surroundingText(editor, selection, limit);
  const summarizeAll = command.insert === 'below' && selection.isCollapsed;
  const text = summarizeAll ? documentToMarkdown(doc, { plugins: editor.schema.plugins }) : selectionMarkdown(editor, selection);

  const controller = new AbortController();
  running.set(editor, controller);
  // Escape stops the answer, unless something else (a menu, a dialog) handled it.
  const stopOnEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !e.defaultPrevented) controller.abort();
  };
  document.addEventListener('keydown', stopOnEscape);

  // Locked from now on, also while waiting for the provider to answer.
  const wasEditable = editor.isEditable;
  editor.setEditable(false);
  try {
    // "cursor": write at the end of the selection, keeping the selected text.
    if (command.insert === 'cursor' && !selection.isCollapsed) {
      const end = selectionEnd(editor, selection);
      editor.setSelectionQuietly({ anchor: end, head: end, isCollapsed: true });
    }
    // The answer goes where the selection was when the command started. If
    // the document changes while the provider is thinking, the answer is
    // dropped rather than written over that change.
    const base = editor.state;
    let changedWhileWaiting = false;
    const stopWatching = editor.on('update', () => (changedWhileWaiting = true));
    let stream: AsyncIterable<string>;
    try {
      stream = await options.provider({
        command: command.id,
        prompt: overrides.prompt ?? command.prompt,
        text,
        before: summarizeAll ? '' : before,
        after: summarizeAll ? '' : after,
        signal: controller.signal,
      });
    } finally {
      stopWatching();
    }
    if (changedWhileWaiting) {
      controller.abort();
      return { markdown: '', aborted: true };
    }
    const suggest = command.insert === 'replace' && (command.suggest ?? options.suggestions ?? true);
    const id = `ai-${Date.now().toString(36)}-${++suggestionCount}`;
    return await streamMarkdown(editor, stream, {
      base,
      lock: false,
      signal: controller.signal,
      at: command.insert === 'below' ? 'below' : 'selection',
      insert: suggest ? (tr, blocks, final) => proposeReplacement(tr, blocks, id, final) : undefined,
    });
  } finally {
    document.removeEventListener('keydown', stopOnEscape);
    editor.setEditable(wasEditable);
    running.delete(editor);
    // The answer is complete: show the toolbar for its suggestions.
    barUpdates.get(editor)?.();
  }
}

/** Stops the AI answer running in an editor, if there is one. */
export function stopAI(editor: LevitEditor): void {
  running.get(editor)?.abort();
}

function selectionMarkdown(editor: LevitEditor, selection: EditorSelection): string {
  const blocks = sliceDocument(editor.state.doc, selection);
  return blocks.length > 0 ? documentToMarkdown({ version: 1, blocks }, { plugins: editor.schema.plugins }).trim() : '';
}

const ends = (editor: LevitEditor, selection: EditorSelection) => orderedSelection(editor.state.doc, selection);

function selectionEnd(editor: LevitEditor, selection: EditorSelection) {
  return { ...ends(editor, selection).to };
}

/** Markdown of the document before and after the selection, cut to `limit` characters. */
function surroundingText(editor: LevitEditor, selection: EditorSelection, limit: number) {
  const doc = editor.state.doc;
  const { from, to } = ends(editor, selection);
  const first = doc.blocks[0];
  const last = doc.blocks[doc.blocks.length - 1];
  const docEnd = { blockId: last.id, offset: getBlockText(last).length };
  const range = (anchor: typeof from, head: typeof from): EditorSelection => ({
    anchor,
    head,
    isCollapsed: anchor.blockId === head.blockId && anchor.offset === head.offset,
  });
  const markdown = (sel: EditorSelection) => {
    const blocks = sliceDocument(doc, sel);
    return blocks.length > 0 ? documentToMarkdown({ version: 1, blocks }, { plugins: editor.schema.plugins }).trim() : '';
  };
  // slice(-0) would be the whole text, so no context at all for 0.
  if (limit <= 0) return { before: '', after: '' };
  return {
    before: markdown(range({ blockId: first.id, offset: 0 }, from)).slice(-limit),
    after: markdown(range(to, docEnd)).slice(0, limit),
  };
}

/**
 * A toolbar with Accept and Reject that floats by the first open suggestion.
 * Returns the cleanup for editor.destroy().
 */
function createSuggestionBar(editor: LevitEditor): () => void {
  const m = editor.messages;
  const bar = document.createElement('div');
  bar.className = 'levit-suggestion-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', m.suggestionToolbar);
  bar.style.display = 'none';

  const button = (label: string, title: string, command: 'acceptSuggestions' | 'rejectSuggestions') => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `levit-suggestion-${command === 'acceptSuggestions' ? 'accept' : 'reject'}`;
    el.textContent = label;
    el.title = title;
    el.setAttribute('aria-label', title);
    // Mouse: act on mousedown so the editor keeps its selection.
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      editor.commands[command]();
    });
    // Keyboard (Enter or Space): a click without a mouse.
    el.addEventListener('click', (e) => {
      if (e.detail === 0) editor.commands[command]();
    });
    return el;
  };
  bar.append(button(`✓ ${m.suggestionAccept}`, m.suggestionAccept, 'acceptSuggestions'), button(`✕ ${m.suggestionReject}`, m.suggestionReject, 'rejectSuggestions'));
  document.body.appendChild(bar);

  const update = () => {
    if (running.has(editor) || !hasSuggestions(editor.state.doc.blocks)) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = 'flex';
    const first = editor.container.querySelector('[data-suggestion]');
    const rect = first?.getBoundingClientRect();
    if (rect && rect.height > 0) {
      bar.style.top = `${rect.bottom + window.scrollY + 6}px`;
      bar.style.left = `${Math.max(10, rect.left + window.scrollX)}px`;
    }
  };
  const stop = editor.on('update', update);
  barUpdates.set(editor, update);
  update();
  return () => {
    stop();
    barUpdates.delete(editor);
    bar.remove();
  };
}
