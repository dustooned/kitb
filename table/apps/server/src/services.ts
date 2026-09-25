// Process-wide services. Rooms are constructed by Colyseus, so they read these instead of
// receiving them through (client-mergeable) room options.
import type { ServerConfig } from './config.ts';
import type { AssetStorage } from './storage/AssetStorage.ts';

export interface Services { config: ServerConfig; storage: AssetStorage }

let current: Services | null = null;

export function setServices(s: Services) { current = s; }
export function services(): Services {
  if (!current) throw new Error('Server services were not initialised.');
  return current;
}
