// 🧰 Table tools: load a Kit Forge export, drop markers/notes, host-only clear. Collapsible so
// it never covers the table.
import { useRef, useState } from 'react';
import { parseKitFile } from '@kitforge/kit-adapter';
import type { PieceDefinition } from '@kitforge/shared-types';
import { uploadDataUrl } from '../net/api.ts';
import { actions } from '../pieces/actions.ts';
import { useTable } from '../net/tableStore.ts';

export function Toolbar() {
  const t = useTable();
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const host = t.isHost();

  async function loadKitFile(file: File) {
    setLoading(true);
    try {
      const json = JSON.parse(await file.text());
      const parsed = parseKitFile(json, file.name.replace(/\.[^.]+$/, ''));
      // Upload each unique data: image once, then swap every definition to point at the real URL.
      const uploaded = new Map<string, string>();
      const resolve = async (dataUrl?: string) => {
        if (!dataUrl) return undefined;
        if (dataUrl.startsWith('data:')) {
          let url = uploaded.get(dataUrl);
          if (!url) { url = await uploadDataUrl(dataUrl); uploaded.set(dataUrl, url); }
          return url;
        }
        return dataUrl;
      };
      const definitions: PieceDefinition[] = [];
      for (const def of parsed.definitions) {
        const frontImage = (await resolve(def.frontImage)) ?? '';
        const backImage = await resolve(def.backImage);
        definitions.push({ ...def, frontImage, ...(backImage ? { backImage } : {}) });
      }
      actions.loadKit(parsed.kit, definitions);
      t.notify(`Loading “${parsed.kit.name}”…`);
    } catch (err) {
      t.notify(err instanceof SyntaxError ? 'That file is not valid JSON.' : (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className={`hud-panel tools ${open ? 'open' : ''}`}>
      <button className="tools-head" onClick={() => setOpen(o => !o)}>🧰 TABLE TOOLS <span>{open ? '▾' : '▸'}</span></button>
      {open && (
        <div className="tools-body">
          <div className="row wrap">
            <button className="btn small" disabled={loading} onClick={() => fileInput.current?.click()}>{loading ? 'Loading…' : '📦 Load kit…'}</button>
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
          <input ref={fileInput} type="file" accept=".json,application/json" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void loadKitFile(f); }} />
        </div>
      )}
    </section>
  );
}
