# Kit Forge

A browser-based board game asset maker for classroom use. Students design cards, pieces and
boards in a layered compositor — text, shapes, and imported art (including Photoshop/Affinity
PSDs) — and export a print-and-play kit, without installing any software. No accounts, no
server: it runs entirely in the browser and autosaves locally.

Built as a stripped-down, game-agnostic sibling of [Card Forge](https://dustooned.github.io/lftcf)
(a card maker for a specific game), for classes where students each need to make their own
game's assets rather than one shared game's.

## What it does today (v0.2 "Compositing Table")

- **Cards, pieces and boards** — one layered compositor for all three. Add image, text and
  shape layers; drag to move, drag the corner handle to scale, drag the top handle to rotate.
  Each layer can be reordered, hidden, locked, duplicated and nudged/deleted with the keyboard.
- **Configurable sizes** — presets for card sizes (poker, bridge, tarot, square, mini), piece
  sizes, and board sizes (8×8" up to 24×24", landscape, etc.), or type in custom inches.
- **Pieces** in a few shapes (circle, square, rounded square, hex, diamond) — uploaded art
  auto-trims its transparent border.
- **Import** — plain images (PNG/JPG/WebP), **Photoshop `.psd`** (layers come in intact, via
  client-side parsing — nothing uploaded to a server), and **PDF/`.ai`** (flattened to one
  image, since `.ai` is a PDF container). Affinity's own formats (`.afphoto`/`.afdesign`)
  have no public spec, so there's no direct importer for them — but Affinity can *export* to
  `.psd`, which then imports the same way as a real Photoshop file.
- **Undo/redo** (Ctrl+Z / Ctrl+Shift+Z), autosave to the browser (IndexedDB).
- **Export ZIP** — every card/piece/board as a PNG, a print-and-play sheet (US Letter, packed
  to fit each card's real size) for the cards, and a `kit.json` save file that can be
  re-imported to keep editing or handed to a teammate.

See [ROADMAP.md](ROADMAP.md) for what's planned next (dice, 3D model upload/placement, and a
shared browser table for live playtesting) and why those are staged separately.

## Running it locally

No build step — it's plain HTML/CSS/JS.

```bash
npm run dev
```

Then open the printed `localhost` URL. Or just open `index.html` directly in a browser
(uploads/autosave still work; ZIP export and PSD/PDF import need internet, to fetch those
libraries from a CDN on first use).

## Deploying for a class (GitHub Pages, free)

1. Push this repo to GitHub (keep it public, or use a free GitHub Education org for private +
   free Pages).
2. Repo **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. GitHub gives you a URL like `https://<org>.github.io/<repo>/` — that's the link to share
   with students. No server to run or pay for.

Each student's work lives only in *their own browser* (IndexedDB), so there's nothing to
host per-student — they just export a ZIP when they're done and submit that.

## For students

1. Open the class link.
2. Add a category, then add a card, piece or board and pick its size.
3. Build it up from layers: **+ Image** (drop in your own art, or a Photoshop/Affinity-exported
   PSD), **+ Text**, or one of the shape tools. Click a layer to select it, drag to move it,
   use the corner/top handles to scale/rotate it.
4. When you're happy, hit **Export ZIP** — that's your submission (or import it back in next
   class to keep editing).

## Project layout

- `index.html`, `style.css` — the app shell.
- `app.js` — UI wiring, layer drag/scale/rotate interaction, PSD/PDF import (DOM only, no data logic).
- `model.js` — the data model + sanitizing (`normalizeKit`, `newItem`, layer factories, size presets).
- `render.js` — the shared layer renderer (SVG) for cards/pieces/boards, plus PNG rasterization.
- `project.js` — pure helpers (filenames, print-sheet packing math, readiness warnings) — no
  DOM, so it's the easiest place to add automated tests later.
- `store.js` — the IndexedDB autosave wrapper.
- `sw.js`, `manifest.webmanifest` — offline support (PWA "app shell" caching).
