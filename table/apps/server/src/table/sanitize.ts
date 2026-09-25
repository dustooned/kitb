// Structural validation for anything a client sends. This checks shape and size only —
// it never asks whether a move is legal in whatever game the pieces belong to.
import type { NormalizedKit, PieceDefinition, PieceFace, PieceKind } from '@kitforge/shared-types';

const CONTROL = /[\u0000-\u001f\u007f<>]/g;
const KINDS: PieceKind[] = ['card', 'piece', 'board'];

export function cleanText(v: unknown, max: number): string {
  return typeof v === 'string' ? v.replace(CONTROL, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

export function cleanName(v: unknown, fallback: string): string {
  return cleanText(v, 24) || fallback;
}

export const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function cleanIds(v: unknown, max = 80): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.length <= 40).slice(0, max);
}

/** Only images this server hosts may be used as piece faces (no arbitrary external URLs). */
const SAFE_IMAGE = /^\/assets\/[\w-]{1,100}\.(png|jpe?g|webp)$/i;
export function cleanImageUrl(v: unknown): string {
  return typeof v === 'string' && SAFE_IMAGE.test(v) && !v.includes('..') ? v : '';
}

export function cleanMetadata(v: unknown): Record<string, unknown> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return undefined;
  try {
    const json = JSON.stringify(v);
    return json.length <= 4000 ? (JSON.parse(json) as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

const size = (v: unknown, fallback: number) => (isFiniteNumber(v) ? Math.min(60, Math.max(0.1, v)) : fallback);

export function sanitizeDefinition(raw: unknown): PieceDefinition | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === 'string' ? r.id.trim() : '';
  if (!/^[\w.-]{1,64}$/.test(id)) return null;
  const kind = KINDS.includes(r.kind as PieceKind) ? (r.kind as PieceKind) : null;
  if (!kind) return null;
  const def: PieceDefinition = { id, kind, name: cleanText(r.name, 60) || id, frontImage: cleanImageUrl(r.frontImage), w: size(r.w, 1), h: size(r.h, 1) };
  const backImage = cleanImageUrl(r.backImage);
  if (backImage) def.backImage = backImage;
  const metadata = cleanMetadata(r.metadata);
  if (metadata) def.metadata = metadata;
  return def;
}

/** A piece's identity as carried in synced state (validated like any input that round-trips). */
export function sanitizeFace(raw: unknown): PieceFace | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const pieceId = typeof r.pieceId === 'string' ? r.pieceId.trim() : '';
  if (!/^[\w.-]{1,80}$/.test(pieceId)) return null;
  const kind = KINDS.includes(r.kind as PieceKind) ? (r.kind as PieceKind) : null;
  if (!kind) return null;
  const face: PieceFace = { pieceId, kind, name: cleanText(r.name, 60) || pieceId, frontImage: cleanImageUrl(r.frontImage), w: size(r.w, 1), h: size(r.h, 1) };
  const backImage = cleanImageUrl(r.backImage);
  if (backImage) face.backImage = backImage;
  const metadata = cleanMetadata(r.metadata);
  if (metadata) face.metadata = metadata;
  return face;
}

export const KIT_LIMITS = { entries: 400, copiesPerPiece: 200, totalPieces: 600, definitions: 400 };

export function sanitizeKit(raw: unknown): NormalizedKit | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.pieces) || r.pieces.length > KIT_LIMITS.entries) return null;
  const pieces: NormalizedKit['pieces'] = [];
  let total = 0;
  for (const e of r.pieces) {
    if (typeof e !== 'object' || e === null) return null;
    const { pieceId, quantity } = e as Record<string, unknown>;
    if (typeof pieceId !== 'string' || !/^[\w.-]{1,64}$/.test(pieceId)) return null;
    const q = Number(quantity);
    if (!Number.isInteger(q) || q < 1 || q > KIT_LIMITS.copiesPerPiece) return null;
    total += q;
    pieces.push({ pieceId, quantity: q });
  }
  if (total > KIT_LIMITS.totalPieces) return null;
  return { name: cleanText(r.name, 60) || 'Kit', pieces };
}
