// Reads a Kit Forge "Send to Table" export (.kittable.json): every card/piece/board already
// rasterized to a PNG data: URL by Kit Forge itself, plus its physical size in inches. This is
// the only format the table needs to understand — Kit Forge is the only thing that produces it.
import type { NormalizedKit, PieceDefinition, PieceKind } from '@kitforge/shared-types';
import { KitParseError, type ParsedKitFile } from './types.ts';

const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const KINDS: PieceKind[] = ['card', 'piece', 'board'];

function str(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}
function num(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function readPiece(raw: unknown): { def: PieceDefinition; count: number } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 64);
  const kind = KINDS.includes(r.kind as PieceKind) ? (r.kind as PieceKind) : null;
  const image = typeof r.frontImage === 'string' && DATA_IMAGE.test(r.frontImage) ? r.frontImage : '';
  if (!id || !kind || !image) return null;
  const def: PieceDefinition = {
    id, kind, frontImage: image,
    name: str(r.name, 60) || 'Untitled',
    w: num(r.w, 0.25, 60, 1),
    h: num(r.h, 0.25, 60, 1),
  };
  const backImage = typeof r.backImage === 'string' && DATA_IMAGE.test(r.backImage) ? r.backImage : '';
  if (backImage) def.backImage = backImage;
  return { def, count: Math.round(num(r.count, 1, 200, 1)) };
}

/** Parses a `.kittable.json` file's already-decoded JSON content. */
export function parseKitFile(input: unknown, fileName = 'kit'): ParsedKitFile {
  if (typeof input !== 'object' || input === null) throw new KitParseError('That file is not a Kit Forge table export.');
  const raw = input as Record<string, unknown>;
  if (raw.format !== 'kit-table') throw new KitParseError('That file is not a Kit Forge table export (drag its .kittable.json here, or export one from Kit Forge’s "Send to Table" button).');
  const list = Array.isArray(raw.pieces) ? raw.pieces.slice(0, 2000) : [];
  const read = list.map(readPiece).filter((p): p is NonNullable<typeof p> => !!p);
  if (!read.length) throw new KitParseError('That kit has no usable cards, pieces or boards in it.');
  const definitions = read.map(p => p.def);
  const kit: NormalizedKit = {
    name: str(raw.kitTitle, 80) || fileName,
    pieces: read.map(p => ({ pieceId: p.def.id, quantity: p.count })),
  };
  return { source: 'kit-table', kit, definitions };
}

export { KitParseError };
export type { ParsedKitFile };
