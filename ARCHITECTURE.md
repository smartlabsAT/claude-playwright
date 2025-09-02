# Claude Playwright - Technical Architecture

## Overview

Claude Playwright is a TypeScript-based toolkit that bridges Claude Code and Playwright through the Model Context Protocol (MCP), enabling browser automation directly from Claude's interface.

## Technology Stack

- **Language**: TypeScript 5.1+
- **Runtime**: Node.js 16+
- **Build System**: tsup (ESBuild-based)
- **Package Format**: Dual CJS/ESM
- **Browser Engine**: Playwright 1.40+
- **Protocol**: MCP SDK 1.17+
- **CLI Framework**: Commander 11.0
- **Development**: yalc for local testing

## System Architecture

```
┌─────────────────┐
│   Claude Code   │
│   (MCP Client)  │
└────────┬────────┘
         │ JSON-RPC
         ▼
┌─────────────────┐
│   MCP Server    │
│ (server.cjs)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   Playwright    │
│   Browser API   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Chrome/Firefox  │
│   (Browser)     │
└─────────────────┘
```

## Project Structure

```
claude-playwright-toolkit/
├── src/                        # TypeScript Source
│   ├── mcp/
│   │   └── server.ts          # MCP server implementation
│   ├── cli/
│   │   ├── index.ts           # CLI entry point
│   │   ├── session-commands.ts
│   │   └── profile-commands.ts
│   ├── core/
│   │   ├── session-manager.ts # Session persistence
│   │   ├── browser-profile.ts # Profile management
│   │   └── browser-manager.ts # Browser lifecycle
│   ├── utils/
│   │   ├── mcp-integration.ts
│   │   └── session-helper.ts
│   ├── commands/
│   │   └── mcp.ts             # MCP subcommands
│   ├── types/
│   │   └── cli-types.ts       # TypeScript definitions
│   └── index.ts               # Main library exports
├── dist/                      # Build Output
│   ├── mcp/
│   │   ├── server.cjs         # CommonJS for MCP
│   │   ├── server.js          # ESM version
│   │   └── server.d.ts        # Type definitions
│   ├── cli/
│   │   ├── index.js           # CLI CommonJS
│   │   └── index.mjs          # CLI ESM
│   └── index.*                # Library exports
├── bin/
│   └── claude-playwright.js   # CLI executable
├── docs/                      # Documentation
├── examples/                  # Usage examples
├── tests/                     # Test files
└── tsup.config.ts            # Build configuration
```

## Build System

### tsup Configuration

```typescript
// Multiple entry points with different configurations
export default defineConfig([
  {
    entry: ['src/cli/index.ts'],
    format: ['cjs', 'esm'],
    target: 'node18',
    dts: true,
    sourcemap: true,
    clean: true,
    outDir: 'dist/cli'
  },
  {
    entry: ['src/mcp/server.ts'],
    format: ['cjs', 'esm'],
    target: 'node18',
    bundle: false,  // Don't bundle dependencies
    external: ['@modelcontextprotocol/sdk', 'playwright'],
    outDir: 'dist/mcp'
  },
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    dts: true,
    outDir: 'dist'
  }
]);
```

## Core Components

### 1. MCP Server (`src/mcp/server.ts`)

**Responsibilities:**
- Handle JSON-RPC communication with Claude Code
- Execute browser automation commands
- Manage browser lifecycle
- Track console messages and network requests

**Key Features:**
- 20+ browser automation tools
- Automatic BASE_URL rewriting
- Session persistence support
- Error handling and recovery

**Tools Provided:**
- Navigation: `browser_navigate`, `browser_navigate_back`
- Interaction: `browser_click`, `browser_type`, `browser_fill_form`
- Visual: `browser_screenshot`, `browser_snapshot`
- Monitoring: `browser_console_messages`, `browser_network_requests`
- Advanced: `browser_tabs`, `browser_wait_for`, `browser_evaluate`

### 2. CLI System (`src/cli/`)

**Commands:**
```
claude-playwright
├── mcp
│   ├── init       # Initialize MCP config
│   ├── status     # Check MCP status
│   └── docs       # View documentation
├── session
│   ├── save       # Save browser session
│   ├── list       # List sessions
│   ├── load       # Load session
│   ├── health     # Check health
│   ├── extend     # Extend expiry
│   ├── delete     # Delete session
│   ├── clear      # Clear expired
│   └── switch     # Switch active
└── profile
    ├── setup      # Create defaults
    ├── list       # List profiles
    ├── create     # Create custom
    ├── show       # Show details
    └── delete     # Delete profile
```

### 3. Session Manager (`src/core/session-manager.ts`)

**Features:**
- Browser session capture with real authentication
- Cookie persistence
- LocalStorage/SessionStorage capture
- 8-hour expiration with auto-cleanup
- Session health monitoring

**Storage Format:**
```json
{
  "cookies": [...],
  "localStorage": {...},
  "sessionStorage": {...},
  "metadata": {
    "created": "2025-08-28T10:00:00Z",
    "expires": "2025-08-28T18:00:00Z",
    "profile": "desktop",
    "url": "https://example.com"
  }
}
```

### 4. Profile Manager (`src/core/browser-profile.ts`)

**Default Profiles:**
- Desktop: 1920x1080
- Mobile: 375x667 (iPhone)
- Tablet: 768x1024 (iPad)

**Profile Configuration:**
```typescript
interface ProfileConfig {
  viewport: { width: number; height: number }
  userAgent?: string
  deviceType: 'desktop' | 'mobile' | 'tablet'
  permissions?: string[]
  geolocation?: { latitude: number; longitude: number }
}
```

## Data Flow

### MCP Communication Flow
```
1. Claude Code → MCP Request → server.cjs
2. server.cjs → Parse Tool/Parameters
3. Execute Playwright Command
4. Capture Result/Error
5. Return JSON-RPC Response → Claude Code
```

### Session Management Flow
```
1. CLI: session save → Launch Browser
2. User: Manual Login
3. Capture: Cookies + Storage
4. Encrypt & Store: .claude-playwright/sessions/ (project-local)
5. Load: Restore to Browser Context
```

## Package Exports

### Main Library (`src/index.ts`)
```typescript
export { SessionManager }
export { BrowserProfileManager }
export { program }  // CLI for programmatic use
export * from './types/cli-types'
export { SessionHelper }
export { MCPIntegration }
```

### Package.json Exports
```json
{
  ".": {
    "import": "./dist/index.js",
    "require": "./dist/index.cjs",
    "types": "./dist/index.d.ts"
  },
  "./mcp": {
    "import": "./dist/mcp/server.js",
    "require": "./dist/mcp/server.cjs"
  },
  "./cli": {
    "import": "./dist/cli/index.mjs",
    "require": "./dist/cli/index.js"
  }
}
```

## Configuration

### MCP Configuration (`.mcp.json`)
```json
{
  "mcpServers": {
    "playwright": {
      "command": "node",
      "args": ["node_modules/claude-playwright/dist/mcp/server.cjs"],
      "env": {
        "BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Environment Variables
- `BASE_URL`: Target application base URL
- `PLAYWRIGHT_HEADLESS`: Headless mode (default: false)
- `PLAYWRIGHT_SLOW_MO`: Operation delay in ms
- `PLAYWRIGHT_TIMEOUT`: Default timeout
- `PLAYWRIGHT_ACTIVE_SESSION`: Current session
- `PLAYWRIGHT_ACTIVE_PROFILE`: Current profile

## Security Considerations

1. **Session Storage**: Stored project-locally in `.claude-playwright/`
2. **No Encryption**: Sessions stored as plain JSON (future: encryption)
3. **8-Hour Expiry**: Automatic session invalidation
4. **Local Only**: No network transmission of sessions
5. **Permission Model**: Browser permissions per profile

## Performance

- **Build Time**: ~2-3 seconds full rebuild
- **MCP Startup**: <1 second
- **Session Load**: <500ms
- **Browser Launch**: 1-2 seconds
- **Package Size**: ~71KB CLI, ~24KB MCP server

## Dependencies

### Production
- `@modelcontextprotocol/sdk`: ^1.17.4
- `playwright`: ^1.40.0
- `commander`: ^11.0.0
- `fs-extra`: ^11.1.1
- `chalk`: ^4.1.2
- `zod`: ^3.22.0

### Development
- `typescript`: ^5.1.6
- `tsup`: ^8.5.0
- `tsx`: ^4.20.5
- `@types/node`: ^20.5.0

---

**Last Updated**: 2025-08-28  
**Version**: 0.1.0-alpha.16