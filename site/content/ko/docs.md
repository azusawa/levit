# 개발 문서

Levit은 웹용 리치 텍스트 에디터입니다. 런타임 의존성 없이 브라우저 표준 API와 TypeScript만으로 만들었습니다. 코어는 gzip 기준 약 30 kB이고, 선택 사항인 AI 진입점은 약 7 kB가 더해집니다. 문서는 그대로 저장하고 비교하고 생성할 수 있는 평범한 JSON입니다. Chrome 87, Edge 88, Firefox 78, Safari 14 이상에서 동작합니다. 소스는 [GitHub](https://github.com/azusawa/levit), 패키지는 [npm](https://www.npmjs.com/package/@yonailab/levit)에 있습니다.

## 설치

코어 패키지 하나면 충분합니다. 프레임워크와 공동 편집 패키지는 필요할 때만 설치합니다.

```bash
npm install @yonailab/levit
```

```bash
npm install @yonailab/levit @yonailab/levit-react   # React 18 또는 19
npm install @yonailab/levit @yonailab/levit-vue     # Vue 3
npm install @yonailab/levit @yonailab/levit-yjs yjs # 실시간 공동 편집
```

Levit은 ESM 전용입니다. 번들러나 `import`로 사용하세요. 서버 사이드 렌더링(SSR) 중에 import해도 안전하며, `<levit-editor>` 요소는 브라우저에서만 등록됩니다.

## 빠른 시작

### 웹 컴포넌트

빌드 없이 쓰려면 스크립트와 스타일시트를 불러오고 `<levit-editor>` 태그를 씁니다.

```html
<script type="module" src="https://unpkg.com/@yonailab/levit/dist/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@yonailab/levit/dist/levit.css">

<levit-editor placeholder="내용을 입력하세요..."></levit-editor>

<script type="module">
  const el = document.querySelector('levit-editor');
  el.addEventListener('input', (e) => {
    console.log(e.detail.json, e.detail.text);
  });
</script>
```

이 요소는 `placeholder`, `lang`(내장 문구는 `ko` 또는 `ja`. 나중에 바꾸면 같은 내용으로 새 `editor`를 만들므로 이벤트는 다시 붙이세요), `theme`(`dark` 또는 `light`), 초기값 `value`(문서 JSON) 속성을 읽습니다. React·Vue 컴포넌트처럼 버블 메뉴, 슬래시 메뉴, 표 도구 막대가 기본으로 붙고, `bubble-menu="false"`, `slash-menu="false"`, `table-toolbar="false"`로 뺄 수 있습니다. `getJSON()`, `setJSON()`, `getText()`, `focus()` 메서드와, 에디터 인스턴스 전체를 담은 `editor` 속성도 있습니다. 요소를 페이지의 다른 곳으로 옮겨도 같은 에디터가 유지되고, 제거한 뒤에도 `getJSON()`으로 문서를 얻을 수 있습니다.

### JavaScript / TypeScript

`createLevitEditor`는 어떤 요소든 에디터로 만듭니다. 버블 툴바(글을 선택하면 표시), 슬래시 메뉴(`/`), 표 도구 막대(커서가 있는 표 위에 표시)는 따로 붙이므로, 쓰는 것만 불러오면 됩니다.

```ts
import { createLevitEditor, createBubbleMenu, createSlashMenu, createTableToolbar } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const editor = createLevitEditor(document.getElementById('editor')!, {
  placeholder: '내용을 입력하거나 "/"를 눌러 보세요',
});

createBubbleMenu(editor);
createSlashMenu(editor);
createTableToolbar(editor);
```

### 불러오기와 저장

저장해 둔 문서는 `initialContent`로 넘기고, 바뀔 때마다 `getJSON()`으로 읽습니다.

```ts
const editor = createLevitEditor(element, {
  initialContent: savedDoc,
  onChange: (ed) => save(ed.getJSON()),
});

editor.setJSON(otherDoc); // 나중에 문서 교체
editor.getText();         // 순수 텍스트
```

에디터를 없앨 때는 `editor.destroy()`를 부르세요. 요소가 원래 상태로 돌아갑니다.

## 문서 구조

문서는 버전 번호와 평평한 블록 목록으로 이루어집니다. 블록마다 `id`, `type`, 선택 사항인 `attrs`, 그리고 `content`가 있습니다. `content`는 텍스트 조각의 목록이고, 조각마다 `marks`(서식)가 붙습니다.

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

블록 안의 줄바꿈(`Shift+Enter`)은 텍스트에 `"\n"`으로 저장됩니다.

### 블록 종류

- `paragraph`
- `heading`: `attrs.level`은 1부터 6
- `blockquote`
- `code_block`: 선택 사항으로 `attrs.language`(예: `"ts"`)
- `bullet_list_item`, `ordered_list_item`
- `task_list_item`: `attrs.checked`(boolean)
- `horizontal_rule`
- `image`: `attrs.src`, `attrs.alt`
- `table_cell`: `attrs.table`, `attrs.row`, 그리고 선택 사항인 `attrs.header`(boolean)

목록은 평평합니다. 목록 항목 하나가 블록 하나이고, 같은 종류의 항목이 연속되면 하나의 목록이 됩니다. 중첩은 `attrs.indent`(0~8, 최상위에서는 생략)로 나타내며, 한 항목은 바로 위 항목보다 최대 한 단계까지만 깊어질 수 있습니다.

`horizontal_rule`과 `image`에는 텍스트가 없고(`content: [{ "text": "" }]`), 커서가 그 안에 들어가지 않습니다. 이미지 `src`는 `http:`, `https:`, `blob:`, 상대 경로, 또는 비트맵 `data:image/...` URL이어야 하며 SVG는 거부됩니다.

```json
[
  { "type": "bullet_list_item", "content": [{ "text": "Fruits" }] },
  { "type": "bullet_list_item", "attrs": { "indent": 1 }, "content": [{ "text": "Apple" }] },
  { "type": "task_list_item", "attrs": { "checked": true }, "content": [{ "text": "Buy milk" }] },
  { "type": "image", "attrs": { "src": "https://example.com/a.png", "alt": "A" }, "content": [{ "text": "" }] }
]
```

### 서식(마크)

- `bold`, `italic`, `underline`, `strike`
- `highlight`
- `code`
- `link`: `attrs.href`

링크 `href`는 `http:`, `https:`, `mailto:` 또는 상대 경로여야 합니다. `javascript:` 같은 그 밖의 값은 렌더링, 가져오기, 내보내기 단계에서 모두 제거됩니다.

### 마크다운 단축키

블록 맨 앞에서 입력하면 바로 서식으로 바뀝니다. 코드 블록 안에서는 적용되지 않습니다.

- `# `부터 `###### `: 제목
- `> `: 인용
- 백틱 세 개: 코드 블록
- `- ` 또는 `* `: 글머리표 목록, `1. `: 번호 목록
- `[] `, `[ ] `, `[x] `: 체크리스트(`- ` 뒤에서도 가능)
- `---`: 구분선

표도 평평합니다. 칸 하나가 `table_cell` 블록 하나입니다. `attrs.table`은 어느 표인지, `attrs.row`는 어느 행인지 나타냅니다. 한 표의 칸은 행 순서대로, 왼쪽에서 오른쪽으로 이어집니다. 머리글 칸에는 `attrs.header: true`가 있고, 보통 첫 행입니다. 칸에는 글만 들어가고, 칸 안의 줄바꿈은 `"\n"`입니다. 표와 행마다 서로 다른 id를 쓰세요.

```json
[
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r1", "header": true }, "content": [{ "text": "Name" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r1", "header": true }, "content": [{ "text": "Price" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r2" }, "content": [{ "text": "Tea" }] },
  { "type": "table_cell", "attrs": { "table": "t1", "row": "r2" }, "content": [{ "text": "3.00" }] }
]
```

## HTML과 Markdown

직렬화 함수로 문서를 HTML·Markdown으로 내보내거나 가져옵니다. 에디터 인스턴스 없이도 쓸 수 있습니다. 단, `htmlToDocument`는 브라우저의 `DOMParser`를 사용하며, 서버에는 기본으로 들어 있지 않습니다.

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

`documentFromJSON`은 저장해 둔 JSON을 문서로 바꾸면서 id 같은 빠진 필드를 채웁니다. `documentToJSON`은 깔끔하고 결정적인 JSON을 돌려줍니다. 에디터의 `editor.getHTML()`과 `editor.getMarkdown()`은 플러그인의 블록과 서식까지 포함합니다.

형식별 변환 규칙:

- 중첩 목록은 중첩된 `<ul>`/`<ol>`이 되고, Markdown에서는 부모 항목 아래에 들여쓴 목록이 됩니다.
- 체크리스트는 Markdown에서 `- [ ] text` / `- [x] text`, HTML에서는 체크박스가 든 `<li data-checked>`입니다.
- 형광펜은 `==text==` / `<mark>`, 구분선은 `---` / `<hr>`, 이미지는 `![alt](src)` / `<img>`입니다.
- 표는 HTML에서 `<table>`이고, 머리글 행은 `<thead>`, 머리글 칸은 `<th>`입니다. Markdown에서는 GitHub 형식의 표(`| a | b |` 다음 줄에 `| --- | --- |`)입니다. Markdown 표에는 머리글 행이 꼭 있어야 해서, 머리글 행이 없는 표는 빈 머리글 행을 붙여 쓰고 읽을 때 다시 뺍니다. 칸 안의 줄바꿈은 `<br>`입니다. 붙여 넣은 HTML 표는 표로 들어오며, 칸 안의 문단은 칸 안의 줄이 됩니다.
- 코드 언어는 Markdown에서 코드 펜스의 언어 표기, HTML에서는 `class="language-ts"`가 됩니다.

붙여넣기도 같은 변환기를 씁니다. HTML(웹페이지, Google Docs)을 먼저 보고, 다음으로 여러 줄 Markdown, 마지막으로 일반 텍스트(한 줄에 한 문단)를 읽습니다.

## 명령

### 체인 API

명령을 이어 붙여 하나의 트랜잭션으로 만들고 `run()`으로 적용합니다. `run()`은 무언가 바뀌었으면 `true`를 돌려줍니다. 체인 하나가 실행 취소 한 단계입니다.

```ts
editor.chain().insertText('Hello').toggleBold().setHeading(2).run();

editor.chain().setBlockType('bullet_list_item').run();
editor.chain().setBlockType('task_list_item', { checked: false }).run();
editor.chain().setParagraph().run();
editor.chain().indentListItem().run();     // Tab, outdentListItem()은 Shift+Tab
editor.chain().toggleTaskChecked().run();  // 또는 toggleTaskChecked(blockId)
```

서식, 링크, 삽입:

```ts
editor.chain().toggleItalic().run();       // toggleUnderline, toggleStrike, toggleHighlight도 있음
editor.chain().toggleMark({ type: 'code' }).run();
editor.chain().setLink('https://example.com').run(); // 선택 영역에 적용
editor.chain().unsetLink().run();

editor.chain().insertHorizontalRule().run();
editor.chain().insertImage({ src: 'https://example.com/a.png', alt: 'A' }).run();
editor.chain().setCodeBlock('ts').run();   // setCodeLanguage('py')로 변경, ''이면 해제
editor.chain().insertFragment(blocks).run(); // 붙여넣기처럼 커서 위치에 블록 삽입
editor.chain().insertLineBreak().run();    // Shift+Enter
editor.chain().selectAll().run();
```

표:

```ts
editor.chain().insertTable(3, 3).run();    // 행, 열. 머리글 행이 없으면 { header: false }
editor.chain().addRowBefore().run();       // addRowAfter, addColumnBefore, addColumnAfter도 있습니다
editor.chain().deleteRow().run();          // deleteColumn, deleteTable도 있습니다
editor.chain().toggleHeaderRow().run();    // 첫 행을 머리글로, 또는 되돌리기
editor.chain().goToNextCell().run();       // Tab. goToPreviousCell()은 Shift+Tab
editor.isInTable();                        // 캐럿이 표 안에 있으면 true
```

커서가 표 안에 있으면 `createTableToolbar(editor)`로 붙인 표 도구 막대가 표 위에 나타나, 같은 명령을 버튼으로 보여 줍니다. `<levit-editor>`와 React·Vue 컴포넌트는 이 막대를 알아서 붙입니다.

삭제는 키 입력과 똑같이 동작합니다. `deleteBackward()`, `deleteForward()`, `deleteWordBackward()`, `deleteWordForward()`, `deleteLineBackward()`, `deleteLineForward()`, `deleteSelection()`이 있습니다.

### 에디터 옵션

```ts
createLevitEditor(element, {
  initialContent: doc,           // 처음에 보여 줄 문서 JSON
  placeholder: 'Write...',
  onChange: (editor) => {},
  onSelectionChange: (selection) => {},
  // 붙여 넣거나 끌어다 놓은 이미지 파일을 이 함수로 올린 뒤 삽입합니다.
  // 없으면 이미지 파일은 무시됩니다.
  uploadImage: async (file) => 'https://cdn.example.com/a.png',
  // 업로드 실패처럼 백그라운드에서 생긴 오류
  onError: (error) => console.error(error),
  // 언어가 지정된 코드 블록에 문법 강조
  highlightCode: (code, language) => code,
  plugins: [],
  messages: ko,                  // 기본은 영어
});
```

`highlightCode`는 highlight.js나 Shiki 등으로 만든 코드 HTML을 돌려줍니다. `class`와 `style`이 있는 `<span>`만 남기며, 텍스트 자체는 바뀌면 안 됩니다.

```ts
import hljs from 'highlight.js';

createLevitEditor(element, {
  highlightCode: (code, language) =>
    hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : code,
});
```

### 그 밖의 메서드

```ts
editor.getJSON(); editor.setJSON(json); editor.getText();
editor.getHTML(); editor.getMarkdown();
editor.isActive('bold');          // 선택한 글에 서식이 있는지(또는 다음에 입력할 글에 적용될지)
editor.getActiveLink();           // 선택한 링크의 href, 없으면 null
editor.undo(); editor.redo();
editor.focus(); editor.hasFocus();
editor.setEditable(false);        // 입력 잠금, editor.isEditable로 확인
editor.destroy();
```

이 밖에도 `editor.commands`(플러그인 명령), `editor.messages`와 `editor.t(key, values)`(사용 중인 문구), 다른 곳에서 만든 상태를 한 번에 적용하는 `editor.replaceState(state)`, 오류를 `onError`나 콘솔로 보내는 `editor.reportError(error)`가 있습니다.

## 이벤트

`editor.on`은 핸들러를 해제하는 함수를 돌려줍니다.

```ts
const stop = editor.on('update', ({ editor, transaction }) => {
  save(editor.getJSON());
});

editor.on('selectionUpdate', ({ editor, selection }) => {});
editor.on('transaction', ({ editor, transaction }) => {});
editor.on('focus', ({ editor, event }) => {});
editor.on('blur', ({ editor, event }) => {});
editor.on('destroy', ({ editor }) => {});

stop(); // 또는 editor.off('update', handler)
```

- `update`: 문서가 바뀌었을 때. 실행 취소, 다시 실행, `setJSON`도 포함합니다.
- `selectionUpdate`: 선택 영역이 움직였거나, 그 아래 문서가 바뀌었을 때.
- `transaction`: 아무것도 바뀌지 않았더라도 디스패치될 때마다.
- `destroy`: 에디터가 제거될 때. 직후에 핸들러도 모두 해제됩니다.

핸들러 하나가 예외를 던져도 나머지는 계속 실행되고, 오류는 `onError`(없으면 콘솔)로 갑니다.

## React와 Vue

두 패키지 모두 에디터 옵션을 props로 받고, 끄지 않는 한 버블 메뉴와 슬래시 메뉴를 붙입니다. 변경으로 받은 값을 다시 넘겨도 커서 위치는 그대로입니다.

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

- `value`와 `onChange`를 함께 쓰면 제어 컴포넌트, `defaultValue`만 쓰면 비제어 컴포넌트입니다.
- `onChange`는 `(value, editor)`를 받습니다.
- `bubbleMenu={false}`, `slashMenu={false}`, `tableToolbar={false}`로 메뉴를 끕니다.
- `ref`나 `onReady`로 에디터 인스턴스를 받습니다. `className`, `style`, `id`는 요소에 전달됩니다.
- `'use client'`가 지정되어 있어 Next.js App Router에서 바로 쓸 수 있습니다.

화면을 직접 구성하려면 훅을 씁니다. `editor`는 요소가 마운트되기 전까지 `null`입니다.

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

- props: `placeholder`, `plugins`, `messages`, `uploadImage`, `highlightCode`
- `:bubble-menu="false"`, `:slash-menu="false"`, `:table-toolbar="false"`로 메뉴를 끕니다.
- `@ready`로 에디터 인스턴스를, `@error`로 업로드 실패 같은 오류를 받습니다.
- 컴포넌트 ref의 `editor`로도 인스턴스에 접근할 수 있습니다.

화면을 직접 구성하려면 컴포저블을 씁니다.

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

## 플러그인

플러그인은 블록, 서식, 명령, 단축키, 입력 규칙, 메뉴 항목을 추가하는 평범한 객체입니다. `plugins` 옵션으로 넘깁니다. 플러그인은 내장 블록·서식 타입이나 다른 플러그인의 타입을 다시 정의할 수 없습니다.

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

### 블록과 서식

블록 스펙(`BlockSpec`)에는 `type`이 있고, 다음을 선택적으로 지정합니다.

- `tag`(기본값 `div`)와 `className`: 요소
- `toHTML(block, content)`, `toMarkdown(block, text)`: 내보내기
- `parseHTML(el)`: attrs 또는 `null` 반환, `parseMarkdown(raw)`: `{ text, attrs }` 또는 `null` 반환
- `atom: true`와 `render(block, el)`: 이미지처럼 텍스트가 없는 블록
- `attrsSchema`: attrs의 JSON Schema(AI 문서 스키마에 쓰임)

```ts
const video = {
  type: 'video',
  atom: true,
  render: (block, el) => { /* el 안에 그리기(편집 불가) */ },
  toHTML: (block) => `<div data-video="${block.attrs?.id}"></div>`,
  parseHTML: (el) => (el.hasAttribute('data-video') ? { id: el.getAttribute('data-video') } : null),
};
```

서식 스펙(`MarkSpec`)에는 `type`, `tag`, `className`, `attributes(mark)`(`on`으로 시작하는 속성은 버려짐), `toHTML`, `toMarkdown`, `parseHTML`, `attrsSchema`, `inclusive`가 있습니다. `inclusive`는 기본값이 `true`이며, `false`로 하면 서식 바로 뒤에 입력한 글에는 서식이 붙지 않습니다.

```ts
const color = {
  type: 'color',
  tag: 'span',
  attributes: (mark) => ({ style: `color: ${mark.attrs?.color}` }),
  inclusive: false,
  parseHTML: (el) => ((el as HTMLElement).style.color ? { color: (el as HTMLElement).style.color } : null),
};
```

직렬화 함수에도 플러그인을 넘겨야 합니다. `documentToHTML(doc, { plugins })`, `htmlToDocument(html, { plugins })`이며 Markdown도 같습니다. 플러그인이 없으면 알 수 없는 블록은 텍스트만 담은 문단으로 내보냅니다.

### 명령, 단축키, 입력 규칙

- `commands`: 인자를 받아 트랜잭션을 바꾸는 함수를 돌려주는 팩토리입니다(`false`를 돌려주면 취소). `editor.commands.name(...)`으로 실행하거나, 체인 안에서 `.exec('name', ...args)`로 씁니다.
- `keymap`: `'Mod'`는 macOS에서 Cmd, 그 밖에서는 Ctrl입니다. `false`를 돌려주면 내장 키 동작이 실행됩니다.
- `inputRules`: `{ match, handler(tr, match, blockId) }`. 블록 맨 앞에서 내장 규칙보다 먼저 검사합니다.
- `slashItems`, `bubbleItems`: 메뉴 항목. `title`은 에디터를 받는 함수여도 됩니다.
- `setup(editor)`: 한 번 실행되며, 정리 함수를 돌려주면 destroy 때 호출됩니다.

```ts
const plugin: LevitPlugin = {
  name: 'video',
  commands: {
    insertVideo: (id: string) => (tr) => void tr.insertAtom('video', { id }),
  },
  inputRules: [{ match: /^!!!\s$/, handler: (tr, match, blockId) => true }],
  bubbleItems: [{ label: '🎬', title: (editor) => 'Video', action: (editor) => {} }],
  setup: (editor) => () => { /* 정리 */ },
};

editor.chain().exec('insertVideo', 'v1').insertText('caption').run();
```

### 블록 수정하기

블록은 얼려(freeze) 있으며 상태와 실행 취소 기록이 함께 공유합니다. 명령이나 입력 규칙에서 블록을 바꾸려면 트랜잭션에서 사본을 받습니다.

```ts
const block = tr.editBlock(blockId);   // 인덱스도 가능, 없으면 undefined
if (block) block.attrs = { ...block.attrs, color: 'red' };
// tr.doc.blocks[i].attrs = ...  블록이 얼려 있어 오류 발생
```

변경과 관계없는 블록은 같은 객체로 남으므로, 아주 긴 문서에서도 바뀐 블록만 다시 그립니다.

## AI

AI 기능은 별도 진입점 `@yonailab/levit/ai`에 있어서, AI를 쓰지 않는 에디터는 불러오지 않습니다. Levit은 AI 서비스를 직접 호출하지 않습니다. 답변을 Markdown 텍스트 스트림으로 돌려주는 `provider`를 넘기면 됩니다.

### provider

```ts
import { createLevitEditor } from '@yonailab/levit';
import { aiPlugin, runAICommand, stopAI } from '@yonailab/levit/ai';

const editor = createLevitEditor(element, {
  plugins: [
    aiPlugin({
      // API 키를 가진 자체 서버를 호출합니다.
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

provider는 `AIRequest`를 받아 문자열의 async iterable(또는 그 Promise)을 돌려줍니다.

- `command`: `'improve'`, `'continue'`, `'summarize'` 또는 직접 만든 id
- `prompt`: 모델에 줄 지시문
- `text`: 선택 영역의 Markdown(선택 없이 `summarize`하면 문서 전체)
- `before`, `after`: 선택 영역 앞뒤의 Markdown, 각각 `contextLength`자(기본 4000)
- `signal`: Escape나 `stopAI(editor)`로 중단되는 `AbortSignal`

### 명령

내장 명령은 슬래시 메뉴에 나타나고, `improve`는 버블 메뉴에도 나타납니다.

- `improve`: 선택한 글을 제안 형태로 바꿉니다.
- `continue`: 커서 위치에 이어 씁니다.
- `summarize`: 선택 영역 아래에 블록을 추가하거나, 문서 전체를 요약합니다.

`commands`로 명령을 추가합니다. 내장 명령과 id가 같으면 그 명령을 대체합니다.

```ts
aiPlugin({
  provider,
  commands: [{
    id: 'translate',
    title: 'Translate',
    prompt: 'Translate to English.',
    insert: 'replace',          // 또는 'cursor', 'below'
    needsSelection: true,
    bubble: true,               // 버블 메뉴에도 버튼 표시
  }],
  suggestions: true,            // 'replace' 답변을 제안으로 표시(기본값)
  contextLength: 4000,
});
```

코드에서도 실행할 수 있습니다. `runAICommand`는 `{ markdown, aborted }`를 돌려주며, 선택이 필요한 명령인데 선택 영역이 없으면 `null`을 돌려줍니다.

```ts
await runAICommand(editor, 'improve');
await runAICommand(editor, 'continue', { prompt: 'Write one more paragraph.' });
stopAI(editor);
```

명령은 한 번에 하나만 실행됩니다. 그동안 편집은 잠기고(`contenteditable=false`, `aria-busy`), 답변 전체는 실행 취소 한 번으로 되돌아갑니다.

### 제안 모드

제안 모드에서는 `replace` 답변이 글을 바로 덮어쓰지 않습니다. 바뀐 단어가 삭제와 삽입(`<del>`, `<ins>`)으로 표시되고, 다음 방법으로 받아들이거나 거절합니다.

- 옆에 뜨는 플로팅 툴바
- `Mod-Shift-Enter`(받아들이기), `Mod-Shift-Backspace`(거절하기)
- `editor.commands.acceptSuggestions(id?)`, `editor.commands.rejectSuggestions(id?)`

이 명령들은 처리할 제안이 없거나 답변이 아직 스트리밍 중이면 `false`를 돌려줍니다. HTML로 내보내면 `<del>`/`<ins>`가 보이고, Markdown으로 내보내면 받아들인 것처럼 읽힙니다.

### Markdown 스트리밍

`streamMarkdown`은 어떤 Markdown 스트림이든 서식을 살려 실시간으로 에디터에 넣습니다. 텍스트가 도착하는 동안 닫히지 않은 굵게나 코드 펜스는 닫힌 것처럼 보여 줍니다.

```ts
import { streamMarkdown } from '@yonailab/levit/ai';

await streamMarkdown(editor, stream, {
  signal: controller.signal,
  at: 'below',                 // 또는 'selection'(기본값)
});
```

### JSON 스키마와 검사

`getDocumentSchema({ plugins })`는 Levit 문서의 JSON Schema(2020-12)를 돌려줍니다. 구조화 출력이나 도구 스키마로 넘기면 모델이 Levit JSON을 바로 만듭니다. 내장 스키마는 `@yonailab/levit/document.schema.json` 파일로도 제공됩니다. 플러그인은 `attrsSchema`로 자기 attrs를 설명합니다.

```ts
import { getDocumentSchema, validateDocument } from '@yonailab/levit/ai';

const schema = getDocumentSchema({ plugins });
const result = validateDocument(jsonFromAI, { plugins });

if (result.valid) editor.setJSON(jsonFromAI);
else console.warn(result.errors); // [{ path: '$.blocks[2].attrs.level', message: '...' }]
```

`validateDocument`는 위험한 링크와 이미지 URL도 거부합니다.

## 공동 편집

### Yjs

`@yonailab/levit-yjs`는 에디터를 Yjs 문서와 동기화합니다. Yjs는 peer dependency이며 코어는 Yjs에 의존하지 않습니다. `y-websocket`, `y-webrtc`, `y-indexeddb` 등 어떤 Yjs provider와도 함께 쓸 수 있습니다.

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { bindYjs } from '@yonailab/levit-yjs';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('wss://example.com', 'room-1', ydoc);

provider.once('sync', () => {
  const binding = bindYjs(editor, ydoc.getArray('blocks'), {
    awareness: provider.awareness,             // 커서 공유
    user: { name: '민지', color: '#e11d48' },  // 다른 사람에게 보일 이름과 색
    captureTimeout: 500,                       // 이 시간 안의 변경을 실행 취소 한 단계로 묶음
  });
});
```

provider가 공유 문서를 받아 온 뒤에 연결하세요. 배열이 비어 있으면 에디터의 문서가 들어가고, 내용이 있으면 에디터가 공유 문서를 보여 줍니다. 따라서 새 문서의 내용을 채우는 곳은 한 곳(서버나 첫 사용자)이어야 합니다.

- 동시에 고쳐도 모두에게 같은 결과로 합쳐지고, 다른 사람이 앞에 글을 넣어도 내 커서는 같은 글자 옆에 남습니다.
- 실행 취소와 다시 실행(단축키 포함)은 `Y.UndoManager`인 `binding.undoManager`를 거치며, 내 변경만 되돌립니다.
- IME 조합 중에 들어온 다른 사람의 변경은 조합이 끝난 뒤 반영합니다.
- `binding.remoteCursors()`는 다른 사용자의 커서 목록을 돌려줍니다. `binding.destroy()`는 동기화를 멈추고 실행 취소를 에디터 기록으로 되돌립니다.

Yjs 안에서 블록은 `Y.Map`의 `Y.Array`이며, 각각 `id`, `type`, `attrs`(일반 객체), `text`(`Y.Text`)를 가집니다. 서식은 `{ bold: true }`, `{ link: { href } }` 같은 `Y.Text` 포맷 속성입니다.

### Yjs 없이 커서 표시

다른 방법으로 위치를 주고받는다면 `createRemoteCursors`로 커서만 그립니다. 이 레이어는 에디터 바로 뒤에 놓이고 스크린 리더에는 숨겨집니다.

```ts
import { createRemoteCursors } from '@yonailab/levit';

const cursors = createRemoteCursors(editor);
cursors.set([{ id: 'u1', name: 'Mina', color: '#e11d48', anchor: pos, head: pos }]);
cursors.update();   // 레이아웃이 바뀐 뒤 다시 그리기
cursors.destroy();  // 에디터와 함께 제거되기도 함
```

이름은 텍스트로만 표시하고, 일반 CSS 색이 아닌 값은 회색으로 바꿉니다.

### 코어 훅

Yjs 바인딩이 쓰는 기능으로, 다른 바인딩을 직접 만들 때 씁니다.

```ts
tr.setMeta('addToHistory', false);  // 실행 취소 기록에서 제외
tr.setMeta('remote', true);         // 외부에서 온 변경: 포커스나 선택을 가져가지 않음
tr.getMeta(key);                    // editor.on('transaction', ...)에서 meta 읽기
tr.setBlocks(blocks);               // 블록 전체 교체, 바뀌지 않은 블록은 그대로 전달

editor.setHistory({ undo: () => true, redo: () => true }); // null이면 내장 기록 사용
editor.isComposing;                 // IME 조합 중이면 true
editor.hasFocus();
```

## 댓글

에디터는 댓글이 달린 위치만 기억하고, 스레드 내용은 앱이 id로 관리합니다.

```ts
import { createLevitEditor, commentsPlugin, getComments } from '@yonailab/levit';

const editor = createLevitEditor(element, {
  plugins: [commentsPlugin({
    onAdd: ({ id, text }, editor) => threads.create(id, text),
    onSelect: (ids, editor) => sidebar.highlight(ids), // 없으면 []
    createId: () => crypto.randomUUID(),               // 선택 사항
  })],
});

editor.commands.addComment();        // 선택 영역에 댓글(버블 메뉴의 💬 버튼과 같음)
editor.commands.removeComment(id);
editor.commands.selectComment(id);   // 댓글이 달린 글 선택
getComments(editor);                 // [{ id, text, from, to }] 문서 순서대로
```

- id는 `/^[\w-]{1,64}$/`에 맞아야 합니다.
- 댓글은 겹쳐도 됩니다. 겹친 부분은 `attrs.ids`가 `'c1 c2'`처럼 된 `comment` 서식 하나를 공유합니다.
- 댓글 바로 뒤에 입력한 글은 댓글에 포함되지 않습니다.
- HTML·Markdown으로 내보낼 때 댓글은 빠집니다. Yjs를 쓰면 댓글 위치도 함께 공유됩니다.

## 다국어와 접근성

### 문구

메뉴, 안내 문구, 스크린 리더용 레이블은 기본이 영어입니다. 한국어(`ko`)와 일본어(`ja`)가 내장되어 있고, 문구 일부만 바꿀 수도 있습니다.

```ts
import { createLevitEditor, ko, ja } from '@yonailab/levit';

createLevitEditor(element, { messages: ko });
createLevitEditor(element, { messages: ja });
createLevitEditor(element, { messages: { bold: 'Gras' } });

editor.t('codeLanguageLabel', { language: 'ts' }); // 플레이스홀더를 채운 문구
```

웹 컴포넌트는 `lang` 속성으로 언어를 고릅니다. `<levit-editor lang="ko">` 또는 `lang="ja"`.

### 키보드

- `Enter`는 블록을 나누고, `Shift+Enter`는 블록 안에서 줄을 바꿉니다.
- `Cmd/Ctrl+B`, `I`, `U`는 굵게, 기울임, 밑줄, `Cmd/Ctrl+Shift+X`는 취소선, `Cmd/Ctrl+Shift+H`는 형광펜입니다.
- `Cmd/Ctrl+Z`는 실행 취소, `Cmd/Ctrl+Shift+Z` 또는 `Ctrl+Y`는 다시 실행입니다.
- 목록에서 `Tab`은 한 단계 들여쓰고 `Shift+Tab`은 내어 씁니다. 목록 밖에서 `Tab`은 평소처럼 포커스를 옮깁니다.
- `Cmd/Ctrl+Enter`는 체크리스트 항목을 체크하거나 해제합니다.
- `Alt+Backspace`(macOS) 또는 `Ctrl+Backspace`는 단어를, `Cmd+Backspace`(macOS)는 줄 맨 앞까지 지웁니다.

### 스크린 리더

- 편집 영역은 `aria-multiline`과 `aria-label`이 붙은 `role="textbox"`입니다. 페이지가 이미 레이블을 붙였다면 그대로 둡니다.
- 슬래시 메뉴는 `listbox`이며, 에디터가 `aria-activedescendant`로 현재 항목을 가리킵니다.
- 버블 메뉴는 `toolbar`입니다. 글을 선택한 상태에서 `Alt+F10`으로 들어가고, 방향키와 Home·End로 버튼을 옮기고, Enter나 Space로 누르고, Escape로 글로 돌아옵니다. 켜진 서식은 `aria-pressed`로 알려 줍니다.
- 표 도구 막대도 `toolbar`입니다. 커서가 표 안에 있을 때 `Alt+F10`으로 들어가고, 키는 버블 메뉴와 같으며, Escape로 칸으로 돌아옵니다. 머리글 행 버튼은 머리글 행이 있는지를 `aria-pressed`로 알려 줍니다.

## 테마

모든 색은 CSS 변수로 정해져 있어, 변수만 바꾸면 에디터 전체의 모양이 바뀝니다.

```css
:root {
  --levit-bg: #ffffff;
  --levit-text: #0f172a;
  --levit-primary: #3b82f6;
  --levit-radius: 8px;
}
```

- 배경: `--levit-bg`, `--levit-surface`, `--levit-border`
- 글자: `--levit-text`, `--levit-text-muted`, `--levit-placeholder`
- 강조색: `--levit-primary`, `--levit-primary-hover`, `--levit-on-primary`
- 선택 영역과 형광펜: `--levit-selection`, `--levit-highlight`
- 코드와 인용: `--levit-code-bg`, `--levit-code-text`, `--levit-quote-border`
- 오류: `--levit-danger`
- 글꼴과 모양: `--levit-font-sans`, `--levit-font-mono`, `--levit-radius`, `--levit-shadow`
- 댓글: `--levit-comment-bg`, `--levit-comment-active-bg`, `--levit-comment-border`
- AI 제안: `--levit-suggestion-insert-bg`, `--levit-suggestion-insert-text`, `--levit-suggestion-delete-text`

변수는 상속되므로 `.levit-editor-root`에 지정하면 그 에디터에만 적용됩니다. 메뉴는 `body`에 붙으므로 메뉴까지 바꾸려면 `:root`에 지정하세요.

### 다크 모드

`[data-theme="dark"]` 아래에서 어두운 색이 적용되고, `[data-theme="light"]`를 지정하지 않으면 시스템 설정을 따릅니다.

```css
[data-theme="dark"] {
  --levit-bg: #090d16;
  --levit-text: #f1f5f9;
}
```

## 보안

Levit은 화면에 그릴 때, 붙여 넣은 HTML이나 Markdown을 읽을 때, HTML로 내보낼 때 위험한 내용을 걸러 냅니다.

- 위험한 링크와 이미지 URL을 제거합니다. `javascript:`와 SVG data URL은 허용하지 않습니다.
- 붙여 넣은 `script`, `iframe` 요소와 이벤트 속성을 제거합니다.
- 내보내는 HTML은 이스케이프합니다.
- `highlightCode` 결과에서는 `class`와 `style`이 있는 `<span>`만 남깁니다.

그래도 앱에서 꼭 해야 할 일이 있습니다.

1. 서버에서 다시 검사하세요. 공격자는 JSON이나 HTML을 API로 바로 보내 브라우저의 검사를 우회할 수 있습니다. 저장된 내용은 서버에서 `documentFromJSON` → `documentToHTML`로 다시 만들거나, 다른 사용자에게 보여 주기 전에 HTML을 정화하세요.
2. Content-Security-Policy를 쓰세요. 예: `script-src 'self'; object-src 'none'; base-uri 'none'`. 에디터는 인라인 스크립트나 `eval`이 필요 없습니다.
3. 플러그인, `highlightCode`, `uploadImage`는 신뢰할 수 있는 앱 코드로 다루세요. 플러그인의 `toHTML`, `render`, `attributes`에 문서 데이터(블록·서식 attrs)를 넣을 때는 직접 이스케이프하고, `style`, `srcdoc`, `srcset`에는 절대 넣지 마세요.
4. 공동 편집에서는 공유 문서와 사용자 이름도 다른 사용자가 보낸 입력입니다. 누가 문서에 들어올 수 있는지는 Yjs 서버에서 정하고, 저장할 때 검사하세요.

Trusted Publishing으로 바꾼 뒤의 릴리스에는 npm provenance가 붙어 있으며 `npm audit signatures`로 확인할 수 있습니다. 취약점은 [GitHub 보안 권고](https://github.com/azusawa/levit/security/advisories/new)로 비공개 신고해 주세요.
