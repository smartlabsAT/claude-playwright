# Claude Playwright - Examples

This directory contains practical examples demonstrating the core features of Claude Playwright.

## 📁 Directory Structure

```
examples/
├── README.md                    # This file
├── session-management/          # Browser session examples
└── profile-management/          # Browser profile examples  
```

## 🚀 Quick Examples

### Session Management

```javascript
// Save a session with the CLI
// npx claude-playwright session save myapp --url https://myapp.com/login

// Then use in your tests
const { SessionManager } = require('claude-playwright');

const sessionManager = new SessionManager('.');
const sessionData = await sessionManager.loadSession('myapp');

// Session data includes cookies, localStorage, etc.
```

### Profile Management

```javascript
// Setup default profiles
// npx claude-playwright profile setup

// Use profiles in tests
const { ProfileManager } = require('claude-playwright');

const profileManager = new ProfileManager();
const mobileProfile = await profileManager.getProfile('mobile');

// Profile includes viewport, user agent, etc.
```

### MCP Integration in Claude Code

After setting up MCP:
```bash
npx claude-playwright mcp init --base-url http://localhost:3000
```

You can use these commands in Claude:
- "Navigate to the login page"
- "Click the submit button"
- "Take a screenshot of the dashboard"
- "Extract all product prices from the page"

## 📚 More Examples

For complete examples, see:
- [Session Management Examples](session-management/)
- [Profile Management Examples](profile-management/)

## 🔗 Documentation

- [Full Documentation](../README.md)
- [API Reference](../docs/api.md)
- [MCP Server Guide](../docs/MCP_SERVER.md)