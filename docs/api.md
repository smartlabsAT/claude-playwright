# Claude Playwright API Documentation

Complete API reference for the Claude Playwright toolkit, including CLI commands, session management, profile management, and MCP integration.

## Table of Contents
- [CLI Commands](#cli-commands)
- [Session Management API](#session-management-api)
- [Profile Management API](#profile-management-api)
- [MCP Server API](#mcp-server-api)
- [Core Classes](#core-classes)
- [Configuration](#configuration)
- [Error Handling](#error-handling)

## CLI Commands

### MCP Management Commands

#### `claude-playwright mcp init`
Initialize MCP configuration for Claude Code integration.

```bash
claude-playwright mcp init [options]
```

**Options:**
- `-b, --base-url <url>` - Base URL for your application (default: http://localhost:3000)
- `-f, --force` - Overwrite existing configuration

**Example:**
```bash
# Initialize with custom base URL
claude-playwright mcp init --base-url http://localhost:3002

# Force overwrite existing config
claude-playwright mcp init --force
```

#### `claude-playwright mcp status`
Check MCP server status and configuration.

```bash
claude-playwright mcp status
```

**Output includes:**
- Configuration file status
- BASE_URL setting
- MCP server availability
- Session directory status

#### `claude-playwright mcp docs`
View MCP server documentation.

```bash
claude-playwright mcp docs
```

### Session Management Commands

#### `claude-playwright session save`
Save a browser session with authentication state.

```bash
claude-playwright session save <name> [options]
```

**Options:**
- `--url <url>` - URL to navigate to for login
- `--profile <profile>` - Browser profile to use (desktop, mobile, tablet)

**Example:**
```bash
# Save session with manual URL entry
claude-playwright session save myapp

# Save session with specific URL
claude-playwright session save admin --url https://myapp.com/login

# Save session with mobile profile
claude-playwright session save mobile-user --profile mobile
```

#### `claude-playwright session list`
List all saved sessions.

```bash
claude-playwright session list
```

**Output format:**
```
Name        Created              Expires              Status
─────────────────────────────────────────────────────────────
admin       2025-08-28 10:00    2025-08-28 18:00    VALID
user        2025-08-27 14:00    2025-08-27 22:00    EXPIRED
```

#### `claude-playwright session load`
Load a saved session into environment.

```bash
claude-playwright session load <name>
```

#### `claude-playwright session delete`
Delete a saved session.

```bash
claude-playwright session delete <name>
```

#### `claude-playwright session health`
Check health status of sessions.

```bash
# Check all sessions
claude-playwright session health

# Check specific session
claude-playwright session health <name>
```

#### `claude-playwright session extend`
Extend an expiring session.

```bash
claude-playwright session extend <name>
```

#### `claude-playwright session clear`
Clear all expired sessions.

```bash
claude-playwright session clear
```

#### `claude-playwright session switch`
Switch the active session for MCP.

```bash
claude-playwright session switch <name>
```

### Profile Management Commands

#### `claude-playwright profile setup`
Create default browser profiles.

```bash
claude-playwright profile setup [options]
```

**Options:**
- `--force` - Overwrite existing profiles

**Creates:**
- `desktop` - 1920x1080 viewport
- `mobile` - 375x667 viewport (iPhone-style)
- `tablet` - 768x1024 viewport (iPad-style)

#### `claude-playwright profile create`
Create a custom browser profile.

```bash
claude-playwright profile create <name> [options]
```

**Options:**
- `--device <type>` - Device type: desktop, mobile, tablet
- `--viewport <size>` - Viewport size (e.g., "1440x900")
- `--user-agent <ua>` - Custom user agent string
- `--description <desc>` - Profile description

**Example:**
```bash
# Create iPhone 14 profile
claude-playwright profile create iphone14 --device mobile --viewport 390x844

# Create custom desktop profile
claude-playwright profile create wide --device desktop --viewport 2560x1440 --description "Wide screen monitor"
```

#### `claude-playwright profile list`
List all available profiles.

```bash
claude-playwright profile list
```

#### `claude-playwright profile show`
Show details of a specific profile.

```bash
claude-playwright profile show <name>
```

#### `claude-playwright profile delete`
Delete a profile.

```bash
claude-playwright profile delete <name>
```

## Session Management API

### SessionManager Class

```typescript
class SessionManager {
  constructor(projectDir: string)
  
  // Session operations
  async saveSession(name: string, options?: SaveSessionOptions): Promise<boolean>
  async loadSession(name: string): Promise<SessionData | null>
  async deleteSession(name: string): Promise<boolean>
  async listSessions(): Promise<SessionInfo[]>
  
  // Session health
  async checkSessionHealth(name: string): Promise<HealthStatus>
  async checkAllSessionsHealth(): Promise<HealthStatus[]>
  async extendSession(name: string): Promise<boolean>
  async clearExpiredSessions(): Promise<number>
  
  // Active session management
  async getActiveSession(): Promise<string | null>
  async switchSession(name: string): Promise<boolean>
}
```

### Types

```typescript
interface SaveSessionOptions {
  browserProfile?: string
  timeout?: number
  headless?: boolean
}

interface SessionData {
  cookies: Cookie[]
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
  metadata: SessionMetadata
}

interface SessionMetadata {
  name: string
  created: Date
  expires: Date
  lastUsed: Date
  profile?: string
  url?: string
}

interface HealthStatus {
  name: string
  isValid: boolean
  hoursRemaining: number
  needsExtension: boolean
  recommendation: string
}
```

## Profile Management API

### ProfileManager Class

```typescript
class ProfileManager {
  constructor()
  
  // Profile operations
  async createProfile(name: string, config: ProfileConfig): Promise<boolean>
  async getProfile(name: string): Promise<Profile | null>
  async deleteProfile(name: string): Promise<boolean>
  async listProfiles(): Promise<ProfileInfo[]>
  
  // Default profiles
  async setupDefaultProfiles(force?: boolean): Promise<void>
  
  // Profile usage
  async applyProfile(name: string, context: BrowserContext): Promise<void>
  async getProfileConfig(name: string): Promise<LaunchOptions>
}
```

### Types

```typescript
interface ProfileConfig {
  viewport?: { width: number; height: number }
  userAgent?: string
  deviceType?: 'desktop' | 'mobile' | 'tablet'
  description?: string
  permissions?: string[]
  geolocation?: { latitude: number; longitude: number }
  locale?: string
  timezone?: string
}

interface Profile extends ProfileConfig {
  name: string
  created: Date
  lastUsed?: Date
}
```

## MCP Server API

### Available Tools

The MCP server exposes the following tools to Claude Code:

```typescript
interface MCPTools {
  // Navigation
  browser_navigate(params: { url: string }): Promise<void>
  browser_navigate_back(): Promise<void>
  browser_close(): Promise<void>
  
  // Interaction
  browser_click(params: { 
    selector: string
    button?: 'left' | 'right' | 'middle'
    doubleClick?: boolean 
  }): Promise<void>
  
  browser_type(params: {
    selector: string
    text: string
    slowly?: boolean
    submit?: boolean
  }): Promise<void>
  
  browser_fill_form(params: {
    fields: Array<{
      selector: string
      value: string
      type?: 'textbox' | 'checkbox' | 'radio' | 'combobox'
    }>
  }): Promise<void>
  
  // Visual & Data
  browser_screenshot(params: {
    selector?: string
    fullPage?: boolean
    filename?: string
  }): Promise<string>
  
  browser_snapshot(): Promise<AccessibilityTree>
  
  browser_evaluate(params: {
    function: string
  }): Promise<any>
  
  // Monitoring
  browser_console_messages(): Promise<ConsoleMessage[]>
  browser_network_requests(): Promise<NetworkRequest[]>
  
  // Advanced
  browser_tabs(params: {
    action: 'list' | 'new' | 'close' | 'select'
    index?: number
  }): Promise<TabInfo[]>
  
  browser_wait_for(params: {
    text?: string
    textGone?: string
    time?: number
  }): Promise<void>
}
```

## Core Classes

### BrowserManager Class

```typescript
class BrowserManager {
  constructor(options?: BrowserOptions)
  
  // Browser lifecycle
  async launch(options?: LaunchOptions): Promise<Browser>
  async close(): Promise<void>
  
  // Page management
  async newPage(options?: PageOptions): Promise<Page>
  async getPage(): Promise<Page | null>
  
  // Context management
  async createContext(options?: ContextOptions): Promise<BrowserContext>
  async clearContext(): Promise<void>
}
```

### MCPIntegration Class

```typescript
class MCPIntegration {
  constructor(projectDir: string)
  
  // Status reporting
  async getStatusReport(): Promise<StatusReport>
  
  // Configuration
  async updateConfig(config: MCPConfig): Promise<void>
  async getConfig(): Promise<MCPConfig | null>
}
```

## Configuration

### .mcp.json Configuration

```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["node_modules/claude-playwright/dist/mcp/server.cjs"],
      "env": {
        "BASE_URL": "http://localhost:3000",
        "PLAYWRIGHT_HEADLESS": "false",
        "PLAYWRIGHT_SLOW_MO": "0",
        "PLAYWRIGHT_TIMEOUT": "30000"
      }
    }
  }
}
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BASE_URL` | Base URL for the application | http://localhost:3000 |
| `PLAYWRIGHT_HEADLESS` | Run browsers in headless mode | false |
| `PLAYWRIGHT_SLOW_MO` | Slow down operations (ms) | 0 |
| `PLAYWRIGHT_TIMEOUT` | Default timeout (ms) | 30000 |
| `PLAYWRIGHT_ACTIVE_SESSION` | Currently active session | - |
| `PLAYWRIGHT_ACTIVE_PROFILE` | Currently active profile | - |

## Error Handling

### Error Types

```typescript
enum ErrorType {
  SESSION_NOT_FOUND = 'SESSION_NOT_FOUND',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  MCP_CONNECTION_ERROR = 'MCP_CONNECTION_ERROR',
  BROWSER_LAUNCH_ERROR = 'BROWSER_LAUNCH_ERROR',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR'
}

class PlaywrightError extends Error {
  constructor(
    message: string,
    type: ErrorType,
    details?: any
  )
}
```

### Error Handling Examples

```typescript
// CLI error handling
try {
  await sessionManager.saveSession('myapp')
} catch (error) {
  if (error.type === ErrorType.BROWSER_LAUNCH_ERROR) {
    console.error('Failed to launch browser:', error.message)
  }
}

// MCP server error handling
try {
  await page.click(selector)
} catch (error) {
  if (error.name === 'TimeoutError') {
    return { error: 'Element not found within timeout' }
  }
}
```

## TypeScript Support

All APIs are fully typed with TypeScript definitions:

```typescript
import { 
  SessionManager,
  ProfileManager,
  BrowserManager,
  MCPIntegration 
} from 'claude-playwright'

import type {
  SessionData,
  Profile,
  MCPConfig,
  HealthStatus
} from 'claude-playwright'
```

## Version Compatibility

| Package Version | Node.js | Playwright | MCP SDK |
|----------------|---------|------------|---------|
| 0.1.0-alpha.x  | ≥16.0.0 | ^1.40.0   | ^1.17.4 |

---

**Last Updated**: 2025-08-28  
**API Version**: 0.1.0-alpha.16