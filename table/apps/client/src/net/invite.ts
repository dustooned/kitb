// Invite links: the page URL plus ?room=CODE. While you sit at a table the address bar shows
// that link too, so "send them the URL" just works.

export function inviteLink(code: string) {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('room', code);
  return url.toString();
}

export function invitedRoom(): string {
  return new URLSearchParams(window.location.search).get('room')?.toUpperCase() ?? '';
}

export function showRoomInAddressBar(code: string | null) {
  try {
    const url = new URL(window.location.href);
    if (code) url.searchParams.set('room', code); else url.searchParams.delete('room');
    history.replaceState(null, '', url);
  } catch { /* purely cosmetic */ }
}

/** Clipboard API needs HTTPS (or localhost); fall back to the old copy command elsewhere. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement('textarea'), { value: text });
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export async function copyInvite(code: string, notify: (text: string) => void) {
  const link = inviteLink(code);
  if (await copyText(link)) notify('Invite link copied. Send it to your players with the password.');
  else prompt('Copy this invite link:', link);
}
