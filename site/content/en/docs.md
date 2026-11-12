# Developer docs

Levit is a rich-text editor for the web, written in TypeScript on standard browser APIs with zero runtime dependencies. The core is about 30 kB gzipped, the optional AI entry point about 7 kB more. Documents are plain JSON you can store, diff and generate. It runs in Chrome 87, Edge 88, Firefox 78, Safari 14 and later. Source on [GitHub](https://github.com/azusawa/levit), packages on [npm](https://www.npmjs.com/package/@yonailab/levit).

## Install

The core package is all you need. Framework and collaboration packages are optional.

```bash
npm install @yonailab/levit
```

```bash
npm install @yonailab/levit @yonailab/levit-react   # React 18 or 19
npm install @yonailab/levit @yonailab/levit-vue     # Vue 3
npm install @yonailab/levit @yonailab/levit-yjs yjs # real-time collaboration
```

Levit is ESM only: use it through a bundler or `import`. Importing it during server-side rendering is safe; the `<levit-editor>` element is only registered in browsers.

## Quick start

### Web component

Without a build step, load the script and the stylesheet and use the `<levit-editor>` tag.

```html
<script type="module" src="https://unpkg.com/@yonailab/levit/dist/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@yonailab/levit/dist/levit.css">

<levit-editor placeholder="Write something..."></levit-editor>

<script type="module">
  const el = document.querySelector('levit-editor');
  el.addEventListener('input', (e) => {
    console.log(e.detail.json, e.detail.text);
  });
</script>
```

The element reads `placeholder`, `lang` (`ko` or `ja` for built-in messages; changing it later builds a new `editor` with the same text, so attach handlers again), `theme` (`dark` or `light`) and an initial `value` (document JSON). It comes with the bubble and slash menus and the table toolbar, like the React and Vue components; `bubble-menu="false"`, `slash-menu="false"` or `table-toolbar="false"` leaves one out. It also has `getJSON()`, `setJSON()`, `getText()`, `focus()`, and an `editor` property with the full editor. Moving the element in the page keeps the same editor, and after removal `getJSON()` still returns the document.

### JavaScript or TypeScript

`createLevitEditor` turns any element into an editor. The bubble toolbar (shown on selected text), the slash menu (`/`) and the table toolbar (shown above the table the caret is in) are separate, so you only load what you use.

```ts
import { createLevitEditor, createBubbleMenu, createSlashMenu, createTableToolbar } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const editor = createLevitEditor(document.getElementById('editor')!, {
  placeholder: 'Write, or press "/" for commands',
});

createBubbleMenu(editor);
createSlashMenu(editor);
createTableToolbar(editor);
```

### Load and save

Pass a saved document as `initialContent`, and read it back with `getJSON()` whenever it changes.

```ts
const editor = createLevitEditor(element, {
  initialContent: savedDoc,
  onChange: (ed) => save(ed.getJSON()),
});

editor.setJSON(otherDoc); // replace the document later
editor.getText();         // plain text
```

Call `editor.destroy()` when the editor goes away; it gives the element back as it was.

## The document

A document is a version number and a flat list of blocks. Each block has an `id`, a `type`, optional `attrs` and `content`: a list of text runs, each with its `marks`.

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "b_1",
      "type": "heading",
      "attrs": { "level": 1 },
      "content": [{ "text": "Hello Levit", "marks": [] }]
    },
    {
      "id": "b_2",
      "type": "paragraph",
      "attrs": {},
      "content": [
        { "text": "This is ", "marks": [] },
        { "text": "bold", "marks": [{ "type": "bold" }] },
        { "text": " text.", "marks": [] }
      ]
    }
  ]
}
```

Line breaks inside a block (`Shift+Enter`) are stored as `"\n"` in the text.

### Block types

- `paragraph`
- `heading` with `attrs.level` from 1 to 6
- `blockquote`
- `code_block` with an optional `attrs.language`, such as `"ts"`
- `bullet_list_item` and `ordered_list_item`
- `task_list_item` with `attrs.checked` (boolean)
- `horizontal_rule`
- `image` with `attrs.src` and `attrs.alt`
- `table_cell` with `attrs.table`, `attrs.row` and an optional `attrs.header` (boolean)

Lists are flat: every list item is its own block, and consecutive items of the same type form one list. Nesting is `attrs.indent` (0 to 8, left out at the top level), and an item is at most one level deeper than the one above it.

`horizontal_rule` and `image` have no text (`content: [{ "text": "" }]`), and the caret never goes inside them. An image `src` must be `http:`, `https:`, `blob:`, relative, or a bitmap `data:image/...` URL; SVG is refused.

```json
[
  { "type": "bullet_list_item", "content": [{ "text": "Fruits" }] },
  { "type": "bullet_list_item", "attrs": { "indent": 1 }, "content": [{ "text": "Apple" }] },
  { "type": "task_list_item", "attrs": { "checked": true }, "content": [{ "text": "Buy milk" }] },
  { "type": "image", "attrs": { "src": "https://example.com/a.png", "alt": "A" }, "content": [{ "text": "" }] }
]
```

### Marks

- `bold`, `italic`, `underline`, `strike`
- `highlight`
- `code`
- `link` with `attrs.href`

A link `href` must be `http:`, `https:`, `mailto:` or relative. Anything else, such as `javascript:`, is dropped when the document is rendered, imported or exported.

### Markdown shortcuts

Typed at the start of a block, these turn into formatting as you type. They do not apply inside code blocks.

- `# ` to `###### ` for headings
- `> ` for a quote
- three backticks for a code block
- `- ` or `* ` for a bulleted list, `1. ` for a numbered list
- `[] `, `[ ] ` or `[x] ` for a task (also after `- `)
- `---` for a divider

Tables are flat too: every cell is a `table_cell` block. `attrs.table` names its table and `attrs.row` its row; the cells of a table follow each other, row after row, left to right. Header cells have `attrs.header: true`, usually in the first row. A cell holds text only, and its line breaks are `"\n"`. Give each table and each row an id of its own.

```json
[
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r1", "header": true }, "content": [{ "text": "Name" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r1", "header": true }, "content": [{ "text": "Price" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r2" }, "content": [{ "text": "Tea" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r2" }, "content": [{ "text": "3.00" }] }
]
```

## HTML and Markdown

Serializers convert documents to and from HTML and Markdown. They do not need an editor instance. `htmlToDocument` uses the browser's `DOMParser`, which servers do not have built in.

```ts
import {
  documentToHTML, htmlToDocument,
  documentToMarkdown, markdownToDocument,
  documentToJSON, documentFromJSON,
} from '@yonailab/levit';

const html = documentToHTML(editor.getJSON());
const md = documentToMarkdown(editor.getJSON());

const fromHtml = htmlToDocument('<h1>Title</h1><p>Body</p>');
const fromMd = markdownToDocument('# Title\n\n**Bold** text');
```

`documentFromJSON` turns stored JSON into a document and fills in missing fields such as ids; `documentToJSON` gives clean, deterministic JSON. The editor also has `editor.getHTML()` and `editor.getMarkdown()`, which include blocks and marks from its plugins.

How Levit formats map:

- Nested lists become nested `<ul>`/`<ol>`, and Markdown lists indented under their parent.
- Tasks are `- [ ] text` / `- [x] text` in Markdown and `<li data-checked>` with a checkbox in HTML.
- Highlight is `==text==` / `<mark>`, dividers `---` / `<hr>`, images `![alt](src)` / `<img>`.
- A code language becomes the fence info string in Markdown and `class="language-ts"` in HTML.
- Tables are `<table>` in HTML, with header rows in `<thead>` and header cells as `<th>`, and GitHub tables in Markdown (`| a | b |`, then `| --- | --- |`). A table without a header row is written with an empty header row, which reading leaves out again, and line breaks in a cell are `<br>`. A pasted HTML table stays a table; the paragraphs of a cell become its lines.

Pasting uses the same converters: HTML first (web pages, Google Docs), then multi-line Markdown, then plain text, one paragraph per line.

## Commands

### The chain API

Commands are chained into one transaction and applied with `run()`, which returns `true` if something changed. A chain is one undo step.

```ts
editor.chain().insertText('Hello').toggleBold().setHeading(2).run();

editor.chain().setBlockType('bullet_list_item').run();
editor.chain().setBlockType('task_list_item', { checked: false }).run();
editor.chain().setParagraph().run();
editor.chain().indentListItem().run();     // Tab; outdentListItem() is Shift+Tab
editor.chain().toggleTaskChecked().run();  // or toggleTaskChecked(blockId)
```

Marks, links and inserts:

```ts
editor.chain().toggleItalic().run();       // also toggleUnderline, toggleStrike, toggleHighlight
editor.chain().toggleMark({ type: 'code' }).run();
editor.chain().setLink('https://example.com').run(); // applies to the selection
editor.chain().unsetLink().run();

editor.chain().insertHorizontalRule().run();
editor.chain().insertImage({ src: 'https://example.com/a.png', alt: 'A' }).run();
editor.chain().setCodeBlock('ts').run();   // setCodeLanguage('py') changes it, '' clears it
editor.chain().insertFragment(blocks).run(); // insert blocks at the caret, like a paste
editor.chain().insertLineBreak().run();    // Shift+Enter
editor.chain().selectAll().run();
```

Tables:

```ts
editor.chain().insertTable(3, 3).run();    // rows, columns; { header: false } for no header row
editor.chain().addRowBefore().run();       // also addRowAfter, addColumnBefore, addColumnAfter
editor.chain().deleteRow().run();          // also deleteColumn, deleteTable
editor.chain().toggleHeaderRow().run();    // the first row as a header, or back
editor.chain().goToNextCell().run();       // Tab; goToPreviousCell() is Shift+Tab
editor.isInTable();                        // true when the caret is in a table
```

While the caret is in a table, the table toolbar from `createTableToolbar(editor)` shows above it with the same commands as buttons. `<levit-editor>` and the React and Vue components add it for you.

Deleting works like the keys: `deleteBackward()`, `deleteForward()`, `deleteWordBackward()`, `deleteWordForward()`, `deleteLineBackward()`, `deleteLineForward()` and `deleteSelection()`.

### Editor options

```ts
createLevitEditor(element, {
  initialContent: doc,           // document JSON to start with
  placeholder: 'Write...',
  onChange: (editor) => {},
  onSelectionChange: (selection) => {},
  // Pasted and dropped image files are uploaded with this, then inserted.
  // Without it, image files are ignored.
  uploadImage: async (file) => 'https://cdn.example.com/a.png',
  // Errors from background work, such as a failed upload.
  onError: (error) => console.error(error),
  // Highlights code blocks that have a language.
  highlightCode: (code, language) => code,
  plugins: [],
  messages: ko,                  // English by default
});
```

`highlightCode` returns HTML for the code, for example from highlight.js or Shiki. Only `<span>` elements with `class` and `style` are kept, and the text must stay the same.

```ts
import hljs from 'highlight.js';

createLevitEditor(element, {
  highlightCode: (code, language) =>
    hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : code,
});
```

### Other methods

```ts
editor.getJSON(); editor.setJSON(json); editor.getText();
editor.getHTML(); editor.getMarkdown();
editor.isActive('bold');          // the selection has the mark (or the next typed text will)
editor.getActiveLink();           // href of the selected link, or null
editor.undo(); editor.redo();
editor.focus(); editor.hasFocus();
editor.setEditable(false);        // lock typing; editor.isEditable reads it
editor.destroy();
```

Also available: `editor.commands` (plugin commands), `editor.messages` and `editor.t(key, values)` (texts in use), `editor.replaceState(state)` to apply a state built elsewhere in one step, and `editor.reportError(error)`, which sends an error to `onError` or the console.

## Events

`editor.on` returns a function that removes the handler.

```ts
const stop = editor.on('update', ({ editor, transaction }) => {
  save(editor.getJSON());
});

editor.on('selectionUpdate', ({ editor, selection }) => {});
editor.on('transaction', ({ editor, transaction }) => {});
editor.on('focus', ({ editor, event }) => {});
editor.on('blur', ({ editor, event }) => {});
editor.on('destroy', ({ editor }) => {});

stop(); // or editor.off('update', handler)
```

- `update`: the document changed, including undo, redo and `setJSON`.
- `selectionUpdate`: the selection moved, or the document changed under it.
- `transaction`: every dispatch, even one that changed nothing.
- `destroy`: the editor is being destroyed; handlers are removed right after.

A handler that throws does not stop the others; its error goes to `onError`, or to the console.

## React and Vue

Both packages accept the editor options as props, add the bubble and slash menus unless you turn them off, and keep the caret in place when the value you got from a change comes back in.

### React

```tsx
import { useState } from 'react';
import { LevitEditor } from '@yonailab/levit-react';
import { ko, type DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

export function Note() {
  const [doc, setDoc] = useState<DocumentData>();
  return <LevitEditor value={doc} onChange={setDoc} messages={ko} />;
}
```

- `value` with `onChange` makes a controlled component; `defaultValue` alone an uncontrolled one.
- `onChange` receives `(value, editor)`.
- `bubbleMenu={false}`, `slashMenu={false}` and `tableToolbar={false}` turn the menus off.
- `ref` or `onReady` gives you the editor instance. `className`, `style` and `id` go to the element.
- The package is marked `'use client'`, so it works in the Next.js App Router.

For your own layout, use the hook. `editor` is `null` until the element mounts.

```tsx
import { useLevitEditor } from '@yonailab/levit-react';

function Editor() {
  const { ref, editor } = useLevitEditor({ placeholder: 'Write' });
  return (
    <>
      <button onClick={() => editor?.chain().toggleBold().run()}>Bold</button>
      <div ref={ref} />
    </>
  );
}
```

### Vue

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { LevitEditor } from '@yonailab/levit-vue';
import type { DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const doc = ref<DocumentData>();
</script>

<template>
  <LevitEditor v-model="doc" placeholder="Write" />
</template>
```

- Props: `placeholder`, `plugins`, `messages`, `uploadImage`, `highlightCode`.
- `:bubble-menu="false"`, `:slash-menu="false"` and `:table-toolbar="false"` turn the menus off.
- `@ready` gives you the editor; `@error` receives errors such as a failed upload.
- The component ref also exposes `editor`.

The composable gives you the editor for your own layout:

```vue
<script setup lang="ts">
import { useLevitEditor } from '@yonailab/levit-vue';

const { element, editor } = useLevitEditor({ placeholder: 'Write' });
</script>

<template>
  <button @click="editor?.chain().toggleBold().run()">Bold</button>
  <div ref="element" />
</template>
```

## Plugins

A plugin is a plain object that adds blocks, marks, commands, keys, input rules and menu items. Pass plugins with the `plugins` option. Plugins may not redefine built-in block or mark types, or each other's.

```ts
import { createLevitEditor, type LevitPlugin } from '@yonailab/levit';

const callout: LevitPlugin = {
  name: 'callout',
  blocks: [{
    type: 'callout',
    tag: 'aside',
    className: 'my-callout',
    toHTML: (block, content) => `<aside class="callout">${content}</aside>`,
    parseHTML: (el) => (el.matches('aside.callout') ? {} : null),
  }],
  commands: {
    setCallout: () => (tr) => void tr.setBlockType('callout'),
  },
  keymap: { 'Mod-Shift-c': (editor) => editor.commands.setCallout() },
  slashItems: [{
    id: 'callout', title: 'Callout', description: 'A highlighted note', icon: '💡',
    action: (editor) => editor.commands.setCallout(),
  }],
};

const editor = createLevitEditor(element, { plugins: [callout] });
```

### Blocks and marks

A block spec (`BlockSpec`) has a `type` and optionally:

- `tag` (default `div`) and `className` for the element
- `toHTML(block, content)` and `toMarkdown(block, text)` for export
- `parseHTML(el)` returning attrs or `null`, and `parseMarkdown(raw)` returning `{ text, attrs }` or `null`
- `atom: true` with `render(block, el)` for a block without text, like an image
- `attrsSchema`, a JSON Schema for its attrs (used by the AI document schema)

```ts
const video = {
  type: 'video',
  atom: true,
  render: (block, el) => { /* draw into el (not editable) */ },
  toHTML: (block) => `<div data-video="${block.attrs?.id}"></div>`,
  parseHTML: (el) => (el.hasAttribute('data-video') ? { id: el.getAttribute('data-video') } : null),
};
```

A mark spec (`MarkSpec`) has a `type`, `tag`, `className`, `attributes(mark)` (attributes starting with `on` are dropped), `toHTML`, `toMarkdown`, `parseHTML`, `attrsSchema`, and `inclusive` (default `true`; set `false` so text typed right after it does not get the mark).

```ts
const color = {
  type: 'color',
  tag: 'span',
  attributes: (mark) => ({ style: `color: ${mark.attrs?.color}` }),
  inclusive: false,
  parseHTML: (el) => ((el as HTMLElement).style.color ? { color: (el as HTMLElement).style.color } : null),
};
```

Serializers need the plugins too: `documentToHTML(doc, { plugins })`, `htmlToDocument(html, { plugins })`, and the same for Markdown. Without the plugin, unknown blocks export as plain paragraphs of their text.

### Commands, keys and rules

- `commands`: factories that take arguments and return a function that changes the transaction (return `false` to cancel). Run them with `editor.commands.name(...)`, or in a chain with `.exec('name', ...args)`.
- `keymap`: `'Mod'` is Cmd on macOS and Ctrl elsewhere. Return `false` to let the built-in key run.
- `inputRules`: `{ match, handler(tr, match, blockId) }`, checked at the start of a block before the built-in rules.
- `slashItems` and `bubbleItems`: menu entries. A `title` may be a function of the editor.
- `setup(editor)`: runs once and may return a cleanup function, called on destroy.

```ts
const plugin: LevitPlugin = {
  name: 'video',
  commands: {
    insertVideo: (id: string) => (tr) => void tr.insertAtom('video', { id }),
  },
  inputRules: [{ match: /^!!!\s$/, handler: (tr, match, blockId) => true }],
  bubbleItems: [{ label: '🎬', title: (editor) => 'Video', action: (editor) => {} }],
  setup: (editor) => () => { /* cleanup */ },
};

editor.chain().exec('insertVideo', 'v1').insertText('caption').run();
```

### Changing a block

Blocks are frozen and shared between states and the undo history. To change one in a command or input rule, ask the transaction for its own copy:

```ts
const block = tr.editBlock(blockId);   // or an index; undefined if missing
if (block) block.attrs = { ...block.attrs, color: 'red' };
// tr.doc.blocks[i].attrs = ...  throws: the block is frozen
```

Blocks a change does not touch stay the same objects, so only changed blocks are redrawn, even in very long documents.

## AI

AI features live in a separate entry point, `@yonailab/levit/ai`, so editors without AI do not load them. Levit never calls an AI service itself: you pass a `provider` that returns the answer as a stream of Markdown text.

### The provider

```ts
import { createLevitEditor } from '@yonailab/levit';
import { aiPlugin, runAICommand, stopAI } from '@yonailab/levit/ai';

const editor = createLevitEditor(element, {
  plugins: [
    aiPlugin({
      // Call your own server, which holds the API key.
      provider: async function* ({ command, prompt, text, before, after, signal }) {
        const res = await fetch('/api/ai', {
          method: 'POST',
          body: JSON.stringify({ command, prompt, text, before, after }),
          signal,
        });
        const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) return;
          yield value;
        }
      },
    }),
  ],
});
```

The provider receives an `AIRequest` and returns an async iterable of strings, or a promise of one:

- `command`: `'improve'`, `'continue'`, `'summarize'` or your own id
- `prompt`: instructions for the model
- `text`: Markdown of the selection (the whole document for `summarize` without one)
- `before` and `after`: Markdown around the selection, `contextLength` characters each (default 4000)
- `signal`: an `AbortSignal`, aborted on Escape or `stopAI(editor)`

### Commands

Built-in commands appear in the slash menu, and `improve` also in the bubble menu:

- `improve` replaces the selection, as a suggestion
- `continue` writes at the caret
- `summarize` adds a block below the selection, or summarizes the whole document

Add your own with `commands`. One with a built-in id replaces it.

```ts
aiPlugin({
  provider,
  commands: [{
    id: 'translate',
    title: 'Translate',
    prompt: 'Translate to English.',
    insert: 'replace',          // or 'cursor', 'below'
    needsSelection: true,
    bubble: true,               // also a bubble menu button
  }],
  suggestions: true,            // 'replace' answers become suggestions (default)
  contextLength: 4000,
});
```

Run commands from code too. `runAICommand` resolves to `{ markdown, aborted }`, or `null` when the command needs a selection and there is none.

```ts
await runAICommand(editor, 'improve');
await runAICommand(editor, 'continue', { prompt: 'Write one more paragraph.' });
stopAI(editor);
```

One command runs at a time. Editing is locked meanwhile (`contenteditable=false`, `aria-busy`), and the whole answer is undone in one step.

### Suggestions

With suggestions on, a `replace` answer does not overwrite the text. Changed words show as deletions and insertions (`<del>` and `<ins>`) to accept or reject:

- with the floating toolbar next to them
- with `Mod-Shift-Enter` (accept) or `Mod-Shift-Backspace` (reject)
- with `editor.commands.acceptSuggestions(id?)` or `editor.commands.rejectSuggestions(id?)`

The commands return `false` when there is nothing to resolve or an answer is still streaming. HTML export shows the `<del>`/`<ins>`; Markdown export reads as if accepted.

### Streaming Markdown

`streamMarkdown` puts any Markdown stream into the editor with live formatting. Unclosed bold or code fences are shown as closed while the text arrives.

```ts
import { streamMarkdown } from '@yonailab/levit/ai';

await streamMarkdown(editor, stream, {
  signal: controller.signal,
  at: 'below',                 // or 'selection' (default)
});
```

### JSON schema and validation

`getDocumentSchema({ plugins })` returns the JSON Schema (2020-12) of a Levit document. Use it as a structured-output or tool schema so a model writes Levit JSON directly. The built-in schema also ships as `@yonailab/levit/document.schema.json`. Plugins describe their attrs with `attrsSchema`.

```ts
import { getDocumentSchema, validateDocument } from '@yonailab/levit/ai';

const schema = getDocumentSchema({ plugins });
const result = validateDocument(jsonFromAI, { plugins });

if (result.valid) editor.setJSON(jsonFromAI);
else console.warn(result.errors); // [{ path: '$.blocks[2].attrs.level', message: '...' }]
```

`validateDocument` also refuses unsafe link and image URLs.

## Collaboration

### Yjs

`@yonailab/levit-yjs` syncs an editor with a Yjs document. Yjs is a peer dependency; the core does not depend on it. It works with any Yjs provider, such as `y-websocket`, `y-webrtc` or `y-indexeddb`.

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { bindYjs } from '@yonailab/levit-yjs';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('wss://example.com', 'room-1', ydoc);

provider.once('sync', () => {
  const binding = bindYjs(editor, ydoc.getArray('blocks'), {
    awareness: provider.awareness,             // share carets
    user: { name: 'Mina', color: '#e11d48' },  // how others see this user
    captureTimeout: 500,                       // undo groups changes within this time
  });
});
```

Bind after the provider has loaded the shared document. An empty array gets the editor's document; otherwise the editor shows the shared one. So only one place (your server or the first user) should fill a new document.

- Concurrent edits merge to the same result for everyone, and a caret stays on the same character when others type before it.
- Undo and redo (and their keys) go through `binding.undoManager`, a `Y.UndoManager`, and undo only this user's changes.
- Changes from others wait while an IME composes text.
- `binding.remoteCursors()` lists the other users' carets; `binding.destroy()` stops syncing and gives undo back to the editor's history.

In Yjs, the blocks are a `Y.Array` of `Y.Map`s with `id`, `type`, `attrs` (a plain object) and `text` (a `Y.Text`). Marks are `Y.Text` formatting, such as `{ bold: true }` or `{ link: { href } }`.

### Remote cursors without Yjs

If you share positions some other way, draw the carets with `createRemoteCursors`. The layer sits after the editor and is hidden from screen readers.

```ts
import { createRemoteCursors } from '@yonailab/levit';

const cursors = createRemoteCursors(editor);
cursors.set([{ id: 'u1', name: 'Mina', color: '#e11d48', anchor: pos, head: pos }]);
cursors.update();   // redraw after a layout change
cursors.destroy();  // also removed with the editor
```

Names are shown as text, and colors that are not plain CSS colors become gray.

### Core hooks

These are what the Yjs binding uses, for writing your own:

```ts
tr.setMeta('addToHistory', false);  // keep a change out of undo
tr.setMeta('remote', true);         // a change from elsewhere: no focus or selection grab
tr.getMeta(key);                    // read meta in editor.on('transaction', ...)
tr.setBlocks(blocks);               // replace all blocks; pass unchanged ones as they are

editor.setHistory({ undo: () => true, redo: () => true }); // or null for the built-in history
editor.isComposing;                 // true during IME composition
editor.hasFocus();
```

## Comments

The editor keeps where comments are; your app keeps the threads, by id.

```ts
import { createLevitEditor, commentsPlugin, getComments } from '@yonailab/levit';

const editor = createLevitEditor(element, {
  plugins: [commentsPlugin({
    onAdd: ({ id, text }, editor) => threads.create(id, text),
    onSelect: (ids, editor) => sidebar.highlight(ids), // [] when none
    createId: () => crypto.randomUUID(),               // optional
  })],
});

editor.commands.addComment();        // on the selection (also the 💬 bubble button)
editor.commands.removeComment(id);
editor.commands.selectComment(id);   // select the comment's text
getComments(editor);                 // [{ id, text, from, to }] in document order
```

- Ids must match `/^[\w-]{1,64}$/`.
- Comments may overlap: they share one `comment` mark with `attrs.ids` such as `'c1 c2'`.
- Text typed right after a comment is not part of it.
- Comments are left out of HTML and Markdown exports. With Yjs, their positions are shared too.

## Languages and accessibility

### Messages

Menus, prompts and screen reader labels are in English by default. Korean (`ko`) and Japanese (`ja`) are built in, and you can override single messages.

```ts
import { createLevitEditor, ko, ja } from '@yonailab/levit';

createLevitEditor(element, { messages: ko });
createLevitEditor(element, { messages: ja });
createLevitEditor(element, { messages: { bold: 'Gras' } });

editor.t('codeLanguageLabel', { language: 'ts' }); // a message with placeholders filled
```

The web component picks its language from the `lang` attribute: `<levit-editor lang="ko">` or `lang="ja"`.

### Keyboard

- `Enter` splits the block; `Shift+Enter` adds a line break inside it.
- `Cmd/Ctrl+B`, `I`, `U` toggle bold, italic, underline; `Cmd/Ctrl+Shift+X` strikethrough; `Cmd/Ctrl+Shift+H` highlight.
- `Cmd/Ctrl+Z` undoes; `Cmd/Ctrl+Shift+Z` or `Ctrl+Y` redoes.
- In a list, `Tab` nests an item and `Shift+Tab` moves it back. Outside lists, `Tab` keeps moving focus.
- `Cmd/Ctrl+Enter` checks or unchecks a task.
- `Alt+Backspace` (macOS) or `Ctrl+Backspace` deletes a word; `Cmd+Backspace` (macOS) deletes to the line start.

### Screen readers

- The editor is a `role="textbox"` with `aria-multiline` and an `aria-label`, unless the page already labels it.
- The slash menu is a `listbox` that the editor points at with `aria-activedescendant`.
- The bubble menu is a `toolbar`. `Alt+F10` moves focus to it from selected text; arrows, Home and End move between buttons; Enter or Space presses one; Escape returns to the text. `aria-pressed` tells which formats are on.
- The table toolbar is a `toolbar` too. With the caret in a table, `Alt+F10` moves focus to it; the keys are the same as in the bubble menu, and Escape returns to the cell. The header row button tells with `aria-pressed` whether the table has a header row.

## Theming

Every color is a CSS variable, so changing variables restyles the whole editor.

```css
:root {
  --levit-bg: #ffffff;
  --levit-text: #0f172a;
  --levit-primary: #3b82f6;
  --levit-radius: 8px;
}
```

- Surfaces: `--levit-bg`, `--levit-surface`, `--levit-border`
- Text: `--levit-text`, `--levit-text-muted`, `--levit-placeholder`
- Accent: `--levit-primary`, `--levit-primary-hover`, `--levit-on-primary`
- Selection and highlight: `--levit-selection`, `--levit-highlight`
- Code and quotes: `--levit-code-bg`, `--levit-code-text`, `--levit-quote-border`
- Errors: `--levit-danger`
- Type and shape: `--levit-font-sans`, `--levit-font-mono`, `--levit-radius`, `--levit-shadow`
- Comments: `--levit-comment-bg`, `--levit-comment-active-bg`, `--levit-comment-border`
- AI suggestions: `--levit-suggestion-insert-bg`, `--levit-suggestion-insert-text`, `--levit-suggestion-delete-text`

Variables inherit, so setting them on `.levit-editor-root` styles one editor only. Menus are attached to `body`; set variables on `:root` to restyle them too.

### Dark mode

Dark colors apply under `[data-theme="dark"]`, or follow the system setting unless `[data-theme="light"]` is set.

```css
[data-theme="dark"] {
  --levit-bg: #090d16;
  --levit-text: #f1f5f9;
}
```

## Security

Levit filters unsafe content when it renders, when it reads pasted HTML or Markdown, and when it exports HTML:

- Unsafe link and image URLs are dropped: no `javascript:`, no SVG data URLs.
- Pasted `script` and `iframe` elements and event attributes are removed.
- Exported HTML is escaped.
- `highlightCode` output keeps only `<span>` with `class` and `style`.

Your app must still:

1. Validate on the server. Browser checks can be bypassed by sending JSON or HTML straight to your API. Rebuild stored content on the server (`documentFromJSON`, then `documentToHTML`), or sanitize the HTML before showing it to other users.
2. Use a Content-Security-Policy, for example `script-src 'self'; object-src 'none'; base-uri 'none'`. The editor needs no inline scripts or `eval`.
3. Treat plugins, `highlightCode` and `uploadImage` as trusted app code. Escape document data (block and mark attrs) you put into plugin `toHTML`, `render` or `attributes`, and never put it into `style`, `srcdoc` or `srcset`.
4. With collaboration, treat shared documents and user names as input from other users. Decide on the Yjs server who may join a document, and validate on save.

Releases since the move to Trusted Publishing carry npm provenance; check them with `npm audit signatures`. Report vulnerabilities privately through [GitHub security advisories](https://github.com/azusawa/levit/security/advisories/new).
