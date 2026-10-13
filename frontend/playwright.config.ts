import { defineConfig, devices } from '@playwright/test'
import path from 'node:path'

// Isolated stack for e2e: its own ports and a throwaway SQLite file, with the clearly-labelled mock tutor (deterministic, no API key).
const API_PORT = 8101
const WEB_PORT = 5174
const backend = path.resolve(import.meta.dirname, '../backend')
const db = path.join(backend, 'data', 'e2e.db')

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 90_000 }, // first Pyodide download is slow
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${WEB_PORT}`, trace: 'retain-on-failure', ...devices['Desktop Chrome'] },
  webServer: [
    {
      command: `rm -f ${db}* && .venv/bin/alembic upgrade head && .venv/bin/uvicorn app.main:app --port ${API_PORT}`,
      cwd: backend,
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: `sqlite:///${db}`, ENV: 'development', LLM_PROVIDER: 'mock', RATE_LIMIT_ENABLED: 'false',
        FRONTEND_ORIGIN: `http://localhost:${WEB_PORT}`, SESSION_SECRET: 'e2e-only-secret-not-for-production-use-0123456789',
      },
    },
    {
      command: 'npx vite --host localhost',
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { PORT: String(WEB_PORT), API_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
})
