// The landing page: the playground (write, AI, writing together, comments),
// the formats line, the feature switches and the copy button.
import * as Y from 'yjs';
import {
  commentsPlugin,
  createBubbleMenu,
  createLevitEditor,
  createSlashMenu,
  createTableToolbar,
  documentToHTML,
  getComments,
  htmlToDocument,
  locales,
  markdownToDocument,
  type LevitEditor,
} from '@yonailab/levit';
import { aiPlugin, runAICommand, stopAI } from '@yonailab/levit/ai';
import { bindYjs, type AwarenessLike } from '@yonailab/levit-yjs';
import { strings, type Lang } from '../lib/strings';
import { createFakeProvider } from './fake-ai';
import { samples } from './samples';
import { setUpPage } from './page';
import '@yonailab/levit/levit.css';
import './site.css';

const pageLang = (document.documentElement.lang || 'en') as Lang;
const s = strings[pageLang];
const root = document.getElementById('playground')!;
const editorEl = (name: string) => root.querySelector<HTMLElement>(`[data-editor="${name}"]`)!;

setUpPage();

// ---------------------------------------------------------------- tabs

const tabs = Array.from(root.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
function selectTab(tab: HTMLButtonElement, focus = false) {
  for (const t of tabs) {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
    root.querySelector<HTMLElement>(`[data-panel="${t.dataset.tab}"]`)!.hidden = !on;
    root.querySelector<HTMLElement>(`[data-hint="${t.dataset.tab}"]`)!.hidden = !on;
  }
  if (focus) tab.focus();
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(tab);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    selectTab(tabs[(next + tabs.length) % tabs.length], true);
  });
}

// ---------------------------------------------------------------- editors

let menusLang: Lang = pageLang;
const live: { destroy(): void }[] = [];
const docs = new Map<string, unknown>();

function editor(name: string, markdown: string, options: Record<string, unknown> = {}): LevitEditor {
  const el = editorEl(name);
  el.textContent = '';
  const ed = createLevitEditor(el, {
    messages: locales[menusLang],
    initialContent: (docs.get(name) as any) ?? markdownToDocument(markdown),
    ...options,
  });
  const menus = [createBubbleMenu(ed), createSlashMenu(ed), createTableToolbar(ed)];
  live.push({
    destroy: () => {
      docs.set(name, ed.getJSON());
      for (const menu of menus) menu.destroy();
      ed.destroy();
    },
  });
  return ed;
}

// ---- Writing together: two Yjs documents that pass every update to each other.
const docA = new Y.Doc();
const docB = new Y.Doc();
docA.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(docB, u, 'net'));
docB.on('update', (u: Uint8Array, origin: unknown) => origin !== 'net' && Y.applyUpdate(docA, u, 'net'));

/** A tiny stand-in for y-protocols' Awareness, shared by the two sides. */
function awarenessPair(): [AwarenessLike, AwarenessLike] {
  const states = new Map<number, Record<string, unknown>>();
  const handlers = new Set<(changes: any, origin: unknown) => void>();
  const make = (clientID: number): AwarenessLike =>
    ({
      clientID,
      getStates: () => states,
      setLocalStateField(field: string, value: unknown) {
        states.set(clientID, { ...(states.get(clientID) ?? {}), [field]: value });
        for (const h of handlers) h({ added: [], updated: [clientID], removed: [] }, 'local');
      },
      on: (_e: string, h: any) => handlers.add(h),
      off: (_e: string, h: any) => handlers.delete(h),
    }) as unknown as AwarenessLike;
  return [make(1), make(2)];
}

// ---- Comments: the editor keeps where they are; the page keeps the notes.
const notes = new Map<string, string>();
let commentEditor: LevitEditor | null = null;
const list = root.querySelector<HTMLOListElement>('[data-comment-list]')!;
const empty = root.querySelector<HTMLElement>('[data-comment-empty]')!;

function renderComments(active: string[] = []) {
  if (!commentEditor) return;
  const comments = getComments(commentEditor);
  list.textContent = '';
  empty.hidden = comments.length > 0;
  for (const c of comments) {
    const item = document.createElement('li');
    item.className = 'pg-comment';
    if (active.includes(c.id)) item.classList.add('is-active');
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'pg-comment-open';
    const quote = document.createElement('span');
    quote.className = 'pg-comment-quote';
    quote.textContent = c.text;
    const note = document.createElement('span');
    note.className = 'pg-comment-note';
    note.textContent = `${s.playground.comments.author}: ${notes.get(c.id) ?? ''}`;
    open.append(quote, note);
    open.addEventListener('click', () => {
      commentEditor!.commands.selectComment(c.id);
      commentEditor!.focus();
    });
    const resolve = document.createElement('button');
    resolve.type = 'button';
    resolve.className = 'pg-comment-resolve';
    resolve.textContent = s.playground.comments.remove;
    resolve.addEventListener('click', () => {
      commentEditor!.commands.removeComment(c.id);
      notes.delete(c.id);
      renderComments();
    });
    item.append(open, resolve);
    list.append(item);
  }
}

let commentCount = 0;
function nextNote() {
  const all = s.playground.comments.notes;
  return all[commentCount++ % all.length];
}

/** Selects a phrase in a block, or the whole block. Uses the last block when there are fewer. */
function selectText(ed: LevitEditor, blockIndex: number, phrase: string) {
  const blocks = ed.state.doc.blocks;
  const block = blocks[Math.min(blockIndex, blocks.length - 1)];
  const text = block.content.map((n) => n.text).join('');
  // The phrase, or the whole block when there is none (or it is not there).
  const found = phrase ? text.indexOf(phrase) : -1;
  const from = found >= 0 ? found : 0;
  const to = found >= 0 ? found + phrase.length : text.length;
  ed.dispatch(
    ed.state.tr.setSelection({
      anchor: { blockId: block.id, offset: from },
      head: { blockId: block.id, offset: to },
      isCollapsed: from === to,
    })
  );
}

let aiEditor: LevitEditor | null = null;
let bindings: { destroy(): void }[] = [];

function build() {
  const sample = samples[pageLang];
  editor('write', sample.write);

  aiEditor = editor('ai', sample.ai, { plugins: [aiPlugin({ provider: createFakeProvider(pageLang) })] });

  const [awA, awB] = awarenessPair();
  const left = editor('left', docA.getArray('blocks').length ? '' : sample.together);
  const right = editor('right', '');
  bindings = [
    bindYjs(left, docA.getArray('blocks'), { awareness: awA, user: { name: s.playground.together.left, color: '#e11d48' } }),
    bindYjs(right, docB.getArray('blocks'), { awareness: awB, user: { name: s.playground.together.right, color: '#0d7480' } }),
  ];

  const firstBuild = !docs.has('comments');
  commentEditor = editor('comments', sample.comments, {
    plugins: [
      commentsPlugin({
        onAdd: ({ id }) => {
          notes.set(id, nextNote());
          queueMicrotask(() => renderComments([id]));
        },
        onSelect: (ids) => renderComments(ids),
      }),
    ],
  });
  if (firstBuild) {
    // One comment to start with, on the figure in the draft.
    selectText(commentEditor, 1, pageLang === 'en' ? 'about 5 ms' : pageLang === 'ko' ? '약 5 ms' : '約5 ms');
    commentEditor.commands.addComment();
    const end = commentEditor.state.doc.blocks[0];
    commentEditor.dispatch(
      commentEditor.state.tr.setSelection({
        anchor: { blockId: end.id, offset: 0 },
        head: { blockId: end.id, offset: 0 },
        isCollapsed: true,
      })
    );
  }
  renderComments();
}

function rebuild() {
  for (const b of bindings) b.destroy();
  bindings = [];
  for (const e of live.splice(0)) e.destroy();
  // Shared text lives in the Yjs documents, not in the saved JSON.
  docs.delete('left');
  docs.delete('right');
  build();
}

build();

// ---- AI buttons
const stopButton = root.querySelector<HTMLButtonElement>('[data-ai="stop"]')!;
const aiButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-ai]:not([data-ai="stop"])'));
const menusSelect = root.querySelector<HTMLSelectElement>('[data-menus]')!;
/** One answer at a time; the editors are not rebuilt while it streams. */
function setRunning(running: boolean) {
  for (const b of aiButtons) b.disabled = running;
  stopButton.disabled = !running;
  menusSelect.disabled = running;
}
for (const button of root.querySelectorAll<HTMLButtonElement>('[data-ai]')) {
  const command = button.dataset.ai!;
  button.addEventListener('click', async () => {
    const ed = aiEditor!;
    if (command === 'stop') return stopAI(ed);
    const sel = ed.state.selection;
    if (command === 'improve' && sel.isCollapsed) selectText(ed, 1, '');
    if (command === 'continue') {
      const last = ed.state.doc.blocks[ed.state.doc.blocks.length - 1];
      const end = last.content.map((n) => n.text).join('').length;
      ed.dispatch(ed.state.tr.setSelection({ anchor: { blockId: last.id, offset: end }, head: { blockId: last.id, offset: end }, isCollapsed: true }));
    }
    setRunning(true);
    try {
      await runAICommand(ed, command);
    } finally {
      setRunning(false);
    }
  });
}

// ---- Comment button
root.querySelector('[data-comment-add]')!.addEventListener('click', () => {
  const ed = commentEditor!;
  if (ed.state.selection.isCollapsed) selectText(ed, 2, '@yonailab/levit-yjs');
  ed.commands.addComment();
  ed.focus();
});

// ---- Menu language and dark theme
menusSelect.addEventListener('change', (e) => {
  menusLang = (e.target as HTMLSelectElement).value as Lang;
  rebuild();
});
root.querySelector<HTMLInputElement>('[data-theme-toggle]')!.addEventListener('change', (e) => {
  document.documentElement.dataset.theme = (e.target as HTMLInputElement).checked ? 'dark' : 'light';
});

// ---------------------------------------------------------------- formats

const input = document.querySelector<HTMLInputElement>('[data-formats-input]')!;
const preview = createLevitEditor(document.querySelector<HTMLElement>('[data-out="preview"]')!, { messages: locales[pageLang] });
preview.setEditable(false);
const htmlOut = document.querySelector<HTMLElement>('[data-out="html"]')!;
const jsonOut = document.querySelector<HTMLElement>('[data-out="json"]')!;

function showFormats() {
  const doc = markdownToDocument(input.value);
  // Readable ids: the parser makes random ones.
  doc.blocks.forEach((b, i) => (b.id = `b${i + 1}`));
  preview.setJSON(doc);
  htmlOut.textContent = documentToHTML(doc);
  jsonOut.textContent = JSON.stringify(doc.blocks, null, 1).replace(/\n\s*/g, ' ');
}
input.addEventListener('input', showFormats);
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-example]')) {
  b.addEventListener('click', () => {
    input.value = b.dataset.example!;
    showFormats();
    input.focus();
  });
}
showFormats();

// ---------------------------------------------------------------- feature switches

for (const sw of document.querySelectorAll<HTMLButtonElement>('.band .switch')) {
  sw.addEventListener('click', () => {
    const on = sw.getAttribute('aria-checked') !== 'true';
    sw.setAttribute('aria-checked', String(on));
    sw.closest('.band')!.classList.toggle('is-on', on);
  });
}

// ---------------------------------------------------------------- feature fragments

// Pasted HTML: what goes in, and what Levit keeps.
const pasted =
  '<p onclick="steal()">Hello <a href="javascript:alert(1)">there</a></p><script>steal()</script><img src=x onerror="steal()">';
document.querySelector('[data-paste-in]')!.textContent = pasted;
document.querySelector('[data-paste-out]')!.textContent = documentToHTML(htmlToDocument(pasted));

// A long document, made when the band first comes near.
const bigEl = document.querySelector<HTMLElement>('[data-big-editor]')!;
const bigCaption = document.querySelector<HTMLElement>('[data-big-caption]')!;
function makeBig() {
  const words = s.features.items.map((i) => i.sentence);
  const blocks = Array.from({ length: 20000 }, (_, i) => ({
    id: `p${i}`,
    type: 'paragraph',
    attrs: {},
    content: [{ text: `${i + 1}. ${words[i % words.length]}` }],
  }));
  const label = bigCaption.textContent;
  bigCaption.textContent = bigCaption.dataset.loading!;
  requestAnimationFrame(() =>
    setTimeout(() => {
      createLevitEditor(bigEl, { messages: locales[pageLang], initialContent: { version: 1, blocks } as any });
      bigCaption.textContent = label;
    })
  );
}
new IntersectionObserver(
  (entries, observer) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    observer.disconnect();
    makeBig();
  },
  { rootMargin: '400px 0px' }
).observe(bigEl);
