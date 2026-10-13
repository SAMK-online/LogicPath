/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: Number(process.env.PORT ?? 5180),
    strictPort: true, // fail loudly: the backend only accepts the configured FRONTEND_ORIGIN
    // Same-origin in dev: the browser talks to Vite, Vite forwards /api to FastAPI.
    // This keeps cookies first-party and avoids CORS/SameSite problems locally.
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://127.0.0.1:8100', changeOrigin: false } },
  },
  worker: { format: 'es' },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
