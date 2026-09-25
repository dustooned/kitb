// Creating, joining and restoring a table. Refresh-safe: the seat is remembered per tab and
// restored first via the SDK reconnection token, then (if that window closed) by reclaiming it.
import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type ServerMessages } from '@kitforge/shared-types';
import { SERVER_URL } from '../config.ts';
import { showRoomInAddressBar } from './invite.ts';
import { session } from './session.ts';
import { store } from './tableStore.ts';

const client = new Client(SERVER_URL);

function friendly(err: unknown) {
  const msg = (err as Error)?.message ?? String(err);
  if (/not found|no rooms|invalid room/i.test(msg)) return 'No table with that code. Check the code, or ask the host to create one.';
  if (/expired|401|auth/i.test(msg)) return 'Your session expired. Enter the password again.';
  if (/full|locked|maxClients/i.test(msg)) return msg.includes('full') ? msg : 'That table is full.';
  if (/fetch|network|ECONNREFUSED/i.test(msg)) return 'Cannot reach the table server. Is it running?';
  return msg;
}

function attach(room: Room) {
  store.room = room;
  store.ready = false;
  store.status = 'online';
  const saveSeat = () => { if (store.playerId) session.setSeat({ roomId: room.roomId, reconnectionToken: room.reconnectionToken, playerId: store.playerId }); };

  room.onStateChange(() => {
    if (!store.ready) { store.ready = true; store.bump(); return; }
    store.scheduleBump();
  });
  room.onMessage('welcome', (m: ServerMessages['welcome']) => { store.playerId = m.playerId; saveSeat(); store.bump(); });
  room.onMessage('notice', (m: ServerMessages['notice']) => store.notify(m.text));
  room.onMessage('pong', (m: ServerMessages['pong']) => { store.latencyMs = Math.round(performance.now() - m.t); });
  room.onMessage('kicked', (m: ServerMessages['kicked']) => { session.clearSeat(); store.notify(m.text); });
  room.onDrop(() => { store.status = 'reconnecting'; store.bump(); });
  room.onReconnect(() => { store.status = 'online'; saveSeat(); store.bump(); });
  room.onLeave(code => {
    if (store.room !== room) return;
    store.status = code === 1000 ? 'offline' : 'lost';
    if (code === 1000 || code === 4000) session.clearSeat();
    store.room = null;
    store.ready = false;
    store.bump();
  });
  store.bump();
}

function requireToken() {
  const token = session.token();
  if (!token) throw new Error('Your session expired. Enter the password again.');
  return token;
}

export async function createTable(name: string) {
  try {
    attach(await client.create(ROOM_NAME, { token: requireToken(), name }));
  } catch (err) { throw new Error(friendly(err)); }
}

export async function joinTable(code: string, name: string) {
  const roomId = normalizeCode(code);
  const saved = session.seat();
  try {
    attach(await client.joinById(roomId, { token: requireToken(), name, reclaimPlayerId: saved?.roomId === roomId ? saved.playerId : undefined }));
  } catch (err) { throw new Error(friendly(err)); }
}

let restoring: Promise<boolean> | null = null;

export function restoreTable(name: string): Promise<boolean> {
  restoring ??= restore(name).finally(() => { restoring = null; });
  return restoring;
}

async function restore(name: string): Promise<boolean> {
  const saved = session.seat();
  if (!saved) return false;
  try {
    attach(await client.reconnect(saved.reconnectionToken));
    return true;
  } catch {
    try {
      attach(await client.joinById(saved.roomId, { token: requireToken(), name, reclaimPlayerId: saved.playerId }));
      return true;
    } catch {
      session.clearSeat();
      return false;
    }
  }
}

export async function leaveTable() {
  session.clearSeat();
  showRoomInAddressBar(null);
  const room = store.room;
  store.reset();
  await room?.leave(true).catch(() => {});
}

export function normalizeCode(input: string) {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return `KIT-${s.startsWith('KIT') ? s.slice(3) : s}`;
}
