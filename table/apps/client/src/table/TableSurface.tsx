// The table itself: a felt play surface in a raised frame, painted in code (no image to ship).
// One fixed look for v1 — see ROADMAP.md for table themes / custom images as a later pass.
import { useMemo } from 'react';
import * as THREE from 'three';
import { TABLE_D, TABLE_W } from '@kitforge/shared-types';

const RIM = 0.4, RIM_TOP = 0.06, RIM_DEPTH = 0.45;
const FELT = '#1f6b4f', RIM_COLOR = '#3a2c1e', EDGE_GLOW = '#e0533d';

function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function feltTexture() {
  const w = 1024, h = Math.round((w * TABLE_D) / TABLE_W);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.fillStyle = FELT; g.fillRect(0, 0, w, h);
  const rand = mulberry32(7);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rand() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const grad = g.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, w * 0.62);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.28)');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Frame() {
  const hw = TABLE_W / 2, hd = TABLE_D / 2, hgt = RIM_TOP + RIM_DEPTH, y = RIM_TOP - hgt / 2;
  const bars: [number, number, number, number][] = [
    [0, -hd - RIM / 2, TABLE_W + RIM * 2, RIM], [0, hd + RIM / 2, TABLE_W + RIM * 2, RIM],
    [-hw - RIM / 2, 0, RIM, TABLE_D], [hw + RIM / 2, 0, RIM, TABLE_D],
  ];
  const strip = 0.045;
  const strips: [number, number, number, number][] = [
    [0, -hd - strip / 2, TABLE_W + strip * 2, strip], [0, hd + strip / 2, TABLE_W + strip * 2, strip],
    [-hw - strip / 2, 0, strip, TABLE_D], [hw + strip / 2, 0, strip, TABLE_D],
  ];
  return (
    <group>
      {bars.map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, y, z]} castShadow receiveShadow>
          <boxGeometry args={[w, hgt, d]} />
          <meshStandardMaterial color={RIM_COLOR} roughness={0.65} metalness={0.15} />
        </mesh>
      ))}
      {strips.map(([x, z, w, d], i) => (
        <mesh key={`s${i}`} position={[x, RIM_TOP + 0.003, z]}>
          <boxGeometry args={[w, 0.006, d]} />
          <meshBasicMaterial color={EDGE_GLOW} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}

export function TableSurface() {
  const surface = useMemo(feltTexture, []);
  return (
    <group>
      <Frame />
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[TABLE_W, TABLE_D]} />
        <meshStandardMaterial map={surface} roughness={0.95} />
      </mesh>
    </group>
  );
}
