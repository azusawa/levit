# Levit (레빗)

[![CI](https://github.com/azusawa/levit/actions/workflows/ci.yml/badge.svg)](https://github.com/azusawa/levit/actions/workflows/ci.yml)

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./brand/levit-logo-dark.svg">
    <img src="./brand/levit-logo.svg" alt="Levit" width="240">
  </picture>
  <br />
  <strong>심플하고 모던한 완성형 웹 에디터 (Zero-Dependency & AI-Ready)</strong>
  <br />
  <i>가져다 쓰기 가장 편하고, 확장하기 쉬운 독립 코어 엔진</i>
</p>

**[웹사이트에서 직접 써 보기](https://azusawa.github.io/levit/ko/)** · [사용법](https://azusawa.github.io/levit/ko/guide/) · [개발 문서](https://azusawa.github.io/levit/ko/docs/)

<p align="center">
  <a href="#features">기능 특징</a> •
  <a href="#quick-start">빠른 시작</a> •
  <a href="#web-component">웹 컴포넌트</a> •
  <a href="#ai-integration">AI 연동</a> •
  <a href="#api-reference">API 레퍼런스</a> •
  <a href="#license">라이선스</a>
</p>

---

## ✨ 핵심 특징 (Key Highlights)

1. **Zero Runtime Dependency (런타임 의존성 0개)**
   - 외부 런타임 라이브러리 없이 순수 Web 표준 API(DOM, Selection, InputEvent)와 TypeScript만으로 독자 구현되었습니다.
   - 번들 크기: **약 30 kB (gzipped)**, 사용하는 쪽에서 다시 압축하면 약 25 kB입니다. AI 기능(`@yonailab/levit/ai`)은 따로 약 7 kB이고, 쓸 때만 불러옵니다.
2. **가져다 쓰기 가장 쉬운 구조 (DX & AX First)**
   - 단 3줄의 코드로 모든 웹사이트에 연동 가능합니다.
   - `<levit-editor></levit-editor>` 웹 컴포넌트를 지원하여 React, Vue, Svelte, 바닐라 JS 어디서나 HTML 태그 하나로 동작합니다.
   - React(`@yonailab/levit-react`)와 Vue(`@yonailab/levit-vue`) 전용 컴포넌트도 있습니다.
   - **플러그인**으로 블록, 서식, 명령, 단축키를 직접 추가하고, `editor.on('update', ...)` 같은 이벤트로 변경을 받습니다.
3. **AI-Native 설계 (AI 친화적)**
   - 결정론적이고 단순한 JSON 스키마를 지원하여 LLM이 문서를 분석하고 생성하기 매우 쉽습니다.
   - 글 다듬기·이어 쓰기·요약, 서식이 살아 있는 스트리밍, 받아들이기·거절하기 **제안 모드**를 어떤 AI와도 연결해 씁니다(`aiPlugin`).
   - 문서 JSON Schema와 검사 함수로 AI가 정확한 형식의 문서를 만들게 합니다.
   - AI 코딩 에이전트(Cursor, Antigravity, Copilot 등)를 위한 `llms.txt` 표준 지원.
4. **하이브리드 편집 경험 (Modern Hybrid UX)**
   - Notion 스타일의 **슬래시(`/`) 커맨드 메뉴**
   - 텍스트 선택 시 부드럽게 나타나는 **플로팅 버블 툴바 (Floating Bubble Toolbar)** — 굵게·기울임·밑줄·취소선·**형광펜**·코드·**링크**·제목·인용
   - **글머리표 / 번호 목록** (Enter로 다음 항목, 빈 항목에서 Enter 또는 맨 앞 Backspace로 목록 종료)
   - **중첩 목록**: `Tab`으로 한 단계 들여쓰고 `Shift+Tab`으로 내어 씁니다. 번호는 단계마다 따로 매깁니다.
   - **체크리스트**: `[] ` 또는 `[ ] `로 시작하고, 상자를 누르거나 `Cmd/Ctrl+Enter`로 체크합니다.
   - **구분선**(`---`)과 **이미지**: 이미지는 URL로 넣거나, `uploadImage`를 연결하면 붙여넣기·끌어다 놓기로 올립니다.
   - **코드 블록 언어** 지정과 문법 강조 연결 지점(`highlightCode`)
   - `# `, `> `, ` ``` `, `- `, `* `, `1. `, `[ ] `, `---` 실시간 마크다운 단축키 자동 변환
   - 한글(CJK) IME 조합 중 글자 중복 입력 현상 완벽 방어
5. **안정적인 입력 처리 (Reliable Input)**
   - 모든 입력(Delete, 단어·줄 삭제, `Shift+Enter` 줄바꿈, 자동 교정)을 문서 모델을 거쳐 처리해, 화면과 저장 데이터가 어긋나지 않습니다.
   - **붙여넣기**: 웹페이지·Google Docs의 HTML, Markdown, 일반 텍스트를 블록과 서식으로 변환합니다(위험한 링크는 제거). 코드 블록에는 일반 텍스트로 붙여 넣습니다.
   - 복사·잘라내기는 목록과 서식을 그대로 유지하고, 밖에서 끌어다 놓은 글은 놓은 위치에 들어갑니다.
   - 확장 프로그램이나 스크립트가 편집 영역을 직접 바꾸면 감지해서 되돌립니다.
   - Chrome 87, Edge 88, Firefox 78, Safari 14 이상에서 동작하며, Chrome, Firefox, Safari(WebKit)에서 자동 테스트로 확인합니다.
6. **공동 편집과 댓글**
   - `@yonailab/levit-yjs`로 여러 사람이 같은 문서를 실시간으로 고칩니다. 다른 사람의 커서와 이름이 보이고, 실행 취소는 내 변경만 되돌립니다.
   - 글에 **댓글**을 달고(`commentsPlugin`), 댓글 내용은 앱이 원하는 곳에 저장합니다.
   - 수만 개 블록의 긴 문서에서도 바뀐 블록만 다시 그려, 입력 속도가 같은 내용의 일반 편집 영역(contenteditable)과 비슷합니다.
7. **다국어와 접근성**
   - 메뉴와 안내 문구는 영어가 기본이고, `messages: ko`(한국어), `messages: ja`(일본어)를 쓰거나 원하는 문구로 바꿉니다.
   - 스크린 리더가 편집 영역, 슬래시 메뉴, 서식 도구 모음을 읽어 줍니다. `Alt+F10`으로 도구 모음에 들어가 키보드만으로 서식을 바꿀 수 있습니다.

---

## 🚀 빠른 시작 (Quick Start)

### 1. 설치
```bash
npm install @yonailab/levit
```

> Levit은 ESM 전용 패키지입니다. 번들러나 `import`로 사용하세요. 서버(SSR)에서 import해도 안전하며, `<levit-editor>`는 브라우저에서만 등록됩니다.

### 2. Vanilla JS / TypeScript에서 사용
```ts
import { createLevitEditor, createBubbleMenu, createSlashMenu } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const container = document.getElementById('editor');

// 에디터 생성
const editor = createLevitEditor(container, {
  placeholder: '내용을 입력하거나 "/" 키를 눌러보세요...',
  onChange: (ed) => {
    console.log('JSON 데이터:', ed.getJSON());
    console.log('순수 텍스트:', ed.getText());
  },
});

// 버블 메뉴 및 슬래시 커맨드 활성화
createBubbleMenu(editor);
createSlashMenu(editor);   // 줄 첫머리나 띄어쓰기 뒤의 "/"로 열고, 이어서 입력하면 걸러짐
```

### 3. 이미지 업로드와 문법 강조 (선택)
```ts
import hljs from 'highlight.js';

const editor = createLevitEditor(container, {
  // 붙여 넣거나 끌어다 놓은 이미지 파일을 올리고, 받은 URL로 이미지를 넣습니다.
  uploadImage: async (file) => {
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body });
    return (await res.json()).url;
  },
  // 업로드 실패처럼 뒤에서 생긴 오류를 받습니다.
  onError: (error) => console.error(error),
  // 언어가 지정된 코드 블록을 강조합니다. span의 class와 style만 남깁니다.
  highlightCode: (code, language) =>
    hljs.getLanguage(language) ? hljs.highlight(code, { language }).value : code,
});
```

`uploadImage`가 없으면 이미지 파일은 무시되고, 슬래시 메뉴의 **Image**는 URL을 묻습니다.

---

## ⚛️ React / Vue

```bash
npm install @yonailab/levit @yonailab/levit-react   # React 18, 19
npm install @yonailab/levit @yonailab/levit-vue     # Vue 3
```

```tsx
// React
import { useState } from 'react';
import { LevitEditor } from '@yonailab/levit-react';
import { ko, type DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

export function Note() {
  const [doc, setDoc] = useState<DocumentData>();
  return <LevitEditor value={doc} onChange={setDoc} messages={ko} />;
}
```

```vue
<!-- Vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { LevitEditor } from '@yonailab/levit-vue';
import type { DocumentData } from '@yonailab/levit';
import '@yonailab/levit/levit.css';

const doc = ref<DocumentData>();
</script>

<template>
  <LevitEditor v-model="doc" />
</template>
```

에디터 옵션은 그대로 props로 넘기고, 메뉴는 기본으로 켜집니다. 직접 화면을 구성하려면 `useLevitEditor()`를 씁니다.
자세한 내용은 [React 패키지](packages/react/README.md), [Vue 패키지](packages/vue/README.md) 문서를 보세요.

---

## 🧩 웹 컴포넌트 (`<levit-editor>`)

별도의 번들러 설정 없이 HTML 파일에 직접 삽입할 수 있습니다:

```html
<!-- CDN 링크 삽입 -->
<script type="module" src="https://unpkg.com/@yonailab/levit/dist/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/@yonailab/levit/dist/levit.css">

<!-- 어디서나 태그 하나로 사용 -->
<levit-editor placeholder="작성해주세요..."></levit-editor>

<script>
  const editor = document.querySelector('levit-editor');
  editor.addEventListener('input', (e) => {
    console.log('문서 데이터:', e.detail.json);
  });
</script>
```

- 버블 메뉴와 슬래시 메뉴가 기본으로 붙습니다. `bubble-menu="false"`, `slash-menu="false"`로 뺄 수 있습니다.
- `lang="ko"`/`"ja"`로 메뉴 언어를 정합니다. 나중에 바꾸면 같은 내용으로 새 `editor`를 만듭니다. 요소를 다른 곳으로 옮겨도 같은 에디터가 유지되고, 제거한 뒤에도 `getJSON()`으로 문서를 얻습니다.
- 에디터 전체 기능은 `editor` 속성으로 씁니다(`el.editor.getJSON()` 등).

---

## 🤖 AI 연동 (AI-Native Integration)

AI 기능은 별도 진입점 `@yonailab/levit/ai`에 있어서, 쓰지 않으면 번들에 들어가지 않습니다.
Levit은 AI 서비스를 직접 부르지 않습니다. **`provider` 함수 하나**를 연결하면 OpenAI, Claude, 사내 모델 무엇이든 쓸 수 있습니다.

```ts
import { createLevitEditor, ko } from '@yonailab/levit';
import { aiPlugin, runAICommand } from '@yonailab/levit/ai';

const editor = createLevitEditor(container, {
  messages: ko,
  plugins: [
    aiPlugin({
      // 앱 서버를 거쳐 AI를 부르고, 답을 Markdown 텍스트 스트림으로 돌려줍니다.
      // API 키는 서버에만 두세요.
      provider: async function* ({ command, prompt, text, before, after, signal }) {
        const res = await fetch('/api/ai', {
          method: 'POST',
          body: JSON.stringify({ command, prompt, text, before, after }),
          signal, // Esc를 누르면 요청도 멈춥니다.
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

await runAICommand(editor, 'improve'); // 메뉴 대신 코드로 실행
```

- **글 다듬기 · 이어 쓰기 · 요약**: 슬래시(`/`) 메뉴와 버블 메뉴(✨)에 추가됩니다. `commands`로 번역 같은 명령을 더할 수 있습니다.
- **서식까지 실시간으로**: 답변이 도착하는 동안 제목·목록·굵게가 바로 서식으로 보입니다(`streamMarkdown`). 답변 전체가 실행 취소 한 번으로 되돌아가고, `Esc`로 멈춥니다.
- **제안 모드**: "다듬기"는 바로 덮어쓰지 않고 바뀐 단어만 <del>지운 글</del>·<ins>새 글</ins>로 보여 줍니다. 옆에 뜨는 버튼, `Cmd/Ctrl+Shift+Enter`(받아들이기) / `Cmd/Ctrl+Shift+Backspace`(거절하기), 또는 `editor.commands.acceptSuggestions()`로 고릅니다.
- **문서 규격**: `getDocumentSchema()`는 Levit 문서의 JSON Schema를 줍니다(파일로도 `@yonailab/levit/document.schema.json`). AI에게 구조화 출력 형식으로 주면 Markdown 대신 문서 JSON을 바로 만들게 할 수 있고, `validateDocument()`로 넣기 전에 검사합니다(위험한 링크·이미지 주소도 걸러냄).

```ts
import { getDocumentSchema, validateDocument } from '@yonailab/levit/ai';

const result = validateDocument(jsonFromAI);
if (result.valid) editor.setJSON(jsonFromAI);
else console.warn(result.errors); // [{ path: '$.blocks[2].attrs.level', message: 'must be an integer from 1 to 6' }]
```

기존 `getAIContext()`(문서와 선택한 글)와 `streamAIResponse()`(글자 그대로 넣기)도 계속 쓸 수 있습니다.

---

## 👥 공동 편집과 댓글

### 실시간 공동 편집 (Yjs)

```bash
npm install @yonailab/levit @yonailab/levit-yjs yjs
```

```ts
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { bindYjs } from '@yonailab/levit-yjs';

const ydoc = new Y.Doc();
const provider = new WebsocketProvider('wss://example.com', 'room-1', ydoc);
provider.once('sync', () => {
  bindYjs(editor, ydoc.getArray('blocks'), {
    awareness: provider.awareness,           // 다른 사람의 커서 보이기
    user: { name: '민지', color: '#e11d48' },
  });
});
```

- 동시에 같은 문단을 고쳐도 모두 같은 결과로 합쳐집니다. 다른 사람이 앞에 글을 넣어도 내 커서는 같은 글자 옆에 남습니다.
- 실행 취소는 내가 한 변경만 되돌립니다. 한글 조합 중에 들어온 변경은 조합이 끝난 뒤 반영합니다.
- 코어는 Yjs에 의존하지 않습니다. 다른 방법으로 위치를 주고받는다면 `createRemoteCursors(editor)`로 커서만 그릴 수 있습니다.
- 자세한 내용은 [`@yonailab/levit-yjs` README](packages/yjs/README.md)를 보세요.

### 댓글

```ts
import { commentsPlugin, getComments } from '@yonailab/levit';

const editor = createLevitEditor(el, {
  plugins: [commentsPlugin({
    onAdd: ({ id, text }) => threads.create(id, text),   // 댓글 내용은 앱이 저장
    onSelect: (ids) => sidebar.highlight(ids),            // 커서가 들어간 댓글
  })],
});

editor.commands.addComment();          // 선택한 글에 댓글 (버블 메뉴의 💬 버튼과 같음)
editor.commands.removeComment(id);
editor.commands.selectComment(id);     // 사이드바에서 누른 댓글의 글 선택
getComments(editor);                   // [{ id, text, from, to }] 문서 순서대로
```

- 에디터는 댓글이 달린 위치만 기억하고, 내용·작성자·답글은 앱이 id로 관리합니다. Yjs를 쓰면 위치도 함께 공유됩니다.
- 댓글이 겹쳐도 됩니다. 댓글 끝에 이어 쓴 글은 댓글에 들어가지 않고, HTML·Markdown으로 내보낼 때는 빠집니다.

---

## 🔄 포맷 변환 (Serializers)

```ts
import {
  documentToJSON,
  documentFromJSON,
  documentToMarkdown,
  markdownToDocument,
  documentToHTML,
  htmlToDocument,
} from '@yonailab/levit';

// 마크다운 양방향 변환
const md = documentToMarkdown(editor.getJSON());
const docFromMd = markdownToDocument('# 제목\n\n**굵은 텍스트**');

// HTML 양방향 변환
const html = documentToHTML(editor.getJSON());
const docFromHtml = htmlToDocument('<h1>제목</h1><p>본문</p>');
```

---

## 🔌 플러그인과 이벤트

플러그인 하나로 블록 종류, 서식, 명령, 단축키, 입력 단축키, 슬래시 메뉴 항목을 추가합니다.
블록과 서식마다 HTML·Markdown 변환 방법도 정할 수 있습니다.

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

const editor = createLevitEditor(container, { plugins: [callout] });

// 이벤트: update, selectionUpdate, transaction, focus, blur, destroy
const stop = editor.on('update', ({ editor }) => save(editor.getJSON()));
editor.getHTML();      // 플러그인 블록까지 포함한 HTML
editor.isActive('bold'); // 선택한 글이 굵은지
```

이미지처럼 글이 없는 블록은 `atom: true`와 `render(block, el)`로 직접 그립니다.

명령에서 블록을 직접 바꿀 때는 `tr.editBlock(id)`로 그 블록의 사본을 받아 바꿉니다. 문서의 블록은 얼려(freeze) 있어서
`tr.doc.blocks[i]`를 바로 바꾸면 오류가 납니다. 바뀌지 않은 블록은 이전 상태와 같은 객체로 남아, 긴 문서에서도 바뀐 블록만 다시 그립니다.

```ts
commands: {
  setColor: (color: string) => (tr) => {
    const block = tr.editBlock(tr.selection.head.blockId);
    if (!block) return false;
    block.attrs = { ...block.attrs, color };
  },
},
```

---

## 🌐 다국어와 ♿ 접근성

```ts
import { createLevitEditor, ko, ja } from '@yonailab/levit';

createLevitEditor(container, { messages: ko });                 // 한국어
createLevitEditor(container, { messages: ja });                 // 일본어
createLevitEditor(container, { messages: { bold: 'Gras' } });   // 일부 문구만 바꾸기
```

웹 컴포넌트는 `<levit-editor lang="ko">`로 한국어, `lang="ja"`로 일본어를 씁니다.

- 편집 영역은 스크린 리더에 "여러 줄 텍스트 입력란"으로 알려집니다.
- 슬래시 메뉴는 방향키로 고르는 항목을 읽어 줍니다.
- 글을 선택하고 `Alt+F10`을 누르면 서식 도구 모음으로 이동합니다. 방향키로 버튼을 고르고, `Enter`로 적용하고, `Esc`로 글로 돌아갑니다. 켜진 서식은 "눌림"으로 읽어 줍니다. 코드 블록 안에서 `Alt+F10`을 누르면 언어 표시로 가고, `Enter`로 언어를 바꿉니다.

---

## 🎨 모던 테마 및 커스터마이징

모든 색은 CSS 변수(`--levit-*`)로 정해져 있어, 변수만 바꾸면 테마 전체가 바뀝니다:

```css
:root {
  --levit-bg: #ffffff;
  --levit-text: #0f172a;
  --levit-primary: #3b82f6;
  --levit-radius: 8px;
}

/* 다크 모드 */
[data-theme="dark"] {
  --levit-bg: #090d16;
  --levit-text: #f1f5f9;
}
```

| 변수 | 용도 |
|---|---|
| `--levit-bg`, `--levit-surface`, `--levit-border` | 배경, 메뉴 배경, 테두리 |
| `--levit-text`, `--levit-text-muted`, `--levit-placeholder` | 글자, 흐린 글자, 안내 문구 |
| `--levit-primary`, `--levit-primary-hover`, `--levit-on-primary` | 강조색, 강조색 위 글자(체크 표시) |
| `--levit-selection`, `--levit-highlight` | 선택 영역, 형광펜 |
| `--levit-code-bg`, `--levit-code-text`, `--levit-quote-border` | 코드, 인용 |
| `--levit-danger` | 잘못된 입력(링크 주소) |
| `--levit-comment-bg`, `--levit-comment-active-bg`, `--levit-comment-border` | 댓글이 달린 글 |
| `--levit-suggestion-insert-bg`, `--levit-suggestion-insert-text`, `--levit-suggestion-delete-text` | AI 제안(넣을 글, 지울 글) |
| `--levit-font-sans`, `--levit-font-mono`, `--levit-radius`, `--levit-shadow` | 글꼴, 모서리, 그림자 |

변수는 상속되므로 `.levit-editor-root`에 지정하면 그 에디터에만 적용됩니다. 메뉴는 `body`에 붙으므로 메뉴까지 바꾸려면 `:root`에 지정하세요.

---

## 🔒 보안

Levit은 화면에 그리고, 붙여넣기를 읽고, HTML로 내보내는 모든 단계에서 위험한 내용을 걸러 냅니다.

- `javascript:` 같은 위험한 링크와 SVG 이미지 주소를 막습니다.
- 붙여 넣은 HTML의 `script`, `iframe`, 이벤트 속성을 버리고, 내보내는 HTML은 모두 이스케이프합니다.
- 문법 강조 결과에서는 `span`의 class와 style만 남깁니다.

그래도 앱에서 꼭 해야 할 일이 있습니다.

1. **서버에서 다시 검사하세요.** 브라우저의 검사는 우회할 수 있습니다. 공격자는 에디터를 거치지 않고 문서 JSON이나 HTML을 서버로 바로 보낼 수 있으므로, 저장하거나 다른 사람에게 보여 줄 때 서버에서 `documentFromJSON` → `documentToHTML`로 다시 만들거나 HTML 정화 도구를 거치세요.
2. **Content-Security-Policy를 쓰세요.** 에디터는 인라인 스크립트나 `eval`이 필요 없습니다. 예: `Content-Security-Policy: script-src 'self'; object-src 'none'; base-uri 'none'`
3. **플러그인과 옵션은 믿을 수 있는 코드만 넣으세요.** 플러그인, `highlightCode`, `uploadImage`는 앱의 코드로 실행됩니다. 플러그인의 `toHTML`, `render`, `attributes`에 문서 데이터(블록·서식 attrs)를 넣을 때는 직접 이스케이프하고, `style`, `srcdoc`, `srcset`에는 넣지 마세요.

공동 편집에서는 다른 사람이 보낸 문서와 이름도 남이 쓴 데이터입니다. 이름은 글자로만 보이고 커서 색은 CSS 색만 받지만, 누가 어떤 문서에 들어올 수 있는지는 Yjs 서버에서 정하고, 저장할 때는 위의 1번처럼 서버에서 검사하세요.

Trusted Publishing으로 바꾼 뒤 배포하는 버전에는 GitHub Actions에서 빌드됐다는 provenance 서명이 붙습니다(`npm audit signatures`로 확인).
취약점은 [SECURITY.md](SECURITY.md)의 방법으로 비공개 신고해 주세요.

---

## 🛠️ 개발에 참여하기

Levit은 TDD로 개발하며, 단위 테스트와 실제 Chrome에서 도는 E2E 테스트를 푸시와 PR마다 GitHub Actions가 실행합니다.
개발 환경과 테스트 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

---

## 📄 라이선스 (License)

본 프로젝트는 [MIT License](LICENSE)에 따라 배포됩니다.
