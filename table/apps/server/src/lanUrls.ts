import os from 'node:os';

/** http://<ip>:<port> for every non-internal IPv4 interface — what to hand students on the same wifi. */
export function lanUrls(port: number): string[] {
  const out: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const addr of list ?? []) {
      if (addr.family === 'IPv4' && !addr.internal) out.push(`http://${addr.address}:${port}`);
    }
  }
  return out;
}
