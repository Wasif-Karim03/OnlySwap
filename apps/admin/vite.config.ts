import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Admin console on Cloudflare Pages (`onlyswap-admin`, P12-ADM-01).
export default defineConfig({
  plugins: [react()],
  build: { sourcemap: false, chunkSizeWarningLimit: 700 },
});
