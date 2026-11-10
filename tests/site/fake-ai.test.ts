import { describe, it, expect } from 'vitest';
import { createFakeProvider } from '../../site/src/fake-ai';
import { samples } from '../../site/src/samples';

const request = (command: string, text: string, signal = new AbortController().signal) =>
  ({ command, prompt: '', text, before: '', after: '', signal }) as const;

const collect = async (stream: AsyncIterable<string>) => {
  let out = '';
  for await (const chunk of stream) out += chunk;
  return out;
};

describe('the playground’s canned AI', () => {
  const provider = createFakeProvider('en', { delay: 0 });

  it('streams its answer in small pieces', async () => {
    const chunks: string[] = [];
    for await (const c of await provider(request('continue', ''))) chunks.push(c);
    expect(chunks.length).toBeGreaterThan(5);
    expect(chunks.join('')).toMatch(/\S/);
  });

  it('has a written improvement for the sample sentence', async () => {
    const sentence = samples.en.ai.split('\n\n')[1];
    const out = await collect(await provider(request('improve', sentence)));
    expect(out).not.toBe(sentence);
    expect(out).toMatch(/^Our new editor is fast/);
  });

  it('tidies any other text: spacing, capital letter and final full stop', async () => {
    expect(await collect(await provider(request('improve', 'hello   world ,  again')))).toBe('Hello world, again.');
  });

  it('summarizes with the first sentence of each paragraph, as a list', async () => {
    const out = await collect(await provider(request('summarize', '# Title\n\nOne. Two.\n\nThree here. Four.')));
    expect(out).toBe('- One.\n- Three here.');
  });

  it('answers in the page language', async () => {
    const ko = createFakeProvider('ko', { delay: 0 });
    expect(await collect(await ko(request('continue', '')))).toMatch(/[가-힣]/);
    const ja = createFakeProvider('ja', { delay: 0 });
    expect(await collect(await ja(request('continue', '')))).toMatch(/[ぁ-んァ-ン]/);
  });

  it('stops when the request is aborted', async () => {
    const controller = new AbortController();
    const slow = createFakeProvider('en', { delay: 5 });
    const stream = await slow(request('continue', '', controller.signal));
    const chunks: string[] = [];
    for await (const c of stream) {
      chunks.push(c);
      if (chunks.length === 2) controller.abort();
    }
    expect(chunks).toHaveLength(2);
  });
});
