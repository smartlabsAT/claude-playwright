import { Page, Locator } from '@playwright/test';

/**
 * Base Page Object Model
 * Provides common functionality for all page objects
 */
export abstract class BasePage {
  protected page: Page;
  protected baseUrl: string;
  
  constructor(page: Page, baseUrl: string = '') {
    this.page = page;
    this.baseUrl = baseUrl;
  }
  
  /**
   * Navigate to the page
   */
  abstract goto(): Promise<void>;
  
  /**
   * Wait for page to be loaded
   */
  abstract waitForLoad(): Promise<void>;
  
  /**
   * Take a screenshot of the current page
   */
  async screenshot(name?: string): Promise<Buffer> {
    return await this.page.screenshot({ 
      fullPage: true,
      path: name ? `screenshots/${name}.png` : undefined
    });
  }
  
  /**
   * Wait for element to be visible
   */
  async waitForVisible(locator: Locator, timeout?: number): Promise<void> {
    await locator.waitFor({ state: 'visible', timeout });
  }
  
  /**
   * Wait for element to be hidden
   */
  async waitForHidden(locator: Locator, timeout?: number): Promise<void> {
    await locator.waitFor({ state: 'hidden', timeout });
  }
  
  /**
   * Safe click with retry logic
   */
  async safeClick(locator: Locator, retries: number = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
      try {
        await locator.click({ timeout: 5000 });
        return;
      } catch (error) {
        if (i === retries - 1) throw error;
        await this.page.waitForTimeout(1000);
      }
    }
  }
  
  /**
   * Safe fill with clearing
   */
  async safeFill(locator: Locator, value: string): Promise<void> {
    await locator.clear();
    await locator.fill(value);
  }
  
  /**
   * Get current URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }
  
  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }
}