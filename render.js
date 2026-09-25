// SVG renderers for a card face and a piece/token, plus PNG rasterization. Art always comes in
// as a data: URL asset (see store.js), so the SVG never needs network access and rasterizes
// cleanly on a <canvas> without tainting it.
export const CARD_W = 500, CARD_H = 700;
export const CARD_ART = { x: 24, y: 116, w: 452, h: 380 };
export const PIECE_SIZE = 320;

export const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function wrap(s, count) {
  const lines = [''];
  for (const w of String(s ?? '').split(/\s+/)) {
    if (!w) continue;
    const cur = lines.at(-1);
    if (cur && (cur + ' ' + w).length > count) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}
function fit(s, base, count, maxLines, min) {
  for (let size = base; size >= min; size--) {
    const lines = wrap(s, Math.floor(count * base / size));
    if (lines.length <= maxLines) return { size, lines };
  }
  return { size: min, lines: wrap(s, Math.floor(count * base / min)).slice(0, maxLines) };
}

function artMarkup(art, clipId, x, y, w, h) {
  if (!art?.asset) {
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e5e7eb"/>
      <text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial" font-size="16" fill="#9ca3af">no art yet</text>`;
  }
  const cx = x + w / 2 + (art.x || 0), cy = y + h / 2 + (art.y || 0), s = art.scale || 1, rot = art.rot || 0;
  // Art is drawn oversized (2x the window) and centered/panned/scaled/rotated, then clipped to the window —
  // this way "fill and pan" never leaves a gap at the edges when a student rotates or zooms.
  const iw = w * 2 * s, ih = h * 2 * s;
  return `<defs><clipPath id="${clipId}"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs>
    <g clip-path="url(#${clipId})">
      <image href="${esc(art.asset)}" x="${(cx - iw / 2).toFixed(1)}" y="${(cy - ih / 2).toFixed(1)}" width="${iw.toFixed(1)}" height="${ih.toFixed(1)}"
        transform="rotate(${rot.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)})" preserveAspectRatio="xMidYMid slice"/>
    </g>`;
}

/** ctx: { project } — project is the Kit, used to look up the card's category color/name. */
export function cardSVG(c, project, uid = 'c') {
  const cat = project?.categories?.find(x => x.id === c.category);
  const color = cat?.color || '#4b5563';
  const name = fit(c.name || 'Untitled', 30, 20, 2, 16);
  const body = fit(c.text || '', 20, 40, 6, 12);
  const stats = (c.stats || []).slice(0, 4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
    <rect width="${CARD_W}" height="${CARD_H}" rx="18" fill="#171724"/>
    <rect x="10" y="10" width="${CARD_W - 20}" height="${CARD_H - 20}" rx="12" fill="#fff9eb"/>
    <rect x="24" y="24" width="${CARD_W - 48}" height="82" rx="8" fill="${esc(color)}"/>
    ${name.lines.map((l, i) => `<text x="38" y="${58 + i * name.size * 1.08}" font-family="Arial" font-weight="800" font-size="${name.size}" fill="#171724">${esc(l)}</text>`).join('')}
    ${c.value ? `<circle cx="${CARD_W - 56}" cy="60" r="28" fill="#171724"/><text x="${CARD_W - 56}" y="69" text-anchor="middle" font-family="Arial" font-weight="800" font-size="24" fill="#fff9eb">${esc(c.value)}</text>` : ''}
    ${artMarkup(c.art, `art-${uid}`, CARD_ART.x, CARD_ART.y, CARD_ART.w, CARD_ART.h)}
    <rect x="${CARD_ART.x}" y="${CARD_ART.y}" width="${CARD_ART.w}" height="${CARD_ART.h}" fill="none" stroke="#171724" stroke-width="2" opacity=".25"/>
    ${stats.length ? stats.map((s, i) => {
      const w = (CARD_W - 48 - (stats.length - 1) * 8) / stats.length, x = 24 + i * (w + 8), y = CARD_ART.y + CARD_ART.h + 14;
      return `<rect x="${x}" y="${y}" width="${w}" height="46" rx="6" fill="#f3f4f6" stroke="#171724" stroke-opacity=".15"/>
        <text x="${x + w / 2}" y="${y + 19}" text-anchor="middle" font-family="Arial" font-size="10" fill="#6b7280">${esc(s.label)}</text>
        <text x="${x + w / 2}" y="${y + 38}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="16" fill="#171724">${esc(s.value)}</text>`;
    }).join('') : ''}
    ${body.lines.map((l, i) => `<text x="38" y="${CARD_ART.y + CARD_ART.h + (stats.length ? 78 : 30) + i * body.size * 1.3}" font-family="Arial" font-size="${body.size}" fill="#171724">${esc(l)}</text>`).join('')}
    <text x="38" y="${CARD_H - 22}" font-family="Arial" font-size="12" fill="#6b7280">${esc(cat?.name || '')}</text>
  </svg>`;
}

function maskPath(shape, s) {
  const c = s / 2;
  if (shape === 'square') return `<rect width="${s}" height="${s}"/>`;
  if (shape === 'rounded') return `<rect width="${s}" height="${s}" rx="${s * 0.18}"/>`;
  if (shape === 'diamond') return `<polygon points="${c},0 ${s},${c} ${c},${s} 0,${c}"/>`;
  if (shape === 'hex') {
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (-90 + i * 60) * Math.PI / 180; return `${(c + c * 0.98 * Math.cos(a)).toFixed(1)},${(c + c * 0.98 * Math.sin(a)).toFixed(1)}`; });
    return `<polygon points="${pts.join(' ')}"/>`;
  }
  return `<circle cx="${c}" cy="${c}" r="${c}"/>`;
}

/** ctx: { project } — used for the piece's category color (ring + label). */
export function pieceSVG(p, project, uid = 'p') {
  const s = PIECE_SIZE, cat = project?.categories?.find(x => x.id === p.category), color = cat?.color || '#4b5563';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s + 46}" viewBox="0 0 ${s} ${s + 46}">
    <defs><clipPath id="mask-${uid}">${maskPath(p.shape, s)}</clipPath></defs>
    <g clip-path="url(#mask-${uid})">
      <rect width="${s}" height="${s}" fill="#e5e7eb"/>
      ${artMarkup(p.art, `pxclip-${uid}`, 0, 0, s, s)}
    </g>
    <g fill="none" stroke="${esc(color)}" stroke-width="8">${maskPath(p.shape, s)}</g>
    <text x="${s / 2}" y="${s + 30}" text-anchor="middle" font-family="Arial" font-weight="700" font-size="18" fill="#171724">${esc(p.name || '')}</text>
  </svg>`;
}

/** Rasterize an SVG string to a PNG blob at the given pixel size. Alpha is preserved, so
 * piece exports keep their transparent background outside the shape mask. */
export function toPNG(svg, w, h, scale = 1) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = Math.round(w * scale); cv.height = Math.round(h * scale);
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/png');
    };
    img.onerror = rej;
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}
