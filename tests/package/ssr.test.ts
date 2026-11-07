// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Frameworks like Next.js import the package on the server, where there is no DOM.
describe('server-side import', () => {
  it('runs without a DOM', () => {
    expect(typeof (globalThis as any).HTMLElement).toBe('undefined');
  });

  it('can import the package entry without throwing', async () => {
    const mod = await import('../../src/index');
    expect(typeof mod.createLevitEditor).toBe('function');
    expect(typeof mod.LevitEditorElement).toBe('function');
  });

  it('serializers work on the server', async () => {
    const { markdownToDocument, documentToHTML } = await import('../../src/index');
    expect(documentToHTML(markdownToDocument('# Hi\n\n- a\n- b'))).toBe('<h1>Hi</h1><ul><li>a</li><li>b</li></ul>');
  });
});
