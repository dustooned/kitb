// Client settings. Only VITE_* values reach the browser — never put secrets in them.

/** Where the table server lives. Unset = same origin (production, server serves the client). */
export const SERVER_URL = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '') || window.location.origin;

/** Turns a server-relative image path (/assets/...) into a loadable URL, or passes a data: URL through. */
export function assetUrl(path: string) {
  if (!path) return '';
  return path.startsWith('data:') ? path : `${SERVER_URL}${path}`;
}
