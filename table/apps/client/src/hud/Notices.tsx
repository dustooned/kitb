// Small toasts: server notices ("Joe is moving that card") and local messages.
import { useTable } from '../net/tableStore.ts';

export function Notices() {
  const t = useTable();
  return (
    <div className="notices" role="status">
      {t.status === 'reconnecting' && <div className="notice warn">Connection lost — reconnecting…</div>}
      {t.notices.map(n => <div key={n.id} className="notice">{n.text}</div>)}
    </div>
  );
}
