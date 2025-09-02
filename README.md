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

### 🚀 **Try the Intelligent Testing (30 seconds!)**

After using Claude Code for any workflow, save it as a reusable test:

```bash
# Save what you just did as a smart test
npx claude-playwright test save --name "My Workflow" --tags "demo"

# Find it later by intent
npx claude-playwright test find --query "workflow"

# Run it on different environments
npx claude-playwright test run --name "My Workflow" --url "https://staging.app.com"
```

**That's it! Your workflows are now intelligent, reusable, and automatically adapt to new environments! 🧠✨**

## 🎯 Core Features

### 🤖 20+ Browser Automation Tools for Claude

All these tools are available to Claude through MCP:

- **Navigation & Interaction**: Navigate, click, type, hover, drag & drop
- **Forms**: Fill forms, select options, upload files
- **Screenshots**: Full page, element-specific, or viewport captures
- **Data Extraction**: Run JavaScript, get accessibility snapshots
- **Monitoring**: Console messages, network requests,
- **Advanced**: Tab management, dialog handling, keyboard shortcuts

### 📁 **Project-Local Storage**

All data is stored **project-locally** in `.claude-playwright/` directory:

- **🎯 Team Collaboration**: Each project has its own sessions/profiles
- **🔒 Project Isolation**: No conflicts between different projects  
- **📝 Version Control**: Profile configurations can be shared via Git
- **🧹 Clean Separation**: No global user directory pollution

### 🚀 ** Bidirectional Cache System ** 

** BREAKTHROUGH:** Complete architecture migration to unified cache system with **enhanced performance** and **simplified architecture**.

#### 🎯 **Unified System Features:**
- **🏗️ UNIFIED ARCHITECTURE**: Single cache system for selectors + snapshots + all metadata (1560+ legacy lines eliminated)
- **🧠 AI-Aware Input Recognition**: Understands "click" = "press" = "tap" = "select" = "delete" = "löschen"  
- **🔄 Bidirectional Lookup**: Input → Selector and Selector → Inputs mapping with cross-session learning
- **🛠️ Early Syntax Fixing**: `button:text("Delete")` → `button:has-text("Delete")` automatically 
- **🌐 Universal Element Support**: Works with buttons, links, divs, spans, **any clickable element**
- **⚡  Fallback Strategies**: CSS, ARIA, text content, click handlers, framework agnostic
- **🌍 Multilingual Support**: German, English synonyms (delete/löschen, first/erste, task/aufgabe)
- **📊 Enhanced Debug Logging**: Real-time fallback attempt tracking with performance metrics

### 🧠 **INTELLIGENT TEST MANAGEMENT** 🆕

**Revolutionary AI-powered test persistence that learns and adapts!** No more manual test scripts - let the system learn from your workflows and automatically create reusable tests.

#### ✨ **Key Features:**
- **🤖 Zero-Overhead Learning**: Tests are automatically learned during normal Claude Code usage
- **🔍 Semantic Test Search**: Find tests by intent: `"find login workflow"` → finds all authentication-related tests  
- **🔄 Smart Auto-Adaptation**: Tests automatically adapt to new URLs, contexts, and environments
- **📊 Success Rate Tracking**: Each test tracks confidence scores and adaptation history
- **🏷️ Intelligent Tagging**: Automatic categorization and tag suggestions based on content

#### 🤖 **Direct Claude Code Integration:**

Simply ask Claude to manage your tests - no CLI needed!

```javascript
// In Claude Code chat:
"Save this login workflow as a reusable test called 'User Auth'"
// → Uses browser_save_test tool automatically

"Find tests similar to user management" 
// → Uses browser_find_similar_tests, shows results

"Run the User Auth test on staging.myapp.com"
// → Uses browser_run_test with automatic adaptation

"Show me all my authentication tests"
// → Uses browser_test_library with filtering

"What tests do I have for todo management?"
// → Intelligent semantic search across your test library

"Delete the test named 'My Test'"
// → Uses browser_delete_test for single test deletion

"Delete all tests tagged as 'auth'"
// → Uses browser_delete_test with tag-based filtering

"Delete all test scenarios"
// → Uses browser_delete_test with confirmation prompt
```

#### 🛠 **MCP Tools** (Available in Claude Code):
```bash
# Claude can now use these intelligent test management tools:
browser_save_test           # Save current workflow as reusable test  
browser_find_similar_tests  # AI-powered semantic test discovery
browser_run_test           # Execute tests with intelligent adaptation
browser_test_library       # Browse complete test library with stats
browser_suggest_actions    # Get smart suggestions based on learned patterns
browser_adapt_test         # Adapt existing tests to new contexts
browser_delete_test        # Delete test scenarios with flexible options
```

#### 📱 **CLI Commands:**
```bash
# Interactive test creation
claude-playwright test save --name "User Login" --tags "auth,login"

# Semantic search for tests
claude-playwright test find --query "todo management workflow"

# Execute with automatic adaptation  
claude-playwright test run --name "User Login" --url "https://staging.app.com"

# Show comprehensive test library
claude-playwright test list --tag "authentication"

# Analytics and insights
claude-playwright test stats

# Delete specific test
claude-playwright test delete --name "My Test"

# Delete all tests with confirmation
claude-playwright test delete --all

# Force delete all (without confirmation)
claude-playwright test delete --all --force

# Delete all tests with specific tag
claude-playwright test delete --tag "outdated"
```

#### 🎯 **Usage Example:**
```javascript
// 1. Work normally with Claude Code
"Navigate to login page and sign in"

// 2. System learns and suggests
System: "🧠 Detected login workflow. Save as 'User Auth Test'?" 

// 3. Next time, smart reuse
"I need to test user login on staging"  
System: "Found 'User Auth Test' (94% match). Adapting for staging.app.com..."
Test runs automatically with adapted selectors! ✨
```

#### 🛠️ **Step-by-Step Usage Guide:**

**Step 1: Setup & First Use**
```bash
# 1. Initialize for your app
npx claude-playwright mcp init --base-url http://localhost:3000

# 2. Restart Claude Code and start working normally
# Claude: "Navigate to the login page and sign in"
# (Browser opens, you interact normally)
```

**Step 2: Save Your First Smart Test**
```bash
# After doing a workflow in Claude Code, save it:
npx claude-playwright test save --name "User Login" --tags "auth,critical"

# Interactive prompts guide you:
# Step 1 - Action: navigate
# Description: Navigate to login page
# Target: https://localhost:3000/login
# 
# Step 2 - Action: type  
# Description: Enter email
# Target: input[name="email"]
# Value: user@example.com
# 
# Step 3 - Action: click
# Description: Submit login
# Target: button[type="submit"]
```

**Step 3: Smart Test Discovery**
```bash
# Find tests by intent (not just name!)
npx claude-playwright test find --query "login workflow"
# 🎯 Found 2 similar tests:
# 1. User Login (94% similarity)
# 2. Admin Authentication (67% similarity)

# Browse your test library
npx claude-playwright test list --tag "auth"
# 📚 Test Library (3 tests found):
# 1. User Login - Steps: 3 (navigate → type → click)
# 2. User Registration - Steps: 5 
# 3. Password Reset - Steps: 4
```

**Step 4: Execute Tests with Auto-Adaptation**
```bash
# Run on different environment - automatic adaptation!
npx claude-playwright test run --name "User Login" --url "https://staging.myapp.com"
# ✅ Test PASSED
# ⏱️ Execution Time: 1,247ms  
# 🔧 Adaptations Applied: 2
#    1. Updated URL from localhost:3000 to staging.myapp.com
#    2. Updated selector "button[type='submit']" to "button.login-btn"

# View comprehensive analytics
npx claude-playwright test stats
# 📈 Overall Statistics:
#    Total Tests: 8
#    Average Success Rate: 96.3%
#    Total Executions: 47
# 
# 🏷️ Tests by Tags:
#    auth: 3, ecommerce: 2, forms: 3
```

**Step 5: Advanced Workflows**
```bash
# Adapt existing test for production environment
npx claude-playwright test adapt \
  --name "User Login" \
  --url "https://production.myapp.com" \
  --save-adapted

# Find and run tests for staging deployment
npx claude-playwright test find --query "checkout process" | head -1 | \
  xargs npx claude-playwright test run --url "https://staging.shop.com"
```

#### 🎯 **Real-World Examples:**

**E-commerce Testing:**
```bash
# 1. Work with Claude: "Add a product to cart and checkout"
# 2. Save the workflow
npx claude-playwright test save --name "Complete Purchase" --tags "ecommerce,checkout"

# 3. Later, test on staging
npx claude-playwright test run --name "Complete Purchase" --url "staging.shop.com"
# Auto-adapts selectors, currencies, URLs - just works! ✨
```

**Multi-Environment Testing:**
```bash
# Save a critical user flow
npx claude-playwright test save --name "User Onboarding" --tags "critical,signup"

# Test across all environments
for env in localhost staging production; do
  echo "Testing on $env..."
  npx claude-playwright test run --name "User Onboarding" --url "https://$env.myapp.com"
done
```

**Team Collaboration:**
```bash
# Export tests for team sharing
npx claude-playwright test list --format json > team-tests.json

# Import on another machine/environment  
npx claude-playwright test import --file team-tests.json

# Find tests created by team members
npx claude-playwright test find --query "user management" --created-after "7 days ago"
```

#### 🏗️ **Technical Architecture:**
- **Database**: Extends existing `bidirectional-cache.db` with 3 new AI tables
- **AI Components**: `TestScenarioCache`, `TestPatternMatcher`, `IntelligentTestRecognition`
- **Learning Engine**: Automatic pattern recognition and cross-session knowledge transfer
- **Smart Caching**: Leverages proven BidirectionalCache infrastructure

**📚 [Complete Documentation](./docs/INTELLIGENT_TESTING.md) • [Architecture Details](./docs/INTELLIGENT_TESTING.md#architecture-deep-dive)**

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
- **[Intelligent Test Management](docs/INTELLIGENT_TESTING.md)** - Revolutionary AI-powered test persistence and automation system
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
3. Sessions are stored project-locally in `.claude-playwright/sessions/`

### Need Help?
- 📖 Check our [documentation](https://github.com/smartlabsAT/claude-playwright#readme)
- 🐛 Report issues on [GitHub](https://github.com/smartlabsAT/claude-playwright/issues)

## 📄 License

MIT © [Smartlabs](https://smartlabs.at)

---


**Made with ❤️ by [Smartlabs](https://smartlabs.at)**