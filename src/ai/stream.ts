import { LevitEditor } from '../core/editor';

export interface AIContext {
  documentText: string;
  selectedText?: string;
  blockCount: number;
  currentBlockType: string;
  summary: string;
}

export function getAIContext(editor: LevitEditor): AIContext {
  const doc = editor.state.doc;
  const blocks = doc.blocks;
  const currentBlock = blocks.find((b) => b.id === editor.state.selection.anchor.blockId) || blocks[0];

  const fullText = editor.getText();
  const summary = fullText.slice(0, 150) + (fullText.length > 150 ? '...' : '');

  return {
    documentText: fullText,
    blockCount: blocks.length,
    currentBlockType: currentBlock.type,
    summary,
  };
}

export async function streamAIResponse(
  editor: LevitEditor,
  chunkStream: AsyncIterable<string>,
  options?: { delayMs?: number }
): Promise<void> {
  const delay = options?.delayMs ?? 0;

  for await (const chunk of chunkStream) {
    if (chunk) {
      editor.chain().insertText(chunk).run();
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
