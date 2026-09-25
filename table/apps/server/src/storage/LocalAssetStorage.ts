// Development storage: files on local disk under a single directory, named by random id only
// (the client-supplied file name is never used as a path).
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { ASSET_ID, type AssetMetadata, type AssetStorage, type ImageType, type StoredAsset } from './AssetStorage.ts';

export class LocalAssetStorage implements AssetStorage {
  constructor(private dir: string) {}

  async save(file: Buffer, metadata: AssetMetadata): Promise<StoredAsset> {
    await fs.mkdir(this.dir, { recursive: true });
    const id = `${randomBytes(16).toString('base64url')}.${metadata.type}`;
    await fs.writeFile(path.join(this.dir, id), file, { flag: 'wx' });
    return { id, type: metadata.type, size: file.length };
  }

  async get(id: string): Promise<StoredAsset | null> {
    if (!ASSET_ID.test(id)) return null;
    try {
      const data = await fs.readFile(path.join(this.dir, id));
      return { id, type: id.split('.').pop() as ImageType, size: data.length, data };
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<void> {
    if (ASSET_ID.test(id)) await fs.rm(path.join(this.dir, id), { force: true });
  }
}
