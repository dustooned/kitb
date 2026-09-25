// Private-tester gate: one shared password checked on the server, exchanged for a signed,
// expiring token. The token (not the password) is what the browser keeps and sends.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

export function passwordMatches(attempt: unknown, expected: string): boolean {
  if (typeof attempt !== 'string' || attempt.length > 200) return false;
  return timingSafeEqual(digest(attempt), digest(expected));
}

const sign = (payload: string, secret: string) => createHmac('sha256', secret).update(payload).digest('base64url');

export function issueToken(secret: string, hours: number, now = Date.now()) {
  const expiresAt = now + hours * 3600_000;
  const payload = `v1.${expiresAt}`;
  return { token: `${payload}.${sign(payload, secret)}`, expiresAt };
}

export function verifyToken(token: unknown, secret: string, now = Date.now()): boolean {
  if (typeof token !== 'string' || token.length > 200) return false;
  const [v, exp, sig] = token.split('.');
  if (v !== 'v1' || !exp || !sig) return false;
  const expected = Buffer.from(sign(`${v}.${exp}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  return Number(exp) > now;
}

/** Fixed-window counter per key (IP). Enough to blunt password guessing and upload floods. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private limit: number, private windowMs: number) {}

  allow(key: string, now = Date.now()): boolean {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 5000) for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
      return true;
    }
    h.count++;
    return h.count <= this.limit;
  }
}
