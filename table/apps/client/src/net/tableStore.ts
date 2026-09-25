// Bridges the Colyseus room into React. The synced state object is mutated in place by the SDK,
// so components read it directly; this store only tells React *when* to look again.
import { useSyncExternalStore } from 'react';
import type { Room } from '@colyseus/sdk';
import type { ClientMessages, NormalizedKit, PieceDefinition, PieceFace } from '@kitforge/shared-types';
import type { SyncedPiece, SyncedPlayer, SyncedTable } from './stateTypes.ts';

export type ConnectionStatus = 'offline' | 'online' | 'reconnecting' | 'lost';
export interface PickedKit { label: string; kit: NormalizedKit; definitions: PieceDefinition[] }

class TableStore {
  room: Room | null = null;
  playerId = '';
  status: ConnectionStatus = 'offline';
  notices: { id: number; text: string }[] = [];
  latencyMs = 0;
  version = 0;
  /** Kit chosen before create/join, loaded as soon as we're seated. */
  pendingKit: PickedKit | null = null;

  private listeners = new Set<() => void>();
  private frame = 0;
  private noticeId = 0;

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;

  bump() {
    this.version++;
    for (const fn of this.listeners) fn();
  }
  scheduleBump() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => { this.frame = 0; this.bump(); });
  }

  ready = false;

  get state(): SyncedTable | null {
    return this.ready ? ((this.room?.state as SyncedTable | undefined) ?? null) : null;
  }

  me(): SyncedPlayer | undefined { return this.state?.players.get(this.playerId); }
  piece(id: string): SyncedPiece | undefined { return this.state?.pieces.get(id); }
  face(id: string): PieceFace | null {
    const p = this.piece(id);
    if (!p?.face) return null;
    try { return JSON.parse(p.face) as PieceFace; } catch { return null; }
  }
  isHost() { return !!this.playerId && this.state?.hostId === this.playerId; }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]) {
    this.room?.send(type as string, payload);
  }

  notify(text: string) {
    const id = ++this.noticeId;
    this.notices = [...this.notices.slice(-3), { id, text }];
    this.bump();
    setTimeout(() => { this.notices = this.notices.filter(n => n.id !== id); this.bump(); }, 4000);
  }

  reset() {
    this.room = null;
    this.ready = false;
    this.playerId = '';
    this.status = 'offline';
    this.bump();
  }
}

export const store = new TableStore();

/** Re-renders the calling component whenever the table changes. */
export function useTable() {
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}
