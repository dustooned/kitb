// Every room message, by name. The server validates structure only — never game legality.
import type { NormalizedKit, PieceDefinition } from './pieces.ts';

export interface ClientMessages {
  grab: { id: string };
  move: { id: string; x: number; z: number };
  drop: { id: string; x: number; z: number; snap?: boolean };
  grabMany: { ids: string[] };
  moveMany: { items: { id: string; x: number; z: number }[] };
  dropMany: { items: { id: string; x: number; z: number }[] };
  stackAction: { id: string; action: StackAction };
  flip: { ids: string[] };
  rotate: { ids: string[]; delta: 90 | -90 };
  tap: { ids: string[] };
  clone: { id: string };
  remove: { ids: string[] };
  /** Spawns every piece in the kit onto the table (scattered, boards centered). Replaces nothing —
   * loading twice just adds more pieces, so a host can bring in several kits at once if they want. */
  loadKit: { kit: NormalizedKit; definitions: PieceDefinition[] };
  spawnMarker: { kind: MarkerKind; label?: string; x?: number; z?: number };
  adjustMarker: { id: string; delta: number };
  renameMarker: { id: string; label: string };
  addNote: { text: string; x?: number; z?: number };
  editNote: { id: string; text: string };
  resetTable: Record<string, never>;
  kick: { playerId: string };
  ping: { t: number };
}

export interface ServerMessages {
  welcome: { playerId: string; roomCode: string };
  notice: { text: string };
  pong: { t: number };
  kicked: { text: string };
}

export type StackAction = 'shuffle' | 'flip' | 'spread';
export type MarkerKind = 'plus' | 'minus' | 'damage' | 'status' | 'custom';

/** Options sent with create/join. */
export interface JoinOptions {
  token: string;
  name: string;
  /** Lets a player take back their own disconnected seat after a refresh. */
  reclaimPlayerId?: string;
}

/** HTTP API shapes. */
export interface AuthResponse { token: string; expiresAt: number }
export interface UploadResponse { assetUrl: string }
