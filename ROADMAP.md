# Roadmap

v0.1 covered the part every game needs first: card art and alpha-channel pieces, exportable
as a print-and-play kit. v0.2 turned that into a real layered compositor (text/shape/image
layers, configurable card/piece/board sizes, PSD/PDF import) for all three component types,
plus a mobile-friendly UI. The shared live table (originally planned as v0.5, "later, once a
hosting approach was picked") shipped ahead of dice/3D models once that hosting question was
answered — see below.

## Shipped — Kit Forge Table (live playtest table)

A real-time browser table at [table/](table/README.md): free-form drag/flip/rotate/tap/stack,
markers, sticky notes, room codes + a shared password, all synced live between players — the
practical recreation of Tabletop Simulator the tool was always meant to lead to. Built as a
generalized sibling of [LOL, FIGHT TIEM!'s playtest table](../TabletopSimulator/Lolfighttiem/beta/v1/playtest)
(same Colyseus + React Three Fiber architecture; `apps/server/src/table/tableOps.ts` is the
entire game-agnostic "engine" as plain functions, ported near-verbatim). Kit Forge's own
**Send to Table** button rasterizes a kit into a `.kittable.json`; `packages/kit-adapter` is
the only piece that knows that file format, so a different card-maker's export could plug in
later by writing a new adapter instead of touching the table itself.

Needs its own Node server (unlike Kit Forge itself, which is static) — see table/README.md for
why plain HTTPS on port 443 is what makes it reachable from a locked-down school network.
Deliberately cut from v1: table look/theme customization (one fixed felt look for now), private
hands/decks (nothing on this table is hidden information — see the design note in
`table/README.md`), and snapshots (save/restore a whole table state to a file).

## v0.3 — Dice

- A configurable die (d4/d6/d8/d10/d12/d20, custom face count) with either a simple numeric
  roller (fast, no physics) or a rollable 3D die (via `<model-viewer>` or a light Three.js
  scene) for the "feel" of rolling.
- Export: a printable die net (foldable paper die) alongside the digital roller, so it works
  even in a no-screen playtest.
- The table already has a 3D scene running (React Three Fiber) — a rollable die most naturally
  lands there first, with the print net as Kit Forge's own export.

## v0.4 — 3D model upload + placement

- Accept `.glb`/`.gltf` uploads (the practical browser-safe formats; students exporting from
  Blender/Maya/etc. would export to glTF).
- A simple 3D "shelf" view to preview and position an uploaded model (scale/rotate) in Kit
  Forge, similar in spirit to the layer drag/scale/rotate handles but on a turntable instead of
  a flat canvas — then the same model can sit on the live table instead of only a flat piece.
- This is the natural place for students studying DMA-style 3D/DCC pipelines to plug in work
  from Blender or Maya without leaving the browser tool.

## Also worth doing, unscheduled

- **Non-uniform layer resize** (drag a side handle to stretch width/height independently,
  not just the uniform corner-scale handle today).
- **Board "poster" print tiling** — boards are usually bigger than one printed page; splitting
  one board into overlapping page tiles (like poster-print software does) instead of exporting
  a single large PNG.
- **Editable PSD text layers** — today a PSD's type layers import as rasterized images (safest,
  since font substitution would otherwise silently break the design); reconstructing them as
  real editable text layers needs a font-matching strategy first.
- **Table look customization, hands/decks, snapshots** — see "deliberately cut from v1" above;
  the table's schema and `tableOps.ts` were built to make these additive later, not precluded.
- **Cloud asset storage for the table** — uploads are local-disk only today
  (`table/apps/server/src/storage/`); swapping in S3/R2/Supabase would matter for a host
  without a persistent disk.

## Why staged this way

The compositor (v0.2) is the foundation everything else builds on. Dice and 3D models are
additive on the same authoring pattern (upload/add → position → export) and don't require new
infrastructure, so they were originally slated before the table. The table moved up once its
one open question — hosting — had an answer (reuse the LFT playtest server pattern, deployed
over plain HTTPS so school networks don't block it).
