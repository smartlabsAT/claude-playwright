import { Page, BrowserContext } from '@playwright/test';
import { SessionManager } from '../core/session-manager';

export interface SessionOptions {
  sessionName: string;
  browserProfile?: string;
  autoSave?: boolean;
  saveOnClose?: boolean;
  workingDir?: string;
}

export interface SessionMetadata {
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  timestamp: number;
}

/**
 * Session Helper for integrating Playwright with Session Management
 * Provides automatic session backup, loading, and rotation
 */
export class SessionHelper {
  private sessionManager: SessionManager;
  private currentSession?: SessionOptions;
  private context?: BrowserContext;
  private page?: Page;
  
  constructor(workingDir?: string) {
    this.sessionManager = new SessionManager(workingDir);
  }
  
  /**
   * Initialize session helper with Playwright context and page
   */
  async init(context: BrowserContext, page: Page): Promise<void> {
    this.context = context;
    this.page = page;
  }
  
  /**
   * Save current browser session
   */
  async saveCurrentSession(sessionName: string, options?: {
    browserProfile?: string;
    includeMetadata?: boolean;
  }): Promise<boolean> {
    if (!this.context || !this.page) {
      throw new Error('SessionHelper not initialized. Call init() first.');
    }
    
    try {
      // Get current storage state
      const storageState = await this.context.storageState();
      
      let metadata: SessionMetadata | undefined;
      
      if (options?.includeMetadata) {
        // Gather metadata from current page
        const url = this.page.url();
        const userAgent = await this.page.evaluate(() => {
          return (globalThis as any).navigator?.userAgent || 'Unknown';
        });
        const viewport = this.page.viewportSize();
        
        metadata = {
          url,
          userAgent,
          viewport: viewport || { width: 1920, height: 1080 },
          timestamp: Date.now()
        };
      }
      
      // Save session with metadata
      await this.sessionManager.saveSession(sessionName, storageState, {
        browserProfile: options?.browserProfile,
        metadata
      });
      
      this.currentSession = {
        sessionName,
        browserProfile: options?.browserProfile,
        autoSave: true
      };
      
      return true;
    } catch (error) {
      console.error(`Failed to save session '${sessionName}':`, (error as Error).message);
      return false;
    }
  }
  
  /**
   * Create a new browser context with a saved session
   */
  static async createContextWithSession(
    browser: any,
    sessionName: string,
    workingDir?: string
  ): Promise<BrowserContext | null> {
    const sessionManager = new SessionManager(workingDir);
    
    try {
      // Check if session is valid
      if (!await sessionManager.isSessionValid(sessionName)) {
        console.warn(`Cannot create context: Session '${sessionName}' is expired or doesn't exist`);
        return null;
      }
      
      // Load storage state
      const storageState = await sessionManager.loadSession(sessionName);
      const sessionData = await sessionManager.getSessionData(sessionName);
      
      // Create context with storage state
      const contextOptions: any = {
        storageState
      };
      
      // Apply metadata if available
      if (sessionData.metadata) {
        if (sessionData.metadata.userAgent) {
          contextOptions.userAgent = sessionData.metadata.userAgent;
        }
        if (sessionData.metadata.viewport) {
          contextOptions.viewport = sessionData.metadata.viewport;
        }
      }
      
      const context = await browser.newContext(contextOptions);
      
      console.log(`Context created with session: ${sessionName}`);
      return context;
    } catch (error) {
      console.error(`Failed to create context with session '${sessionName}':`, (error as Error).message);
      return null;
    }
  }
  
  /**
   * Create context with auto-loaded session from environment (MCP integration)
   */
  static async createContextWithMCPSession(browser: any): Promise<BrowserContext | null> {
    // Check for auto-loaded session from MCP integration
    const activeSessionName = process.env.PLAYWRIGHT_ACTIVE_SESSION;
    const storageStateData = process.env.PLAYWRIGHT_SESSION_STORAGE_STATE;
    const activeProfile = process.env.PLAYWRIGHT_ACTIVE_PROFILE;
    const lastUrl = process.env.PLAYWRIGHT_LAST_URL;
    const viewport = process.env.PLAYWRIGHT_VIEWPORT;
    const userAgent = process.env.PLAYWRIGHT_USER_AGENT;
    
    if (!storageStateData || !activeSessionName) {
      console.log('No MCP session data available, creating fresh context');
      return null;
    }
    
    try {
      const storageState = JSON.parse(storageStateData);
      
      const contextOptions: any = {
        storageState
      };
      
      // Apply viewport from session metadata
      if (viewport) {
        try {
          contextOptions.viewport = JSON.parse(viewport);
        } catch (error) {
          console.warn('Could not parse viewport from session metadata');
        }
      }
      
      // Apply user agent from session metadata
      if (userAgent) {
        contextOptions.userAgent = userAgent;
      }
      
      const context = await browser.newContext(contextOptions);
      
      console.log(`🎭 Context created with MCP session: ${activeSessionName}`);
      
      if (activeProfile) {
        console.log(`🎨 Using profile: ${activeProfile}`);
      }
      
      if (lastUrl) {
        console.log(`🌐 Last visited: ${lastUrl}`);
      }
      
      return context;
    } catch (error) {
      console.error('Failed to create context with MCP session:', (error as Error).message);
      return null;
    }
  }
  
  /**
   * Save session with MCP integration awareness
   */
  async saveMCPSession(sessionName: string, options?: {
    browserProfile?: string;
    includeMetadata?: boolean;
    updateEnvironment?: boolean;
  }): Promise<boolean> {
    const result = await this.saveCurrentSession(sessionName, options);
    
    if (result && options?.updateEnvironment) {
      // Update environment variables for ongoing MCP session
      process.env.PLAYWRIGHT_ACTIVE_SESSION = sessionName;
      
      if (options.browserProfile) {
        process.env.PLAYWRIGHT_ACTIVE_PROFILE = options.browserProfile;
      }
      
      if (this.page && options.includeMetadata) {
        process.env.PLAYWRIGHT_LAST_URL = this.page.url();
      }
      
      console.log(`🔄 Updated MCP environment for session: ${sessionName}`);
    }
    
    return result;
  }
  
  /**
   * Auto-save session periodically (for MCP background operations)
   */
  startAutoSave(intervalMinutes: number = 30): NodeJS.Timeout | null {
    if (!this.context || !this.page) {
      console.warn('Cannot start auto-save: SessionHelper not initialized');
      return null;
    }
    
    const intervalMs = intervalMinutes * 60 * 1000;
    
    return setInterval(async () => {
      try {
        const activeSessionName = process.env.PLAYWRIGHT_ACTIVE_SESSION;
        
        if (activeSessionName) {
          const autoSaveName = `${activeSessionName}-autosave-${Date.now()}`;
          await this.saveCurrentSession(autoSaveName, {
            includeMetadata: true,
            browserProfile: process.env.PLAYWRIGHT_ACTIVE_PROFILE
          });
          
          console.log(`Auto-saved session: ${autoSaveName}`);
        } else {
          // Create a new auto-save session
          const autoSaveName = `autosave-${Date.now()}`;
          await this.saveCurrentSession(autoSaveName, {
            includeMetadata: true
          });
          
          console.log(`Created auto-save session: ${autoSaveName}`);
        }
      } catch (error) {
        console.warn('Auto-save failed:', (error as Error).message);
      }
    }, intervalMs);
  }
}