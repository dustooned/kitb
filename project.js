// Pure helpers: no DOM, no canvas — filenames, print-sheet packing math, and kit "readiness"
// warnings. File reading, rasterizing and ZIP packing (all DOM/Blob-dependent) live in app.js.
export const slug = s => String(s || 'kit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kit';

// Print sheets tile cards onto US-Letter pages at 300dpi. Cards can be different sizes (mixed
// presets in one kit), so this is a simple shelf/row bin-packer rather than a fixed grid.
export const PRINT_DPI = 300;
export const PAGE_W = 8.5 * PRINT_DPI, PAGE_H = 11 * PRINT_DPI, MARGIN = 0.25 * PRINT_DPI, GAP = 0.12 * PRINT_DPI;

/** Expand items by their `count` into one flat print queue, e.g. count:3 -> printed 3 times. */
export function printQueue(items) {
  return items.flatMap(it => Array.from({ length: it.count || 1 }, () => it));
}

/** items: [{ id, wIn, hIn, ...anything }]. Returns pages: [{ placements: [{ item, x, y, w, h }] }] in print px. */
export function packPrintPages(items) {
  const pages = [];
  let page = null, row = null, y = MARGIN;
  const newPage = () => { page = { placements: [] }; pages.push(page); y = MARGIN; };
  const newRow = () => { row = { x: MARGIN, h: 0 }; };
  newPage(); newRow();
  for (const it of items) {
    const w = it.wIn * PRINT_DPI, h = it.hIn * PRINT_DPI;
    if (w > PAGE_W - 2 * MARGIN || h > PAGE_H - 2 * MARGIN) continue; // too big for a page — exported as its own PNG instead
    if (row.x + w > PAGE_W - MARGIN) { // wrap to a new row
      y += row.h + GAP; newRow();
    }
    if (y + h > PAGE_H - MARGIN) { newPage(); newRow(); } // wrap to a new page
    page.placements.push({ item: it, x: row.x, y, w, h });
    row.x += w + GAP; row.h = Math.max(row.h, h);
  }
  return pages.filter(p => p.placements.length);
}

/** Warnings shown in the UI so students notice missing art/blank layers before exporting. */
export function kitWarnings(k) {
  const w = [];
  if (!k.categories.length) w.push('No categories yet — add one to organize your cards, pieces and boards.');
  const check = (list, label) => { for (const it of list) if (!it.layers.some(l => !l.hidden && (l.kind !== 'shape' || l.name !== 'Background'))) w.push(`${label} "${it.name}" is still blank — add some art, text or shapes.`); };
  check(k.cards, 'Card'); check(k.pieces, 'Piece'); check(k.boards, 'Board');
  return w;
}

export function readme(k) {
  return `${k.title}
${k.className ? 'Class: ' + k.className + '\n' : ''}${k.author ? 'Made by: ' + k.author + '\n' : ''}
Built with Kit Forge.

What's in this ZIP:
  kit.json        Full save. Drop it back into Kit Forge to keep editing.
  cards/*.png      One image per card face, ready to print or import elsewhere.
  pieces/*.png     One image per piece/token, transparent background outside the shape.
  boards/*.png     One image per board.
  print/sheet-*.png  Print-and-play sheets (US Letter) packing every card, sized to their real inches.
`;
}
