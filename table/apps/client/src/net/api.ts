// Plain HTTP calls: password -> token, and image uploads.
import type { AuthResponse, UploadResponse } from '@kitforge/shared-types';
import { SERVER_URL } from '../config.ts';
import { session } from './session.ts';

export const SESSION_EXPIRED = 'kf:session-expired';

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = session.token();
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...init,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth') {
      session.clearToken();
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw new Error((body as { error?: string }).error ?? `Request failed (${res.status}).`);
  }
  return body as T;
}

export async function login(password: string) {
  const res = await request<AuthResponse>('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) });
  session.setToken(res.token, res.expiresAt);
  return res;
}

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export async function uploadImage(file: Blob) {
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is over 8 MB.');
  return request<UploadResponse>('/api/upload', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
}

/** A data: URL from a Kit Forge export, uploaded so it gets a real /assets/... URL the table can share. */
export async function uploadDataUrl(dataUrl: string): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  return (await uploadImage(blob)).assetUrl;
}
