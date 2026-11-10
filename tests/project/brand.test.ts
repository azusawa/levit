import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const read = (file: string) => readFileSync(resolve(root, file), 'utf8');
const bytes = (file: string) => readFileSync(resolve(root, file));

/** Width and height from a PNG's IHDR chunk. */
function pngSize(file: string): [number, number] {
  const b = bytes(file);
  expect(b.subarray(1, 4).toString()).toBe('PNG');
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

const svgs = [
  'brand/levit-mark.svg',
  'brand/levit-mark-dark.svg',
  'brand/levit-wordmark.svg',
  'brand/levit-wordmark-dark.svg',
  'brand/levit-logo.svg',
  'brand/levit-logo-dark.svg',
  'brand/levit-icon.svg',
];

describe('brand files', () => {
  it.each(svgs)('%s is a plain SVG: a viewBox, the brand colors, no script or outside links', (file) => {
    const svg = read(file);
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+"/);
    expect(svg).not.toMatch(/<script|<foreignObject|href=|url\(|on\w+=/i);
    const colors = new Set((svg.match(/#[0-9a-f]{6}/gi) ?? []).map((c) => c.toLowerCase()));
    for (const c of colors) expect(['#0b0b0c', '#f5f5f4', '#ff3d7f']).toContain(c);
  });

  it('the logo files say how to use them', () => {
    const guide = read('brand/README.md');
    for (const file of svgs) expect(guide).toContain(file.replace('brand/', ''));
    expect(guide).toContain('#ff3d7f');
  });

  it('the site has the icon in every size browsers and phones ask for', () => {
    expect(read('site/public/favicon.svg')).toBe(read('brand/levit-icon.svg'));
    expect(pngSize('site/public/apple-touch-icon.png')).toEqual([180, 180]);
    expect(pngSize('site/public/icon-192.png')).toEqual([192, 192]);
    expect(pngSize('site/public/icon-512.png')).toEqual([512, 512]);
    expect(pngSize('site/public/og-image.png')).toEqual([1280, 640]);
    // An ICO holding 16, 32 and 48 px images.
    const ico = bytes('site/public/favicon.ico');
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, i) => ico[6 + i * 16] || 256);
    expect(sizes).toEqual([16, 32, 48]);
  });

  it('the web app manifest offers the 192 and 512 px icons', () => {
    const manifest = JSON.parse(read('site/public/manifest.webmanifest'));
    expect(manifest.name).toBe('Levit');
    expect(manifest.icons.map((i: { src: string; sizes: string }) => [i.src, i.sizes])).toEqual([
      ['icon-192.png', '192x192'],
      ['icon-512.png', '512x512'],
    ]);
  });

  it('the site uses no colors of the old blue-gray palette', () => {
    const css = read('site/src/site.css').toLowerCase();
    for (const old of ['#1f3038', '#d3dce1', '#f2f6f8', '#e8eef1', '#5d6b72', '#1d4ed8']) expect(css).not.toContain(old);
  });

  it('the demo and test pages use the new icon', () => {
    expect(read('logo.svg')).toBe(read('brand/levit-icon.svg'));
  });

  it('the README opens with the logo, in a dark version for dark mode', () => {
    const top = read('README.md').slice(0, 800);
    expect(top).toContain('<picture>');
    expect(top).toContain('media="(prefers-color-scheme: dark)" srcset="./brand/levit-logo-dark.svg"');
    expect(top).toContain('src="./brand/levit-logo.svg"');
  });

  it('the images can be made again from the SVGs', () => {
    expect(existsSync(resolve(root, 'scripts/brand-images.mjs'))).toBe(true);
    expect(JSON.parse(read('package.json')).scripts['brand:images']).toBe('node scripts/brand-images.mjs');
  });
});
