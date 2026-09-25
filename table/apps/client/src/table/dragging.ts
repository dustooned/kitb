// Dragging things on the table (one piece, a multi-selection, markers, notes).
// While *I* drag, positions live here and the 3D objects read them every frame; everyone
// else sees the throttled server updates, smoothed.
import { clampToTable, type Point2 } from '@kitforge/shared-types';
import { store } from '../net/tableStore.ts';
import { screenToTable } from './tablePointer.ts';

export const localDrag = new Map<string, Point2>();

const SEND_EVERY_MS = 50;
const CLICK_SLOP_PX = 4;

export interface DragItem { id: string; x: number; z: number; w?: number; h?: number }

export function beginDrag(start: { clientX: number; clientY: number }, list: DragItem[]) {
  const at = screenToTable(start.clientX, start.clientY);
  if (!at || !list.length) return;
  const offsets = list.map(i => ({ id: i.id, dx: i.x - at.x, dz: i.z - at.z, w: i.w, h: i.h }));
  const many = list.length > 1;
  for (const i of list) localDrag.set(i.id, { x: i.x, z: i.z });
  if (many) store.send('grabMany', { ids: list.map(i => i.id) });
  else store.send('grab', { id: list[0].id });

  let moved = false, lastSend = 0;
  const current = () => offsets.map(o => ({ id: o.id, ...localDrag.get(o.id)! }));

  const onMove = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - start.clientX, ev.clientY - start.clientY) < CLICK_SLOP_PX) return;
    const p = screenToTable(ev.clientX, ev.clientY);
    if (!p) return;
    moved = true;
    for (const o of offsets) localDrag.set(o.id, clampToTable(p.x + o.dx, p.z + o.dz, o.w, o.h));
    const now = performance.now();
    if (now - lastSend < SEND_EVERY_MS) return;
    lastSend = now;
    if (many) store.send('moveMany', { items: current() });
    else store.send('move', current()[0]);
  };

  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onCancel);
    const final = current();
    for (const o of offsets) localDrag.delete(o.id);
    if (many) store.send('dropMany', { items: final });
    else store.send('drop', { ...final[0], snap: moved });
  };

  // Alt-Tab, a system dialog or a lost touch mid-drag: put things down where they are, so
  // nobody is left looking at "Dustin is moving that" forever.
  const onCancel = () => onUp();

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onCancel);
}
