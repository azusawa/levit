import { describe, it, expect } from 'vitest';
import { markdownToDocument } from '../../src/serializers/markdown';

// Markdown can come from anyone (pastes, AI output, documents read on a
// server). Crafted input must not make the parser take seconds. The input is
// large (200,000 characters) and the limit generous: a linear parser takes a
// few milliseconds, a quadratic one takes many seconds, so a slow CI machine
// cannot make this fail by accident.
const N = 200_000;
const inputs: [string, string][] = [
  ['nested link brackets', '[' + '[a'.repeat(N)],
  ['repeated link endings', '[](' + '](a'.repeat(N)],
  ['heading with many spaces before a line break', '# ' + '  '.repeat(N) + '\nx'],
  ['many spaces before text', ' '.repeat(N) + 'x'],
  ['code fence with a long info string', '```' + '!'.repeat(N)],
  ['a long run of spaces inside a paragraph', 'a' + ' '.repeat(N) + 'b'],
  ['many unclosed link URLs', '[a]('.repeat(N / 4)],
  ['many empty unclosed links', '[]('.repeat(N / 3)],
  ['an opening bracket and many escaped brackets', '[' + '\\['.repeat(N / 2)],
  ['many escaped brackets', '\\['.repeat(N / 2)],
  ['links with escaped closing brackets', '[a\\]'.repeat(N / 4)],
  ['many unclosed bold markers', '**a'.repeat(N / 3)],
  ['many unclosed code spans', 'a`'.repeat(N / 2)],
  ['many unclosed highlights', '==a'.repeat(N / 3)],
];

describe('Markdown parsing time', () => {
  it.each(inputs)('%s is parsed quickly', (_name, input) => {
    const start = performance.now();
    markdownToDocument(input);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});
