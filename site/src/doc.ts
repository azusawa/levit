// The guide and docs pages: copy buttons on code and the section being read
// marked in the table of contents.
import '@yonailab/levit/levit.css';
import { setUpPage } from './page';
import './site.css';

setUpPage();

for (const pre of document.querySelectorAll<HTMLPreElement>('.prose pre')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy';
  button.textContent = document.documentElement.lang === 'ko' ? '복사' : document.documentElement.lang === 'ja' ? 'コピー' : 'Copy';
  button.dataset.copied = document.documentElement.lang === 'ko' ? '복사됨' : document.documentElement.lang === 'ja' ? 'コピーしました' : 'Copied';
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? '');
      const label = button.textContent;
      button.textContent = button.dataset.copied!;
      setTimeout(() => (button.textContent = label), 1600);
    } catch {
      // No clipboard access.
    }
  });
  pre.append(button);
}

const links = new Map<string, HTMLAnchorElement>();
for (const a of document.querySelectorAll<HTMLAnchorElement>('.toc a')) links.set(decodeURIComponent(a.hash.slice(1)), a);
const headings = Array.from(document.querySelectorAll<HTMLElement>('.prose h2[id], .prose h3[id]'));
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const a of links.values()) a.removeAttribute('aria-current');
      links.get(entry.target.id)?.setAttribute('aria-current', 'location');
    }
  },
  { rootMargin: '0px 0px -70% 0px' }
);
headings.forEach((h) => observer.observe(h));
