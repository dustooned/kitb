// Private table password. Checked by the server; the browser only keeps the token it returns.
// On an open classroom server (TABLE_OPEN=true) this screen signs in by itself and never shows.
import { useEffect, useState, type FormEvent } from 'react';
import { isOpenTable, login } from '../net/api.ts';
import { invitedRoom } from '../net/invite.ts';

export function TesterGate({ onEnter }: { onEnter: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const invite = invitedRoom();

  useEffect(() => {
    let live = true;
    void (async () => {
      if (await isOpenTable()) {
        try { await login(''); if (live) onEnter(); return; } catch { /* fall through to the form */ }
      }
      if (live) setChecking(false);
    })();
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await login(password); onEnter(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }

  if (checking) return <main className="screen center"><p className="muted">Connecting…</p></main>;

  return (
    <main className="screen center">
      <form className="panel gate" onSubmit={submit}>
        <h1 className="logo">SAGA</h1>
        <p className="kicker">PRIVATE PLAYTEST</p>
        {invite && <p className="invited">You're invited to <b>{invite}</b></p>}
        <label className="field">
          <span>PASSWORD</span>
          <input type="password" autoFocus autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy || !password}>{busy ? '…' : 'ENTER'}</button>
        <p className="muted small center-text">Ask whoever invited you for the password. This browser remembers it for a while.</p>
      </form>
    </main>
  );
}
