// Pure helpers: no DOM, no canvas — filenames, print-sheet layout math, and kit "readiness"
// warnings. File reading, rasterizing and ZIP packing (all DOM/Blob-dependent) live in app.js.
export const slug = s => String(s || 'kit').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'kit';

// Print sheet: cards render on-screen at 500x700 (a 2.5x3.5in card at 200dpi). For a
// print-and-play sheet we rasterize at 1.5x → 750x1050 (2.5x3.5in @ 300dpi) and tile a
// US-Letter page (2550x3300 @ 300dpi), which fits a clean 3x3 grid with room to spare for cut lines.
export const PRINT = { cardScale: 1.5, pageW: 2550, pageH: 3300, cols: 3, rows: 3, margin: 75 };
export function printLayout() {
  const cw = 500 * PRINT.cardScale, ch = 700 * PRINT.cardScale;
  const gapX = (PRINT.pageW - PRINT.margin * 2 - PRINT.cols * cw) / Math.max(1, PRINT.cols - 1);
  const gapY = (PRINT.pageH - PRINT.margin * 2 - PRINT.rows * ch) / Math.max(1, PRINT.rows - 1);
  return { cw, ch, gapX: Math.max(0, gapX), gapY: Math.max(0, gapY), perPage: PRINT.cols * PRINT.rows };
}
/** Expand cards by their `count` into one flat print queue, e.g. count:3 -> printed 3 times. */
export function printQueue(cards) {
  return cards.flatMap(c => Array.from({ length: c.count || 1 }, () => c));
}

/** Warnings shown in the UI so students notice missing art before exporting/printing. */
export function kitWarnings(k) {
  const w = [];
  if (!k.categories.length) w.push('No categories yet — add one to organize cards and pieces.');
  for (const c of k.cards) if (!c.art?.asset) w.push(`Card "${c.name}" has no art yet.`);
  for (const p of k.pieces) if (!p.art?.asset) w.push(`Piece "${p.name}" has no art yet.`);
  return w;
}

export function readme(k) {
  return `${k.title}
${k.className ? 'Class: ' + k.className + '\n' : ''}${k.author ? 'Made by: ' + k.author + '\n' : ''}
Built with Curriculum Forge.

What's in this ZIP:
  kit.json        Full save. Drop it back into Curriculum Forge to keep editing.
  cards/*.png      One image per card face, ready to print or import elsewhere.
  pieces/*.png     One image per piece/token, transparent background outside the shape.
  print/sheet-*.png  Print-and-play sheets (US Letter, 3x3 grid) for the cards.
`;
}
