// Password gate -> lobby -> table. A refreshed tab goes straight back to its seat.
import { useEffect, useState } from 'react';
import { SESSION_EXPIRED } from './net/api.ts';
import { restoreTable } from './net/connection.ts';
import { session } from './net/session.ts';
import { useTable } from './net/tableStore.ts';
import { RoomLobby } from './screens/RoomLobby.tsx';
import { TableScreen } from './screens/TableScreen.tsx';
import { TesterGate } from './screens/TesterGate.tsx';

export function App() {
  const t = useTable();
  const [authed, setAuthed] = useState(() => !!session.token());
  const [restoring, setRestoring] = useState(() => !!session.token() && !!session.seat());

  useEffect(() => {
    const expired = () => setAuthed(false);
    window.addEventListener(SESSION_EXPIRED, expired);
    return () => window.removeEventListener(SESSION_EXPIRED, expired);
  }, []);

  useEffect(() => {
    if (!restoring) return;
    void restoreTable(session.name()).finally(() => setRestoring(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!authed) return <TesterGate onEnter={() => setAuthed(true)} />;
  if (restoring) return <main className="screen center"><p className="muted">Rejoining your table…</p></main>;
  if (t.room) return t.state ? <TableScreen /> : <main className="screen center"><p className="muted">Sitting down at the table…</p></main>;
  return (
    <>
      {t.status === 'lost' && <div className="banner">Lost the connection to the table. Rejoin with the same rune and name to get your seat and pieces back.</div>}
      <RoomLobby onSessionExpired={() => { session.clearToken(); setAuthed(false); }} />
    </>
  );
}
