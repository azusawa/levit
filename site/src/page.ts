// Behaviour every page shares: the light theme by default, copy buttons and
// the entrance of each section's parts as they scroll into view.

const ENTER = [
  'h1', 'h2', '.lead', '.install', '.playground', '.formats-lead', '.formats-input', '.formats-out',
  '.examples button', '.band-text', '.band-ui', '.card', '.field-clause', '.group', '.row', 'details.tile',
  '.site-footer > *', '.toc', '.prose > h2',
].join(', ');

export function setUpPage() {
  // The site is light. The editor's own dark theme follows only the switch in
  // the playground, not the system setting.
  document.documentElement.dataset.theme ??= 'light';

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
    const label = button.textContent;
    let timer: ReturnType<typeof setTimeout> | undefined;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(button.dataset.copy!);
        button.textContent = button.dataset.copied ?? label;
        clearTimeout(timer);
        timer = setTimeout(() => (button.textContent = label), 1600);
      } catch {
        // No clipboard access: the text stays visible to copy by hand.
      }
    });
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) return;
  // The parts of each section come in one after another: heading, text, the rest.
  const groups = document.querySelectorAll<HTMLElement>('main > section, main .doc-head, main .doc-body, .site-footer');
  groups.forEach((group) => {
    group.querySelectorAll<HTMLElement>(ENTER).forEach((el, i) => (el.dataset.enter = String(Math.min(i, 6))));
  });
  const parts = document.querySelectorAll<HTMLElement>('[data-enter]');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -10% 0px' }
  );
  parts.forEach((el) => {
    el.style.setProperty('--enter-delay', `${(Number(el.dataset.enter) || 0) * 70}ms`);
    el.classList.add('will-enter');
    observer.observe(el);
  });
}
