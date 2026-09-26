// Center of an empty table: what to do first. Disappears once anything is on the table.
import { pickKitFile } from '../pieces/loadKit.ts';
import { useTable } from '../net/tableStore.ts';

export function EmptyTable() {
  const t = useTable();
  if (!t.state || t.state.pieces.size > 0) return null;
  return (
    <section className="hud-panel empty-table">
      <h2>Your table is empty</h2>
      <p className="muted small">In Kit Forge, hit <b>Send to Table</b>, then drop that <code>.kittable.json</code> anywhere on this page — or:</p>
      <button className="btn primary" disabled={!!t.kitProgress} onClick={pickKitFile}>{t.kitProgress ?? '📦 Load kit…'}</button>
    </section>
  );
}
