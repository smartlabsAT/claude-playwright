import { Page, expect, Locator } from '@playwright/test';

/**
 * Base Page Object Model class
 * All page objects should extend this class for consistent functionality
 */
export class BasePage {
  readonly page: Page;
  readonly baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  /**
   * Navigate to a specific path
   */
  async navigateTo(path: string = ''): Promise<void> {
    const url = `${this.baseUrl}${path}`;
    await this.page.goto(url);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Navigate to the page
   */
  async goto(): Promise<void> {
    await this.navigateTo('/');
  }

  /**
   * Wait for page to be loaded
   */
  async waitForLoad(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Take screenshot with custom name
   */
  async takeScreenshot(name: string): Promise<void> {
    await this.page.screenshot({ 
      path: `screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }

  /**
   * Wait for element and click
   */
  async clickAndWait(selector: string): Promise<void> {
    await this.page.click(selector);
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill multiple form fields
   */
  async fillForm(fields: Record<string, string>): Promise<void> {
    for (const [selector, value] of Object.entries(fields)) {
      await this.page.fill(selector, value);
    }
  }

  /**
   * Wait for element to be visible
   */
  async waitForElement(selector: string, timeout: number = 10000): Promise<Locator> {
    const element = this.page.locator(selector);
    await element.waitFor({ state: 'visible', timeout });
    return element;
  }

  /**
   * Check if element exists and is visible
   */
  async isElementVisible(selector: string): Promise<boolean> {
    try {
      const element = this.page.locator(selector);
      await element.waitFor({ state: 'visible', timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get text content from element
   */
  async getElementText(selector: string): Promise<string> {
    const element = await this.waitForElement(selector);
    return await element.textContent() || '';
  }

  /**
   * Expect page to have specific title
   */
  async expectPageTitle(title: string | RegExp): Promise<void> {
    await expect(this.page).toHaveTitle(title);
  }

  /**
   * Expect page to have specific URL
   */
  async expectURL(url: string | RegExp): Promise<void> {
    await expect(this.page).toHaveURL(url);
  }

  /**
   * Expect element to be visible
   */
  async expectElementVisible(selector: string): Promise<void> {
    await expect(this.page.locator(selector)).toBeVisible();
  }

  /**
   * Expect element to contain text
   */
  async expectElementText(selector: string, text: string | RegExp): Promise<void> {
    await expect(this.page.locator(selector)).toContainText(text);
  }

  /**
   * Wait for network to be idle
   */
  async waitForNetworkIdle(): Promise<void> {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Reload current page
   */
  async reload(): Promise<void> {
    await this.page.reload();
    await this.waitForNetworkIdle();
  }

  /**
   * Get current page URL
   */
  getCurrentUrl(): string {
    return this.page.url();
  }

  /**
   * Check if page is loaded (abstract method for subclasses to override)
   */
  async isLoaded(): Promise<boolean> {
    // Default implementation - subclasses should override
    return this.page.url().includes(this.baseUrl);
  }

  /**
   * Safe click with retry logic
   */
  async safeClick(locator: string | Locator, retries: number = 3): Promise<void> {
    const element = typeof locator === 'string' ? this.page.locator(locator) : locator;
    
    for (let i = 0; i < retries; i++) {
      try {
        await element.click({ timeout: 5000 });
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
  async safeFill(locator: string | Locator, value: string): Promise<void> {
    const element = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await element.clear();
    await element.fill(value);
  }

  /**
   * Get page title
   */
  async getTitle(): Promise<string> {
    return await this.page.title();
  }

  /**
   * Wait for element to be hidden
   */
  async waitForHidden(locator: string | Locator, timeout?: number): Promise<void> {
    const element = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await element.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Wait for element to be visible
   */
  async waitForVisible(locator: string | Locator, timeout?: number): Promise<void> {
    const element = typeof locator === 'string' ? this.page.locator(locator) : locator;
    await element.waitFor({ state: 'visible', timeout });
  }
}