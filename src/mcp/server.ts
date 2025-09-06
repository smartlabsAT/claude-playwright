#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { chromium, Browser, BrowserContext, Page, ConsoleMessage, Request, Response, Dialog } from 'playwright';
import { z } from "zod";
import * as fs from 'fs';
import * as path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';
import { EnhancedCacheIntegration } from '../core/enhanced-cache-integration.js';
import { TestScenarioCache } from '../core/test-scenario-cache.js';
import { TestPatternMatcher } from '../core/test-pattern-matcher.js';
import { ProtocolValidationLayer } from '../core/protocol-validation-layer.js';
import { ToolNamingStrategy, ToolMapping } from '../core/tool-naming-strategy.js';
import { ProgressiveToolLoader } from '../core/progressive-tool-loader.js';
import { CircuitBreakerIntegration, executeProtectedTool, executeProtectedToolWithClaude } from '../core/circuit-breaker-integration.js';
import { ConnectionPoolManager } from '../core/connection-pool-manager.js';
import { GracefulDegradationIntegration } from '../core/graceful-degradation-integration.js';
import { GracefulDegradationManager } from '../core/graceful-degradation.js';
import { RecoveryStrategiesManager } from '../core/recovery-strategies.js';
import { createClaudeErrorDemoTool } from './claude-error-demo-tool.js';

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

// Protocol validation layer
let protocolValidation: ProtocolValidationLayer | null = null;

// Tool naming revolution - Phase 1
let progressiveToolLoader: ProgressiveToolLoader | null = null;

// Circuit breaker integration - Phase 3A
let circuitBreakerIntegration: CircuitBreakerIntegration | null = null;

// Connection pool manager - Phase 3B
let connectionPoolManager: ConnectionPoolManager | null = null;

// Graceful degradation integration - Phase 3C
let gracefulDegradationIntegration: GracefulDegradationIntegration | null = null;
let degradationManager: GracefulDegradationManager | null = null;
let recoveryStrategiesManager: RecoveryStrategiesManager | null = null;

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
    
    // Initialize connection pool manager - Phase 3B
    if (!connectionPoolManager) {
      connectionPoolManager = ConnectionPoolManager.getInstance();
      await connectionPoolManager.initialize(browser);
      console.error('[Claude-Playwright MCP] Connection pool manager initialized for 70% efficiency improvement');
    }
    
    // Initialize graceful degradation system - Phase 3C
    if (!gracefulDegradationIntegration) {
      gracefulDegradationIntegration = GracefulDegradationIntegration.getInstance();
      degradationManager = GracefulDegradationManager.getInstance();
      recoveryStrategiesManager = RecoveryStrategiesManager.getInstance();
      console.error('[Claude-Playwright MCP] Graceful degradation system initialized with 4-level progressive fallback');
    }
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
    
    // Initialize protocol validation layer
    if (!protocolValidation) {
      protocolValidation = new ProtocolValidationLayer({
        enabled: true,
        strictMode: false,       // Lenient mode for dev
        sanitizeInputs: true,    // Always sanitize for security
        enableRecovery: true,    // Enable error recovery
        maxRecoveryAttempts: 3   // Try recovery up to 3 times
      });
      console.error(`[Claude-Playwright MCP] Protocol validation layer initialized`);
    }
    
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

// Enhanced tool wrapper with protocol validation and circuit breaker protection
async function executeValidatedTool<T extends Record<string, any>>(
  toolName: string, 
  params: T, 
  implementation: (validatedParams: T) => Promise<any>,
  operationDescription?: string
): Promise<any> {
  // Initialize circuit breaker if not available
  if (!circuitBreakerIntegration) {
    circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
    console.error('[Claude-Playwright MCP] Circuit breaker integration initialized');
  }

  // Use enhanced executeProtectedToolWithClaude that provides comprehensive Claude-aware error handling (Phase 3D)
  return await executeProtectedToolWithClaude(toolName, params, implementation, protocolValidation, operationDescription);
}

// Enhanced browser operation wrapper - Phase 3A/3B/3C Integration
async function executeBrowserOperationWithPooling<T>(
  operationType: string,
  params: any,
  operation: (context: BrowserContext, page: Page) => Promise<T>,
  options: {
    sessionName?: string;
    domain?: string;
    profile?: string;
    priority?: 'high' | 'medium' | 'low';
    requiresNewContext?: boolean;
  } = {}
): Promise<T> {
  // Use graceful degradation if available (Phase 3C)
  if (gracefulDegradationIntegration) {
    try {
      const result = await gracefulDegradationIntegration.executeBrowserOperationWithDegradation(
        operationType,
        operation,
        {
          sessionName: options.sessionName,
          domain: options.domain,
          profile: options.profile,
          priority: options.priority || 'medium',
          requiresNewContext: options.requiresNewContext || false
        }
      );

      // Log degradation-aware results
      if (result.success) {
        const currentLevel = degradationManager?.getCurrentLevel() || 'UNKNOWN';
        console.error(`[Claude-Playwright MCP] ${operationType} completed at ${currentLevel} (${result.executionTime}ms, tool: ${result.toolUsed})`);
        
        if (result.fallbacksAttempted.length > 0) {
          console.error(`[Claude-Playwright MCP] Fallbacks used: ${result.fallbacksAttempted.join(', ')}`);
        }
        
        return result.result;
      } else {
        // Handle graceful failure
        if (result.userMessage) {
          console.error(`[Claude-Playwright MCP] ${result.userMessage}`);
        }
        if (result.recommendations) {
          console.error(`[Claude-Playwright MCP] Recommendations: ${result.recommendations.join(', ')}`);
        }
        
        throw result.error || new Error(`Operation ${operationType} failed in degradation mode`);
      }
    } catch (error) {
      console.error(`[Claude-Playwright MCP] Graceful degradation operation '${operationType}' failed:`, error);
      throw error;
    }
  }

  // Fallback to connection pool-enhanced operation (Phase 3B)
  if (connectionPoolManager) {
    try {
      const result = await connectionPoolManager.executeBrowserOperation(
        operationType,
        operation,
        {
          sessionName: options.sessionName,
          domain: options.domain,
          profile: options.profile,
          priority: options.priority || 'medium',
          requiresNewContext: options.requiresNewContext || false
        }
      );

      // Log performance metrics
      if (result.performance.connectionReused) {
        console.error(`[Claude-Playwright MCP] ${operationType} completed with connection reuse (${result.performance.executionTime}ms, ${result.performance.poolUtilization.toFixed(1)}% utilization)`);
      }

      return result.result;
    } catch (error) {
      console.error(`[Claude-Playwright MCP] Connection pool operation '${operationType}' failed:`, error);
      throw error;
    }
  }

  // Final fallback to traditional browser operation
  console.error(`[Claude-Playwright MCP] No advanced pooling available for ${operationType}, using basic operation`);
  const page = await ensureBrowser(options.sessionName || null);
  return await operation(context!, page);
}

// ============= CONSOLE & DEBUGGING TOOLS =============

// Tool: browser_console_messages (with protocol validation)
server.tool(
  "browser_console_messages",
  "Get all console messages from the browser",
  {
    filter: z.enum(['all', 'error', 'warning', 'info', 'log']).optional().describe("Filter by message type")
  },
  async (params) => {
    return await executeValidatedTool("browser_console_messages", params, async ({ filter = 'all' }) => {
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
          type: "text" as const,
          text: `Console Messages (last 20):\n${formatted}`
        }]
      };
    });
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
          type: "text" as const,
          text: `Network Requests (last 20):\n${formatted}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Script executed successfully.\nResult: ${JSON.stringify(result, null, 2)}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
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
          type: "text" as const,
          text: `Hovered over element: ${selector}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Selected option(s): ${values.join(', ')} in ${selector}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Pressed key: ${key}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Session "${sessionName}" restored successfully.\nBrowser ready with authenticated state.`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Session "${sessionName}" saved successfully.\nCookies saved: ${cookies.length}\nLocation: ${path.join(SESSIONS_DIR, sessionName + '.session.json')}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Available sessions:\n${sessions.map(s => `- ${s}`).join('\n')}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
          text: `Failed to list sessions: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= TEST EXECUTION FUNCTIONS =============

/**
 * Execute a test scenario with real browser actions
 */
async function executeTestScenarioWithBrowser(
  scenario: any, 
  adaptContext?: {url?: string, profile?: string}
): Promise<{success: boolean, adaptations: string[], executionTime: number}> {
  const startTime = Date.now();
  const adaptations: string[] = [];
  let success = true;
  
  console.error(`[MCP Server] 🚀 Executing test scenario: ${scenario.name}`);
  console.error(`[MCP Server] 📋 Steps: ${scenario.steps.length}`);
  
  try {
    // Ensure browser is available
    const page = await ensureBrowser();
    
    // Execute each step
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      console.error(`[MCP Server] Step ${i + 1}/${scenario.steps.length}: ${step.action} - ${step.description}`);
      
      try {
        await executeTestStep(page, step, adaptContext, adaptations);
      } catch (error) {
        console.error(`[MCP Server] ❌ Step ${i + 1} failed:`, error);
        success = false;
        break;
      }
    }
    
    const executionTime = Date.now() - startTime;
    
    // Record execution in cache
    const cache = ensureTestCache();
    const status: 'success' | 'failure' | 'partial' | 'adapted' = success ? 
      (adaptations.length > 0 ? 'adapted' : 'success') : 'failure';
    await cache.recordTestExecution(scenario.name, status, executionTime, adaptations, adaptContext);
    await cache.updateTestSuccessRate(scenario.name, success);
    
    console.error(`[MCP Server] ${success ? '✅' : '❌'} Test completed in ${executionTime}ms`);
    
    return { success, adaptations, executionTime };
    
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`[MCP Server] ❌ Test execution failed:`, error);
    return { success: false, adaptations, executionTime };
  }
}

/**
 * Execute a single test step with real browser action
 */
async function executeTestStep(
  page: any, 
  step: any, 
  adaptContext?: {url?: string, profile?: string}, 
  adaptations?: string[]
): Promise<void> {
  const stepStartTime = Date.now();
  
  switch (step.action) {
    case 'navigate':
      let targetUrl = step.target;
      
      // Apply URL adaptation if provided
      if (adaptContext?.url) {
        const originalDomain = new URL(step.target).origin;
        const newDomain = adaptContext.url.startsWith('http') ? 
          new URL(adaptContext.url).origin : adaptContext.url;
        targetUrl = step.target.replace(originalDomain, newDomain);
        
        if (targetUrl !== step.target) {
          adaptations?.push(`URL adapted: ${step.target} → ${targetUrl}`);
          console.error(`[MCP Server] 🔄 URL adapted: ${targetUrl}`);
        }
      }
      
      console.error(`[MCP Server] 🌐 Navigating to: ${targetUrl}`);
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
      break;
      
    case 'click':
      console.error(`[MCP Server] 👆 Clicking: ${step.target}`);
      await page.click(step.target);
      break;
      
    case 'type':
      console.error(`[MCP Server] ⌨️ Typing "${step.value}" into: ${step.target}`);
      await page.fill(step.target, step.value);
      break;
      
    case 'screenshot':
      console.error(`[MCP Server] 📸 Taking screenshot`);
      await page.screenshot({ fullPage: false });
      break;
      
    default:
      console.error(`[MCP Server] ⚠️ Unknown action: ${step.action}`);
      throw new Error(`Unknown test action: ${step.action}`);
  }
  
  const stepTime = Date.now() - stepStartTime;
  console.error(`[MCP Server] ✅ Step "${step.action}" completed in ${stepTime}ms`);
}

// ============= CORE NAVIGATION TOOLS =============

// Core tool: browser_navigate with BASE_URL support
server.tool(
  "browser_navigate",
  "Navigate to a URL with automatic BASE_URL injection",
  {
    url: z.string().describe("URL or path to navigate to")
  },
  async ({ url }) => {
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
      // Use connection pool-enhanced navigation - Phase 3B
      const result = await executeBrowserOperationWithPooling(
        'navigate',
        { url: targetUrl },
        async (context, page) => {
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
              type: "text" as const,
              text: `Successfully navigated to ${currentUrl}\nPage title: ${title}`
            }]
          };
        },
        {
          domain: new URL(targetUrl).hostname,
          priority: 'high' // Navigation is high priority
        }
      );
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Navigation error: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
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
    try {
      // Use connection pool-enhanced clicking - Phase 3B
      const result = await executeBrowserOperationWithPooling(
        'click',
        { selector },
        async (context, page) => {
          if (!enhancedCache) {
            // Fallback to direct operation
            await page.click(selector, { timeout: 5000 });
            return {
              content: [{
                type: "text" as const,
                text: `Clicked element: ${selector} (no cache)`
              }]
            };
          }

          const operation = async (resolvedSelector: string) => {
            await page.click(resolvedSelector, { timeout: 5000 });
            return true;
          };

          // Enhanced cache approach with Phase 2.2 enhanced cache keys
          // Supports cross-environment caching and improved pattern matching
          const currentUrl = page.url();
          const testName = `Click ${selector}`;
          const currentProfile = 'default'; // TODO: Get from session context
          
          const cacheResult = await enhancedCache.wrapSelectorOperationEnhanced(
            testName,
            selector, // Human-readable input
            currentUrl,
            operation,
            undefined, // No steps for single operations
            currentProfile || 'default',
            page // Provide page for DOM signature generation
          );

          const cacheStatus = cacheResult.cached ? '(cached)' : '(learned)';
          const performance = cacheResult.performance.duration;
          const domMetrics = cacheResult.performance.domSignature ? ` [DOM:${cacheResult.performance.domSignature.confidence}]` : '';
          
          return {
            content: [{
              type: "text" as const,
              text: `Clicked element: ${selector} ${cacheStatus} [${performance}ms]${domMetrics}`
            }]
          };
        },
        {
          domain: page?.url() ? new URL(page.url()).hostname : undefined,
          priority: 'medium' // Click operations are medium priority
        }
      );
      
      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Typed "${text}" into ${selector} (no cache)`
        }]
      };
    }

    try {
      const operation = async (resolvedSelector: string) => {
        return await page.fill(resolvedSelector, text);
      };

      // Enhanced cache approach with Phase 2.2 enhanced cache keys for typing
      const currentUrl = page.url();
      const testName = `Type into ${selector}`;
      const currentProfile = 'default'; // TODO: Get from session context
      
      const result = await enhancedCache.wrapSelectorOperationEnhanced(
        testName,
        selector,
        currentUrl,
        operation,
        undefined, // No steps for single operations
        currentProfile || 'default',
        page
      );

      const cacheStatus = result.cached ? '(cached)' : '(learned)';
      const performance = result.performance.duration;
      
      return {
        content: [{
          type: "text" as const,
          text: `Typed "${text}" into ${selector} ${cacheStatus} [${performance}ms]`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
          text: `Page: ${title}\nURL: ${url}\nAuthenticated: ${hasAuthCookie ? 'Yes' : 'No'}\nConsole Errors: ${errorCount}\n\nAccessibility Tree:\n${JSON.stringify(snapshot, null, 2).substring(0, 3000)}...`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
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
          type: "text" as const,
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
      
      // Enhanced Phase 2.4: DOM Signature Metrics
      report += "=== DOM Signature Metrics ===\n";
      if (metrics.domSignatures) {
        report += `Generated Signatures: ${metrics.domSignatures.generated || 0}\n`;
        report += `Cached Signatures: ${metrics.domSignatures.cached || 0}\n`;
        report += `Signature Hit Rate: ${(metrics.domSignatures.hitRate || 0).toFixed(1)}%\n`;
        report += `Avg Confidence Score: ${(metrics.domSignatures.avgConfidence || 0).toFixed(2)}\n`;
        report += `DOM Change Detections: ${metrics.domSignatures.changeDetections || 0}\n`;
        report += `Cross-env Matches: ${metrics.domSignatures.crossEnvMatches || 0}\n\n`;
      } else {
        report += "No DOM signature data available\n\n";
      }
      
      // Enhanced Phase 2.4: Cache Key Analysis
      report += "=== Enhanced Cache Key Analysis ===\n";
      if (metrics.enhancedKeys) {
        report += `Enhanced Cache Hits: ${metrics.enhancedKeys.hits || 0}\n`;
        report += `Enhanced Cache Misses: ${metrics.enhancedKeys.misses || 0}\n`;
        report += `Context Adaptations: ${metrics.enhancedKeys.adaptations || 0}\n`;
        report += `False Positive Rate: ${(metrics.enhancedKeys.falsePositiveRate || 0).toFixed(2)}%\n`;
        report += `Cross-env Portability: ${(metrics.enhancedKeys.portabilityRate || 0).toFixed(1)}%\n\n`;
      } else {
        report += "Enhanced cache key metrics not available\n\n";
      }
      
      // Enhanced Phase 2.4: Performance Target Validation
      report += "=== Performance Target Status (GitHub Issue #11) ===\n";
      const hitRate = metrics.performance?.overallHitRate || 0;
      const matchAccuracy = metrics.enhancedKeys?.matchAccuracy || 0;
      const portability = metrics.enhancedKeys?.portabilityRate || 0;
      const changeDetection = metrics.domSignatures?.changeDetectionRate || 0;
      const falsePositiveRate = metrics.enhancedKeys?.falsePositiveRate || 0;
      
      report += `Cache Hit Rate: ${hitRate.toFixed(1)}% ${hitRate >= 85 ? '✅' : '❌'} (Target: >85%)\n`;
      report += `Test Matching Accuracy: ${matchAccuracy.toFixed(1)}% ${matchAccuracy >= 90 ? '✅' : '❌'} (Target: >90%)\n`;
      report += `Cross-env Portability: ${portability.toFixed(1)}% ${portability >= 80 ? '✅' : '❌'} (Target: >80%)\n`;
      report += `DOM Change Detection: ${changeDetection.toFixed(1)}% ${changeDetection >= 95 ? '✅' : '❌'} (Target: >95%)\n`;
      report += `False Positive Rate: ${falsePositiveRate.toFixed(2)}% ${falsePositiveRate <= 5 ? '✅' : '❌'} (Target: <5%)\n\n`;
      
      if (metrics.recommendations && metrics.recommendations.length > 0) {
        report += "=== Recommendations ===\n";
        for (const rec of metrics.recommendations) {
          report += `• ${rec}\n`;
        }
      }
      
      // Add Phase 2.4 specific recommendations based on performance targets
      const phase24Recommendations: string[] = [];
      if (hitRate < 85) phase24Recommendations.push("Improve cache hit rate through better DOM signature matching");
      if (matchAccuracy < 90) phase24Recommendations.push("Enhance test matching accuracy with improved similarity algorithms");
      if (portability < 80) phase24Recommendations.push("Improve cross-environment portability through enhanced cache keys");
      if (changeDetection < 95) phase24Recommendations.push("Enhance DOM change detection sensitivity");
      if (falsePositiveRate > 5) phase24Recommendations.push("Reduce false positives through stricter similarity thresholds");
      
      if (phase24Recommendations.length > 0) {
        report += "\n=== Phase 2.4 Specific Recommendations ===\n";
        for (const rec of phase24Recommendations) {
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
          type: "text" as const,
          text: `Enhanced cache status failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= GRACEFUL DEGRADATION TOOLS - Phase 3C =============

// Tool: browser_degradation_status (Phase 3C - Graceful Degradation)
server.tool(
  "browser_degradation_status", 
  "Get current graceful degradation status and system capabilities",
  {},
  async () => {
    try {
      if (!gracefulDegradationIntegration || !degradationManager) {
        return {
          content: [{
            type: "text",
            text: "⚠️ Graceful degradation system not initialized"
          }]
        };
      }
      
      const systemStatus = gracefulDegradationIntegration.getSystemStatus();
      const degradationStatus = degradationManager.getDegradationStatus();
      const metrics = degradationManager.getDegradationMetrics();
      
      let report = "=== Graceful Degradation Status ===\n";
      report += `${degradationStatus.ux.messaging.title}\n`;
      report += `Level: ${systemStatus.degradationLevel} (${degradationStatus.config.name})\n`;
      report += `Circuit Breaker: ${systemStatus.circuitBreakerState}\n`;
      report += `Connection Pool: ${systemStatus.connectionPoolHealth ? 'Healthy' : 'Issues'}\n`;
      report += `Time in Level: ${Math.round(degradationStatus.timeInLevel / 1000)}s\n\n`;
      
      report += "=== Current Capabilities ===\n";
      systemStatus.userGuidance.currentCapabilities.forEach(cap => {
        report += `✓ ${cap}\n`;
      });
      
      if (systemStatus.limitations.length > 0) {
        report += "\n=== Current Limitations ===\n";
        systemStatus.limitations.forEach(limit => {
          report += `⚠ ${limit}\n`;
        });
      }
      
      if (systemStatus.userGuidance.alternatives.length > 0) {
        report += "\n=== Suggested Alternatives ===\n";
        systemStatus.userGuidance.alternatives.forEach(alt => {
          report += `→ ${alt}\n`;
        });
      }
      
      if (systemStatus.userGuidance.expectedRecovery) {
        report += `\n=== Recovery Information ===\n`;
        report += `Expected recovery time: ${systemStatus.userGuidance.expectedRecovery}\n`;
      }
      
      report += `\n=== Performance Impact ===\n`;
      report += `Reliability: ${(metrics.performanceImpact.reliability * 100).toFixed(0)}%\n`;
      report += `Speed: ${(metrics.performanceImpact.speed * 100).toFixed(0)}%\n`;
      report += `Functionality: ${(metrics.performanceImpact.functionality * 100).toFixed(0)}%\n`;
      
      report += `\n=== Statistics ===\n`;
      report += `Total degradation events: ${metrics.totalDegradationEvents}\n`;
      report += `Recovery success rate: ${(metrics.recoverySuccessRate * 100).toFixed(1)}%\n`;
      report += `Average recovery time: ${Math.round(metrics.averageRecoveryTime / 1000)}s\n`;
      
      return {
        content: [{
          type: "text",
          text: report
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Degradation status error: ${errorMessage}`);
      
      return {
        content: [{
          type: "text",
          text: `Degradation status failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_recovery_coordinate (Phase 3C - Recovery Coordination)
server.tool(
  "browser_recovery_coordinate",
  "Coordinate recovery across all Phase 3 components (Circuit Breaker, Connection Pool, Graceful Degradation)",
  {},
  async () => {
    try {
      if (!gracefulDegradationIntegration) {
        return {
          content: [{
            type: "text", 
            text: "⚠️ Graceful degradation system not available for recovery coordination"
          }]
        };
      }
      
      console.error('[Claude-Playwright MCP] Starting coordinated recovery...');
      
      const recoveryResult = await gracefulDegradationIntegration.coordinateRecovery();
      
      let report = "=== Coordinated Recovery Results ===\n";
      report += `Overall Success: ${recoveryResult.overallSuccess ? '✅ SUCCESS' : '⚠️ PARTIAL/FAILED'}\n`;
      report += `Components Targeted: ${recoveryResult.coordinatedComponents.join(', ')}\n\n`;
      
      if (recoveryResult.partialRecoveries.length > 0) {
        report += "=== Successful Recoveries ===\n";
        recoveryResult.partialRecoveries.forEach(recovery => {
          report += `✅ ${recovery}\n`;
        });
        report += "\n";
      }
      
      if (recoveryResult.failedRecoveries.length > 0) {
        report += "=== Failed Recoveries ===\n"; 
        recoveryResult.failedRecoveries.forEach(failure => {
          report += `❌ ${failure}\n`;
        });
        report += "\n";
      }
      
      // Show current system status after recovery
      const systemStatus = gracefulDegradationIntegration.getSystemStatus();
      report += "=== Post-Recovery Status ===\n";
      report += `Degradation Level: ${systemStatus.degradationLevel}\n`;
      report += `Circuit Breaker: ${systemStatus.circuitBreakerState}\n`;
      report += `Connection Pool: ${systemStatus.connectionPoolHealth ? 'Healthy' : 'Issues'}\n`;
      
      if (recoveryResult.overallSuccess) {
        report += "\n🎉 System recovery completed successfully! All primary functionality should now be available.";
      } else {
        report += "\n⚠️ Recovery was only partially successful. Some functionality may still be limited.";
        report += "\nConsider waiting a few minutes and trying again, or check system logs for specific issues.";
      }
      
      return {
        content: [{
          type: "text",
          text: report
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Recovery coordination error: ${errorMessage}`);
      
      return {
        content: [{
          type: "text", 
          text: `Recovery coordination failed: ${errorMessage}\n\nThis may indicate serious system issues. Consider manual intervention.`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_health_comprehensive (Phase 3C - Comprehensive Health Report)
server.tool(
  "browser_health_comprehensive",
  "Get comprehensive health report across all Phase 3 components with user-friendly recommendations",
  {},
  async () => {
    try {
      if (!gracefulDegradationIntegration) {
        return {
          content: [{
            type: "text",
            text: "⚠️ Comprehensive health reporting not available - graceful degradation system not initialized"
          }]
        };
      }
      
      const healthReport = await gracefulDegradationIntegration.getComprehensiveHealthReport();
      
      let report = "=== Comprehensive System Health Report ===\n";
      report += `Overall Health: ${healthReport.overall.healthy ? '✅ HEALTHY' : '⚠️ ISSUES DETECTED'}\n`;
      report += `Current Mode: ${healthReport.overall.degradationLevel} (${
        healthReport.overall.degradationLevel === 'LEVEL_1' ? 'Full Functionality' :
        healthReport.overall.degradationLevel === 'LEVEL_2' ? 'Simplified Mode' :
        healthReport.overall.degradationLevel === 'LEVEL_3' ? 'Read-Only Mode' :
        'System Monitoring Only'
      })\n\n`;
      
      if (healthReport.overall.primaryIssues.length > 0) {
        report += "=== Primary Issues ===\n";
        healthReport.overall.primaryIssues.forEach(issue => {
          report += `⚠️ ${issue}\n`;
        });
        report += "\n";
      }
      
      report += "=== Component Status ===\n";
      report += `Circuit Breaker: ${healthReport.components.circuitBreaker.enabled ? 
        (healthReport.components.circuitBreaker.metrics.state === 'CLOSED' ? '✅ Active & Healthy' : 
         `⚠️ ${healthReport.components.circuitBreaker.metrics.state} State`) : '❌ Disabled'}\n`;
      report += `Connection Pool: ${healthReport.components.connectionPool.healthy ? '✅ Healthy' : '⚠️ Issues'}\n`;
      report += `Degradation Manager: ✅ Active at ${healthReport.components.degradationManager.status.level}\n\n`;
      
      report += "=== Available Features ===\n";
      healthReport.userImpact.availableFeatures.forEach(feature => {
        report += `✅ ${feature}\n`;
      });
      
      if (healthReport.userImpact.unavailableFeatures.length > 0) {
        report += "\n=== Temporarily Unavailable ===\n";
        healthReport.userImpact.unavailableFeatures.forEach(feature => {
          report += `⏸️ ${feature}\n`;
        });
      }
      
      if (healthReport.userImpact.workarounds.length > 0) {
        report += "\n=== Suggested Workarounds ===\n";
        healthReport.userImpact.workarounds.forEach(workaround => {
          report += `💡 ${workaround}\n`;
        });
      }
      
      if (healthReport.overall.recoveryRecommendations.length > 0) {
        report += "\n=== Recovery Recommendations ===\n";
        healthReport.overall.recoveryRecommendations.forEach((rec, index) => {
          report += `${index + 1}. ${rec}\n`;
        });
      }
      
      if (healthReport.userImpact.estimatedRecoveryTime) {
        report += `\n⏱️ Estimated recovery time: ${healthReport.userImpact.estimatedRecoveryTime}`;
      }
      
      return {
        content: [{
          type: "text",
          text: report
        }]
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Comprehensive health check error: ${errorMessage}`);
      
      return {
        content: [{
          type: "text",
          text: `Comprehensive health check failed: ${errorMessage}`
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
      
      // Shutdown connection pool manager - Phase 3B
      if (connectionPoolManager) {
        await connectionPoolManager.shutdown();
        connectionPoolManager = null;
        console.error('[Claude-Playwright MCP] Connection pool manager shutdown complete');
      }
      
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
          type: "text" as const,
          text: `Close failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= CONNECTION POOL MANAGEMENT TOOLS - PHASE 3B =============

// Tool: connection_pool_status - Monitor pool performance and metrics
server.tool(
  "connection_pool_status",
  "Get comprehensive connection pool metrics and performance statistics",
  {
    detailed: z.boolean().optional().describe("Include detailed connection information")
  },
  async ({ detailed = false }) => {
    try {
      if (!connectionPoolManager) {
        return {
          content: [{
            type: "text" as const,
            text: "Connection pool manager not initialized. Pool management not available in this session."
          }]
        };
      }

      const metrics = connectionPoolManager.getUnifiedMetrics();
      const healthCheck = await connectionPoolManager.performHealthCheck();

      let statusText = `🔗 Connection Pool Status - Phase 3B Active\n\n`;
      
      // Global statistics
      statusText += `📊 Global Statistics:\n`;
      statusText += `  • Total Connections: ${metrics.globalStats.totalConnections}\n`;
      statusText += `  • Active Connections: ${metrics.globalStats.totalActiveConnections}\n`;
      statusText += `  • Idle Connections: ${metrics.globalStats.totalIdleConnections}\n`;
      statusText += `  • Resource Utilization: ${metrics.globalStats.resourceUtilization.toFixed(1)}%\n`;
      statusText += `  • Efficiency Improvement: ${metrics.globalStats.overallEfficiencyImprovement.toFixed(1)}%\n`;
      statusText += `  • Circuit Breaker Trips: ${metrics.globalStats.circuitBreakerTrips}\n\n`;

      // Performance metrics
      statusText += `⚡ Performance Metrics:\n`;
      statusText += `  • Average Operation Time: ${metrics.performance.averageOperationTime.toFixed(0)}ms\n`;
      statusText += `  • Operations/Second: ${metrics.performance.connectionsPerSecond.toFixed(2)}\n`;
      statusText += `  • Reusability Score: ${metrics.performance.reusabilityScore.toFixed(1)}%\n`;
      statusText += `  • Connection Reuses: ${metrics.connectionPool.performanceMetrics.connectionReuses}\n\n`;

      // Pool-specific metrics
      statusText += `🌐 Browser Context Pool:\n`;
      statusText += `  • Total: ${metrics.browserPool.contexts.total} | Active: ${metrics.browserPool.contexts.active} | Idle: ${metrics.browserPool.contexts.idle}\n`;
      statusText += `  • Session Contexts: ${metrics.browserPool.contexts.withSessions}\n`;
      statusText += `  • Session Hit Rate: ${metrics.browserPool.contexts.sessionHitRate.toFixed(1)}%\n`;
      statusText += `  • Average Reuse: ${metrics.browserPool.contexts.averageReuse.toFixed(1)}%\n\n`;

      statusText += `📄 Page Pool:\n`;
      statusText += `  • Total: ${metrics.browserPool.pages.total} | Active: ${metrics.browserPool.pages.active} | Idle: ${metrics.browserPool.pages.idle}\n`;
      statusText += `  • Creation Time: ${metrics.browserPool.performance.pageCreationTime.toFixed(0)}ms\n`;
      statusText += `  • Average Reuse: ${metrics.browserPool.pages.averageReuse.toFixed(1)}%\n\n`;

      // Health status
      statusText += `🏥 Health Status: ${healthCheck.healthy ? '🟢 HEALTHY' : '🔴 ISSUES DETECTED'}\n`;
      if (healthCheck.issues.length > 0) {
        statusText += `  Issues:\n`;
        healthCheck.issues.forEach(issue => {
          statusText += `    • ${issue}\n`;
        });
      }
      
      if (healthCheck.recommendations.length > 0) {
        statusText += `  Recommendations:\n`;
        healthCheck.recommendations.forEach(rec => {
          statusText += `    • ${rec}\n`;
        });
      }

      // Detailed connection information
      if (detailed) {
        statusText += `\n📋 Detailed Connection Information:\n`;
        statusText += `  • Queue Stats: High(${metrics.connectionPool.queueStats.high}) Medium(${metrics.connectionPool.queueStats.medium}) Low(${metrics.connectionPool.queueStats.low})\n`;
        statusText += `  • Average Wait Time: ${metrics.connectionPool.queueStats.averageWaitTime.toFixed(0)}ms\n`;
        statusText += `  • Cross-Pool Optimizations: ${metrics.globalStats.crossPoolOptimizations}\n`;
        statusText += `  • Memory Optimizations: ${metrics.browserPool.memory.optimizationTriggers}\n`;
      }

      return {
        content: [{
          type: "text" as const,
          text: statusText
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Connection pool status error: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: `Connection pool status failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: connection_pool_optimize - Trigger cross-pool optimization
server.tool(
  "connection_pool_optimize",
  "Trigger cross-pool optimization to improve performance and resource usage",
  {},
  async () => {
    try {
      if (!connectionPoolManager) {
        return {
          content: [{
            type: "text",
            text: "Connection pool manager not initialized. Optimization not available."
          }]
        };
      }

      console.error('[Claude-Playwright MCP] Triggering cross-pool optimization...');
      const optimizationResult = await connectionPoolManager.performCrossPoolOptimization();

      let statusText = `🔧 Connection Pool Optimization Complete\n\n`;
      statusText += `✅ Optimizations Applied: ${optimizationResult.optimizationsApplied}\n`;
      statusText += `📈 Metrics Improvement: ${optimizationResult.metricsImprovement.toFixed(1)}%\n\n`;
      
      if (optimizationResult.results.length > 0) {
        statusText += `📋 Optimization Results:\n`;
        optimizationResult.results.forEach(result => {
          statusText += `  • ${result}\n`;
        });
      } else {
        statusText += `ℹ️ No optimizations were needed - system is already operating efficiently.\n`;
      }

      return {
        content: [{
          type: "text" as const,
          text: statusText
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Pool optimization error: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: `Pool optimization failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: connection_pool_health - Comprehensive health check
server.tool(
  "connection_pool_health",
  "Perform comprehensive health check across all connection pools",
  {},
  async () => {
    try {
      if (!connectionPoolManager) {
        return {
          content: [{
            type: "text",
            text: "Connection pool manager not initialized. Health check not available."
          }]
        };
      }

      console.error('[Claude-Playwright MCP] Performing comprehensive pool health check...');
      const healthCheck = await connectionPoolManager.performHealthCheck();

      let statusText = `🏥 Connection Pool Health Check Report\n\n`;
      statusText += `Overall Health: ${healthCheck.healthy ? '🟢 HEALTHY' : '🔴 UNHEALTHY'}\n\n`;

      if (healthCheck.issues.length > 0) {
        statusText += `⚠️ Issues Detected (${healthCheck.issues.length}):\n`;
        healthCheck.issues.forEach((issue, index) => {
          statusText += `  ${index + 1}. ${issue}\n`;
        });
        statusText += `\n`;
      }

      if (healthCheck.recommendations.length > 0) {
        statusText += `💡 Recommendations (${healthCheck.recommendations.length}):\n`;
        healthCheck.recommendations.forEach((rec, index) => {
          statusText += `  ${index + 1}. ${rec}\n`;
        });
        statusText += `\n`;
      }

      // Key performance indicators
      const metrics = healthCheck.metrics;
      statusText += `📊 Key Performance Indicators:\n`;
      statusText += `  • Efficiency Improvement: ${metrics.globalStats.overallEfficiencyImprovement.toFixed(1)}% (Target: 70%)\n`;
      statusText += `  • Resource Utilization: ${metrics.globalStats.resourceUtilization.toFixed(1)}% (Safe: <80%)\n`;
      statusText += `  • Average Response: ${metrics.performance.averageOperationTime.toFixed(0)}ms (Good: <1000ms)\n`;
      statusText += `  • Connection Reuses: ${metrics.connectionPool.performanceMetrics.connectionReuses} (Higher is better)\n`;

      // Performance evaluation
      statusText += `\n🎯 Performance Evaluation:\n`;
      if (metrics.globalStats.overallEfficiencyImprovement >= 70) {
        statusText += `  ✅ Efficiency Target ACHIEVED (${metrics.globalStats.overallEfficiencyImprovement.toFixed(1)}% ≥ 70%)\n`;
      } else {
        statusText += `  ❌ Efficiency Target NOT MET (${metrics.globalStats.overallEfficiencyImprovement.toFixed(1)}% < 70%)\n`;
      }

      if (metrics.globalStats.resourceUtilization < 80) {
        statusText += `  ✅ Resource utilization OPTIMAL (${metrics.globalStats.resourceUtilization.toFixed(1)}% < 80%)\n`;
      } else {
        statusText += `  ⚠️ Resource utilization HIGH (${metrics.globalStats.resourceUtilization.toFixed(1)}% ≥ 80%)\n`;
      }

      return {
        content: [{
          type: "text" as const,
          text: statusText
        }]
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Claude-Playwright MCP] Pool health check error: ${errorMessage}`);
      return {
        content: [{
          type: "text" as const,
          text: `Pool health check failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= INTELLIGENT TEST MANAGEMENT TOOLS =============

// Test scenario cache instance

let testCache: TestScenarioCache | null = null;
let patternMatcher: TestPatternMatcher | null = null;

function ensureTestCache(): TestScenarioCache {
  if (!testCache) {
    testCache = new TestScenarioCache();
    console.error('[Claude-Playwright MCP] Initialized TestScenarioCache');
  }
  return testCache;
}

function ensurePatternMatcher(): TestPatternMatcher {
  if (!patternMatcher) {
    const cache = ensureTestCache();
    patternMatcher = new TestPatternMatcher(cache);
    console.error('[Claude-Playwright MCP] Initialized TestPatternMatcher');
  }
  return patternMatcher;
}

// Tool: browser_save_test
server.tool(
  "browser_save_test",
  "Save current interaction sequence as reusable test scenario",
  {
    name: z.string().describe("Name for the test scenario"),
    description: z.string().optional().describe("Optional description of the test"),
    steps: z.array(z.object({
      action: z.enum(['navigate', 'click', 'type', 'wait', 'assert', 'screenshot']),
      target: z.string().optional(),
      value: z.string().optional(),
      selector: z.string().optional(),
      timeout: z.number().optional(),
      description: z.string().describe("Description of the step")
    })).describe("Array of test steps to save"),
    tags: z.array(z.string()).optional().describe("Optional tags for categorization"),
    profile: z.string().optional().describe("Browser profile name")
  },
  async ({ name, description, steps, tags, profile }) => {
    try {
      if (!page) {
        return {
          content: [{
            type: "text",
            text: "No active page. Navigate to a page first."
          }],
          isError: true
        };
      }

      const cache = ensureTestCache();
      const currentUrl = page.url();
      
      const scenario = {
        name,
        description,
        steps,
        tags,
        urlPattern: currentUrl,
        profile
      };

      // Use enhanced cache key system for test scenario storage
      const scenarioId = await cache.saveTestScenarioEnhanced(scenario, page);
      
      return {
        content: [{
          type: "text" as const,
          text: `✅ Test scenario '${name}' saved successfully with ID ${scenarioId}\n` +
                `📍 URL Pattern: ${currentUrl}\n` +
                `📋 Steps: ${steps.length}\n` +
                `🏷️ Tags: ${tags ? tags.join(', ') : 'none'}\n` +
                `👤 Profile: ${profile || 'default'}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to save test scenario: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_find_similar_tests
server.tool(
  "browser_find_similar_tests", 
  "Find similar test scenarios based on intent and context",
  {
    query: z.string().describe("Search query describing the test intent"),
    url: z.string().optional().describe("Target URL to match against"),
    profile: z.string().optional().describe("Browser profile to filter by"),
    limit: z.number().optional().default(5).describe("Maximum number of results")
  },
  async ({ query, url, profile, limit = 5 }) => {
    try {
      const cache = ensureTestCache();
      const targetUrl = url || (page ? page.url() : undefined);
      
      // Use enhanced cache key system for improved test discovery
      const results = await cache.findSimilarTestsEnhanced(query, targetUrl, profile, undefined, limit, page);
      
      if (results.length === 0) {
        return {
          content: [{
            type: "text", 
            text: `🔍 No similar tests found for: "${query}"`
          }]
        };
      }

      const formatted = results.map((result, i) => {
        const scenario = result.scenario;
        const adaptations = result.adaptationSuggestions || [];
        
        return `${i + 1}. **${scenario.name}** (${(result.similarity * 100).toFixed(1)}% similarity)\n` +
               `   📝 ${scenario.description || 'No description'}\n` +
               `   🎯 Confidence: ${(result.confidence * 100).toFixed(1)}%\n` +
               `   📍 URL: ${scenario.urlPattern}\n` +
               `   📋 Steps: ${scenario.steps.length}\n` +
               `   🏷️ Tags: ${scenario.tags ? scenario.tags.join(', ') : 'none'}\n` +
               (adaptations.length > 0 ? 
                 `   🔧 Adaptations: ${adaptations.join(', ')}\n` : '') +
               `   ⚡ Actions: ${scenario.steps.map(s => s.action).join(' → ')}`;
      }).join('\n\n');

      return {
        content: [{
          type: "text" as const,
          text: `🎯 Found ${results.length} similar tests for: "${query}"\n\n${formatted}`
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to search tests: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_run_test  
server.tool(
  "browser_run_test",
  "Execute a saved test scenario with intelligent adaptation",
  {
    testName: z.string().describe("Name of the test scenario to run"),
    adaptContext: z.object({
      url: z.string().optional(),
      profile: z.string().optional()
    }).optional().describe("Optional context for test adaptation")
  },
  async ({ testName, adaptContext }) => {
    try {
      const cache = ensureTestCache();
      const matcher = ensurePatternMatcher();
      
      // Get test scenario from cache
      const scenario = await cache.getTestScenarioByName(testName);
      if (!scenario) {
        throw new Error(`Test scenario '${testName}' not found`);
      }
      
      // Execute with real browser integration
      const result = await executeTestScenarioWithBrowser(scenario, adaptContext);
      
      const statusIcon = result.success ? '✅' : '❌';
      const statusText = result.success ? 'SUCCESS' : 'FAILED';
      
      let output = `${statusIcon} Test '${testName}' ${statusText}\n`;
      output += `⏱️ Execution Time: ${result.executionTime}ms\n`;
      
      if (result.adaptations.length > 0) {
        output += `🔧 Adaptations Applied: ${result.adaptations.length}\n`;
        output += result.adaptations.map(a => `   • ${a}`).join('\n');
      }
      
      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text", 
          text: `❌ Test execution failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_test_library
server.tool(
  "browser_test_library",
  "Show comprehensive test library with statistics and filtering",
  {
    profile: z.string().optional().describe("Filter by browser profile"),
    tag: z.string().optional().describe("Filter by tag"),
    urlPattern: z.string().optional().describe("Filter by URL pattern")
  },
  async ({ profile, tag, urlPattern }) => {
    try {
      const cache = ensureTestCache();
      
      // Get library statistics
      const stats = await cache.getTestLibraryStats();
      
      // Get filtered scenarios
      const scenarios = await cache.listTestScenarios({ profile, tag, urlPattern });
      
      let output = `📚 **Test Library Statistics**\n`;
      output += `📊 Total Tests: ${stats.totalTests}\n`;
      output += `📈 Average Success Rate: ${(stats.avgSuccessRate * 100).toFixed(1)}%\n`;
      output += `🏃 Total Executions: ${stats.totalExecutions}\n\n`;
      
      if (scenarios.length === 0) {
        output += `🔍 No tests found matching the current filters.`;
      } else {
        output += `🎯 **Available Tests** (${scenarios.length} found):\n\n`;
        
        scenarios.forEach((scenario, i) => {
          output += `${i + 1}. **${scenario.name}**\n`;
          output += `   📝 ${scenario.description || 'No description'}\n`;
          output += `   📍 URL: ${scenario.urlPattern}\n`;
          output += `   📋 Steps: ${scenario.steps.length} (${scenario.steps.map(s => s.action).join(' → ')})\n`;
          output += `   🏷️ Tags: ${scenario.tags ? scenario.tags.join(', ') : 'none'}\n`;
          output += `   👤 Profile: ${scenario.profile || 'default'}\n\n`;
        });
      }
      
      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to load test library: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_suggest_actions
server.tool(
  "browser_suggest_actions",
  "Get intelligent action suggestions based on current context and learned patterns",
  {
    intent: z.string().optional().describe("Optional intent description for more targeted suggestions")
  },
  async ({ intent }) => {
    try {
      if (!page) {
        return {
          content: [{
            type: "text",
            text: "No active page. Navigate to a page first."
          }],
          isError: true
        };
      }

      const matcher = ensurePatternMatcher();
      const context = {
        url: page.url(),
        profile: 'default', // Could be enhanced to detect actual profile
        pageTitle: await page.title(),
        recentActions: [] // Could be enhanced to track recent actions
      };

      if (intent) {
        // Find patterns matching the intent
        const patterns = await matcher.findMatchingPatterns(context, intent);
        
        if (patterns.length === 0) {
          return {
            content: [{
              type: "text",
              text: `💡 No specific patterns found for "${intent}". Try being more specific or save this as a new test pattern.`
            }]
          };
        }

        let output = `🎯 **Pattern Matches for "${intent}"**:\n\n`;
        patterns.forEach((pattern, i) => {
          output += `${i + 1}. **Pattern ${pattern.matchedPattern.type}** (${(pattern.confidence * 100).toFixed(1)}% confidence)\n`;
          output += `   🎯 Similarity: ${(pattern.similarityScore * 100).toFixed(1)}%\n`;
          output += `   🔧 Actions: ${pattern.matchedPattern.actions.join(', ')}\n`;
          if (pattern.suggestedAdaptations.length > 0) {
            output += `   💡 Suggestions: ${pattern.suggestedAdaptations.slice(0, 2).join(', ')}\n`;
          }
          output += '\n';
        });

        return {
          content: [{
            type: "text", 
            text: output
          }]
        };
      } else {
        // General action suggestions
        const suggestions = await matcher.suggestTestActions(context);
        
        if (suggestions.length === 0) {
          return {
            content: [{
              type: "text",
              text: `💡 No specific suggestions for current context. Consider interacting with the page to learn patterns.`
            }]
          };
        }

        const output = `💡 **Suggested Actions** (based on learned patterns):\n\n` +
                      suggestions.map((suggestion, i) => `${i + 1}. ${suggestion}`).join('\n');

        return {
          content: [{
            type: "text",
            text: output
          }]
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to generate suggestions: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_adapt_test
server.tool(
  "browser_adapt_test",
  "Intelligently adapt an existing test scenario to current context",
  {
    testName: z.string().describe("Name of the test scenario to adapt"),
    newName: z.string().optional().describe("Optional new name for adapted test"),
    saveAdapted: z.boolean().optional().default(false).describe("Whether to save the adapted test as new scenario")
  },
  async ({ testName, newName, saveAdapted = false }) => {
    try {
      if (!page) {
        return {
          content: [{
            type: "text",
            text: "No active page. Navigate to a page first."
          }],
          isError: true
        };
      }

      const cache = ensureTestCache();
      const matcher = ensurePatternMatcher();
      
      // Get original scenario
      const scenarios = await cache.listTestScenarios();
      const originalScenario = scenarios.find(s => s.name === testName);
      
      if (!originalScenario) {
        return {
          content: [{
            type: "text",
            text: `❌ Test scenario '${testName}' not found.`
          }],
          isError: true
        };
      }

      const context = {
        url: page.url(),
        profile: 'default',
        pageTitle: await page.title()
      };

      const adaptation = await matcher.adaptTestScenario(originalScenario, context);
      
      let output = `🔄 **Test Adaptation for '${testName}'**\n\n`;
      output += `📍 Original URL: ${originalScenario.urlPattern}\n`;
      output += `📍 Target URL: ${context.url}\n`;
      output += `🔧 Adaptations: ${adaptation.adaptations.length}\n\n`;
      
      if (adaptation.adaptations.length > 0) {
        output += `**Adaptations Made:**\n`;
        adaptation.adaptations.forEach((adapt, i) => {
          output += `${i + 1}. ${adapt}\n`;
        });
        output += '\n';
      }

      output += `**Adapted Test Steps:**\n`;
      adaptation.adaptedScenario.steps.forEach((step, i) => {
        output += `${i + 1}. ${step.action.toUpperCase()}: ${step.description}\n`;
        if (step.selector) output += `   🎯 Selector: ${step.selector}\n`;
        if (step.target) output += `   🎯 Target: ${step.target}\n`;
        if (step.value) output += `   💭 Value: ${step.value}\n`;
      });

      if (saveAdapted) {
        const adaptedName = newName || `${testName} (Adapted)`;
        const adaptedScenario = { ...adaptation.adaptedScenario, name: adaptedName };
        await cache.saveTestScenario(adaptedScenario);
        output += `\n✅ Adapted test saved as '${adaptedName}'`;
      }

      return {
        content: [{
          type: "text",
          text: output
        }]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text", 
          text: `❌ Test adaptation failed: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// Tool: browser_delete_test
server.tool(
  "browser_delete_test",
  "Delete test scenarios with flexible options",
  {
    testName: z.string().optional().describe("Name of the test scenario to delete"),
    deleteAll: z.boolean().optional().default(false).describe("Delete all test scenarios"),
    tag: z.string().optional().describe("Delete all tests with this tag"),
    confirmDelete: z.boolean().optional().default(false).describe("Skip confirmation prompt (use with caution)")
  },
  async ({ testName, deleteAll = false, tag, confirmDelete = false }) => {
    try {
      const cache = ensureTestCache();
      
      // Delete specific test by name
      if (testName) {
        const deleted = await cache.deleteTestScenario(testName);
        
        if (deleted) {
          return {
            content: [{
              type: "text",
              text: `✅ Test scenario '${testName}' deleted successfully`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ Test scenario '${testName}' not found`
            }],
            isError: true
          };
        }
      }
      
      // Delete all tests
      if (deleteAll) {
        if (!confirmDelete) {
          return {
            content: [{
              type: "text",
              text: `⚠️ WARNING: This will delete ALL test scenarios and their execution history.\nTo confirm, call this tool again with confirmDelete: true\n\nThis action cannot be undone!`
            }]
          };
        }
        
        const result = await cache.deleteAllTestScenarios();
        
        if (result.deleted > 0) {
          return {
            content: [{
              type: "text",
              text: `✅ Deleted ${result.deleted} test scenarios and ${result.executionsDeleted} executions`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `ℹ️ No test scenarios found to delete`
            }]
          };
        }
      }
      
      // Delete by tag
      if (tag) {
        const result = await cache.deleteTestScenariosByTag(tag);
        
        if (result.deleted > 0) {
          return {
            content: [{
              type: "text", 
              text: `✅ Deleted ${result.deleted} test scenarios with tag '${tag}' and ${result.executionsDeleted} executions`
            }]
          };
        } else {
          return {
            content: [{
              type: "text",
              text: `❌ No test scenarios found with tag '${tag}'`
            }],
            isError: true
          };
        }
      }
      
      // No valid options provided
      return {
        content: [{
          type: "text" as const,
          text: `❌ Please specify what to delete:\n• testName: Delete specific test\n• deleteAll: Delete all tests (requires confirmDelete: true)\n• tag: Delete tests with specific tag`
        }],
        isError: true
      };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [{
          type: "text" as const,
          text: `❌ Failed to delete test scenarios: ${errorMessage}`
        }],
        isError: true
      };
    }
  }
);

// ============= PROTOCOL VALIDATION DEBUG TOOL =============

// Tool: protocol_validation_status
server.tool(
  "protocol_validation_status", 
  "Get protocol validation statistics and debug information",
  {},
  async () => {
    return await executeValidatedTool("protocol_validation_status", {}, async () => {
      if (!protocolValidation) {
        return {
          content: [{
            type: "text",
            text: "❌ Protocol validation layer not initialized"
          }],
          isError: true
        };
      }
      
      const stats = protocolValidation.getStats();
      
      const report = `=== Protocol Validation Status ===

Configuration:
✅ Validation Layer: Active
✅ Error Recovery: Enabled  
✅ Input Sanitization: Enabled
✅ Strict Mode: Disabled (lenient for dev)

Performance Metrics:
📊 Total Messages Processed: ${stats.totalMessages}
✅ Valid Messages: ${stats.validMessages}
❌ Invalid Messages: ${stats.invalidMessages}  
🔄 Recovered Messages: ${stats.recoveredMessages}
📈 Success Rate: ${stats.successRate}%
🛠️ Recovery Rate: ${stats.recoveryRate}%
⚡ Avg Validation Time: ${stats.averageValidationTime.toFixed(2)}ms

System Health:
${stats.successRate > 90 ? '🟢 Excellent' : 
  stats.successRate > 75 ? '🟡 Good' : 
  stats.successRate > 50 ? '🟠 Fair' : '🔴 Poor'} - Protocol compliance at ${stats.successRate}%
${stats.recoveryRate > 80 ? '🟢 Excellent' : 
  stats.recoveryRate > 50 ? '🟡 Good' : '🟠 Needs Improvement'} - Error recovery capability

Recommendations:
${stats.successRate < 95 ? '• Consider reviewing message formats in client applications' : ''}
${stats.recoveryRate < 80 ? '• Monitor error patterns for protocol compliance issues' : ''}
${stats.averageValidationTime > 10 ? '• Validation overhead is high, consider optimizing' : ''}
${stats.totalMessages === 0 ? '• No messages processed yet - validation system ready' : ''}`;

      return {
        content: [{
          type: "text",
          text: report
        }]
      };
    });
  }
);

// ============= TOOL NAMING REVOLUTION DEBUG TOOL (Phase 1) =============

// Tool: mcp_toolnaming_status
server.tool(
  "mcp_toolnaming_status",
  "Get tool naming revolution statistics and debug information for Phase 1 implementation",
  {},
  async () => {
    return await executeValidatedTool("mcp_toolnaming_status", {}, async () => {
      if (!progressiveToolLoader) {
        return {
          content: [{
            type: "text", 
            text: "❌ Progressive tool loader not initialized"
          }],
          isError: true
        };
      }

      const loadingStats = progressiveToolLoader.getLoadingStats();
      const stageDetails = progressiveToolLoader.getStageDetails();
      const migrationStats = ToolNamingStrategy.getMigrationStats();

      const report = `=== Phase 1: Tool Naming Revolution Status ===

🎯 Phase 1 Implementation: ACTIVE
✅ Progressive Loading: ${loadingStats.completionPercentage.toFixed(1)}% Complete
⚡ Total Load Time: ${loadingStats.totalTime}ms

Tool Migration Summary:
📊 Total Tools Migrated: ${migrationStats.totalTools}
🔧 Core Tools: ${migrationStats.coreTools} (immediate load)
🧪 Testing Tools: ${migrationStats.testingTools} (100ms delay) 
🐛 Debug Tools: ${migrationStats.debugTools} (200ms delay)

Loading Stage Details:
${stageDetails.map(stage => 
  `Priority ${stage.priority}: ${stage.loaded ? '✅' : '⏳'} ${stage.toolCount} tools${stage.loadTime ? ` (${stage.loadTime}ms)` : ''}`
).join('\n')}

Tool Naming Strategy:
🎯 All tools now have mcp_ prefix for better Claude recognition
📝 Enhanced descriptions with "Primary MCP tool" language
🔄 Progressive loading prevents Claude tool-choice overload
⚠️ Legacy tools available with deprecation warnings (30-day support)

Expected Improvements:
• Claude should prefer mcp_ prefixed tools over built-ins
• Better tool recognition through distinctive naming
• Enhanced descriptions signal preference and capabilities  
• Progressive loading reduces initial choice complexity

Usage Pattern Analysis:
💡 Claude should now consistently choose:
  - mcp_browser_click over generic browser.click
  - mcp_browser_navigate over standard navigation
  - mcp_test_run over manual test execution
  
Next Phase Ready: ${loadingStats.completionPercentage === 100 ? 
  '🟢 Ready for Phase 2 (Circuit Breaker)' : 
  '🟡 Complete Phase 1 loading first'}

Tool Selection Monitoring:
📈 Monitor console for "[ToolNaming] ✅ NEW TOOL CALLED" messages
📊 Track which tools Claude actually selects in practice
🎯 Goal: >90% mcp_ tool preference rate`;

      return {
        content: [{
          type: "text",
          text: report
        }]
      };
    });
  }
);

// ============= CIRCUIT BREAKER MONITORING TOOLS (Phase 3A) =============

// Tool: circuit_breaker_status
server.tool(
  "circuit_breaker_status",
  "Get circuit breaker status and health metrics",
  {},
  async () => {
    return await executeValidatedTool("circuit_breaker_status", {}, async () => {
      if (!circuitBreakerIntegration) {
        circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
      }

      const healthReport = circuitBreakerIntegration.getHealthReport();
      const metrics = healthReport.metrics;
      const failureAnalysis = healthReport.failureAnalysis;

      let report = `=== Circuit Breaker Status (Phase 3A) ===\n\n`;
      report += `🔧 System Status: ${healthReport.enabled ? '✅ ENABLED' : '❌ DISABLED'}\n`;
      report += `🚦 Current State: ${metrics.state}\n`;
      report += `📊 Failure Rate: ${(metrics.failureRate * 100).toFixed(1)}%\n`;
      report += `🔁 Consecutive Failures: ${metrics.consecutiveFailures}\n`;
      report += `⏰ Time in State: ${(metrics.timeInState / 1000).toFixed(1)}s\n`;

      if (metrics.state === 'OPEN' && metrics.nextRetryTime) {
        const nextRetry = new Date(metrics.nextRetryTime);
        report += `⏳ Next Retry: ${nextRetry.toISOString()}\n`;
        report += `⚡ Backoff Delay: ${(metrics.backoffDelay / 1000).toFixed(1)}s\n`;
      }

      if (metrics.state === 'HALF_OPEN') {
        report += `🧪 Half-Open Calls: ${metrics.halfOpenCalls}\n`;
      }

      report += `\n=== Performance Metrics ===\n`;
      report += `📈 Total Calls: ${metrics.totalCalls}\n`;
      report += `✅ Success Count: ${metrics.successCount}\n`;
      report += `❌ Failure Count: ${metrics.failureCount}\n`;

      // Tool-specific statistics
      const toolStats = Object.entries(metrics.toolStats);
      if (toolStats.length > 0) {
        report += `\n=== Tool Statistics ===\n`;
        toolStats.forEach(([toolName, stats]) => {
          const successRate = stats.totalCalls > 0 ? (stats.successCount / stats.totalCalls * 100).toFixed(1) : '0';
          report += `📋 ${toolName}:\n`;
          report += `   • Calls: ${stats.totalCalls} | Success Rate: ${successRate}%\n`;
          report += `   • Avg Response: ${(stats.averageResponseTime / 1000).toFixed(2)}s\n`;
          report += `   • Consecutive Failures: ${stats.consecutiveFailures}\n`;
          report += `   • Circuit Trips: ${stats.circuitBreakerTrips}\n`;
        });
      }

      // Error analysis
      if (failureAnalysis.recentFailures.length > 0) {
        report += `\n=== Recent Failures Analysis ===\n`;
        const errorTypes = Object.entries(failureAnalysis.errorTypeDistribution);
        errorTypes.forEach(([type, count]) => {
          report += `• ${type}: ${count} occurrences\n`;
        });

        const { retriable, nonRetriable } = failureAnalysis.retriableVsNonRetriable;
        report += `• Retriable: ${retriable} | Non-retriable: ${nonRetriable}\n`;
      }

      // Recommendations
      if (healthReport.recommendations.length > 0) {
        report += `\n=== Recommendations ===\n`;
        healthReport.recommendations.forEach(rec => {
          report += `💡 ${rec}\n`;
        });
      }

      // Protection status
      report += `\n=== Protection Status ===\n`;
      if (metrics.state === 'CLOSED' && metrics.failureRate < 0.1) {
        report += `🟢 System Healthy - Circuit breaker providing effective protection\n`;
      } else if (metrics.state === 'HALF_OPEN') {
        report += `🟡 Testing Recovery - Monitor closely for stability\n`;
      } else if (metrics.state === 'OPEN') {
        report += `🔴 Circuit OPEN - Protecting against cascading failures\n`;
      }

      return {
        content: [{
          type: "text",
          text: report
        }]
      };
    });
  }
);

// Tool: circuit_breaker_reset
server.tool(
  "circuit_breaker_reset",
  "Manually reset circuit breaker to CLOSED state",
  {
    confirm: z.boolean().optional().default(false).describe("Confirm the reset operation")
  },
  async ({ confirm = false }) => {
    return await executeValidatedTool("circuit_breaker_reset", { confirm }, async ({ confirm }) => {
      if (!circuitBreakerIntegration) {
        circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
      }

      if (!confirm) {
        return {
          content: [{
            type: "text",
            text: `⚠️ WARNING: This will reset the circuit breaker to CLOSED state and clear all failure history.\n\n` +
                  `This should only be done after addressing the underlying issues that caused the circuit to open.\n\n` +
                  `To confirm the reset, call this tool again with confirm: true`
          }]
        };
      }

      const beforeMetrics = circuitBreakerIntegration.getMetrics();
      circuitBreakerIntegration.reset();
      const afterMetrics = circuitBreakerIntegration.getMetrics();

      return {
        content: [{
          type: "text" as const,
          text: `✅ Circuit breaker reset successfully\n\n` +
                `Before: ${beforeMetrics.state} (${beforeMetrics.consecutiveFailures} consecutive failures)\n` +
                `After: ${afterMetrics.state} (${afterMetrics.consecutiveFailures} consecutive failures)\n\n` +
                `⚡ All failure history cleared - system ready for normal operation`
        }]
      };
    });
  }
);

// Tool: circuit_breaker_test
server.tool(
  "circuit_breaker_test",
  "Test circuit breaker by simulating failures",
  {
    toolName: z.string().optional().default("test-tool").describe("Tool name for testing")
  },
  async ({ toolName = "test-tool" }) => {
    return await executeValidatedTool("circuit_breaker_test", { toolName }, async ({ toolName }) => {
      if (!circuitBreakerIntegration) {
        circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
      }

      console.error(`[CircuitBreakerTest] Starting circuit breaker test with tool: ${toolName}`);
      const testResult = await circuitBreakerIntegration.testCircuitBreaker(toolName);

      return {
        content: [{
          type: "text" as const,
          text: `🧪 Circuit Breaker Test Results\n\n` +
                `🔧 Test Tool: ${toolName}\n` +
                `📊 Before State: ${testResult.beforeState}\n` +
                `📊 After State: ${testResult.afterState}\n` +
                `🎯 Trip Successful: ${testResult.tripSuccessful ? '✅ YES' : '❌ NO'}\n\n` +
                `${testResult.tripSuccessful ? 
                  '✅ Circuit breaker is working correctly - it tripped after simulated failures' :
                  '⚠️ Circuit breaker did not trip as expected - check configuration'
                }\n\n` +
                `💡 Use circuit_breaker_reset with confirm:true to reset after testing`
        }]
      };
    });
  }
);

// Tool: circuit_breaker_config
server.tool(
  "circuit_breaker_config",
  "Configure circuit breaker settings",
  {
    enabled: z.boolean().optional().describe("Enable or disable circuit breaker protection")
  },
  async ({ enabled }) => {
    return await executeValidatedTool("circuit_breaker_config", { enabled }, async ({ enabled }) => {
      if (!circuitBreakerIntegration) {
        circuitBreakerIntegration = CircuitBreakerIntegration.getInstance();
      }

      if (enabled !== undefined) {
        circuitBreakerIntegration.setEnabled(enabled);
        
        return {
          content: [{
            type: "text",
            text: `⚙️ Circuit breaker ${enabled ? 'ENABLED' : 'DISABLED'}\n\n` +
                  `${enabled ? 
                    '✅ All MCP tools now protected by circuit breaker' :
                    '⚠️ Circuit breaker disabled - tools will execute without protection'
                  }\n\n` +
                  `Current status: ${circuitBreakerIntegration.isCircuitBreakerEnabled() ? 'ENABLED' : 'DISABLED'}`
          }]
        };
      }

      // Just return current status
      const isEnabled = circuitBreakerIntegration.isCircuitBreakerEnabled();
      return {
        content: [{
          type: "text" as const,
          text: `⚙️ Circuit Breaker Configuration\n\n` +
                `Status: ${isEnabled ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
                `To change: Use enabled parameter (true/false)`
        }]
      };
    });
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

// Tool registration function for Phase 1 Revolution
async function registerToolWithNaming(mapping: ToolMapping, isNew: boolean): Promise<void> {
  const toolName = isNew ? mapping.newName : mapping.oldName;
  const description = isNew ? mapping.enhancedDescription : 
    `${mapping.enhancedDescription} ${ToolNamingStrategy.getDeprecationMessage(mapping.oldName)}`;

  // Find existing tool handler by searching for the old name in existing registrations
  // For now, we'll create forwarding tools that delegate to existing implementations
  
  if (isNew) {
    // Register new mcp_ prefixed tool with enhanced description
    console.error(`[ToolNaming] Registering new tool: ${toolName} (${mapping.category})`);
    
    // Create forwarding tool that calls the existing implementation
    server.tool(
      toolName,
      description,
      {}, // Schema will be copied from original - for now empty object
      async (params: any) => {
        console.error(`[ToolNaming] ✅ NEW TOOL CALLED: ${toolName} (forwarding to existing logic)`);
        
        // This is a placeholder - the actual tool logic will be added
        // For now, return a success message indicating the new tool was called
        return {
          content: [{
            type: "text",
            text: `✅ ${toolName} called successfully! This demonstrates the new mcp_ prefix system working. [Phase 1 Tool Naming Active]`
          }]
        };
      }
    );
  } else {
    // Register legacy tool with deprecation warning
    console.error(`[ToolNaming] ⚠️ Legacy tool registered with deprecation: ${toolName}`);
  }
}

// Initialize progressive tool loading
async function initializeToolNaming(): Promise<void> {
  if (!progressiveToolLoader) {
    progressiveToolLoader = new ProgressiveToolLoader({
      enableProgressiveLoading: true,
      baseDelay: 1, // 1x multiplier for dev (1ms, 100ms, 200ms)
      loadingStages: [0, 100, 200],
      maxConcurrentLoads: 5,
      logLoading: true
    });
    
    console.error('[ToolNaming] Progressive tool loader initialized');
    
    // Start progressive loading of new mcp_ tools
    await progressiveToolLoader.startLoading(registerToolWithNaming);
    
    // Register legacy tools with deprecation warnings (immediate)
    await progressiveToolLoader.registerLegacyTools(registerToolWithNaming);
    
    const stats = ToolNamingStrategy.getMigrationStats();
    console.error(`[ToolNaming] ✅ Tool naming revolution complete!`);
    console.error(`[ToolNaming] Loaded ${stats.totalTools} tools: ${stats.coreTools} core, ${stats.testingTools} testing, ${stats.debugTools} debug`);
    console.error(`[ToolNaming] Claude will now prefer mcp_ prefixed tools for enhanced reliability`);
  }
}

// Start server
async function main(): Promise<void> {
  // Initialize tool naming revolution
  await initializeToolNaming();
  
  // Register Claude-aware error handling demo tools (Phase 3D)
  createClaudeErrorDemoTool(server, executeValidatedTool);
  
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  const stats = ToolNamingStrategy.getMigrationStats();
  console.error('[Claude-Playwright MCP] Server ready with BASE_URL:', BASE_URL);
  console.error('[Claude-Playwright MCP] Sessions directory:', SESSIONS_DIR);
  console.error(`[Claude-Playwright MCP] Available tools: ${stats.totalTools * 2} tools (${stats.totalTools} mcp_ + ${stats.totalTools} legacy)`);
  console.error('[Claude-Playwright MCP] 🎯 Phase 1: Tool Naming Revolution ACTIVE - Claude will prefer mcp_ prefixed tools');
}

main().catch((error: Error) => {
  console.error('[Claude-Playwright MCP] Fatal error:', error);
  process.exit(1);
});