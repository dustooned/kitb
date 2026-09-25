// Client-side view of the synced schema (the SDK rebuilds it by reflection; these just type it).

export interface SyncedPiece {
  id: string;
  ownerId: string;
  x: number;
  z: number;
  w: number;
  h: number;
  rotation: number;
  faceUp: boolean;
  tapped: boolean;
  order: number;
  lockedBy: string;
  face: string;
  backImage: string;
  kind: 'card' | 'piece' | 'board';
}

export interface SyncedMap<T> {
  get(key: string): T | undefined;
  has(key: string): boolean;
  values(): IterableIterator<T>;
  keys(): IterableIterator<string>;
  forEach(cb: (value: T, key: string) => void): void;
  readonly size: number;
}

export interface SyncedPlayer {
  id: string;
  name: string;
  seat: number;
  connected: boolean;
}

export interface SyncedMarker {
  id: string;
  kind: 'plus' | 'minus' | 'damage' | 'status' | 'custom';
  label: string;
  value: number;
  x: number;
  z: number;
  lockedBy: string;
  attachedTo: string;
  ox: number;
  oz: number;
  order: number;
}

export interface SyncedNote {
  id: string;
  text: string;
  author: string;
  x: number;
  z: number;
  lockedBy: string;
  order: number;
}

export interface SyncedTable {
  roomCode: string;
  hostId: string;
  pieces: SyncedMap<SyncedPiece>;
  players: SyncedMap<SyncedPlayer>;
  log: { length: number; at(i: number): string | undefined; [Symbol.iterator](): Iterator<string> };
  markers: SyncedMap<SyncedMarker>;
  notes: SyncedMap<SyncedNote>;
}
