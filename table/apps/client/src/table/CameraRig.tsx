// Controlled tabletop camera: always looking down at the table from your own seat.
// Wheel = zoom, middle-drag or Space+drag = pan, Home = reset. No free flying.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seatAngle } from '@kitforge/shared-types';
import { ui } from './selection.ts';
import { registerProjector } from './tablePointer.ts';

const PITCH = THREE.MathUtils.degToRad(58);
const DEFAULT_DIST = 26;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const home = () => ({ tx: 0, tz: 0, dist: DEFAULT_DIST });

export function CameraRig({ seat }: { seat: number }) {
  const { camera, gl } = useThree();
  const yaw = THREE.MathUtils.degToRad(seatAngle(seat));
  const view = useRef(home());
  const offset = useRef(new THREE.Vector3());

  useEffect(() => { view.current = home(); }, [seat]);
  useEffect(() => registerProjector(camera, gl.domElement), [camera, gl]);

  useEffect(() => {
    const el = gl.domElement;
    let pan: { x: number; y: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.dist = THREE.MathUtils.clamp(view.current.dist * Math.exp(e.deltaY * 0.0012), 6, 55);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 1 || (e.button === 0 && ui.spaceHeld)) { e.preventDefault(); pan = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); }
    };
    const onMove = (e: PointerEvent) => {
      if (!pan) return;
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      pan = { x: e.clientX, y: e.clientY };
      const k = view.current.dist * 0.0016;
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) }, up = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      view.current.tx = THREE.MathUtils.clamp(view.current.tx - (right.x * dx - up.x * dy) * k, -20, 20);
      view.current.tz = THREE.MathUtils.clamp(view.current.tz - (right.z * dx - up.z * dy) * k, -16, 16);
    };
    const onUp = (e: PointerEvent) => { if (pan) { pan = null; el.releasePointerCapture?.(e.pointerId); } };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Home' && !(e.target as HTMLElement)?.closest?.('input, textarea')) view.current = home();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl, yaw]);

  useFrame(() => {
    const v = view.current;
    offset.current.set(0, Math.sin(PITCH) * v.dist, Math.cos(PITCH) * v.dist).applyAxisAngle(Y_AXIS, yaw);
    camera.position.set(v.tx + offset.current.x, offset.current.y, v.tz + offset.current.z);
    camera.lookAt(v.tx, 0, v.tz);
  });
  return null;
}
