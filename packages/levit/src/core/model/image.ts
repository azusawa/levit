/**
 * Settings an image block can have besides its src and alt: a size (a share
 * of the editor's width) and an alignment. Without them an image shows at its
 * own size, up to the full width, on the left.
 */

export type ImageSize = 'small' | 'medium' | 'full';
export type ImageAlign = 'left' | 'center' | 'right';

/** The width each size gives an image, as a share of the editor's width. */
export const IMAGE_WIDTHS: Readonly<Record<ImageSize, string>> = { small: '25%', medium: '50%', full: '100%' };

export const IMAGE_SIZES = Object.keys(IMAGE_WIDTHS) as ImageSize[];
/** Alignments kept in the document; left is the default and is not kept. */
export const IMAGE_ALIGNS: readonly Exclude<ImageAlign, 'left'>[] = ['center', 'right'];

export function normalizeImageSize(value: unknown): ImageSize | null {
  return IMAGE_SIZES.includes(value as ImageSize) ? (value as ImageSize) : null;
}

/** 'center' or 'right', or null for the default (left) and anything else. */
export function normalizeImageAlign(value: unknown): Exclude<ImageAlign, 'left'> | null {
  return IMAGE_ALIGNS.includes(value as 'center') ? (value as 'center' | 'right') : null;
}
