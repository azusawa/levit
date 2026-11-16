// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { showPageFonts } from '../../site/src/page';

describe('page fonts', () => {
  it('switches the page font stylesheets from print to all, and leaves other stylesheets alone', () => {
    const head = document.createElement('div');
    head.innerHTML =
      '<link rel="stylesheet" href="a.css" media="print" data-page-font>' +
      '<link rel="stylesheet" href="b.css" media="print">';
    showPageFonts(head);
    const [font, other] = head.querySelectorAll('link');
    expect(font.media).toBe('all');
    expect(other.media).toBe('print');
  });
});
