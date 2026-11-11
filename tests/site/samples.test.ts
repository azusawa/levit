import { describe, it, expect } from 'vitest';
import { samples } from '../../site/src/samples';
import { markdownToDocument } from '../../packages/levit/src/serializers/markdown';

describe('playground samples', () => {
  it('the writing sample has a table to try, in every language', () => {
    for (const [lang, sample] of Object.entries(samples)) {
      const cells = markdownToDocument(sample.write).blocks.filter((b) => b.type === 'table_cell');
      expect(cells.length, lang).toBeGreaterThanOrEqual(6);
      expect(cells.some((b) => b.attrs?.header), lang).toBe(true);
    }
  });
});
