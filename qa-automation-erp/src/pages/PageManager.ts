
import type { Page } from '@playwright/test';

export class PageManager {
  private readonly instancias = new Map<
    new (page: Page) => object,
    object
  >();

  constructor(private readonly page: Page) {}

  obter<T extends object>(
    PageClass: new (page: Page) => T
  ): T {
    let instancia = this.instancias.get(PageClass) as T | undefined;

    if (!instancia) {
      instancia = new PageClass(this.page);
      this.instancias.set(PageClass, instancia);
    }

    return instancia;
  }
}
