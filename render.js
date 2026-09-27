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

// Blend modes (CSS mix-blend-mode, which PNG export honours too) and layer effects.
export const BLENDS = { normal: 'Normal', multiply: 'Multiply', screen: 'Screen', overlay: 'Overlay', 'soft-light': 'Soft light', 'hard-light': 'Hard light', darken: 'Darken', lighten: 'Lighten', 'color-dodge': 'Color dodge', 'color-burn': 'Color burn', difference: 'Difference', hue: 'Hue', color: 'Color', luminosity: 'Luminosity' };
export const LAYER_FX = { none: 'No effect', shadow: 'Drop shadow', glow: 'Glow', outline: 'Sticker outline' };
export const FX_COLOR = { shadow: '#000000', glow: '#ffda52', outline: '#ffffff' };

export const layerTransform = L => `translate(${L.x.toFixed(1)} ${L.y.toFixed(1)}) rotate(${(L.rot || 0).toFixed(1)}) scale(${L.scale.toFixed(3)})`;
export function layerBox(L) { return { hw: L.w / 2, hh: L.h / 2 }; }

function layerBody(L, uid, href, doc = {}) {
  if (L.kind === 'image') {
    const b = L.bright ?? 1, k = L.contrast ?? 1, s = L.sat ?? 1, hue = L.hue || 0, fx = `fx-${uid}-${L.id}`, tuned = b !== 1 || k !== 1 || s !== 1 || hue !== 0;
    const fn = ch => `<feFunc${ch} type="linear" slope="${(k * b).toFixed(3)}" intercept="${((0.5 - 0.5 * k) * b).toFixed(3)}"/>`;
    const filter = tuned ? `<defs><filter id="${fx}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${s}"/>${hue ? `<feColorMatrix type="hueRotate" values="${+hue}"/>` : ''}<feComponentTransfer>${fn('R')}${fn('G')}${fn('B')}</feComponentTransfer></filter></defs>` : '';
    return `${filter}<image href="${esc(href ? href(L.asset) : L.asset)}" x="${-L.w / 2}" y="${-L.h / 2}" width="${L.w}" height="${L.h}" preserveAspectRatio="xMidYMid slice"${tuned ? ` filter="url(#${fx})"` : ''}/>`;
  }
  if (L.kind === 'shape') {
    const paint = `fill="${L.shape === 'line' ? 'none' : esc(L.fill)}"${L.stroke ? ` stroke="${esc(L.stroke)}" stroke-width="${L.strokeWidth}"` : (L.shape === 'line' ? ` stroke="${esc(L.fill)}" stroke-width="${Math.max(2, L.strokeWidth)}"` : '')} stroke-linejoin="round"`;
    if (!L.frame || L.shape === 'line') return `<g ${paint}>${shapePath(L.shape, L.w, L.h, L.radius)}</g>`;
    return frameBody(L, uid, href, doc);
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
// Shadow / glow / outline in document units, sized from the document (u = one "card pixel"),
// so a board and a card get the same-looking effect.
function fxFilter(L, id, doc) {
  const col = esc(/^#[0-9a-f]{6}$/i.test(L.fxColor || '') ? L.fxColor : FX_COLOR[L.fx]);
  const u = Math.min(doc.w, doc.h) / 500 * (+(L.fxSize ?? 1) || 1), f = v => (v * u).toFixed(1);
  const open = `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-doc.w / 2}" y="${-doc.h / 2}" width="${doc.w * 2}" height="${doc.h * 2}" color-interpolation-filters="sRGB">`;
  if (L.fx === 'shadow') return `${open}<feDropShadow dx="${f(4)}" dy="${f(7)}" stdDeviation="${f(5)}" flood-color="${col}" flood-opacity=".6"/></filter>`;
  if (L.fx === 'glow') return `${open}<feMorphology in="SourceAlpha" operator="dilate" radius="${f(2)}"/><feGaussianBlur stdDeviation="${f(7)}" result="b"/><feFlood flood-color="${col}"/><feComposite in2="b" operator="in" result="g"/><feMerge><feMergeNode in="g"/><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  if (L.fx === 'outline') return `${open}<feMorphology in="SourceAlpha" operator="dilate" radius="${f(5)}" result="d"/><feFlood flood-color="${col}"/><feComposite in2="d" operator="in" result="o"/><feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  return '';
}
// The effect and blend mode sit on an untransformed wrapper, so a shadow falls the same way
// however the layer is spun or scaled.
// A frame (InDesign-style) is a shape that holds a picture clipped to its outline. The picture
// fills or fits the frame, then can be zoomed (imgScale) and nudged (imgX / imgY, in the
// frame's own units) without moving the frame itself.
function frameBody(L, uid, href, doc) {
  const path = shapePath(L.shape, L.w, L.h, L.radius), cid = `fr-${uid}-${L.id}`;
  const clip = `<defs><clipPath id="${cid}">${path}</clipPath></defs>`, under = `<g fill="${esc(L.fill)}">${path}</g>`;
  const outline = L.stroke ? `<g fill="none" stroke="${esc(L.stroke)}" stroke-width="${L.strokeWidth}" stroke-linejoin="round">${path}</g>` : '';
  if (!L.img) {
    // Empty frame: the classic layout-app cross, shown only while editing.
    const x = doc.editing ? `<g clip-path="url(#${cid})" stroke="#8a8fa8" stroke-width="${Math.max(1, Math.min(L.w, L.h) / 160).toFixed(1)}"><line x1="${-L.w / 2}" y1="${-L.h / 2}" x2="${L.w / 2}" y2="${L.h / 2}"/><line x1="${L.w / 2}" y1="${-L.h / 2}" x2="${-L.w / 2}" y2="${L.h / 2}"/></g>` : '';
    return clip + under + x + outline;
  }
  const iw = L.imgW || 100, ih = L.imgH || 100;
  const k = (L.imgFit === 'fit' ? Math.min(L.w / iw, L.h / ih) : Math.max(L.w / iw, L.h / ih)) * (L.imgScale || 1);
  const dw = iw * k, dh = ih * k, x = -dw / 2 + (L.imgX || 0), y = -dh / 2 + (L.imgY || 0);
  const box = doc.frameContent === L.id ? `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" fill="none" stroke="#ff3ea5" stroke-width="${Math.max(1.5, Math.min(L.w, L.h) / 120).toFixed(1)}" stroke-dasharray="8 5" pointer-events="none"/>` : '';
  return clip + under + `<g clip-path="url(#${cid})"><image href="${esc(href ? href(L.img) : L.img)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${dw.toFixed(1)}" height="${dh.toFixed(1)}" preserveAspectRatio="none"/></g>` + outline + box;
}
function layerMarkup(L, uid, ghost, href, doc) {
  if (L.hidden) return '';
  // The ghost is a second copy of the selected layer — it needs its own filter id, or both
  // copies' <filter> defs collide in the same SVG.
  const inner = `<g ${ghost ? 'data-ghost' : 'data-layer'}="${L.id}" transform="${layerTransform(L)}" opacity="${ghost ? 0.28 : L.opacity}"${ghost ? ' pointer-events="none"' : ' class="layer"'}>${layerBody(L, ghost ? `${uid}g` : uid, href, doc)}</g>`;
  if (ghost) return inner;
  const fid = `lx-${uid}-${L.id}`, filter = LAYER_FX[L.fx] && L.fx !== 'none' ? fxFilter(L, fid, doc) : '';
  const blend = BLENDS[L.blend] && L.blend !== 'normal' ? ` style="mix-blend-mode:${L.blend}"` : '';
  if (!filter && !blend) return inner;
  return `${filter ? `<defs>${filter}</defs>` : ''}<g${filter ? ` filter="url(#${fid})"` : ''}${blend}>${inner}</g>`;
}

// k scales handle size (the editor passes doc-units-per-screen-pixel), so handles stay
// finger-sized on a huge board or a zoomed-in canvas.
export function handlesMarkup(L, k = 1) {
  if (!L || L.hidden) return '';
  const { hw, hh } = layerBox(L), s = L.scale, r = (L.rot || 0) * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  const P = (lx, ly) => [L.x + lx * cos - ly * sin, L.y + lx * sin + ly * cos];
  const corners = [[-hw * s, -hh * s], [hw * s, -hh * s], [hw * s, hh * s], [-hw * s, hh * s]].map(p => P(...p));
  const top = P(0, -hh * s), rot = [top[0] + 36 * k * sin, top[1] - 36 * k * cos], sw = (2 * k).toFixed(2);
  const dot = (p, kind, fill) => `<circle data-handle="${kind}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(22 * k).toFixed(1)}" fill="transparent"/><circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${(8 * k).toFixed(1)}" fill="${fill}" stroke="#2f7bff" stroke-width="${sw}" pointer-events="none"/>`;
  return `<polygon points="${corners.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ')}" fill="none" stroke="#2f7bff" stroke-width="${sw}" pointer-events="none"/>
  <line x1="${top[0].toFixed(1)}" y1="${top[1].toFixed(1)}" x2="${rot[0].toFixed(1)}" y2="${rot[1].toFixed(1)}" stroke="#2f7bff" stroke-width="${sw}" pointer-events="none"/>
  ${corners.map(p => dot(p, 'scale', '#ffffff')).join('')}${dot(rot, 'rotate', '#ffda52')}`;
}

/** ctx: { editing, sel, href } — editing draws selection handles; sel is the selected layer id;
 *  href (live preview only) maps an embedded image to a short URL, so every redraw doesn't
 *  re-parse megabytes of base64. Exports leave it out: a rasterized SVG can only use the
 *  embedded data itself. */
export function itemSVG(item, uid = 'x', ctx = {}) {
  const { w, h } = docSize(item), masked = item.mask && item.mask !== 'none';
  const clipId = `mask-${uid}`;
  const layers = item.layers || [];
  const selL = ctx.editing && ctx.sel ? layers.find(l => l.id === ctx.sel) : null;
  const body = `${masked ? `<g clip-path="url(#${clipId})">` : ''}
    ${selL ? layerMarkup(selL, uid, true, ctx.href, { w, h }) : ''}
    ${layers.map(l => layerMarkup(l, uid, false, ctx.href, { w, h, editing: ctx.editing, frameContent: ctx.frameContent })).join('')}
    ${masked ? '</g>' : ''}`;
  const border = !ctx.editing ? '' : masked ? `<g fill="none" stroke="#171724" stroke-width="2" opacity=".18">${maskMarkup(item.mask, w, h)}</g>` : `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" fill="none" stroke="#171724" stroke-width="2" opacity=".18"/>`;
  const handles = ctx.editing ? `<g id="guides" pointer-events="none"></g><g id="handles">${handlesMarkup(selL, ctx.handleK ?? 1)}</g>` : '';
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
