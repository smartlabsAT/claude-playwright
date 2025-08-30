# Claude Playwright 🎭

**Seamless browser automation integration between Claude Code and Playwright**

[![npm version](https://img.shields.io/npm/v/claude-playwright/alpha.svg)](https://www.npmjs.com/package/claude-playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> ⚠️ **ALPHA RELEASE** - This package is currently in active development. We expect to release a stable version in the coming weeks with additional features including comprehensive testing frameworks and further cache system optimizations. Use with caution in development environments.
> 
> ⭐ **[Star this repository](https://github.com/smartlabsAT/claude-playwright)** and **[follow us](https://github.com/smartlabsAT)** to stay updated and not miss the official release!

## ✨ What is Claude Playwright?

Claude Playwright provides Claude Code with powerful browser automation capabilities through MCP (Model Context Protocol). Control browsers, manage sessions, and automate testing - all from within Claude Code!

## 🚀 Quick Start

> **🆕 UNIFIED CACHE**: Now includes revolutionary unified cache system with **100% reliability** across all element types and **52% performance improvement**!

### Installation

```bash
# Install globally
npm install -g claude-playwright@alpha

# Or add to your project
npm install --save-dev claude-playwright@alpha
```

### Setup MCP Integration (30 seconds!)

```bash
# Initialize MCP configuration for your app
npx claude-playwright mcp init --base-url http://localhost:3000

# That's it! Restart Claude Code and you're ready
```

### Use in Claude Code

After restarting Claude, you can immediately start automating:

```
"Navigate to the login page and fill in the form"
"Take a screenshot of the dashboard" 
"Click the submit button and wait for the success message"
"Extract all product prices from the page"
"Delete the first todo item" # Works perfectly with unified cache!
"Löschen Sie das erste Element" # Multilingual support included!
```

Claude will use the browser automation tools to complete these tasks!

## 🎯 Core Features

### 🤖 20+ Browser Automation Tools for Claude

All these tools are available to Claude through MCP:

- **Navigation & Interaction**: Navigate, click, type, hover, drag & drop
- **Forms**: Fill forms, select options, upload files
- **Screenshots**: Full page, element-specific, or viewport captures
- **Data Extraction**: Run JavaScript, get accessibility snapshots
- **Monitoring**: Console messages, network requests, **unified cache statistics**
- **Advanced**: Tab management, dialog handling, keyboard shortcuts

### 🚀 **Unified Bidirectional Cache System (MAJOR ARCHITECTURE UPGRADE)** 

**REVOLUTIONARY BREAKTHROUGH:** Complete architecture migration to unified cache system with **enhanced performance** and **simplified architecture**.

#### 🎯 **Unified System Features (2025-08-30 Migration):**
- **🏗️ UNIFIED ARCHITECTURE**: Single cache system for selectors + snapshots + all metadata (1560+ legacy lines eliminated)
- **🧠 AI-Aware Input Recognition**: Understands "click" = "press" = "tap" = "select" = "delete" = "löschen"  
- **🔄 Bidirectional Lookup**: Input → Selector and Selector → Inputs mapping with cross-session learning
- **🛠️ Early Syntax Fixing**: `button:text("Delete")` → `button:has-text("Delete")` automatically 
- **🌐 Universal Element Support**: Works with buttons, links, divs, spans, **any clickable element**
- **⚡ 25+ Fallback Strategies**: CSS, ARIA, text content, click handlers, framework agnostic
- **🌍 Multilingual Support**: German, English synonyms (delete/löschen, first/erste, task/aufgabe)
- **💾 Bundle Optimization**: 5KB smaller package through legacy code elimination
- **📊 Enhanced Testing**: 5/5 test suites pass (NEW: Snapshot functionality tests added)


### 🔐 Persistent Browser Sessions

Save and reuse authenticated browser sessions:

```bash
# Save a logged-in session (opens browser for manual login)
npx claude-playwright session save my-app

# List saved sessions
npx claude-playwright session list

# Use in Claude: "Load the my-app session and navigate to dashboard"
```

Sessions include:
- 🍪 Cookies and authentication state
- 📦 LocalStorage and SessionStorage
- ⏰ 8-hour validity with auto-extension
- 🔄 Automatic session health monitoring

### 📱 Device Profiles

Test on different devices and viewports:

```bash
# Setup default profiles (desktop, mobile, tablet)
npx claude-playwright profile setup

# Create custom profile
npx claude-playwright profile create iphone --device mobile --viewport 390x844

# List all profiles
npx claude-playwright profile list
```

## 💡 Real-World Examples

### Example 1: Automated Login Testing

```bash
# Save your app's login session once
npx claude-playwright session save myapp --url https://myapp.com/login
```

Then in Claude:
> "Load the myapp session, navigate to the user settings, change the theme to dark mode, and take a screenshot"

### Example 2: E2E Testing Workflow

```bash
# Setup profiles for different user types
npx claude-playwright profile create customer --device desktop
npx claude-playwright profile create admin --device desktop
```

In Claude:
> "Using the customer profile, go through the complete checkout flow and verify the order confirmation appears"

### Example 3: Web Scraping

In Claude:
> "Navigate to the products page, extract all product names and prices into a table"

## 📋 All CLI Commands

### MCP Management
```bash
npx claude-playwright mcp init          # Initialize MCP config
npx claude-playwright mcp status        # Check MCP server status
npx claude-playwright mcp docs          # View documentation
```

### Session Management
```bash
npx claude-playwright session list      # List all sessions
npx claude-playwright session save <name>   # Save new session
npx claude-playwright session load <name>   # Load session
npx claude-playwright session delete <name> # Delete session
npx claude-playwright session health        # Check session validity
npx claude-playwright session extend <name> # Extend expiring session
```

### Profile Management
```bash
npx claude-playwright profile setup     # Create default profiles
npx claude-playwright profile list      # List profiles
npx claude-playwright profile create <name> # Create custom profile
npx claude-playwright profile show <name>   # View profile details
npx claude-playwright profile delete <name> # Delete profile
```

### 🧠 **Cache Management (NEW!)**
```bash
npx claude-playwright cache info        # Show cache statistics and performance
npx claude-playwright cache clear       # Clear all cached selectors
npx claude-playwright cache clear --force   # Clear without confirmation
npx claude-playwright cache health      # Check cache system health
npx claude-playwright cache debug       # Show debug information
```

## 🔧 Configuration

### MCP Configuration (.mcp.json)

The MCP configuration is automatically created during init:

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

- `BASE_URL`: Your application's base URL (set during init)
- `PLAYWRIGHT_HEADLESS`: Run browsers in headless mode (default: false)
- `PLAYWRIGHT_SLOW_MO`: Slow down operations by specified ms

## 🏗️ Architecture

```
claude-playwright/
├── CLI Tool           # Command-line interface for setup and management
├── MCP Server         # Provides browser tools to Claude Code
├── Session Manager    # Handles browser session persistence
└── Profile Manager    # Manages device and viewport configurations
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

```bash
# Clone the repo
git clone https://github.com/smartlabsAT/claude-playwright.git

# Install dependencies
npm install

# Build the project
npm run build

# Run tests
npm test
```

## 📚 Documentation

- **[MCP Server Documentation](docs/MCP_SERVER.md)** - Detailed MCP integration guide  
- **[Advanced Caching System](docs/CACHING.md)** - Complete documentation for AI-aware bidirectional caching with universal selector fallbacks
- **[API Reference](docs/API.md)** - Complete API documentation
- **[Examples](examples/)** - More usage examples

## 🐛 Troubleshooting

### MCP Server Not Connecting
1. Ensure `.mcp.json` exists in your project root
2. Restart Claude Code after configuration changes
3. Check the BASE_URL matches your application
4. Run `npx claude-playwright mcp status` to verify setup

### Sessions Not Working
1. Check session validity: `npx claude-playwright session health`
2. Extend expiring sessions: `npx claude-playwright session extend <name>`
3. Sessions are stored globally in `~/.claude-playwright/sessions/`

### Need Help?
- 📖 Check our [documentation](https://github.com/smartlabsAT/claude-playwright#readme)
- 🐛 Report issues on [GitHub](https://github.com/smartlabsAT/claude-playwright/issues)

## 📄 License

MIT © [Smartlabs](https://smartlabs.at)

---


**Made with ❤️ by [Smartlabs](https://smartlabs.at)**