import { BlockNode, DocumentData, InlineNode } from '../core/model/types.js';
import { createBlock, createDocument, createTextNode } from '../core/model/document.js';

export function documentToJSON(doc: DocumentData): DocumentData {
  return {
    version: doc.version || 1,
    blocks: doc.blocks.map((block) => ({
      id: block.id,
      type: block.type,
      attrs: { ...block.attrs },
      content: block.content.map((c) => ({
        text: c.text,
        marks: c.marks ? [...c.marks] : [],
      })),
    })),
  };
}

export function documentFromJSON(json: any): DocumentData {
  if (!json || typeof json !== 'object' || !Array.isArray(json.blocks) || json.blocks.length === 0) {
    return createDocument();
  }

  const blocks: BlockNode[] = json.blocks.map((b: any) => {
    const content: InlineNode[] = Array.isArray(b.content) && b.content.length > 0
      ? b.content.map((c: any) => ({
          text: String(c.text || ''),
          marks: Array.isArray(c.marks)
            ? c.marks.map((m: any) => ({
                type: String(m.type || ''),
                attrs: m.attrs ? { ...m.attrs } : undefined,
              }))
            : [],
        }))
      : [createTextNode('')];

    return createBlock(
      b.type || 'paragraph',
      b.attrs && typeof b.attrs === 'object' ? { ...b.attrs } : {},
      content,
      b.id
    );
  });

  return createDocument(blocks);
}

