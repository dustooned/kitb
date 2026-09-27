import * as store from './store.js';
import {
  emptyKit, normalizeKit, newCategory, newItem, newImageLayer, newTextLayer, newShapeLayer,
  newFrameLayer, cleanSvgEls, SVG_TAGS, categoryOf, listFor, KINDS, SIZE_PRESETS, MASKS, MASK_LABELS, SHAPES, SHAPE_LABELS, FONTS,
  MIN_IN, MAX_IN, newId,
} from './model.js';
import { itemSVG, toPNG, docSize, esc, layerBox, BLENDS, LAYER_FX, FX_COLOR } from './render.js';
import { I } from './icons.js';
import { slug, printQueue, packPrintPages, kitWarnings, readme, PRINT_DPI, PAGE_W, PAGE_H } from './project.js';
import { VERSION, CODENAME } from './version.js';

const $ = sel => document.querySelector(sel);
const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
const PSD_URL = 'https://cdn.jsdelivr.net/npm/ag-psd@21/+esm';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.mjs';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4/build/pdf.worker.mjs';
let jszipLib = null, agPsdLib = null, pdfjsLib = null;
async function lib() { return jszipLib ||= (await import(JSZIP_URL)).default; }
async function loadAgPsd() { return agPsdLib ||= (await import(PSD_URL)).readPsd; }
async function loadPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const m = await import(PDFJS_URL);
  m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  return pdfjsLib = m;
}

let kit = emptyKit();
let ui = { tab: 'card', selId: null, selLayer: null, mview: 'items', tool: 'move', space: false };
let saveTimer = null, undoTimer = null, preSnap = null;
let undoStack = [], redoStack = [];

// ---------- persistence ----------
async function load() {
  const saved = await store.get('kit');
  kit = normalizeKit(saved || emptyKit());
  if (!saved) kit.categories.push(newCategory('General'));
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set('kit', kit).catch(() => {}), 400);
}

// ---------- undo/redo ----------
// snap() captures the pre-change state once per "burst" of activity (a drag, a typing session).
// scheduleUndoCommit() re-arms a debounce that folds the whole burst into a single undo step.
function snap() { preSnap ||= JSON.stringify(kit); }
function pushUndo(pre) {
  const cur = JSON.stringify(kit);
  if (cur !== pre) { undoStack.push(pre); if (undoStack.length > 30) undoStack.shift(); redoStack = []; }
  updateUndoButtons();
}
function finalizeUndo() { if (preSnap) { pushUndo(preSnap); preSnap = null; } }
function scheduleUndoCommit() { clearTimeout(undoTimer); undoTimer = setTimeout(finalizeUndo, 600); }
function doUndo() {
  finalizeUndo();
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(kit));
  kit = normalizeKit(JSON.parse(undoStack.pop()));
  afterHistory();
}
function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(kit));
  kit = normalizeKit(JSON.parse(redoStack.pop()));
  afterHistory();
}
function afterHistory() {
  if (!listFor(kit, ui.tab)?.some(i => i.id === ui.selId)) ui.selId = null;
  ui.selLayer = null;
  updateUndoButtons(); scheduleSave(); renderAll();
}
function updateUndoButtons() { $('#btnUndo').disabled = !undoStack.length; $('#btnRedo').disabled = !redoStack.length; }

// ---------- toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

// ---------- selection helpers ----------
function items() { return listFor(kit, ui.tab) || []; }
function selected() { return items().find(x => x.id === ui.selId) || null; }
function selectedLayer() { const it = selected(); return it?.layers.find(l => l.id === ui.selLayer) || null; }
const clampIn = v => Math.min(MAX_IN, Math.max(MIN_IN, Number.isFinite(v) ? v : 1));

// ---------- top bar ----------
function bindTopbar() {
  $('#kitTitle').value = kit.title;
  $('#kitTitle').addEventListener('focus', () => snap());
  $('#kitTitle').addEventListener('input', e => { kit.title = e.target.value.slice(0, 80) || 'My Game Kit'; scheduleSave(); scheduleUndoCommit(); if ($('#infoTitle')) $('#infoTitle').value = kit.title; });
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  document.querySelectorAll('.mnav').forEach(btn => btn.addEventListener('click', () => setMobileView(btn.dataset.view)));
  $('#btnUndo').addEventListener('click', doUndo);
  $('#btnRedo').addEventListener('click', doRedo);
  $('#btnAddCat').addEventListener('click', () => {
    const pre = JSON.stringify(kit);
    kit.categories.push(newCategory('New category'));
    pushUndo(pre); scheduleSave(); renderSidebar();
  });
  $('#btnAddItem').addEventListener('click', () => {
    if (ui.tab === 'info') return;
    const pre = JSON.stringify(kit);
    const catId = kit.categories[0]?.id || '';
    const item = newItem(ui.tab, catId);
    listFor(kit, ui.tab).push(item);
    ui.selId = item.id; ui.selLayer = null;
    pushUndo(pre); scheduleSave(); renderAll(); setMobileView('canvas');
  });
  $('#btnExport').addEventListener('click', exportZip);
  $('#btnPrint').addEventListener('click', printCards);
  $('#btnTable').addEventListener('click', sendToTable);
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
  document.addEventListener('keydown', onKeydown);
}
function onKeydown(e) {
  const tag = document.activeElement?.tagName;
  const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); return; }
  if (typing || !selected()) return;
  if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); return zoomAt(view.z * 1.25); }
  if (mod && e.key === '-') { e.preventDefault(); return zoomAt(view.z * 0.8); }
  if (mod && e.key === '0') { e.preventDefault(); return zoomAt(1); }
  if (e.key === ' ') { e.preventDefault(); if (!ui.space) { ui.space = true; setTool(ui.tool); } return; }
  // Paint-app single-key tools.
  if (!mod && !e.altKey) {
    const tk = { f: addFrame, v: () => setTool('move'), h: () => setTool('hand'), i: () => $('#toolImage')?.click(), t: addText }[e.key.toLowerCase()];
    if (tk) { e.preventDefault(); return tk(); }
  }
  const L = selectedLayer();
  if (!L) return;
  if (e.key === 'Escape' && ui.frameContent) { ui.frameContent = null; renderLayerProps(); updatePreview(); return; }
  if (e.key === 'Escape') { ui.selLayer = null; renderLayers(); renderLayerProps(); updatePreview(); return; }
  if (L.locked) return;
  if (mod && (e.key.toLowerCase() === 'd' || e.key.toLowerCase() === 'j')) { e.preventDefault(); duplicateLayer(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedLayer(); return; }
  if (e.key === '[' || e.key === ']') { e.preventDefault(); lp.querySelector(`[data-act="${e.key === ']' ? 'front' : 'back'}"]`)?.click(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    snap();
    if (e.key === 'ArrowUp') L.y -= step; if (e.key === 'ArrowDown') L.y += step;
    if (e.key === 'ArrowLeft') L.x -= step; if (e.key === 'ArrowRight') L.x += step;
    updatePreview(); scheduleUndoCommit(); scheduleSave();
  }
}
const spaceUp = () => { if (ui.space) { ui.space = false; setTool(ui.tool); } };
document.addEventListener('keyup', e => { if (e.key === ' ') spaceUp(); });
window.addEventListener('blur', spaceUp);
function setTab(tab) {
  ui.tab = tab; ui.selId = null; ui.selLayer = null;
  $('#infoPane').hidden = tab !== 'info';
  $('#layout').hidden = tab === 'info';
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (tab === 'info') renderInfo(); else renderAll();
  if (tab !== 'info') setMobileView('items');
}
// Mobile shows one panel at a time (bottom nav); a no-op on desktop where CSS keeps all three visible.
function setMobileView(v) {
  ui.mview = v;
  document.body.dataset.mview = v;
  document.querySelectorAll('.mnav').forEach(b => b.setAttribute('aria-current', String(b.dataset.view === v)));
}

// ---------- categories + item list ----------
function renderSidebar() {
  const catList = $('#catList'); catList.innerHTML = '';
  for (const c of kit.categories) {
    const li = document.createElement('li');
    li.className = 'catRow';
    li.innerHTML = `<input type="color" value="${c.color}" aria-label="Category color">
      <input type="text" value="${esc(c.name)}" maxlength="40" aria-label="Category name">
      <button class="iconbtn danger" type="button" title="Delete category">✕</button>`;
    const [colorEl, nameEl, delEl] = li.children;
    colorEl.addEventListener('focus', () => snap());
    colorEl.addEventListener('input', e => { c.color = e.target.value; scheduleSave(); scheduleUndoCommit(); });
    nameEl.addEventListener('focus', () => snap());
    nameEl.addEventListener('input', e => { c.name = e.target.value.slice(0, 40) || 'Category'; scheduleSave(); scheduleUndoCommit(); renderItemList(); });
    delEl.addEventListener('click', () => {
      if (!confirm(`Delete category "${c.name}"? Cards/pieces/boards using it become uncategorized.`)) return;
      const pre = JSON.stringify(kit);
      kit.categories = kit.categories.filter(x => x.id !== c.id);
      for (const x of [...kit.cards, ...kit.pieces, ...kit.boards]) if (x.category === c.id) x.category = '';
      pushUndo(pre); scheduleSave(); renderAll();
    });
    catList.appendChild(li);
  }
  renderItemList();
}
function renderItemList() {
  $('#listLabel').textContent = ui.tab === 'card' ? 'Cards' : ui.tab === 'piece' ? 'Pieces' : 'Boards';
  const ul = $('#itemList'); ul.innerHTML = '';
  if (ui.tab === 'info') return;
  for (const it of items()) {
    const cat = categoryOf(kit, it.category);
    const li = document.createElement('li');
    li.className = 'itemRow' + (it.id === ui.selId ? ' active' : '');
    li.innerHTML = `<span class="swatch" style="background:${cat?.color || '#9ca3af'}"></span><span class="itemName"></span><button class="iconbtn danger" type="button" title="Delete">✕</button>`;
    li.querySelector('.itemName').textContent = it.name || 'Untitled';
    li.addEventListener('click', e => { if (e.target.closest('button')) return; ui.selId = it.id; ui.selLayer = null; renderAll(); setMobileView('canvas'); });
    li.querySelector('button').addEventListener('click', () => {
      if (!confirm(`Delete "${it.name}"?`)) return;
      const pre = JSON.stringify(kit);
      const list = listFor(kit, it.kind); list.splice(list.indexOf(it), 1);
      if (ui.selId === it.id) { ui.selId = null; ui.selLayer = null; }
      pushUndo(pre); scheduleSave(); renderAll();
    });
    ul.appendChild(li);
  }
}

// ---------- editor: document panel ----------
function catOptions(sel) {
  return kit.categories.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    || '<option value="">(add a category first)</option>';
}
function docPanelHTML(it) {
  const presets = SIZE_PRESETS[it.kind];
  return `
  <label>Name <input id="fName" type="text" maxlength="60" value="${esc(it.name)}"></label>
  <label>Category <select id="fCat">${catOptions(it.category)}</select></label>
  <label>Size <select id="fPreset">${presets.map(p => `<option value="${p.id}" ${p.id === it.preset ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
  <label>Width (in) <input id="fW" type="number" min="${MIN_IN}" max="${MAX_IN}" step="0.05" value="${it.size.w}"></label>
  <label>Height (in) <input id="fH" type="number" min="${MIN_IN}" max="${MAX_IN}" step="0.05" value="${it.size.h}"></label>
  ${it.kind === 'piece' ? `<label>Shape <select id="fMask">${MASKS.filter(m => m !== 'none').map(m => `<option value="${m}" ${m === it.mask ? 'selected' : ''}>${MASK_LABELS[m]}</option>`).join('')}</select></label>` : ''}
  <label>Copies to print <input id="fCount" type="number" min="1" max="999" value="${it.count}"></label>`;
}
function bindDocPanel(it) {
  const nameEl = $('#fName');
  nameEl.addEventListener('focus', () => snap());
  nameEl.addEventListener('input', e => { it.name = e.target.value.slice(0, 60) || 'Untitled'; scheduleSave(); scheduleUndoCommit(); renderItemList(); });
  $('#fCat').addEventListener('change', e => { const pre = JSON.stringify(kit); it.category = e.target.value; pushUndo(pre); scheduleSave(); renderItemList(); });
  $('#fPreset').addEventListener('change', e => {
    const pre = JSON.stringify(kit);
    const p = SIZE_PRESETS[it.kind].find(p => p.id === e.target.value);
    it.preset = p.id; it.size = { w: p.w, h: p.h };
    pushUndo(pre); scheduleSave(); renderEditor();
  });
  $('#fW').addEventListener('change', e => { const pre = JSON.stringify(kit); it.size.w = clampIn(+e.target.value); it.preset = 'custom'; pushUndo(pre); scheduleSave(); renderEditor(); });
  $('#fH').addEventListener('change', e => { const pre = JSON.stringify(kit); it.size.h = clampIn(+e.target.value); it.preset = 'custom'; pushUndo(pre); scheduleSave(); renderEditor(); });
  $('#fMask')?.addEventListener('change', e => { const pre = JSON.stringify(kit); it.mask = e.target.value; pushUndo(pre); scheduleSave(); updatePreview(); });
  $('#fCount').addEventListener('input', e => { it.count = Math.max(1, Math.min(999, +e.target.value | 0 || 1)); scheduleSave(); });
}

// ---------- editor: tool rail + zoom pill ----------
const FRAME_ICO = '<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 4l16 16M20 4L4 20"/></svg>';
const SHAPE_ICONS = { rect: '<rect x="4" y="6" width="16" height="12" rx="2"/>', ellipse: '<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>', triangle: '<path d="M12 4l8.5 15h-17z"/>', star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3 1.2-6-4.5-4.1 6-.7z"/>', line: '<path d="M5 19L19 5"/>' };
const shapeIco = (s, fill = 'none') => `<svg class="ico" viewBox="0 0 24 24" width="20" height="20" fill="${fill}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true">${SHAPE_ICONS[s] || SHAPE_ICONS.rect}</svg>`;
function toolRowHTML() {
  const b = (attrs, icon, label, title) => `<button type="button" class="tool" ${attrs} title="${title}" aria-label="${title}">${icon}<small>${label}</small></button>`;
  return b('data-tool="move" aria-pressed="true"', I.move, 'Move', 'Move & select (V)') + b('data-tool="hand" aria-pressed="false"', I.hand, 'Pan', 'Pan the canvas (H, or hold Space)')
    + '<span class="rail-sep" aria-hidden="true"></span>'
    + `<label class="tool" title="Add an image, PSD or PDF (I)">${I.image}<small>Image</small><input id="toolImage" type="file" accept="image/*,.svg,.psd,.pdf,.ai" hidden></label>`
    + b('id="toolText"', I.text, 'Text', 'Add text (T)')
    + b('id="toolFrame"', FRAME_ICO, 'Frame', 'Add a picture frame (F)')
    + SHAPES.map(s => b(`data-shape="${s}"`, shapeIco(s), s === 'rect' ? 'Box' : SHAPE_LABELS[s], `Add a ${SHAPE_LABELS[s].toLowerCase()}`)).join('');
}
function addLayer(L) {
  const it = selected(); if (!it) return;
  const pre = JSON.stringify(kit);
  it.layers.push(L); ui.selLayer = L.id;
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
}
function addFrame() { const it = selected(); if (it) { const { w, h } = docSize(it); addLayer(newFrameLayer(w, h)); toast('Frame added — place an image in it from the panel, or drop one onto it.'); } }
function toggleFrameContent(L) {
  ui.frameContent = ui.frameContent === L.id ? null : L.id;
  renderLayerProps(); updatePreview();
  if (ui.frameContent) toast('Moving the picture inside the frame — double-click or Esc when done.');
}
/** Put a picture into a frame, filling it (InDesign "Fill frame proportionally"). */
async function placeInFrame(file, L) {
  if (!file.type.startsWith('image/')) throw new Error('Frames take PNG, JPG or WebP pictures.');
  const img = await fileToImage(file), dataUrl = trimAndEncode(img, false), probe = await dataUrlSize(dataUrl);
  Object.assign(L, { frame: true, img: dataUrl, imgW: probe.w, imgH: probe.h, imgFit: 'fill', imgScale: 1, imgX: 0, imgY: 0 });
}
function addText() { const it = selected(); if (it) { const { w, h } = docSize(it); addLayer(newTextLayer(w, h)); } }
function bindToolRow() {
  $('#toolRow').addEventListener('click', e => {
    const t = e.target.closest('[data-tool]'); if (t) return setTool(t.dataset.tool);
    const s = e.target.closest('[data-shape]'); if (!s) return;
    const it = selected(); if (!it) return;
    const { w, h } = docSize(it); addLayer(newShapeLayer(s.dataset.shape, w, h));
  });
  $('#toolText').addEventListener('click', addText);
  $('#toolFrame').addEventListener('click', addFrame);
  // Double-click a filled frame to move the picture inside it (and again to stop).
  $('#previewSvg').addEventListener('dblclick', e => {
    const L = selectedLayer(); if (!L?.frame || !L.img || !e.target.closest(`[data-layer="${L.id}"]`)) return;
    toggleFrameContent(L);
  });
  $('#toolImage').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    await importAnyImage(f);
    e.target.value = '';
  });
  $('#zoomPill').innerHTML = `<button type="button" data-z="out" title="Zoom out (Ctrl −)" aria-label="Zoom out">${I.minus}</button><button type="button" id="zoomPct" data-z="fit" title="Fit (Ctrl 0)">100%</button><button type="button" data-z="in" title="Zoom in (Ctrl +)" aria-label="Zoom in">${I.plus}</button>`;
  $('#zoomPill').addEventListener('click', e => { const z = e.target.closest('[data-z]')?.dataset.z; if (z) zoomAt(z === 'fit' ? 1 : view.z * (z === 'in' ? 1.25 : 0.8)); });
  $('#canvasStage').addEventListener('wheel', e => {
    const it = selected(); if (!it || e.target.closest('.rail, .zoom-pill')) return;
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); zoomAt(view.z * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY); }
    else if (view.z > 1) { e.preventDefault(); const k = metrics().k; view.cx += e.deltaX / k; view.cy += e.deltaY / k; applyViewBox(); }
  }, { passive: false });
}
function setTool(name) {
  ui.tool = name;
  document.querySelectorAll('#toolRow [data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === name)));
  $('#canvasStage').classList.toggle('hand', name === 'hand' || ui.space);
}

// ---------- canvas zoom & pan ----------
// z plus the document point at the centre of the preview. Only the preview <svg>'s viewBox
// changes, so exports and the pointer maths (getScreenCTM) are unaffected.
const view = { z: 1, cx: 0, cy: 0, item: null, px: 0 };
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function viewBoxFor(it) {
  const { w, h } = docSize(it);
  if (view.item !== it.id) Object.assign(view, { z: 1, item: it.id });
  if (view.z <= 1.001 || !Number.isFinite(view.cx + view.cy)) Object.assign(view, { z: 1, cx: w / 2, cy: h / 2 });
  view.cx = clampN(view.cx, 0, w); view.cy = clampN(view.cy, 0, h);
  const vw = w / view.z, vh = h / view.z;
  return `${(view.cx - vw / 2).toFixed(2)} ${(view.cy - vh / 2).toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`;
}
function applyViewBox() {
  const it = selected(), el = document.querySelector('#previewSvg svg'); if (!it || !el) return;
  el.setAttribute('viewBox', viewBoxFor(it));
  $('#zoomPct').textContent = Math.round(view.z * 100) + '%';
  $('#canvasStage').classList.toggle('zoomed', view.z > 1);
}
function metrics() {
  const el = document.querySelector('#previewSvg svg'), r = el.getBoundingClientRect(), { w } = docSize(selected());
  return { x: r.left + r.width / 2, y: r.top + r.height / 2, k: r.width / (w / view.z) };
}
// Zoom so the document point under (px, py) stays under the cursor.
function zoomAt(z, px, py) {
  if (!selected() || !document.querySelector('#previewSvg svg')) return;
  const m = metrics(); if (!m.k) return; px ??= m.x; py ??= m.y;
  const ax = view.cx + (px - m.x) / m.k, ay = view.cy + (py - m.y) / m.k, z0 = view.z;
  view.z = clampN(z, 1, 12);
  const k2 = m.k * view.z / z0;
  view.cx = ax - (px - m.x) / k2; view.cy = ay - (py - m.y) / k2;
  updatePreview();
}

// ---------- editor: layers list ----------
function layerThumb(L) {
  if (L.kind === 'image') return `<img class="thumb img" src="${esc(liveHref(L.asset))}" alt="">`;
  if (L.kind === 'text') return `<span class="thumb txt" style="color:${esc(L.color)}">Aa</span>`;
  return `<span class="thumb" style="color:${esc(L.shape === 'line' ? L.fill : L.stroke || '#1d2030')}">${shapeIco(L.shape, L.shape === 'line' ? 'none' : esc(L.fill))}</span>`;
}
function renderLayers() {
  const it = selected(); const ul = $('#layerList'); ul.innerHTML = '';
  if (!it) return;
  ul.dataset.layers = '1';
  ul.innerHTML = [...it.layers].reverse().map(L => {
    const bits = [L.frame ? (L.img ? 'Frame · picture' : 'Empty frame') : L.kind === 'shape' ? SHAPE_LABELS[L.shape] : L.kind === 'image' ? (L.vector ? 'Vector' : 'Image') : 'Text'];
    if (L.blend && L.blend !== 'normal') bits.push(BLENDS[L.blend]);
    if (L.opacity < 1) bits.push(Math.round(L.opacity * 100) + '%');
    return `<li class="lp-row${L.id === ui.selLayer ? ' on' : ''}${L.hidden ? ' off' : ''}" data-row="${L.id}">
      <span class="grip" data-grip="${L.id}" title="Drag to restack">${I.grip}</span>${layerThumb(L)}
      <button type="button" class="nm" data-pick="${L.id}"><span class="layerNameText">${esc(L.name)}</span><small>${bits.join(' · ')}</small></button>
      <button type="button" class="lp-ic lock" data-lact="locked" data-id="${L.id}" title="${L.locked ? 'Unlock' : 'Lock'}" aria-label="${L.locked ? 'Unlock' : 'Lock'}" aria-pressed="${L.locked}">${L.locked ? I.lock : I.unlock}</button>
      <button type="button" class="lp-ic" data-lact="hidden" data-id="${L.id}" title="${L.hidden ? 'Show' : 'Hide'}" aria-label="${L.hidden ? 'Show' : 'Hide'}" aria-pressed="${!L.hidden}">${L.hidden ? I.eyeOff : I.eye}</button></li>`;
  }).join('') || '<li class="lp-empty">No layers yet — use the tools left of the canvas.</li>';
}
function renderLayerRowName(L) {
  const el = document.querySelector(`#layerList [data-row="${L.id}"] .layerNameText`);
  if (el) el.textContent = L.name;
}
$('#layerList').addEventListener('click', e => {
  const it = selected(); if (!it) return;
  const t = e.target.closest('[data-lact]');
  if (t) {
    const L = it.layers.find(l => l.id === t.dataset.id); if (!L) return;
    const pre = JSON.stringify(kit); L[t.dataset.lact] = !L[t.dataset.lact];
    pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview(); return;
  }
  const row = e.target.closest('[data-row]');
  if (row && ui.selLayer !== row.dataset.row) { ui.selLayer = row.dataset.row; renderLayers(); renderLayerProps(); updatePreview(); }
});
// Drag a row's grip to restack (mouse or touch). The list shows top-first, so dropping on a
// row takes that row's place in the stack.
$('#layerList').addEventListener('pointerdown', e => {
  const grip = e.target.closest('[data-grip]'); if (!grip) return;
  e.preventDefault();
  const id = grip.dataset.grip, row = grip.closest('[data-row]'); row.classList.add('dragging');
  let target = null;
  const move = ev => {
    const r = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('#layerList [data-row]');
    document.querySelectorAll('#layerList .drop').forEach(x => x.classList.remove('drop'));
    target = r && r !== row ? r.dataset.row : null;
    if (target) r.classList.add('drop');
  };
  const up = () => {
    window.removeEventListener('pointermove', move); row.classList.remove('dragging');
    const ls = selected()?.layers; if (!target || !ls) return renderLayers();
    const from = ls.findIndex(l => l.id === id), to = ls.findIndex(l => l.id === target); if (from < 0 || to < 0) return;
    const pre = JSON.stringify(kit); ls.splice(to, 0, ls.splice(from, 1)[0]);
    pushUndo(pre); scheduleSave(); renderLayers(); updatePreview();
  };
  window.addEventListener('pointermove', move); window.addEventListener('pointerup', up, { once: true });
});

// ---------- editor: layer properties panel ----------
const SWATCHES = ['#ffffff', '#171724', '#fff9eb', '#e0533d', '#e0b23d', '#3dbf6b', '#3d8ee0', '#8e5de0', '#e05dbb', '#4b5563', '#ffda52', '#89e4d7'];
const FMT = { imgScale: v => Math.round(v * 100) + '%', opacity: v => Math.round(v * 100) + '%', bright: v => Math.round(v * 100) + '%', contrast: v => Math.round(v * 100) + '%', sat: v => Math.round(v * 100) + '%', hue: v => Math.round(v) + '°', fxSize: v => (+v).toFixed(1) + '×', size: v => Math.round(v), strokeWidth: v => Math.round(v), radius: v => Math.round(v), cutTol: v => Math.round(v) };
const slider = (k, label, min, max, step, v) => `<label class="sl"><span>${label}</span><input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><output data-out="${k}">${(FMT[k] || String)(v)}</output></label>`;
const swatches = (k, value) => `<div class="swatches">${SWATCHES.map(v => `<button type="button" class="sw" data-sw="${v}" data-swf="${k}" style="--c:${v}" title="${v}" aria-label="Colour ${v}" aria-pressed="${String(value).toLowerCase() === v}"></button>`).join('')}<label class="sw sw-any" title="Any colour"><input type="color" data-k="${k}" value="${esc(value || '#000000')}" aria-label="Pick any colour"></label></div>`;
const sec = (title, body) => `<div class="psec"><div class="psec-h">${title}</div>${body}</div>`;
const pic = (attrs, icon, title, pressed) => `<button type="button" class="dk-ic" ${attrs} title="${title}" aria-label="${title}"${pressed != null ? ` aria-pressed="${pressed}"` : ''}>${icon}</button>`;
function alignLayer(L, mode) {
  const it = selected(); const { w: dw, h: dh } = docSize(it), { ex, ey } = extents(L);
  if (mode === 'left') L.x = ex; if (mode === 'centerX') L.x = dw / 2; if (mode === 'right') L.x = dw - ex;
  if (mode === 'top') L.y = ey; if (mode === 'centerY') L.y = dh / 2; if (mode === 'bottom') L.y = dh - ey;
}
function styleHTML(L) {
  if (L.kind === 'text') return sec('Text', `<textarea data-k="text" maxlength="300" rows="3" aria-label="Text">${esc(L.text)}</textarea>
    <div class="dock-row"><select data-k="font" aria-label="Font">${FONTS.map(f => `<option value="${esc(f)}" ${f === L.font ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</select>
      <span class="dk-group">${pic('data-toggle="bold"', '<b>B</b>', 'Bold', L.bold)}${pic('data-toggle="italic"', '<i>I</i>', 'Italic', L.italic)}</span>
      <span class="dk-group">${pic('data-talign="left"', I.alignL, 'Align text left', L.align === 'left')}${pic('data-talign="center"', I.alignCH, 'Centre text', L.align === 'center')}${pic('data-talign="right"', I.alignR, 'Align text right', L.align === 'right')}</span></div>
    ${slider('size', 'Size', 10, 200, 1, L.size)}${swatches('color', L.color)}
    <div class="dock-row"><label class="dk-check"><input type="checkbox" data-k="strokeOn" ${L.stroke ? 'checked' : ''}> Outline</label>${L.stroke ? `<input type="color" data-k="stroke" value="${esc(L.stroke)}" aria-label="Outline colour">` : ''}</div>`);
  if (L.kind === 'shape') return frameHTML(L) + sec('Fill &amp; stroke', `${swatches('fill', L.fill)}
    <div class="dock-row"><label class="dk-check"><input type="checkbox" data-k="strokeOn" ${L.stroke ? 'checked' : ''}> Stroke</label>${L.stroke ? `<input type="color" data-k="stroke" value="${esc(L.stroke)}" aria-label="Stroke colour">` : ''}</div>
    ${slider('strokeWidth', 'Stroke', 0, 30, 1, L.strokeWidth)}${L.shape === 'rect' ? slider('radius', 'Corners', 0, 150, 1, L.radius) : ''}`);
  return sec('Image', `<div class="dock-row"><button type="button" class="dk-btn accent" data-act="cutout">${I.wand}<span>${L.orig ? 'Background removed' : 'Remove background'}</span></button>${L.orig ? `<button type="button" class="dk-btn" data-act="restore">${I.restore}<span>Original</span></button>` : ''}</div>
    ${L.orig ? `${slider('cutTol', 'Strength', 5, 120, 1, L.cutTol ?? 40)}<p class="hint small">Too much eaten away? Lower it. Background bits left? Raise it.</p>` : '<p class="hint small">Works best on a plain background: a drawing on white paper, a green screen.</p>'}
    <label class="dk-btn filebtn">${I.restore}<span>Replace image</span><input id="pReplaceFile" type="file" accept="image/*" hidden></label>`)
    + sec('Adjust', `${slider('bright', 'Brightness', 0.4, 1.8, 0.02, L.bright)}${slider('contrast', 'Contrast', 0.4, 1.8, 0.02, L.contrast)}${slider('sat', 'Saturation', 0, 2, 0.05, L.sat)}${slider('hue', 'Hue', -180, 180, 1, L.hue || 0)}
    <button type="button" class="dk-btn" data-act="resetLook">${I.restore}<span>Reset</span></button>`);
}
function frameHTML(L) {
  if (L.shape === 'line') return '';
  if (!L.frame) return sec('Frame', `<button type="button" class="dk-btn" data-act="makeFrame">${FRAME_ICO}<span>Turn into a picture frame</span></button>
    <p class="hint small">A frame holds a picture clipped to this shape, like InDesign or Affinity's layout frames.</p>`);
  const place = `<label class="dk-btn filebtn${L.img ? '' : ' accent'}">${I.image}<span>${L.img ? 'Replace picture' : 'Place picture'}</span><input id="frameFile" type="file" accept="image/*" hidden></label>`;
  if (!L.img) return sec('Frame', `<div class="dock-row">${place}<button type="button" class="dk-btn" data-act="unframe">${I.restore}<span>Back to shape</span></button></div>
    <p class="hint small">…or select the frame and drop a picture onto the canvas.</p>`);
  const moving = ui.frameContent === L.id;
  return sec('Frame', `<div class="seg-soft" role="group" aria-label="Fit"><button type="button" data-imgfit="fill" aria-pressed="${L.imgFit !== 'fit'}">Fill frame</button><button type="button" data-imgfit="fit" aria-pressed="${L.imgFit === 'fit'}">Fit whole picture</button></div>
    ${slider('imgScale', 'Zoom', 0.2, 4, 0.01, L.imgScale || 1)}
    <div class="dock-row"><button type="button" class="dk-btn${moving ? ' accent' : ''}" data-act="frameContent" aria-pressed="${moving}">${I.move}<span>${moving ? 'Done moving picture' : 'Move picture'}</span></button>
      <button type="button" class="dk-btn" data-act="frameCenter">${I.center}<span>Center</span></button></div>
    <div class="dock-row">${place}<button type="button" class="dk-btn" data-act="frameClear">${I.trash}<span>Empty frame</span></button><button type="button" class="dk-btn" data-act="unframe">${I.restore}<span>Back to shape</span></button></div>
    <p class="hint small">Double-click the frame to move the picture inside it.</p>`);
}
function renderLayerProps() {
  const L = selectedLayer(); const box = $('#layerProps');
  if (!L) { box.innerHTML = '<p class="hint small">Select a layer on the canvas or in the list to edit it.</p>'; return; }
  const fx = L.fx || 'none';
  box.innerHTML = `
    <div class="propHead">${layerThumb(L)}<input data-k="name" class="layerNameBig" type="text" maxlength="40" value="${esc(L.name)}" aria-label="Layer name">
      ${pic('data-act="lock"', L.locked ? I.lock : I.unlock, L.locked ? 'Unlock' : 'Lock', L.locked)}</div>
    ${L.locked ? '<p class="hint small">🔒 Locked so it can\'t be nudged by accident. Unlock it to edit.</p>' : ''}
    <fieldset id="propFields" ${L.locked ? 'disabled' : ''}>
      ${sec('Arrange', `<div class="dock-row"><span class="dk-group">${pic('data-align="left"', I.alignL, 'Align left')}${pic('data-align="centerX"', I.alignCH, 'Centre horizontally')}${pic('data-align="right"', I.alignR, 'Align right')}</span>
        <span class="dk-group">${pic('data-align="top"', I.alignT, 'Align top')}${pic('data-align="centerY"', I.alignCV, 'Centre vertically')}${pic('data-align="bottom"', I.alignB, 'Align bottom')}</span></div>
        <div class="dock-row"><span class="dk-group">${pic('data-act="back"', I.down, 'Send backward  [')}${pic('data-act="front"', I.up, 'Bring forward  ]')}${pic('data-act="dup"', I.dup, 'Duplicate  Ctrl+D')}${pic('data-act="del"', I.trash, 'Delete  Del')}</span></div>
        ${slider('opacity', 'Opacity', 0, 1, 0.02, L.opacity)}
        <label class="dk-field"><span>Blend</span><select data-k="blend">${Object.entries(BLENDS).map(([k, v]) => `<option value="${k}" ${(L.blend || 'normal') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`)}
      ${styleHTML(L)}
      ${sec('Effects', `<div class="seg-soft" role="group" aria-label="Effect">${Object.entries(LAYER_FX).map(([k, v]) => `<button type="button" data-setfx="${k}" aria-pressed="${fx === k}">${v}</button>`).join('')}</div>
        ${fx !== 'none' ? swatches('fxColor', L.fxColor || FX_COLOR[fx]) + slider('fxSize', 'Amount', 0.2, 3, 0.05, L.fxSize ?? 1) : ''}`)}
    </fieldset>`;
}
const lp = $('#layerProps');
lp.addEventListener('focusin', e => { if (e.target.matches('input, textarea, select')) snap(); });
lp.addEventListener('input', e => {
  const L = selectedLayer(), el = e.target, k = el.dataset.k; if (!L || !k) return;
  const out = lp.querySelector(`[data-out="${k}"]`); if (out) out.textContent = FMT[k](+el.value);
  if (k === 'cutTol') return;
  snap();
  if (k === 'name') { L.name = el.value.slice(0, 40) || L.kind; renderLayerRowName(L); }
  else if (k === 'strokeOn') L.stroke = el.checked ? (L.kind === 'text' ? '#171724' : '#171724') : '';
  else if (k === 'text') L.text = el.value.slice(0, 300);
  else L[k] = el.type === 'range' ? +el.value : el.value;
  if (k === 'blend' && L.blend === 'normal') delete L.blend;
  updatePreview(); scheduleSave(); scheduleUndoCommit();
  if (k === 'strokeOn') renderLayerProps();
  if (['color', 'fill', 'fxColor'].includes(k)) lp.querySelectorAll(`[data-swf="${k}"]`).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sw === el.value.toLowerCase())));
  if (['blend', 'opacity', 'color', 'fill'].includes(k)) renderLayers();
});
lp.addEventListener('change', async e => {
  const L = selectedLayer(); if (!L) return;
  if (e.target.dataset.k === 'cutTol') { L.cutTol = +e.target.value; return cutOut(L); }
  if (e.target.id === 'frameFile') {
    const f = e.target.files[0]; if (!f) return;
    const pre = JSON.stringify(kit);
    try { await placeInFrame(f, L); } catch (err) { toast(err.message || 'Could not load that image.'); return; }
    pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview(); return;
  }
  if (e.target.id === 'pReplaceFile') {
    const f = e.target.files[0]; if (!f) return;
    const pre = JSON.stringify(kit);
    try { await importPlainImage(f, selected(), 0, 0, L); } catch (err) { toast(err.message || 'Could not load that image.'); return; }
    delete L.orig; delete L.cutTol;
    pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
  }
});
lp.addEventListener('click', e => {
  const b = e.target.closest('button'); const L = selectedLayer(); if (!b || !L) return;
  const d = b.dataset;
  if (d.act === 'dup') return duplicateLayer();
  if (d.act === 'del') return deleteSelectedLayer();
  if (d.act === 'cutout') return cutOut(L);
  if (d.act === 'frameContent') return toggleFrameContent(L);
  const pre = JSON.stringify(kit), layers = selected().layers, i = layers.indexOf(L);
  if (d.align) alignLayer(L, d.align);
  else if (d.sw) L[d.swf] = d.sw;
  else if (d.setfx) { if (d.setfx === 'none') delete L.fx; else L.fx = d.setfx; }
  else if (d.toggle) L[d.toggle] = !L[d.toggle];
  else if (d.talign) L.align = d.talign;
  else if (d.act === 'lock') L.locked = !L.locked;
  else if (d.imgfit) Object.assign(L, { imgFit: d.imgfit, imgScale: 1, imgX: 0, imgY: 0 });
  else if (d.act === 'frameCenter') Object.assign(L, { imgX: 0, imgY: 0 });
  else if (d.act === 'makeFrame') L.frame = true;
  else if (d.act === 'frameClear' || d.act === 'unframe') {
    for (const k of ['img', 'imgW', 'imgH', 'imgFit', 'imgScale', 'imgX', 'imgY']) delete L[k];
    if (d.act === 'unframe') delete L.frame;
    ui.frameContent = null;
  }
  else if (d.act === 'restore' && L.orig) { L.asset = L.orig; delete L.orig; delete L.cutTol; }
  else if (d.act === 'resetLook') Object.assign(L, { bright: 1, contrast: 1, sat: 1, hue: 0 });
  else if (d.act === 'front' && i < layers.length - 1) layers.splice(i + 1, 0, layers.splice(i, 1)[0]);
  else if (d.act === 'back' && i > 0) layers.splice(i - 1, 0, layers.splice(i, 1)[0]);
  else return;
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
});
function duplicateLayer() {
  const it = selected(); const L = selectedLayer(); if (!it || !L) return;
  const pre = JSON.stringify(kit);
  const copy = JSON.parse(JSON.stringify(L)); copy.id = newId('L'); copy.x += 16; copy.y += 16; copy.name = (L.name || 'Layer') + ' copy'; copy.locked = false;
  it.layers.splice(it.layers.indexOf(L) + 1, 0, copy); ui.selLayer = copy.id;
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
}
function deleteSelectedLayer() {
  const it = selected(); const L = selectedLayer(); if (!it || !L) return;
  const pre = JSON.stringify(kit);
  it.layers.splice(it.layers.indexOf(L), 1); ui.selLayer = null;
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
  toast('Layer deleted — Ctrl+Z brings it back.');
}

// ---------- remove background ----------
// Flood-fills the most common border colour away from the edges inward, so the same colour
// inside the drawing survives. Always works from the untouched original (L.orig), so the
// Strength slider can be re-tuned without degrading the picture.
async function cutOut(L) {
  const src = L.orig || L.asset; if (!src) return;
  toast('✨ Removing the background…');
  await new Promise(r => setTimeout(r, 30));
  try {
    const img = new Image(); img.src = src; await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h), px = d.data, tol = L.cutTol ?? 40;
    const edge = [];
    for (let x = 0; x < w; x++) edge.push(x, (h - 1) * w + x);
    for (let y = 1; y < h - 1; y++) edge.push(y * w, y * w + w - 1);
    const key = o => (px[o] >> 4) << 8 | (px[o + 1] >> 4) << 4 | (px[o + 2] >> 4), counts = new Map();
    for (const i of edge) if (px[i * 4 + 3] > 15) { const k = key(i * 4); counts.set(k, (counts.get(k) || 0) + 1); }
    if (!counts.size) return toast('This picture already has a see-through background.');
    const best = [...counts].sort((a, b) => b[1] - a[1])[0][0];
    let r = 0, gr = 0, b = 0, n = 0;
    for (const i of edge) { const o = i * 4; if (px[o + 3] > 15 && key(o) === best) { r += px[o]; gr += px[o + 1]; b += px[o + 2]; n++; } }
    r /= n; gr /= n; b /= n;
    const far = o => Math.hypot(px[o] - r, px[o + 1] - gr, px[o + 2] - b), bg = i => px[i * 4 + 3] < 16 || far(i * 4) <= tol;
    const seen = new Uint8Array(w * h), stack = [];
    for (const i of edge) if (!seen[i] && bg(i)) { seen[i] = 1; stack.push(i); }
    while (stack.length) {
      const i = stack.pop(), x = i % w; px[i * 4 + 3] = 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]) if (j >= 0 && j < w * h && !seen[j] && bg(j)) { seen[j] = 1; stack.push(j); }
    }
    // Soften the new edge: pixels touching the cut fade by how close they are to the background.
    for (let i = 0; i < w * h; i++) {
      if (seen[i]) continue;
      const x = i % w;
      if (!((x > 0 && seen[i - 1]) || (x < w - 1 && seen[i + 1]) || (i >= w && seen[i - w]) || (i + w < w * h && seen[i + w]))) continue;
      const o = i * 4, f = far(o); if (f < tol * 2) px[o + 3] = Math.min(px[o + 3], Math.round(255 * (f - tol) / tol));
    }
    g.putImageData(d, 0, 0);
    const pre = JSON.stringify(kit);
    L.orig ||= L.asset; L.asset = cv.toDataURL('image/png'); L.cutTol = tol;
    pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
    toast('✨ Background removed. Tweak Strength if it took too much or too little.');
  } catch (err) { console.error(err); toast("Couldn't remove the background from that picture."); }
}

// ---------- editor: top level ----------
function renderEditor() {
  const it = selected();
  $('#emptyState').hidden = !!it;
  $('#editor').hidden = !it;
  $('#layersPanel').hidden = !it;
  if (!it) return;
  $('#docPanel').innerHTML = docPanelHTML(it);
  bindDocPanel(it);
  const toolRow = $('#toolRow');
  if (!toolRow.dataset.bound) { toolRow.innerHTML = toolRowHTML(); bindToolRow(); toolRow.dataset.bound = '1'; }
  renderLayers();
  renderLayerProps();
  updatePreview();
}

// ---------- canvas: render + drag/scale/rotate handles ----------
/** Embedded image (data: URL, often megabytes) -> a short blob: URL for the live preview only,
 *  decoded once per image, so dragging a layer doesn't re-parse all that base64 every frame. */
const liveHrefs = new Map();
function liveHref(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:')) return dataUrl;
  let url = liveHrefs.get(dataUrl);
  if (!url) {
    const [head, b64] = dataUrl.split(',');
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: head.slice(5, head.indexOf(';')) }));
    liveHrefs.set(dataUrl, url);
  }
  return url;
}
function updatePreview() {
  const it = selected(); if (!it) { $('#previewSvg').innerHTML = ''; return; }
  const selL = selectedLayer(), { w } = docSize(it);
  // Handles are sized in document units per screen pixel, so they look the same on a tiny
  // token and a 24" board, zoomed in or not.
  const handleK = view.px ? (w / Math.max(1, view.z)) / view.px : w / 420;
  const svg = itemSVG(it, 'live', { editing: true, sel: (selL && !selL.locked) ? selL.id : null, href: liveHref, handleK, frameContent: ui.frameContent });
  $('#previewSvg').innerHTML = svg;
  const el = $('#previewSvg svg');
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => onCanvasPointerDown(e, it, el));
  applyViewBox();
  const px = el.getBoundingClientRect().width;
  if (px && Math.abs(px - view.px) > 1) { view.px = px; updatePreview(); }
}
// Every update rebuilds the preview <svg>, so a gesture can't listen on (or capture the pointer
// to) the element it started on — that element is gone after the first move, and the drag would
// stop dead. Gestures listen on the window instead, until the pointer is released.
function trackGesture(onMove, onEnd) {
  // A point the browser couldn't map (preview mid-rebuild, zero-size) is skipped, never
  // written into the layer as NaN.
  const move = ev => { if (document.querySelector('#previewSvg svg')?.getScreenCTM()) onMove(ev); };
  const up = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    onEnd?.();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
}
// Axis-aligned half-size of a layer after scale + rotation (for snapping and align buttons).
function extents(L) {
  const { hw, hh } = layerBox(L), r = (L.rot || 0) * Math.PI / 180, c = Math.abs(Math.cos(r)), n = Math.abs(Math.sin(r));
  return { ex: (hw * c + hh * n) * L.scale, ey: (hw * n + hh * c) * L.scale };
}
// Smart guides: snap the layer's centre or edges to the document's centre and edges, and draw
// a pink line while snapped. Hold Alt to move freely.
function snapMove(L, it, free) {
  const lines = [];
  if (!free) {
    const { w, h } = docSize(it), { ex, ey } = extents(L), thr = 7 * (view.px ? (w / view.z) / view.px : 1);
    for (const [axis, list, e] of [['x', [[w / 2, 0], [0, -1], [w, 1]], ex], ['y', [[h / 2, 0], [0, -1], [h, 1]], ey]])
      for (const [v, side] of list) { const pos = L[axis] + side * e; if (Math.abs(pos - v) < thr) { L[axis] += v - pos; lines.push([axis, v]); break; } }
  }
  return lines;
}
function drawGuides(lines) {
  const g = document.querySelector('#previewSvg #guides'), it = selected(); if (!g || !it) return;
  const { w, h } = docSize(it), sw = (1.5 * (view.px ? (w / view.z) / view.px : 1)).toFixed(2);
  g.innerHTML = lines.map(([a, v]) => a === 'x' ? `<line x1="${v}" y1="0" x2="${v}" y2="${h}" stroke="#ff3ea5" stroke-width="${sw}"/>` : `<line x1="0" y1="${v}" x2="${w}" y2="${v}" stroke="#ff3ea5" stroke-width="${sw}"/>`).join('');
}
function onCanvasPointerDown(e, it, el) {
  const handle = e.target.closest('[data-handle]');
  const layerEl = e.target.closest('[data-layer]');
  // Screen -> card units through the browser's own transform for the *current* preview <svg>
  // (it's rebuilt on every update). Unlike width-ratio math this is exact when the card is
  // letterboxed inside a differently-shaped preview box, and never divides by a zero-size box.
  const toDoc = ev => {
    const s = document.querySelector('#previewSvg svg'), m = s?.getScreenCTM();
    if (!m) return [NaN, NaN];
    const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
    return [p.x, p.y];
  };
  // Pan: the hand tool, Space, the middle button, or dragging empty space while zoomed in.
  const panning = ui.tool === 'hand' || ui.space || e.button === 1;
  if (panning || (!handle && !layerEl && view.z > 1)) {
    e.preventDefault();
    if (!panning && ui.selLayer) { ui.selLayer = null; renderLayers(); renderLayerProps(); updatePreview(); }
    const k = metrics().k, x0 = e.clientX, y0 = e.clientY, cx0 = view.cx, cy0 = view.cy;
    $('#canvasStage').classList.add('panning');
    trackGesture(ev => { view.cx = cx0 - (ev.clientX - x0) / k; view.cy = cy0 - (ev.clientY - y0) / k; applyViewBox(); }, () => $('#canvasStage').classList.remove('panning'));
    return;
  }
  if (handle && ui.selLayer) {
    const L = selectedLayer(); if (!L || L.locked) return;
    e.preventDefault();
    snap();
    if (handle.dataset.handle === 'scale') {
      // Corners keep proportions; hold Shift to reshape freely (width and height separately —
      // a frame or image then crops instead of squashing its picture).
      const [sx, sy] = toDoc(e), startDist = Math.hypot(sx - L.x, sy - L.y) || 1, startScale = L.scale, w0 = L.w, h0 = L.h;
      trackGesture(ev => {
        const [px, py] = toDoc(ev), dist = Math.hypot(px - L.x, py - L.y);
        if (ev.shiftKey) {
          const r = (L.rot || 0) * Math.PI / 180, dx = px - L.x, dy = py - L.y;
          L.scale = startScale;
          L.w = Math.max(4, 2 * Math.abs(dx * Math.cos(r) + dy * Math.sin(r)) / L.scale);
          L.h = Math.max(4, 2 * Math.abs(-dx * Math.sin(r) + dy * Math.cos(r)) / L.scale);
        } else { L.w = w0; L.h = h0; L.scale = Math.max(0.05, Math.min(20, startScale * (dist / startDist))); }
        updatePreview(); scheduleUndoCommit(); scheduleSave();
      });
    } else {
      const angleAt = (x, y) => Math.atan2(y - L.y, x - L.x) * 180 / Math.PI;
      const [sx, sy] = toDoc(e), startAngle = angleAt(sx, sy), startRot = L.rot;
      trackGesture(ev => {
        const [px, py] = toDoc(ev);
        let r = startRot + (angleAt(px, py) - startAngle);
        if (ev.shiftKey) r = Math.round(r / 15) * 15; else if (Math.abs(((r % 360) + 540) % 360 - 180) < 3) r = Math.round(r / 360) * 360;
        L.rot = r;
        updatePreview(); scheduleUndoCommit(); scheduleSave();
      });
    }
    return;
  }
  if (layerEl) {
    const id = layerEl.dataset.layer;
    const L = it.layers.find(l => l.id === id);
    if (!L) return;
    if (ui.selLayer !== id) { ui.selLayer = id; renderLayers(); renderLayerProps(); updatePreview(); }
    if (L.locked) return;
    e.preventDefault();
    snap();
    if (ui.frameContent === L.id && L.img) {
      const [sx0, sy0] = toDoc(e), ix = L.imgX || 0, iy = L.imgY || 0, r = (L.rot || 0) * Math.PI / 180;
      trackGesture(ev => {
        const [px, py] = toDoc(ev), dx = px - sx0, dy = py - sy0;
        L.imgX = ix + (dx * Math.cos(r) + dy * Math.sin(r)) / L.scale; L.imgY = iy + (-dx * Math.sin(r) + dy * Math.cos(r)) / L.scale;
        updatePreview(); scheduleUndoCommit(); scheduleSave();
      });
      return;
    }
    const [startX, startY] = toDoc(e), ox = L.x, oy = L.y;
    trackGesture(ev => {
      const [px, py] = toDoc(ev);
      L.x = ox + (px - startX); L.y = oy + (py - startY);
      const lines = snapMove(L, it, ev.altKey);
      updatePreview(); drawGuides(lines); scheduleUndoCommit(); scheduleSave();
    }, () => drawGuides([]));
    return;
  }
  if (ui.selLayer) { ui.selLayer = null; renderLayers(); renderLayerProps(); updatePreview(); }
}

// ---------- image loading: downscale + (for pieces) trim transparent border ----------
function fileToImage(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image.')); };
    img.src = url;
  });
}
function trimAndEncode(img, trim) {
  const MAX = 1600;
  let w = img.naturalWidth, h = img.naturalHeight;
  const scale = Math.min(1, MAX / Math.max(w, h));
  w = Math.round(w * scale); h = Math.round(h * scale);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  if (!trim) return cv.toDataURL('image/png');
  const { data } = ctx.getImageData(0, 0, w, h);
  let minX = w, minY = h, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] > 8) { found = true; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (!found) return cv.toDataURL('image/png');
  const tw = maxX - minX + 1, th = maxY - minY + 1;
  const out = document.createElement('canvas'); out.width = tw; out.height = th;
  out.getContext('2d').drawImage(cv, minX, minY, tw, th, 0, 0, tw, th);
  return out.toDataURL('image/png');
}
function dataUrlSize(dataUrl) { return new Promise(res => { const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.src = dataUrl; }); }
function fitBox(nw, nh, dw, dh) { const s = Math.min(dw * 0.9 / nw, dh * 0.9 / nh); return { w: nw * s, h: nh * s }; }

async function importPlainImage(file, it, dw, dh, replaceLayer) {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  const img = await fileToImage(file);
  const dataUrl = trimAndEncode(img, it.kind === 'piece' && !replaceLayer);
  if (replaceLayer) { replaceLayer.asset = dataUrl; return; }
  const probe = await dataUrlSize(dataUrl);
  const box = fitBox(probe.w, probe.h, dw, dh);
  const name = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Image';
  const L = newImageLayer(dataUrl, dw / 2, dh / 2, box.w, box.h, name);
  it.layers.push(L); ui.selLayer = L.id;
}
/** ag-psd exposes each raster/text layer as a plain object with a pre-rendered .canvas — this
 * walks the layer tree (skipping folders themselves, recursing into them) and drops each one in
 * as its own image layer, positioned/scaled to match its place in the original PSD canvas. Layer
 * stacking order is best-effort (Photoshop panel order vs. our back-to-front array isn't
 * guaranteed to match perfectly) — use the ▲▼ buttons to fix it up if it comes in reversed. */
async function importPSD(file, it, dw, dh) {
  const readPsd = await loadAgPsd();
  const buf = await file.arrayBuffer();
  let psd;
  try { psd = readPsd(buf, { skipCompositeImageData: false, skipLayerImageData: false, skipThumbnail: true }); }
  catch { throw new Error('Could not read that PSD (unsupported feature or corrupt file).'); }
  const flat = [];
  // ag-psd's `children` walks bottom-to-top, same as our own layers array (back to front) —
  // verified by round-tripping a real multi-layer PSD through readPsd/writePsd and checking the
  // result renders in the right order, no reversal needed.
  (function walk(nodes) { for (const n of nodes || []) { if (n.children) walk(n.children); else if (n.canvas) flat.push(n); } })(psd.children);
  const scale = Math.min(dw / psd.width, dh / psd.height);
  const offX = (dw - psd.width * scale) / 2, offY = (dh - psd.height * scale) / 2;
  let added = 0;
  for (const n of flat.slice(-40)) {
    const left = n.left || 0, top = n.top || 0, right = n.right ?? (left + n.canvas.width), bottom = n.bottom ?? (top + n.canvas.height);
    const w = Math.max(1, (right - left) * scale), h = Math.max(1, (bottom - top) * scale);
    const cx = offX + (left + right) / 2 * scale, cy = offY + (top + bottom) / 2 * scale;
    const L = newImageLayer(n.canvas.toDataURL('image/png'), cx, cy, w, h, n.name || 'Layer');
    L.hidden = n.hidden === true;
    it.layers.push(L); added++;
  }
  if (!added && psd.canvas) {
    const box = fitBox(psd.width, psd.height, dw, dh);
    it.layers.push(newImageLayer(psd.canvas.toDataURL('image/png'), dw / 2, dh / 2, box.w, box.h, file.name.replace(/\.psd$/i, '') || 'PSD'));
    added = 1;
  }
  if (!added) throw new Error('That PSD has no readable layers.');
  ui.selLayer = it.layers[it.layers.length - 1].id;
  toast(`Imported ${added} layer${added === 1 ? '' : 's'} from PSD.`);
}
/** .ai files are PDF containers, so this renders page 1 through pdf.js and imports it as one
 * flattened image — vector paths aren't kept editable, only the pixels. */
async function importPDF(file, it, dw, dh, replaceLayer) {
  const pdfjs = await loadPdfjs();
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  const page = await pdf.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = (dw * 2) / base.width;
  const viewport = page.getViewport({ scale });
  const cv = document.createElement('canvas'); cv.width = Math.round(viewport.width); cv.height = Math.round(viewport.height);
  await page.render({ canvasContext: cv.getContext('2d'), viewport }).promise;
  const dataUrl = cv.toDataURL('image/png');
  if (replaceLayer) { replaceLayer.asset = dataUrl; return; }
  const box = fitBox(cv.width, cv.height, dw, dh);
  const name = file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'PDF';
  const L = newImageLayer(dataUrl, dw / 2, dh / 2, box.w, box.h, name);
  it.layers.push(L); ui.selLayer = L.id;
  toast('Imported as a flattened image (shapes are not kept editable).');
}
async function importAnyImage(file) {
  const it = selected(); if (!it) return;
  const { w: dw, h: dh } = docSize(it);
  const name = file.name.toLowerCase();
  const pre = JSON.stringify(kit);
  try {
    if (name.endsWith('.psd')) await importPSD(file, it, dw, dh);
    else if (name.endsWith('.svg') || file.type === 'image/svg+xml') await importSVG(file, it, dw, dh);
    else if (name.endsWith('.pdf') || name.endsWith('.ai')) await importPDF(file, it, dw, dh);
    else if (selectedLayer()?.frame) { await placeInFrame(file, selectedLayer()); toast('Placed in the frame.'); }
    else await importPlainImage(file, it, dw, dh);
  } catch (err) { toast(err.message || 'Could not import that file.'); return; }
  pushUndo(pre); scheduleSave();
  renderLayers(); renderLayerProps(); updatePreview();
}
// Drag-and-drop a file straight onto the canvas.
$('#previewWrap')?.addEventListener('dragover', e => e.preventDefault());
$('#previewWrap')?.addEventListener('drop', e => {
  e.preventDefault();
  const f = e.dataTransfer.files?.[0];
  if (f) importAnyImage(f);
});

// ---------- SVG / vector import ----------
// An SVG comes in as a crisp vector picture (its own colours, sharp at any size, even on a
// board). Right-click → Convert to shape turns its outline into a recolourable shape that can
// also be a frame.
const svgToDataUrl = text => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
const dataUrlToText = url => decodeURIComponent(escape(atob(url.split(',')[1])));
function parseSvg(text) {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml'), root = doc.documentElement;
  if (root?.localName !== 'svg' || doc.querySelector('parsererror')) throw new Error("That SVG couldn't be read.");
  // Pictures are drawn through <img>/<image>, which never runs scripts; strip them anyway so the
  // stored file is clean.
  for (const el of root.querySelectorAll('script, foreignObject')) el.remove();
  for (const el of root.querySelectorAll('*')) for (const at of [...el.attributes]) if (/^on/i.test(at.name)) el.removeAttribute(at.name);
  const vbAttr = (root.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let w = parseFloat(root.getAttribute('width')), h = parseFloat(root.getAttribute('height'));
  if (vbAttr.length === 4 && vbAttr.every(Number.isFinite) && vbAttr[2] > 0) { w ||= vbAttr[2]; h ||= vbAttr[3]; }
  if (!root.getAttribute('viewBox') && w && h) root.setAttribute('viewBox', `0 0 ${w} ${h}`);
  root.setAttribute('width', w || 300); root.setAttribute('height', h || 300);
  return { root, clean: new XMLSerializer().serializeToString(root), w: w || 300, h: h || 300 };
}
/** Outline geometry from an SVG, flattened with its group transforms, plus its real bounds. */
function svgOutline(root) {
  const els = [];
  (function walk(node, tf) {
    for (const el of node.children) {
      const tag = el.localName, t = `${tf} ${el.getAttribute('transform') || ''}`.trim();
      if (['defs', 'clipPath', 'mask', 'symbol', 'pattern', 'marker', 'style', 'title', 'desc', 'metadata'].includes(tag)) continue;
      if (SVG_TAGS.includes(tag)) els.push({ tag, a: { ...Object.fromEntries([...el.attributes].map(a => [a.name, a.value])), transform: t } });
      else walk(el, t);
    }
  })(root, '');
  const clean = cleanSvgEls(els);
  if (!clean.length) throw new Error('No shapes found in that SVG to turn into an outline.');
  // Measure the real bounds by drawing it off-screen once.
  const probe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  probe.setAttribute('style', 'position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:visible');
  probe.innerHTML = `<g>${clean.map(e => `<${e.tag} ${Object.entries(e.a).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('')}</g>`;
  document.body.appendChild(probe);
  let bb; try { bb = probe.firstChild.getBBox(); } finally { probe.remove(); }
  if (!bb || !(bb.width > 0) || !(bb.height > 0)) throw new Error("That SVG's shapes have no size.");
  return { svg: clean, vb: [bb.x, bb.y, bb.width, bb.height] };
}
async function importSVG(file, it, dw, dh) {
  const { clean, w, h } = parseSvg(await file.text());
  const box = fitBox(w, h, dw, dh);
  const L = newImageLayer(svgToDataUrl(clean), dw / 2, dh / 2, box.w, box.h, file.name.replace(/\.svg$/i, '').slice(0, 40) || 'Vector');
  L.vector = true;
  it.layers.push(L); ui.selLayer = L.id;
  toast('Vector imported — stays sharp at any size. Right-click it → Convert to shape to recolour it or use it as a frame.');
}
/** Vector picture → recolourable custom shape (keeps size and position). */
function vectorToShape(L) {
  const { root } = parseSvg(dataUrlToText(L.asset)), { svg, vb } = svgOutline(root);
  const it = selected(), i = it.layers.indexOf(L), k = Math.min(L.w / vb[2], L.h / vb[3]);
  const S = { ...newShapeLayer('rect', 10, 10), x: L.x, y: L.y, rot: L.rot, scale: L.scale, opacity: L.opacity, name: L.name, shape: 'custom', svg, vb, w: vb[2] * k, h: vb[3] * k, fill: '#171724' };
  it.layers.splice(i, 1, S); ui.selLayer = S.id;
}
/** Image layer → frame holding that picture (same size and crop). */
function imageToFrame(L) {
  const it = selected(), i = it.layers.indexOf(L);
  const probe = new Image(); probe.src = L.asset;
  const F = { ...newShapeLayer('rect', 10, 10), x: L.x, y: L.y, rot: L.rot, scale: L.scale, opacity: L.opacity, name: L.name, w: L.w, h: L.h, radius: 0, fill: '#e8e6df',
    frame: true, img: L.asset, imgW: probe.naturalWidth || L.w, imgH: probe.naturalHeight || L.h, imgFit: 'fill', imgScale: 1, imgX: 0, imgY: 0 };
  it.layers.splice(i, 1, F); ui.selLayer = F.id;
}

// ---------- right-click menu ----------
function openLayerMenu(e, L) {
  e.preventDefault();
  if (ui.selLayer !== L.id) { ui.selLayer = L.id; renderLayers(); renderLayerProps(); updatePreview(); }
  const items = [];
  if (L.kind === 'shape' && L.shape !== 'line') items.push(L.frame ? ['unframe', 'Convert back to shape'] : ['makeFrame', 'Convert to frame']);
  if (L.kind === 'shape' && L.frame) items.push(['placeFrame', L.img ? 'Replace picture…' : 'Place picture…']);
  if (L.kind === 'image' && L.vector) items.push(['vectorShape', 'Convert to shape (recolour / frame)']);
  if (L.kind === 'image' && !L.vector) items.push(['imageFrame', 'Convert to frame']);
  if (items.length) items.push(null);
  items.push(['dup', 'Duplicate'], ['front', 'Bring forward'], ['back', 'Send backward'], ['lock', L.locked ? 'Unlock' : 'Lock'], ['hide', L.hidden ? 'Show' : 'Hide'], null, ['del', 'Delete']);
  const m = $('#ctxMenu');
  m.innerHTML = items.map(x => x ? `<button type="button" role="menuitem" data-cm="${x[0]}"${x[0] === 'del' ? ' class="danger"' : ''}>${x[1]}</button>` : '<hr>').join('');
  m.hidden = false;
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(e.clientX, innerWidth - r.width - 8) + 'px';
  m.style.top = Math.min(e.clientY, innerHeight - r.height - 8) + 'px';
  m.querySelector('button')?.focus();
}
const closeMenu = () => { $('#ctxMenu').hidden = true; };
$('#ctxMenu').addEventListener('click', e => {
  const b = e.target.closest('[data-cm]'); if (!b) return;
  const L = selectedLayer(), it = selected(); closeMenu(); if (!L || !it) return;
  const a = b.dataset.cm;
  if (a === 'dup') return duplicateLayer();
  if (a === 'del') { L.locked = false; return deleteSelectedLayer(); }
  if (a === 'placeFrame') return renderLayerProps(), $('#frameFile')?.click();
  // These reuse the properties-panel buttons, so menu and panel always do the same thing.
  if (['makeFrame', 'unframe', 'front', 'back'].includes(a)) { renderLayerProps(); return lp.querySelector(`[data-act="${a}"]`)?.click(); }
  const pre = JSON.stringify(kit);
  try {
    if (a === 'lock') L.locked = !L.locked;
    if (a === 'hide') L.hidden = !L.hidden;
    if (a === 'vectorShape') vectorToShape(L);
    if (a === 'imageFrame') imageToFrame(L);
  } catch (err) { toast(err.message || "Couldn't convert that."); return; }
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
  if (a === 'vectorShape') toast('Now a shape: pick its colour under Fill, or Turn into a picture frame.');
  if (a === 'imageFrame') toast('Now a frame: double-click to move the picture inside, Shift + corner to reshape.');
});
$('#previewSvg').addEventListener('contextmenu', e => {
  const g = e.target.closest('[data-layer]'), L = g && selected()?.layers.find(l => l.id === g.dataset.layer);
  if (L) openLayerMenu(e, L);
});
$('#layerList').addEventListener('contextmenu', e => {
  const row = e.target.closest('[data-row]'), L = row && selected()?.layers.find(l => l.id === row.dataset.row);
  if (L) openLayerMenu(e, L);
});
addEventListener('pointerdown', e => { if (!e.target.closest('#ctxMenu')) closeMenu(); });
addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#ctxMenu').hidden) { e.stopPropagation(); closeMenu(); } }, true);
addEventListener('blur', closeMenu);

// ---------- kit info tab ----------
function renderInfo() {
  $('#infoTitle').value = kit.title; $('#infoClass').value = kit.className; $('#infoAuthor').value = kit.author;
  $('#infoTitle').onfocus = () => snap();
  $('#infoTitle').oninput = e => { kit.title = e.target.value.slice(0, 80) || 'My Game Kit'; $('#kitTitle').value = kit.title; scheduleSave(); scheduleUndoCommit(); };
  $('#infoClass').onfocus = () => snap();
  $('#infoClass').oninput = e => { kit.className = e.target.value.slice(0, 80); scheduleSave(); scheduleUndoCommit(); };
  $('#infoAuthor').onfocus = () => snap();
  $('#infoAuthor').oninput = e => { kit.author = e.target.value.slice(0, 80); scheduleSave(); scheduleUndoCommit(); };
  const warns = kitWarnings(kit);
  $('#warnings').innerHTML = warns.length ? `<h3>Before you export</h3><ul>${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="hint">✅ Looks ready to export.</p>';
}

// ---------- export ----------
async function exportZip() {
  const all = [...kit.cards, ...kit.pieces, ...kit.boards];
  if (!all.length) return toast('Nothing to export yet — add a card, piece or board first.');
  toast('Packing ZIP…');
  let JSZip; try { JSZip = await lib(); } catch { return toast('Could not load the ZIP library — check your internet connection.'); }
  const zip = new JSZip(), base = slug(kit.title);
  zip.file('kit.json', JSON.stringify(kit, null, 2));
  zip.file('README.txt', readme(kit));
  for (const c of kit.cards) { const { w, h } = docSize(c); zip.file(`cards/${slug(c.name)}-${c.id}.png`, await toPNG(itemSVG(c, 'x'), w, h, 1.5)); }
  for (const p of kit.pieces) { const { w, h } = docSize(p); zip.file(`pieces/${slug(p.name)}-${p.id}.png`, await toPNG(itemSVG(p, 'x'), w, h, 1.5)); }
  for (const b of kit.boards) { const { w, h } = docSize(b); zip.file(`boards/${slug(b.name)}-${b.id}.png`, await toPNG(itemSVG(b, 'x'), w, h, 1)); }
  if (kit.cards.length) await addPrintSheets(zip);
  // Also bundled here (not just under "Send to Table"), so this ZIP works on the table too —
  // kit.json is Kit Forge's own project file, not something the table can read.
  const tablePayload = await buildTablePayload();
  if (tablePayload) zip.file(`${base}.kittable.json`, JSON.stringify(tablePayload));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${base}.zip`);
  toast('📦 ZIP downloaded!');
}
async function addPrintSheets(zip) {
  const queueCards = printQueue(kit.cards).map(c => ({ ...c, wIn: c.size.w, hIn: c.size.h }));
  const pages = packPrintPages(queueCards);
  for (let p = 0; p < pages.length; p++) {
    const cv = document.createElement('canvas'); cv.width = PAGE_W; cv.height = PAGE_H;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    for (const pl of pages[p].placements) {
      const { w: dw, h: dh } = docSize(pl.item);
      const blob = await toPNG(itemSVG(pl.item, 'p' + p), dw, dh, PRINT_DPI / 200);
      const bmp = await createImageBitmap(blob);
      ctx.drawImage(bmp, pl.x, pl.y, pl.w, pl.h);
      ctx.strokeStyle = '#cccccc'; ctx.strokeRect(pl.x, pl.y, pl.w, pl.h);
    }
    const blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    zip.file(`print/sheet-${p + 1}.png`, blob);
  }
}
function downloadBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function printCards() {
  if (!kit.cards.length) return toast('No cards to print yet.');
  toast('Building print sheet…');
  let JSZip; try { JSZip = await lib(); } catch { return toast('Could not load the print helper — check your internet connection.'); }
  const zip = new JSZip();
  await addPrintSheets(zip);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${slug(kit.title)}-print.zip`);
  toast('🖨 Print sheets downloaded!');
}

function blobToDataUrl(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}
/** Rasterizes every card/piece/board into the .kittable.json shape a Kit Forge Table room loads
 * ("Load kit…") — separate from the print ZIP, but also bundled into it (see exportZip) so
 * whichever file someone downloads, it works on the table. */
async function buildTablePayload() {
  const all = [...kit.cards, ...kit.pieces, ...kit.boards];
  if (!all.length) return null;
  const pieces = [];
  for (const it of all) {
    const { w, h } = docSize(it);
    const dataUrl = await blobToDataUrl(await toPNG(itemSVG(it, 'x'), w, h, 1));
    pieces.push({ id: it.id, name: it.name, kind: it.kind, frontImage: dataUrl, w: it.size.w, h: it.size.h, count: it.count });
  }
  return { format: 'kit-table', version: 1, kitTitle: kit.title, pieces };
}
async function sendToTable() {
  toast('Preparing table file…');
  const payload = await buildTablePayload();
  if (!payload) return toast('Nothing to send yet — add a card, piece or board first.');
  downloadBlob(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `${slug(kit.title)}.kittable.json`);
  toast('📤 Table file downloaded — load it in Kit Forge Table.');
}

// ---------- import (kit.json / ZIP save) ----------
async function importFile(file) {
  try {
    let next;
    if (file.name.endsWith('.json')) next = normalizeKit(JSON.parse(await file.text()));
    else if (file.name.endsWith('.zip')) {
      const JSZip = await lib();
      const zip = await JSZip.loadAsync(file);
      const entry = zip.file('kit.json');
      if (!entry) return toast('That ZIP has no kit.json — is it a Kit Forge export?');
      next = normalizeKit(JSON.parse(await entry.async('string')));
    } else return toast('Import a kit.json or a Kit Forge ZIP export (or drop an image/PSD/PDF onto a card to add art).');
    const pre = JSON.stringify(kit);
    kit = next; ui.selId = null; ui.selLayer = null;
    pushUndo(pre); scheduleSave(); renderAll();
    toast('✅ Kit imported.');
  } catch (err) { toast('Could not import that file: ' + (err.message || err)); }
}

// ---------- top-level render ----------
function renderAll() { renderSidebar(); renderEditor(); }

// ---------- boot ----------
(async function boot() {
  await load();
  bindTopbar();
  updateUndoButtons();
  setMobileView('items');
  document.title = `${kit.title} — Kit Forge`;
  console.log(`Kit Forge v${VERSION} "${CODENAME}"`);
  renderAll();
  await store.persist();
  // Skip the offline cache on localhost — it makes local editing confusing (stale files survive
  // a reload). Real students on the deployed GitHub Pages URL still get full offline support.
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && !isLocal) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
