// Tabletop camera, TTS-style: right-drag orbits around the table, wheel zooms, middle-drag or
// Space+drag pans, Home resets. Starts looking from your own seat. The on-screen camera buttons
// (hud/CameraPanel) drive the same view through `cameraControls`, so touch devices can orbit too.
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { seatAngle } from '@kitforge/shared-types';
import { ui } from './selection.ts';
import { registerProjector } from './tablePointer.ts';

const DEG = Math.PI / 180;
const DEFAULT_PITCH = 58, MIN_PITCH = 18, MAX_PITCH = 89;
const DEFAULT_DIST = 26, MIN_DIST = 6, MAX_DIST = 60;
const ORBIT_SLOP_PX = 4;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

interface View { tx: number; tz: number; dist: number; yaw: number; pitch: number }
const home = (): View => ({ tx: 0, tz: 0, dist: DEFAULT_DIST, yaw: 0, pitch: DEFAULT_PITCH });

/** Target view the rig eases toward; drags and buttons both write here. `yaw` is degrees added
 * on top of your seat's own facing. */
let target: View = home();

export const cameraControls = {
  rotate(deg: number) { target.yaw += deg; },
  tilt(deg: number) { target.pitch = THREE.MathUtils.clamp(target.pitch + deg, MIN_PITCH, MAX_PITCH); },
  zoom(factor: number) { target.dist = THREE.MathUtils.clamp(target.dist * factor, MIN_DIST, MAX_DIST); },
  topDown() { target.pitch = target.pitch > 85 ? DEFAULT_PITCH : MAX_PITCH; },
  reset() { target = home(); },
};

export function CameraRig({ seat }: { seat: number }) {
  const { camera, gl } = useThree();
  const seatYaw = seatAngle(seat);
  const current = useRef<View>(home());
  const offset = useRef(new THREE.Vector3());

  useEffect(() => { cameraControls.reset(); current.current = home(); }, [seat]);
  useEffect(() => registerProjector(camera, gl.domElement), [camera, gl]);

  useEffect(() => {
    const el = gl.domElement;
    let pan: { x: number; y: number } | null = null;
    let orbit: { x: number; y: number; moved: boolean } | null = null;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      cameraControls.zoom(Math.exp(e.deltaY * 0.0012));
    };
    const onDown = (e: PointerEvent) => {
      if (e.button === 1 || (e.button === 0 && ui.spaceHeld)) {
        e.preventDefault();
        pan = { x: e.clientX, y: e.clientY };
        el.setPointerCapture?.(e.pointerId);
      } else if (e.button === 2) {
        orbit = { x: e.clientX, y: e.clientY, moved: false };
      }
    };
    const onMove = (e: PointerEvent) => {
      if (orbit) {
        const dx = e.clientX - orbit.x, dy = e.clientY - orbit.y;
        if (!orbit.moved && Math.hypot(dx, dy) < ORBIT_SLOP_PX) return;
        if (!orbit.moved) { orbit.moved = true; ui.openMenu(null); document.body.style.cursor = 'grabbing'; }
        orbit.x = e.clientX; orbit.y = e.clientY;
        target.yaw -= dx * 0.3;
        target.pitch = THREE.MathUtils.clamp(target.pitch + dy * 0.25, MIN_PITCH, MAX_PITCH);
        return;
      }
      if (!pan) return;
      const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
      pan = { x: e.clientX, y: e.clientY };
      const k = target.dist * 0.0016;
      const yaw = (seatYaw + target.yaw) * DEG;
      const right = { x: Math.cos(yaw), z: -Math.sin(yaw) }, up = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
      target.tx = THREE.MathUtils.clamp(target.tx - (right.x * dx - up.x * dy) * k, -30, 30);
      target.tz = THREE.MathUtils.clamp(target.tz - (right.z * dx - up.z * dy) * k, -22, 22);
    };
    const onUp = (e: PointerEvent) => {
      if (orbit) {
        // A right-drag orbits; only a plain right-click should open a piece's menu.
        if (orbit.moved) { ui.markOrbit(); document.body.style.cursor = ''; }
        orbit = null;
      }
      if (pan) { pan = null; el.releasePointerCapture?.(e.pointerId); }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Home' && !(e.target as HTMLElement)?.closest?.('input, textarea')) cameraControls.reset();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [gl, seatYaw]);

  useFrame((_, dt) => {
    const c = current.current, k = 1 - Math.exp(-dt * 12);
    c.tx += (target.tx - c.tx) * k;
    c.tz += (target.tz - c.tz) * k;
    c.dist += (target.dist - c.dist) * k;
    c.yaw += (target.yaw - c.yaw) * k;
    c.pitch += (target.pitch - c.pitch) * k;
    const pitch = c.pitch * DEG, yaw = (seatYaw + c.yaw) * DEG;
    offset.current.set(0, Math.sin(pitch) * c.dist, Math.cos(pitch) * c.dist).applyAxisAngle(Y_AXIS, yaw);
    camera.position.set(c.tx + offset.current.x, offset.current.y, c.tz + offset.current.z);
    camera.lookAt(c.tx, 0, c.tz);
  });
  return null;
}
