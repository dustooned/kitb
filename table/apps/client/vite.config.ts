import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // VITE_* settings live in the table root .env next to the server's settings.
  envDir: '../..',
  // Fixed, uncommon port so it doesn't collide with other Vite projects on the same machine.
  server: { port: 5195, strictPort: true },
});
