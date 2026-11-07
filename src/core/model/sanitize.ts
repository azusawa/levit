const SAFE_SCHEMES = new Set(['http', 'https', 'mailto']);

/**
 * Returns the href if it is safe to put in a link, otherwise null.
 * Relative URLs are allowed; absolute URLs must use http, https or mailto.
 */
export function sanitizeHref(href: unknown): string | null {
  if (typeof href !== 'string' || href === '') return null;

  // Browsers ignore control characters and whitespace when reading the scheme,
  // so "java\tscript:" still runs as javascript:. Strip them before checking.
  const normalized = href.replace(/[\u0000- \u007f]/g, '');
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(normalized);
  if (scheme && !SAFE_SCHEMES.has(scheme[1].toLowerCase())) return null;

  return href;
}

/** Turns any value into a heading level from 1 to 6 (1 when it is not an integer). */
export function normalizeHeadingLevel(level: unknown): number {
  const n = typeof level === 'string' && /^\d+$/.test(level) ? Number(level) : level;
  if (typeof n !== 'number' || !Number.isInteger(n)) return 1;
  return Math.min(Math.max(n, 1), 6);
}

/**
 * Turns what a person typed into a link field into a safe href.
 * Adds https:// to bare domains like "example.com".
 * Returns '' for blank input and null when the URL is not allowed.
 */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (value === '') return '';

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(value);
  const isRelative = /^[/#?.]/.test(value);
  const looksLikeDomain = /^[^\s/]+\.[^\s/]+/.test(value);
  if (!hasScheme && !isRelative && looksLikeDomain) return sanitizeHref(`https://${value}`);

  return sanitizeHref(value);
}
