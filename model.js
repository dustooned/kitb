// Data model + sanitizing. Anything that enters the app (autosave, imported kit.json, dropped
// PNGs) passes through here, so numbers are numbers and ids are safe before touching the DOM.
export const SAFE_ID = /^[\w-]{1,32}$/;
export const newId = (p = 'i') => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const SHAPES = ['circle', 'square', 'rounded', 'hex', 'diamond'];
export const SHAPE_LABELS = { circle: 'Circle', square: 'Square', rounded: 'Rounded square', hex: 'Hexagon', diamond: 'Diamond' };
export const DEFAULT_COLORS = ['#e0533d', '#3d8ee0', '#3dbf6b', '#e0b23d', '#8e5de0', '#e05dbb', '#4b5563'];

const num = (v, d) => (v !== '' && v != null && Number.isFinite(+v)) ? +v : d;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex = (v, d) => /^#[0-9a-f]{6}$/i.test(v) ? v : d;
const str = (v, d, max = 200) => String(v ?? d).slice(0, max);
const id = (v, p) => SAFE_ID.test(v) ? v : newId(p);

export function defaultArt() { return { asset: '', x: 0, y: 0, scale: 1, rot: 0 }; }
function cleanArt(a) {
  a = a || {};
  return { asset: typeof a.asset === 'string' ? a.asset : '', x: num(a.x, 0), y: num(a.y, 0), scale: clamp(num(a.scale, 1), 0.1, 8), rot: num(a.rot, 0) % 360 };
}

export function newCategory(name = 'New category') {
  return { id: newId('cat'), name: str(name, 'Category', 40), color: DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)] };
}
function cleanCategory(c) { return { id: id(c.id, 'cat'), name: str(c.name, 'Category', 40), color: hex(c.color, DEFAULT_COLORS[0]) }; }

export function newCard(categoryId = '') {
  return { id: newId('card'), kind: 'card', name: 'New card', category: categoryId, value: '', text: '', stats: [], count: 1, art: defaultArt() };
}
function cleanCard(c, catIds) {
  return {
    id: id(c.id, 'card'), kind: 'card', name: str(c.name, 'Untitled', 60), category: catIds.has(c.category) ? c.category : '',
    value: str(c.value, '', 6), text: str(c.text, '', 400),
    stats: (Array.isArray(c.stats) ? c.stats : []).slice(0, 6).map(s => ({ label: str(s?.label, '', 16), value: str(s?.value, '', 10) })),
    count: clamp(num(c.count, 1), 1, 999) | 0, art: cleanArt(c.art),
  };
}

export function newPiece(categoryId = '') {
  return { id: newId('pc'), kind: 'piece', name: 'New piece', category: categoryId, shape: 'circle', size: 100, count: 1, art: defaultArt() };
}
function cleanPiece(p, catIds) {
  return {
    id: id(p.id, 'pc'), kind: 'piece', name: str(p.name, 'Untitled', 60), category: catIds.has(p.category) ? p.category : '',
    shape: SHAPES.includes(p.shape) ? p.shape : 'circle', size: clamp(num(p.size, 100), 20, 400) | 0,
    count: clamp(num(p.count, 1), 1, 999) | 0, art: cleanArt(p.art),
  };
}

export function emptyKit() {
  return { format: 'curriculum-forge', version: 1, title: 'My Game Kit', className: '', author: '', categories: [], cards: [], pieces: [], assets: {} };
}
/** Hydrate + sanitize a kit loaded from IndexedDB or an imported file. */
export function normalizeKit(o) {
  const k = { ...emptyKit(), ...(o || {}) };
  k.title = str(k.title, 'My Game Kit', 80);
  k.className = str(k.className, '', 80);
  k.author = str(k.author, '', 80);
  k.categories = (Array.isArray(k.categories) ? k.categories : []).filter(c => c && c.name).map(cleanCategory);
  const catIds = new Set(k.categories.map(c => c.id));
  k.cards = (Array.isArray(k.cards) ? k.cards : []).filter(Boolean).map(c => cleanCard(c, catIds));
  k.pieces = (Array.isArray(k.pieces) ? k.pieces : []).filter(Boolean).map(p => cleanPiece(p, catIds));
  k.assets = Object.fromEntries(Object.entries(k.assets || {}).filter(([key, v]) => SAFE_ID.test(key) && /^data:image\/(png|jpeg|webp);base64,/.test(v)));
  return k;
}
/** Asset ids still referenced by a card or piece art layer. */
export function usedAssets(k) {
  return new Set([...k.cards, ...k.pieces].map(x => x.art?.asset).filter(Boolean));
}
export function categoryOf(k, id) { return k.categories.find(c => c.id === id); }
