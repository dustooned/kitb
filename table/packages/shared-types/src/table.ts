// Table geometry and limits shared by client (rendering) and server (validation/placement).
// 1 world unit = 1 inch, so a piece's synced w/h match its Kit Forge size directly.

export const MAX_PLAYERS = 8;
export const ROOM_NAME = 'kit_table';

export const TABLE_W = 60; // inches — room for a 24x24" board plus scattered pieces around it
export const TABLE_D = 44;
export const TABLE_HALF_W = TABLE_W / 2;
export const TABLE_HALF_D = TABLE_D / 2;
export const PIECE_THICKNESS = 0.08;

export const SEAT_COLORS = ['#e0533d', '#3d8ee0', '#3dbf6b', '#e0b23d', '#8e5de0', '#e05dbb', '#4fd1c5', '#f97362'] as const;

/** Seats are just a facing direction, evenly spaced — there's no per-seat deck/discard/hand
 * here (see PieceKind), so a seat only matters for the camera's "home" view and player color. */
export function seatAngle(seat: number): number {
  return (360 / MAX_PLAYERS) * seat;
}

export interface Point2 { x: number; z: number }

/** Keeps a piece's center within the table surface, accounting for its own footprint and
 * (roughly) its rotation — a conservative half-diagonal keeps rotated pieces on the felt too. */
export function clampToTable(x: number, z: number, w = 1, h = 1): Point2 {
  const half = Math.hypot(w, h) / 2;
  const mx = Math.max(0, TABLE_HALF_W - half), mz = Math.max(0, TABLE_HALF_D - half);
  return { x: Math.min(mx, Math.max(-mx, x)), z: Math.min(mz, Math.max(-mz, z)) };
}
