// Bottom left: camera buttons — the same orbit/zoom/reset as right-drag and the wheel, for
// touch screens, trackpads and anyone who doesn't know the mouse shortcuts.
import { cameraControls } from '../table/CameraRig.tsx';

export function CameraPanel() {
  const btn = (label: string, title: string, fn: () => void) => (
    <button className="cam-btn" title={title} aria-label={title} onClick={fn}>{label}</button>
  );
  return (
    <section className="hud-panel cam-panel" aria-label="Camera">
      {btn('⟲', 'Orbit left', () => cameraControls.rotate(45))}
      {btn('⟳', 'Orbit right', () => cameraControls.rotate(-45))}
      {btn('⤒', 'Tilt up', () => cameraControls.tilt(12))}
      {btn('⤓', 'Tilt down', () => cameraControls.tilt(-12))}
      {btn('▣', 'Top-down view', () => cameraControls.topDown())}
      {btn('＋', 'Zoom in', () => cameraControls.zoom(0.8))}
      {btn('－', 'Zoom out', () => cameraControls.zoom(1.25))}
      {btn('⌂', 'Reset view (Home)', () => cameraControls.reset())}
      <p className="cam-hint">Right-drag to orbit · wheel to zoom · middle-drag to pan</p>
    </section>
  );
}
