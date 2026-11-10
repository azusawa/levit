// The guide and docs pages: copy buttons on code and the section being read
// marked in the table of contents.
import '@yonailab/levit/levit.css';
import { strings, type Lang } from '../lib/strings';
import { setUpPage } from './page';
import './site.css';

const s = strings[(document.documentElement.lang || 'en') as Lang] ?? strings.en;

// A copy button on every code block; setUpPage gives it its behaviour.
for (const pre of document.querySelectorAll<HTMLPreElement>('.prose pre')) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'code-copy';
  button.textContent = s.hero.copy;
  button.dataset.copy = pre.querySelector('code')?.textContent ?? '';
  button.dataset.copied = s.hero.copied;
  pre.append(button);
}

setUpPage();

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
