// Client settings. Only VITE_* values reach the browser — never put secrets in them.

/** Where the table server lives.
 * - Production build: the server serves this page, so it's always the page's own origin — a
 *   student who opened http://192.168.1.42:2568 talks to that same machine, never "localhost".
 * - Dev (`npm run dev`, page on :5195, server on :2568): VITE_SERVER_URL, with "localhost"
 *   swapped for whatever host the page was opened on, so other devices on the wifi still work. */
function serverUrl() {
  if (!import.meta.env.DEV) return window.location.origin;
  const configured = (import.meta.env.VITE_SERVER_URL as string | undefined)?.replace(/\/$/, '');
  if (!configured) return window.location.origin;
  return configured.replace(/\/\/(localhost|127\.0\.0\.1)(?=[:/]|$)/, `//${window.location.hostname}`);
}
export const SERVER_URL = serverUrl();

/** Turns a server-relative image path (/assets/...) into a loadable URL, or passes a data: URL through. */
export function assetUrl(path: string) {
  if (!path) return '';
  return path.startsWith('data:') ? path : `${SERVER_URL}${path}`;
}
