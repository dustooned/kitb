// Loading a Kit Forge "Send to Table" file: parse it, upload each unique image once (a few at a
// time, with progress), then ask the server to spawn every piece. Used by the toolbar button,
// the empty-table prompt and drag-and-drop onto the page.
import { parseKitFile } from '@kitforge/kit-adapter';
import type { PieceDefinition } from '@kitforge/shared-types';
import { uploadDataUrl } from '../net/api.ts';
import { store } from '../net/tableStore.ts';
import { actions } from './actions.ts';

const PARALLEL_UPLOADS = 4;

export async function loadKitFile(file: File) {
  if (store.kitProgress) return;
  store.kitProgress = 'Reading kit…';
  store.bump();
  try {
    const parsed = parseKitFile(JSON.parse(await file.text()), file.name.replace(/\.kittable\.json$|\.json$/i, ''));
    const unique = [...new Set(parsed.definitions.flatMap(d => [d.frontImage, d.backImage]).filter((u): u is string => !!u && u.startsWith('data:')))];
    const uploaded = new Map<string, string>();
    const total = unique.length;
    let done = 0;
    const next = async () => {
      for (let url = unique.shift(); url; url = unique.shift()) {
        uploaded.set(url, await uploadDataUrl(url));
        store.kitProgress = `Uploading art ${++done}/${total}…`;
        store.bump();
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_UPLOADS }, next));
    const swap = (u?: string) => (u ? uploaded.get(u) ?? u : undefined);
    const definitions: PieceDefinition[] = parsed.definitions.map(def => {
      const backImage = swap(def.backImage);
      return { ...def, frontImage: swap(def.frontImage) ?? '', ...(backImage ? { backImage } : {}) };
    });
    actions.loadKit(parsed.kit, definitions);
    store.notify(`Loaded “${parsed.kit.name}”.`);
  } catch (err) {
    store.notify(err instanceof SyntaxError ? 'That file is not valid JSON.' : (err as Error).message);
  } finally {
    store.kitProgress = null;
    store.bump();
  }
}

/** Opens the browser's file picker for a .kittable.json. */
export function pickKitFile() {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json' });
  input.onchange = () => { const f = input.files?.[0]; if (f) void loadKitFile(f); };
  input.click();
}
