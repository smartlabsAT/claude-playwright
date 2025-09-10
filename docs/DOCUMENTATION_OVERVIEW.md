# 📚 Claude Playwright - Documentation Overview

## 🚀 Quick Start

### Getting Started
1. **[README.md](../README.md)** - Complete project overview and installation guide
2. **[MCP_SERVER.md](MCP_SERVER.md)** - Detailed MCP integration documentation
3. **[CACHING.md](CACHING.md)** - Advanced caching system documentation
4. **[INTELLIGENT_TESTING.md](INTELLIGENT_TESTING.md)** - Test management system

### Development
1. **[CLAUDE.md](../CLAUDE.md)** - Development workflow and guidelines
2. **[API Reference](api.md)** - Complete API documentation

## 🎯 Core Features

### 1. MCP Management
```bash
claude-playwright mcp init          # Initialize MCP configuration
claude-playwright mcp status        # Check MCP server status
claude-playwright mcp docs          # View documentation
```

### 2. Session Management
```bash
claude-playwright session list      # List all sessions
claude-playwright session save <name>   # Save browser session
claude-playwright session load <name>   # Load saved session
claude-playwright session health        # Check session validity
claude-playwright session extend <name> # Extend expiring session
claude-playwright session delete <name> # Delete session
claude-playwright session clear         # Clear expired sessions
claude-playwright session switch <name> # Switch active session
```

### 3. Profile Management
```bash
claude-playwright profile setup         # Create default profiles
claude-playwright profile list          # List all profiles
claude-playwright profile create <name> # Create custom profile
claude-playwright profile show <name>   # Show profile details
claude-playwright profile delete <name> # Delete profile
```

## 📁 Architecture

### Core Components
```
src/
├── mcp/           # MCP server (TypeScript)
│   └── server.ts  # Browser automation tools
├── cli/           # CLI implementation
│   └── index.ts   # Command line interface
├── core/          # Business logic
│   ├── session-manager.ts
│   ├── profile-manager.ts
│   └── browser-manager.ts
├── utils/         # Utilities
└── commands/      # CLI subcommands
    └── mcp.ts     # MCP command implementation
```

### Build Output
```
dist/
├── mcp/           # Compiled MCP server
│   ├── server.cjs # CommonJS version
│   └── server.js  # ES Module version
├── cli/           # Compiled CLI
└── index.*        # Main library exports
```

## 🔧 Key Technologies

- **TypeScript**: Full type safety across the codebase
- **tsup**: Fast dual-format bundling (CJS/ESM)
- **Playwright**: Browser automation engine
- **MCP SDK**: Model Context Protocol for Claude integration
- **Commander**: CLI framework
- **yalc**: Local package development

## 📋 Available MCP Tools

The MCP server provides 20+ browser automation tools:

### Navigation
- `browser_navigate` - Navigate to URLs
- `browser_navigate_back` - Go back in history
- `browser_close` - Close browser

### Interaction
- `browser_click` - Click elements
- `browser_type` - Type text
- `browser_fill_form` - Fill multiple fields
- `browser_select_option` - Select dropdown options
- `browser_hover` - Hover over elements
- `browser_drag` - Drag and drop
- `browser_press_key` - Keyboard input
- `browser_file_upload` - Upload files

### Data & Visuals
- `browser_screenshot` - Take screenshots
- `browser_snapshot` - Get accessibility tree
- `browser_evaluate` - Execute JavaScript

### Monitoring
- `browser_console_messages` - Get console output
- `browser_network_requests` - Monitor network

### Advanced
- `browser_tabs` - Manage tabs
- `browser_wait_for` - Wait for conditions
- `browser_handle_dialog` - Handle alerts/confirms
- `browser_resize` - Resize window

## 🚀 Usage Examples

### Basic Automation in Claude
```
"Navigate to the login page and fill in the form"
"Take a screenshot of the dashboard"
"Extract all product prices from the page"
```

### Session-Based Testing
```bash
# Save session once
npx claude-playwright session save myapp --url https://myapp.com/login

# Use in Claude
"Load the myapp session and navigate to settings"
```

### Multi-Device Testing
```bash
# Setup profiles
npx claude-playwright profile setup

# Test on different devices in Claude
"Using the mobile profile, test the checkout flow"
```

## 📚 Additional Resources

- **GitHub Repository**: https://github.com/smartlabsAT/claude-playwright
- **NPM Package**: https://www.npmjs.com/package/claude-playwright
- **Issue Tracker**: https://github.com/smartlabsAT/claude-playwright/issues
- **Discussions**: https://github.com/smartlabsAT/claude-playwright/discussions

## 🏷️ Version Information

- **Current Version**: 0.1.0
- **Release Stage**: Stable
- **License**: MIT
- **Maintained by**: SmartLabs

---

**Last Updated**: 2025-08-28