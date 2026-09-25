// One physical piece on the table (card, token/piece, or board): a thin box, front on top, back
// underneath. Position comes live from synced state every frame (smoothed), except while *you*
// are dragging it.
import { memo, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { PIECE_THICKNESS, type PieceKind } from '@kitforge/shared-types';
import { store } from '../net/tableStore.ts';
import { beginDrag, localDrag } from './dragging.ts';
import { ui } from './selection.ts';
import { backMaterial, boardEdgeMaterial, edgeMaterial, frontMaterial } from './textures.ts';

const DEG = Math.PI / 180;
const geometries = new Map<string, THREE.BoxGeometry>();
const outlineGeometries = new Map<string, THREE.PlaneGeometry>();
function geometryFor(w: number, h: number, thickness: number) {
  const key = `${w}x${h}x${thickness}`;
  let g = geometries.get(key);
  if (!g) { g = new THREE.BoxGeometry(w, thickness, h); geometries.set(key, g); }
  return g;
}
function outlineFor(w: number, h: number) {
  const key = `${w}x${h}`;
  let g = outlineGeometries.get(key);
  if (!g) { g = new THREE.PlaneGeometry(w + 0.1, h + 0.1); outlineGeometries.set(key, g); }
  return g;
}

export interface Piece3DProps {
  id: string;
  kind: PieceKind;
  face: string;
  w: number;
  h: number;
  faceUp: boolean;
  rotation: number;
  tapped: boolean;
  backImage: string;
  /** Position in the stacking order among table pieces (0 = bottom). */
  rank: number;
  selected: boolean;
  hovered: boolean;
  /** Seat color of another player currently holding this piece. */
  lockColor: string | null;
}

const angleTo = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/** Resting height of a piece by its rank in the stacking order (markers riding on it sit above). */
export const pieceBaseY = (rank: number) => PIECE_THICKNESS / 2 + 0.004 + rank * 0.0035;
export const DRAG_LIFT = 0.4;

export const Piece3D = memo(function Piece3D(p: Piece3DProps) {
  const group = useRef<THREE.Group>(null);
  const flipper = useRef<THREE.Group>(null);
  const thickness = p.kind === 'board' ? Math.max(PIECE_THICKNESS, Math.min(p.w, p.h) * 0.01) : PIECE_THICKNESS;

  const materials = useMemo(() => {
    const face = (() => { try { return p.face ? JSON.parse(p.face) : null; } catch { return null; } })();
    const edge = p.kind === 'board' ? boardEdgeMaterial : edgeMaterial;
    // BoxGeometry material order: +x, -x, +y (top = front), -y (bottom = back), +z, -z.
    return [edge, edge, frontMaterial(face), backMaterial(p.backImage), edge, edge];
  }, [p.face, p.backImage, p.kind]);

  const baseY = pieceBaseY(p.rank);
  const yaw = (p.rotation - (p.tapped ? 90 : 0)) * DEG;

  useLayoutEffect(() => {
    const piece = store.piece(p.id);
    if (piece && group.current && flipper.current) {
      group.current.position.set(piece.x, baseY, piece.z);
      group.current.rotation.y = yaw;
      flipper.current.rotation.x = p.faceUp ? 0 : Math.PI;
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame((_, dt) => {
    const g = group.current, f = flipper.current;
    const dragging = localDrag.get(p.id);
    const target = dragging ?? store.piece(p.id);
    if (!g || !f || !target) return;
    const k = 1 - Math.exp(-dt * 18);
    g.position.x += (target.x - g.position.x) * k;
    g.position.z += (target.z - g.position.z) * k;
    const flipping = Math.abs(Math.sin(f.rotation.x));
    const lift = dragging ? DRAG_LIFT : p.hovered ? 0.05 : 0;
    g.position.y += (baseY + lift + flipping * 0.45 - g.position.y) * k;
    g.rotation.y += angleTo(g.rotation.y, yaw) * k;
    f.rotation.x += ((p.faceUp ? 0 : Math.PI) - f.rotation.x) * (1 - Math.exp(-dt * 10));
  });

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || ui.spaceHeld) return;
    e.stopPropagation();
    ui.openMenu(null);
    if (e.shiftKey) { ui.toggle(p.id); return; }
    if (!ui.selected.has(p.id)) ui.select([p.id]);
    const piece = store.piece(p.id);
    if (!piece) return;
    if (piece.lockedBy && piece.lockedBy !== store.playerId) {
      store.notify(`${store.state?.players.get(piece.lockedBy)?.name ?? 'Someone'} is moving that.`);
      return;
    }
    const group = ui.selected.size > 1
      ? [...ui.selected].map(id => store.piece(id)).filter((c): c is NonNullable<typeof c> => !!c && (!c.lockedBy || c.lockedBy === store.playerId))
      : [piece];
    beginDrag(e, group.map(c => ({ id: c.id, x: c.x, z: c.z, w: c.w, h: c.h })));
  };

  const outlineColor = p.selected ? '#ffd24a' : p.lockColor;

  return (
    <group ref={group}>
      <group ref={flipper}>
        <mesh
          geometry={geometryFor(p.w, p.h, thickness)}
          material={materials}
          castShadow
          receiveShadow
          onPointerDown={onPointerDown}
          onPointerOver={e => { e.stopPropagation(); ui.hover(p.id); document.body.style.cursor = 'grab'; }}
          onPointerOut={() => { if (ui.hovered === p.id) ui.hover(null); document.body.style.cursor = ''; }}
          onContextMenu={e => { e.stopPropagation(); e.nativeEvent.preventDefault(); ui.select(ui.selected.has(p.id) ? [...ui.selected] : [p.id]); ui.openMenu({ x: e.clientX, y: e.clientY, id: p.id, source: 'table' }); }}
        />
      </group>
      {outlineColor && (
        <mesh geometry={outlineFor(p.w, p.h)} rotation-x={-Math.PI / 2} position-y={-thickness / 2 - 0.002}>
          <meshBasicMaterial color={outlineColor} transparent opacity={0.9} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
});
