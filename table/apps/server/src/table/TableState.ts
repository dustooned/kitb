// The synchronized table. Clients rebuild these types via schema reflection, so they only live here.
import { schema, t, type SchemaType } from '@colyseus/schema';

export const PieceState = schema({
  id: t.string().default(''),
  ownerId: t.string().default(''),
  x: t.float32().default(0),
  z: t.float32().default(0),
  /** Physical footprint in inches — copied from the definition so hit-testing/stacking never
   * needs a lookup, and mixed card/piece/board sizes all clamp/snap correctly. */
  w: t.float32().default(1),
  h: t.float32().default(1),
  rotation: t.int16().default(0),
  /** Meaningful for cards (front vs. generated/uploaded back); pieces and boards stay face-up. */
  faceUp: t.boolean().default(true),
  tapped: t.boolean().default(false),
  /** Stacking order: higher draws on top. Bumped whenever a piece is grabbed or moved. */
  order: t.uint32().default(0),
  lockedBy: t.string().default(''),
  /** JSON PieceFace. Nothing on this table is hidden information, so this is always populated. */
  face: t.string().default(''),
  backImage: t.string().default(''),
  kind: t.string().default('card'),
}, 'Piece');
export type PieceState = SchemaType<typeof PieceState>;

export const PlayerState = schema({
  id: t.string().default(''),
  name: t.string().default(''),
  seat: t.int8().default(0),
  connected: t.boolean().default(true),
}, 'Player');
export type PlayerState = SchemaType<typeof PlayerState>;

/** A generic token (+1, −1, damage, status, custom). Dropped on a piece, it rides along with it. */
export const MarkerState = schema({
  id: t.string().default(''),
  kind: t.string().default('plus'),
  label: t.string().default(''),
  value: t.int16().default(1),
  x: t.float32().default(0),
  z: t.float32().default(0),
  lockedBy: t.string().default(''),
  /** Piece this marker sits on ('' = loose on the table); ox/oz = offset from that piece's centre. */
  attachedTo: t.string().default(''),
  ox: t.float32().default(0),
  oz: t.float32().default(0),
  order: t.uint32().default(0),
}, 'Marker');
export type MarkerState = SchemaType<typeof MarkerState>;

/** A tester's sticky note on the table ("maybe this should cost 2?"). */
export const NoteState = schema({
  id: t.string().default(''),
  text: t.string().default(''),
  author: t.string().default(''),
  x: t.float32().default(0),
  z: t.float32().default(0),
  lockedBy: t.string().default(''),
  order: t.uint32().default(0),
}, 'Note');
export type NoteState = SchemaType<typeof NoteState>;

export const TableState = schema({
  roomCode: t.string().default(''),
  hostId: t.string().default(''),
  pieces: t.map(PieceState),
  players: t.map(PlayerState),
  log: t.array('string'),
  markers: t.map(MarkerState),
  notes: t.map(NoteState),
}, 'TableState');
export type TableState = SchemaType<typeof TableState>;
