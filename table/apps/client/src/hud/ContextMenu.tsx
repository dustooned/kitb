// Right-click menu for pieces, markers and notes.
import { actions } from '../pieces/actions.ts';
import { stackMembers } from '../pieces/stacks.ts';
import { store, useTable } from '../net/tableStore.ts';
import { editNotePrompt } from '../table/Note3D.tsx';
import { ui, useUi, type MenuState } from '../table/selection.ts';

function TokenMenu({ menu }: { menu: MenuState }) {
  const run = (fn: () => void) => () => { fn(); ui.openMenu(null); };
  const marker = menu.source === 'marker' ? store.state?.markers.get(menu.id) : undefined;
  if (menu.source === 'marker' && !marker) return null;
  const rename = () => { const label = prompt('Marker label:', marker?.label ?? ''); if (label?.trim()) store.send('renameMarker', { id: menu.id, label }); };
  const left = Math.min(menu.x, window.innerWidth - 220), top = Math.max(8, Math.min(menu.y, window.innerHeight - 240));
  return (
    <>
      <div className="menu-catcher" onPointerDown={() => ui.openMenu(null)} onContextMenu={e => { e.preventDefault(); ui.openMenu(null); }} />
      <menu className="context-menu" style={{ left, top }}>
        {marker ? <>
          <li className="menu-head">Marker</li>
          <li><button onClick={run(() => actions.adjustMarker(menu.id, 1))}>＋1</button></li>
          <li><button onClick={run(() => actions.adjustMarker(menu.id, -1))}>−1</button></li>
          <li><button onClick={run(() => actions.adjustMarker(menu.id, 5))}>＋5</button></li>
          <li><button onClick={run(rename)}>Rename…</button></li>
        </> : <>
          <li className="menu-head">Note</li>
          <li><button onClick={run(() => editNotePrompt(menu.id))}>Edit…</button></li>
        </>}
        <li className="sep" />
        <li><button className="danger" onClick={run(() => actions.remove([menu.id]))}>Delete</button></li>
      </menu>
    </>
  );
}

export function ContextMenu() {
  const t = useTable();
  const u = useUi();
  const menu = u.menu;
  if (!menu || !t.state) return null;
  if (menu.source === 'marker' || menu.source === 'note') return <TokenMenu menu={menu} />;
  const piece = t.piece(menu.id);
  if (!piece) return null;
  const ids = u.selected.has(menu.id) ? [...u.selected] : [menu.id];
  const many = ids.length > 1 ? ` (${ids.length})` : '';
  const run = (fn: () => void) => () => { fn(); ui.openMenu(null); };
  const stack = stackMembers(t.state, piece);
  const height = 260 + (stack.length > 1 ? 140 : 0);
  const left = Math.min(menu.x, window.innerWidth - 220), topPx = Math.max(8, Math.min(menu.y, window.innerHeight - height));

  return (
    <>
      <div className="menu-catcher" onPointerDown={() => ui.openMenu(null)} onContextMenu={e => { e.preventDefault(); ui.openMenu(null); }} />
      <menu className="context-menu" style={{ left, top: topPx }}>
        {stack.length > 1 && <>
          <li className="menu-head">Stack · {stack.length}</li>
          <li><button onClick={run(() => actions.stack(menu.id, 'shuffle'))}>Shuffle stack</button></li>
          <li><button onClick={run(() => actions.stack(menu.id, 'flip'))}>Flip whole stack</button></li>
          <li><button onClick={run(() => actions.stack(menu.id, 'spread'))}>Spread out</button></li>
          <li><button onClick={run(() => ui.select(stack.map(c => c.id)))}>Select whole stack (then drag)</button></li>
          <li className="sep" />
        </>}
        <li><button onClick={run(() => actions.flip(ids))}>Flip{many} <kbd>F</kbd></button></li>
        <li><button onClick={run(() => actions.rotateLeft(ids))}>Rotate left{many} <kbd>Q</kbd></button></li>
        <li><button onClick={run(() => actions.rotateRight(ids))}>Rotate right{many} <kbd>E</kbd></button></li>
        <li><button onClick={run(() => actions.tap(ids))}>{piece.tapped ? 'Untap' : 'Tap'}{many} <kbd>T</kbd></button></li>
        <li className="sep" />
        <li><button onClick={run(() => actions.clone(menu.id))}>Clone</button></li>
        <li><button className="danger" onClick={run(() => { actions.remove(ids); ui.select([]); })}>Delete{many} <kbd>Del</kbd></button></li>
      </menu>
    </>
  );
}
