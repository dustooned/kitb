// Piece actions shared by keyboard shortcuts, the context menu and toolbars.
import type { MarkerKind, NormalizedKit, PieceDefinition, StackAction } from '@kitforge/shared-types';
import { store } from '../net/tableStore.ts';

export const actions = {
  flip: (ids: string[]) => ids.length && store.send('flip', { ids }),
  /** Left = counter-clockwise as seen from your seat. */
  rotateLeft: (ids: string[]) => ids.length && store.send('rotate', { ids, delta: 90 }),
  rotateRight: (ids: string[]) => ids.length && store.send('rotate', { ids, delta: -90 }),
  tap: (ids: string[]) => ids.length && store.send('tap', { ids }),
  clone: (id: string) => store.send('clone', { id }),
  remove: (ids: string[]) => ids.length && store.send('remove', { ids }),
  loadKit: (kit: NormalizedKit, definitions: PieceDefinition[]) => store.send('loadKit', { kit, definitions }),
  stack: (id: string, action: StackAction) => store.send('stackAction', { id, action }),
  spawnMarker: (kind: MarkerKind, label?: string) => store.send('spawnMarker', { kind, label }),
  adjustMarker: (id: string, delta: number) => store.send('adjustMarker', { id, delta }),
  addNote: (text: string) => store.send('addNote', { text }),
};
