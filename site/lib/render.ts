// Turns a Markdown page of the site (the guide, the docs) into HTML with
// Levit's own serializers, plus ids on the headings and a table of contents.
import { documentToHTML } from '../../packages/levit/src/serializers/html.ts';
import { markdownToDocument } from '../../packages/levit/src/serializers/markdown.ts';

export interface TocEntry {
  id: string;
  text: string;
  children?: TocEntry[];
}

export interface RenderedDoc {
  title: string;
  html: string;
  toc: TocEntry[];
}

const plainText = (content: { text: string }[]) => content.map((n) => n.text).join('');

/** A heading id that keeps letters of any script: "블록과 / 메뉴" → "블록과-메뉴". */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .trim()
      .replace(/[\s-]+/g, '-') || 'section'
  );
}

export function renderDoc(markdown: string): RenderedDoc {
  const doc = markdownToDocument(markdown);
  const first = doc.blocks[0];
  const hasTitle = first?.type === 'heading' && first.attrs?.level === 1;
  const title = hasTitle ? plainText(first.content) : '';
  const blocks = hasTitle ? doc.blocks.slice(1) : doc.blocks;

  const used = new Map<string, number>();
  const unique = (base: string) => {
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };

  const toc: TocEntry[] = [];
  const ids: string[] = [];
  for (const block of blocks) {
    if (block.type !== 'heading' || (block.attrs?.level ?? 1) > 3) continue;
    const text = plainText(block.content);
    const id = unique(slugify(text));
    ids.push(id);
    if (block.attrs?.level === 2) toc.push({ id, text, children: [] });
    else if (block.attrs?.level === 3) toc[toc.length - 1]?.children!.push({ id, text });
  }

  let next = 0;
  const html = documentToHTML({ ...doc, blocks })
    // Ids go on h2 and h3 in document order, the same order as above.
    .replace(/<h([23])>/g, (_m, level) => `<h${level} id="${ids[next++]}">`)
    .replace(/<pre><code class="language-([\w+#-]+)">/g, '<pre data-language="$1"><code class="language-$1">');

  return { title, html, toc };
}
