// All settings come from the environment (or table/.env). Secrets never reach the client bundle.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const TABLE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const envFile = path.join(TABLE_ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

export interface ServerConfig {
  port: number;
  password: string;
  sessionSecret: string;
  sessionHours: number;
  uploadDir: string;
  maxUploadBytes: number;
  /** Largest single websocket message (a kit load can carry many rasterized images). */
  maxMessageBytes: number;
  clientDist: string;
  /** How long a table with nobody connected stays open, so testers can come back to it. */
  emptyTableMinutes: number;
  /** Express "trust proxy" (hops or true) so rate limits see real tester IPs behind a host's proxy. */
  trustProxy: number | boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const password = env.TABLE_PASSWORD ?? '';
  if (!password) {
    throw new Error('TABLE_PASSWORD is not set. Copy .env.example to .env and choose a tester password.');
  }
  return {
    port: Number(env.PORT) || 2568,
    password,
    // Random per boot unless pinned: tokens simply stop working after a server restart.
    sessionSecret: env.SESSION_SECRET || randomBytes(32).toString('hex'),
    sessionHours: Number(env.SESSION_HOURS) || 12,
    uploadDir: path.resolve(TABLE_ROOT, env.UPLOAD_DIR || '.data/uploads'),
    maxUploadBytes: (Number(env.MAX_UPLOAD_MB) || 8) * 1024 * 1024,
    maxMessageBytes: (Number(env.MAX_MESSAGE_MB) || 6) * 1024 * 1024,
    clientDist: path.resolve(TABLE_ROOT, 'apps/client/dist'),
    emptyTableMinutes: env.EMPTY_TABLE_MINUTES !== undefined && env.EMPTY_TABLE_MINUTES !== '' && Number.isFinite(Number(env.EMPTY_TABLE_MINUTES))
      ? Math.max(0, Number(env.EMPTY_TABLE_MINUTES)) : 30,
    trustProxy: env.TRUST_PROXY === 'true' ? true : Number(env.TRUST_PROXY) > 0 ? Number(env.TRUST_PROXY) : false,
  };
}
