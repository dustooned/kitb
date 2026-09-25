// Stacks are implicit: pieces of the same kind on the same spot. Mirrors stackOf() on the server.
import type { SyncedPiece, SyncedTable } from '../net/stateTypes.ts';

const SAME_SPOT = 0.06;

export function stackMembers(state: SyncedTable, piece: SyncedPiece): SyncedPiece[] {
  return [...state.pieces.values()]
    .filter(c => c.kind === piece.kind && Math.abs(c.x - piece.x) < SAME_SPOT && Math.abs(c.z - piece.z) < SAME_SPOT)
    .sort((a, b) => a.order - b.order);
}
