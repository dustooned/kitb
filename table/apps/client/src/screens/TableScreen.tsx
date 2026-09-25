// The table: 3D pieces fill the screen, small HUD panels sit in the corners.
import { useEffect } from 'react';
import { actions } from '../pieces/actions.ts';
import { showRoomInAddressBar } from '../net/invite.ts';
import { store, useTable } from '../net/tableStore.ts';
import { ContextMenu } from '../hud/ContextMenu.tsx';
import { Notices } from '../hud/Notices.tsx';
import { RoomPanel } from '../hud/RoomPanel.tsx';
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

export function TableScreen() {
  const t = useTable();
  useTableKeys();
  const roomCode = t.state?.roomCode ?? '';
  useEffect(() => { if (roomCode) showRoomInAddressBar(roomCode); }, [roomCode]);

  // The kit chosen before create/join (none in v1's lobby, but kept for a future pass) loads once seated.
  useEffect(() => {
    if (t.playerId && store.pendingKit) {
      const { kit, definitions } = store.pendingKit;
      store.pendingKit = null;
      actions.loadKit(kit, definitions);
    }
  }, [t.playerId]);

  return (
    <main className="table-screen">
      <Tabletop />
      <div className="hud tl"><RoomPanel /></div>
      <div className="hud tc"><Notices /></div>
      <div className="hud br"><Toolbar /></div>
      <ContextMenu />
    </main>
  );
}
