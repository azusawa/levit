# Levit (레빗)

<p align="center">
  <img src="./logo.svg" alt="Levit Logo" width="80"/>
  <br />
  <strong>심플하고 모던한 완성형 웹 에디터 (Zero-Dependency & AI-Ready)</strong>
  <br />
  <i>가져다 쓰기 가장 편하고, 확장하기 쉬우며, 저작권 이슈가 전혀 없는 독립 코어 엔진</i>
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
   - 번들 크기: **약 12 kB (gzipped)** 로 로딩 속도가 극도로 빠릅니다.
2. **100% 자체 저작권 & 상업적 이용 안전성 (Clean IP)**
   - 타 오픈소스 라이브러리의 코드를 한 줄도 복사하지 않은 완전한 Clean-room 설계입니다.
   - 향후 상업적 판매, 유료 기능 도입, Open-Core 비즈니스 모델로의 확장에 법적 제약이 전혀 없습니다.
3. **가져다 쓰기 가장 쉬운 구조 (DX & AX First)**
   - 단 3줄의 코드로 모든 웹사이트에 연동 가능합니다.
   - `<levit-editor></levit-editor>` 웹 컴포넌트를 지원하여 React, Vue, Svelte, 바닐라 JS 어디서나 HTML 태그 하나로 동작합니다.
4. **AI-Native 설계 (AI 친화적)**
   - 결정론적이고 단순한 JSON 스키마를 지원하여 LLM이 문서를 분석하고 생성하기 매우 쉽습니다.
   - LLM 토큰 응답을 실시간으로 입력해 주는 `streamAIResponse()` 내장.
   - AI 코딩 에이전트(Cursor, Antigravity, Copilot 등)를 위한 `llms.txt` 표준 지원.
5. **하이브리드 편집 경험 (Modern Hybrid UX)**
   - Notion 스타일의 **슬래시(`/`) 커맨드 메뉴**
   - 텍스트 선택 시 부드럽게 나타나는 **플로팅 버블 툴바 (Floating Bubble Toolbar)** — 굵게·기울임·밑줄·코드·**링크**·제목·인용
   - **글머리표 / 번호 목록** (Enter로 다음 항목, 빈 항목에서 Enter 또는 맨 앞 Backspace로 목록 종료)
   - `# `, `> `, ` ``` `, `- `, `* `, `1. ` 실시간 마크다운 단축키 자동 변환
   - 한글(CJK) IME 조합 중 글자 중복 입력 현상 완벽 방어

---

## 🚀 빠른 시작 (Quick Start)

### 1. 설치
```bash
npm install levit
```

### 2. Vanilla JS / TypeScript에서 사용
```ts
import { createLevitEditor, createBubbleMenu, createSlashMenu } from 'levit';
import 'levit/levit.css';

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

---

## 🧩 웹 컴포넌트 (`<levit-editor>`)

별도의 번들러 설정 없이 HTML 파일에 직접 삽입할 수 있습니다:

```html
<!-- CDN 링크 삽입 -->
<script type="module" src="https://unpkg.com/levit/dist/index.js"></script>
<link rel="stylesheet" href="https://unpkg.com/levit/dist/levit.css">

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
import { streamAIResponse, getAIContext } from 'levit';

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
} from 'levit';

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

## 🧪 테스트 (TDD)

모든 코드는 TDD 방식으로 엄격하게 검증되었습니다:

```bash
# 전체 단위 테스트 실행 (Vitest)
npm run test

# 라이브러리 빌드 및 타입 선언 파일 생성
npm run build
```

---

## 📄 라이선스 (License)

본 프로젝트는 [MIT License](LICENSE)에 따라 배포됩니다.
완전한 Clean-room 독자 구현으로 상업적 서비스 탑재, 재배포 및 유료 확장이 모두 자유롭습니다.
