// The shared 3D table: surface and every piece, marker and note.
import { Canvas } from '@react-three/fiber';
import { SEAT_COLORS } from '@kitforge/shared-types';
import { useTable } from '../net/tableStore.ts';
import { CameraRig } from './CameraRig.tsx';
import { Marker3D } from './Marker3D.tsx';
import { Note3D } from './Note3D.tsx';
import { Piece3D, pieceBaseY } from './Piece3D.tsx';
import { ui, useUi } from './selection.ts';
import { TableSurface } from './TableSurface.tsx';

export function Tabletop() {
  const t = useTable();
  const u = useUi();
  const state = t.state;
  if (!state) return null;
  const me = t.me();
  const players = [...state.players.values()];
  const seatColor = new Map(players.map(p => [p.id, SEAT_COLORS[p.seat % SEAT_COLORS.length] ?? '#ccc']));
  const pieces = [...state.pieces.values()].sort((a, b) => a.order - b.order);
  const rankOf = new Map(pieces.map((c, rank) => [c.id, rank]));
  const lockColor = (lockedBy: string) => (lockedBy && lockedBy !== t.playerId ? seatColor.get(lockedBy) ?? '#fff' : null);

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ fov: 42, near: 0.1, far: 260 }}
      onPointerMissed={e => { if (e.button === 0) ui.clear(); }}
      onContextMenu={e => e.preventDefault()}
      scene={{ background: null }}
    >
      <color attach="background" args={['#0e0e16']} />
      <CameraRig seat={me?.seat ?? 0} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[6, 18, 8]} intensity={1.6} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20} shadow-camera-right={20} shadow-camera-top={15} shadow-camera-bottom={-15} />
      <TableSurface />
      {pieces.map((c, rank) => (
        <Piece3D
          key={c.id}
          id={c.id}
          kind={c.kind}
          face={c.face}
          w={c.w}
          h={c.h}
          faceUp={c.faceUp}
          rotation={c.rotation}
          tapped={c.tapped}
          backImage={c.backImage}
          rank={rank}
          selected={u.selected.has(c.id)}
          hovered={u.hovered === c.id}
          lockColor={lockColor(c.lockedBy)}
        />
      ))}
      {[...state.notes.values()].map(n => (
        <Note3D key={n.id} id={n.id} text={n.text} author={n.author} lockColor={lockColor(n.lockedBy)} />
      ))}
      {[...state.markers.values()].map(m => {
        const rank = m.attachedTo ? rankOf.get(m.attachedTo) : undefined;
        return <Marker3D key={m.id} id={m.id} kind={m.kind} label={m.label} value={m.value} pieceY={rank === undefined ? 0 : pieceBaseY(rank)} lockColor={lockColor(m.lockedBy)} />;
      })}
    </Canvas>
  );
}
