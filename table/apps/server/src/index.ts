import { loadConfig } from './config.ts';
import { startServer } from './server.ts';

try {
  const config = loadConfig();
  await startServer(config);
  console.log(`TAFL server on http://localhost:${config.port}`);
  console.log(`  uploads: ${config.uploadDir}`);
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
