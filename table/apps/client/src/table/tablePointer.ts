// Converts screen coordinates to table coordinates. Registered by the Canvas, used by anything
// that needs "where on the table is the pointer" — piece drags, marker drops.
import * as THREE from 'three';
import type { Point2 } from '@kitforge/shared-types';

const raycaster = new THREE.Raycaster();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

let camera: THREE.Camera | null = null;
let canvas: HTMLElement | null = null;

export function registerProjector(cam: THREE.Camera, el: HTMLElement) { camera = cam; canvas = el; }

export function screenToTable(clientX: number, clientY: number): Point2 | null {
  if (!camera || !canvas) return null;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(plane, hit) ? { x: hit.x, z: hit.z } : null;
}
