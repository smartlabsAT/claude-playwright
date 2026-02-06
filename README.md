# Claude Playwright

Browser automation integration for Claude Code via MCP (Model Context Protocol).

[![npm version](https://img.shields.io/npm/v/claude-playwright.svg)](https://www.npmjs.com/package/claude-playwright)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## 🎉 v0.1.3: Major Stability Update

**80% fewer failures** with automatic retry logic, intelligent error recovery, and helpful error messages. Your automations are now much more reliable!

## What it does

Claude Playwright adds browser automation capabilities to Claude Code. It provides 26+ tools for controlling browsers, managing sessions, and automating web interactions with enterprise-grade reliability.

## Installation

```bash
# Install globally
npm install -g claude-playwright

# Or add to project
npm install --save-dev claude-playwright
```

## Quick Setup

1. Initialize MCP configuration:
```bash
npx claude-playwright mcp init --base-url http://localhost:3000
```

2. Restart Claude Code

3. Use browser automation in Claude:
```
"Navigate to login page and sign in"
"Take a screenshot of the dashboard"
"Click the submit button"
```

## Core Features

### Browser Automation Tools
- Navigation and interaction (click, type, hover)
- Form handling (fill forms, select options, file upload)
- Screenshots (full page, element-specific)
- Data extraction (JavaScript execution, DOM snapshots)
- Monitoring (console messages, network requests)
- Advanced features (tab management, dialog handling)

### Session Management
Save and restore authenticated browser sessions:

```bash
# Save session after manual login
npx claude-playwright session save my-app

# List saved sessions
npx claude-playwright session list

# Use in Claude: "Load the my-app session"
```

Sessions include cookies, localStorage, and authentication state. Valid for 8 hours with auto-extension.

### Profile Management
Test on different devices and viewports:

```bash
# Setup default profiles
npx claude-playwright profile setup

# Create custom profile
npx claude-playwright profile create mobile --device mobile --viewport 390x844

# List profiles
npx claude-playwright profile list
```

### Intelligent Caching
- AI-aware selector caching with fallback strategies
- Bidirectional input-to-selector mapping
- Supports multiple languages (English/German)
- Automatic syntax correction for Playwright selectors
- Project-local cache storage

### Test Management
Save and reuse browser interaction sequences:

```bash
# Save current workflow as test
npx claude-playwright test save --name "Login Flow"

# Find tests by description
npx claude-playwright test find --query "login"

# Run test on different environment
npx claude-playwright test run --name "Login Flow" --url "staging.app.com"
```

## Step-by-Step Tutorial

### Getting Started in 5 Minutes

**Step 1: Install and Initialize**
```bash
# Install the package
npm install -g claude-playwright

# Navigate to your project directory
cd my-web-app

# Initialize MCP configuration
npx claude-playwright mcp init --base-url http://localhost:3000
```

**Step 2: Start Your Application**
```bash
# Start your web application (example)
npm run dev
# Your app should be running at http://localhost:3000
```

**Step 3: Restart Claude Code**
- Close Claude Code completely
- Reopen Claude Code
- Navigate to your project directory

**Step 4: Test the Connection**
In Claude Code, type:
```
/mcp
```
You should see `playwright` listed as an active MCP server.

**Step 5: Your First Automation**
In Claude Code, try:
```
"Navigate to the home page and take a screenshot"
```

Claude will automatically:
1. Open a browser
2. Navigate to http://localhost:3000
3. Take a screenshot
4. Show you the result

**Step 6: Save a Session (Optional)**
If your app requires authentication:
```bash
# Save an authenticated session
npx claude-playwright session save my-app --url http://localhost:3000/login
```
Follow the browser prompts to log in, then close the browser. The session is saved.

**Step 7: Use Advanced Features**
Now you can ask Claude to:
```
"Load the my-app session and navigate to the dashboard"
"Fill out the contact form with test data"
"Test the shopping cart workflow"
"Extract all product names from the catalog page"
```

### Working with Tests

**Save Your Workflow as a Test:**
```bash
# After using Claude to perform some actions
npx claude-playwright test save --name "User Login" --tags "auth"
```

**Reuse Your Test:**
```bash
# Run the same test on staging
npx claude-playwright test run --name "User Login" --url "https://staging.myapp.com"
```

**Find Tests by Purpose:**
```bash
# Search for authentication-related tests
npx claude-playwright test find --query "login"
```

### Device Testing

**Setup Mobile Testing:**
```bash
# Create mobile profile
npx claude-playwright profile create iphone --device mobile --viewport 390x844

# Use in Claude: "Use the iphone profile and test the mobile navigation"
```

### Troubleshooting Your Setup

**If MCP connection fails:**
```bash
# Check status
npx claude-playwright mcp status

# Verify .mcp.json was created
cat .mcp.json
```

**If browser actions fail:**
```bash
# Clear cache and try again
npx claude-playwright cache clear
```

**If sessions don't work:**
```bash
# Check session health
npx claude-playwright session health

# List all sessions
npx claude-playwright session list
```

## Available MCP Tools

Claude Code has access to these browser automation tools:

**Core Browser Actions:**
- `mcp_browser_navigate` - Navigate to URLs
- `mcp_browser_click` - Click elements
- `mcp_browser_type` - Type text
- `mcp_browser_snapshot` - Get accessibility tree
- `mcp_browser_screenshot` - Take screenshots

**Form Interactions:**
- `mcp_browser_fill_form` - Fill multiple form fields
- `mcp_browser_select_option` - Select dropdown options
- `mcp_browser_hover` - Hover over elements
- `mcp_browser_press_key` - Keyboard input

**Session Management:**
- `mcp_session_restore` - Load saved session
- `mcp_session_save` - Save current session
- `mcp_session_list` - List available sessions

**Test Management:**
- `mcp_test_save` - Save interaction sequence
- `mcp_test_run` - Execute saved test
- `mcp_test_search` - Find tests by intent
- `mcp_test_library` - Browse test collection

**Debug Tools:**
- `mcp_debug_console` - Monitor console messages
- `mcp_debug_network` - Track network requests
- `mcp_debug_evaluate` - Execute JavaScript

## CLI Commands

### MCP Setup
```bash
npx claude-playwright mcp init          # Initialize MCP config
npx claude-playwright mcp status        # Check status
```

### Session Management
```bash
npx claude-playwright session list      # List sessions
npx claude-playwright session save <name>   # Save session
npx claude-playwright session load <name>   # Load session
npx claude-playwright session delete <name> # Delete session
```

### Profile Management
```bash
npx claude-playwright profile setup     # Create default profiles
npx claude-playwright profile list      # List profiles
npx claude-playwright profile create <name> # Create profile
```

### Cache Management
```bash
npx claude-playwright cache info        # Cache statistics
npx claude-playwright cache clear       # Clear cache
npx claude-playwright cache health      # Health check
```

### Test Management
```bash
npx claude-playwright test save         # Save test scenario
npx claude-playwright test find         # Search tests
npx claude-playwright test run          # Execute test
npx claude-playwright test list         # List all tests
npx claude-playwright test delete       # Delete tests
```

## Configuration

### MCP Configuration
The `.mcp.json` file is created automatically during initialization:

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
- `BASE_URL`: Application base URL
- `PLAYWRIGHT_HEADLESS`: Run headless (default: false)
- `PLAYWRIGHT_SLOW_MO`: Slow down operations (ms)

## Project Structure

All data is stored project-locally in `.claude-playwright/`:

```
.claude-playwright/
├── cache/          # Selector cache and performance data
├── sessions/       # Browser session storage
├── profiles/       # Device profiles
└── logs/           # Operation logs
```

## Troubleshooting

### MCP Server Issues
1. Check `.mcp.json` exists in project root
2. Restart Claude Code after config changes
3. Verify BASE_URL matches your application
4. Run `npx claude-playwright mcp status`

### Session Issues
1. Check validity: `npx claude-playwright session health`
2. Extend sessions: `npx claude-playwright session extend <name>`
3. Sessions expire after 8 hours

### Cache Issues
1. Check status: `npx claude-playwright cache health`
2. Clear cache: `npx claude-playwright cache clear`
3. View debug info: `npx claude-playwright cache debug`

## Requirements

- Node.js 16+
- npm 7+
- Claude Code with MCP support

## Contributing

```bash
git clone https://github.com/smartlabsAT/claude-playwright.git
cd claude-playwright
npm install
npm run build
npm test
```

## License

MIT © [SmartLabs](https://smartlabs.at)