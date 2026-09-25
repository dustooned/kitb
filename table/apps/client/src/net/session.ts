// What survives a page refresh. The seat lives in sessionStorage (per tab), so two tabs can be two
// testers. The tester token lives in localStorage, so the password is asked once per browser until
// the token expires. The password itself is never stored — only the server's expiring token.

export interface SavedSeat { roomId: string; reconnectionToken: string; playerId: string }

const read = <T,>(store: Storage, key: string): T | null => {
  try { return JSON.parse(store.getItem(key) ?? 'null') as T | null; } catch { return null; }
};
const write = (store: Storage, key: string, value: string) => { try { store.setItem(key, value); } catch { /* ignore */ } };
const remove = (store: Storage, key: string) => { try { store.removeItem(key); } catch { /* ignore */ } };

export const session = {
  token(): string | null {
    const t = read<{ token: string; expiresAt: number }>(localStorage, 'kf-token');
    return t && t.expiresAt > Date.now() + 60_000 ? t.token : null;
  },
  setToken(token: string, expiresAt: number) { write(localStorage, 'kf-token', JSON.stringify({ token, expiresAt })); },
  clearToken() { remove(localStorage, 'kf-token'); },

  seat(): SavedSeat | null { return read<SavedSeat>(sessionStorage, 'kf-seat'); },
  setSeat(seat: SavedSeat) { write(sessionStorage, 'kf-seat', JSON.stringify(seat)); },
  clearSeat() { remove(sessionStorage, 'kf-seat'); },

  name(): string { try { return localStorage.getItem('kf-name') ?? ''; } catch { return ''; } },
  setName(name: string) { write(localStorage, 'kf-name', name); },
};
