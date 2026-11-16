const SVG = 'http://www.w3.org/2000/svg';

/**
 * A 16×16 line icon from SVG paths. Paths starting with "fill:" are filled
 * and get fillClass, so the theme can color them.
 */
export function lineIcon(paths: readonly string[], fillClass: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of paths) {
    const path = document.createElementNS(SVG, 'path');
    const filled = d.startsWith('fill:');
    path.setAttribute('d', filled ? d.slice(5) : d);
    if (filled) path.setAttribute('class', fillClass);
    svg.appendChild(path);
  }
  return svg;
}
