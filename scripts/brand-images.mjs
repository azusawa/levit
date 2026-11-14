// Makes the website's PNG and ICO images from the logo SVGs in brand/.
// Run after changing a logo: npm run brand:images. Uses Google Chrome, or
// Playwright's Chromium when Chrome is not installed, and the network for the
// link preview's typeface (General Sans, as on the website), so the image
// comes out the same on every machine.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const out = (name) => resolve(root, 'site/public', name);
const svg = (name) => readFileSync(resolve(root, 'brand', name), 'utf8');

const icon = svg('levit-icon.svg');
// Phones round the corners of a home-screen icon themselves: give them a full square.
const squareIcon = icon.replace(' rx="14"', '');

const browser = await chromium.launch({ channel: 'chrome' }).catch(() => chromium.launch());
const page = await browser.newPage({ deviceScaleFactor: 1 });

/** Renders some markup at an exact size and returns the PNG. */
async function render(html, width, height, background = 'transparent') {
  await page.setViewportSize({ width, height });
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=general-sans@500&display=block"><style>html,body{margin:0;width:${width}px;height:${height}px;background:${background};overflow:hidden}svg{display:block;width:100%;height:100%}</style>${html}`,
    { waitUntil: 'networkidle' }
  );
  await page.evaluate(() => document.fonts.ready);
  return page.screenshot({ omitBackground: background === 'transparent', clip: { x: 0, y: 0, width, height } });
}

writeFileSync(out('apple-touch-icon.png'), await render(squareIcon, 180, 180, '#0b0b0c'));
writeFileSync(out('icon-192.png'), await render(icon, 192, 192));
writeFileSync(out('icon-512.png'), await render(icon, 512, 512));

// favicon.ico: PNG images in an ICO container, which every browser reads.
const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push(await render(icon, size, size));
const header = Buffer.alloc(6 + 16 * images.length);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const at = 6 + i * 16;
  header[at] = sizes[i];
  header[at + 1] = sizes[i];
  header.writeUInt16LE(1, at + 4);
  header.writeUInt16LE(32, at + 6);
  header.writeUInt32LE(png.length, at + 8);
  header.writeUInt32LE(offset, at + 12);
  offset += png.length;
});
writeFileSync(out('favicon.ico'), Buffer.concat([header, ...images]));

// The link preview: the logo and one line about Levit, on the brand black.
const logo = svg('levit-logo-dark.svg');
writeFileSync(
  out('og-image.png'),
  await render(
    `<div style="box-sizing:border-box;width:1280px;height:640px;padding:0 120px;display:flex;flex-direction:column;justify-content:center;gap:44px;font-family:'General Sans',sans-serif">
      <div style="width:560px;height:197px">${logo}</div>
      <p style="margin:0;color:#c9c9cc;font-size:44px;line-height:1.3;letter-spacing:-0.01em">Easy to write. Light to develop.</p>
    </div>`,
    1280,
    640,
    '#0b0b0c'
  )
);

await browser.close();
console.log('Wrote site/public: favicon.ico, apple-touch-icon.png, icon-192.png, icon-512.png, og-image.png');
