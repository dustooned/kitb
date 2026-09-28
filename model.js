// Data model + sanitizing. Every component (card/piece/board) is a sized canvas holding an
// ordered stack of layers (image/text/shape) — the same engine for all three, so "compositing
// mode" works identically everywhere. Anything that enters the app (autosave, imported kit.json,
// a PSD's layers) passes through here, so numbers are numbers and ids are safe before touching
// the DOM.
export const SAFE_ID = /^[\w-]{1,32}$/;
export const newId = (p = 'i') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const PPI = 200; // editing px per inch (also used as the on-screen SVG viewBox scale)
export const MASKS = ['none', 'circle', 'square', 'rounded', 'hex', 'diamond'];
export const MASK_LABELS = { none: 'Rectangle', circle: 'Circle', square: 'Square', rounded: 'Rounded square', hex: 'Hexagon', diamond: 'Diamond' };
export const SHAPES = ['rect', 'ellipse', 'triangle', 'star', 'line'];
export const SHAPE_LABELS = { custom: 'Custom shape', rect: 'Rectangle', ellipse: 'Ellipse', triangle: 'Triangle', star: 'Star', line: 'Line' };
export const FONTS = ['Arial', 'Georgia', 'Verdana', 'Trebuchet MS', 'Impact', 'Comic Sans MS', 'Courier New', 'Tahoma'];
// Kept in step with render.js BLENDS / LAYER_FX (model.js stays import-free so Node tools can load it).
export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light', 'darken', 'lighten', 'color-dodge', 'color-burn', 'difference', 'hue', 'color', 'luminosity'];
export const FX = ['none', 'shadow', 'glow', 'outline'];
export const DEFAULT_COLORS = ['#e0533d', '#3d8ee0', '#3dbf6b', '#e0b23d', '#8e5de0', '#e05dbb', '#4b5563'];

export const KINDS = ['card', 'piece', 'board'];
export const SIZE_PRESETS = {
  card: [
    { id: 'poker', label: 'Poker (2.5×3.5")', w: 2.5, h: 3.5 },
    { id: 'bridge', label: 'Bridge (2.25×3.5")', w: 2.25, h: 3.5 },
    { id: 'tarot', label: 'Tarot (2.75×4.75")', w: 2.75, h: 4.75 },
    { id: 'square', label: 'Square (2.5×2.5")', w: 2.5, h: 2.5 },
    { id: 'mini', label: 'Mini (1.75×2.5")', w: 1.75, h: 2.5 },
    { id: 'custom', label: 'Custom size', w: 2.5, h: 3.5 },
  ],
  piece: [
    { id: 'small', label: 'Small (0.75")', w: 0.75, h: 0.75 },
    { id: 'standard', label: 'Standard (1")', w: 1, h: 1 },
    { id: 'large', label: 'Large (1.5")', w: 1.5, h: 1.5 },
    { id: 'jumbo', label: 'Jumbo (2")', w: 2, h: 2 },
    { id: 'custom', label: 'Custom size', w: 1, h: 1 },
  ],
  board: [
    { id: 'small', label: 'Small (8×8")', w: 8, h: 8 },
    { id: 'standard', label: 'Standard (18×18")', w: 18, h: 18 },
    { id: 'landscape', label: 'Landscape (17×11")', w: 17, h: 11 },
    { id: 'large', label: 'Large (24×24")', w: 24, h: 24 },
    { id: 'custom', label: 'Custom size', w: 12, h: 12 },
  ],
};
export const MIN_IN = 0.5, MAX_IN = 48;

const num = (v, d) => (v !== '' && v != null && Number.isFinite(+v)) ? +v : d;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(v) ? v : d;
const str = (v, d, max = 200) => String(v ?? d).slice(0, max);
const id = (v, p) => SAFE_ID.test(v) ? v : newId(p);

// ---------- custom (imported SVG) shapes ----------
// An imported SVG outline is kept as plain geometry only: a short list of shape elements with
// geometry attributes. No styles, scripts, links or url() references survive, so a student's
// SVG can never run anything, and the same list works as a fill shape AND as a frame's clip.
export const SVG_TAGS = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline'];
const SVG_ATTRS = ['d', 'x', 'y', 'width', 'height', 'rx', 'ry', 'cx', 'cy', 'r', 'points', 'transform', 'fill-rule'];
export function cleanSvgEls(list) {
  return (Array.isArray(list) ? list : []).slice(0, 400).filter(e => e && SVG_TAGS.includes(e.tag)).map(e => {
    const a = {};
    for (const k of SVG_ATTRS) {
      const v = e.a?.[k]; if (v == null) continue;
      const t = String(v).slice(0, 60000);
      if (/^[\w\s.,+\-()%]*$/.test(t) && !/url|script|expression/i.test(t)) a[k] = t;
    }
    return { tag: e.tag, a };
  }).filter(e => Object.keys(e.a).length);
}

// ---------- layers ----------
function baseLayer(kind, x, y, w, h, name) {
  return { id: newId('L'), kind, name: str(name, kind, 40), x, y, w, h, scale: 1, rot: 0, opacity: 1, hidden: false, locked: false };
}
export function newImageLayer(asset, x, y, w, h, name = 'Image') {
  return { ...baseLayer('image', x, y, w, h, name), asset, bright: 1, contrast: 1, sat: 1 };
}
export function newTextLayer(docW, docH) {
  return { ...baseLayer('text', docW / 2, docH * 0.18, docW * 0.8, 60, 'Text'), text: 'Text', size: 32, color: '#171724', font: 'Arial', bold: true, italic: false, align: 'center', stroke: '' };
}
export function newShapeLayer(shape, docW, docH) {
  const size = Math.min(docW, docH) * 0.4;
  return { ...baseLayer('shape', docW / 2, docH / 2, size, size, SHAPE_LABELS[shape] || 'Shape'), shape, fill: '#ffda52', stroke: '', strokeWidth: 4, radius: 16 };
}
/** An empty InDesign-style frame: a rectangle waiting for a picture. */
export function newFrameLayer(docW, docH) {
  const l = newShapeLayer('rect', docW, docH);
  Object.assign(l, { w: Math.round(docW * 0.7), h: Math.round(docH * 0.45), fill: '#e8e6df', radius: 0, frame: true, name: 'Frame' });
  return l;
}
export function newBackgroundLayer(docW, docH, color = '#fff9eb') {
  const l = newShapeLayer('rect', docW, docH);
  Object.assign(l, { x: docW / 2, y: docH / 2, w: docW, h: docH, fill: color, name: 'Background' });
  return l;
}
function cleanLayer(L) {
  if (!L || !['image', 'text', 'shape'].includes(L.kind)) return null;
  const o = {
    id: id(L.id, 'L'), kind: L.kind, name: str(L.name, L.kind, 40),
    x: num(L.x, 0), y: num(L.y, 0), w: clamp(num(L.w, 100), 1, 20000), h: clamp(num(L.h, 100), 1, 20000),
    scale: clamp(num(L.scale, 1), 0.05, 20), rot: num(L.rot, 0) % 360, opacity: clamp(num(L.opacity, 1), 0, 1),
    hidden: !!L.hidden, locked: !!L.locked,
  };
  if (BLENDS.includes(L.blend) && L.blend !== 'normal') o.blend = L.blend;
  if (FX.includes(L.fx) && L.fx !== 'none') Object.assign(o, { fx: L.fx, fxColor: hex(L.fxColor, ''), fxSize: clamp(num(L.fxSize, 1), 0.2, 3) });
  if (L.kind === 'image') {
    if (typeof L.asset !== 'string') return null;
    if (L.vector && L.asset.startsWith('data:image/svg+xml')) o.vector = true;
    Object.assign(o, { asset: L.asset, bright: clamp(num(L.bright, 1), 0.2, 2), contrast: clamp(num(L.contrast, 1), 0.2, 2), sat: clamp(num(L.sat, 1), 0, 2), hue: clamp(num(L.hue, 0), -180, 180) });
    if (typeof L.orig === 'string' && L.orig.startsWith('data:image/')) Object.assign(o, { orig: L.orig, cutTol: clamp(num(L.cutTol, 40), 5, 120) });
  }
  if (L.kind === 'text') {
    Object.assign(o, {
      text: str(L.text, '', 300), size: clamp(num(L.size, 32), 6, 300), color: hex(L.color, '#171724'), font: FONTS.includes(L.font) ? L.font : 'Arial',
      bold: !!L.bold, italic: !!L.italic, align: ['left', 'center', 'right'].includes(L.align) ? L.align : 'center', stroke: L.stroke ? hex(L.stroke, '') : '',
    });
  }
  if (L.kind === 'shape') {
    const svg = L.shape === 'custom' ? cleanSvgEls(L.svg) : [];
    const vb = Array.isArray(L.vb) && L.vb.length === 4 && L.vb.every(v => Number.isFinite(+v)) && +L.vb[2] > 0 && +L.vb[3] > 0 ? L.vb.map(Number) : null;
    if (svg.length && vb) Object.assign(o, { svg, vb });
    Object.assign(o, { shape: svg.length && vb ? 'custom' : SHAPES.includes(L.shape) ? L.shape : 'rect', fill: hex(L.fill, '#ffda52'), stroke: L.stroke ? hex(L.stroke, '') : '', strokeWidth: clamp(num(L.strokeWidth, 4), 0, 60), radius: clamp(num(L.radius, 16), 0, 400) });
    if (L.noFill && !L.frame) o.noFill = true;
    if (L.frame && o.shape !== 'line') {
      o.frame = true;
      if (typeof L.img === 'string' && L.img.startsWith('data:image/')) Object.assign(o, {
        img: L.img, imgW: clamp(num(L.imgW, 100), 1, 20000), imgH: clamp(num(L.imgH, 100), 1, 20000), imgFit: L.imgFit === 'fit' ? 'fit' : 'fill',
        imgScale: clamp(num(L.imgScale, 1), 0.1, 10), imgX: num(L.imgX, 0), imgY: num(L.imgY, 0),
      });
    }
  }
  return o;
}

// ---------- items (card / piece / board) ----------
function presetFor(kind, pid) { return (SIZE_PRESETS[kind] || []).find(p => p.id === pid); }
export function newItem(kind, categoryId = '', presetId) {
  const presets = SIZE_PRESETS[kind] || SIZE_PRESETS.card;
  const p = presetFor(kind, presetId) || presets[0];
  const w = Math.round(p.w * PPI), h = Math.round(p.h * PPI);
  return {
    id: newId(kind[0]), kind, name: `New ${kind}`, category: categoryId, count: 1,
    preset: p.id, size: { w: p.w, h: p.h }, mask: kind === 'piece' ? 'circle' : 'none',
    layers: [newBackgroundLayer(w, h)],
  };
}
function cleanItem(it, catIds) {
  const kind = KINDS.includes(it.kind) ? it.kind : 'card';
  const w = clamp(num(it.size?.w, 2.5), MIN_IN, MAX_IN), h = clamp(num(it.size?.h, 3.5), MIN_IN, MAX_IN);
  return {
    id: id(it.id, kind[0]), kind, name: str(it.name, 'Untitled', 60), category: catIds.has(it.category) ? it.category : '',
    count: clamp(num(it.count, 1), 1, 999) | 0, preset: str(it.preset, 'custom', 20), size: { w, h },
    mask: kind === 'piece' ? (MASKS.includes(it.mask) ? it.mask : 'circle') : 'none',
    layers: (Array.isArray(it.layers) ? it.layers : []).slice(0, 60).map(cleanLayer).filter(Boolean),
  };
}
export const newCard = (categoryId, presetId) => newItem('card', categoryId, presetId);
export const newPiece = (categoryId, presetId) => newItem('piece', categoryId, presetId);
export const newBoard = (categoryId, presetId) => newItem('board', categoryId, presetId);

export function newCategory(name = 'New category') {
  return { id: newId('cat'), name: str(name, 'Category', 40), color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)] };
}
function cleanCategory(c) { return { id: id(c.id, 'cat'), name: str(c.name, 'Deck', 40), color: hex(c.color, DEFAULT_COLORS[0]), order: (Array.isArray(c.order) ? c.order : []).filter(x => SAFE_ID.test(x)) }; }

export function emptyKit() {
  return { format: 'kit-forge', version: 2, title: 'My Game Kit', className: '', author: '', categories: [], cards: [], pieces: [], boards: [], assets: {} };
}
/** Hydrate + sanitize a kit loaded from IndexedDB or an imported file. */
export function normalizeKit(o) {
  const k = { ...emptyKit(), ...(o || {}) };
  k.title = str(k.title, 'My Game Kit', 80);
  k.className = str(k.className, '', 80);
  k.author = str(k.author, '', 80);
  k.categories = (Array.isArray(k.categories) ? k.categories : []).filter(c => c && c.name).map(cleanCategory);
  const catIds = new Set(k.categories.map(c => c.id));
  k.cards = (Array.isArray(k.cards) ? k.cards : []).filter(Boolean).map(c => cleanItem({ ...c, kind: 'card' }, catIds));
  k.pieces = (Array.isArray(k.pieces) ? k.pieces : []).filter(Boolean).map(p => cleanItem({ ...p, kind: 'piece' }, catIds));
  k.boards = (Array.isArray(k.boards) ? k.boards : []).filter(Boolean).map(b => cleanItem({ ...b, kind: 'board' }, catIds));
  k.assets = Object.fromEntries(Object.entries(k.assets || {}).filter(([key, v]) => SAFE_ID.test(key) && /^data:image\/(png|jpeg|webp);base64,/.test(v)));
  k.order = Array.isArray(k.order) ? k.order.map(String) : [];
  fixOrder(k);
  return k;
}
export function listFor(k, kind) { return kind === 'card' ? k.cards : kind === 'piece' ? k.pieces : k.boards; }
export function categoryOf(k, id) { return k.categories.find(c => c.id === id); }
/** Asset data-urls still referenced by any layer, across every item kind. */
export function usedAssets(k) {
  const all = [...k.cards, ...k.pieces, ...k.boards];
  return new Set(all.flatMap(it => it.layers.filter(l => l.kind === 'image').map(l => l.asset)));
}

// ---------- gallery: decks & order ----------
// The gallery is iOS-home-screen style. Its top level is kit.order: a list of keys, each either
// an item id or 'd:<deckId>'. A deck is a stack that can mix cards, pieces and boards; it keeps
// its own item order in deck.order. (Decks are stored in kit.categories, so saves from before
// the gallery open unchanged: every old category simply becomes a deck.) An item belongs to at
// most one deck, recorded in item.category.
export const allItems = k => [...k.cards, ...k.pieces, ...k.boards];
export const itemById = (k, id) => allItems(k).find(i => i.id === id) || null;
export const deckById = (k, id) => k.categories.find(d => d.id === id) || null;
export const deckItems = (k, d) => d.order.map(id => itemById(k, id)).filter(Boolean);

/** Make kit.order / deck.order consistent with the items: every item appears exactly once. */
export function fixOrder(k) {
  const items = allItems(k), byId = new Map(items.map(i => [i.id, i]));
  for (const it of items) if (it.category && !deckById(k, it.category)) it.category = '';
  for (const d of k.categories) {
    const seen = new Set();
    d.order = d.order.filter(id => byId.get(id)?.category === d.id && !seen.has(id) && seen.add(id));
    for (const it of items) if (it.category === d.id && !seen.has(it.id)) d.order.push(it.id);
  }
  const seen = new Set();
  k.order = k.order.filter(key => {
    if (seen.has(key)) return false;
    const ok = key.startsWith('d:') ? !!deckById(k, key.slice(2)) : byId.has(key) && !byId.get(key).category;
    return ok && seen.add(key);
  });
  for (const d of k.categories) if (!seen.has('d:' + d.id)) k.order.push('d:' + d.id);
  for (const it of items) if (!it.category && !seen.has(it.id)) k.order.push(it.id);
  return k;
}
/** Take an item out of wherever it is (top level or a deck). */
export function detach(k, id) {
  const it = itemById(k, id); if (!it) return null;
  const d = it.category && deckById(k, it.category);
  if (d) d.order = d.order.filter(x => x !== id);
  k.order = k.order.filter(x => x !== id);
  it.category = '';
  return it;
}
/** Put an item on the top level, before `beforeKey` (or at the end). */
export function placeTop(k, id, beforeKey = null) {
  if (!detach(k, id)) return;
  const i = beforeKey ? k.order.indexOf(beforeKey) : -1;
  k.order.splice(i < 0 ? k.order.length : i, 0, id);
}
/** Put an item into a deck, before `beforeId` (or at the end). */
export function placeInDeck(k, id, deckId, beforeId = null) {
  const d = deckById(k, deckId), it = d && detach(k, id); if (!it) return;
  it.category = deckId;
  const i = beforeId ? d.order.indexOf(beforeId) : -1;
  d.order.splice(i < 0 ? d.order.length : i, 0, id);
}
/** Make a new deck where the first item sits, holding all the given items (iOS "drop onto"). */
export function newDeckFrom(k, ids, name = 'New deck') {
  const d = { ...newCategory(name), order: [] };
  const first = itemById(k, ids[0]);
  const at = first && !first.category ? k.order.indexOf(ids[0]) : -1;
  k.categories.push(d);
  k.order.splice(at < 0 ? k.order.length : at, 0, 'd:' + d.id);
  for (const id of ids) placeInDeck(k, id, d.id);
  return d;
}
/** Remove a deck; its items go back to the top level where the deck was. */
export function ungroupDeck(k, deckId) {
  const d = deckById(k, deckId); if (!d) return;
  const at = k.order.indexOf('d:' + deckId);
  for (const id of [...d.order].reverse()) { const it = itemById(k, id); if (it) { it.category = ''; k.order.splice(at < 0 ? k.order.length : at + 1, 0, id); } }
  k.order = k.order.filter(x => x !== 'd:' + deckId);
  k.categories = k.categories.filter(x => x !== d);
}
export function dropEmptyDecks(k) {
  for (const d of [...k.categories]) if (!d.order.length) ungroupDeck(k, d.id);
}
export function deleteItems(k, ids) {
  const gone = new Set(ids);
  for (const it of allItems(k)) if (gone.has(it.id)) detach(k, it.id);
  k.cards = k.cards.filter(i => !gone.has(i.id)); k.pieces = k.pieces.filter(i => !gone.has(i.id)); k.boards = k.boards.filter(i => !gone.has(i.id));
  dropEmptyDecks(k);
}
/** Copy an item (new ids for it and its layers) right after the original. */
export function duplicateItem(k, id) {
  const it = itemById(k, id); if (!it) return null;
  const copy = JSON.parse(JSON.stringify(it));
  copy.id = newId(it.kind[0]); copy.name = (it.name + ' copy').slice(0, 60);
  for (const L of copy.layers) L.id = newId('L');
  listFor(k, it.kind).push(copy);
  const after = arr => { const i = arr.indexOf(id); arr.splice(i < 0 ? arr.length : i + 1, 0, copy.id); };
  if (it.category) after(deckById(k, it.category).order); else after(k.order);
  return copy;
}
/** Write a reordered *visible subset* back into a longer list, keeping hidden entries in place
 *  (so reordering while filtered to "Cards" never scrambles pieces and boards). */
export function reorderSubset(list, subset) {
  const want = new Set(subset), slots = [];
  list.forEach((key, i) => { if (want.has(key)) slots.push(i); });
  const out = [...list];
  slots.forEach((slot, j) => { out[slot] = subset[j]; });
  return out;
}
