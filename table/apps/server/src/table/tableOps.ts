// Every table operation as a plain function over (state + server-private data). The room wires
// these to messages; tests can call them directly. Nothing here is a game rule — only "does this
// piece exist, who is holding it, is this data well-formed". Nothing on this table is hidden
// information either (no private hands/decks), so a piece's face is always visible to everyone;
// faceUp only switches which image (front or back) is shown.
import { randomInt } from 'node:crypto';
import {
  MAX_PLAYERS, clampToTable,
  type NormalizedKit, type PieceDefinition, type PieceFace, type PieceKind,
} from '@kitforge/shared-types';
import { MarkerState, NoteState, PieceState, PlayerState, TableState } from './TableState.ts';
import { cleanText, isFiniteNumber } from './sanitize.ts';

export interface TableContext {
  state: TableState;
  nextOrder: number;
  nextId: number;
  randomInt: (maxExclusive: number) => number;
}

export interface OpResult { ok: boolean; notice?: string }
const ok = (): OpResult => ({ ok: true });
const fail = (notice?: string): OpResult => ({ ok: false, notice });

export function createTableContext(opts: Partial<Pick<TableContext, 'randomInt'>> = {}): TableContext {
  return { state: new TableState(), nextOrder: 1, nextId: 1, randomInt: opts.randomInt ?? (n => randomInt(n)) };
}

// ---------------------------------------------------------------- helpers

export function appendLog(ctx: TableContext, text: string) {
  ctx.state.log.push(text);
  while (ctx.state.log.length > 80) ctx.state.log.shift();
}

const nameOf = (ctx: TableContext, playerId: string) => ctx.state.players.get(playerId)?.name ?? 'Someone';
const seatOf = (ctx: TableContext, playerId: string) => ctx.state.players.get(playerId)?.seat ?? 0;
const faceOf = (piece: PieceState): PieceFace | null => { try { return piece.face ? (JSON.parse(piece.face) as PieceFace) : null; } catch { return null; } };
const labelOf = (piece: PieceState) => faceOf(piece)?.name ?? 'a piece';
const lockedByOther = (item: { lockedBy: string }, playerId: string) => !!item.lockedBy && item.lockedBy !== playerId;

function bump(ctx: TableContext, piece: PieceState) { piece.order = ctx.nextOrder++; }

function lockNotice(ctx: TableContext, item: { lockedBy: string }, what = 'piece') {
  return `${nameOf(ctx, item.lockedBy)} is moving that ${what}.`;
}

interface NewPiece { ownerId: string; face: PieceFace; x?: number; z?: number; rotation?: number; faceUp?: boolean }

export function createPiece(ctx: TableContext, spec: NewPiece): PieceState {
  const piece = new PieceState();
  piece.id = `p${ctx.nextId++}`;
  piece.ownerId = spec.ownerId;
  piece.kind = spec.face.kind;
  piece.w = spec.face.w;
  piece.h = spec.face.h;
  const pos = clampToTable(spec.x ?? 0, spec.z ?? 0, piece.w, piece.h);
  piece.x = pos.x;
  piece.z = pos.z;
  piece.rotation = spec.rotation ?? 0;
  piece.faceUp = spec.faceUp ?? true;
  piece.tapped = false;
  piece.lockedBy = '';
  piece.backImage = spec.face.backImage ?? '';
  piece.face = JSON.stringify(spec.face);
  bump(ctx, piece);
  ctx.state.pieces.set(piece.id, piece);
  return piece;
}

/** Topmost piece on the table covering this point (rotation- and size-aware). */
function pieceUnder(ctx: TableContext, x: number, z: number, exclude?: string): PieceState | undefined {
  let best: PieceState | undefined;
  for (const p of ctx.state.pieces.values()) {
    if (p.id === exclude) continue;
    const yaw = ((p.rotation - (p.tapped ? 90 : 0)) * Math.PI) / 180;
    const dx = x - p.x, dz = z - p.z;
    const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw), lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    if (Math.abs(lx) <= p.w / 2 && Math.abs(lz) <= p.h / 2 && (!best || p.order > best.order)) best = p;
  }
  return best;
}

function detachMarker(ctx: TableContext, marker: MarkerState) {
  const piece = marker.attachedTo ? ctx.state.pieces.get(marker.attachedTo) : undefined;
  if (piece) {
    const pos = clampToTable(piece.x + marker.ox, piece.z + marker.oz);
    marker.x = pos.x;
    marker.z = pos.z;
  }
  marker.attachedTo = '';
}

function detachMarkers(ctx: TableContext, piece: PieceState) {
  for (const m of ctx.state.markers.values()) if (m.attachedTo === piece.id) detachMarker(ctx, m);
}

function deletePiece(ctx: TableContext, piece: PieceState) {
  detachMarkers(ctx, piece);
  ctx.state.pieces.delete(piece.id);
}

function shuffleInPlace<T>(ctx: TableContext, list: T[]) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = ctx.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
}

// ---------------------------------------------------------------- players

export interface JoinResult { player?: PlayerState; reclaimed?: boolean; error?: string }

export function addPlayer(ctx: TableContext, opts: { name: unknown; reclaimPlayerId?: unknown; newId: string }): JoinResult {
  const players = [...ctx.state.players.values()];
  const name = cleanText(opts.name, 24) || `Player ${players.length + 1}`;
  const byId = typeof opts.reclaimPlayerId === 'string' ? ctx.state.players.get(opts.reclaimPlayerId) : undefined;
  const reclaim = (byId && !byId.connected ? byId : undefined)
    ?? players.find(p => !p.connected && p.name.toLowerCase() === name.toLowerCase());
  if (reclaim) {
    reclaim.connected = true;
    appendLog(ctx, `${reclaim.name} reconnected.`);
    return { player: reclaim, reclaimed: true };
  }
  const used = new Set(players.map(p => p.seat));
  let seat = -1;
  for (let s = 0; s < MAX_PLAYERS; s++) if (!used.has(s)) { seat = s; break; }
  if (seat < 0) return { error: `The table is full (${MAX_PLAYERS} seats). The host can remove a disconnected player to free a seat.` };
  const player = new PlayerState();
  player.id = opts.newId;
  player.name = name;
  player.seat = seat;
  player.connected = true;
  ctx.state.players.set(player.id, player);
  if (!ctx.state.hostId) ctx.state.hostId = player.id;
  appendLog(ctx, `${name} joined the table.`);
  return { player };
}

export function releaseLocks(ctx: TableContext, playerId: string) {
  const all = [...ctx.state.pieces.values(), ...ctx.state.markers.values(), ...ctx.state.notes.values()];
  for (const item of all) if (item.lockedBy === playerId) item.lockedBy = '';
}

export function setConnected(ctx: TableContext, playerId: string, connected: boolean) {
  const p = ctx.state.players.get(playerId);
  if (!p) return;
  p.connected = connected;
  if (!connected) releaseLocks(ctx, playerId);
}

export function reassignHost(ctx: TableContext) {
  const host = ctx.state.players.get(ctx.state.hostId);
  if (host?.connected) return;
  const next = [...ctx.state.players.values()].filter(p => p.connected).sort((a, b) => a.seat - b.seat)[0];
  if (next && next.id !== ctx.state.hostId) {
    ctx.state.hostId = next.id;
    appendLog(ctx, `${next.name} is now the host.`);
  }
}

export function kick(ctx: TableContext, actorId: string, targetId: unknown): OpResult {
  if (actorId !== ctx.state.hostId) return fail('Only the host can remove players.');
  if (typeof targetId !== 'string' || targetId === actorId) return fail();
  const target = ctx.state.players.get(targetId);
  if (!target) return fail();
  for (const piece of ctx.state.pieces.values()) if (piece.lockedBy === targetId) piece.lockedBy = '';
  ctx.state.players.delete(targetId);
  appendLog(ctx, `${nameOf(ctx, actorId)} removed ${target.name} from the table.`);
  return ok();
}

// ---------------------------------------------------------------- dragging

type Movable = { kind: 'piece'; item: PieceState } | { kind: 'marker'; item: MarkerState } | { kind: 'note'; item: NoteState };
function movable(ctx: TableContext, id: unknown): Movable | undefined {
  if (typeof id !== 'string') return undefined;
  const piece = ctx.state.pieces.get(id);
  if (piece) return { kind: 'piece', item: piece };
  const marker = ctx.state.markers.get(id);
  if (marker) return { kind: 'marker', item: marker };
  const note = ctx.state.notes.get(id);
  return note ? { kind: 'note', item: note } : undefined;
}

export function grab(ctx: TableContext, playerId: string, id: unknown): OpResult {
  const m = movable(ctx, id);
  if (!m) return fail('That is no longer there.');
  if (lockedByOther(m.item, playerId)) return fail(lockNotice(ctx, m.item, m.kind));
  if (m.kind === 'marker') detachMarker(ctx, m.item);
  m.item.lockedBy = playerId;
  m.item.order = ctx.nextOrder++;
  return ok();
}

export function move(ctx: TableContext, playerId: string, id: unknown, x: unknown, z: unknown): OpResult {
  const m = movable(ctx, id);
  if (!m || m.item.lockedBy !== playerId || !isFiniteNumber(x) || !isFiniteNumber(z)) return fail();
  const pos = clampToTable(x, z, m.kind === 'piece' ? m.item.w : undefined, m.kind === 'piece' ? m.item.h : undefined);
  m.item.x = pos.x;
  m.item.z = pos.z;
  return ok();
}

function dropLoose(ctx: TableContext, playerId: string, m: Exclude<Movable, { kind: 'piece' }>, x: unknown, z: unknown): OpResult {
  if (lockedByOther(m.item, playerId)) return fail(lockNotice(ctx, m.item, m.kind));
  if (isFiniteNumber(x) && isFiniteNumber(z)) {
    const pos = clampToTable(x, z);
    m.item.x = pos.x;
    m.item.z = pos.z;
  }
  m.item.lockedBy = '';
  m.item.order = ctx.nextOrder++;
  if (m.kind === 'marker') {
    const piece = pieceUnder(ctx, m.item.x, m.item.z);
    if (piece) { m.item.attachedTo = piece.id; m.item.ox = m.item.x - piece.x; m.item.oz = m.item.z - piece.z; }
  }
  return ok();
}

/** Cards this close together count as one stack. Scales gently with the smaller card's size. */
const SAME_SPOT = 0.06;

export function drop(ctx: TableContext, playerId: string, id: unknown, x: unknown, z: unknown, snap = true): OpResult {
  const m = movable(ctx, id);
  if (m && m.kind !== 'piece') return dropLoose(ctx, playerId, m, x, z);
  const piece = m?.item;
  if (!piece) return fail();
  if (lockedByOther(piece, playerId)) return fail(lockNotice(ctx, piece));
  if (isFiniteNumber(x) && isFiniteNumber(z)) {
    const pos = clampToTable(x, z, piece.w, piece.h);
    piece.x = pos.x;
    piece.z = pos.z;
  }
  if (snap) {
    const snapDist = Math.min(piece.w, piece.h) * 0.4;
    let best: PieceState | undefined, bestDist = snapDist;
    for (const other of ctx.state.pieces.values()) {
      if (other === piece || other.kind !== piece.kind || lockedByOther(other, playerId)) continue;
      const d = Math.hypot(other.x - piece.x, other.z - piece.z);
      if (d < bestDist) { best = other; bestDist = d; }
    }
    if (best) { piece.x = best.x; piece.z = best.z; }
  }
  piece.lockedBy = '';
  bump(ctx, piece);
  return ok();
}

type MoveItem = { id?: unknown; x?: unknown; z?: unknown };
const items = (v: unknown): MoveItem[] => (Array.isArray(v) ? v.slice(0, 80).filter(i => typeof i === 'object' && i !== null) : []);

export function grabMany(ctx: TableContext, playerId: string, ids: string[]): OpResult {
  const results = ids.map(id => grab(ctx, playerId, id));
  return results.some(r => r.ok) ? ok() : fail(results.find(r => r.notice)?.notice);
}
export function moveMany(ctx: TableContext, playerId: string, list: unknown): OpResult {
  for (const i of items(list)) move(ctx, playerId, i.id, i.x, i.z);
  return ok();
}
export function dropMany(ctx: TableContext, playerId: string, list: unknown): OpResult {
  for (const i of items(list)) drop(ctx, playerId, i.id, i.x, i.z, false);
  return ok();
}

// ---------------------------------------------------------------- stacks

/** Every piece sharing this piece's spot and kind, bottom first. */
export function stackOf(ctx: TableContext, piece: PieceState): PieceState[] {
  return [...ctx.state.pieces.values()]
    .filter(p => p.kind === piece.kind && Math.abs(p.x - piece.x) < SAME_SPOT && Math.abs(p.z - piece.z) < SAME_SPOT)
    .sort((a, b) => a.order - b.order);
}

export function stackAction(ctx: TableContext, playerId: string, id: unknown, action: unknown): OpResult {
  const piece = typeof id === 'string' ? ctx.state.pieces.get(id) : undefined;
  if (!piece) return fail();
  const stack = stackOf(ctx, piece);
  if (stack.length < 2) return fail('That is not in a stack.');
  const blocked = stack.find(c => lockedByOther(c, playerId));
  if (blocked) return fail(lockNotice(ctx, blocked));
  const orders = stack.map(c => c.order);
  const who = nameOf(ctx, playerId), n = stack.length;

  if (action === 'shuffle') {
    const mixed = [...stack];
    shuffleInPlace(ctx, mixed);
    mixed.forEach((c, i) => { c.order = orders[i]; });
    appendLog(ctx, `${who} shuffled a stack of ${n}.`);
  } else if (action === 'flip') {
    const faceUp = !stack[n - 1].faceUp;
    stack.forEach((c, i) => { c.faceUp = faceUp; c.order = orders[n - 1 - i]; });
    appendLog(ctx, `${who} flipped a stack of ${n} ${faceUp ? 'face-up' : 'face-down'}.`);
  } else if (action === 'spread') {
    const base = { x: piece.x, z: piece.z };
    const gap = Math.max(0.5, piece.w * 0.45);
    stack.forEach((c, i) => {
      const pos = clampToTable(base.x + (i - (n - 1) / 2) * gap, base.z, c.w, c.h);
      c.x = pos.x; c.z = pos.z;
    });
    appendLog(ctx, `${who} spread out a stack of ${n}.`);
  } else return fail();
  return ok();
}

// ---------------------------------------------------------------- piece state

function eachPiece(ctx: TableContext, playerId: string, ids: string[], fn: (piece: PieceState) => void): OpResult {
  let changed = 0, blocked: PieceState | undefined;
  for (const id of ids) {
    const piece = ctx.state.pieces.get(id);
    if (!piece) continue;
    if (lockedByOther(piece, playerId)) { blocked = piece; continue; }
    fn(piece);
    changed++;
  }
  if (!changed) return fail(blocked ? lockNotice(ctx, blocked) : undefined);
  return ok();
}

export function flip(ctx: TableContext, playerId: string, ids: string[]): OpResult {
  const labels: string[] = [];
  const res = eachPiece(ctx, playerId, ids, piece => { piece.faceUp = !piece.faceUp; labels.push(piece.faceUp ? labelOf(piece) : 'a card face-down'); });
  if (res.ok) appendLog(ctx, `${nameOf(ctx, playerId)} flipped ${labels.length === 1 ? labels[0] : `${labels.length} cards`}.`);
  return res;
}
export function rotate(ctx: TableContext, playerId: string, ids: string[], delta: unknown): OpResult {
  const d = delta === -90 ? -90 : 90;
  return eachPiece(ctx, playerId, ids, piece => { piece.rotation = (((piece.rotation + d) % 360) + 360) % 360; });
}
export function tap(ctx: TableContext, playerId: string, ids: string[]): OpResult {
  return eachPiece(ctx, playerId, ids, piece => { piece.tapped = !piece.tapped; });
}

export function clone(ctx: TableContext, playerId: string, id: unknown): OpResult {
  const piece = typeof id === 'string' ? ctx.state.pieces.get(id) : undefined;
  const face = piece && faceOf(piece);
  if (!piece || !face) return fail();
  const copy = createPiece(ctx, { ownerId: playerId, face, x: piece.x + Math.min(piece.w, 1) * 0.3, z: piece.z + Math.min(piece.h, 1) * 0.3, rotation: piece.rotation, faceUp: piece.faceUp });
  appendLog(ctx, `${nameOf(ctx, playerId)} cloned ${labelOf(copy)}.`);
  return ok();
}

export function remove(ctx: TableContext, playerId: string, ids: string[]): OpResult {
  let pieces = 0, other = 0;
  for (const id of ids) {
    const m = movable(ctx, id);
    if (!m || lockedByOther(m.item, playerId)) continue;
    if (m.kind === 'piece') { deletePiece(ctx, m.item); pieces++; }
    else { (m.kind === 'marker' ? ctx.state.markers : ctx.state.notes).delete(id); other++; }
  }
  if (!pieces && !other) return fail();
  if (pieces) appendLog(ctx, `${nameOf(ctx, playerId)} deleted ${pieces === 1 ? 'a piece' : `${pieces} pieces`}.`);
  return ok();
}

// ---------------------------------------------------------------- loading a kit

const KIND_ORDER: Record<PieceKind, number> = { board: 0, card: 1, piece: 2 };

/** Spawns every piece in the kit onto the table: boards centered (stacked slightly offset if more
 * than one), cards/pieces scattered in a loose grid nearby so nothing lands exactly on top of a board. */
export function loadKit(ctx: TableContext, playerId: string, kit: NormalizedKit, definitions: PieceDefinition[]): OpResult {
  const byId = new Map(definitions.map(d => [d.id, d]));
  const queue: PieceDefinition[] = [];
  for (const { pieceId, quantity } of kit.pieces) {
    const def = byId.get(pieceId);
    if (!def) continue;
    for (let i = 0; i < quantity; i++) queue.push(def);
  }
  if (!queue.length) return fail('That kit has nothing usable in it.');
  queue.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  let boardI = 0, gridI = 0;
  const cols = Math.max(1, Math.ceil(Math.sqrt(queue.length)));
  for (const def of queue) {
    const face: PieceFace = { pieceId: def.id, kind: def.kind, name: def.name, frontImage: def.frontImage, w: def.w, h: def.h };
    if (def.backImage) face.backImage = def.backImage;
    if (def.metadata) face.metadata = def.metadata;
    let x: number, z: number;
    if (def.kind === 'board') { x = boardI * 0.6; z = boardI * 0.6; boardI++; }
    else {
      const col = gridI % cols, row = Math.floor(gridI / cols);
      const step = Math.max(def.w, def.h) + 0.3;
      x = (col - (cols - 1) / 2) * step;
      z = (row - Math.ceil(queue.length / cols) / 2) * step + 14;
      gridI++;
    }
    createPiece(ctx, { ownerId: playerId, face, x, z, faceUp: true });
  }
  appendLog(ctx, `${nameOf(ctx, playerId)} loaded “${kit.name}” (${queue.length} pieces).`);
  return ok();
}

// ---------------------------------------------------------------- markers & notes

export const MARKER_KINDS = ['plus', 'minus', 'damage', 'status', 'custom'] as const;
const MARKER_DEFAULTS: Record<(typeof MARKER_KINDS)[number], { label: string; value: number }> = {
  plus: { label: '+', value: 1 },
  minus: { label: '−', value: 1 },
  damage: { label: 'DMG', value: 1 },
  status: { label: 'STATUS', value: 0 },
  custom: { label: 'MARK', value: 0 },
};
export const LIMITS = { markers: 300, notes: 150 };

export function spawnMarker(ctx: TableContext, playerId: string, msg: { kind?: unknown; label?: unknown; x?: unknown; z?: unknown }): OpResult {
  const kind = MARKER_KINDS.find(k => k === msg.kind);
  if (!kind) return fail();
  if (ctx.state.markers.size >= LIMITS.markers) return fail('That is a lot of markers — delete some first.');
  const m = new MarkerState();
  m.id = `m${ctx.nextId++}`;
  m.kind = kind;
  m.label = cleanText(msg.label, 16) || MARKER_DEFAULTS[kind].label;
  m.value = MARKER_DEFAULTS[kind].value;
  const pos = isFiniteNumber(msg.x) && isFiniteNumber(msg.z) ? clampToTable(msg.x, msg.z) : { x: 0, z: 0 };
  m.x = pos.x;
  m.z = pos.z;
  m.lockedBy = '';
  m.attachedTo = '';
  m.order = ctx.nextOrder++;
  ctx.state.markers.set(m.id, m);
  return ok();
}
export function adjustMarker(ctx: TableContext, playerId: string, id: unknown, delta: unknown): OpResult {
  const m = typeof id === 'string' ? ctx.state.markers.get(id) : undefined;
  if (!m || !isFiniteNumber(delta)) return fail();
  if (lockedByOther(m, playerId)) return fail(lockNotice(ctx, m, 'marker'));
  m.value = Math.max(-99, Math.min(999, m.value + Math.round(delta)));
  return ok();
}
export function renameMarker(ctx: TableContext, playerId: string, id: unknown, label: unknown): OpResult {
  const m = typeof id === 'string' ? ctx.state.markers.get(id) : undefined;
  const text = cleanText(label, 16);
  if (!m || !text) return fail();
  m.label = text;
  return ok();
}
export function addNote(ctx: TableContext, playerId: string, msg: { text?: unknown; x?: unknown; z?: unknown }): OpResult {
  const text = cleanText(msg.text, 280);
  if (!text) return fail();
  if (ctx.state.notes.size >= LIMITS.notes) return fail('The table is full of notes — delete some first.');
  const n = new NoteState();
  n.id = `n${ctx.nextId++}`;
  n.text = text;
  n.author = nameOf(ctx, playerId);
  const pos = isFiniteNumber(msg.x) && isFiniteNumber(msg.z) ? clampToTable(msg.x, msg.z) : { x: 0, z: 0 };
  n.x = pos.x;
  n.z = pos.z;
  n.lockedBy = '';
  n.order = ctx.nextOrder++;
  ctx.state.notes.set(n.id, n);
  appendLog(ctx, `${n.author} left a note: “${text.length > 60 ? `${text.slice(0, 57)}…` : text}”`);
  return ok();
}
export function editNote(ctx: TableContext, playerId: string, id: unknown, text: unknown): OpResult {
  const n = typeof id === 'string' ? ctx.state.notes.get(id) : undefined;
  const clean = cleanText(text, 280);
  if (!n || !clean) return fail();
  if (lockedByOther(n, playerId)) return fail(lockNotice(ctx, n, 'note'));
  n.text = clean;
  n.author = nameOf(ctx, playerId);
  appendLog(ctx, `${n.author} edited a note.`);
  return ok();
}

// ---------------------------------------------------------------- table-wide

/** Host: clears every piece, marker and note off the table (a fresh start for the same players). */
export function clearTable(ctx: TableContext, actorId: string): OpResult {
  if (actorId !== ctx.state.hostId) return fail('Only the host can clear the table.');
  ctx.state.pieces.clear();
  ctx.state.markers.clear();
  ctx.state.notes.clear();
  appendLog(ctx, `${nameOf(ctx, actorId)} cleared the table.`);
  return ok();
}
