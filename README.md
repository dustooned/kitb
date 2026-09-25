# Curriculum Forge

A browser-based board game asset maker for classroom use. Students upload their own art —
card faces and alpha-channel pieces/tokens — and export a print-and-play kit, without
installing any software. No accounts, no server: it runs entirely in the browser and
autosaves locally.

Built as a stripped-down, game-agnostic sibling of [Card Forge](https://dustooned.github.io/lftcf)
(a card maker for a specific game), for classes where students each need to make their own
game's assets rather than one shared game's.

## What it does today (v0.1 "Ground Floor")

- **Cards** — name, optional value badge, up to 4 stat boxes, description text, uploaded art
  you drag to reposition and scroll to zoom.
- **Pieces** — tokens/meeples/counters in a few shapes (circle, square, rounded square, hex,
  diamond). Upload a PNG with transparency (e.g. a cutout from Photoshop/Procreate/GIMP) and
  it auto-trims the transparent border for you.
- **Categories** — color-coded groups for organizing cards/pieces (factions, suits, whatever
  fits the game).
- Autosave to the browser (IndexedDB) so nothing is lost on refresh.
- **Export ZIP** — every card/piece as a PNG, a print-and-play sheet (US Letter, 3 cards per
  row) for the cards, and a `kit.json` save file that can be re-imported to keep editing or
  handed to a teammate.

See [ROADMAP.md](ROADMAP.md) for what's planned next (dice, 3D model upload/placement, and a
shared browser table for live playtesting) and why those are staged separately.

## Running it locally

No build step — it's plain HTML/CSS/JS.

```bash
npm run dev
```

Then open the printed `localhost` URL. Or just open `index.html` directly in a browser
(uploads/autosave still work; only the ZIP export needs internet, to fetch the zip library).

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
2. Add a category, then add a card or piece.
3. Upload your art. Drag it to position, scroll to zoom, use the rotate slider if needed.
4. When you're happy, hit **Export ZIP** — that's your submission (or import it back in
   next class to keep editing).

## Project layout

- `index.html`, `style.css` — the app shell.
- `app.js` — UI wiring (DOM only, no data logic).
- `model.js` — the data model + sanitizing (`normalizeKit`, `newCard`, `newPiece`, …).
- `render.js` — SVG rendering for cards/pieces and PNG rasterization.
- `project.js` — pure helpers (filenames, print-sheet math, readiness warnings) — no DOM, so
  it's the easiest place to add automated tests later.
- `store.js` — the IndexedDB autosave wrapper.
- `sw.js`, `manifest.webmanifest` — offline support (PWA "app shell" caching).
