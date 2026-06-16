import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    port: 5173,
    proxy: {
      // During dev, forward API + SSE calls to the local backend.
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
});
