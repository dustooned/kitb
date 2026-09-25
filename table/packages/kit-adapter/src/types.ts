import type { NormalizedKit, PieceDefinition } from '@kitforge/shared-types';

export interface ParsedKitFile {
  source: string;
  kit: NormalizedKit;
  definitions: PieceDefinition[];
}

export class KitParseError extends Error {}
