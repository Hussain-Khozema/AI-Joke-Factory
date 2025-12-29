import path from 'path';
import { webcrypto } from 'node:crypto';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 6 expects WebCrypto's getRandomValues in the Node runtime during build.
// Netlify will use Node 20 (configured in netlify.toml), but this keeps local builds compatible with older Node versions too.
if (!(globalThis as any).crypto?.getRandomValues) {
  (globalThis as any).crypto = webcrypto as any;
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
