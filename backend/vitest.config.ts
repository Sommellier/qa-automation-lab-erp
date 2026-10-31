import { defineConfig } from 'vitest/config';
import { config as loadEnv } from 'dotenv';

if (process.env.RUN_DB_INTEGRATION === '1') loadEnv();

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    env: {
      DATABASE_URL: process.env.RUN_DB_INTEGRATION === '1' && process.env.DATABASE_URL
        ? process.env.DATABASE_URL
        : 'postgresql://test:test@localhost:5432/test',
      JWT_SECRET: 'test-secret-with-at-least-32-characters',
      ACCESS_TOKEN_TTL_MINUTES: '15',
      REFRESH_TOKEN_TTL_HOURS: '8',
      FRONTEND_URL: 'http://localhost:5173',
      TRUST_PROXY_HOPS: '1',
    },
    coverage: {
      reporter: ['text', 'html'],
    },
  },
});
