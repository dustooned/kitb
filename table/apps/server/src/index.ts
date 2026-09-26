import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.ts';
import { lanUrls } from './lanUrls.ts';
import { startServer } from './server.ts';

try {
  const config = loadConfig();
  await startServer(config);
  const servesClient = fs.existsSync(path.join(config.clientDist, 'index.html'));
  // Built client: this port is the whole app. Dev: students open Vite's port instead.
  const sharePort = servesClient ? config.port : 5195;
  console.log(`SAGA server on http://localhost:${config.port}`);
  const urls = lanUrls(sharePort);
  if (urls.length) {
    console.log(`\n  Students on the same wifi can open:`);
    for (const u of urls) console.log(`    ${u}`);
    console.log(`  (Windows may ask to allow Node through the firewall the first time — allow it on private networks.)\n`);
  }
  console.log(`  uploads: ${config.uploadDir}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
