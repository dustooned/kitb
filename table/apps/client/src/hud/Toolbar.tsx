// 🧰 Table tools: load a Kit Forge export, drop markers/notes, host-only clear. Collapsible so
// it never covers the table.
import { useState } from 'react';
import { actions } from '../pieces/actions.ts';
import { pickKitFile } from '../pieces/loadKit.ts';
import { useTable } from '../net/tableStore.ts';

export function Toolbar() {
  const t = useTable();
  // Starts collapsed on small screens so it doesn't cover the table.
  const [open, setOpen] = useState(() => window.innerWidth > 700);
  const host = t.isHost();

  return (
    <section className={`hud-panel tools ${open ? 'open' : ''}`}>
      <button className="tools-head" onClick={() => setOpen(o => !o)}>🧰 TABLE TOOLS <span>{open ? '▾' : '▸'}</span></button>
      {open && (
        <div className="tools-body">
          <div className="row wrap">
            <button className="btn small" disabled={!!t.kitProgress} onClick={pickKitFile}>{t.kitProgress ?? '📦 Load kit…'}</button>
          </div>
          <div className="field"><span>MARKERS &amp; NOTES</span></div>
          <div className="row wrap">
            <button className="btn small" onClick={() => actions.spawnMarker('plus')}>+1</button>
            <button className="btn small" onClick={() => actions.spawnMarker('minus')}>−1</button>
            <button className="btn small" onClick={() => actions.spawnMarker('damage')}>DMG</button>
            <button className="btn small" onClick={() => actions.spawnMarker('status')}>STATUS</button>
            <button className="btn small" onClick={() => { const label = prompt('Marker label (e.g. FROZEN, SHIELD):'); if (label?.trim()) actions.spawnMarker('custom', label); }}>Custom…</button>
            <button className="btn small" onClick={() => { const text = prompt('Note for the table:'); if (text?.trim()) actions.addNote(text); }}>📝 Note…</button>
          </div>
          <div className="row wrap">
            <button className="btn small danger" disabled={!host} title={host ? '' : 'Host only'} onClick={() => { if (confirm('Clear every piece, marker and note off the table?')) t.send('resetTable', {}); }}>Clear table</button>
          </div>
        </div>
      )}
    </section>
  );
}
