# Levit (레빗)

[![CI](https://github.com/azusawa/levit/actions/workflows/ci.yml/badge.svg)](https://github.com/azusawa/levit/actions/workflows/ci.yml)

<p align="center">
  <img src="./logo.svg" alt="Levit Logo" width="80"/>
  <br />
  <strong>심플하고 모던한 완성형 웹 에디터 (Zero-Dependency & AI-Ready)</strong>
  <br />
  <i>가져다 쓰기 가장 편하고, 확장하기 쉬운 독립 코어 엔진</i>
</p>

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
   - 번들 크기: **약 22 kB (gzipped)** 로 로딩 속도가 극도로 빠릅니다.
2. **가져다 쓰기 가장 쉬운 구조 (DX & AX First)**
   - 단 3줄의 코드로 모든 웹사이트에 연동 가능합니다.
   - `<levit-editor></levit-editor>` 웹 컴포넌트를 지원하여 React, Vue, Svelte, 바닐라 JS 어디서나 HTML 태그 하나로 동작합니다.
3. **AI-Native 설계 (AI 친화적)**
   - 결정론적이고 단순한 JSON 스키마를 지원하여 LLM이 문서를 분석하고 생성하기 매우 쉽습니다.
   - LLM 토큰 응답을 실시간으로 입력해 주는 `streamAIResponse()` 내장.
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
   - Chrome, Firefox, Safari(WebKit)에서 자동 테스트로 확인합니다.

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
createSlashMenu(editor);
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

---

## 🤖 AI 연동 (AI-Native Integration)

LLM 스트리밍 응답을 에디터에 타이핑하듯 실시간으로 주입할 수 있습니다:

```ts
import { streamAIResponse, getAIContext } from '@yonailab/levit';

// 1. 현재 에디터 컨텍스트 추출 (LLM 프롬프트에 삽입)
const context = getAIContext(editor);
console.log(context.documentText);

// 2. LLM 스트리밍 토큰 실시간 렌더링
async function* fetchLLMStream() {
  const chunks = ['안녕하세요! ', 'AI가 ', '실시간으로 작성하는 내용입니다.'];
  for (const chunk of chunks) {
    yield chunk;
    await new Promise((r) => setTimeout(r, 100));
  }
}

await streamAIResponse(editor, fetchLLMStream());
```

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

## 🎨 모던 테마 및 커스터마이징

CSS 변수(`--levit-*`)를 통해 디자인을 완벽히 커스터마이징할 수 있습니다:

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

---

## 🛠️ 개발에 참여하기

Levit은 TDD로 개발하며, 단위 테스트와 실제 Chrome에서 도는 E2E 테스트를 푸시와 PR마다 GitHub Actions가 실행합니다.
개발 환경과 테스트 방법은 [CONTRIBUTING.md](CONTRIBUTING.md)를 보세요.

---

## 📄 라이선스 (License)

본 프로젝트는 [MIT License](LICENSE)에 따라 배포됩니다.
