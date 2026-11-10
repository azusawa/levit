// A stand-in AI provider for the playground: answers are written in advance
// or made from the text itself, and streamed like a real model's. Nothing is
// sent anywhere.
import type { Lang } from '../lib/strings';
import { samples } from './samples';

interface Request {
  command: string;
  text: string;
  signal: AbortSignal;
}

const improved: Record<Lang, string> = {
  en: 'Our new editor is fast and has no dependencies, so it is easy to add to any app.',
  ko: '새 에디터는 빠르고 가벼우며 의존성이 없어, 어떤 앱에도 쉽게 넣을 수 있습니다.',
  ja: '新しいエディターは速くて軽く、依存もないので、どんなアプリにも簡単に組み込めます。',
};

const continued: Record<Lang, string> = {
  en: ' Start with the web component, keep the document as JSON, and add **AI**, comments or live collaboration when your users ask for them.',
  ko: ' 웹 컴포넌트로 시작해 문서는 JSON으로 저장하고, 사용자가 원할 때 **AI**, 댓글, 실시간 공동 편집을 더하면 됩니다.',
  ja: ' Webコンポーネントから始めて文書はJSONで保存し、ユーザーが求めたら**AI**、コメント、リアルタイム共同編集を加えましょう。',
};

/** Spacing, a capital letter and a final full stop. */
function tidy(text: string, lang: Lang): string {
  let out = text.replace(/\s+/g, ' ').replace(/\s+([,.!?])/g, '$1').trim();
  if (lang === 'en') out = out.charAt(0).toUpperCase() + out.slice(1);
  const stop = lang === 'ja' ? '。' : '.';
  return /[.!?。！？]$/.test(out) ? out : out + stop;
}

/** The first sentence of each paragraph, as a list. */
function summarize(markdown: string): string {
  return markdown
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p && !p.startsWith('#') && !p.startsWith('```'))
    .map((p) => `- ${(p.replace(/^[-*>]\s+/, '').match(/^.*?[.!?。！？](?=\s|$)/u) ?? [p])[0]}`)
    .join('\n');
}

function answer(lang: Lang, command: string, text: string): string {
  if (command === 'improve') {
    const sample = samples[lang].ai.split('\n\n')[1];
    return text.trim() === sample.trim() ? improved[lang] : tidy(text, lang);
  }
  if (command === 'summarize') return summarize(text);
  return continued[lang];
}

/** Splits an answer into pieces of a few characters, the way models stream. */
function pieces(text: string): string[] {
  return text.match(/[\s\S]{1,4}/gu) ?? [];
}

export function createFakeProvider(lang: Lang, { delay = 28 }: { delay?: number } = {}) {
  return async (request: Request): Promise<AsyncIterable<string>> => {
    const text = answer(lang, request.command, request.text);
    return (async function* () {
      for (const piece of pieces(text)) {
        if (request.signal.aborted) return;
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (request.signal.aborted) return;
        yield piece;
      }
    })();
  };
}
