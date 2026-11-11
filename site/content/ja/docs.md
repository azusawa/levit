# 開発者ドキュメント

Levit は Web 向けのリッチテキストエディタです。ランタイム依存ゼロで、ブラウザ標準 API と TypeScript だけで書かれています。コアは gzip で約 30 kB、オプションの AI エントリポイントは約 7 kB 追加です。ドキュメントはそのまま保存・比較・生成できるプレーンな JSON です。Chrome 87、Edge 88、Firefox 78、Safari 14 以降で動作します。ソースは [GitHub](https://github.com/azusawa/levit)、パッケージは [npm](https://www.npmjs.com/package/@yonailab/levit) にあります。

## インストール

コアパッケージだけで使えます。フレームワーク用と共同編集用のパッケージは必要なときに追加してください。

```bash
npm install @yonailab/levit
```

```bash
npm install @yonailab/levit @yonailab/levit-react   # React 18 または 19
npm install @yonailab/levit @yonailab/levit-vue     # Vue 3
npm install @yonailab/levit @yonailab/levit-yjs yjs # リアルタイム共同編集
```

Levit は ESM 専用です。バンドラーか `import` で使ってください。サーバーサイドレンダリング（SSR）中に import しても安全で、`<levit-editor>` 要素はブラウザでのみ登録されます。

## クイックスタート

### Web Components

ビルドなしで使う場合は、スクリプトとスタイルシートを読み込んで `<levit-editor>` タグを置きます。

```html
<script type="module" src="https://unpkg.com/@yonailab/levit/dist/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@yonailab/levit/dist/levit.css">

<levit-editor placeholder="ここに入力..."></levit-editor>

<script type="module">
  const el = document.querySelector('levit-editor');
  el.addEventListener('input', (e) => {
    console.log(e.detail.json, e.detail.text);
  });
</script>
```

この要素は `placeholder`、`lang`（組み込みメッセージは `ko` か `ja`。後から変えると同じ内容で新しい `editor` を作るので、イベントは付け直してください）、`theme`（`dark` か `light`）、初期値の `value`（ドキュメント JSON）属性を読みます。React・Vue のコンポーネントと同じく、バブルメニューとスラッシュメニューが標準で付き、`bubble-menu="false"` や `slash-menu="false"` で外せます。`getJSON()`、`setJSON()`、`getText()`、`focus()` メソッドと、エディタ本体を持つ `editor` プロパティもあります。要素をページ内の別の場所へ移しても同じエディタのままで、取り除いた後も `getJSON()` でドキュメントを取得できます。

### JavaScript / TypeScript

`createLevitEditor` は任意の要素をエディタにします。バブルツールバー（テキスト選択時に表示）とスラッシュメニュー（`/`）は別々に付けるので、使うものだけを読み込めます。

```ts
import { createLevitEditor, createBubbleMenu, createSlashMenu } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const editor = createLevitEditor(document.getElementById('editor')!, {
  placeholder: '入力するか「/」を押してください',
});

createBubbleMenu(editor);
createSlashMenu(editor);
```

### 読み込みと保存

保存済みのドキュメントは `initialContent` で渡し、変更のたびに `getJSON()` で読み出します。

```ts
const editor = createLevitEditor(element, {
  initialContent: savedDoc,
  onChange: (ed) => save(ed.getJSON()),
});

editor.setJSON(otherDoc); // 後からドキュメントを差し替え
editor.getText();         // プレーンテキスト
```

エディタが不要になったら `editor.destroy()` を呼んでください。要素は元の状態に戻ります。

## ドキュメント構造

ドキュメントはバージョン番号とフラットなブロックの配列でできています。各ブロックは `id`、`type`、省略可能な `attrs`、そして `content` を持ちます。`content` はテキスト片の配列で、それぞれに `marks`（書式）が付きます。

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

ブロック内の改行（`Shift+Enter`）はテキスト中に `"\n"` として保存されます。

### ブロックの種類

- `paragraph`
- `heading`：`attrs.level` は 1〜6
- `blockquote`
- `code_block`：省略可能な `attrs.language`（例：`"ts"`）
- `bullet_list_item`、`ordered_list_item`
- `task_list_item`：`attrs.checked`（boolean）
- `horizontal_rule`
- `image`：`attrs.src`、`attrs.alt`
- `table_cell`：`attrs.table`、`attrs.row`、省略可能な `attrs.header`（boolean）

リストはフラットです。リスト項目 1 つが 1 ブロックで、同じ種類の項目が連続すると 1 つのリストになります。ネストは `attrs.indent`（0〜8、トップレベルでは省略）で表し、項目は直前の項目より最大 1 段だけ深くできます。

`horizontal_rule` と `image` にはテキストがなく（`content: [{ "text": "" }]`）、キャレットは中に入りません。画像の `src` は `http:`、`https:`、`blob:`、相対パス、またはビットマップの `data:image/...` URL である必要があり、SVG は拒否されます。

```json
[
  { "type": "bullet_list_item", "content": [{ "text": "Fruits" }] },
  { "type": "bullet_list_item", "attrs": { "indent": 1 }, "content": [{ "text": "Apple" }] },
  { "type": "task_list_item", "attrs": { "checked": true }, "content": [{ "text": "Buy milk" }] },
  { "type": "image", "attrs": { "src": "https://example.com/a.png", "alt": "A" }, "content": [{ "text": "" }] }
]
```

### マーク（書式）

- `bold`、`italic`、`underline`、`strike`
- `highlight`
- `code`
- `link`：`attrs.href`

リンクの `href` は `http:`、`https:`、`mailto:` または相対パスである必要があります。`javascript:` などそれ以外の値は、描画・インポート・エクスポートの各段階で取り除かれます。

### Markdown ショートカット

ブロックの先頭で入力すると、その場で書式に変換されます。コードブロック内では無効です。

- `# `〜`###### `：見出し
- `> `：引用
- バッククォート 3 つ：コードブロック
- `- ` または `* `：箇条書き、`1. `：番号付きリスト
- `[] `、`[ ] `、`[x] `：タスク（`- ` の後でも可）
- `---`：区切り線

表もフラットです。セル 1 つが `table_cell` ブロック 1 つです。`attrs.table` はどの表か、`attrs.row` はどの行かを表します。1 つの表のセルは、行の順に左から右へ続きます。見出しセルには `attrs.header: true` があり、ふつうは最初の行です。セルに入るのは文字だけで、セル内の改行は `"\n"` です。表と行ごとに別々の id を使ってください。

```json
[
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r1", "header": true }, "content": [{ "text": "Name" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r1", "header": true }, "content": [{ "text": "Price" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r2" }, "content": [{ "text": "Tea" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r2" }, "content": [{ "text": "3.00" }] }
]
```

## HTML と Markdown

シリアライザーでドキュメントを HTML や Markdown に変換したり、逆に読み込んだりできます。エディタのインスタンスは不要です。ただし `htmlToDocument` はブラウザの `DOMParser` を使うため、サーバーには標準では用意されていません。

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

`documentFromJSON` は保存済みの JSON をドキュメントに変換し、id など欠けているフィールドを補います。`documentToJSON` はクリーンで決定的な JSON を返します。エディタの `editor.getHTML()` と `editor.getMarkdown()` はプラグインのブロックやマークも含めて出力します。

各形式への対応：

- ネストしたリストは入れ子の `<ul>`/`<ol>` になり、Markdown では親項目の下にインデントしたリストになります。
- タスクは Markdown では `- [ ] text` / `- [x] text`、HTML ではチェックボックス入りの `<li data-checked>` です。
- ハイライトは `==text==` / `<mark>`、区切り線は `---` / `<hr>`、画像は `![alt](src)` / `<img>` です。
- 表は HTML では `<table>` で、見出し行は `<thead>`、見出しセルは `<th>` です。Markdown では GitHub 形式の表（`| a | b |` の次の行に `| --- | --- |`）です。Markdown の表には見出し行が必要なので、見出し行のない表は空の見出し行を付けて書き、読み込むときに外します。セル内の改行は `<br>` です。貼り付けた HTML の表は表のまま入り、セル内の段落はセル内の行になります。
- コードの言語は Markdown ではコードフェンスの言語指定、HTML では `class="language-ts"` になります。

貼り付けも同じ変換処理を使います。まず HTML（Web ページ、Google ドキュメント）、次に複数行の Markdown、最後にプレーンテキスト（1 行 1 段落）として読み込みます。

## コマンド

### チェーン API

コマンドをつなげて 1 つのトランザクションにし、`run()` で適用します。`run()` は何か変更があれば `true` を返します。1 つのチェーンが 1 回分の取り消し単位です。

```ts
editor.chain().insertText('Hello').toggleBold().setHeading(2).run();

editor.chain().setBlockType('bullet_list_item').run();
editor.chain().setBlockType('task_list_item', { checked: false }).run();
editor.chain().setParagraph().run();
editor.chain().indentListItem().run();     // Tab、outdentListItem() は Shift+Tab
editor.chain().toggleTaskChecked().run();  // または toggleTaskChecked(blockId)
```

書式、リンク、挿入：

```ts
editor.chain().toggleItalic().run();       // toggleUnderline、toggleStrike、toggleHighlight もある
editor.chain().toggleMark({ type: 'code' }).run();
editor.chain().setLink('https://example.com').run(); // 選択範囲に適用
editor.chain().unsetLink().run();

editor.chain().insertHorizontalRule().run();
editor.chain().insertImage({ src: 'https://example.com/a.png', alt: 'A' }).run();
editor.chain().setCodeBlock('ts').run();   // setCodeLanguage('py') で変更、'' で解除
editor.chain().insertFragment(blocks).run(); // 貼り付けと同様にキャレット位置へブロックを挿入
editor.chain().insertLineBreak().run();    // Shift+Enter
editor.chain().selectAll().run();
```

表：

```ts
editor.chain().insertTable(3, 3).run();    // 行、列。見出し行なしは { header: false }
editor.chain().addRowBefore().run();       // addRowAfter、addColumnBefore、addColumnAfter もあります
editor.chain().deleteRow().run();          // deleteColumn、deleteTable もあります
editor.chain().toggleHeaderRow().run();    // 最初の行を見出しに、または戻す
editor.chain().goToNextCell().run();       // Tab。goToPreviousCell() は Shift+Tab
editor.isInTable();                        // キャレットが表の中なら true
```

削除はキー操作と同じように動きます。`deleteBackward()`、`deleteForward()`、`deleteWordBackward()`、`deleteWordForward()`、`deleteLineBackward()`、`deleteLineForward()`、`deleteSelection()` があります。

### エディタのオプション

```ts
createLevitEditor(element, {
  initialContent: doc,           // 最初に表示するドキュメント JSON
  placeholder: 'Write...',
  onChange: (editor) => {},
  onSelectionChange: (selection) => {},
  // 貼り付け・ドロップされた画像ファイルをこれでアップロードしてから挿入します。
  // 指定しない場合、画像ファイルは無視されます。
  uploadImage: async (file) => 'https://cdn.example.com/a.png',
  // アップロード失敗など、バックグラウンド処理のエラー
  onError: (error) => console.error(error),
  // 言語が指定されたコードブロックをハイライト
  highlightCode: (code, language) => code,
  plugins: [],
  messages: ja,                  // デフォルトは英語
});
```

`highlightCode` は highlight.js や Shiki などで生成したコードの HTML を返します。残るのは `class` と `style` を持つ `<span>` だけで、テキスト自体は変えてはいけません。

```ts
import hljs from 'highlight.js';

createLevitEditor(element, {
  highlightCode: (code, language) =>
    hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : code,
});
```

### その他のメソッド

```ts
editor.getJSON(); editor.setJSON(json); editor.getText();
editor.getHTML(); editor.getMarkdown();
editor.isActive('bold');          // 選択範囲にそのマークがあるか（または次の入力に付くか）
editor.getActiveLink();           // 選択中のリンクの href、なければ null
editor.undo(); editor.redo();
editor.focus(); editor.hasFocus();
editor.setEditable(false);        // 入力をロック、editor.isEditable で確認
editor.destroy();
```

ほかにも `editor.commands`（プラグインのコマンド）、`editor.messages` と `editor.t(key, values)`（使用中のメッセージ）、別の場所で作った状態を一度に適用する `editor.replaceState(state)`、エラーを `onError` かコンソールに送る `editor.reportError(error)` があります。

## イベント

`editor.on` はハンドラーを解除する関数を返します。

```ts
const stop = editor.on('update', ({ editor, transaction }) => {
  save(editor.getJSON());
});

editor.on('selectionUpdate', ({ editor, selection }) => {});
editor.on('transaction', ({ editor, transaction }) => {});
editor.on('focus', ({ editor, event }) => {});
editor.on('blur', ({ editor, event }) => {});
editor.on('destroy', ({ editor }) => {});

stop(); // または editor.off('update', handler)
```

- `update`：ドキュメントが変わったとき。取り消し、やり直し、`setJSON` も含みます。
- `selectionUpdate`：選択範囲が動いたとき、またはその下のドキュメントが変わったとき。
- `transaction`：何も変わらなくても、ディスパッチのたびに発生します。
- `destroy`：エディタが破棄されるとき。直後にハンドラーもすべて解除されます。

あるハンドラーが例外を投げても他のハンドラーは止まらず、エラーは `onError`（なければコンソール）に送られます。

## React と Vue

どちらのパッケージもエディタのオプションを props で受け取り、無効にしない限りバブルメニューとスラッシュメニューを付けます。変更で受け取った値をそのまま戻してもキャレット位置は保たれます。

### React

```tsx
import { useState } from 'react';
import { LevitEditor } from '@yonailab/levit-react';
import { ja, type DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

export function Note() {
  const [doc, setDoc] = useState<DocumentData>();
  return <LevitEditor value={doc} onChange={setDoc} messages={ja} />;
}
```

- `value` と `onChange` を併用すると制御コンポーネント、`defaultValue` だけなら非制御コンポーネントです。
- `onChange` は `(value, editor)` を受け取ります。
- `bubbleMenu={false}`、`slashMenu={false}` でメニューを無効にします。
- `ref` か `onReady` でエディタのインスタンスを受け取ります。`className`、`style`、`id` は要素に渡されます。
- `'use client'` が付いているので、Next.js の App Router でそのまま使えます。

レイアウトを自分で組む場合はフックを使います。`editor` は要素がマウントされるまで `null` です。

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

- props：`placeholder`、`plugins`、`messages`、`uploadImage`、`highlightCode`
- `:bubble-menu="false"`、`:slash-menu="false"` でメニューを無効にします。
- `@ready` でエディタのインスタンスを、`@error` でアップロード失敗などのエラーを受け取ります。
- コンポーネントの ref からも `editor` にアクセスできます。

レイアウトを自分で組む場合はコンポーザブルを使います。

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

## プラグイン

プラグインはブロック、マーク、コマンド、キー、入力ルール、メニュー項目を追加するプレーンなオブジェクトです。`plugins` オプションで渡します。組み込みのブロック・マークの型や、他のプラグインの型を再定義することはできません。

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

### ブロックとマーク

ブロックの仕様（`BlockSpec`）は `type` を持ち、次を任意で指定できます。

- `tag`（デフォルトは `div`）と `className`：要素
- `toHTML(block, content)`、`toMarkdown(block, text)`：エクスポート
- `parseHTML(el)`：attrs か `null` を返す、`parseMarkdown(raw)`：`{ text, attrs }` か `null` を返す
- `atom: true` と `render(block, el)`：画像のようにテキストを持たないブロック
- `attrsSchema`：attrs の JSON Schema（AI 用のドキュメントスキーマで使用）

```ts
const video = {
  type: 'video',
  atom: true,
  render: (block, el) => { /* el の中に描画（編集不可） */ },
  toHTML: (block) => `<div data-video="${block.attrs?.id}"></div>`,
  parseHTML: (el) => (el.hasAttribute('data-video') ? { id: el.getAttribute('data-video') } : null),
};
```

マークの仕様（`MarkSpec`）には `type`、`tag`、`className`、`attributes(mark)`（`on` で始まる属性は除去）、`toHTML`、`toMarkdown`、`parseHTML`、`attrsSchema`、`inclusive` があります。`inclusive` はデフォルトで `true` で、`false` にするとマークの直後に入力したテキストにはマークが付きません。

```ts
const color = {
  type: 'color',
  tag: 'span',
  attributes: (mark) => ({ style: `color: ${mark.attrs?.color}` }),
  inclusive: false,
  parseHTML: (el) => ((el as HTMLElement).style.color ? { color: (el as HTMLElement).style.color } : null),
};
```

シリアライザーにもプラグインを渡す必要があります。`documentToHTML(doc, { plugins })`、`htmlToDocument(html, { plugins })` で、Markdown も同様です。プラグインがない場合、未知のブロックはテキストだけの段落として出力されます。

### コマンド、キー、入力ルール

- `commands`：引数を受け取り、トランザクションを変更する関数を返すファクトリです（`false` を返すとキャンセル）。`editor.commands.name(...)` で実行するか、チェーン内で `.exec('name', ...args)` として使います。
- `keymap`：`'Mod'` は macOS では Cmd、それ以外では Ctrl です。`false` を返すと組み込みのキー操作が実行されます。
- `inputRules`：`{ match, handler(tr, match, blockId) }`。ブロックの先頭で、組み込みルールより先に評価されます。
- `slashItems`、`bubbleItems`：メニュー項目。`title` はエディタを受け取る関数でも構いません。
- `setup(editor)`：一度だけ実行され、クリーンアップ関数を返すと destroy 時に呼ばれます。

```ts
const plugin: LevitPlugin = {
  name: 'video',
  commands: {
    insertVideo: (id: string) => (tr) => void tr.insertAtom('video', { id }),
  },
  inputRules: [{ match: /^!!!\s$/, handler: (tr, match, blockId) => true }],
  bubbleItems: [{ label: '🎬', title: (editor) => 'Video', action: (editor) => {} }],
  setup: (editor) => () => { /* クリーンアップ */ },
};

editor.chain().exec('insertVideo', 'v1').insertText('caption').run();
```

### ブロックの変更

ブロックは freeze されており、状態と undo 履歴の間で共有されています。コマンドや入力ルールでブロックを変更するときは、トランザクションからコピーを受け取ります。

```ts
const block = tr.editBlock(blockId);   // インデックスも可、なければ undefined
if (block) block.attrs = { ...block.attrs, color: 'red' };
// tr.doc.blocks[i].attrs = ...  ブロックが freeze されているので例外になる
```

変更に関係ないブロックは同じオブジェクトのまま残るため、非常に長いドキュメントでも変わったブロックだけが再描画されます。

## AI

AI 機能は別のエントリポイント `@yonailab/levit/ai` にあるので、AI を使わないエディタには読み込まれません。Levit 自身は AI サービスを呼び出しません。回答を Markdown テキストのストリームとして返す `provider` を渡します。

### provider

```ts
import { createLevitEditor } from '@yonailab/levit';
import { aiPlugin, runAICommand, stopAI } from '@yonailab/levit/ai';

const editor = createLevitEditor(element, {
  plugins: [
    aiPlugin({
      // API キーを持つ自前のサーバーを呼び出します。
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

provider は `AIRequest` を受け取り、文字列の async iterable（またはその Promise）を返します。

- `command`：`'improve'`、`'continue'`、`'summarize'`、または独自の id
- `prompt`：モデルへの指示
- `text`：選択範囲の Markdown（選択なしで `summarize` するとドキュメント全体）
- `before`、`after`：選択範囲の前後の Markdown、それぞれ `contextLength` 文字（デフォルト 4000）
- `signal`：Escape や `stopAI(editor)` で中断される `AbortSignal`

### コマンド

組み込みコマンドはスラッシュメニューに表示され、`improve` はバブルメニューにも表示されます。

- `improve`：選択範囲を提案として書き換えます。
- `continue`：キャレット位置に続きを書きます。
- `summarize`：選択範囲の下にブロックを追加するか、ドキュメント全体を要約します。

`commands` で独自のコマンドを追加できます。組み込みと同じ id なら置き換わります。

```ts
aiPlugin({
  provider,
  commands: [{
    id: 'translate',
    title: 'Translate',
    prompt: 'Translate to English.',
    insert: 'replace',          // または 'cursor'、'below'
    needsSelection: true,
    bubble: true,               // バブルメニューにもボタンを表示
  }],
  suggestions: true,            // 'replace' の回答を提案として表示（デフォルト）
  contextLength: 4000,
});
```

コードからも実行できます。`runAICommand` は `{ markdown, aborted }` を返し、選択が必要なコマンドで選択範囲がなければ `null` を返します。

```ts
await runAICommand(editor, 'improve');
await runAICommand(editor, 'continue', { prompt: 'Write one more paragraph.' });
stopAI(editor);
```

一度に実行できるコマンドは 1 つです。実行中は編集がロックされ（`contenteditable=false`、`aria-busy`）、回答全体は 1 回の取り消しで元に戻ります。

### 提案モード

提案モードでは、`replace` の回答がテキストをすぐには上書きしません。変更された語が削除と挿入（`<del>` と `<ins>`）として表示され、次の方法で承認または却下します。

- 横に表示されるフローティングツールバー
- `Mod-Shift-Enter`（承認）、`Mod-Shift-Backspace`（却下）
- `editor.commands.acceptSuggestions(id?)`、`editor.commands.rejectSuggestions(id?)`

これらのコマンドは、解決する提案がない場合や回答がまだストリーミング中の場合に `false` を返します。HTML にエクスポートすると `<del>`/`<ins>` が残り、Markdown では承認したものとして出力されます。

### Markdown のストリーミング

`streamMarkdown` は任意の Markdown ストリームを、書式を反映しながらリアルタイムでエディタに流し込みます。テキストの到着中、閉じていない太字やコードフェンスは閉じたものとして表示されます。

```ts
import { streamMarkdown } from '@yonailab/levit/ai';

await streamMarkdown(editor, stream, {
  signal: controller.signal,
  at: 'below',                 // または 'selection'（デフォルト）
});
```

### JSON スキーマと検証

`getDocumentSchema({ plugins })` は Levit ドキュメントの JSON Schema（2020-12）を返します。Structured Outputs やツールのスキーマとして渡せば、モデルが Levit の JSON を直接生成します。組み込みのスキーマは `@yonailab/levit/document.schema.json` としても提供されています。プラグインは `attrsSchema` で自身の attrs を記述します。

```ts
import { getDocumentSchema, validateDocument } from '@yonailab/levit/ai';

const schema = getDocumentSchema({ plugins });
const result = validateDocument(jsonFromAI, { plugins });

if (result.valid) editor.setJSON(jsonFromAI);
else console.warn(result.errors); // [{ path: '$.blocks[2].attrs.level', message: '...' }]
```

`validateDocument` は危険なリンクや画像の URL も拒否します。

## 共同編集

### Yjs

`@yonailab/levit-yjs` はエディタを Yjs ドキュメントと同期します。Yjs は peer dependency で、コアは Yjs に依存しません。`y-websocket`、`y-webrtc`、`y-indexeddb` など、どの Yjs プロバイダーとも組み合わせられます。

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { bindYjs } from '@yonailab/levit-yjs';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('wss://example.com', 'room-1', ydoc);

provider.once('sync', () => {
  const binding = bindYjs(editor, ydoc.getArray('blocks'), {
    awareness: provider.awareness,             // カーソルを共有
    user: { name: 'Mina', color: '#e11d48' },  // 他のユーザーに見える名前と色
    captureTimeout: 500,                       // この時間内の変更を 1 回の取り消しにまとめる
  });
});
```

プロバイダーが共有ドキュメントを読み込んでからバインドしてください。配列が空ならエディタのドキュメントが入り、中身があればエディタが共有ドキュメントを表示します。そのため、新しいドキュメントの初期内容を入れるのは 1 か所（サーバーか最初のユーザー）にしてください。

- 同時に編集しても全員が同じ結果にマージされ、他の人が前に文字を挿入してもキャレットは同じ文字の横に留まります。
- 取り消しとやり直し（キー操作を含む）は `Y.UndoManager` である `binding.undoManager` が担い、自分の変更だけを取り消します。
- IME で変換中に届いた他の人の変更は、変換が終わってから反映されます。
- `binding.remoteCursors()` は他のユーザーのカーソル一覧を返します。`binding.destroy()` は同期を止め、取り消しをエディタの履歴に戻します。

Yjs 内のブロックは `Y.Map` の `Y.Array` で、それぞれ `id`、`type`、`attrs`（プレーンなオブジェクト）、`text`（`Y.Text`）を持ちます。マークは `{ bold: true }` や `{ link: { href } }` のような `Y.Text` のフォーマット属性です。

### Yjs なしのリモートカーソル

別の方法で位置をやり取りする場合は、`createRemoteCursors` でカーソルだけを描画できます。このレイヤーはエディタの直後に置かれ、スクリーンリーダーからは隠されます。

```ts
import { createRemoteCursors } from '@yonailab/levit';

const cursors = createRemoteCursors(editor);
cursors.set([{ id: 'u1', name: 'Mina', color: '#e11d48', anchor: pos, head: pos }]);
cursors.update();   // レイアウト変更後に再描画
cursors.destroy();  // エディタと一緒にも削除される
```

名前はテキストとしてのみ表示され、プレーンな CSS カラーでない色はグレーに置き換えられます。

### コアのフック

Yjs バインディングが使っている仕組みで、独自のバインディングを書くときに使います。

```ts
tr.setMeta('addToHistory', false);  // undo 履歴に残さない
tr.setMeta('remote', true);         // 外部からの変更：フォーカスや選択を奪わない
tr.getMeta(key);                    // editor.on('transaction', ...) で meta を読む
tr.setBlocks(blocks);               // 全ブロックを置き換え、変わらないブロックはそのまま渡す

editor.setHistory({ undo: () => true, redo: () => true }); // null で組み込みの履歴に戻す
editor.isComposing;                 // IME 変換中は true
editor.hasFocus();
```

## コメント

エディタはコメントの位置だけを保持し、スレッドの中身はアプリが id で管理します。

```ts
import { createLevitEditor, commentsPlugin, getComments } from '@yonailab/levit';

const editor = createLevitEditor(element, {
  plugins: [commentsPlugin({
    onAdd: ({ id, text }, editor) => threads.create(id, text),
    onSelect: (ids, editor) => sidebar.highlight(ids), // なければ []
    createId: () => crypto.randomUUID(),               // 省略可
  })],
});

editor.commands.addComment();        // 選択範囲にコメント（バブルメニューの 💬 ボタンと同じ）
editor.commands.removeComment(id);
editor.commands.selectComment(id);   // コメントが付いたテキストを選択
getComments(editor);                 // [{ id, text, from, to }] ドキュメント順
```

- id は `/^[\w-]{1,64}$/` に一致する必要があります。
- コメントは重なっても構いません。重なった部分は `attrs.ids` が `'c1 c2'` のようになった 1 つの `comment` マークを共有します。
- コメントの直後に入力したテキストはコメントに含まれません。
- HTML や Markdown へのエクスポートではコメントは除かれます。Yjs を使うとコメントの位置も共有されます。

## 多言語とアクセシビリティ

### メッセージ

メニュー、プロンプト、スクリーンリーダー用のラベルはデフォルトで英語です。韓国語（`ko`）と日本語（`ja`）が組み込まれていて、一部のメッセージだけを上書きすることもできます。

```ts
import { createLevitEditor, ko, ja } from '@yonailab/levit';

createLevitEditor(element, { messages: ja });
createLevitEditor(element, { messages: ko });
createLevitEditor(element, { messages: { bold: 'Gras' } });

editor.t('codeLanguageLabel', { language: 'ts' }); // プレースホルダーを埋めたメッセージ
```

Web Components は `lang` 属性で言語を選びます。`<levit-editor lang="ja">` または `lang="ko"` です。

### キーボード

- `Enter` はブロックを分割し、`Shift+Enter` はブロック内で改行します。
- `Cmd/Ctrl+B`、`I`、`U` は太字、斜体、下線、`Cmd/Ctrl+Shift+X` は取り消し線、`Cmd/Ctrl+Shift+H` はハイライトです。
- `Cmd/Ctrl+Z` で取り消し、`Cmd/Ctrl+Shift+Z` または `Ctrl+Y` でやり直します。
- リスト内では `Tab` で 1 段ネストし、`Shift+Tab` で戻します。リストの外では `Tab` は通常どおりフォーカスを移動します。
- `Cmd/Ctrl+Enter` でタスクのチェックを切り替えます。
- `Alt+Backspace`（macOS）または `Ctrl+Backspace` で単語を、`Cmd+Backspace`（macOS）で行頭までを削除します。

### スクリーンリーダー

- 編集領域は `aria-multiline` と `aria-label` を持つ `role="textbox"` です。ページ側ですでにラベルが付いていればそれを使います。
- スラッシュメニューは `listbox` で、エディタが `aria-activedescendant` で現在の項目を指します。
- バブルメニューは `toolbar` です。テキストを選択した状態で `Alt+F10` を押すとフォーカスが移り、矢印キーと Home・End でボタン間を移動し、Enter か Space で押し、Escape でテキストに戻ります。有効な書式は `aria-pressed` で伝えます。

## テーマ

すべての色が CSS 変数なので、変数を変えるだけでエディタ全体の見た目が変わります。

```css
:root {
  --levit-bg: #ffffff;
  --levit-text: #0f172a;
  --levit-primary: #3b82f6;
  --levit-radius: 8px;
}
```

- 背景：`--levit-bg`、`--levit-surface`、`--levit-border`
- 文字：`--levit-text`、`--levit-text-muted`、`--levit-placeholder`
- アクセント：`--levit-primary`、`--levit-primary-hover`、`--levit-on-primary`
- 選択範囲とハイライト：`--levit-selection`、`--levit-highlight`
- コードと引用：`--levit-code-bg`、`--levit-code-text`、`--levit-quote-border`
- エラー：`--levit-danger`
- フォントと形状：`--levit-font-sans`、`--levit-font-mono`、`--levit-radius`、`--levit-shadow`
- コメント：`--levit-comment-bg`、`--levit-comment-active-bg`、`--levit-comment-border`
- AI の提案：`--levit-suggestion-insert-bg`、`--levit-suggestion-insert-text`、`--levit-suggestion-delete-text`

変数は継承されるので、`.levit-editor-root` に指定するとそのエディタだけに適用されます。メニューは `body` に追加されるため、メニューも変えたい場合は `:root` に指定してください。

### ダークモード

`[data-theme="dark"]` の下でダーク配色になり、`[data-theme="light"]` を指定しない限りシステム設定に従います。

```css
[data-theme="dark"] {
  --levit-bg: #090d16;
  --levit-text: #f1f5f9;
}
```

## セキュリティ

Levit は描画時、貼り付けられた HTML や Markdown の読み込み時、HTML のエクスポート時に危険な内容を取り除きます。

- 危険なリンクと画像の URL を除去します。`javascript:` や SVG の data URL は許可しません。
- 貼り付けられた `script`、`iframe` 要素とイベント属性を除去します。
- エクスポートする HTML はエスケープされます。
- `highlightCode` の出力からは `class` と `style` を持つ `<span>` 以外が除去されます。

それでもアプリ側で必ず行うべきことがあります。

1. サーバーで再検証してください。JSON や HTML を API に直接送れば、ブラウザでのチェックは回避できます。保存した内容はサーバーで `documentFromJSON` → `documentToHTML` で作り直すか、他のユーザーに表示する前に HTML をサニタイズしてください。
2. Content-Security-Policy を使ってください。例：`script-src 'self'; object-src 'none'; base-uri 'none'`。エディタはインラインスクリプトも `eval` も必要としません。
3. プラグイン、`highlightCode`、`uploadImage` は信頼できるアプリのコードとして扱ってください。プラグインの `toHTML`、`render`、`attributes` にドキュメントのデータ（ブロックやマークの attrs）を入れるときは自分でエスケープし、`style`、`srcdoc`、`srcset` には決して入れないでください。
4. 共同編集では、共有ドキュメントやユーザー名も他のユーザーからの入力です。誰がドキュメントに参加できるかは Yjs サーバー側で決め、保存時に検証してください。

Trusted Publishing への移行後のリリースには npm provenance が付いており、`npm audit signatures` で確認できます。脆弱性は [GitHub のセキュリティアドバイザリ](https://github.com/azusawa/levit/security/advisories/new) から非公開で報告してください。
