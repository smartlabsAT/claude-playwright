import { chromium, Browser, BrowserContext, Page } from '@playwright/test';
import { SessionManager } from '../core/session-manager';
import { BrowserProfileManager } from '../core/browser-profile';
import readline from 'readline';
import chalk from 'chalk';

import {
  SessionAction,
  SessionCommandOptions,
  SessionSaveOptions as TypedSessionSaveOptions,
  SessionLoadResult,
  SessionListOptions,
  CommandResult,
  CommandContext,
  ValidationResult,
  StorageState,
  BrowserProfileSettings
} from '../types/cli-types';

export interface SessionSaveOptions extends TypedSessionSaveOptions {
  timeout?: number;
  url?: string;
}

export interface BrowserProfile extends BrowserProfileSettings {
  hasTouch?: boolean;
  isMobile?: boolean;
}

/**
 * Real browser-based session capture with manual login
 */
export async function saveRealSession(
  sessionName: string, 
  url: string = 'http://localhost:3000/login',
  options: SessionSaveOptions = {}
): Promise<boolean> {
  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  
  try {
    console.log(chalk.blue(`🚀 Opening browser for session capture...`));
    console.log(chalk.gray(`📝 Session name: ${sessionName}`));
    console.log(chalk.gray(`🌐 Target URL: ${url}`));
    
    // Launch browser in non-headless mode for manual login
    browser = await chromium.launch({ 
      headless: false,
      args: ['--start-maximized']
    });
    
    // Get browser profile if specified
    let contextOptions: any = {
      viewport: null // Use full window
    };
    
    if (options.browserProfile) {
      const profileManager = new BrowserProfileManager(process.cwd());
      try {
        const profile = await getBrowserProfile(options.browserProfile);
        if (profile.userAgent) {
          contextOptions.userAgent = profile.userAgent;
        }
        if (profile.viewport) {
          contextOptions.viewport = profile.viewport;
        }
        if (profile.hasTouch !== undefined) {
          contextOptions.hasTouch = profile.hasTouch;
        }
        if (profile.isMobile !== undefined) {
          contextOptions.isMobile = profile.isMobile;
        }
        console.log(chalk.gray(`🎭 Using browser profile: ${options.browserProfile}`));
      } catch (error) {
        console.log(chalk.yellow(`⚠️ Browser profile not found, using default settings`));
      }
    }
    
    context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    
    // Navigate to the target URL
    console.log(chalk.blue(`📍 Navigating to ${url}...`));
    await page.goto(url);
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    console.log(chalk.yellow('\n👤 Please complete the following steps:'));
    console.log(chalk.white('1. Login manually in the browser window'));
    console.log(chalk.white('2. Navigate to any authenticated pages'));
    console.log(chalk.white('3. Complete any required authentication steps'));
    console.log(chalk.gray('\n⌨️  Press ENTER when ready to save session...\n'));
    
    // Wait for user confirmation
    await waitForUserInput();
    
    // Capture real session state
    console.log(chalk.blue('💾 Capturing session state...'));
    const storageState = await context.storageState();
    
    // Validate session has actual data
    if (storageState.cookies.length === 0) {
      console.log(chalk.red('⚠️  No cookies found!'));
      console.log(chalk.yellow('This might indicate that:'));
      console.log(chalk.gray('- You are not logged in'));
      console.log(chalk.gray('- The website doesn\'t use cookies for authentication'));
      console.log(chalk.gray('- The login process is still in progress'));
      
      const confirm = await askConfirmation('Save session anyway?');
      if (!confirm) {
        console.log(chalk.gray('❌ Session save cancelled'));
        return false;
      }
    } else {
      console.log(chalk.green(`✅ Captured ${storageState.cookies.length} cookies`));
      if (storageState.origins && storageState.origins.length > 0) {
        console.log(chalk.green(`✅ Captured localStorage for ${storageState.origins.length} origins`));
      }
    }
    
    // Save using SessionManager
    const manager = new SessionManager(process.cwd());
    await manager.saveSession(sessionName, storageState, {
      browserProfile: options.browserProfile,
      metadata: {
        url: page.url(),
        userAgent: await page.evaluate(() => (globalThis as any).navigator?.userAgent || 'Unknown'),
        viewport: page.viewportSize() || { width: 1920, height: 1080 }
      }
    });
    
    console.log(chalk.green(`✅ Session "${sessionName}" saved successfully!`));
    console.log(chalk.gray(`📁 Location: ./playwright-sessions/${sessionName}.json`));
    console.log(chalk.gray(`⏰ Valid until: ${new Date(Date.now() + 8 * 60 * 60 * 1000).toLocaleString()}`));
    
    return true;
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to save session:'), (error as Error).message);
    return false;
    
  } finally {
    // Clean up browser resources
    if (context) {
      try {
        await context.close();
      } catch (error) {
        console.warn(chalk.yellow('Warning: Failed to close browser context'));
      }
    }
    
    if (browser) {
      try {
        await browser.close();
      } catch (error) {
        console.warn(chalk.yellow('Warning: Failed to close browser'));
      }
    }
  }
}

/**
 * Auto-extend session if it expires in less than 2 hours
 */
export async function autoExtendSessionIfNeeded(sessionName: string): Promise<boolean> {
  const manager = new SessionManager(process.cwd());
  return await manager.autoExtendSession(sessionName);
}

/**
 * Prompt user for URL input
 */
export async function promptForUrl(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(chalk.blue('🌐 Enter the login URL: '), (url) => {
      rl.close();
      resolve(url.trim() || 'https://example.com/login');
    });
  });
}

/**
 * Wait for user to press ENTER
 */
function waitForUserInput(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question('', () => {
      rl.close();
      resolve();
    });
  });
}

/**
 * Ask for user confirmation (yes/no)
 */
function askConfirmation(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} (y/N): `), (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Get browser profile configuration
 */
function getBrowserProfile(profileName: string): BrowserProfile {
  const profiles: Record<string, BrowserProfile> = {
    desktop: {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      hasTouch: false,
      isMobile: false
    },
    mobile: {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 375, height: 667 },
      hasTouch: true,
      isMobile: true
    },
    tablet: {
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
      isMobile: false
    }
  };
  
  return profiles[profileName] || profiles.desktop;
}