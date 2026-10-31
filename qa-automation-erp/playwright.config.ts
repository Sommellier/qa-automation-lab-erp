import { defineConfig } from '@playwright/test';
import 'dotenv/config';

export default defineConfig({
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:5173',
    headless: true
  }
});
