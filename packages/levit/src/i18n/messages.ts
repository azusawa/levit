/**
 * Text the editor shows or reads out: menus, prompts and labels for screen
 * readers. Pass a full set (like `ko`) or only the ones to change as the
 * `messages` option. `{name}` is filled in where a message takes a value.
 */
export const en = {
  editorLabel: 'Rich text editor',
  placeholder: 'Type something or press "/" for commands...',

  // Bubble menu
  formattingToolbar: 'Formatting',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strikethrough: 'Strikethrough',
  highlight: 'Highlight',
  code: 'Code',
  link: 'Link',
  linkUrl: 'Link URL',
  linkPlaceholder: 'https://example.com',
  quote: 'Quote',

  // Slash menu
  slashMenuLabel: 'Insert a block',
  paragraph: 'Text',
  paragraphDescription: 'Plain body text',
  heading1: 'Heading 1',
  heading1Description: 'Large section heading',
  heading2: 'Heading 2',
  heading2Description: 'Medium section heading',
  heading3: 'Heading 3',
  heading3Description: 'Small subsection heading',
  quoteDescription: 'Capture a quote or citation',
  codeBlock: 'Code Block',
  codeBlockDescription: 'Code snippet with syntax format',
  bulletList: 'Bulleted List',
  bulletListDescription: 'Simple list with bullets',
  orderedList: 'Numbered List',
  orderedListDescription: 'List numbered in order',
  taskList: 'To-do List',
  taskListDescription: 'Track tasks with checkboxes',
  divider: 'Divider',
  dividerDescription: 'A line between sections',
  image: 'Image',
  imageDescription: 'Upload an image or add one by URL',
  imageUrlPrompt: 'Image URL',

  // Blocks
  markDone: 'Mark as done',
  markNotDone: 'Mark as not done',
  codeLanguagePrompt: 'Code language',
  codeLanguageLabel: 'Language: {language}',
  setCodeLanguage: 'Set language',
  plainText: 'Plain text',

  // AI plugin
  aiImprove: 'Improve writing',
  aiImproveDescription: 'Fix and polish the selected text',
  aiContinue: 'Continue writing',
  aiContinueDescription: 'Let AI write on from here',
  aiSummarize: 'Summarize',
  aiSummarizeDescription: 'Summary of the selection or document',
  suggestionToolbar: 'AI suggestion',
  suggestionAccept: 'Accept',
  suggestionReject: 'Reject',
};

export type LevitMessages = typeof en;

export const ko: LevitMessages = {
  editorLabel: '서식 있는 글 편집기',
  placeholder: '내용을 입력하거나 "/" 키로 명령을 여세요...',

  formattingToolbar: '서식',
  bold: '굵게',
  italic: '기울임',
  underline: '밑줄',
  strikethrough: '취소선',
  highlight: '형광펜',
  code: '코드',
  link: '링크',
  linkUrl: '링크 주소',
  linkPlaceholder: 'https://example.com',
  quote: '인용',

  slashMenuLabel: '블록 넣기',
  paragraph: '본문',
  paragraphDescription: '일반 문단',
  heading1: '제목 1',
  heading1Description: '큰 제목',
  heading2: '제목 2',
  heading2Description: '중간 제목',
  heading3: '제목 3',
  heading3Description: '작은 제목',
  quoteDescription: '인용문이나 출처',
  codeBlock: '코드 블록',
  codeBlockDescription: '코드 조각',
  bulletList: '글머리표 목록',
  bulletListDescription: '점으로 표시하는 목록',
  orderedList: '번호 목록',
  orderedListDescription: '순서대로 번호를 매기는 목록',
  taskList: '체크리스트',
  taskListDescription: '체크 상자로 할 일 관리',
  divider: '구분선',
  dividerDescription: '단락 사이의 가로줄',
  image: '이미지',
  imageDescription: '이미지를 올리거나 URL로 넣기',
  imageUrlPrompt: '이미지 URL',

  markDone: '완료로 표시',
  markNotDone: '미완료로 표시',
  codeLanguagePrompt: '코드 언어',
  codeLanguageLabel: '언어: {language}',
  setCodeLanguage: '언어 지정',
  plainText: '일반 텍스트',

  aiImprove: '글 다듬기',
  aiImproveDescription: '선택한 글을 고치고 다듬기',
  aiContinue: '이어 쓰기',
  aiContinueDescription: '여기서부터 AI가 이어서 쓰기',
  aiSummarize: '요약',
  aiSummarizeDescription: '선택한 부분이나 문서 전체 요약',
  suggestionToolbar: 'AI 제안',
  suggestionAccept: '받아들이기',
  suggestionReject: '거절하기',
};

/** Built-in message sets, by language code. */
export const locales: Record<string, LevitMessages> = { en, ko };

/** Fills `{name}` placeholders in a message. */
export function format(message: string, values: Record<string, string> = {}): string {
  return message.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
}
