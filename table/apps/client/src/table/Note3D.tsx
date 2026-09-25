// A sticky note lying flat on the table (pieces can cover it). Drag to move, double-click to
// edit, right-click for the menu.
import { memo, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { seatAngle } from '@kitforge/shared-types';
import { store } from '../net/tableStore.ts';
import { beginDrag, localDrag } from './dragging.ts';
import { ui } from './selection.ts';
import { noteMaterial } from './tokenTextures.ts';

const W = 1.6, D = 1.12;
const geometry = new THREE.PlaneGeometry(W, D);
const outline = new THREE.PlaneGeometry(W + 0.1, D + 0.1);

export function editNotePrompt(id: string) {
  const note = store.state?.notes.get(id);
  if (!note) return;
  const text = prompt('Edit note:', note.text);
  if (text != null && text.trim()) store.send('editNote', { id, text });
}

export const Note3D = memo(function Note3D(p: { id: string; text: string; author: string; lockColor: string | null }) {
  const group = useRef<THREE.Group>(null);
  const material = useMemo(() => noteMaterial(p.text, p.author), [p.text, p.author]);

  useFrame((_, dt) => {
    const g = group.current;
    const n = store.state?.notes.get(p.id);
    const pos = localDrag.get(p.id) ?? n;
    if (!g || !pos) return;
    const y = localDrag.has(p.id) ? 0.3 : 0.0025;
    if (g.position.lengthSq() === 0) g.position.set(pos.x, y, pos.z);
    const k = 1 - Math.exp(-dt * 18);
    g.position.x += (pos.x - g.position.x) * k;
    g.position.z += (pos.z - g.position.z) * k;
    g.position.y += (y - g.position.y) * k;
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || ui.spaceHeld) return;
    e.stopPropagation();
    ui.openMenu(null);
    const n = store.state?.notes.get(p.id);
    if (!n) return;
    if (n.lockedBy && n.lockedBy !== store.playerId) { store.notify(`${store.state?.players.get(n.lockedBy)?.name ?? 'Someone'} is moving that note.`); return; }
    beginDrag(e, [{ id: p.id, x: n.x, z: n.z }]);
  };

  const yaw = THREE.MathUtils.degToRad(seatAngle(store.me()?.seat ?? 0));

  return (
    <group ref={group} rotation-y={yaw}>
      <mesh
        geometry={geometry}
        material={material}
        rotation-x={-Math.PI / 2}
        receiveShadow
        onPointerDown={onPointerDown}
        onDoubleClick={e => { e.stopPropagation(); editNotePrompt(p.id); }}
        onPointerOver={e => { e.stopPropagation(); document.body.style.cursor = 'grab'; }}
        onPointerOut={() => { document.body.style.cursor = ''; }}
        onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); ui.openMenu({ x: e.clientX, y: e.clientY, id: p.id, source: 'note' }); }}
      />
      {p.lockColor && (
        <mesh geometry={outline} rotation-x={-Math.PI / 2} position-y={-0.001}>
          <meshBasicMaterial color={p.lockColor} />
        </mesh>
      )}
    </group>
  );
});
