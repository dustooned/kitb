// A "piece" is anything on the table: a Kit Forge card, token/piece, or board. Nothing here is a
// game rule — `metadata` is display-only, never enforced.

export type PieceKind = 'card' | 'piece' | 'board';

/** What a piece IS — shared by every copy of it, produced by the kit-adapter from a Kit Forge export. */
export interface PieceDefinition {
  id: string;
  name: string;
  kind: PieceKind;
  /** Server-relative URL (/assets/...) or a data: URL before upload. Empty = generated placeholder. */
  frontImage: string;
  backImage?: string;
  /** Physical size in inches — matches the table's 1-unit-per-inch scale directly. */
  w: number;
  h: number;
  metadata?: Record<string, unknown>;
}

/** Which pieces make up a kit. Produced by the kit-adapter from a Kit Forge `.kittable.json` export. */
export interface NormalizedKit {
  id?: string;
  name: string;
  pieces: { pieceId: string; quantity: number }[];
}

/** The identity of one physical piece on the table, as the server knows it (hidden from clients
 * only while a card is face-down — pieces/boards have no "hidden" state, they're always visible). */
export interface PieceFace {
  pieceId: string;
  name: string;
  kind: PieceKind;
  frontImage: string;
  backImage?: string;
  w: number;
  h: number;
  metadata?: Record<string, unknown>;
}
