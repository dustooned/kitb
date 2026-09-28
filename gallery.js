// The gallery: Kit Forge's home screen, modelled on Procreate's gallery and the iOS home screen.
// Every card, piece and board is a thumbnail tile; decks are stacks. Drag a tile onto another to
// make a deck (or drop it on a deck to add it), drag between tiles to reorder (the others slide
// out of the way), and drag out of an open deck to take an item back out. Mouse drags start
// straight away; on touch you press and hold first, so a normal swipe still scrolls.
import { esc, itemSVG } from './render.js';
import {
  itemById, deckById, deckItems, placeTop, placeInDeck, newDeckFrom, ungroupDeck, dropEmptyDecks,
  deleteItems, duplicateItem, reorderSubset, SIZE_PRESETS, DEFAULT_COLORS, MASKS, MASK_LABELS, MIN_IN, MAX_IN,
} from './model.js';
import { I } from './icons.js';

const $ = s => document.querySelector(s);
const KIND = { card: 'Card', piece: 'Piece', board: 'Board' };
const KINDS_PLURAL = { all: 'Everything', card: 'Cards', piece: 'Pieces', board: 'Boards' };
const st = { filter: 'all', selecting: false, picked: new Set(), deck: null };
/** ctx: { kit(), commit(fn, pre?), open(id), create(kind, presetId, deckId), toast(msg), menu(e, items, pick) } */
let G;

// ---------- thumbnails ----------
// Each item's SVG goes into a blob: URL, rebuilt only when the item changes. The key squashes
// long strings (embedded images) so comparing it stays cheap.
const thumbs = new Map();
const thumbKey = it => JSON.stringify(it, (k, v) => typeof v === 'string' && v.length > 120 ? `${v.length}:${v.slice(-40)}` : v);
function thumb(it) {
  const key = thumbKey(it), c = thumbs.get(it.id);
  if (c?.key === key) return c.url;
  if (c) URL.revokeObjectURL(c.url);
  const url = URL.createObjectURL(new Blob([itemSVG(it, 'g' + it.id)], { type: 'image/svg+xml' }));
  thumbs.set(it.id, { key, url });
  return url;
}

// ---------- rendering ----------
const shown = it => st.filter === 'all' || it.kind === st.filter;
const check = key => st.selecting ? `<span class="g-check" aria-hidden="true">${st.picked.has(key) ? I.check : ''}</span>` : '';
function itemTile(it) {
  return `<div class="g-tile${st.picked.has(it.id) ? ' picked' : ''}" data-key="${it.id}" role="button" tabindex="0" aria-label="${esc(it.name)}, ${KIND[it.kind]}">
    <div class="g-art g-${it.kind}"><img src="${thumb(it)}" alt="" draggable="false"></div>
    <div class="g-cap"><b>${esc(it.name)}</b><small>${KIND[it.kind]} · ${it.size.w}×${it.size.h}″${it.count > 1 ? ` · ×${it.count}` : ''}</small></div>${check(it.id)}</div>`;
}
function deckTile(d, list) {
  const art = list.slice(0, 3).map((it, i) => `<img class="s${i}" src="${thumb(it)}" alt="" draggable="false">`).join('') || '<span class="g-empty-deck">Empty</span>';
  return `<div class="g-tile deck" data-key="d:${d.id}" role="button" tabindex="0" aria-label="${esc(d.name)} deck, ${list.length} items" style="--deck:${d.color}">
    <div class="g-art g-stack n${Math.min(list.length, 3)}">${art}</div>
    <div class="g-cap"><b>${esc(d.name)}</b><small>${list.length} item${list.length === 1 ? '' : 's'}</small></div></div>`;
}
export function renderGallery() {
  const k = G.kit();
  const tiles = k.order.map(key => {
    if (key.startsWith('d:')) {
      const d = deckById(k, key.slice(2)); if (!d) return '';
      const list = deckItems(k, d).filter(shown);
      return list.length || st.filter === 'all' ? deckTile(d, list) : '';
    }
    const it = itemById(k, key); return it && shown(it) ? itemTile(it) : '';
  }).join('');
  const counts = { card: k.cards.length, piece: k.pieces.length, board: k.boards.length };
  $('#gChips').innerHTML = Object.entries(KINDS_PLURAL).map(([f, label]) => `<button type="button" data-filter="${f}" aria-pressed="${st.filter === f}">${label}${f !== 'all' ? ` <span>${counts[f]}</span>` : ''}</button>`).join('');
  $('#gGrid').innerHTML = tiles + `<button type="button" class="g-tile g-add" data-new aria-label="Make something new"><span class="g-art">${I.plus}</span><span class="g-cap"><b>New</b><small>card · piece · board</small></span></button>`;
  $('#gSelect').textContent = st.selecting ? 'Done' : 'Select';
  $('#gSelect').setAttribute('aria-pressed', st.selecting);
  renderSelbar();
  if (st.deck) renderDeck();
}
function renderSelbar() {
  const bar = $('#gSelbar'), n = st.picked.size;
  bar.hidden = !st.selecting;
  if (!st.selecting) return;
  bar.innerHTML = `<b>${n ? `${n} selected` : 'Tap to select'}</b><span class="spacer"></span>
    <button type="button" class="dk-btn" data-sel="deck" ${n < 1 ? 'disabled' : ''}>${I.layers}<span>New deck</span></button>
    <button type="button" class="dk-btn" data-sel="move" ${n < 1 ? 'disabled' : ''}>${I.move}<span>Move to…</span></button>
    <button type="button" class="dk-btn" data-sel="dup" ${n < 1 ? 'disabled' : ''}>${I.dup}<span>Duplicate</span></button>
    <button type="button" class="dk-btn danger" data-sel="del" ${n < 1 ? 'disabled' : ''}>${I.trash}<span>Delete</span></button>
    <button type="button" class="dk-btn accent" data-sel="done">${I.check}<span>Done</span></button>`;
}

// ---------- open deck (iOS folder) ----------
function openDeck(id) { st.deck = id; renderDeck(); $('#deckOverlay').hidden = false; }
function closeDeck() { st.deck = null; $('#deckOverlay').hidden = true; renderGallery(); }
function renderDeck() {
  const k = G.kit(), d = deckById(k, st.deck);
  if (!d) { st.deck = null; $('#deckOverlay').hidden = true; return; }
  const list = deckItems(k, d);
  $('#deckPanel').style.setProperty('--deck', d.color);
  $('#deckHead').innerHTML = `<input id="deckName" type="text" maxlength="40" value="${esc(d.name)}" aria-label="Deck name">
    <div class="deck-colors">${DEFAULT_COLORS.map(c => `<button type="button" class="sw" data-color="${c}" style="--c:${c}" aria-label="Deck colour ${c}" aria-pressed="${c === d.color}"></button>`).join('')}</div>
    <span class="spacer"></span>
    <button type="button" class="dk-btn" data-deck="new">${I.plus}<span>New in deck</span></button>
    <button type="button" class="dk-btn" data-deck="ungroup">${I.restore}<span>Ungroup</span></button>
    <button type="button" class="lp-ic" data-deck="close" aria-label="Close deck">${I.close}</button>`;
  $('#deckGrid').innerHTML = list.map(itemTile).join('') || '<p class="g-note">This deck is empty. Drag things onto it in the gallery.</p>';
  $('#deckHint').textContent = list.length ? 'Drag to reorder · drag out of this box to take something out of the deck' : '';
}

// ---------- drag (mouse + touch) ----------
let drag = null;
function flip(container, mutate) {
  const els = [...container.children], before = new Map(els.map(el => [el, el.getBoundingClientRect()]));
  mutate();
  for (const el of els) {
    if (el === drag?.tile) continue;
    const a = before.get(el), b = el.getBoundingClientRect(), dx = a.left - b.left, dy = a.top - b.top;
    if (dx || dy) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}
const clearMerge = () => { if (!drag) return; clearTimeout(drag.mergeT); drag.merge?.classList.remove('g-merge'); drag.merge = null; };
function startDrag(tile, x, y, touch) {
  const r = tile.getBoundingClientRect(), ghost = tile.cloneNode(true);
  ghost.classList.add('g-ghost'); ghost.removeAttribute('data-key');
  Object.assign(ghost.style, { width: r.width + 'px', height: r.height + 'px', left: r.left + 'px', top: r.top + 'px' });
  document.body.append(ghost);
  tile.classList.add('g-lifted');
  drag = { key: tile.dataset.key, tile, ghost, touch, container: tile.parentElement, scope: tile.closest('#deckGrid') ? 'deck' : 'top',
    ox: x - r.left, oy: y - r.top, left: r.left, top: r.top, x0: x, y0: y, moved: false, merge: null, pre: JSON.stringify(G.kit()) };
  document.body.classList.add('g-dragging');
  if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(8);
}
function dragMove(x, y) {
  const d = drag; if (!d) return;
  if (Math.hypot(x - d.x0, y - d.y0) > 6) d.moved = true;
  d.ghost.style.transform = `translate(${x - d.ox - d.left}px, ${y - d.oy - d.top}px) scale(1.06) rotate(-1.5deg)`;
  if (d.scope === 'deck') {
    const p = $('#deckPanel').getBoundingClientRect();
    if (x < p.left - 12 || x > p.right + 12 || y < p.top - 12 || y > p.bottom + 12) return pullOut();
  }
  const under = document.elementFromPoint(x, y)?.closest('.g-tile');
  if (!under || under === d.tile || under.classList.contains('g-add') || !d.container.contains(under)) return clearMerge();
  const r = under.getBoundingClientRect(), fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
  // Hovering over the middle of a tile (top level only, not dragging a deck) = drop into it.
  const canMerge = d.scope === 'top' && !d.key.startsWith('d:') && fx > 0.22 && fx < 0.78 && fy > 0.15 && fy < 0.85;
  if (canMerge) {
    if (d.merge !== under) { clearMerge(); d.merge = under; d.mergeT = setTimeout(() => under.classList.add('g-merge'), 260); }
    return;
  }
  clearMerge();
  const before = fx < 0.5;
  if ((before && under.previousElementSibling === d.tile) || (!before && under.nextElementSibling === d.tile)) return;
  flip(d.container, () => d.container.insertBefore(d.tile, before ? under : under.nextSibling));
}
/** Dragged outside an open deck: take the item out, close the deck, keep dragging in the gallery. */
function pullOut() {
  const d = drag, k = G.kit(), deckId = st.deck, it = itemById(k, d.key); if (!it) return;
  const at = k.order.indexOf('d:' + deckId);
  placeTop(k, d.key, k.order[at + 1] || null);
  dropEmptyDecks(k);
  st.deck = null; $('#deckOverlay').hidden = true;
  renderGallery();
  const tile = $(`#gGrid [data-key="${d.key}"]`);
  if (tile) Object.assign(d, { tile, container: tile.parentElement, scope: 'top' }), tile.classList.add('g-lifted');
}
function endDrag(cancelled) {
  const d = drag; if (!d) return;
  drag = null;
  document.body.classList.remove('g-dragging');
  const merge = d.merge?.classList.contains('g-merge') ? d.merge.dataset.key : null;
  d.merge?.classList.remove('g-merge'); clearTimeout(d.mergeT);
  const land = (merge ? $(`[data-key="${merge}"]`) : d.tile)?.getBoundingClientRect();
  const finish = () => { d.ghost.remove(); d.tile.classList.remove('g-lifted'); };
  if (land && !cancelled) {
    d.ghost.animate([{ transform: d.ghost.style.transform }, { transform: `translate(${land.left - d.left}px, ${land.top - d.top}px) scale(${merge ? 0.5 : 1})`, opacity: merge ? 0 : 1 }], { duration: 180, easing: 'ease-out' }).onfinish = finish;
  } else finish();
  if (cancelled) return renderGallery();
  // A touch long-press that never moved: show the menu instead (like iOS).
  if (!d.moved) { finish(); return d.touch ? tileMenu(d.tile, d.tile.getBoundingClientRect()) : null; }
  const keys = [...d.container.children].map(el => el.dataset.key).filter(Boolean);
  let opened = null;
  G.commit(k => {
    if (merge) {
      if (merge.startsWith('d:')) placeInDeck(k, d.key, merge.slice(2));
      else { const deck = newDeckFrom(k, [merge, d.key]); opened = deck.id; }
    } else if (d.scope === 'deck' && st.deck) { const deck = deckById(k, st.deck); deck.order = reorderSubset(deck.order, keys); }
    else k.order = reorderSubset(k.order, keys);
  }, d.pre);
  if (opened) { openDeck(opened); setTimeout(() => $('#deckName')?.select(), 50); G.toast('New deck — give it a name.'); }
}
function bindDrag(container) {
  container.addEventListener('pointerdown', e => {
    const tile = e.target.closest('.g-tile');
    if (!tile || tile.classList.contains('g-add') || e.button !== 0 || drag) return;
    const touch = e.pointerType !== 'mouse', x0 = e.clientX, y0 = e.clientY;
    let started = false, lx = x0, ly = y0;
    const timer = touch ? setTimeout(() => { started = true; startDrag(tile, x0, y0, true); dragMove(lx, ly); }, 380) : null;
    const move = ev => {
      lx = ev.clientX; ly = ev.clientY;
      if (!started) {
        if (Math.hypot(lx - x0, ly - y0) < 8) return;
        if (touch) return cleanup(); // a swipe before the hold: let the page scroll
        started = true; startDrag(tile, x0, y0, false);
      }
      dragMove(lx, ly);
    };
    const up = () => { cleanup(); if (started) endDrag(false); else if (Math.hypot(lx - x0, ly - y0) < 8) tap(tile); };
    const cancel = () => { cleanup(); if (started) endDrag(true); };
    const cleanup = () => { clearTimeout(timer); removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', cancel); };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', cancel);
  });
  // Once a touch drag is on, stop the page from scrolling under the finger.
  container.addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  container.addEventListener('contextmenu', e => {
    const tile = e.target.closest('.g-tile'); if (!tile || tile.classList.contains('g-add')) return;
    e.preventDefault();
    if (drag || e.pointerType === 'touch') return; // touch uses the long-press path
    tileMenu(tile, { left: e.clientX, top: e.clientY, bottom: e.clientY });
  });
  container.addEventListener('keydown', e => {
    const tile = e.target.closest('.g-tile'); if (!tile) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(tile); }
    if (e.key === 'Delete' && !tile.classList.contains('g-add') && !tile.dataset.key.startsWith('d:')) confirmDelete([tile.dataset.key]);
  });
}
function tap(tile) {
  if (tile.hasAttribute('data-new')) return newSheet();
  const key = tile.dataset.key;
  if (st.selecting && !key.startsWith('d:')) { st.picked.has(key) ? st.picked.delete(key) : st.picked.add(key); return renderGallery(); }
  if (key.startsWith('d:')) return openDeck(key.slice(2));
  G.open(key);
}

// ---------- menus & actions ----------
function moveTargets(k, ids) {
  const inDecks = new Set(ids.map(id => itemById(k, id)?.category));
  return [...k.categories.filter(d => !(inDecks.size === 1 && inDecks.has(d.id))).map(d => [`to:${d.id}`, `Move to “${d.name}”`]),
    ...(ids.some(id => itemById(k, id)?.category) ? [['to:', 'Take out of deck']] : []), ['to:new', 'Move to a new deck']];
}
function moveItems(ids, where) {
  let opened = null;
  G.commit(k => {
    if (where === 'new') opened = newDeckFrom(k, ids).id;
    else if (where) for (const id of ids) placeInDeck(k, id, where);
    else for (const id of ids) { const it = itemById(k, id), at = it?.category ? k.order.indexOf('d:' + it.category) : -1; placeTop(k, id, at >= 0 ? k.order[at + 1] || null : null); }
    dropEmptyDecks(k);
  });
  if (opened) { openDeck(opened); setTimeout(() => $('#deckName')?.select(), 50); }
}
function confirmDelete(ids) {
  if (!ids.length || !confirm(`Delete ${ids.length === 1 ? `“${itemById(G.kit(), ids[0])?.name}”` : `${ids.length} items`}? (Ctrl+Z brings it back.)`)) return;
  G.commit(k => deleteItems(k, ids));
  for (const id of ids) st.picked.delete(id);
  renderGallery();
}
function tileMenu(tile, at) {
  const k = G.kit(), key = tile.dataset.key, ev = { preventDefault() {}, clientX: at.left + 10, clientY: (at.bottom ?? at.top) - 6 };
  if (key.startsWith('d:')) {
    const d = deckById(k, key.slice(2));
    return G.menu(ev, [['open', 'Open deck'], ['rename', 'Rename…'], ['ungroup', 'Ungroup'], null, ['deldeck', 'Delete deck and everything in it', true]], a => {
      if (a === 'open') openDeck(d.id);
      if (a === 'rename') { const n = prompt('Deck name', d.name); if (n?.trim()) G.commit(() => { d.name = n.trim().slice(0, 40); }); }
      if (a === 'ungroup') G.commit(kk => ungroupDeck(kk, d.id));
      if (a === 'deldeck') confirmDelete([...d.order]);
    });
  }
  const it = itemById(k, key);
  G.menu(ev, [['open', 'Open'], ['rename', 'Rename…'], ['dup', 'Duplicate'], null, ...moveTargets(k, [key]), null, ['select', 'Select'], ['del', 'Delete', true]], a => {
    if (a === 'open') G.open(key);
    if (a === 'rename') { const n = prompt('Name', it.name); if (n?.trim()) G.commit(() => { it.name = n.trim().slice(0, 60); }); }
    if (a === 'dup') G.commit(kk => duplicateItem(kk, key));
    if (a.startsWith('to:')) moveItems([key], a.slice(3));
    if (a === 'select') { st.selecting = true; st.picked = new Set([key]); renderGallery(); }
    if (a === 'del') confirmDelete([key]);
  });
}
function selAction(a, btn) {
  const ids = [...st.picked].filter(id => itemById(G.kit(), id));
  if (a === 'done') { st.selecting = false; st.picked.clear(); return renderGallery(); }
  if (!ids.length) return;
  if (a === 'deck') { moveItems(ids, 'new'); st.picked.clear(); st.selecting = false; return renderGallery(); }
  if (a === 'dup') { G.commit(k => ids.forEach(id => duplicateItem(k, id))); return G.toast(`Duplicated ${ids.length}.`); }
  if (a === 'del') return confirmDelete(ids);
  if (a === 'move') {
    const r = btn.getBoundingClientRect();
    G.menu({ preventDefault() {}, clientX: r.left, clientY: r.top - 8 }, moveTargets(G.kit(), ids), w => { moveItems(ids, w.slice(3)); st.picked.clear(); st.selecting = false; renderGallery(); });
  }
}

// ---------- New dialog ----------
// A standard "New document" dialog: pick Card / Piece / Board, pick a size from a short list
// (or type your own), flip orientation, name it, Create. Double-clicking a size creates it
// straight away.
const nd = { kind: 'card', preset: '', w: 2.5, h: 3.5, name: '', mask: 'circle' };
const presetsOf = kind => SIZE_PRESETS[kind].filter(p => p.id !== 'custom');
function pickPreset(p) { Object.assign(nd, { preset: p.id, w: p.w, h: p.h }); }
function newSheet(kind = st.filter === 'all' ? nd.kind : st.filter) {
  if (kind !== nd.kind || !nd.preset) { nd.kind = kind; pickPreset(presetsOf(kind)[0]); }
  nd.name = '';
  renderNewSheet();
  $('#newSheet').hidden = false;
  $('#newSheet [data-np].on')?.focus();
}
function renderNewSheet() {
  const shape = (w, h, big) => { const s = (big ? 120 : 30) / Math.max(w, h); return `<span class="ns-shape ${nd.kind}${nd.kind === 'piece' ? ' m-' + nd.mask : ''}" style="width:${Math.max(big ? 24 : 8, w * s)}px;height:${Math.max(big ? 24 : 8, h * s)}px"></span>`; };
  const dims = p => `${p.w} × ${p.h} in`;
  $('#newSheet').innerHTML = `<div class="ns-panel glass" role="dialog" aria-label="New">
    <div class="ns-head"><b>New</b><span class="spacer"></span><button type="button" class="lp-ic" data-ns="close" aria-label="Close">${I.close}</button></div>
    <div class="seg-soft ns-kinds" role="tablist">${Object.entries(KIND).map(([k, label]) => `<button type="button" role="tab" data-nk="${k}" aria-selected="${nd.kind === k}" aria-pressed="${nd.kind === k}">${label}</button>`).join('')}</div>
    <div class="ns-body">
      <div class="ns-list" role="listbox" aria-label="Size">${presetsOf(nd.kind).map(p => `<button type="button" role="option" data-np="${p.id}" class="${nd.preset === p.id ? 'on' : ''}" aria-selected="${nd.preset === p.id}">${shape(p.w, p.h)}<span>${esc(p.label.replace(/\s*\(.*\)/, ''))}</span><small>${dims(p)}</small></button>`).join('')}</div>
      <div class="ns-side">
        <div class="ns-preview">${shape(nd.w, nd.h, true)}</div>
        <label class="ns-f">Name<input data-nf="name" type="text" maxlength="60" placeholder="New ${nd.kind}" value="${esc(nd.name)}"></label>
        <div class="ns-dims"><label class="ns-f">Width<input data-nf="w" type="number" min="${MIN_IN}" max="${MAX_IN}" step="0.05" value="${nd.w}"></label>
          <button type="button" class="lp-ic" data-ns="swap" title="Swap width and height" aria-label="Swap width and height">⇄</button>
          <label class="ns-f">Height<input data-nf="h" type="number" min="${MIN_IN}" max="${MAX_IN}" step="0.05" value="${nd.h}"></label><span class="ns-unit">in</span></div>
        ${nd.kind === 'piece' ? `<label class="ns-f">Shape<select data-nf="mask">${MASKS.filter(m => m !== 'none').map(m => `<option value="${m}" ${m === nd.mask ? 'selected' : ''}>${MASK_LABELS[m]}</option>`).join('')}</select></label>` : ''}
        <button type="button" class="dk-btn accent ns-create" data-ns="create">Create</button>
        ${st.deck ? '<p class="g-note">Goes into the open deck.</p>' : ''}
      </div>
    </div></div>`;
}
function createFromSheet() {
  $('#newSheet').hidden = true;
  const deckId = st.deck;
  if (deckId) { st.deck = null; $('#deckOverlay').hidden = true; }
  const w = Math.min(MAX_IN, Math.max(MIN_IN, +nd.w || 1)), h = Math.min(MAX_IN, Math.max(MIN_IN, +nd.h || 1));
  G.create(nd.kind, nd.preset || presetsOf(nd.kind)[0].id, deckId, { w, h, name: nd.name.trim(), mask: nd.mask });
}

// ---------- wiring ----------
export function initGallery(ctx) {
  G = ctx;
  bindDrag($('#gGrid')); bindDrag($('#deckGrid'));
  $('#gChips').addEventListener('click', e => { const b = e.target.closest('[data-filter]'); if (b) { st.filter = b.dataset.filter; renderGallery(); } });
  $('#gSelect').addEventListener('click', () => { st.selecting = !st.selecting; st.picked.clear(); renderGallery(); });
  $('#gNew').addEventListener('click', () => newSheet());
  // The + tile is skipped by the drag code (it isn't draggable), so it needs its own click.
  $('#gGrid').addEventListener('click', e => { if (e.target.closest('[data-new]')) newSheet(); });
  $('#gSelbar').addEventListener('click', e => { const b = e.target.closest('[data-sel]'); if (b && !b.disabled) selAction(b.dataset.sel, b); });
  $('#deckOverlay').addEventListener('click', e => {
    if (e.target.id === 'deckOverlay') return closeDeck();
    const c = e.target.closest('[data-color]');
    if (c) { const d = deckById(G.kit(), st.deck); return G.commit(() => { d.color = c.dataset.color; }); }
    const b = e.target.closest('[data-deck]'); if (!b) return;
    if (b.dataset.deck === 'close') closeDeck();
    if (b.dataset.deck === 'new') newSheet();
    if (b.dataset.deck === 'ungroup') { const id = st.deck; closeDeck(); G.commit(k => ungroupDeck(k, id)); }
  });
  $('#deckOverlay').addEventListener('change', e => {
    if (e.target.id !== 'deckName') return;
    const d = deckById(G.kit(), st.deck), n = e.target.value.trim().slice(0, 40);
    if (d && n && n !== d.name) G.commit(() => { d.name = n; });
  });
  $('#deckOverlay').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'deckName') e.target.blur(); });
  const sheet = $('#newSheet');
  sheet.addEventListener('click', e => {
    if (e.target === sheet) { sheet.hidden = true; return; }
    const k = e.target.closest('[data-nk]'); if (k) { nd.kind = k.dataset.nk; pickPreset(presetsOf(nd.kind)[0]); return renderNewSheet(); }
    const p = e.target.closest('[data-np]'); if (p) { pickPreset(presetsOf(nd.kind).find(x => x.id === p.dataset.np)); renderNewSheet(); return $(`#newSheet [data-np="${nd.preset}"]`)?.focus(); }
    const b = e.target.closest('[data-ns]'); if (!b) return;
    if (b.dataset.ns === 'close') sheet.hidden = true;
    if (b.dataset.ns === 'swap') { [nd.w, nd.h] = [nd.h, nd.w]; nd.preset = presetsOf(nd.kind).find(x => x.w === nd.w && x.h === nd.h)?.id || ''; renderNewSheet(); }
    if (b.dataset.ns === 'create') createFromSheet();
  });
  sheet.addEventListener('dblclick', e => { if (e.target.closest('[data-np]')) createFromSheet(); });
  sheet.addEventListener('input', e => {
    const f = e.target.dataset.nf; if (!f) return;
    nd[f] = f === 'w' || f === 'h' ? +e.target.value : e.target.value;
    if (f === 'w' || f === 'h') { nd.preset = presetsOf(nd.kind).find(x => x.w === nd.w && x.h === nd.h)?.id || ''; for (const b of sheet.querySelectorAll('[data-np]')) b.classList.toggle('on', b.dataset.np === nd.preset); }
    if (f === 'mask') renderNewSheet();
    const prev = sheet.querySelector('.ns-preview');
    if (prev && f !== 'name') { const s2 = 120 / Math.max(nd.w || 1, nd.h || 1); prev.firstElementChild.style.width = Math.max(24, (nd.w || 1) * s2) + 'px'; prev.firstElementChild.style.height = Math.max(24, (nd.h || 1) * s2) + 'px'; }
  });
  sheet.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.target.closest('[data-ns], [data-nk]')) { e.preventDefault(); createFromSheet(); } });
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || document.body.dataset.screen !== 'gallery') return;
    if (!$('#newSheet').hidden) $('#newSheet').hidden = true;
    else if (st.deck) closeDeck();
    else if (st.selecting) { st.selecting = false; st.picked.clear(); renderGallery(); }
  });
}
export const galleryDeckOpen = () => st.deck;
