// Top left: the rune (click to copy an invite link) and who's in your party.
import { SEAT_COLORS } from '@kitforge/shared-types';
import { leaveTable } from '../net/connection.ts';
import { copyInvite } from '../net/invite.ts';
import { useTable } from '../net/tableStore.ts';

export function RoomPanel() {
  const t = useTable();
  const state = t.state;
  if (!state) return null;
  const players = [...state.players.values()].sort((a, b) => a.seat - b.seat);
  const copy = () => void copyInvite(state.roomCode, text => t.notify(text));

  return (
    <section className="hud-panel room-panel">
      <div className="room-row">
        <button className="room-code" onClick={copy} title="Copy an invite link">{state.roomCode}</button>
        <button className="btn small" onClick={copy} title="Copy a link that opens this table">🔗 Invite</button>
        <button className="btn small ghost" onClick={() => void leaveTable()} title="Leave the table">Leave</button>
      </div>
      <p className="party-label">PARTY · {players.length} player{players.length === 1 ? '' : 's'}</p>
      <ul className="players">
        {players.map(p => (
          <li key={p.id} className={p.connected ? '' : 'away'}>
            <i className="dot" style={{ background: SEAT_COLORS[p.seat % SEAT_COLORS.length] }} />
            <b>{p.name}</b>
            {p.id === state.hostId && <span title="Host">👑</span>}
            {p.id === t.playerId && <span className="muted">(you)</span>}
            {!p.connected && <span className="muted">away</span>}
            {t.isHost() && p.id !== t.playerId && (
              <button className="icon-btn" title={`Remove ${p.name}`} onClick={() => { if (confirm(`Remove ${p.name} from the table?`)) t.send('kick', { playerId: p.id }); }}>✕</button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
