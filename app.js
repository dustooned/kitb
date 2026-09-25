import * as store from './store.js';
import { emptyKit, normalizeKit, newCategory, newCard, newPiece, usedAssets, categoryOf, SHAPES, SHAPE_LABELS, SAFE_ID, newId } from './model.js';
import { cardSVG, pieceSVG, toPNG, CARD_W, CARD_H, CARD_ART, PIECE_SIZE, esc } from './render.js';
import { slug, printLayout, printQueue, kitWarnings, readme } from './project.js';
import { VERSION, CODENAME } from './version.js';

const $ = sel => document.querySelector(sel);
const JSZIP = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm';
let JSZipLib = null;
async function lib() { return JSZipLib ||= (await import(JSZIP)).default; }

let kit = emptyKit();
let ui = { tab: 'cards', selId: null };
let saveTimer = null;

// ---------- persistence ----------
async function load() {
  const saved = await store.get('kit');
  kit = normalizeKit(saved || emptyKit());
  if (!saved) { kit.categories.push(newCategory('General')); }
}
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.set('kit', kit).catch(() => {}), 400);
}
function mutate() { scheduleSave(); }

// ---------- toast ----------
let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

// ---------- selection helpers ----------
function items() { return ui.tab === 'cards' ? kit.cards : kit.pieces; }
function selected() { return items().find(x => x.id === ui.selId) || null; }

// ---------- top bar ----------
function bindTopbar() {
  $('#kitTitle').value = kit.title;
  $('#kitTitle').addEventListener('input', e => { kit.title = e.target.value.slice(0, 80) || 'My Game Kit'; mutate(); if ($('#infoTitle')) $('#infoTitle').value = kit.title; });
  document.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  $('#btnAddCat').addEventListener('click', () => {
    const c = newCategory('New category'); kit.categories.push(c); mutate(); renderSidebar();
  });
  $('#btnAddItem').addEventListener('click', () => {
    const catId = kit.categories[0]?.id || '';
    const item = ui.tab === 'cards' ? newCard(catId) : newPiece(catId);
    items().push(item); ui.selId = item.id; mutate(); renderAll();
  });
  $('#btnExport').addEventListener('click', exportZip);
  $('#btnPrint').addEventListener('click', printCards);
  $('#btnImport').addEventListener('click', () => $('#fileImport').click());
  $('#fileImport').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
}
function setTab(tab) {
  ui.tab = tab; ui.selId = null;
  $('#infoPane').hidden = tab !== 'info';
  $('#layout').hidden = tab === 'info';
  document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  if (tab === 'info') renderInfo(); else renderAll();
}

// ---------- categories ----------
function renderSidebar() {
  const catList = $('#catList'); catList.innerHTML = '';
  for (const c of kit.categories) {
    const li = document.createElement('li');
    li.className = 'catRow';
    li.innerHTML = `<input type="color" value="${c.color}" aria-label="Category color">
      <input type="text" value="${esc(c.name)}" maxlength="40" aria-label="Category name">
      <button class="iconbtn danger" title="Delete category">✕</button>`;
    const [colorEl, nameEl, delEl] = li.children;
    colorEl.addEventListener('input', e => { c.color = e.target.value; mutate(); updatePreview(); });
    nameEl.addEventListener('input', e => { c.name = e.target.value.slice(0, 40) || 'Category'; mutate(); renderItemList(); updatePreview(); });
    delEl.addEventListener('click', () => {
      if (!confirm(`Delete category "${c.name}"? Cards/pieces using it become uncategorized.`)) return;
      kit.categories = kit.categories.filter(x => x.id !== c.id);
      for (const x of [...kit.cards, ...kit.pieces]) if (x.category === c.id) x.category = '';
      mutate(); renderAll();
    });
    catList.appendChild(li);
  }
  renderItemList();
}
function renderItemList() {
  $('#listLabel').textContent = ui.tab === 'cards' ? 'Cards' : 'Pieces';
  const ul = $('#itemList'); ul.innerHTML = '';
  for (const it of items()) {
    const cat = categoryOf(kit, it.category);
    const li = document.createElement('li');
    li.className = 'itemRow' + (it.id === ui.selId ? ' active' : '');
    li.innerHTML = `<span class="swatch" style="background:${cat?.color || '#9ca3af'}"></span><span class="itemName"></span><button class="iconbtn danger" title="Delete">✕</button>`;
    li.querySelector('.itemName').textContent = it.name || 'Untitled';
    li.addEventListener('click', e => { if (e.target.closest('button')) return; ui.selId = it.id; renderAll(); });
    li.querySelector('button').addEventListener('click', () => {
      if (!confirm(`Delete "${it.name}"?`)) return;
      const list = items(); list.splice(list.indexOf(it), 1);
      if (ui.selId === it.id) ui.selId = null;
      mutate(); renderAll();
    });
    ul.appendChild(li);
  }
}

// ---------- editor ----------
function renderEditor() {
  const it = selected();
  $('#emptyState').hidden = !!it;
  $('#editor').hidden = !it;
  if (!it) return;
  $('#editorForm').innerHTML = ui.tab === 'cards' ? cardFormHTML(it) : pieceFormHTML(it);
  bindCommonFields(it);
  if (ui.tab === 'cards') bindCardFields(it); else bindPieceFields(it);
  updatePreview();
}
function catOptions(sel) {
  return kit.categories.map(c => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    || '<option value="">(add a category first)</option>';
}
function cardFormHTML(c) {
  return `
  <label>Name <input id="fName" type="text" maxlength="60" value="${esc(c.name)}"></label>
  <label>Category <select id="fCat">${catOptions(c.category)}</select></label>
  <div class="row2">
    <label>Value badge <input id="fValue" type="text" maxlength="6" placeholder="e.g. 3" value="${esc(c.value)}"></label>
    <label>Copies to print <input id="fCount" type="number" min="1" max="999" value="${c.count}"></label>
  </div>
  <div class="statBlock">
    <div class="sideHead"><span>Stats</span><button id="fAddStat" class="iconbtn" type="button" ${c.stats.length >= 4 ? 'disabled' : ''}>＋</button></div>
    <div id="statRows">${c.stats.map((s, i) => `<div class="statRow" data-i="${i}">
        <input class="sLabel" type="text" maxlength="16" placeholder="Label" value="${esc(s.label)}">
        <input class="sValue" type="text" maxlength="10" placeholder="Value" value="${esc(s.value)}">
        <button class="iconbtn danger sDel" type="button">✕</button></div>`).join('')}</div>
  </div>
  <label>Text <textarea id="fText" maxlength="400" rows="4">${esc(c.text)}</textarea></label>
  ${artControlsHTML(c)}`;
}
function pieceFormHTML(p) {
  return `
  <label>Name <input id="fName" type="text" maxlength="60" value="${esc(p.name)}"></label>
  <label>Category <select id="fCat">${catOptions(p.category)}</select></label>
  <div class="row2">
    <label>Shape <select id="fShape">${SHAPES.map(s => `<option value="${s}" ${s === p.shape ? 'selected' : ''}>${SHAPE_LABELS[s]}</option>`).join('')}</select></label>
    <label>Copies to print <input id="fCount" type="number" min="1" max="999" value="${p.count}"></label>
  </div>
  <label>Print size <input id="fSize" type="range" min="20" max="400" value="${p.size}"> <span id="fSizeLbl" class="rangeVal">${(p.size / 100).toFixed(2)}"</span></label>
  ${artControlsHTML(p)}`;
}
function artControlsHTML(it) {
  const has = !!it.art?.asset;
  return `
  <div class="artBlock">
    <div class="sideHead"><span>Art</span></div>
    <div class="artBtns">
      <label class="btn ghost small filebtn">📁 Upload image<input id="fArtFile" type="file" accept="image/*" hidden></label>
      ${has ? '<button id="fArtClear" class="btn ghost small" type="button">Remove</button>' : ''}
    </div>
    ${has ? `<label>Zoom <input id="fArtScale" type="range" min="0.3" max="4" step="0.05" value="${it.art.scale}"></label>
      <label>Rotate <input id="fArtRot" type="range" min="-180" max="180" step="1" value="${it.art.rot}"></label>` : '<p class="hint small">No art yet — upload an image, or drag one onto the preview.</p>'}
  </div>`;
}
function bindCommonFields(it) {
  $('#fName').addEventListener('input', e => { it.name = e.target.value.slice(0, 60) || 'Untitled'; mutate(); renderItemList(); updatePreview(); });
  $('#fCat').addEventListener('change', e => { it.category = e.target.value; mutate(); renderItemList(); updatePreview(); });
  $('#fCount').addEventListener('input', e => { it.count = Math.max(1, Math.min(999, +e.target.value | 0 || 1)); mutate(); });
  bindArtFields(it);
}
function bindArtFields(it) {
  const fileInput = $('#fArtFile');
  fileInput?.addEventListener('change', async e => {
    const f = e.target.files[0]; if (!f) return;
    await setArtFromFile(it, f, ui.tab === 'pieces');
    renderEditor();
  });
  $('#fArtClear')?.addEventListener('click', () => { it.art = { asset: '', x: 0, y: 0, scale: 1, rot: 0 }; mutate(); renderEditor(); });
  $('#fArtScale')?.addEventListener('input', e => { it.art.scale = +e.target.value; mutate(); updatePreview(); });
  $('#fArtRot')?.addEventListener('input', e => { it.art.rot = +e.target.value; mutate(); updatePreview(); });
}
function bindCardFields(c) {
  $('#fValue').addEventListener('input', e => { c.value = e.target.value.slice(0, 6); mutate(); updatePreview(); });
  $('#fText').addEventListener('input', e => { c.text = e.target.value.slice(0, 400); mutate(); updatePreview(); });
  $('#fAddStat').addEventListener('click', () => { if (c.stats.length < 4) { c.stats.push({ label: '', value: '' }); mutate(); renderEditor(); } });
  document.querySelectorAll('.statRow').forEach(row => {
    const i = +row.dataset.i;
    row.querySelector('.sLabel').addEventListener('input', e => { c.stats[i].label = e.target.value.slice(0, 16); mutate(); updatePreview(); });
    row.querySelector('.sValue').addEventListener('input', e => { c.stats[i].value = e.target.value.slice(0, 10); mutate(); updatePreview(); });
    row.querySelector('.sDel').addEventListener('click', () => { c.stats.splice(i, 1); mutate(); renderEditor(); });
  });
}
function bindPieceFields(p) {
  $('#fShape').addEventListener('change', e => { p.shape = e.target.value; mutate(); updatePreview(); });
  $('#fSize').addEventListener('input', e => { p.size = +e.target.value; $('#fSizeLbl').textContent = (p.size / 100).toFixed(2) + '"'; mutate(); });
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
async function setArtFromFile(it, file, trim) {
  if (!file.type.startsWith('image/')) return toast('That file is not an image.');
  try {
    const img = await fileToImage(file);
    const dataUrl = trimAndEncode(img, trim);
    const id = newId('a');
    kit.assets[id] = dataUrl;
    it.art = { asset: dataUrl, x: 0, y: 0, scale: 1, rot: 0 };
    mutate();
    if (trim) toast('Art added — transparent edges trimmed automatically.');
  } catch (err) { toast(err.message || 'Could not load that image.'); }
}

// ---------- preview (render + drag-to-pan + scroll-to-zoom) ----------
let dragState = null;
function updatePreview() {
  const it = selected(); if (!it) return;
  const svg = ui.tab === 'cards' ? cardSVG(it, kit, 'live') : pieceSVG(it, kit, 'live');
  $('#previewSvg').innerHTML = svg;
  const el = $('#previewSvg svg');
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', e => onDragStart(e, it, el));
  el.addEventListener('wheel', e => onZoom(e, it), { passive: false });
}
function viewBoxSize() { return ui.tab === 'cards' ? { w: CARD_W, h: CARD_H } : { w: PIECE_SIZE, h: PIECE_SIZE }; }
function onDragStart(e, it, el) {
  if (!it.art?.asset) return;
  el.setPointerCapture(e.pointerId);
  const { w } = viewBoxSize(), rect = el.getBoundingClientRect(), unitsPerPx = w / rect.width;
  dragState = { it, el, startX: e.clientX, startY: e.clientY, ax: it.art.x, ay: it.art.y, unitsPerPx };
  const move = ev => {
    if (!dragState) return;
    const dx = (ev.clientX - dragState.startX) * dragState.unitsPerPx, dy = (ev.clientY - dragState.startY) * dragState.unitsPerPx;
    it.art.x = dragState.ax + dx; it.art.y = dragState.ay + dy;
    updatePreview(); mutate();
  };
  const up = () => { dragState = null; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
  el.addEventListener('pointermove', move); el.addEventListener('pointerup', up);
}
function onZoom(e, it) {
  if (!it.art?.asset) return;
  e.preventDefault();
  it.art.scale = Math.max(0.1, Math.min(8, it.art.scale * (e.deltaY > 0 ? 0.92 : 1.08)));
  const scaleInput = $('#fArtScale'); if (scaleInput) scaleInput.value = it.art.scale;
  updatePreview(); mutate();
}
// Drag-and-drop an image file straight onto the preview.
$('#previewWrap')?.addEventListener('dragover', e => e.preventDefault());
$('#previewWrap')?.addEventListener('drop', async e => {
  e.preventDefault();
  const it = selected(); const f = e.dataTransfer.files?.[0];
  if (!it || !f) return;
  await setArtFromFile(it, f, ui.tab === 'pieces');
  renderEditor();
});

// ---------- kit info tab ----------
function renderInfo() {
  $('#infoTitle').value = kit.title; $('#infoClass').value = kit.className; $('#infoAuthor').value = kit.author;
  $('#infoTitle').oninput = e => { kit.title = e.target.value.slice(0, 80) || 'My Game Kit'; $('#kitTitle').value = kit.title; mutate(); };
  $('#infoClass').oninput = e => { kit.className = e.target.value.slice(0, 80); mutate(); };
  $('#infoAuthor').oninput = e => { kit.author = e.target.value.slice(0, 80); mutate(); };
  const warns = kitWarnings(kit);
  $('#warnings').innerHTML = warns.length ? `<h3>Before you export</h3><ul>${warns.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : '<p class="hint">✅ Looks ready to export.</p>';
}

// ---------- export ----------
async function exportZip() {
  if (!kit.cards.length && !kit.pieces.length) return toast('Nothing to export yet — add a card or piece first.');
  toast('Packing ZIP…');
  let JSZip; try { JSZip = await lib(); } catch { return toast('Could not load the ZIP library — check your internet connection.'); }
  const zip = new JSZip(), base = slug(kit.title);
  zip.file('kit.json', JSON.stringify(kit, null, 2));
  zip.file('README.txt', readme(kit));
  for (const c of kit.cards) zip.file(`cards/${slug(c.name)}-${c.id}.png`, await toPNG(cardSVG(c, kit), CARD_W, CARD_H, 2));
  for (const p of kit.pieces) zip.file(`pieces/${slug(p.name)}-${p.id}.png`, await toPNG(pieceSVG(p, kit), PIECE_SIZE, PIECE_SIZE + 46, 2));
  if (kit.cards.length) await addPrintSheets(zip);
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${base}.zip`);
  toast('📦 ZIP downloaded!');
}
async function addPrintSheets(zip) {
  const { cw, ch, gapX, gapY, perPage } = printLayout();
  const queue = printQueue(kit.cards);
  const pages = Math.ceil(queue.length / perPage);
  for (let p = 0; p < pages; p++) {
    const cv = document.createElement('canvas'); cv.width = 2550; cv.height = 3300;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);
    const slice = queue.slice(p * perPage, p * perPage + perPage);
    for (let i = 0; i < slice.length; i++) {
      const col = i % 3, row = Math.floor(i / 3);
      const x = 75 + col * (cw + gapX), y = 75 + row * (ch + gapY);
      const blob = await toPNG(cardSVG(slice[i], kit), CARD_W, CARD_H, 1.5);
      const bmp = await createImageBitmap(blob);
      ctx.drawImage(bmp, x, y, cw, ch);
      ctx.strokeStyle = '#cccccc'; ctx.strokeRect(x, y, cw, ch);
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

// ---------- import ----------
async function importFile(file) {
  try {
    if (file.name.endsWith('.json')) {
      const text = await file.text();
      kit = normalizeKit(JSON.parse(text));
    } else if (file.name.endsWith('.zip')) {
      const JSZip = await lib();
      const zip = await JSZip.loadAsync(file);
      const entry = zip.file('kit.json');
      if (!entry) return toast('That ZIP has no kit.json — is it a Curriculum Forge export?');
      kit = normalizeKit(JSON.parse(await entry.async('string')));
    } else return toast('Import a kit.json or a Curriculum Forge ZIP export.');
    ui.selId = null; mutate(); renderAll();
    toast('✅ Kit imported.');
  } catch (err) { toast('Could not import that file: ' + (err.message || err)); }
}

// ---------- top-level render ----------
function renderAll() {
  renderSidebar();
  renderEditor();
}

// ---------- boot ----------
(async function boot() {
  await load();
  bindTopbar();
  document.title = `${kit.title} — Curriculum Forge`;
  console.log(`Curriculum Forge v${VERSION} "${CODENAME}"`);
  renderAll();
  await store.persist();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
