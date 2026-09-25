// Generic layer renderer shared by cards/pieces/boards, plus PNG rasterization. Every layer
// (image/text/shape) uses the same transform recipe — translate to its center, rotate, scale —
// so drag/rotate/scale handles work identically no matter what kind of layer is selected.
import { PPI } from './model.js';

export const esc = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
export const docSize = item => ({ w: Math.round(item.size.w * PPI), h: Math.round(item.size.h * PPI) });
const fam = f => `'${String(f || 'Arial').replace(/[^\w -]/g, '')}', Arial, sans-serif`;

function wrap(s, count) {
  const lines = [''];
  for (const w of String(s ?? '').split(/\s+/)) {
    if (!w) continue;
    const cur = lines.at(-1);
    if (cur && (cur + ' ' + w).length > count) lines.push(w); else lines[lines.length - 1] = (cur + ' ' + w).trim();
  }
  return lines;
}

// ---------- shape paths, centered on (0,0), sized w×h ----------
function shapePath(shape, w, h, radius = 0) {
  const hw = w / 2, hh = h / 2;
  if (shape === 'ellipse') return `<ellipse cx="0" cy="0" rx="${hw}" ry="${hh}"/>`;
  if (shape === 'triangle') return `<polygon points="0,${-hh} ${hw},${hh} ${-hw},${hh}"/>`;
  if (shape === 'line') return `<line x1="${-hw}" y1="0" x2="${hw}" y2="0"/>`;
  if (shape === 'star') {
    const n = 5, ro = Math.min(hw, hh), ri = ro * 0.46;
    const pts = Array.from({ length: n * 2 }, (_, i) => { const r = i % 2 ? ri : ro, a = (-90 + i * 180 / n) * Math.PI / 180; return `${(r * Math.cos(a)).toFixed(1)},${(r * Math.sin(a)).toFixed(1)}`; });
    return `<polygon points="${pts.join(' ')}"/>`;
  }
  const r = Math.min(radius, hw, hh);
  return `<rect x="${-hw}" y="${-hh}" width="${w}" height="${h}" rx="${r}"/>`;
}
// The item-level mask (pieces only) — same shapes, but always fills the full w×h bounding box.
export function maskMarkup(shape, w, h) {
  const hw = w / 2, hh = h / 2;
  if (shape === 'circle') return `<ellipse cx="${hw}" cy="${hh}" rx="${hw}" ry="${hh}"/>`;
  if (shape === 'square') return `<rect width="${w}" height="${h}"/>`;
  if (shape === 'rounded') return `<rect width="${w}" height="${h}" rx="${Math.min(w, h) * 0.16}"/>`;
  if (shape === 'diamond') return `<polygon points="${hw},0 ${w},${hh} ${hw},${h} 0,${hh}"/>`;
  if (shape === 'hex') {
    const pts = Array.from({ length: 6 }, (_, i) => { const a = (-90 + i * 60) * Math.PI / 180; return `${(hw + hw * 0.98 * Math.cos(a)).toFixed(1)},${(hh + hh * 0.98 * Math.sin(a)).toFixed(1)}`; });
    return `<polygon points="${pts.join(' ')}"/>`;
  }
  return `<rect width="${w}" height="${h}"/>`;
}

export const layerTransform = L => `translate(${L.x.toFixed(1)} ${L.y.toFixed(1)}) rotate(${(L.rot || 0).toFixed(1)}) scale(${L.scale.toFixed(3)})`;
export function layerBox(L) { return { hw: L.w / 2, hh: L.h / 2 }; }

function layerBody(L, uid) {
  if (L.kind === 'image') {
    const b = L.bright ?? 1, k = L.contrast ?? 1, s = L.sat ?? 1, fx = `fx-${uid}-${L.id}`, tuned = b !== 1 || k !== 1 || s !== 1;
    const fn = ch => `<feFunc${ch} type="linear" slope="${(k * b).toFixed(3)}" intercept="${((0.5 - 0.5 * k) * b).toFixed(3)}"/>`;
    const filter = tuned ? `<defs><filter id="${fx}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${s}"/><feComponentTransfer>${fn('R')}${fn('G')}${fn('B')}</feComponentTransfer></filter></defs>` : '';
    return `${filter}<image href="${esc(L.asset)}" x="${-L.w / 2}" y="${-L.h / 2}" width="${L.w}" height="${L.h}" preserveAspectRatio="xMidYMid slice"${tuned ? ` filter="url(#${fx})"` : ''}/>`;
  }
  if (L.kind === 'shape') {
    const paint = `fill="${L.shape === 'line' ? 'none' : esc(L.fill)}"${L.stroke ? ` stroke="${esc(L.stroke)}" stroke-width="${L.strokeWidth}"` : (L.shape === 'line' ? ` stroke="${esc(L.fill)}" stroke-width="${Math.max(2, L.strokeWidth)}"` : '')} stroke-linejoin="round"`;
    return `<g ${paint}>${shapePath(L.shape, L.w, L.h, L.radius)}</g>`;
  }
  // text
  const count = Math.max(1, Math.floor(L.w / (L.size * 0.55)));
  const lines = String(L.text || '').split('\n').flatMap(ln => wrap(ln, count));
  const step = L.size * 1.22, y0 = -((lines.length - 1) * step) / 2 + L.size * 0.36;
  const anchor = L.align === 'left' ? 'start' : L.align === 'right' ? 'end' : 'middle';
  const tx = L.align === 'left' ? -L.w / 2 : L.align === 'right' ? L.w / 2 : 0;
  const strokeAttr = L.stroke ? ` stroke="${esc(L.stroke)}" stroke-width="${Math.max(2, L.size / 8).toFixed(1)}" paint-order="stroke" stroke-linejoin="round"` : '';
  return lines.map((ln, i) => `<text x="${tx.toFixed(1)}" y="${(y0 + i * step).toFixed(1)}" text-anchor="${anchor}" font-family="${fam(L.font)}" font-weight="${L.bold ? 800 : 500}" font-size="${L.size}" fill="${esc(L.color)}"${L.italic ? ' font-style="italic"' : ''}${strokeAttr}>${esc(ln)}</text>`).join('');
}
function layerMarkup(L, uid, ghost) {
  if (L.hidden) return '';
  return `<g ${ghost ? 'data-ghost' : 'data-layer'}="${L.id}" transform="${layerTransform(L)}" opacity="${ghost ? 0.28 : L.opacity}"${ghost ? ' pointer-events="none"' : ' class="layer"'}>${layerBody(L, uid)}</g>`;
}

export function handlesMarkup(L) {
  if (!L || L.hidden) return '';
  const { hw, hh } = layerBox(L), s = L.scale, r = (L.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const P = (lx, ly) => [L.x + lx * cos - ly * sin, L.y + lx * sin + ly * cos];
  const corners = [[-hw * s, -hh * s], [hw * s, -hh * s], [hw * s, hh * s], [-hw * s, hh * s]].map(p => P(...p));
  const top = P(0, -hh * s), rot = P(0, -hh * s - 40);
  const dot = (p, kind, fill) => `<circle data-handle="${kind}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="26" fill="transparent"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="11" fill="${fill}" stroke="#171724" stroke-width="3" pointer-events="none"/>`;
  return `<polygon points="${corners.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#2f5bd3" stroke-width="2.5" stroke-dasharray="9 5" pointer-events="none"/>
  <line x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${rot[0].toFixed(1)}" y2="${rot[1].toFixed(1)}" stroke="#2f5bd3" stroke-width="2.5" pointer-events="none"/>
  ${corners.map(p => dot(p, 'scale', '#ffffff')).join('')}${dot(rot, 'rotate', '#ffda52')}`;
}

/** ctx: { editing, sel } — editing draws selection handles; sel is the selected layer id. */
export function itemSVG(item, uid = 'x', ctx = {}) {
  const { w, h } = docSize(item), masked = item.mask && item.mask !== 'none';
  const clipId = `mask-${uid}`;
  const layers = item.layers || [];
  const selL = ctx.editing && ctx.sel ? layers.find(l => l.id === ctx.sel) : null;
  const body = `${masked ? `<g clip-path="url(#${clipId})">` : ''}
    ${selL ? layerMarkup(selL, uid, true) : ''}
    ${layers.map(l => layerMarkup(l, uid)).join('')}
    ${masked ? '</g>' : ''}`;
  const border = !ctx.editing ? '' : masked ? `<g fill="none" stroke="#171724" stroke-width="2" opacity=".18">${maskMarkup(item.mask, w, h)}</g>` : `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#171724" stroke-width="2" opacity=".18"/>`;
  const handles = ctx.editing ? `<g id="handles">${handlesMarkup(selL)}</g>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${masked ? `<defs><clipPath id="${clipId}">${maskMarkup(item.mask, w, h)}</clipPath></defs>` : ''}
    ${body}${border}${handles}
  </svg>`;
}

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
