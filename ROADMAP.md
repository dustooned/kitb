# Roadmap

v0.1 covers the part every game needs first: card art and alpha-channel pieces, exportable as
a print-and-play kit. Everything below is deliberately staged after it.

## v0.2 — Dice

- A configurable die (d4/d6/d8/d10/d12/d20, custom face count) with either a simple numeric
  roller (fast, no physics) or a rollable 3D die (via `<model-viewer>` or a light Three.js
  scene) for the "feel" of rolling.
- Export: a printable die net (foldable paper die) alongside the digital roller, so it works
  even in a no-screen playtest.

## v0.3 — 3D model upload + placement

- Accept `.glb`/`.gltf` uploads (the practical browser-safe formats; students exporting from
  Blender/Maya/etc. would export to glTF).
- A simple 3D "shelf" view to preview and position an uploaded model (scale/rotate), similar
  in spirit to the card/piece art controls but on a turntable instead of a flat canvas.
- This is the natural place for students studying DMA-style 3D/DCC pipelines to plug in work
  from Blender or Maya without leaving the browser tool.

## v0.4 — Shared live table

- A real-time browser table (same approach as [playtest/](../TabletopSimulator/Lolfighttiem/beta/v1/playtest)
  in the sibling LOL, FIGHT TIEM! project: free-form piece/card movement, no rules engine,
  the table only syncs state) so a class can playtest each other's kits together instead of
  passing a ZIP around.
- Hosting is the open question here: the sibling project uses a small Node/Colyseus server,
  which isn't free to host long-term. Options to evaluate: WebRTC peer-to-peer (fully
  serverless, works for small groups, no backend to run) vs. a free-tier realtime host
  (Cloudflare Durable Objects / PartyKit, Supabase Realtime). Peer-to-peer is the likelier
  fit given the "must stay free" constraint — revisit once dice/3D pull is validated.

## Why staged this way

Cards + pieces alone already cover "make art for a board game and get it onto physical
paper/tokens" — the most common request. Dice and 3D models are additive on the same
authoring pattern (upload → position → export) and don't require new infrastructure. The
live table is the only piece that needs a hosting decision, so it's last.
