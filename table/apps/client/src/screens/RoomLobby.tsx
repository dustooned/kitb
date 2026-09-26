// Name, then either a new table or a rune. No public room list, by design.
// Arriving through an invite link (?room=CODE) turns the page into a one-button join.
import { useState, type FormEvent } from 'react';
import { createTable, joinTable } from '../net/connection.ts';
import { invitedRoom } from '../net/invite.ts';
import { session } from '../net/session.ts';

export function RoomLobby({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [name, setName] = useState(session.name());
  const [invite] = useState(invitedRoom);
  const [code, setCode] = useState(invite);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function go(action: 'create' | 'join', e?: FormEvent) {
    e?.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) { setError('Pick a name first.'); return; }
    session.setName(trimmed);
    setBusy(true);
    setError('');
    try {
      if (action === 'create') await createTable(trimmed);
      else await joinTable(code, trimmed);
    } catch (err) {
      const msg = (err as Error).message;
      if (/password/i.test(msg)) onSessionExpired();
      setError(msg);
    } finally { setBusy(false); }
  }

  const nameField = (
    <label className="field">
      <span>YOUR NAME</span>
      <input value={name} maxLength={24} autoFocus onChange={e => setName(e.target.value)} placeholder="What should your party call you?" />
    </label>
  );

  if (invite) {
    return (
      <main className="screen center">
        <form className="panel lobby" onSubmit={e => go('join', e)}>
          <h1 className="logo">TAFL</h1>
          <p className="invited">You're invited to <b>{invite}</b></p>
          {nameField}
          <button className="btn primary big" disabled={busy}>{busy ? 'JOINING…' : 'JOIN THE TABLE'}</button>
          {error && <p className="error">{error}</p>}
          <button type="button" className="btn ghost small" onClick={() => { history.replaceState(null, '', location.pathname); location.reload(); }}>Start my own table instead</button>
        </form>
      </main>
    );
  }

  return (
    <main className="screen center">
      <div className="panel lobby">
        <h1 className="logo">TAFL</h1>
        <p className="muted small">Bring a kit you exported from Kit Forge ("Send to Table") and load it once you're seated.</p>
        {nameField}
        <button className="btn primary big" disabled={busy} onClick={() => go('create')}>CREATE TABLE</button>
        <div className="divider"><span>or gather your party</span></div>
        <form className="join-row" onSubmit={e => go('join', e)}>
          <label className="field">
            <span>RUNE</span>
            <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="TAFL-82K" maxLength={12} />
          </label>
          <button className="btn" disabled={busy || !code.trim()}>JOIN TABLE</button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="muted small center-text">After you create a table, use 🔗 Invite to send your party the link.</p>
      </div>
    </main>
  );
}
