// One private table. Owns authoritative table state; validates message structure, room
// membership and piece locks — never any particular game's rules.
import { randomBytes, randomInt } from 'node:crypto';
import { Room, ServerError, type Client, type Delayed } from '@colyseus/core';
import { MAX_PLAYERS } from '@kitforge/shared-types';
import { verifyToken } from '../auth.ts';
import { services } from '../services.ts';
import { claimRoomCode, releaseRoomCode } from './roomCode.ts';
import { cleanIds, sanitizeDefinition, sanitizeKit, KIT_LIMITS } from './sanitize.ts';
import type { TableState } from './TableState.ts';
import * as ops from './tableOps.ts';

/** Seconds a dropped connection keeps its session (refresh / Wi-Fi blip). */
export const RECONNECT_SECONDS = 120;

type Handler = (playerId: string, msg: any, client: Client) => ops.OpResult | void | Promise<ops.OpResult | void>;

export class TableRoom extends Room<{ state: TableState }> {
  maxClients = MAX_PLAYERS * 2;
  ctx!: ops.TableContext;
  private sessions = new Map<string, string>(); // sessionId -> playerId
  private buckets = new Map<string, { tokens: number; at: number }>();
  private closeTimer: Delayed | undefined;

  onCreate() {
    // We close empty tables ourselves (after a grace period) instead of the instant the last
    // tester leaves: a closed laptop or a long Wi-Fi drop shouldn't wipe the table.
    this.autoDispose = false;
    this.ctx = ops.createTableContext();
    this.roomId = claimRoomCode(n => randomInt(n));
    this.ctx.state.roomCode = this.roomId;
    this.setState(this.ctx.state);
    void this.setPrivate(true);
    this.registerHandlers();
    this.checkEmpty();
  }

  onAuth(_client: Client, options: any) {
    if (!verifyToken(options?.token, services().config.sessionSecret)) throw new ServerError(401, 'Your session expired. Enter the password again.');
    return true;
  }

  onJoin(client: Client, options: any) {
    const res = ops.addPlayer(this.ctx, { name: options?.name, reclaimPlayerId: options?.reclaimPlayerId, newId: `p_${randomBytes(6).toString('hex')}` });
    if (!res.player) throw new ServerError(409, res.error ?? 'Could not join.');
    for (const [sid, pid] of this.sessions) if (pid === res.player.id) this.sessions.delete(sid);
    this.sessions.set(client.sessionId, res.player.id);
    client.send('welcome', { playerId: res.player.id, roomCode: this.roomId });
    this.checkEmpty();
  }

  onDrop(client: Client) {
    const pid = this.sessions.get(client.sessionId);
    if (pid) ops.setConnected(this.ctx, pid, false);
    this.allowReconnection(client, RECONNECT_SECONDS).catch(() => {});
  }

  onReconnect(client: Client) {
    const pid = this.sessions.get(client.sessionId);
    if (!pid || !this.ctx.state.players.has(pid)) return;
    ops.setConnected(this.ctx, pid, true);
    client.send('welcome', { playerId: pid, roomCode: this.roomId });
    this.checkEmpty();
  }

  onLeave(client: Client) {
    const pid = this.sessions.get(client.sessionId);
    this.sessions.delete(client.sessionId);
    this.buckets.delete(client.sessionId);
    if (!pid) return;
    ops.setConnected(this.ctx, pid, false);
    ops.reassignHost(this.ctx);
    this.checkEmpty();
  }

  onDispose() {
    releaseRoomCode(this.roomId);
  }

  private checkEmpty() {
    const anyone = [...this.ctx.state.players.values()].some(p => p.connected);
    if (anyone) { this.closeTimer?.clear(); this.closeTimer = undefined; return; }
    if (this.closeTimer) return;
    this.closeTimer = this.clock.setTimeout(() => { void this.disconnect(); }, services().config.emptyTableMinutes * 60_000);
  }

  /** Token bucket per connection: plenty for dragging (~20 moves/s), stops floods. */
  private allow(sessionId: string) {
    const now = Date.now();
    const b = this.buckets.get(sessionId) ?? { tokens: 60, at: now };
    b.tokens = Math.min(60, b.tokens + ((now - b.at) / 1000) * 40);
    b.at = now;
    this.buckets.set(sessionId, b);
    if (b.tokens < 1) return false;
    b.tokens--;
    return true;
  }

  private on(type: string, handler: Handler) {
    this.onMessage(type, async (client: Client, msg: unknown) => {
      const pid = this.sessions.get(client.sessionId);
      if (!pid || !this.ctx.state.players.has(pid) || !this.allow(client.sessionId)) return;
      try {
        const res = await handler(pid, typeof msg === 'object' && msg !== null ? msg : {}, client);
        if (res?.notice) client.send('notice', { text: res.notice });
      } catch (err) {
        console.error(`[room ${this.roomId}] ${type} failed:`, err);
      }
    });
  }

  private registerHandlers() {
    const c = this.ctx;
    this.on('grab', (pid, m) => ops.grab(c, pid, m.id));
    this.on('move', (pid, m) => { ops.move(c, pid, m.id, m.x, m.z); });
    this.on('drop', (pid, m) => ops.drop(c, pid, m.id, m.x, m.z, m.snap !== false));
    this.on('grabMany', (pid, m) => ops.grabMany(c, pid, cleanIds(m.ids)));
    this.on('moveMany', (pid, m) => { ops.moveMany(c, pid, m.items); });
    this.on('dropMany', (pid, m) => ops.dropMany(c, pid, m.items));
    this.on('stackAction', (pid, m) => ops.stackAction(c, pid, m.id, m.action));
    this.on('flip', (pid, m) => ops.flip(c, pid, cleanIds(m.ids)));
    this.on('rotate', (pid, m) => ops.rotate(c, pid, cleanIds(m.ids), m.delta));
    this.on('tap', (pid, m) => ops.tap(c, pid, cleanIds(m.ids)));
    this.on('clone', (pid, m) => ops.clone(c, pid, m.id));
    this.on('remove', (pid, m) => ops.remove(c, pid, cleanIds(m.ids)));
    this.on('spawnMarker', (pid, m) => ops.spawnMarker(c, pid, m));
    this.on('adjustMarker', (pid, m) => ops.adjustMarker(c, pid, m.id, m.delta));
    this.on('renameMarker', (pid, m) => ops.renameMarker(c, pid, m.id, m.label));
    this.on('addNote', (pid, m) => ops.addNote(c, pid, m));
    this.on('editNote', (pid, m) => ops.editNote(c, pid, m.id, m.text));
    this.on('resetTable', pid => ops.clearTable(c, pid));
    this.on('ping', (_pid, m, client) => { client.send('pong', { t: typeof m.t === 'number' ? m.t : 0 }); });

    this.on('loadKit', (pid, m) => {
      const kit = sanitizeKit(m.kit);
      if (!kit) return { ok: false, notice: 'That kit could not be loaded (bad format or too many pieces).' };
      const defs = (Array.isArray(m.definitions) ? m.definitions.slice(0, KIT_LIMITS.definitions) : []).map(sanitizeDefinition).filter(Boolean);
      return ops.loadKit(c, pid, kit, defs as NonNullable<ReturnType<typeof sanitizeDefinition>>[]);
    });

    this.on('kick', (pid, m) => {
      const res = ops.kick(c, pid, m.playerId);
      if (!res.ok) return res;
      for (const [sid, target] of this.sessions) {
        if (target !== m.playerId) continue;
        this.sessions.delete(sid);
        const kicked = this.clients.getById(sid);
        kicked?.send('kicked', { text: 'The host removed you from this table.' });
        kicked?.leave(4000);
      }
      return res;
    });
  }
}
