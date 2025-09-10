# Claude Playwright MCP Server Documentation

## Overview

The Claude Playwright MCP server provides Claude Code with comprehensive browser automation capabilities through the Model Context Protocol (MCP). This TypeScript-based server enables Claude to control browsers, interact with web pages, and manage persistent sessions.

## Installation & Setup

### 1. Install the Package

```bash
npm install --save-dev claude-playwright
```

### 2. Initialize MCP Configuration

```bash
npx claude-playwright mcp init --base-url http://localhost:3000
```

This creates a `.mcp.json` file in your project root:

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

### 3. Restart Claude Code

After configuration, restart Claude Code to load the MCP server.

### 4. Verify Connection

In Claude Code, type:
```
/mcp
```

You should see the playwright server listed as connected.

## Key Features

### 🚀 Revolutionary Bidirectional Caching (v0.1.0-alpha.18+)
- **0% → 100% hit rate transformation** with AI-aware input processing
- **52% performance improvement** from learned→cached operations (133ms→64ms)
- **Universal selector fallbacks** - works with buttons, links, divs, spans, any element
- **Early Playwright syntax fixing** - automatically corrects common selector errors
- **Multilingual support** - German, English synonyms (delete/löschen, first/erste)
- **25+ fallback strategies** - never fails on syntax errors again
- Cache debugging with enhanced `browser_cache_status` tool
- See [CACHING.md](CACHING.md) for complete technical details

### 🔄 Automatic URL Rewriting
- Automatically corrects URLs to use your configured BASE_URL
- Example: `localhost:3000` → `localhost:3002` (if BASE_URL is 3002)
- Works with both absolute and relative paths

### 🔐 Session Management
- Save and restore complete browser sessions
- Includes cookies, localStorage, and sessionStorage
- Sessions persist across Claude restarts
- 8-hour validity with automatic expiration

### 📊 Event Monitoring
- Captures console messages (log, warn, error)
- Tracks network requests and responses
- Records page errors and exceptions

### 🧠 AI-Aware Smart Element Selection
- **Automatic syntax fixing**: `button:text("Delete")` → `button:has-text("Delete")`
- **Universal element support**: Works with any clickable element (buttons, links, divs, spans)
- **Text-based selection**: Click elements by visible text with intelligent fallbacks
- **Multilingual**: Understands "delete", "löschen", "remove", "entfernen"
- **Position-aware**: Distinguishes "first Delete" vs "Delete first"
- **25+ fallback strategies**: CSS, XPath, ARIA, text content, click handlers
- **Self-learning**: Improves performance with every use

## Available Tools

### Navigation & Page Control

#### `browser_navigate`
Navigate to a URL or path.

**Parameters:**
- `url` (string): URL or path to navigate to

**Examples in Claude:**
```
"Navigate to /login"
"Go to https://example.com"
"Open the dashboard page"
```

#### `browser_navigate_back`
Go back to the previous page.

**Examples in Claude:**
```
"Go back to the previous page"
"Press the browser back button"
```

#### `browser_close`
Close the browser instance.

**Examples in Claude:**
```
"Close the browser"
"End the browser session"
```

### Interaction Tools

#### `browser_click` (with Revolutionary AI-Aware Caching)
Click on any element with **universal fallback support**. **Uses bidirectional cache with 25+ fallback strategies for 100% reliability.**

**Parameters:**
- `selector` (string): CSS selector or text to click (auto-corrects syntax errors)
- `button` (string, optional): "left", "right", or "middle"
- `doubleClick` (boolean, optional): Perform double-click

**Intelligence Features:**
- ✅ **Syntax Auto-Fix**: `button:text("Delete")` → `button:has-text("Delete")` automatically
- ✅ **Universal Elements**: Works with buttons, links, divs, spans, any clickable element
- ✅ **Smart Fallbacks**: 25+ strategies including text content, ARIA, click handlers
- ✅ **Multilingual**: "delete first" = "löschen erste" = "remove first"
- ✅ **Performance**: 133ms→64ms improvement with caching

**Examples in Claude:**
```
"Click the submit button"                    # Works with any element type
"Click Delete"                               # Auto-generates 25+ fallbacks  
"button:text('Save')"                        # Auto-fixes to button:has-text('Save')
"lösche erste aufgabe"                       # German language support
"Right-click on the menu icon"
"Double-click the file to open it"
```

**Caching:** Stores successful selectors for 5 minutes

#### `browser_type` (with caching)
Type text into an input field. **Uses cached selectors for 75% faster repeated typing.**

**Parameters:**
- `selector` (string): CSS selector for the input
- `text` (string): Text to type
- `slowly` (boolean, optional): Type character by character
- `submit` (boolean, optional): Press Enter after typing

**Examples in Claude:**
```
"Type 'john@example.com' in the email field"
"Enter password and submit the form"
"Slowly type the username to trigger validation"
```

**Caching:** Stores input field selectors for 5 minutes

#### `browser_fill_form`
Fill multiple form fields at once.

**Parameters:**
- `fields` (array): Array of field objects with selector and value

**Examples in Claude:**
```
"Fill the registration form with test data"
"Complete all required fields in the checkout form"
```

#### `browser_select_option`
Select option(s) in a dropdown.

**Parameters:**
- `selector` (string): CSS selector for the select element
- `values` (array): Values to select

**Examples in Claude:**
```
"Select 'United States' from the country dropdown"
"Choose multiple options in the categories select"
```

### Visual & Data Extraction

#### `browser_screenshot`
Take a screenshot of the page or element.

**Parameters:**
- `selector` (string, optional): Element to screenshot
- `fullPage` (boolean, optional): Capture entire page
- `filename` (string, optional): Custom filename

**Examples in Claude:**
```
"Take a screenshot of the current page"
"Capture the error message"
"Screenshot the entire checkout flow"
```

#### `browser_snapshot`
Get accessibility tree snapshot of the page.

**Examples in Claude:**
```
"Get the page structure"
"Show me all interactive elements"
"Extract the accessibility tree"
```

#### `browser_evaluate`
Execute JavaScript in the page context.

**Parameters:**
- `function` (string): JavaScript function to execute

**Examples in Claude:**
```
"Get all product prices from the page"
"Check if the modal is visible"
"Extract data from the table"
```

### Advanced Interactions

#### `browser_hover`
Hover over an element.

**Parameters:**
- `selector` (string): Element to hover over

**Examples in Claude:**
```
"Hover over the dropdown menu"
"Show the tooltip by hovering"
```

#### `browser_drag`
Drag and drop between elements.

**Parameters:**
- `startSelector` (string): Element to drag from
- `endSelector` (string): Element to drop on

**Examples in Claude:**
```
"Drag the item to the shopping cart"
"Reorder list items by dragging"
```

#### `browser_press_key`
Press keyboard keys.

**Parameters:**
- `key` (string): Key to press (e.g., "Enter", "Escape", "ArrowDown")

**Examples in Claude:**
```
"Press Escape to close the modal"
"Use arrow keys to navigate the menu"
"Press Ctrl+S to save"
```

#### `browser_file_upload`
Upload files to file input.

**Parameters:**
- `paths` (array): Absolute paths to files

**Examples in Claude:**
```
"Upload the test image to the profile picture field"
"Attach multiple documents to the form"
```

### Monitoring & Debugging

#### `browser_cache_status` ⚡ NEW
Get cache statistics and debug information.

**Returns:**
- Current URL and profile
- Navigation count
- Cache hit/miss rates by type
- Total evictions

**Examples in Claude:**
```
"Show cache statistics"
"Check cache performance"
"Debug cache status"
```

**Sample Output:**
```
=== Unified Cache Status ===
Current URL: http://localhost:3002/todos
Navigation Count: 3
Architecture: Single unified system (5/5 test suites passed)

=== Cache Metrics ===
selector:
  Hits: 12, Misses: 8
  Hit Rate: 60.0%
snapshot:
  Hits: 5, Misses: 3
  Hit Rate: 62.5%
```

#### `browser_console_messages`
Get all console messages from the page.

**Returns:**
- Array of console messages with type and text

**Examples in Claude:**
```
"Show me all console errors"
"Check for any warnings in the console"
```

#### `browser_network_requests`
Get all network requests made by the page.

**Returns:**
- Array of network requests with URL, method, status, and timing

**Examples in Claude:**
```
"List all API calls made by the page"
"Check if the analytics request was sent"
"Find failed network requests"
```

### Tab Management

#### `browser_tabs`
Manage browser tabs.

**Parameters:**
- `action` (string): "list", "new", "close", or "select"
- `index` (number, optional): Tab index for close/select

**Examples in Claude:**
```
"Open a new tab"
"Switch to the second tab"
"Close the current tab"
"List all open tabs"
```

### Wait Operations

#### `browser_wait_for`
Wait for specific conditions.

**Parameters:**
- `text` (string, optional): Text to appear
- `textGone` (string, optional): Text to disappear
- `time` (number, optional): Time in seconds

**Examples in Claude:**
```
"Wait for 'Success' message to appear"
"Wait until loading spinner disappears"
"Wait 5 seconds before continuing"
```

### Dialog Handling

#### `browser_handle_dialog`
Handle browser dialogs (alert, confirm, prompt).

**Parameters:**
- `accept` (boolean): Accept or dismiss the dialog
- `promptText` (string, optional): Text for prompt dialogs

**Examples in Claude:**
```
"Accept the confirmation dialog"
"Dismiss the alert"
"Enter 'yes' in the prompt"
```

### 🧠 Intelligent Test Management Tools (NEW - 2025-09-01)

#### `browser_save_test`
Save current interaction sequence as reusable test scenario.

**Parameters:**
- `testName` (string): Name for the test
- `description` (string, optional): Test description
- `tags` (string, optional): Comma-separated tags
- `url` (string, optional): URL pattern for the test

**Examples in Claude:**
```
"Save this login workflow as a test called 'User Authentication'"
"Create a test named 'Checkout Process' with tag 'ecommerce'"
```

#### `browser_find_similar_tests`
AI-powered semantic test discovery and matching.

**Parameters:**
- `query` (string): Search query or intent description
- `limit` (number, optional): Maximum number of results (default: 10)

**Examples in Claude:**
```
"Find tests similar to login workflow"
"Show me all authentication-related tests"
"Search for todo management tests"
```

#### `browser_run_test`
Execute saved test with intelligent adaptation and context switching.

**Parameters:**
- `testName` (string): Name of the test to run
- `url` (string, optional): URL to adapt the test for
- `profile` (string, optional): Browser profile to use
- `saveAdapted` (boolean, optional): Save adaptations back to the test

**Examples in Claude:**
```
"Run the User Login test on staging.myapp.com"
"Execute the Checkout Process test with mobile profile"
"Run User Authentication test and save any adaptations"
```

#### `browser_test_library`
Browse complete test library with statistics and filtering.

**Parameters:**
- `tag` (string, optional): Filter by tag
- `limit` (number, optional): Maximum number of results
- `showStats` (boolean, optional): Include execution statistics

**Examples in Claude:**
```
"Show all my saved tests"
"List authentication tests with statistics"
"Browse ecommerce tests from the library"
```

#### `browser_suggest_actions`
Get intelligent action suggestions based on learned patterns.

**Parameters:**
- `context` (string, optional): Current context or intent
- `limit` (number, optional): Maximum number of suggestions

**Examples in Claude:**
```
"Suggest next actions for this page"
"What can I do here based on similar patterns?"
"Show me recommended test actions"
```

#### `browser_adapt_test`
Intelligently adapt existing tests to new contexts and environments.

**Parameters:**
- `testName` (string): Name of the test to adapt
- `targetUrl` (string): URL to adapt for
- `profile` (string, optional): Target browser profile
- `saveAdapted` (boolean, optional): Save as new adapted test

**Examples in Claude:**
```
"Adapt User Login test for production environment"
"Modify Checkout Process test for mobile profile"
"Update Registration test for new staging URL"
```

#### `browser_delete_test` (NEW - 2025-09-01)
Delete test scenarios with flexible options.

**Parameters:**
- `testName` (string, optional): Name of specific test to delete
- `deleteAll` (boolean, optional): Delete all tests (default: false)
- `tag` (string, optional): Delete all tests with specific tag
- `confirmDelete` (boolean, optional): Skip confirmation prompts (default: false)

**Examples in Claude:**
```
"Delete the test named 'User Login'"
"Delete all test scenarios"
"Delete all tests tagged as 'auth'"
"Remove outdated tests without confirmation"
```

**Features:**
- **Single Test Deletion**: Delete specific tests by name
- **Bulk Operations**: Delete all tests or filter by tags
- **Safety Confirmations**: Prompts for destructive operations
- **Force Delete**: Skip confirmations for automation
- **Cascade Deletion**: Properly handles related execution history

### Window Management

#### `browser_resize`
Resize the browser window.

**Parameters:**
- `width` (number): Window width
- `height` (number): Window height

**Examples in Claude:**
```
"Resize browser to mobile viewport (375x667)"
"Set window to 1920x1080"
```

## Session Management

### Saving Sessions

Sessions can be saved using the CLI:

```bash
npx claude-playwright session save my-app --url https://myapp.com
```

This opens a browser where you can manually log in. The session is then saved.

### Using Sessions in Claude

Once saved, Claude can use sessions:

```
"Load the my-app session and navigate to the dashboard"
"Use the admin session to check the settings page"
```

### Session Storage

Sessions are stored globally in:
```
.claude-playwright/sessions/ (project-local)
```

Each session includes:
- Cookies
- localStorage
- sessionStorage
- Metadata (creation time, expiry, profile used)

## Browser Profiles

### Default Profiles

Setup default profiles:

```bash
npx claude-playwright profile setup
```

Creates:
- **desktop**: 1920x1080 viewport
- **mobile**: 375x667 viewport (iPhone-like)
- **tablet**: 768x1024 viewport (iPad-like)

### Custom Profiles

Create custom profiles:

```bash
npx claude-playwright profile create iphone14 --viewport 390x844 --device mobile
```

### Using Profiles

Profiles affect:
- Viewport size
- User agent string
- Device capabilities
- Touch vs mouse events

## Best Practices

### 1. Use Descriptive Selectors
```
Good: "Click the 'Submit Order' button"
Better: "Click button[type='submit'] in the checkout form"
```

### 2. Wait for Elements
```
"Wait for the page to load, then click login"
"Wait until the spinner disappears before proceeding"
```

### 3. Handle Errors Gracefully
```
"Try to click the accept button, if it appears"
"Check if the error message is visible"
```

### 4. Use Sessions for Authentication
```
"Load the user session instead of logging in each time"
```

### 5. Take Screenshots for Debugging
```
"Take a screenshot after each major step"
"Capture the error state if something fails"
```

## Troubleshooting

### MCP Server Not Starting

1. Check `.mcp.json` exists and has correct path
2. Verify BASE_URL is set correctly
3. Ensure package is installed: `npm ls claude-playwright`
4. Check Claude Code logs for errors

### Session Issues

1. Sessions expire after 8 hours
2. Check session health: `npx claude-playwright session health`
3. Extend sessions: `npx claude-playwright session extend <name>`
4. Delete corrupt sessions: `npx claude-playwright session delete <name>`

### Element Not Found

1. Use `browser_snapshot` to see available elements
2. Wait for elements to appear: `browser_wait_for`
3. Check if element is in an iframe
4. Verify selector syntax

### Network/Console Monitoring

1. Messages are cleared on navigation
2. Check after page actions complete
3. Network requests include AJAX calls
4. Console includes all log levels

## Environment Variables

- `BASE_URL`: Base URL for the application
- `PLAYWRIGHT_HEADLESS`: Run in headless mode (true/false)
- `PLAYWRIGHT_SLOW_MO`: Slow down operations (milliseconds)
- `PLAYWRIGHT_TIMEOUT`: Default timeout for operations

## Advanced Usage

### Combining Tools

Claude can chain multiple tools together:

```
"Navigate to login, enter credentials, submit, wait for dashboard, 
take a screenshot, then check console for errors"
```

### Custom Workflows

Create complex automation flows:

```
"For each product in the list:
1. Click on it
2. Add to cart
3. Go back
4. Repeat for next product"
```

### Data Extraction

Extract structured data:

```
"Get all product names and prices from the page as a table"
"Extract form validation errors into a list"
```

## Support

- **Documentation**: https://github.com/smartlabsAT/claude-playwright
- **Issues**: https://github.com/smartlabsAT/claude-playwright/issues
- **Discussions**: https://github.com/smartlabsAT/claude-playwright/discussions

---

**Version**: 0.1.0-alpha.16  
**Last Updated**: 2025-08-28  
**License**: MIT