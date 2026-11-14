// Every piece of text on the site outside the guide and docs Markdown, in
// each language. The keys must match across languages (tests/site checks it).

export type Lang = 'en' | 'ko' | 'ja';

const en = {
  langName: 'English',
  meta: {
    landingTitle: 'Levit — rich text editor, easy to write and light to develop',
    landingDescription:
      'A TypeScript rich text editor with a slash menu, Markdown, AI suggestions, comments and live collaboration. 30 kB core, 0 runtime dependencies. Try it in the page.',
    guideTitle: 'Using the editor — Levit',
    guideDescription: 'How to write, format, comment and work together in an editor built with Levit: menus, Markdown shortcuts and keys.',
    docsTitle: 'Developer docs — Levit',
    docsDescription: 'Install Levit, embed it with plain JavaScript, React or Vue, read and save JSON, and add AI, comments and Yjs collaboration.',
  },
  nav: {
    home: 'Levit home',
    guide: 'Guide',
    docs: 'Docs',
    github: 'GitHub',
    language: 'Language',
    cta: 'Get started',
  },
  hero: {
    title: 'Easy to write. Light to develop.',
    lead: 'A web editor with a slash menu, Markdown, AI suggestions, comments and live collaboration. The core is 30 kB and installs nothing else. Try every part of it right here.',
    copy: 'Copy',
    copied: 'Copied',
    copyLabel: 'Copy the install command',
  },
  playground: {
    label: 'Try Levit',
    tabs: { write: 'Write', ai: 'AI', together: 'Together', comments: 'Comments' },
    hints: {
      write: 'Type “/” for blocks, select text for formatting, or start a line with “# ” or “- [ ] ”.',
      ai: 'Select a sentence and improve it, or put the caret at the end and continue. Answers are canned; no AI service is called.',
      together: 'Two people, one document. Type on either side and watch the other cursor follow.',
      comments: 'Select some text and press 💬, or the button below. Click a comment to find its text.',
    },
    ai: { improve: 'Improve selection', continue: 'Continue writing', summarize: 'Summarize', stop: 'Stop' },
    together: { left: 'Mina', right: 'Joon' },
    comments: {
      add: 'Comment on selection',
      title: 'Comments',
      empty: 'No comments yet.',
      remove: 'Resolve',
      author: 'You',
      notes: ['Can we say this more simply?', 'Source for this number?', 'Love this line.'],
    },
    theme: 'Dark',
    menus: 'Menu language',
  },
  formats: {
    heading: 'One document, three formats.',
    lead: 'Type below. Levit keeps a JSON document and writes it out as Markdown and HTML.',
    inputLabel: 'Type text with Markdown',
    initial: 'Ship **bold** ideas with `code`',
    examples: ['# A heading to remember', '- [ ] Write the release notes', 'Read the [docs](https://azusawa.github.io/levit/docs/)'],
    examplesLabel: 'Try another line',
  },
  features: {
    heading: 'What comes in the box',
    switchOn: 'Show details',
    fragments: {
      big: 'This editor holds 20,000 blocks. Type anywhere in it.',
      bigLoading: 'Loading 20,000 blocks…',
      pasted: 'Pasted',
      kept: 'Kept',
      tested: 'Tested on every change',
    },
    items: [
      { sentence: 'Levit is the only thing you install.', detail: '0 runtime dependencies: no other packages to trust, no version clashes · core 30 kB gzip · AI 7.5 kB · Yjs binding 5 kB' },
      { sentence: 'Long documents stay quick.', detail: '20,000 blocks · about 5 ms of script per key, near a plain contenteditable' },
      { sentence: 'Menus speak three languages.', detail: 'English, Korean and Japanese built in · screen-reader labels · Alt+F10 to the toolbar' },
      { sentence: 'Pasted HTML is cleaned up.', detail: 'Scripts, event handlers and javascript: links are dropped · validateDocument() for the server' },
      { sentence: 'Old browsers are welcome.', detail: 'Chrome 87, Edge 88, Firefox 78, Safari 14 and later · tested in Chrome, Firefox and WebKit' },
    ],
  },
  steps: {
    heading: 'From install to editor',
    items: [
      'First, install one package.',
      'Then mount it on any element.',
      'Save the document as JSON.',
      'Add AI, comments or Yjs later.',
    ],
  },
  list: {
    heading: 'Packages and support',
    groups: {
      packages: 'Packages',
      read: 'Read more',
    },
    packages: {
      core: 'The editor',
      react: 'React 18 and 19',
      vue: 'Vue 3',
      yjs: 'Yjs 13.6 and later',
    },
    read: {
      guide: 'Guide for writers',
      docs: 'Developer docs',
      llms: 'llms.txt for AI tools',
      github: 'Source and issues',
    },
  },
  faq: {
    heading: 'Questions',
    items: [
      { q: 'Is Levit free to use?', a: 'Yes. It is open source under the MIT licence, for personal and commercial projects.' },
      { q: 'Which frameworks does it work with?', a: 'Any. Use the <levit-editor> element or createLevitEditor() in plain JavaScript, Svelte or Angular; React and Vue have their own packages.' },
      { q: 'What should I store: HTML or JSON?', a: 'Store the JSON document. It is versioned and can be validated; HTML and Markdown are for display and export, and can be read back in.' },
      { q: 'Is it safe to show what users write?', a: 'Levit drops scripts, event handlers and unsafe links when it reads or pastes HTML. Still validate documents on the server with validateDocument() and use a Content Security Policy.' },
      { q: 'Does the AI feature call a service?', a: 'No. You pass a provider function that returns the model’s answer as a stream of Markdown, so you choose the model and keep the key on your server.' },
      { q: 'Do I need a server to write together?', a: 'Levit binds to Yjs, which syncs over any Yjs provider: y-websocket, y-webrtc, or your own. The demo on this page syncs two editors in the browser.' },
      { q: 'Does it handle Korean and Japanese input?', a: 'Yes. IME composition is handled throughout, including while changes from other people arrive.' },
      { q: 'Is it ready for production?', a: 'Levit is at 0.6. The API can still change between minor versions; each change is listed in the release notes, and security fixes go to the two latest minor versions.' },
    ],
  },
  footer: {
    statement: 'Levit is a rich text editor, made in the open.',
    legal: 'MIT licence · © yonailab',
    version: 'Version',
    released: 'Released 10 November 2026',
    issues: 'Report an issue',
    invite: 'Read the docs',
  },
  doc: {
    onThisPage: 'On this page',
    edit: 'Edit this page on GitHub',
    skip: 'Skip to content',
  },
};

export type SiteStrings = typeof en;

const ko: SiteStrings = {
  langName: '한국어',
  meta: {
    landingTitle: 'Levit — 쓰기 편하고 개발은 가벼운 리치 텍스트 에디터',
    landingDescription:
      '슬래시 메뉴, Markdown, AI 제안, 댓글, 실시간 공동 편집을 갖춘 TypeScript 리치 텍스트 에디터. 본체 30 kB, 런타임 의존성 0개. 페이지에서 바로 써 보세요.',
    guideTitle: '에디터 사용법 — Levit',
    guideDescription: 'Levit으로 만든 에디터에서 글을 쓰고, 서식을 넣고, 댓글을 달고, 함께 쓰는 방법: 메뉴, Markdown 단축 입력, 단축키.',
    docsTitle: '개발 문서 — Levit',
    docsDescription: 'Levit을 설치하고 JavaScript, React, Vue에 붙이는 방법, JSON 읽기·저장, AI·댓글·Yjs 공동 편집 추가하기.',
  },
  nav: {
    home: 'Levit 홈',
    guide: '사용법',
    docs: '개발 문서',
    github: 'GitHub',
    language: '언어',
    cta: '시작하기',
  },
  hero: {
    title: '쓰기는 편하게, 개발은 가볍게',
    lead: '슬래시 메뉴, Markdown, AI 제안, 댓글, 실시간 공동 편집을 갖춘 웹 에디터입니다. 본체는 30 kB이고 함께 설치되는 패키지가 없습니다. 모든 기능을 여기서 바로 써 보세요.',
    copy: '복사',
    copied: '복사됨',
    copyLabel: '설치 명령 복사',
  },
  playground: {
    label: 'Levit 써 보기',
    tabs: { write: '쓰기', ai: 'AI', together: '함께 쓰기', comments: '댓글' },
    hints: {
      write: '“/”를 누르면 블록 메뉴가, 글을 고르면 서식 메뉴가 나옵니다. 줄 첫머리에 “# ”나 “- [ ] ”를 써 보세요.',
      ai: '문장을 골라 다듬거나, 끝에 커서를 두고 이어 쓰게 해 보세요. 미리 써 둔 답이라 실제 AI는 부르지 않습니다.',
      together: '두 사람이 한 문서를 씁니다. 어느 쪽에 쓰든 다른 쪽 커서가 따라옵니다.',
      comments: '글을 골라 💬나 아래 버튼을 누르세요. 댓글을 누르면 그 글로 갑니다.',
    },
    ai: { improve: '고른 글 다듬기', continue: '이어 쓰기', summarize: '요약', stop: '멈추기' },
    together: { left: '민지', right: '준호' },
    comments: {
      add: '고른 글에 댓글',
      title: '댓글',
      empty: '아직 댓글이 없습니다.',
      remove: '해결',
      author: '나',
      notes: ['더 쉽게 말할 수 있을까요?', '이 숫자의 출처가 있나요?', '이 문장 좋네요.'],
    },
    theme: '다크',
    menus: '메뉴 언어',
  },
  formats: {
    heading: '문서 하나, 형식 셋',
    lead: '아래에 써 보세요. Levit은 JSON 문서를 들고 있다가 Markdown과 HTML로도 내보냅니다.',
    inputLabel: 'Markdown으로 글 쓰기',
    initial: '**굵은** 생각을 `코드`와 함께',
    examples: ['# 기억할 제목', '- [ ] 릴리스 노트 쓰기', '[문서](https://azusawa.github.io/levit/ko/docs/) 읽기'],
    examplesLabel: '다른 줄 넣어 보기',
  },
  features: {
    heading: '들어 있는 것',
    switchOn: '자세히 보기',
    fragments: {
      big: '이 에디터에는 블록이 2만 개 있습니다. 아무 데나 입력해 보세요.',
      bigLoading: '블록 2만 개를 불러오는 중…',
      pasted: '붙여 넣은 것',
      kept: '남은 것',
      tested: '바뀔 때마다 자동 테스트',
    },
    items: [
      { sentence: '설치하는 것은 Levit 하나뿐입니다.', detail: '런타임 의존성 0개: 믿어야 할 다른 패키지도, 버전 충돌도 없음 · 본체 30 kB(gzip) · AI 7.5 kB · Yjs 연결 5 kB' },
      { sentence: '긴 문서에서도 빠릅니다.', detail: '블록 2만 개 · 키 입력당 스크립트 약 5 ms, 일반 contenteditable과 비슷' },
      { sentence: '메뉴가 세 언어로 나옵니다.', detail: '영어·한국어·일본어 기본 제공 · 스크린 리더 레이블 · Alt+F10으로 도구 모음' },
      { sentence: '붙여 넣은 HTML은 걸러 냅니다.', detail: '스크립트, 이벤트 핸들러, javascript: 링크 제거 · 서버용 validateDocument()' },
      { sentence: '오래된 브라우저도 됩니다.', detail: 'Chrome 87, Edge 88, Firefox 78, Safari 14 이상 · Chrome·Firefox·WebKit 자동 테스트' },
    ],
  },
  steps: {
    heading: '설치에서 에디터까지',
    items: [
      '먼저 패키지 하나를 설치합니다.',
      '아무 요소에나 붙입니다.',
      '문서는 JSON으로 저장합니다.',
      'AI, 댓글, Yjs는 나중에 더합니다.',
    ],
  },
  list: {
    heading: '패키지와 지원',
    groups: {
      packages: '패키지',
      read: '더 읽기',
    },
    packages: {
      core: '에디터 본체',
      react: 'React 18, 19',
      vue: 'Vue 3',
      yjs: 'Yjs 13.6 이상',
    },
    read: {
      guide: '글 쓰는 사람을 위한 사용법',
      docs: '개발 문서',
      llms: 'AI 도구용 llms.txt',
      github: '소스와 이슈',
    },
  },
  faq: {
    heading: '자주 묻는 질문',
    items: [
      { q: '무료로 쓸 수 있나요?', a: '네. MIT 라이선스 오픈 소스라 개인·상업 프로젝트 모두에 쓸 수 있습니다.' },
      { q: '어떤 프레임워크와 쓸 수 있나요?', a: '어디에나 쓸 수 있습니다. 일반 JavaScript, Svelte, Angular에서는 <levit-editor> 요소나 createLevitEditor()를 쓰고, React와 Vue는 전용 패키지가 있습니다.' },
      { q: 'HTML과 JSON 중 무엇을 저장해야 하나요?', a: 'JSON 문서를 저장하세요. 버전이 있고 검증할 수 있습니다. HTML과 Markdown은 보여 주거나 내보낼 때 쓰고, 다시 읽어 들일 수도 있습니다.' },
      { q: '사용자가 쓴 글을 그대로 보여 줘도 안전한가요?', a: 'Levit은 HTML을 읽거나 붙여 넣을 때 스크립트, 이벤트 핸들러, 위험한 링크를 걸러 냅니다. 그래도 서버에서 validateDocument()로 검사하고 콘텐츠 보안 정책(CSP)을 함께 쓰세요.' },
      { q: 'AI 기능이 외부 서비스를 부르나요?', a: '아니요. 모델의 답을 Markdown 스트림으로 돌려주는 함수(provider)를 직접 넘기므로, 모델은 고르고 키는 서버에 둘 수 있습니다.' },
      { q: '함께 쓰려면 서버가 필요한가요?', a: 'Levit은 Yjs에 연결되고, Yjs는 y-websocket, y-webrtc나 직접 만든 연결 어디로든 동기화됩니다. 이 페이지의 시연은 브라우저 안에서 두 에디터를 잇습니다.' },
      { q: '한글과 일본어 입력도 잘 되나요?', a: '네. IME 조합 입력을 처음부터 끝까지 다루고, 조합 중에 다른 사람의 변경이 들어와도 깨지지 않습니다.' },
      { q: '실서비스에 써도 되나요?', a: '지금은 0.6입니다. 마이너 버전 사이에 API가 바뀔 수 있고, 바뀐 점은 릴리스 노트에 모두 적습니다. 보안 수정은 최신 두 마이너 버전에 적용합니다.' },
    ],
  },
  footer: {
    statement: 'Levit은 공개적으로 만드는 리치 텍스트 에디터입니다.',
    legal: 'MIT 라이선스 · © yonailab',
    version: '버전',
    released: '2026년 11월 10일 출시',
    issues: '문제 알리기',
    invite: '문서 읽기',
  },
  doc: {
    onThisPage: '이 페이지에서',
    edit: 'GitHub에서 이 페이지 고치기',
    skip: '본문으로 건너뛰기',
  },
};

const ja: SiteStrings = {
  langName: '日本語',
  meta: {
    landingTitle: 'Levit — 書きやすく、開発も軽いリッチテキストエディター',
    landingDescription:
      'スラッシュメニュー、Markdown、AIの提案、コメント、リアルタイム共同編集を備えたTypeScript製リッチテキストエディター。本体30 kB、ランタイム依存0個。ページ上で試せます。',
    guideTitle: 'エディターの使い方 — Levit',
    guideDescription: 'Levitで作られたエディターで書く、書式を付ける、コメントする、一緒に書く方法：メニュー、Markdownショートカット、キー操作。',
    docsTitle: '開発者ドキュメント — Levit',
    docsDescription: 'Levitのインストール、JavaScript・React・Vueへの組み込み、JSONの読み書き、AI・コメント・Yjs共同編集の追加。',
  },
  nav: {
    home: 'Levit ホーム',
    guide: '使い方',
    docs: 'ドキュメント',
    github: 'GitHub',
    language: '言語',
    cta: 'はじめる',
  },
  hero: {
    title: '書くのは心地よく、開発は軽く。',
    lead: 'スラッシュメニュー、Markdown、AIの提案、コメント、リアルタイム共同編集を備えたWebエディターです。本体は30 kBで、ほかに何もインストールされません。すべてこの場で試せます。',
    copy: 'コピー',
    copied: 'コピーしました',
    copyLabel: 'インストールコマンドをコピー',
  },
  playground: {
    label: 'Levitを試す',
    tabs: { write: '書く', ai: 'AI', together: '共同編集', comments: 'コメント' },
    hints: {
      write: '「/」でブロック、文字を選ぶと書式メニュー。行頭に「# 」や「- [ ] 」と入力してみてください。',
      ai: '文を選んで整えるか、末尾にカーソルを置いて続きを書かせてみてください。用意した回答なので、実際のAIは呼びません。',
      together: '二人で一つの文書を書きます。どちらに書いても、もう一方のカーソルが追いかけます。',
      comments: '文字を選んで💬か下のボタンを押してください。コメントを押すとその箇所に移動します。',
    },
    ai: { improve: '選択を整える', continue: '続きを書く', summarize: '要約', stop: '止める' },
    together: { left: 'さくら', right: 'はると' },
    comments: {
      add: '選択にコメント',
      title: 'コメント',
      empty: 'まだコメントはありません。',
      remove: '解決',
      author: 'あなた',
      notes: ['もっと簡単に言えますか？', 'この数字の出典は？', 'この一文、いいですね。'],
    },
    theme: 'ダーク',
    menus: 'メニューの言語',
  },
  formats: {
    heading: '一つの文書、三つの形式',
    lead: '下に書いてみてください。LevitはJSONの文書を持ち、MarkdownとHTMLにも書き出します。',
    inputLabel: 'Markdownで書く',
    initial: '**太字**のアイデアを`コード`と一緒に',
    examples: ['# 覚えておく見出し', '- [ ] リリースノートを書く', '[ドキュメント](https://azusawa.github.io/levit/ja/docs/)を読む'],
    examplesLabel: '別の行を入れてみる',
  },
  features: {
    heading: '入っているもの',
    switchOn: '詳しく見る',
    fragments: {
      big: 'このエディターには2万ブロックあります。どこでも入力してみてください。',
      bigLoading: '2万ブロックを読み込み中…',
      pasted: '貼り付けたもの',
      kept: '残ったもの',
      tested: '変更のたびに自動テスト',
    },
    items: [
      { sentence: 'インストールするのはLevitだけ。', detail: 'ランタイム依存0個：信頼すべきほかのパッケージもバージョン衝突もなし · 本体30 kB（gzip） · AI 7.5 kB · Yjs連携5 kB' },
      { sentence: '長い文書でも速いままです。', detail: '2万ブロック · キー入力あたりのスクリプト約5 ms、通常のcontenteditableとほぼ同じ' },
      { sentence: 'メニューは三つの言語で。', detail: '英語・韓国語・日本語を標準搭載 · スクリーンリーダー用ラベル · Alt+F10でツールバーへ' },
      { sentence: '貼り付けたHTMLはきれいに。', detail: 'スクリプト、イベントハンドラー、javascript:リンクを除去 · サーバー用のvalidateDocument()' },
      { sentence: '古いブラウザでも動きます。', detail: 'Chrome 87、Edge 88、Firefox 78、Safari 14以降 · Chrome・Firefox・WebKitで自動テスト' },
    ],
  },
  steps: {
    heading: 'インストールからエディターまで',
    items: [
      'まずパッケージを一つ入れます。',
      'どの要素にでも取り付けます。',
      '文書はJSONで保存します。',
      'AI、コメント、Yjsは後から。',
    ],
  },
  list: {
    heading: 'パッケージと対応環境',
    groups: {
      packages: 'パッケージ',
      read: 'さらに読む',
    },
    packages: {
      core: 'エディター本体',
      react: 'React 18・19',
      vue: 'Vue 3',
      yjs: 'Yjs 13.6以降',
    },
    read: {
      guide: '書く人のための使い方',
      docs: '開発者ドキュメント',
      llms: 'AIツール向けllms.txt',
      github: 'ソースとIssue',
    },
  },
  faq: {
    heading: 'よくある質問',
    items: [
      { q: '無料で使えますか？', a: 'はい。MITライセンスのオープンソースなので、個人・商用どちらのプロジェクトにも使えます。' },
      { q: 'どのフレームワークで使えますか？', a: 'どれでも使えます。素のJavaScript、Svelte、Angularでは<levit-editor>要素かcreateLevitEditor()を使い、ReactとVueには専用パッケージがあります。' },
      { q: 'HTMLとJSON、どちらを保存すべきですか？', a: 'JSONの文書を保存してください。バージョンがあり、検証もできます。HTMLとMarkdownは表示や書き出しに使い、読み込み直すこともできます。' },
      { q: 'ユーザーが書いた内容をそのまま表示して安全ですか？', a: 'LevitはHTMLの読み込みや貼り付けの際に、スクリプト、イベントハンドラー、危険なリンクを取り除きます。それでもサーバーでvalidateDocument()による検証を行い、コンテンツセキュリティポリシー（CSP）も併用してください。' },
      { q: 'AI機能は外部サービスを呼びますか？', a: 'いいえ。モデルの回答をMarkdownのストリームで返す関数（provider）を渡すので、モデルは自由に選べ、キーはサーバーに置けます。' },
      { q: '共同編集にはサーバーが必要ですか？', a: 'LevitはYjsにつながり、Yjsはy-websocket、y-webrtc、独自の接続など任意のプロバイダーで同期します。このページのデモはブラウザ内で二つのエディターをつないでいます。' },
      { q: '日本語や韓国語の入力は大丈夫ですか？', a: 'はい。IMEの変換入力を最初から最後まで扱い、変換中にほかの人の変更が届いても崩れません。' },
      { q: '本番で使えますか？', a: '現在は0.6です。マイナーバージョン間でAPIが変わることがあり、変更点はすべてリリースノートに記載します。セキュリティ修正は最新の二つのマイナーバージョンに適用します。' },
    ],
  },
  footer: {
    statement: 'Levitはオープンに開発しているリッチテキストエディターです。',
    legal: 'MITライセンス · © yonailab',
    version: 'バージョン',
    released: '2026年11月10日リリース',
    issues: '問題を報告',
    invite: 'ドキュメントを読む',
  },
  doc: {
    onThisPage: 'このページの内容',
    edit: 'GitHubでこのページを編集',
    skip: '本文へスキップ',
  },
};

export const strings: Record<Lang, SiteStrings> = { en, ko, ja };
