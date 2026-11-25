/**
 * A callout: a boxed line of text with a kind. The kinds are GitHub's alerts,
 * so a callout is written in Markdown as "> [!WARNING]". A note is the
 * default and is not kept in the document.
 */

export const CALLOUT_KINDS = ['note', 'tip', 'important', 'warning', 'caution'] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** A kind in any case, or null for anything else. */
export function normalizeCalloutKind(value: unknown): CalloutKind | null {
  if (typeof value !== 'string') return null;
  const kind = value.toLowerCase();
  return (CALLOUT_KINDS as readonly string[]).includes(kind) ? (kind as CalloutKind) : null;
}

/** The kind of a callout block: a note when it has none or one Levit does not know. */
export function calloutKind(block: { attrs?: Record<string, any> }): CalloutKind {
  return normalizeCalloutKind(block.attrs?.kind) ?? 'note';
}

/** The attrs for a callout of this kind. */
export function calloutAttrs(kind: CalloutKind): Record<string, string> {
  return kind === 'note' ? {} : { kind };
}
