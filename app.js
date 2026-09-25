import * as store from './store.js';
import {
  emptyKit, normalizeKit, newCategory, newItem, newImageLayer, newTextLayer, newShapeLayer,
  categoryOf, listFor, KINDS, SIZE_PRESETS, MASKS, MASK_LABELS, SHAPES, SHAPE_LABELS, FONTS,
  MIN_IN, MAX_IN, newId,
} from './model.js';
import { itemSVG, toPNG, docSize, esc } from './render.js';
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
let ui = { tab: 'card', selId: null, selLayer: null, mview: 'items' };
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
  if (typing) return;
  const L = selectedLayer();
  if (!L || L.locked) return;
  if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateLayer(); return; }
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedLayer(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    snap();
    if (e.key === 'ArrowUp') L.y -= step; if (e.key === 'ArrowDown') L.y += step;
    if (e.key === 'ArrowLeft') L.x -= step; if (e.key === 'ArrowRight') L.x += step;
    updatePreview(); scheduleUndoCommit(); scheduleSave();
  }
}
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

// ---------- editor: add-layer toolbar ----------
function toolRowHTML() {
  const shapeBtn = (shape, glyph) => `<button class="btn ghost small" type="button" data-shape="${shape}" title="Add ${SHAPE_LABELS[shape]}">${glyph}</button>`;
  return `
  <label class="btn ghost small filebtn">🖼 Image<input id="toolImage" type="file" accept="image/*,.psd,.pdf,.ai" hidden></label>
  <button id="toolText" class="btn ghost small" type="button">🔤 Text</button>
  ${shapeBtn('rect', '▭')}${shapeBtn('ellipse', '◯')}${shapeBtn('triangle', '△')}${shapeBtn('star', '★')}${shapeBtn('line', '╱')}`;
}
function bindToolRow() {
  $('#toolText').addEventListener('click', () => {
    const it = selected(); if (!it) return;
    const { w, h } = docSize(it);
    const pre = JSON.stringify(kit);
    const L = newTextLayer(w, h);
    it.layers.push(L); ui.selLayer = L.id;
    pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
  });
  document.querySelectorAll('#toolRow [data-shape]').forEach(btn => btn.addEventListener('click', () => {
    const it = selected(); if (!it) return;
    const { w, h } = docSize(it);
    const pre = JSON.stringify(kit);
    const L = newShapeLayer(btn.dataset.shape, w, h);
    it.layers.push(L); ui.selLayer = L.id;
    pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
  }));
  $('#toolImage').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    await importAnyImage(f);
    e.target.value = '';
  });
}

// ---------- editor: layers list ----------
function kindIcon(L) { return L.kind === 'image' ? '🖼' : L.kind === 'text' ? '🔤' : ({ rect: '▭', ellipse: '◯', triangle: '△', star: '★', line: '╱' })[L.shape] || '◆'; }
function renderLayers() {
  const it = selected(); const ul = $('#layerList'); ul.innerHTML = '';
  if (!it) return;
  const layers = it.layers;
  for (let i = layers.length - 1; i >= 0; i--) {
    const L = layers[i];
    const li = document.createElement('li');
    li.className = 'layerRow' + (L.id === ui.selLayer ? ' active' : '');
    li.dataset.id = L.id;
    li.innerHTML = `<button class="iconbtn tiny visBtn${L.hidden ? ' active' : ''}" type="button" title="${L.hidden ? 'Show' : 'Hide'}">${L.hidden ? '🚫' : '👁'}</button>
      <button class="iconbtn tiny lockBtn${L.locked ? ' active' : ''}" type="button" title="${L.locked ? 'Unlock' : 'Lock'}">${L.locked ? '🔒' : '🔓'}</button>
      <span class="layerKindIcon">${kindIcon(L)}</span>
      <span class="layerNameText"></span>
      <button class="iconbtn tiny upBtn" type="button" title="Bring forward" ${i === layers.length - 1 ? 'disabled' : ''}>▲</button>
      <button class="iconbtn tiny downBtn" type="button" title="Send backward" ${i === 0 ? 'disabled' : ''}>▼</button>
      <button class="iconbtn tiny danger delBtn" type="button" title="Delete">✕</button>`;
    li.querySelector('.layerNameText').textContent = L.name;
    li.addEventListener('click', e => { if (e.target.closest('button')) return; ui.selLayer = L.id; renderLayers(); renderLayerProps(); updatePreview(); });
    li.querySelector('.visBtn').addEventListener('click', () => { const pre = JSON.stringify(kit); L.hidden = !L.hidden; pushUndo(pre); scheduleSave(); renderLayers(); updatePreview(); });
    li.querySelector('.lockBtn').addEventListener('click', () => { const pre = JSON.stringify(kit); L.locked = !L.locked; pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview(); });
    li.querySelector('.upBtn').addEventListener('click', () => { const pre = JSON.stringify(kit); const idx = layers.indexOf(L); [layers[idx], layers[idx + 1]] = [layers[idx + 1], layers[idx]]; pushUndo(pre); scheduleSave(); renderLayers(); updatePreview(); });
    li.querySelector('.downBtn').addEventListener('click', () => { const pre = JSON.stringify(kit); const idx = layers.indexOf(L); [layers[idx], layers[idx - 1]] = [layers[idx - 1], layers[idx]]; pushUndo(pre); scheduleSave(); renderLayers(); updatePreview(); });
    li.querySelector('.delBtn').addEventListener('click', () => { const pre = JSON.stringify(kit); layers.splice(layers.indexOf(L), 1); if (ui.selLayer === L.id) ui.selLayer = null; pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview(); });
    ul.appendChild(li);
  }
}
function renderLayerRowName(L) {
  const el = document.querySelector(`#layerList li[data-id="${L.id}"] .layerNameText`);
  if (el) el.textContent = L.name;
}

// ---------- editor: layer properties panel ----------
function alignLayer(L, mode) {
  const it = selected(); const { w: dw, h: dh } = docSize(it);
  const hw = L.w * L.scale / 2, hh = L.h * L.scale / 2;
  if (mode === 'left') L.x = hw; if (mode === 'centerX') L.x = dw / 2; if (mode === 'right') L.x = dw - hw;
  if (mode === 'top') L.y = hh; if (mode === 'centerY') L.y = dh / 2; if (mode === 'bottom') L.y = dh - hh;
}
function imagePropsHTML(L) {
  return `
  <label>Brightness <input class="pRange" data-k="bright" type="range" min="0.4" max="1.8" step="0.02" value="${L.bright}"></label>
  <label>Contrast <input class="pRange" data-k="contrast" type="range" min="0.4" max="1.8" step="0.02" value="${L.contrast}"></label>
  <label>Saturation <input class="pRange" data-k="sat" type="range" min="0" max="2" step="0.05" value="${L.sat}"></label>
  <label class="btn ghost small filebtn">🔄 Replace image<input id="pReplaceFile" type="file" accept="image/*" hidden></label>`;
}
function bindImageProps(L) {
  $('#pReplaceFile').addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    const pre = JSON.stringify(kit);
    try { await importPlainImage(f, selected(), 0, 0, L); } catch (err) { toast(err.message || 'Could not load that image.'); return; }
    pushUndo(pre); scheduleSave(); updatePreview();
    e.target.value = '';
  });
}
function textPropsHTML(L) {
  return `
  <label>Content <textarea id="pText" maxlength="300" rows="3">${esc(L.text)}</textarea></label>
  <div class="row2">
    <label>Font <select id="pFont">${FONTS.map(f => `<option value="${esc(f)}" ${f === L.font ? 'selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
    <label>Size <input class="pRange" data-k="size" type="range" min="10" max="140" value="${L.size}"></label>
  </div>
  <div class="row2">
    <label>Color <input id="pColor" type="color" value="${L.color}"></label>
    <label class="chk"><input id="pStrokeOn" type="checkbox" ${L.stroke ? 'checked' : ''}> Outline <input id="pStroke" type="color" value="${L.stroke || '#000000'}" ${L.stroke ? '' : 'disabled'}></label>
  </div>
  <div class="toggleRow">
    <button class="iconbtn toggle" id="pBold" aria-pressed="${L.bold}" type="button"><b>B</b></button>
    <button class="iconbtn toggle" id="pItalic" aria-pressed="${L.italic}" type="button"><i>I</i></button>
    <button class="iconbtn toggle" id="pAlL" aria-pressed="${L.align === 'left'}" type="button">L</button>
    <button class="iconbtn toggle" id="pAlC" aria-pressed="${L.align === 'center'}" type="button">C</button>
    <button class="iconbtn toggle" id="pAlR" aria-pressed="${L.align === 'right'}" type="button">R</button>
  </div>`;
}
function bindTextProps(L) {
  const ta = $('#pText');
  ta.addEventListener('focus', () => snap());
  ta.addEventListener('input', e => { L.text = e.target.value.slice(0, 300); updatePreview(); scheduleSave(); scheduleUndoCommit(); });
  $('#pFont').addEventListener('change', e => { const pre = JSON.stringify(kit); L.font = e.target.value; pushUndo(pre); scheduleSave(); updatePreview(); });
  $('#pColor').addEventListener('focus', () => snap());
  $('#pColor').addEventListener('input', e => { L.color = e.target.value; updatePreview(); scheduleSave(); scheduleUndoCommit(); });
  $('#pStrokeOn').addEventListener('change', e => { const pre = JSON.stringify(kit); L.stroke = e.target.checked ? $('#pStroke').value : ''; pushUndo(pre); scheduleSave(); renderLayerProps(); updatePreview(); });
  $('#pStroke').addEventListener('focus', () => snap());
  $('#pStroke').addEventListener('input', e => { L.stroke = e.target.value; updatePreview(); scheduleSave(); scheduleUndoCommit(); });
  $('#pBold').addEventListener('click', () => { const pre = JSON.stringify(kit); L.bold = !L.bold; pushUndo(pre); scheduleSave(); renderLayerProps(); updatePreview(); });
  $('#pItalic').addEventListener('click', () => { const pre = JSON.stringify(kit); L.italic = !L.italic; pushUndo(pre); scheduleSave(); renderLayerProps(); updatePreview(); });
  const setAlign = a => { const pre = JSON.stringify(kit); L.align = a; pushUndo(pre); scheduleSave(); renderLayerProps(); updatePreview(); };
  $('#pAlL').addEventListener('click', () => setAlign('left'));
  $('#pAlC').addEventListener('click', () => setAlign('center'));
  $('#pAlR').addEventListener('click', () => setAlign('right'));
}
function shapePropsHTML(L) {
  return `
  <div class="row2">
    <label>Fill <input id="pFill" type="color" value="${L.fill}"></label>
    <label>Stroke <input id="pStroke2" type="color" value="${L.stroke || '#000000'}"></label>
  </div>
  <label>Stroke width <input class="pRange" data-k="strokeWidth" type="range" min="0" max="30" value="${L.strokeWidth}"></label>
  ${L.shape === 'rect' ? `<label>Corner radius <input class="pRange" data-k="radius" type="range" min="0" max="150" value="${L.radius}"></label>` : ''}`;
}
function bindShapeProps(L) {
  $('#pFill').addEventListener('focus', () => snap());
  $('#pFill').addEventListener('input', e => { L.fill = e.target.value; updatePreview(); scheduleSave(); scheduleUndoCommit(); });
  $('#pStroke2').addEventListener('focus', () => snap());
  $('#pStroke2').addEventListener('input', e => { L.stroke = e.target.value; updatePreview(); scheduleSave(); scheduleUndoCommit(); });
}
function renderLayerProps() {
  const L = selectedLayer(); const box = $('#layerProps');
  if (!L) { box.innerHTML = '<p class="hint small">Select a layer to edit it, or add one above.</p>'; return; }
  const kindHtml = L.kind === 'image' ? imagePropsHTML(L) : L.kind === 'text' ? textPropsHTML(L) : shapePropsHTML(L);
  box.innerHTML = `
    <div class="propHead">${kindIcon(L)} <input id="pName" class="layerNameBig" type="text" maxlength="40" value="${esc(L.name)}"></div>
    ${L.locked ? '<p class="hint small">🔒 Locked — unlock it in the layer list to edit.</p>' : ''}
    <fieldset id="propFields" ${L.locked ? 'disabled' : ''}>
      <label>Opacity <input class="pRange" data-k="opacity" type="range" min="0" max="1" step="0.02" value="${L.opacity}"></label>
      <div class="alignGrid">
        <button class="btn ghost tiny" data-align="left" type="button" title="Align left">L</button>
        <button class="btn ghost tiny" data-align="centerX" type="button" title="Center horizontally">C</button>
        <button class="btn ghost tiny" data-align="right" type="button" title="Align right">R</button>
        <button class="btn ghost tiny" data-align="top" type="button" title="Align top">T</button>
        <button class="btn ghost tiny" data-align="centerY" type="button" title="Center vertically">M</button>
        <button class="btn ghost tiny" data-align="bottom" type="button" title="Align bottom">B</button>
      </div>
      ${kindHtml}
      <div class="row2">
        <button id="pDup" class="btn ghost small" type="button">⧉ Duplicate</button>
        <button id="pDel" class="btn ghost small danger" type="button">✕ Delete</button>
      </div>
    </fieldset>`;
  $('#pName').addEventListener('focus', () => snap());
  $('#pName').addEventListener('input', e => { L.name = e.target.value.slice(0, 40) || L.kind; scheduleSave(); scheduleUndoCommit(); renderLayerRowName(L); });
  document.querySelectorAll('#layerProps .pRange').forEach(inp => {
    inp.addEventListener('focus', () => snap());
    inp.addEventListener('input', e => { L[e.target.dataset.k] = +e.target.value; updatePreview(); scheduleSave(); scheduleUndoCommit(); });
  });
  document.querySelectorAll('#layerProps [data-align]').forEach(btn => btn.addEventListener('click', () => {
    const pre = JSON.stringify(kit); alignLayer(L, btn.dataset.align); pushUndo(pre); scheduleSave(); updatePreview();
  }));
  $('#pDup').addEventListener('click', duplicateLayer);
  $('#pDel').addEventListener('click', deleteSelectedLayer);
  if (L.kind === 'image') bindImageProps(L); else if (L.kind === 'text') bindTextProps(L); else bindShapeProps(L);
}
function duplicateLayer() {
  const it = selected(); const L = selectedLayer(); if (!it || !L) return;
  const pre = JSON.stringify(kit);
  const copy = JSON.parse(JSON.stringify(L)); copy.id = newId('L'); copy.x += 16; copy.y += 16; copy.name = (L.name || 'Layer') + ' copy';
  it.layers.push(copy); ui.selLayer = copy.id;
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
}
function deleteSelectedLayer() {
  const it = selected(); const L = selectedLayer(); if (!it || !L) return;
  const pre = JSON.stringify(kit);
  it.layers.splice(it.layers.indexOf(L), 1); ui.selLayer = null;
  pushUndo(pre); scheduleSave(); renderLayers(); renderLayerProps(); updatePreview();
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
function updatePreview() {
  const it = selected(); if (!it) { $('#previewSvg').innerHTML = ''; return; }
  const selL = selectedLayer();
  const svg = itemSVG(it, 'live', { editing: true, sel: (selL && !selL.locked) ? selL.id : null });
  $('#previewSvg').innerHTML = svg;
  const el = $('#previewSvg svg');
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => onCanvasPointerDown(e, it, el));
}
// Capture failing (e.g. a pointer session the browser doesn't consider active) just means the
// drag won't keep tracking if the cursor leaves the canvas — never worth losing the interaction over.
function tryCapture(el, id) { try { el.setPointerCapture(id); } catch {} }
function onCanvasPointerDown(e, it, el) {
  const handle = e.target.closest('[data-handle]');
  const layerEl = e.target.closest('[data-layer]');
  const { w: dw } = docSize(it);
  const rect = el.getBoundingClientRect(), unitsPerPx = dw / rect.width;
  const toDoc = ev => [(ev.clientX - rect.left) * unitsPerPx, (ev.clientY - rect.top) * unitsPerPx];

  if (handle && ui.selLayer) {
    const L = selectedLayer(); if (!L || L.locked) return;
    tryCapture(el, e.pointerId);
    snap();
    if (handle.dataset.handle === 'scale') {
      const [sx, sy] = toDoc(e), startDist = Math.hypot(sx - L.x, sy - L.y) || 1, startScale = L.scale;
      const move = ev => {
        const [px, py] = toDoc(ev), dist = Math.hypot(px - L.x, py - L.y);
        L.scale = Math.max(0.05, Math.min(20, startScale * (dist / startDist)));
        updatePreview(); scheduleUndoCommit(); scheduleSave();
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    } else {
      const angleAt = (x, y) => Math.atan2(y - L.y, x - L.x) * 180 / Math.PI;
      const [sx, sy] = toDoc(e), startAngle = angleAt(sx, sy), startRot = L.rot;
      const move = ev => {
        const [px, py] = toDoc(ev);
        L.rot = startRot + (angleAt(px, py) - startAngle);
        updatePreview(); scheduleUndoCommit(); scheduleSave();
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
    }
    return;
  }
  if (layerEl) {
    const id = layerEl.dataset.layer;
    const L = it.layers.find(l => l.id === id);
    if (!L) return;
    if (ui.selLayer !== id) { ui.selLayer = id; renderLayers(); renderLayerProps(); updatePreview(); }
    if (L.locked) return;
    tryCapture(el, e.pointerId);
    snap();
    const [startX, startY] = toDoc(e), ox = L.x, oy = L.y;
    const move = ev => {
      const [px, py] = toDoc(ev);
      L.x = ox + (px - startX); L.y = oy + (py - startY);
      updatePreview(); scheduleUndoCommit(); scheduleSave();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
    el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
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
  (function walk(nodes) { for (const n of nodes || []) { if (n.children) walk(n.children); else if (n.canvas) flat.push(n); } })(psd.children);
  flat.reverse(); // ag-psd lists top-of-panel first; our array is back-to-front, so reverse to match
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
    else if (name.endsWith('.pdf') || name.endsWith('.ai')) await importPDF(file, it, dw, dh);
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
/** Rasterizes every card/piece/board and bundles them into a .kittable.json a Kit Forge Table
 * room can load ("Load kit…") — a separate, independent output from the print ZIP above. */
async function sendToTable() {
  const all = [...kit.cards, ...kit.pieces, ...kit.boards];
  if (!all.length) return toast('Nothing to send yet — add a card, piece or board first.');
  toast('Preparing table file…');
  const pieces = [];
  for (const it of all) {
    const { w, h } = docSize(it);
    const dataUrl = await blobToDataUrl(await toPNG(itemSVG(it, 'x'), w, h, 1));
    pieces.push({ id: it.id, name: it.name, kind: it.kind, frontImage: dataUrl, w: it.size.w, h: it.size.h, count: it.count });
  }
  const payload = { format: 'kit-table', version: 1, kitTitle: kit.title, pieces };
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
