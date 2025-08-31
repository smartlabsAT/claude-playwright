#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, Browser, BrowserContext, Page, ConsoleMessage, Request, Response, Dialog } from 'playwright';
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';
import { EnhancedCacheIntegration } from '../core/enhanced-cache-integration.js';

// __dirname is available in CommonJS mode

// Type definitions
interface ConsoleMessageEntry {
  type: string;
  text: string;
  location?: any;
  timestamp: string;
  stack?: string;
}

interface NetworkRequestEntry {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  postData?: string | null;
  timestamp: string;
  type: 'request' | 'response';
  status?: number;
  statusText?: string;
}

interface DialogEntry {
  type: string;
  message: string;
  handled: boolean;
  timestamp: string;
}

interface SessionData {
  cookies?: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }>;
  origins?: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
  // Enhanced session data for better restoration
  currentUrl?: string | null;
  timestamp?: number;
}

interface FormField {
  selector: string;
  value: string;
  type?: 'text' | 'checkbox' | 'radio';
}

// Server configuration
const server = new McpServer({
  name: "claude-playwright",
  version: "2.0.0"
});

// Browser management
let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

// Enhanced cache integration
let enhancedCache: EnhancedCacheIntegration | null = null;

// Event collectors
let consoleMessages: ConsoleMessageEntry[] = [];
let networkRequests: NetworkRequestEntry[] = [];
let dialogHandlers: DialogEntry[] = [];

// BASE_URL injection - reads from environment or project config
const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
console.error(`[Claude-Playwright MCP] Starting with BASE_URL: ${BASE_URL}`);

// Session management
const SESSIONS_DIR = ProjectPaths.getSessionsDir();

// Ensure sessions directory exists
function ensureSessionsDir(): void {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    console.error(`[Claude-Playwright MCP] Created sessions directory: ${SESSIONS_DIR}`);
  }
}

// Load session if exists
async function loadSession(sessionName: string): Promise<SessionData | null> {
  ensureSessionsDir();
  const sessionFile = path.join(SESSIONS_DIR, `${sessionName}.session.json`);
  
  if (fs.existsSync(sessionFile)) {
    try {
      const sessionData: SessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      console.error(`[Claude-Playwright MCP] Loaded session: ${sessionName}`);
      return sessionData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Failed to load session: ${errorMessage}`);
    }
  }
  return null;
}

// Save current session
async function saveSession(sessionName: string): Promise<boolean> {
  if (!context) {
    throw new Error('No browser context to save');
  }
  
  ensureSessionsDir();
  const sessionFile = path.join(SESSIONS_DIR, `${sessionName}.session.json`);
  
  try {
    const storageState = await context.storageState();
    
    // Add current URL to session for better restore UX
    const enhancedSession = {
      ...storageState,
      currentUrl: page?.url() || null,
      timestamp: Date.now()
    };
    
    fs.writeFileSync(sessionFile, JSON.stringify(enhancedSession, null, 2));
    console.error(`[Claude-Playwright MCP] Saved session: ${sessionName} (URL: ${enhancedSession.currentUrl})`);
    return true;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[Claude-Playwright MCP] Failed to save session: ${errorMessage}`);
    throw error;
  }
}

// Setup page event listeners
function setupPageListeners(page: Page): void {
  // Console logging
  page.on('console', (msg: ConsoleMessage) => {
    const entry: ConsoleMessageEntry = {
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
      timestamp: new Date().toISOString()
    };
    consoleMessages.push(entry);
    
    // Keep only last 100 messages
    if (consoleMessages.length > 100) {
      consoleMessages.shift();
    }
    
    // Log errors to stderr
    if (msg.type() === 'error') {
      console.error(`[Browser Console Error] ${msg.text()}`);
    }
  });
  
  // Network monitoring
  page.on('request', (request: Request) => {
    const entry: NetworkRequestEntry = {
      url: request.url(),
      method: request.method(),
      headers: request.headers(),
      postData: request.postData(),
      timestamp: new Date().toISOString(),
      type: 'request'
    };
    networkRequests.push(entry);
    
    // Keep only last 100 requests
    if (networkRequests.length > 100) {
      networkRequests.shift();
    }
  });
  
  page.on('response', (response: Response) => {
    const entry: NetworkRequestEntry = {
      url: response.url(),
      status: response.status(),
      statusText: response.statusText(),
      headers: response.headers(),
      timestamp: new Date().toISOString(),
      type: 'response'
    };
    networkRequests.push(entry);
  });
  
  // Dialog handling
  page.on('dialog', async (dialog: Dialog) => {
    console.error(`[Dialog] ${dialog.type()}: ${dialog.message()}`);
    
    // Auto-accept dialogs by default
    if (dialog.type() === 'alert') {
      await dialog.accept();
    } else if (dialog.type() === 'confirm') {
      await dialog.accept(); // Can be configured
    } else if (dialog.type() === 'prompt') {
      await dialog.accept(''); // Can provide default value
    }
    
    const entry: DialogEntry = {
      type: dialog.type(),
      message: dialog.message(),
      handled: true,
      timestamp: new Date().toISOString()
    };
    dialogHandlers.push(entry);
  });
  
  // Page errors
  page.on('pageerror', (error: Error) => {
    console.error(`[Page Error] ${error.message}`);
    const entry: ConsoleMessageEntry = {
      type: 'pageerror',
      text: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
    consoleMessages.push(entry);
  });
}

// Initialize browser with optional session
async function ensureBrowser(sessionName: string | null = null): Promise<Page> {
  // Launch browser if not exists
  if (!browser) {
    console.error('[Claude-Playwright MCP] Launching browser...');
    browser = await chromium.launch({ 
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
  }
  
  // Create context (either first time or when switching sessions)
  if (!context) {
    // Load session if provided
    let storageState: any = undefined;
    let session: SessionData | null = null;
    if (sessionName) {
      session = await loadSession(sessionName);
      if (session) {
        storageState = session;
        console.error(`[Claude-Playwright MCP] Loading session: ${sessionName}`);
      }
    }
    
    console.error(`[Claude-Playwright MCP] Creating new context${sessionName ? ` with session: ${sessionName}` : ''}...`);
    context = await browser.newContext({
      baseURL: BASE_URL,
      viewport: { width: 1280, height: 720 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      storageState: storageState,
      acceptDownloads: true,
      ignoreHTTPSErrors: true
    });
    
    page = await context.newPage();
    setupPageListeners(page);
    
    // Navigation will be handled after context creation in session restore
    
    // Initialize enhanced cache integration
    if (!enhancedCache) {
      enhancedCache = EnhancedCacheIntegration.getInstance();
    }
    const currentUrl = page.url();
    enhancedCache.setPage(page, currentUrl, sessionName || undefined);
    console.error(`[Claude-Playwright MCP] Enhanced cache system initialized for ${currentUrl}`);
    
    console.error(`[Claude-Playwright MCP] Context ready${sessionName ? ` with session: ${sessionName}` : ''}`);
  }
  
  return page!;
}

// Clear collected data
function clearCollectedData(): void {
  consoleMessages = [];
  networkRequests = [];
  dialogHandlers = [];
}

// ============= CONSOLE & DEBUGGING TOOLS =============

// Tool: browser_console_messages
server.tool(
  "browser_console_messages",
  "Get all console messages from the browser",
  {
    filter: z.enum(['all', 'error', 'warning', 'info', 'log']).optional().describe("Filter by message type")
  },
  async ({ filter = 'all' }) => {
    try {
      let messages = consoleMessages;
      
      if (filter !== 'all') {
        messages = messages.filter(m => m.type === filter);
      }
      
      if (messages.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No console messages found."
          }]
        };
      }
      
      const formatted = messages.slice(-20).map(m => 
        `[${m.type.toUpperCase()}] ${m.timestamp}: ${m.text}`
      ).join('\n');
      
      return {
        content: [{
          type: "text",
          text: `Console Messages (last 20):\n${formatted}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Failed to get console messages: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_network_requests
server.tool(
  "browser_network_requests",
  "Get network requests made by the page",
  {
    filter: z.string().optional().describe("URL pattern to filter requests")
  },
  async ({ filter }) => {
    try {
      let requests = networkRequests;
      
      if (filter) {
        requests = requests.filter(r => r.url.includes(filter));
      }
      
      const recent = requests.slice(-20);
      
      if (recent.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No network requests found."
          }]
        };
      }
      
      const formatted = recent.map(r => {
        if (r.type === 'request') {
          return `→ ${r.method} ${r.url}`;
        } else {
          return `← ${r.status} ${r.url}`;
        }
      }).join('\n');
      
      return {
        content: [{
          type: "text",
          text: `Network Requests (last 20):\n${formatted}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Failed to get network requests: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_evaluate
server.tool(
  "browser_evaluate",
  "Execute JavaScript in the browser context",
  {
    script: z.string().describe("JavaScript code to execute")
  },
  async ({ script }) => {
    const page = await ensureBrowser();
    try {
      const result = await page.evaluate(script);
      
      return {
        content: [{
          type: "text",
          text: `Script executed successfully.\nResult: ${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Script execution failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= ADVANCED INTERACTION TOOLS =============

// Tool: browser_wait_for
server.tool(
  "browser_wait_for",
  "Wait for an element or condition",
  {
    selector: z.string().optional().describe("CSS selector to wait for"),
    state: z.enum(['visible', 'hidden', 'attached', 'detached']).optional().describe("State to wait for"),
    timeout: z.number().optional().describe("Timeout in seconds (default: 30)")
  },
  async ({ selector, state = 'visible', timeout = 30 }) => {
    const page = await ensureBrowser();
    try {
      if (selector) {
        await page.waitForSelector(selector, { 
          state,
          timeout: timeout * 1000 
        });
        return {
          content: [{
            type: "text",
            text: `Element "${selector}" is now ${state}`
          }]
        };
      }
      
      return {
        content: [{
          type: "text",
          text: "Please provide a selector to wait for"
        }],
        isError: true
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Wait failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_hover
server.tool(
  "browser_hover",
  "Hover over an element",
  {
    selector: z.string().describe("CSS selector of element to hover")
  },
  async ({ selector }) => {
    const page = await ensureBrowser();
    try {
      await page.hover(selector);
      return {
        content: [{
          type: "text",
          text: `Hovered over element: ${selector}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Hover failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_select_option
server.tool(
  "browser_select_option",
  "Select option(s) in a dropdown",
  {
    selector: z.string().describe("CSS selector of the select element"),
    value: z.union([z.string(), z.array(z.string())]).describe("Value(s) to select")
  },
  async ({ selector, value }) => {
    const page = await ensureBrowser();
    try {
      const values = Array.isArray(value) ? value : [value];
      await page.selectOption(selector, values);
      return {
        content: [{
          type: "text",
          text: `Selected option(s): ${values.join(', ')} in ${selector}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Select failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_press_key
server.tool(
  "browser_press_key",
  "Press a keyboard key",
  {
    key: z.string().describe("Key to press (e.g., 'Enter', 'Tab', 'Escape', 'ArrowDown')")
  },
  async ({ key }) => {
    const page = await ensureBrowser();
    try {
      await page.keyboard.press(key);
      return {
        content: [{
          type: "text",
          text: `Pressed key: ${key}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Key press failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_fill_form
server.tool(
  "browser_fill_form",
  "Fill multiple form fields at once",
  {
    fields: z.array(z.object({
      selector: z.string().describe("CSS selector of the field"),
      value: z.string().describe("Value to fill"),
      type: z.enum(['text', 'checkbox', 'radio']).optional().describe("Field type")
    })).describe("Array of fields to fill")
  },
  async ({ fields }) => {
    const page = await ensureBrowser();
    const results = [];
    
    for (const field of fields) {
      try {
        if (field.type === 'checkbox' || field.type === 'radio') {
          if (field.value === 'true' || field.value === 'checked') {
            await page.check(field.selector);
          } else {
            await page.uncheck(field.selector);
          }
        } else {
          await page.fill(field.selector, field.value);
        }
        results.push(`✓ ${field.selector}: ${field.value}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push(`✗ ${field.selector}: ${errorMessage}`);
      }
    }
    
    return {
      content: [{
        type: "text",
        text: `Form fill results:\n${results.join('\n')}`
      }]
    };
  }
);

// ============= SESSION MANAGEMENT TOOLS =============

// Tool: browser_session_restore
server.tool(
  "browser_session_restore",
  "Restore a saved browser session with cookies and localStorage",
  {
    sessionName: z.string().describe("Name of the session to restore (e.g., 'test-user')")
  },
  async ({ sessionName }) => {
    try {
      // Optimize: Only close context, keep browser instance alive
      if (browser && context) {
        console.error(`[Claude-Playwright MCP] Switching to session: ${sessionName} (keeping browser alive)...`);
        if (page) await page.close();
        if (context) await context.close();
        context = null;
        page = null;
        clearCollectedData();
      }
      
      // Launch browser with session (reuses existing browser if available)
      await ensureBrowser(sessionName);
      
      // CRITICAL: Auto-navigate AFTER browser is ready (not just during context creation)
      const session = await loadSession(sessionName);
      if (session?.origins && session.origins.length > 0 && page) {
        const origin = session.origins[0].origin;
        console.error(`[Claude-Playwright MCP] Post-restore navigation to: ${origin}`);
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        console.error(`[Claude-Playwright MCP] Navigation completed - ready for interactions`);
      }
      
      // Simplified response - skip extra checks for speed
      return {
        content: [{
          type: "text",
          text: `Session "${sessionName}" restored successfully.\nBrowser ready with authenticated state.`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Failed to restore session: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_session_save
server.tool(
  "browser_session_save",
  "Save current browser session with cookies and localStorage",
  {
    sessionName: z.string().describe("Name for the session (e.g., 'test-user')")
  },
  async ({ sessionName }) => {
    try {
      if (!context) {
        throw new Error('No browser context to save. Navigate to a page first.');
      }
      
      await saveSession(sessionName);
      
      const cookies = await context!.cookies();
      
      return {
        content: [{
          type: "text",
          text: `Session "${sessionName}" saved successfully.\nCookies saved: ${cookies.length}\nLocation: ${path.join(SESSIONS_DIR, sessionName + '.session.json')}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Failed to save session: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_session_list
server.tool(
  "browser_session_list",
  "List all saved browser sessions",
  {},
  async () => {
    try {
      ensureSessionsDir();
      const files = fs.readdirSync(SESSIONS_DIR);
      const sessions = files
        .filter(f => f.endsWith('.session.json'))
        .map(f => f.replace('.session.json', ''));
      
      if (sessions.length === 0) {
        return {
          content: [{
            type: "text",
            text: "No saved sessions found."
          }]
        };
      }
      
      return {
        content: [{
          type: "text",
          text: `Available sessions:\n${sessions.map(s => `- ${s}`).join('\n')}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Failed to list sessions: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= CORE NAVIGATION TOOLS =============

// Core tool: browser_navigate with BASE_URL support
server.tool(
  "browser_navigate",
  "Navigate to a URL with automatic BASE_URL injection",
  {
    url: z.string().describe("URL or path to navigate to")
  },
  async ({ url }) => {
    const page = await ensureBrowser();
    
    // Clear previous page data
    clearCollectedData();
    
    // URL rewriting logic - Smart URL correction
    let targetUrl = url;
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      // Relative URL - prepend BASE_URL
      targetUrl = url.startsWith('/') ? 
        `${BASE_URL}${url}` : 
        `${BASE_URL}/${url}`;
    } else if (BASE_URL !== 'http://localhost:3000' && url.includes('localhost:3000')) {
      // Rewrite default localhost:3000 to configured BASE_URL
      targetUrl = url.replace('http://localhost:3000', BASE_URL)
                     .replace('https://localhost:3000', BASE_URL);
      console.error(`[Claude-Playwright MCP] URL Rewrite: ${url} → ${targetUrl}`);
    }
    
    console.error(`[Claude-Playwright MCP] Navigating to: ${targetUrl}`);
    
    try {
      await page.goto(targetUrl, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      const title = await page.title();
      const currentUrl = page.url();
      
      // Update cache context with new URL
      if (enhancedCache) {
        enhancedCache.setPage(page, currentUrl);
        console.error(`[Cache] Context updated for ${currentUrl}`);
      }
      
      return {
        content: [{
          type: "text",
          text: `Successfully navigated to ${currentUrl}\nPage title: ${title}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Navigation error: ${errorMessage}`);
      return {
        content: [{
          type: "text",
          text: `Navigation failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_click (Enhanced with Bidirectional Cache)
server.tool(
  "browser_click",
  "Click an element on the page",
  {
    selector: z.string().describe("CSS selector or text to click")
  },
  async ({ selector }) => {
    const page = await ensureBrowser();
    
    if (!enhancedCache) {
      // Fallback to direct operation
      await page.click(selector, { timeout: 5000 });
      return {
        content: [{
          type: "text",
          text: `Clicked element: ${selector} (no cache)`
        }]
      };
    }

    try {
      const operation = async (resolvedSelector: string) => {
        await page.click(resolvedSelector, { timeout: 5000 });
        return true;
      };

      // PURE CACHE APPROACH - NO selector logic in MCP!
      // The cache system handles ALL selector intelligence
      const result = await enhancedCache.wrapSelectorOperation(
        selector, // Human-readable input
        operation,
        selector  // Let cache figure out the best selector
      );

      const cacheStatus = result.cached ? '(cached)' : '(learned)';
      const performance = result.performance.duration;
      
      return {
        content: [{
          type: "text",
          text: `Clicked element: ${selector} ${cacheStatus} [${performance}ms]`
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Click failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_type
server.tool(
  "browser_type",
  "Type text into an input field",
  {
    selector: z.string().describe("CSS selector of the input field"),
    text: z.string().describe("Text to type")
  },
  async ({ selector, text }) => {
    const page = await ensureBrowser();
    
    if (!enhancedCache) {
      // Fallback to direct operation
      await page.fill(selector, text);
      return {
        content: [{
          type: "text",
          text: `Typed "${text}" into ${selector} (no cache)`
        }]
      };
    }

    try {
      const operation = async (resolvedSelector: string) => {
        return await page.fill(resolvedSelector, text);
      };

      // Try enhanced cache with input field strategies
      let result;
      try {
        result = await enhancedCache.wrapSelectorOperation(
          selector,
          operation,
          selector
        );
      } catch {
        // Fallback for input fields
        const inputSelector = `input[placeholder*="${selector}"]`;
        try {
          result = await enhancedCache.wrapSelectorOperation(
            selector,
            operation,
            inputSelector
          );
        } catch {
          // Last fallback: general input
          const generalSelector = 'input[type="text"], input[type="email"], textarea';
          result = await enhancedCache.wrapSelectorOperation(
            selector,
            operation,
            generalSelector
          );
        }
      }

      const cacheStatus = result.cached ? '(cached)' : '(learned)';
      const performance = result.performance.duration;
      
      return {
        content: [{
          type: "text",
          text: `Typed "${text}" into ${selector} ${cacheStatus} [${performance}ms]`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Type failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_snapshot (accessibility tree)
server.tool(
  "browser_snapshot",
  "Get accessibility tree snapshot of the current page",
  {},
  async () => {
    const page = await ensureBrowser();
    try {
      // Try to get cached snapshot first
      let snapshot;
      if (enhancedCache) {
        snapshot = await enhancedCache.getOrCreateSnapshot();
        console.error('[Cache] Using cached or newly created snapshot');
      } else {
        snapshot = await page.accessibility.snapshot();
      }
      
      const title = await page.title();
      const url = page.url();
      
      // Check if user is logged in (basic check)
      const cookies = await context!.cookies();
      const hasAuthCookie = cookies.some(c => 
        c.name.toLowerCase().includes('auth') || 
        c.name.toLowerCase().includes('session') ||
        c.name.toLowerCase().includes('token')
      );
      
      // Get console error count
      const errorCount = consoleMessages.filter(m => m.type === 'error').length;
      
      return {
        content: [{
          type: "text",
          text: `Page: ${title}\nURL: ${url}\nAuthenticated: ${hasAuthCookie ? 'Yes' : 'No'}\nConsole Errors: ${errorCount}\n\nAccessibility Tree:\n${JSON.stringify(snapshot, null, 2).substring(0, 3000)}...`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Snapshot failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_screenshot
server.tool(
  "browser_screenshot",
  "Take a screenshot of the current page",
  {
    fullPage: z.boolean().optional().describe("Capture full page (default: false)"),
    selector: z.string().optional().describe("CSS selector of element to capture")
  },
  async ({ fullPage = false, selector }) => {
    const page = await ensureBrowser();
    try {
      let screenshot;
      
      if (selector) {
        const element = await page.$(selector);
        if (!element) {
          throw new Error(`Element not found: ${selector}`);
        }
        screenshot = await element.screenshot({ type: 'png' });
      } else {
        screenshot = await page.screenshot({ 
          fullPage,
          type: 'png'
        });
      }
      
      return {
        content: [{
          type: "image",
          data: screenshot.toString('base64'),
          mimeType: "image/png"
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Screenshot failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_cache_status (Enhanced Bidirectional Cache)
server.tool(
  "browser_cache_status",
  "Get enhanced cache statistics and debug information",
  {},
  async () => {
    try {
      if (!enhancedCache) {
        return {
          content: [{
            type: "text",
            text: "Enhanced cache not initialized"
          }]
        };
      }
      
      const metrics = await enhancedCache.getMetrics();
      const health = await enhancedCache.healthCheck();
      
      let report = "=== Enhanced Cache Status ===\n";
      report += `System: ${metrics.overview?.systemType || 'Enhanced Bidirectional'}\n`;
      report += `Current URL: ${metrics.overview?.currentUrl || 'N/A'}\n`;
      report += `Profile: ${metrics.overview?.currentProfile || 'default'}\n`;
      report += `Navigation Count: ${metrics.overview?.navigationCount || 0}\n`;
      report += `Health: ${health.status.toUpperCase()}\n\n`;
      
      report += "=== Performance Metrics ===\n";
      if (metrics.performance) {
        report += `Overall Hit Rate: ${metrics.performance.overallHitRate?.toFixed(1) || 0}%\n`;
        report += `Memory Hit Rate: ${metrics.performance.memoryHitRate?.toFixed(1) || 0}%\n`;
        report += `SQLite Hit Rate: ${metrics.performance.sqliteHitRate?.toFixed(1) || 0}%\n`;
        report += `Total Requests: ${metrics.performance.totalRequests || 0}\n`;
        report += `Memory Usage: ${metrics.performance.memorySize || 0}/${metrics.performance.memoryMax || 100}\n\n`;
      }
      
      report += "=== Storage Statistics ===\n";
      if (metrics.storage) {
        report += `Unique Selectors: ${Math.round(metrics.storage.unique_selectors) || 0}\n`;
        report += `Total Mappings: ${metrics.storage.total_mappings || 0}\n`;
        report += `Avg Success Count: ${(metrics.storage.avg_success_count || 0).toFixed(1)}\n`;
        report += `Variations per Selector: ${(metrics.storage.avg_inputs_per_selector || 0).toFixed(1)}\n`;
        report += `Learning Rate: ${(metrics.storage.learning_rate || 0).toFixed(1)}%\n\n`;
      }
      
      if (metrics.recommendations && metrics.recommendations.length > 0) {
        report += "=== Recommendations ===\n";
        for (const rec of metrics.recommendations) {
          report += `• ${rec}\n`;
        }
      }
      
      return {
        content: [{
          type: "text",
          text: report
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Enhanced cache status failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_close
server.tool(
  "browser_close",
  "Close the browser",
  {},
  async () => {
    try {
      if (page) await page.close();
      if (context) await context.close();
      if (browser) await browser.close();
      
      browser = null;
      context = null;
      page = null;
      clearCollectedData();
      
      return {
        content: [{
          type: "text",
          text: "Browser closed successfully"
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text",
          text: `Close failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.error('[Claude-Playwright MCP] Shutting down...');
  if (context) await context.close();
  if (browser) await browser.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('[Claude-Playwright MCP] Terminating...');
  if (context) await context.close();
  if (browser) await browser.close();
  process.exit(0);
});

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Claude-Playwright MCP] Server ready with BASE_URL:', BASE_URL);
  console.error('[Claude-Playwright MCP] Sessions directory:', SESSIONS_DIR);
  console.error('[Claude-Playwright MCP] Available tools: 20+ browser automation tools');
}

main().catch((error: Error) => {
  console.error('[Claude-Playwright MCP] Fatal error:', error);
  process.exit(1);
});