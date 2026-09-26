// Short, readable, private "runes" like TAFL-82K (no 0/O/1/I/L to misread).
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const active = new Set<string>();

export function claimRoomCode(random: (n: number) => number): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = 'TAFL-';
    for (let i = 0; i < 3; i++) code += ALPHABET[random(ALPHABET.length)];
    if (!active.has(code)) { active.add(code); return code; }
  }
  throw new Error('Could not find a free room code.');
}

export function releaseRoomCode(code: string) { active.delete(code); }

export function normalizeRoomCode(input: string) {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return s.startsWith('TAFL') ? `TAFL-${s.slice(4)}` : `TAFL-${s}`;
}
