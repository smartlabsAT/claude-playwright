import { test, expect } from '@playwright/test';

/**
 * Example test demonstrating Claude-Playwright integration
 * This test can be used as a template for creating new tests
 */
test.describe('Example Test Suite', () => {
  
  test.beforeEach(async ({ page }) => {
    // Setup code that runs before each test
    await page.goto('https://example.com');
  });
  
  test('should load the homepage', async ({ page }) => {
    // Verify page loads correctly
    await expect(page).toHaveTitle(/Example Domain/);
    
    // Take screenshot for visual verification
    await page.screenshot({ path: 'screenshots/homepage.png' });
  });
  
  test('should interact with page elements', async ({ page }) => {
    // Example of element interaction
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('Example Domain');
    
    // Example of clicking an element (if available)
    // await page.click('button[data-testid="submit"]');
  });
  
  test('should handle form interactions', async ({ page }) => {
    // Example of form filling
    // await page.fill('input[name="email"]', 'test@example.com');
    // await page.fill('input[name="password"]', 'password123');
    // await page.click('button[type="submit"]');
    
    // Verify form submission or navigation
    // await expect(page).toHaveURL(/dashboard/);
  });
  
  test('should work with persistent browser profiles', async ({ page }) => {
    // This test demonstrates how to use persistent browser profiles
    // The browser profile is automatically configured via MCP setup
    
    // Check if we can access local storage (indicates profile persistence)
    const storageValue = await page.evaluate(() => {
      localStorage.setItem('test-key', 'test-value');
      return localStorage.getItem('test-key');
    });
    
    expect(storageValue).toBe('test-value');
  });
});