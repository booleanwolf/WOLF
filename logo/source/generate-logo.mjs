import fs from 'node:fs';
import opentype from 'opentype.js';

const OUT = '/mnt/d/ClutchX3D/logo';
const COBALT = '#2B44E6', GOLD = '#D9A23A', INK = '#1B1F27', WHITE = '#F3F5F7', COBALT_DARK = '#6E82FF';

// ---- Mark geometry: an X made of two diagonal strokes, sliced into 7 print layers ----
const S = 0.74, H = 5.3, C = 32, BAND = 7.6, PITCH = 9.5;
const xa = (y) => C + (y - C) * S; // stroke top-left -> bottom-right
const xb = (y) => C - (y - C) * S;
const r = (n) => Math.round(n * 100) / 100;
const JOIN = H / S; // strokes overlap while |y - C| < JOIN

export const bands = [];
for (let d = -3; d <= 3; d++) {
  const y0 = C + d * PITCH - BAND / 2, y1 = y0 + BAND;
  const polys = [];
  const far = d < 0 ? y0 : y1, near = d < 0 ? y1 : y0; // edge farther from / nearer to the centre
  if (d === 0) {
    // fully overlapped: one bar notched on both sides where the strokes cross
    polys.push([[Math.min(xa(y0), xb(y0)) - H, y0], [C - H, C], [Math.min(xa(y1), xb(y1)) - H, y1],
      [Math.max(xa(y1), xb(y1)) + H, y1], [C + H, C], [Math.max(xa(y0), xb(y0)) + H, y0]]);
  } else if (Math.abs(near - C) < JOIN) {
    // joined near the centre, split towards the outside: one concave piece
    const ys = C + Math.sign(d) * JOIN;
    const [L, R] = [(y) => C - Math.abs(y - C) * S, (y) => C + Math.abs(y - C) * S]; // left & right stroke centres
    polys.push([[L(near) - H, near], [L(far) - H, far], [L(far) + H, far], [C, ys], [R(far) - H, far], [R(far) + H, far], [R(near) + H, near]]);
  } else {
    for (const f of [xa, xb]) polys.push([[f(y0) - H, y0], [f(y1) - H, y1], [f(y1) + H, y1], [f(y0) + H, y0]]);
  }
  bands.push({ d, polys: polys.map((p) => p.map(([x, y]) => [r(x), r(y)])) });
}

const pathOf = (poly, dx = 0, dy = 0, sc = 1) => 'M' + poly.map(([x, y]) => `${r(x * sc + dx)} ${r(y * sc + dy)}`).join('L') + 'Z';
const markPaths = (dx = 0, dy = 0, sc = 1, top = COBALT, rest = COBALT) =>
  bands.map((b) => `<path fill="${b.d === -3 ? top : rest}" d="${b.polys.map((p) => pathOf(p, dx, dy, sc)).join('')}"/>`).join('');

// ---- Wordmark glyphs to outlines ----
const font = opentype.parse(fs.readFileSync(new URL('./ChakraPetch-Bold.ttf', import.meta.url)).buffer);
function textPath(str, x, baseline, size, fill, tracking = 0) {
  let cx = x, d = '';
  for (const ch of str) {
    const g = font.charToGlyph(ch);
    for (const c of g.getPath(cx, baseline, size).commands) {
      if (c.type === 'Z') d += 'Z';
      else if (c.type === 'Q') d += `Q${r(c.x1)} ${r(c.y1)} ${r(c.x)} ${r(c.y)}`;
      else if (c.type === 'C') d += `C${r(c.x1)} ${r(c.y1)} ${r(c.x2)} ${r(c.y2)} ${r(c.x)} ${r(c.y)}`;
      else d += `${c.type}${r(c.x)} ${r(c.y)}`;
    }
    cx += (g.advanceWidth / font.unitsPerEm) * size + tracking;
  }
  return { svg: `<path fill="${fill}" d="${d}"/>`, width: cx - x - tracking };
}
const capH = (size) => (font.tables.os2.sCapHeight / font.unitsPerEm) * size;

function svg(w, h, body, title = 'ClutchX3D') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(w)} ${r(h)}" width="${r(w)}" height="${r(h)}" role="img" aria-label="${title}"><title>${title}</title>${body}</svg>\n`;
}

// Horizontal lockup: CLUTCH [mark as the X] 3D
function horizontal(ink, mark, top) {
  const size = 100, ch = capH(size), pad = 3, baseline = ch + pad;
  const clutch = textPath('CLUTCH', 0, baseline, size, ink, 2);
  const markSc = ch / 64, gap = 5;
  const mx = clutch.width + gap;
  const three = textPath('3D', mx + 64 * markSc + gap, baseline, size, ink, 2);
  const w = mx + 64 * markSc + gap + three.width;
  return svg(w, ch + pad * 2, clutch.svg + markPaths(mx, pad, markSc, top, mark) + three.svg);
}

// Stacked lockup: mark above wordmark
function stacked(ink, mark, top) {
  const size = 60, ch = capH(size);
  const word = textPath('CLUTCHX3D', 0, 0, size, ink, 1.5);
  const mSize = 150, mSc = mSize / 64;
  const w = Math.max(word.width, mSize);
  const body = `${markPaths((w - mSize) / 2, 0, mSc, top, mark)}<g transform="translate(${r((w - word.width) / 2)} ${r(mSize + 36 + ch)})">${word.svg}</g>`;
  return svg(w, mSize + 36 + ch + 4, body);
}

const markSvg = (top, rest, bg) => svg(64, 64, (bg ? `<rect width="64" height="64" fill="${bg}"/>` : '') + markPaths(0, 0, 1, top, rest), 'ClutchX3D mark');
// App icon: mark on a chamfered cobalt tile
const iconSvg = () => svg(512, 512,
  `<path fill="${COBALT}" d="M0 0H432L512 80V512H80L0 432Z"/>${markPaths(96, 96, 5, GOLD, WHITE)}`, 'ClutchX3D');

const files = {
  'svg/clutchx3d-mark.svg': markSvg(GOLD, COBALT),
  'svg/clutchx3d-mark-on-dark.svg': markSvg(GOLD, COBALT_DARK),
  'svg/clutchx3d-mark-mono-black.svg': markSvg(INK, INK),
  'svg/clutchx3d-mark-mono-white.svg': markSvg(WHITE, WHITE),
  'svg/clutchx3d-logo-horizontal.svg': horizontal(INK, COBALT, GOLD),
  'svg/clutchx3d-logo-horizontal-on-dark.svg': horizontal(WHITE, COBALT_DARK, GOLD),
  'svg/clutchx3d-logo-horizontal-mono-black.svg': horizontal(INK, INK, INK),
  'svg/clutchx3d-logo-horizontal-mono-white.svg': horizontal(WHITE, WHITE, WHITE),
  'svg/clutchx3d-logo-stacked.svg': stacked(INK, COBALT, GOLD),
  'svg/clutchx3d-logo-stacked-on-dark.svg': stacked(WHITE, COBALT_DARK, GOLD),
  'svg/clutchx3d-app-icon.svg': iconSvg(),
  'favicon/favicon.svg': iconSvg(),
};
for (const [f, c] of Object.entries(files)) fs.writeFileSync(`${OUT}/${f}`, c);

// Geometry for the 3D hero
fs.writeFileSync('/mnt/d/ClutchX3D/clutchx3d/web/src/three/markGeometry.js',
  `// Generated from logo/ geometry: 7 print layers of the ClutchX3D X mark in a 64x64 box (y down).\nexport const MARK_BANDS = ${JSON.stringify(bands)};\n`);
console.log('ok');
