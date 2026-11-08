import { describe, it, expect } from 'vitest';
import { markdownToDocument } from '../../src/serializers/markdown';

// Markdown can come from anyone (pastes, AI output, documents read on a
// server). Crafted input must not make the parser take seconds.
const N = 50_000;
const inputs: [string, string][] = [
  ['nested link brackets', '[' + '[a'.repeat(N)],
  ['repeated link endings', '[](' + '](a'.repeat(N)],
  ['heading with many spaces before a line break', '# ' + '  '.repeat(N) + '\nx'],
  ['many spaces before text', ' '.repeat(N) + 'x'],
  ['code fence with a long info string', '```' + '!'.repeat(N)],
  ['a long run of spaces inside a paragraph', 'a' + ' '.repeat(N) + 'b'],
  ['many unclosed link URLs', '[a]('.repeat(N / 4)],
  ['many empty unclosed links', '[]('.repeat(N / 3)],
];

describe('Markdown parsing time', () => {
  it.each(inputs)('%s is parsed quickly', (_name, input) => {
    const start = performance.now();
    markdownToDocument(input);
    expect(performance.now() - start).toBeLessThan(200);
  });
});
