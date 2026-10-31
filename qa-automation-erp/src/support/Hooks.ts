
import 'dotenv/config';
import { Before, After, BeforeAll, AfterAll } from '@cucumber/cucumber';
import { chromium, type Browser } from '@playwright/test';
import { CustomWorld } from './CustomWorld';
import { PageManager } from '../pages/PageManager';
import { setDefaultTimeout } from '@cucumber/cucumber';
let browser: Browser;

setDefaultTimeout(30_000);

BeforeAll(async () => {
  browser = await chromium.launch({
    headless: true
  });
});

Before(async function (this: CustomWorld) {
  this.context = await browser.newContext({
    baseURL: process.env.BASE_URL ?? 'http://localhost:5173'
  });

  this.page = await this.context.newPage();

  this.pages = new PageManager(this.page);
});

After(async function (this: CustomWorld) {
  await this.context?.close();
});

AfterAll(async () => {
  await browser?.close();
});

