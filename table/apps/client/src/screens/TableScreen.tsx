// The table: 3D pieces fill the screen, small HUD panels sit in the corners.
import { useEffect, useState } from 'react';
import { actions } from '../pieces/actions.ts';
import { loadKitFile } from '../pieces/loadKit.ts';
import { showRoomInAddressBar } from '../net/invite.ts';
import { store, useTable } from '../net/tableStore.ts';
import { CameraPanel } from '../hud/CameraPanel.tsx';
import { ContextMenu } from '../hud/ContextMenu.tsx';
import { EmptyTable } from '../hud/EmptyTable.tsx';
import { Notices } from '../hud/Notices.tsx';
import { RoomPanel } from '../hud/RoomPanel.tsx';
import { TableLookPanel } from '../hud/TableLookPanel.tsx';
import { Toolbar } from '../hud/Toolbar.tsx';
import { ui } from '../table/selection.ts';
import { Tabletop } from '../table/Tabletop.tsx';

function useTableKeys() {
  useEffect(() => {
    const typing = (e: KeyboardEvent) => !!(e.target as HTMLElement)?.closest?.('input, textarea, select');
    const down = (e: KeyboardEvent) => {
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Space') { ui.spaceHeld = true; e.preventDefault(); return; }
      const ids = ui.targets(id => !!store.piece(id));
      switch (e.key.toLowerCase()) {
        case 'f': actions.flip(ids); break;
        case 'q': actions.rotateLeft(ids); break;
        case 'e': actions.rotateRight(ids); break;
        case 't': actions.tap(ids); break;
        case 'delete':
        case 'backspace':
          if (ids.length && (ids.length === 1 || confirm(`Delete ${ids.length} pieces?`))) { actions.remove(ids); ui.select([]); }
          break;
        case 'escape': ui.clear(); break;
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') ui.spaceHeld = false; };
    const blur = () => { ui.spaceHeld = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);
}

/** Drop a .kittable.json anywhere on the page to load it. */
function useKitDrop() {
  const [over, setOver] = useState(false);
  useEffect(() => {
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    const onOver = (e: DragEvent) => { if (!hasFiles(e)) return; e.preventDefault(); setOver(true); };
    const onLeave = (e: DragEvent) => { if (!e.relatedTarget) setOver(false); };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setOver(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (/\.json$/i.test(file.name)) void loadKitFile(file);
      else store.notify('Drop the .kittable.json from Kit Forge’s “Send to Table” — for a table image, use 🎨 Table look.');
    };
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => { window.removeEventListener('dragover', onOver); window.removeEventListener('dragleave', onLeave); window.removeEventListener('drop', onDrop); };
  }, []);
  return over;
}

export function TableScreen() {
  const t = useTable();
  useTableKeys();
  const dropping = useKitDrop();
  const roomCode = t.state?.roomCode ?? '';
  useEffect(() => { if (roomCode) showRoomInAddressBar(roomCode); }, [roomCode]);

  return (
    <main className="table-screen">
      <Tabletop />
      <div className="hud tl"><RoomPanel /></div>
      <div className="hud tc"><Notices /></div>
      <div className="hud tr"><TableLookPanel /></div>
      <div className="hud cc"><EmptyTable /></div>
      <div className="hud bl"><CameraPanel /></div>
      <div className="hud br"><Toolbar /></div>
      <ContextMenu />
      {dropping && <div className="drop-overlay">Drop your kit to load it onto the table</div>}
    </main>
  );
}
