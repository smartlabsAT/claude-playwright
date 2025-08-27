# Claude-Playwright Toolkit API Documentation

Complete reference for all CLI commands, APIs, and template system with real browser integration.

## Table of Contents
- [CLI Commands](#cli-commands)
- [Real Browser Session Management](#real-browser-session-management)
- [Profile Management API](#profile-management-api)
- [Scaffold System API](#scaffold-system-api)
- [SessionManager API](#session-manager-api)
- [Template System](#template-system)
- [Error Handling](#error-handling)
- [Configuration](#configuration)

## CLI Commands

### Core Commands

#### `claude-playwright init`
Initialize a new Claude-Playwright project with interactive setup.

```bash
claude-playwright init [options]
```

**Options:**
- `-d, --dir <directory>` - Project directory (default: current directory)
- `--template <template>` - Template type: minimal, enterprise, testing
- `--skip-deps` - Skip dependency installation
- `--skip-mcp` - Skip MCP configuration
- `--upgrade` - Upgrade existing project (preserves files)

**Examples:**
```bash
# Interactive setup with prompts
claude-playwright init

# Quick setup with minimal template
claude-playwright init --template minimal --dir my-project

# Upgrade existing project
claude-playwright init --upgrade
```

**What it does:**
1. Creates project directory structure
2. Configures MCP for Claude Code
3. Sets up browser profiles and auth directories  
4. Copies template files based on selection
5. Creates package.json with Playwright dependencies
6. Generates CLAUDE.md with project instructions

#### `claude-playwright configure-mcp`
Configure MCP integration without full project initialization.

```bash
claude-playwright configure-mcp [options]
```

**Options:**
- `-d, --dir <directory>` - Project directory (default: current directory)
- `--update-docs` - Update existing CLAUDE.md file

**Examples:**
```bash
# Configure MCP for current directory
claude-playwright configure-mcp

# Configure MCP and update documentation
claude-playwright configure-mcp --update-docs
```

### Scaffold Commands (Phase 1.5)

#### `claude-playwright scaffold page <name>`
Generate a new Page Object Model class.

```bash
claude-playwright scaffold page <name> [options]
```

**Parameters:**
- `<name>` - Page class name (e.g., LoginPage, HomePage)

**Options:**
- `-p, --path <path>` - Target directory (default: `src/pages`)

**Examples:**
```bash
# Generate LoginPage in default location
claude-playwright scaffold page LoginPage

# Generate HomePage in custom directory
claude-playwright scaffold page HomePage --path tests/pages

# Generate with automatic naming
claude-playwright scaffold page login  # Creates LoginPage
```

**Generated file structure:**
```typescript
import { Page, expect } from '@playwright/test';
import { BasePage } from './base/BasePage';

export class LoginPage extends BasePage {
  // Locators
  private readonly mainHeading = 'h1';
  private readonly submitButton = '[type="submit"]';
  
  constructor(page: Page) {
    super(page);
  }
  
  // Navigation
  async goto() {
    await this.navigateTo('/login');
  }
  
  // Actions
  async clickSubmit() {
    await this.page.click(this.submitButton);
    await this.page.waitForLoadState('networkidle');
  }
  
  // Assertions
  async expectHeading(text: string) {
    await expect(this.page.locator(this.mainHeading)).toContainText(text);
  }
}
```

#### `claude-playwright scaffold test <name>`
Generate a new test file with boilerplate.

```bash
claude-playwright scaffold test <name> [options]
```

**Parameters:**
- `<name>` - Test file name (e.g., auth-flow, user-journey)

**Options:**
- `-p, --path <path>` - Target directory (default: `src/tests`)

**Examples:**
```bash
# Generate auth-flow.spec.ts
claude-playwright scaffold test auth-flow

# Generate in custom directory
claude-playwright scaffold test user-journey --path tests/e2e
```

**Generated file structure:**
```typescript
import { test, expect } from '@playwright/test';
import { BasePage } from '../pages/base/BasePage';

test.describe('Auth Flow Tests', () => {
  let basePage: BasePage;
  
  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    await basePage.navigateTo('/');
  });
  
  test('should load successfully', async ({ page }) => {
    await expect(page).toHaveTitle(/.*/);
  });
  
  test('should display content', async ({ page }) => {
    await expect(page.locator('h1')).toBeVisible();
  });
});
```

### Session Management Commands (Phase 1.6 - Real Browser Integration)

#### `claude-playwright session save <name>`
**🚀 REAL BROWSER IMPLEMENTATION** - Opens actual browser for manual login and captures authentic session data.

```bash
claude-playwright session save <name> [options]
```

**Parameters:**
- `<name>` - Session identifier

**Options:**
- `--url <url>` - Target URL for login (default: prompts user)
- `--profile <profile>` - Browser profile to use
- `--timeout <ms>` - Maximum wait time for user interaction (default: 300000ms)

**Real Browser Workflow:**
1. **Browser Launch**: Opens non-headless Chromium browser
2. **Navigation**: Navigates to specified URL or prompts user
3. **Manual Login**: User performs login in real browser
4. **User Confirmation**: User presses ENTER when ready to save
5. **State Capture**: Captures actual cookies, localStorage, sessionStorage
6. **Validation**: Verifies session contains authentication data
7. **Storage**: Saves with 8-hour expiration

**Examples:**
```bash
# Interactive session save with URL prompt
claude-playwright session save admin-session

# Direct URL specification
claude-playwright session save user-session --url https://app.example.com/login

# Using specific browser profile
claude-playwright session save mobile-session --profile mobile --url https://m.example.com
```

**Real Session Data Captured:**
```json
{
  "name": "admin-session",
  "createdAt": 1647875400000,
  "expiresAt": 1647904200000,
  "storageState": {
    "cookies": [
      {
        "name": "auth_token",
        "value": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
        "domain": ".example.com",
        "path": "/",
        "expires": 1647961800,
        "httpOnly": true,
        "secure": true
      }
    ],
    "origins": [
      {
        "origin": "https://app.example.com",
        "localStorage": [
          {
            "name": "user_preferences",
            "value": "{\"theme\":\"dark\",\"lang\":\"en\"}"
          }
        ]
      }
    ]
  },
  "browserProfile": "desktop",
  "metadata": {
    "url": "https://app.example.com/dashboard",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...",
    "viewport": { "width": 1920, "height": 1080 }
  }
}
```

#### `claude-playwright session list`
List all saved browser sessions with detailed status information.

```bash
claude-playwright session list [options]
```

**Options:**
- `--expired` - Show only expired sessions
- `--valid` - Show only valid sessions
- `--profile <profile>` - Filter by browser profile

**Enhanced Output Format:**
```
📋 Browser Sessions:

Name                 Created              Expires              Status    Profile
────────────────────────────────────────────────────────────────────────────────
admin-session        1/15/24, 10:30:00 AM 1/15/24, 6:30:00 PM  VALID     desktop
mobile-user          1/15/24, 9:15:00 AM  1/15/24, 5:15:00 PM  EXPIRED   mobile
guest-session        1/15/24, 11:00:00 AM 1/15/24, 7:00:00 PM  VALID     guest
```

#### `claude-playwright session load <name>`
Load and validate a previously saved browser session.

```bash
claude-playwright session load <name>
```

**Enhanced Validation:**
- Session existence check
- Expiration validation (8-hour default)
- Cookie integrity verification
- Storage state validation

**Error Conditions:**
- `Session not found: <name>`
- `Session expired: <name>. Session was valid until <timestamp>`
- `Invalid session data: corrupted storage state`
- `Authentication cookies missing or invalid`

#### `claude-playwright session delete <name>`
Permanently remove a saved session.

```bash
claude-playwright session delete <name>
```

#### `claude-playwright session clear`
Remove all expired sessions automatically.

```bash
claude-playwright session clear
```

**Output Example:**
```
✓ Cleared 3 expired session(s)
  - admin-old (expired 2 days ago)
  - test-session (expired 5 hours ago)
  - mobile-temp (expired 1 day ago)
```

### Profile Management Commands (Phase 1.6)

#### `claude-playwright profile setup`
Create default browser profiles with optimized configurations.

```bash
claude-playwright profile setup
```

**Default Profiles Created:**
- `admin`: Desktop 1920x1080, full permissions
- `user`: Desktop 1366x768, standard permissions  
- `guest`: Desktop 1280x720, minimal permissions
- `mobile`: Mobile 375x667, touch enabled

#### `claude-playwright profile create <name>`
Create custom browser profile with specific configurations.

```bash
claude-playwright profile create <name> [options]
```

**Parameters:**
- `<name>` - Profile identifier

**Options:**
- `--role <role>` - User role (required)
- `--viewport <WxH>` - Viewport dimensions (e.g., 1920x1080)
- `--user-agent <ua>` - Custom user agent string
- `--permissions <perms>` - Comma-separated permissions list
- `--description <desc>` - Profile description

**Examples:**
```bash
# Basic profile creation
claude-playwright profile create designer --role designer

# Advanced profile with custom settings
claude-playwright profile create tablet --role tablet_user \
  --viewport 768x1024 \
  --permissions "geolocation,camera" \
  --description "iPad Pro simulation"

# Mobile profile with specific user agent
claude-playwright profile create android --role mobile_user \
  --viewport 412x915 \
  --user-agent "Mozilla/5.0 (Linux; Android 11; SM-G991B)"
```

#### `claude-playwright profile list`
Display all browser profiles with usage statistics.

```bash
claude-playwright profile list
```

**Enhanced Output:**
```
🎭 Browser Profiles:

Name       Role          Last Used        Environment  Description
──────────────────────────────────────────────────────────────────────
admin      administrator 1/15/24 2:30 PM  dev         Administrator user with full permissions
mobile     mobile_user   1/15/24 1:15 PM  dev         Mobile device simulation  
designer   designer      1/14/24 4:45 PM  dev         High-res designer workflow
tablet     tablet_user   1/13/24 9:30 AM  dev         iPad Pro simulation
```

#### `claude-playwright profile delete <name>`
Remove a browser profile and associated data.

```bash
claude-playwright profile delete <name>
```

**Cleanup Actions:**
- Removes profile configuration
- Deletes profile data directory
- Removes associated authentication states
- Cleans up cached browser data

### Utility Commands

#### `claude-playwright --help`
Display help information for all commands.

#### `claude-playwright --version`
Display current toolkit version.

## Real Browser Session Management

### Browser Session Integration with Playwright

The toolkit provides seamless integration between manually captured browser sessions and Playwright tests.

#### Real Session Capture Process

```typescript
// Internal implementation (for understanding)
import { chromium } from '@playwright/test';
import readline from 'readline';

async function captureRealSession(sessionName: string, url: string) {
  // 1. Launch non-headless browser
  const browser = await chromium.launch({ 
    headless: false,
    args: ['--start-maximized', '--disable-web-security']
  });
  
  // 2. Create context with profile settings
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });
  
  // 3. Navigate and wait for user interaction
  const page = await context.newPage();
  await page.goto(url);
  
  console.log('👤 Please complete login in the browser...');
  await waitForUserConfirmation();
  
  // 4. Capture complete storage state
  const storageState = await context.storageState();
  
  // 5. Validate authentication data
  if (storageState.cookies.length === 0) {
    throw new Error('No authentication cookies found');
  }
  
  // 6. Save with metadata
  const sessionData = {
    name: sessionName,
    storageState,
    createdAt: Date.now(),
    expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8 hours
    metadata: {
      url: page.url(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: page.viewportSize()
    }
  };
  
  await browser.close();
  return sessionData;
}
```

#### Using Sessions in Tests

```typescript
// Complete test example with session loading
import { test, expect } from '@playwright/test';
import { SessionManager } from 'claude-playwright';

test.describe('Authenticated Tests', () => {
  let sessionManager: SessionManager;
  
  test.beforeAll(async () => {
    sessionManager = new SessionManager();
  });
  
  test('admin dashboard access', async ({ browser }) => {
    // Load real captured session
    const storageState = await sessionManager.loadSession('admin-session');
    
    // Create context with session data
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    
    // Navigate to protected page
    await page.goto('/admin/dashboard');
    
    // Verify authentication worked
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-panel"]')).toBeVisible();
    
    await context.close();
  });
  
  test('session expiry handling', async ({ browser }) => {
    try {
      await sessionManager.loadSession('expired-session');
      throw new Error('Should have thrown expiry error');
    } catch (error) {
      expect(error.message).toContain('Session expired');
    }
  });
});
```

### Session Validation and Security

```typescript
// Session integrity checking
class SessionValidator {
  static validateStorageState(storageState: any): boolean {
    // Check required authentication cookies
    const authCookies = storageState.cookies.filter(cookie => 
      cookie.name.includes('auth') || 
      cookie.name.includes('session') ||
      cookie.name.includes('token')
    );
    
    if (authCookies.length === 0) {
      console.warn('⚠️  No authentication cookies found');
      return false;
    }
    
    // Validate localStorage authentication data
    const hasAuthData = storageState.origins.some(origin =>
      origin.localStorage.some(item => 
        item.name.includes('auth') || 
        item.name.includes('user') ||
        item.name.includes('token')
      )
    );
    
    return authCookies.length > 0 && hasAuthData;
  }
  
  static isSessionExpired(sessionData: any): boolean {
    return Date.now() > sessionData.expiresAt;
  }
  
  static getSessionTimeRemaining(sessionData: any): number {
    const remaining = sessionData.expiresAt - Date.now();
    return Math.max(0, remaining);
  }
}
```

## Profile Management API

### BrowserProfileManager Class

Complete programmatic access to browser profile management.

```typescript
import { BrowserProfileManager } from 'claude-playwright';

const profileManager = new BrowserProfileManager();
```

#### Profile Creation and Configuration

```typescript
// Create comprehensive browser profile
await profileManager.createProfile({
  name: 'enterprise-user',
  role: 'enterprise_user',
  description: 'Enterprise user with specific configurations',
  settings: {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    timezone: 'America/New_York',
    permissions: ['geolocation', 'camera', 'microphone'],
    localStorage: {
      theme: 'dark',
      language: 'en',
      tutorial_completed: 'true'
    },
    sessionStorage: {
      session_id: 'temp_session_' + Date.now()
    }
  },
  metadata: {
    tags: ['enterprise', 'production'],
    environment: 'prod',
    baseUrl: 'https://app.enterprise.com'
  }
});
```

#### Profile Usage in Tests

```typescript
test('profile-specific test', async ({ browser }) => {
  const profile = await profileManager.loadProfile('mobile');
  
  const context = await browser.newContext({
    userAgent: profile.settings.userAgent,
    viewport: profile.settings.viewport,
    locale: profile.settings.locale,
    timezoneId: profile.settings.timezone,
    permissions: profile.settings.permissions,
    isMobile: true,
    hasTouch: true
  });
  
  const page = await context.newPage();
  
  // Apply localStorage and sessionStorage
  await page.addInitScript((profile) => {
    for (const [key, value] of Object.entries(profile.settings.localStorage || {})) {
      localStorage.setItem(key, value);
    }
    for (const [key, value] of Object.entries(profile.settings.sessionStorage || {})) {
      sessionStorage.setItem(key, value);
    }
  }, profile);
  
  await page.goto(profile.metadata?.baseUrl || '/');
  
  // Test mobile-specific functionality
  await page.locator('[data-testid="mobile-menu"]').tap();
});
```

#### Profile Analytics and Monitoring

```typescript
// Profile usage analytics
class ProfileAnalytics {
  static async getProfileUsageStats(profileName: string) {
    const profile = await profileManager.loadProfile(profileName);
    
    return {
      name: profile.name,
      totalUsage: profile.lastUsed - profile.createdAt,
      avgSessionDuration: this.calculateAverageSessionTime(profile),
      preferredEnvironment: profile.metadata?.environment,
      successRate: this.calculateSuccessRate(profile)
    };
  }
  
  static async optimizeProfileSettings(profileName: string) {
    // Analyze usage patterns and suggest optimizations
    const stats = await this.getProfileUsageStats(profileName);
    
    const recommendations = [];
    
    if (stats.avgSessionDuration > 300000) { // 5 minutes
      recommendations.push('Consider reducing timeout values');
    }
    
    if (stats.successRate < 0.8) {
      recommendations.push('Review viewport and user-agent settings');
    }
    
    return recommendations;
  }
}
```

## Scaffold System API

### Advanced Code Generation

The scaffold system provides intelligent code generation with template inheritance and customization.

#### Page Object Generation

```typescript
import { scaffoldPage } from 'claude-playwright';

// Basic page generation
await scaffoldPage('LoginPage', {
  path: 'src/pages',
  extends: 'BasePage',
  selectors: {
    emailInput: '[data-testid="email"]',
    passwordInput: '[data-testid="password"]', 
    submitButton: '[data-testid="login-submit"]',
    errorMessage: '.error-message'
  },
  methods: {
    async login: ['email: string', 'password: string'],
    async expectError: ['message: string'],
    async clearForm: []
  }
});
```

**Generated Output:**
```typescript
import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class LoginPage extends BasePage {
  // Locators
  private readonly emailInput = '[data-testid="email"]';
  private readonly passwordInput = '[data-testid="password"]';
  private readonly submitButton = '[data-testid="login-submit"]';
  private readonly errorMessage = '.error-message';
  
  constructor(page: Page) {
    super(page);
  }
  
  // Navigation
  async goto() {
    await this.navigateTo('/login');
  }
  
  // Actions
  async login(email: string, password: string): Promise<void> {
    await this.fillForm({
      [this.emailInput]: email,
      [this.passwordInput]: password
    });
    await this.clickAndWait(this.submitButton);
  }
  
  async clearForm(): Promise<void> {
    await this.page.fill(this.emailInput, '');
    await this.page.fill(this.passwordInput, '');
  }
  
  // Assertions
  async expectError(message: string): Promise<void> {
    await expect(this.page.locator(this.errorMessage)).toContainText(message);
  }
}
```

#### Advanced Fixture Generation

```typescript
import { scaffoldFixture } from 'claude-playwright';

// Authentication fixture with session integration
await scaffoldFixture('AuthFixture', {
  path: 'src/fixtures',
  type: 'authentication',
  sessionIntegration: true,
  profiles: ['admin', 'user', 'guest'],
  features: {
    sessionManagement: true,
    profileSwitching: true,
    multiTenant: true
  }
});
```

**Generated Advanced Fixture:**
```typescript
import { test as base, expect } from '@playwright/test';
import { SessionManager, BrowserProfileManager } from 'claude-playwright';
import { BasePage } from '../pages/base-page';

export interface AuthFixtures {
  authenticatedPage: BasePage;
  sessionManager: SessionManager;
  profileManager: BrowserProfileManager;
  loginAs: (role: 'admin' | 'user' | 'guest') => Promise<void>;
  switchProfile: (profileName: string) => Promise<void>;
}

export const test = base.extend<AuthFixtures>({
  sessionManager: async ({}, use) => {
    const manager = new SessionManager();
    await use(manager);
  },
  
  profileManager: async ({}, use) => {
    const manager = new BrowserProfileManager();
    await use(manager);
  },
  
  authenticatedPage: async ({ page, sessionManager }, use) => {
    const authPage = new BasePage(page);
    
    // Load default user session
    try {
      const storageState = await sessionManager.loadSession('default-user');
      await page.context().addCookies(storageState.cookies || []);
    } catch (error) {
      console.warn('No default session found, continuing without authentication');
    }
    
    await use(authPage);
  },
  
  loginAs: async ({ page, sessionManager }, use) => {
    const loginAs = async (role: 'admin' | 'user' | 'guest') => {
      const sessionName = `${role}-session`;
      
      try {
        const storageState = await sessionManager.loadSession(sessionName);
        
        // Apply session to current context
        await page.context().clearCookies();
        await page.context().addCookies(storageState.cookies || []);
        
        // Apply localStorage/sessionStorage
        for (const origin of storageState.origins || []) {
          await page.addInitScript((data) => {
            for (const item of data.localStorage || []) {
              localStorage.setItem(item.name, item.value);
            }
            for (const item of data.sessionStorage || []) {
              sessionStorage.setItem(item.name, item.value);
            }
          }, origin);
        }
        
        console.log(`✓ Authenticated as ${role}`);
      } catch (error) {
        throw new Error(`Failed to authenticate as ${role}: ${error.message}`);
      }
    };
    
    await use(loginAs);
  },
  
  switchProfile: async ({ browser, profileManager }, use) => {
    const switchProfile = async (profileName: string) => {
      const profile = await profileManager.loadProfile(profileName);
      
      // Create new context with profile settings
      const context = await browser.newContext({
        userAgent: profile.settings.userAgent,
        viewport: profile.settings.viewport,
        locale: profile.settings.locale,
        timezoneId: profile.settings.timezone,
        permissions: profile.settings.permissions
      });
      
      return context;
    };
    
    await use(switchProfile);
  }
});

export { expect } from '@playwright/test';
```

#### Component-Based Scaffold Generation

```typescript
// Generate reusable UI components
await scaffoldComponent('NavigationComponent', {
  path: 'src/components',
  extends: 'BaseComponent',
  selectors: {
    menuButton: '[data-testid="menu-toggle"]',
    menuItems: '[data-testid="menu-item"]',
    userAvatar: '[data-testid="user-avatar"]',
    notifications: '[data-testid="notifications"]'
  },
  interactions: {
    openMenu: 'click',
    selectMenuItem: 'clickByText',
    openProfile: 'hover',
    viewNotifications: 'click'
  },
  responsive: {
    mobile: { hamburgerMenu: true },
    tablet: { collapsedMenu: true },
    desktop: { fullMenu: true }
  }
});
```

## SessionManager API

Enhanced SessionManager class with real browser integration and advanced session management.

### Class: SessionManager

```typescript
import { SessionManager } from 'claude-playwright';

const sessionManager = new SessionManager();
```

#### Constructor Options

```typescript
interface SessionManagerOptions {
  sessionsDir?: string;        // Default: './playwright-sessions'
  expirationHours?: number;    // Default: 8
}

const sessionManager = new SessionManager({
  sessionsDir: './custom-sessions',
  expirationHours: 24
});
```

### Methods

#### `saveSession(name: string, storageState: any): Promise<string>`
Save browser session state to file.

**Parameters:**
- `name` - Session identifier
- `storageState` - Playwright storage state object

**Returns:** 
- `Promise<string>` - Path to saved session file

**Example:**
```typescript
const storageState = await context.storageState();
const sessionPath = await sessionManager.saveSession('user-login', storageState);
console.log(`Session saved to: ${sessionPath}`);
```

#### `loadSession(name: string): Promise<any>`
Load browser session state from file.

**Parameters:**
- `name` - Session identifier

**Returns:**
- `Promise<any>` - Playwright storage state object

**Throws:**
- `Error` - If session not found or expired

**Example:**
```typescript
try {
  const storageState = await sessionManager.loadSession('user-login');
  const context = await browser.newContext({ storageState });
} catch (error) {
  console.error('Failed to load session:', error.message);
}
```

#### `listSessions(): Promise<SessionInfo[]>`
Get list of all saved sessions with metadata.

**Returns:**
- `Promise<SessionInfo[]>` - Array of session information

**SessionInfo Interface:**
```typescript
interface SessionInfo {
  name: string;
  created: string;      // ISO date string
  expires: string;      // ISO date string  
  expired: boolean;     // true if session is expired
  size?: number;        // File size in bytes
}
```

**Example:**
```typescript
const sessions = await sessionManager.listSessions();
sessions.forEach(session => {
  console.log(`${session.name}: ${session.expired ? 'Expired' : 'Active'}`);
});
```

#### `deleteSession(name: string): Promise<boolean>`
Delete a saved session.

**Parameters:**
- `name` - Session identifier

**Returns:**
- `Promise<boolean>` - true if deleted successfully

**Example:**
```typescript
const deleted = await sessionManager.deleteSession('old-session');
if (deleted) {
  console.log('Session deleted successfully');
}
```

#### `cleanExpiredSessions(): Promise<number>`
Remove all expired sessions.

**Returns:**
- `Promise<number>` - Number of sessions deleted

**Example:**
```typescript
const cleaned = await sessionManager.cleanExpiredSessions();
console.log(`Cleaned ${cleaned} expired sessions`);
```

## Generator APIs

The generator system provides programmatic access to code generation.

### Page Generator

```typescript
import { scaffoldPage } from 'claude-playwright';

await scaffoldPage('LoginPage', {
  path: 'src/pages',
  template: 'enterprise'  // minimal, enterprise, testing
});
```

### Test Generator

```typescript
import { scaffoldTest } from 'claude-playwright';

await scaffoldTest('auth-flow', {
  path: 'tests/e2e',
  template: 'testing'
});
```

### Custom Template Generator

```typescript
import { generateFromTemplate } from 'claude-playwright';

await generateFromTemplate('my-template.ts.template', {
  output: 'generated-file.ts',
  variables: {
    className: 'MyClass',
    description: 'Generated class'
  }
});
```

## Template System

The template system supports multiple project archetypes and custom templates.

### Built-in Templates

#### Minimal Template
- Basic Playwright configuration
- Essential Page Object Models
- Simple test examples
- Minimal dependencies

**Files included:**
- `playwright.config.ts`
- `CLAUDE.md`
- `BasePage.ts`
- `example.spec.ts`

#### Enterprise Template
- Advanced Playwright configuration
- Comprehensive Page Object architecture
- Docker configuration
- CI/CD workflows (GitHub Actions)
- Authentication fixtures
- Data generation utilities

**Files included:**
- `playwright.config.ts` (advanced)
- `CLAUDE.md` (detailed)
- `docker-compose.yml`
- `.github/workflows/tests.yml`
- `BasePage.ts`
- `BaseComponent.ts`
- `AuthFixture.ts`
- `DataGenerator.ts`

#### Testing Template
- Testing-optimized configuration
- Advanced fixtures and helpers
- Custom test utilities
- Performance testing setup

**Files included:**
- `playwright.config.ts` (testing-focused)
- `CLAUDE.md`
- `BasePage.ts`
- `BaseFixture.ts`
- `TestHelpers.ts`
- `PerformanceHelpers.ts`

### Custom Templates

Create custom templates using the `.template` extension:

#### Template Variables
Templates support variable substitution using `{{variable}}` syntax:

```typescript
// MyPage.ts.template
import { Page } from '@playwright/test';
import { BasePage } from './base/BasePage';

export class {{className}} extends BasePage {
  constructor(page: Page) {
    super(page);
  }
  
  async goto() {
    await this.navigateTo('{{route}}');
  }
}
```

#### Using Custom Templates

```typescript
import { applyTemplate } from 'claude-playwright';

await applyTemplate('MyPage.ts.template', {
  output: 'src/pages/CustomPage.ts',
  variables: {
    className: 'CustomPage',
    route: '/custom'
  }
});
```

### Template Functions

#### `loadTemplate(name: string): Promise<string>`
Load template content from file.

#### `applyTemplate(templatePath: string, options: TemplateOptions): Promise<void>`
Apply template with variable substitution.

#### `validateTemplate(content: string): boolean`
Validate template syntax and required variables.

## Error Handling

The toolkit provides comprehensive error handling with contextual messages.

### Error Classes

#### `ToolkitError`
Base error class for all toolkit errors.

```typescript
class ToolkitError extends Error {
  constructor(
    message: string,
    public code: string,
    public context?: any
  ) {
    super(message);
  }
}
```

#### `ConfigurationError`
Thrown when configuration is invalid or missing.

```typescript
class ConfigurationError extends ToolkitError {
  constructor(message: string, context?: any) {
    super(message, 'CONFIGURATION_ERROR', context);
  }
}
```

#### `SessionError`
Thrown during session management operations.

```typescript
class SessionError extends ToolkitError {
  constructor(message: string, sessionName?: string) {
    super(message, 'SESSION_ERROR', { sessionName });
  }
}
```

### Error Codes

| Code | Description | Common Causes |
|------|-------------|---------------|
| `CONFIGURATION_ERROR` | Invalid or missing configuration | Missing MCP config, invalid project structure |
| `SESSION_ERROR` | Session management failure | Session not found, expired session |
| `TEMPLATE_ERROR` | Template processing failure | Invalid template syntax, missing variables |
| `FILE_ERROR` | File system operation failure | Permission denied, file not found |
| `NETWORK_ERROR` | Network operation failure | MCP server unreachable |

### Error Handling Best Practices

```typescript
try {
  await sessionManager.loadSession('user-session');
} catch (error) {
  if (error instanceof SessionError) {
    console.log('Session issue:', error.message);
    // Handle session-specific error
  } else if (error instanceof ConfigurationError) {
    console.log('Configuration issue:', error.message);
    // Handle configuration error
  } else {
    console.log('Unexpected error:', error);
    // Handle unexpected error
  }
}
```

## Configuration

### MCP Configuration

The toolkit automatically configures MCP in `~/.claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": [
        "@playwright/mcp@latest",
        "--browser=chromium",
        "--headless=false",
        "--user-data-dir=./browser-profiles/default"
      ]
    }
  }
}
```

### Project Configuration

#### `playwright.config.ts`
Optimized Playwright configuration generated by the toolkit:

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Use persistent browser profile
    launchOptions: {
      args: ['--user-data-dir=./browser-profiles/default']
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
```

#### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PLAYWRIGHT_SESSIONS_DIR` | Sessions directory | `./playwright-sessions` |
| `PLAYWRIGHT_SESSION_EXPIRY` | Session expiry (hours) | `8` |
| `CLAUDE_MCP_CONFIG_PATH` | MCP config file path | `~/.claude/claude_desktop_config.json` |
| `DEBUG` | Enable debug output | `false` |

### Customization

#### Session Configuration
```typescript
// Custom session manager
const sessionManager = new SessionManager({
  sessionsDir: process.env.PLAYWRIGHT_SESSIONS_DIR || './custom-sessions',
  expirationHours: parseInt(process.env.PLAYWRIGHT_SESSION_EXPIRY) || 24
});
```

#### Template Configuration
```typescript
// Custom template directory
const templateLoader = new TemplateLoader({
  templatesDir: './custom-templates',
  cache: true
});
```

## Integration Examples

### CI/CD Integration

```yaml
# .github/workflows/tests.yml
name: Playwright Tests
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: npm ci
        
      - name: Install Claude-Playwright
        run: npm install -g claude-playwright
        
      - name: Setup project
        run: claude-playwright configure-mcp
        
      - name: Run Playwright tests
        run: npm run test
```

### Docker Integration

```dockerfile
# Dockerfile
FROM mcr.microsoft.com/playwright:latest

WORKDIR /app
COPY package*.json ./
RUN npm ci

# Install Claude-Playwright toolkit
RUN npm install -g claude-playwright

COPY . .
RUN claude-playwright configure-mcp

CMD ["npm", "run", "test"]
```