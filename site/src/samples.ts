// The documents the playground starts with, as Markdown, in each language.
import type { Lang } from '../lib/strings';

export interface Samples {
  write: string;
  ai: string;
  together: string;
  comments: string;
}

const en: Samples = {
  write: `## Field notes

Levit keeps your writing as **blocks**: headings, lists, quotes, code and more. Type \`/\` on an empty line to pick one, or select words to make them *italic*, **bold** or a [link](https://github.com/azusawa/levit).

- [x] Try the slash menu
- [ ] Turn this line into a heading with \`# \`
- [ ] Paste something from another page

> Good editors get out of the way.

\`\`\`ts
const editor = createLevitEditor(el);
editor.getJSON();
\`\`\``,
  ai: `## Launch note

our new editor is very fast and it have no dependencies so its easy to add to the app.

Teams can write together, leave comments and ask AI for help without leaving the page.`,
  together: `## Meeting notes

- Agenda: the 0.7 plan
- Decide who writes the docs

Write here and watch the other side.`,
  comments: `## Draft: release notes

Levit 0.6 adds real-time collaboration, comments and Japanese menus. Typing in a 20,000-block document now takes about 5 ms of script per key.

The new package @yonailab/levit-yjs connects the editor to Yjs.`,
};

const ko: Samples = {
  write: `## 작업 노트

Levit은 글을 **블록**으로 다룹니다. 제목, 목록, 인용, 코드 같은 것들입니다. 빈 줄에서 \`/\`를 눌러 블록을 고르거나, 글자를 골라 *기울임*, **굵게**, [링크](https://github.com/azusawa/levit)로 바꿔 보세요.

- [x] 슬래시 메뉴 써 보기
- [ ] 줄 앞에 \`# \`를 써서 제목으로 바꾸기
- [ ] 다른 페이지의 글 붙여 넣어 보기

> 좋은 에디터는 글쓰기를 방해하지 않습니다.

\`\`\`ts
const editor = createLevitEditor(el);
editor.getJSON();
\`\`\``,
  ai: `## 출시 안내

우리 새 에디터는 매우 빠르고 의존성이 없어서 앱에 넣기가 아주 쉽습니다 그리고 가볍습니다.

팀은 페이지를 떠나지 않고 함께 쓰고, 댓글을 달고, AI에게 도움을 받을 수 있습니다.`,
  together: `## 회의 메모

- 안건: 0.7 계획
- 문서를 누가 쓸지 정하기

여기에 써 보고 반대쪽을 보세요.`,
  comments: `## 초안: 릴리스 노트

Levit 0.6에는 실시간 공동 편집, 댓글, 일본어 메뉴가 들어갑니다. 블록 2만 개짜리 문서에서 키 입력당 스크립트 시간이 약 5 ms로 줄었습니다.

새 패키지 @yonailab/levit-yjs가 에디터를 Yjs에 연결합니다.`,
};

const ja: Samples = {
  write: `## 作業メモ

Levitは文章を**ブロック**として扱います。見出し、リスト、引用、コードなどです。空の行で\`/\`を押してブロックを選ぶか、文字を選んで*斜体*、**太字**、[リンク](https://github.com/azusawa/levit)にしてみてください。

- [x] スラッシュメニューを試す
- [ ] 行頭に\`# \`と書いて見出しにする
- [ ] ほかのページの文章を貼り付けてみる

> よいエディターは書くことの邪魔をしません。

\`\`\`ts
const editor = createLevitEditor(el);
editor.getJSON();
\`\`\``,
  ai: `## リリースのお知らせ

私たちの新しいエディターはとても速いですし依存がないのでアプリに入れるのがとても簡単ですし軽いです。

チームはページを離れずに一緒に書き、コメントを残し、AIに手伝ってもらえます。`,
  together: `## 会議メモ

- 議題：0.7の計画
- ドキュメントを誰が書くか決める

ここに書いて、反対側を見てください。`,
  comments: `## 下書き：リリースノート

Levit 0.6ではリアルタイム共同編集、コメント、日本語メニューが加わります。2万ブロックの文書で、キー入力あたりのスクリプト時間が約5 msになりました。

新しいパッケージ@yonailab/levit-yjsがエディターとYjsをつなぎます。`,
};

export const samples: Record<Lang, Samples> = { en, ko, ja };
