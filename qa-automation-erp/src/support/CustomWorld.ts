
import { World, IWorldOptions, setWorldConstructor } from '@cucumber/cucumber';
import type { Page, BrowserContext } from '@playwright/test';
import { PageManager } from '../pages/PageManager';

export class CustomWorld extends World {
  page!: Page;
  context!: BrowserContext;
  pages!: PageManager;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(CustomWorld);
