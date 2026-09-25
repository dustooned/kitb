// Canvas textures for markers and notes, cached by their visible content.
import * as THREE from 'three';
import type { SyncedMarker } from '../net/stateTypes.ts';

export const MARKER_COLORS: Record<SyncedMarker['kind'], string> = {
  plus: '#43c07a',
  minus: '#e25555',
  damage: '#ff8c42',
  status: '#9b7bff',
  custom: '#ffd24a',
};

export function markerText(m: Pick<SyncedMarker, 'kind' | 'label' | 'value'>) {
  switch (m.kind) {
    case 'plus': return `+${m.value}`;
    case 'minus': return `−${m.value}`;
    case 'damage': return `${m.value}`;
    default: return m.value ? `${m.label} ${m.value}` : m.label;
  }
}

const cache = new Map<string, THREE.Texture>();
const materials = new Map<string, THREE.MeshStandardMaterial>();

function materialFor(key: string, make: () => THREE.Texture, roughness: number) {
  let m = materials.get(key);
  if (!m) { m = new THREE.MeshStandardMaterial({ map: make(), roughness }); materials.set(key, m); }
  return m;
}
export const markerMaterial = (m: Pick<SyncedMarker, 'kind' | 'label' | 'value'>) => materialFor(`m|${m.kind}|${markerText(m)}`, () => markerTexture(m), 0.55);
export const noteMaterial = (text: string, author: string) => materialFor(`n|${author}|${text}`, () => noteTexture(text, author), 0.9);

function finish(key: string, canvas: HTMLCanvasElement) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (cache.size > 400) cache.clear();
  cache.set(key, tex);
  return tex;
}

export function markerTexture(m: Pick<SyncedMarker, 'kind' | 'label' | 'value'>) {
  const text = markerText(m), key = `m|${m.kind}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = MARKER_COLORS[m.kind];
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6; g.stroke();
  g.fillStyle = '#10121a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (m.kind === 'damage') {
    g.font = 'bold 54px system-ui, sans-serif'; g.fillText(text, 64, 56);
    g.font = 'bold 20px system-ui, sans-serif'; g.fillText('DMG', 64, 96);
  } else {
    const size = text.length <= 3 ? 56 : text.length <= 6 ? 32 : 22;
    g.font = `bold ${size}px system-ui, sans-serif`;
    g.fillText(text.slice(0, 12), 64, 66);
  }
  return finish(key, c);
}

function wrap(g: CanvasRenderingContext2D, text: string, width: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (g.measureText(next).width > width && line) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export function noteTexture(text: string, author: string) {
  const key = `n|${author}|${text}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = 400; c.height = 280;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffe98a'; g.fillRect(0, 0, 400, 280);
  g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0, 0, 400, 26);
  g.fillStyle = '#2b2410';
  g.font = '22px system-ui, sans-serif';
  const lines = wrap(g, text, 360);
  lines.slice(0, 8).forEach((l, i) => g.fillText(i === 7 && lines.length > 8 ? `${l}…` : l, 20, 58 + i * 27));
  g.font = 'bold 16px system-ui, sans-serif'; g.fillStyle = '#6b5a1e';
  g.fillText(`— ${author}`, 20, 266);
  return finish(key, c);
}
