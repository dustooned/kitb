// Uploaded piece images live behind this interface so local disk can later be swapped for
// S3 / Cloudflare R2 / Supabase Storage without touching the room or HTTP code.

export type ImageType = 'png' | 'jpg' | 'webp';

export interface AssetMetadata {
  type: ImageType;
  originalName?: string;
}

export interface StoredAsset {
  /** Opaque, unguessable file id, e.g. "Xb3k...Q.png". */
  id: string;
  type: ImageType;
  size: number;
  data?: Buffer;
}

export interface AssetStorage {
  save(file: Buffer, metadata: AssetMetadata): Promise<StoredAsset>;
  get(id: string): Promise<StoredAsset | null>;
  delete?(id: string): Promise<void>;
}

export const MIME: Record<ImageType, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** Identify an image by its actual bytes, never by the name or Content-Type the client claims. */
export function sniffImageType(buf: Buffer): ImageType | null {
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const ASSET_ID = /^[A-Za-z0-9_-]{22}\.(png|jpg|webp)$/;
