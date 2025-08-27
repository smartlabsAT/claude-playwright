# Claude-Playwright Toolkit 🚀 (Alpha)

> ⚠️ **ALPHA RELEASE v0.1.0-alpha.5**  
> This is an early alpha version for testing and feedback. APIs may change between releases.  
> Please report issues at: https://github.com/smartlabsAT/claude-playwright/issues

Seamless integration between Claude Code and Playwright MCP for efficient browser automation and testing.

## ✨ Features

### 🎯 Browser Session Management
- **Real Browser Sessions**: Capture and reuse actual login sessions with cookies and authentication state
- **8-Hour Session Caching**: Automatic session expiration and extension management
- **Profile-Based Sessions**: Associate sessions with specific browser profiles
- **Session Validation**: Automatic expiry checking and cleanup of invalid sessions

### 🎭 Browser Profile Management  
- **Role-Based Profiles**: Pre-configured profiles for admin, user, guest, and mobile users
- **Custom Profile Creation**: Create tailored browser profiles with specific viewport, user-agent, and permissions
- **Profile Persistence**: Persistent browser data across test runs
- **Profile Templates**: Quick setup with default configurations for common scenarios

### 🏗️ Smart Code Generation (Scaffold Commands)
- **Page Object Generation**: Create Playwright Page Object Model classes with BasePage inheritance
- **Test File Generation**: Generate complete test files with proper structure and imports
- **Fixture Generation**: Create custom test fixtures including authentication and data fixtures
- **Template-Based**: Consistent code generation following project patterns

### 🔧 MCP Integration
- **Automatic Configuration**: Seamless setup with Claude Code MCP integration
- **Project Templates**: Minimal, Enterprise, and Testing templates for different project needs
- **Interactive Setup**: Guided project initialization with intelligent defaults

## 📦 Installation

### Alpha Version
```bash
# Install alpha version globally
npm install -g claude-playwright@alpha

# Or install specific alpha version
npm install -g claude-playwright@0.1.0-alpha.5

# For project installation
npm install claude-playwright@alpha --save-dev
```

## 🚀 Quick Start

### 1. Initialize Project
```bash
# Interactive setup (recommended)
claude-playwright init

# Or specify template directly
claude-playwright init --template enterprise --dir my-project
```

### 2. Configure MCP (if needed separately)
```bash
claude-playwright configure-mcp
```

### 3. Create Browser Profiles
```bash
# Setup default profiles
claude-playwright profile setup

# Create custom profile
claude-playwright profile create mobile --viewport 375x667 --role mobile_user
```

### 4. Capture Browser Sessions
```bash
# Save authenticated session - opens real browser for login
claude-playwright session save admin-session

# List all sessions
claude-playwright session list

# Load session in tests
claude-playwright session load admin-session
```

## 📋 CLI Commands

### Project Initialization

| Command | Description | Options |
|---------|-------------|---------|
| `init` | Initialize new project with MCP integration | `--template`, `--dir`, `--name` |
| `configure-mcp` | Setup MCP without full project init | `--dir` |

### Session Management

| Command | Description | Example |
|---------|-------------|---------|
| `session save <name>` | Capture real browser session | `session save admin-login` |
| `session load <name>` | Load saved session | `session load admin-login` |
| `session list` | Show all sessions with status | `session list` |
| `session clear` | Remove expired sessions | `session clear` |
| `session delete <name>` | Delete specific session | `session delete old-session` |

### Profile Management

| Command | Description | Example |
|---------|-------------|---------|
| `profile setup` | Create default profiles | `profile setup` |
| `profile create <name>` | Create custom profile | `profile create tablet --role tablet_user` |
| `profile list` | Show all profiles | `profile list` |
| `profile delete <name>` | Remove profile | `profile delete old-profile` |

### Code Generation

| Command | Description | Example |
|---------|-------------|---------|
| `scaffold page <name>` | Generate Page Object Model | `scaffold page LoginPage` |
| `scaffold test <name>` | Generate test file | `scaffold test auth-flow` |
| `scaffold fixture <name>` | Generate test fixture | `scaffold fixture AuthFixture` |

## 💡 Usage Examples

### Browser Session Workflow
```bash
# 1. Save session after manual login
claude-playwright session save user-session

# 2. Use in Playwright tests
```
```typescript
// In your test
import { SessionManager } from 'claude-playwright';

test('authenticated test', async ({ browser }) => {
  const sessionManager = new SessionManager();
  const storageState = await sessionManager.loadSession('user-session');
  
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  
  // User is now logged in!
  await page.goto('/dashboard');
});
```

### Profile-Based Testing
```bash
# Create mobile profile
claude-playwright profile create mobile --viewport 375x667 --role mobile_user
```
```typescript
// Use in tests
import { BrowserProfileManager } from 'claude-playwright';

test('mobile test', async ({ browser }) => {
  const profileManager = new BrowserProfileManager();
  const profile = await profileManager.loadProfile('mobile');
  
  const context = await browser.newContext({
    userAgent: profile.settings.userAgent,
    viewport: profile.settings.viewport
  });
});
```

### Code Generation Workflow
```bash
# Generate Page Object
claude-playwright scaffold page LoginPage --path src/pages

# Generate corresponding test
claude-playwright scaffold test login-flow --path src/tests

# Generate auth fixture
claude-playwright scaffold fixture AuthFixture --path src/fixtures
```

## 🏗️ Project Structure

### Minimal Template
```
my-project/
├── src/
│   ├── pages/
│   │   └── base/
│   │       └── BasePage.ts
│   └── tests/
│       └── example.spec.ts
├── playwright-sessions/          # Session storage
├── browser-profiles/             # Profile data
├── playwright.config.ts
├── CLAUDE.md                     # Claude Code instructions
└── package.json
```

### Enterprise Template
```
my-project/
├── src/
│   ├── pages/
│   │   ├── base/
│   │   │   ├── BasePage.ts
│   │   │   └── BaseComponent.ts
│   │   └── components/
│   ├── fixtures/
│   │   ├── AuthFixture.ts
│   │   └── BaseFixture.ts
│   ├── utils/
│   │   ├── DataGenerator.ts
│   │   ├── ApiHelpers.ts
│   │   └── TestHelpers.ts
│   └── tests/
├── playwright-sessions/
├── browser-profiles/
├── playwright-auth/
├── docker-compose.yml
├── .github/workflows/tests.yml
├── CLAUDE.md
└── package.json
```

## 🎯 Session Management Deep Dive

### How It Works
1. **Manual Login**: `session save` opens a real browser where you manually log in
2. **State Capture**: Captures cookies, localStorage, sessionStorage, and other auth data
3. **Secure Storage**: Saves session data with 8-hour expiration
4. **Test Integration**: Load sessions in tests for authenticated scenarios

### Session Data Format
```json
{
  "name": "admin-session",
  "createdAt": 1647875400000,
  "expiresAt": 1647904200000,
  "storageState": {
    "cookies": [...],
    "origins": [...]
  },
  "metadata": {
    "url": "https://app.example.com/dashboard",
    "userAgent": "Mozilla/5.0...",
    "viewport": { "width": 1920, "height": 1080 }
  }
}
```

### Session Management Best Practices
- Use descriptive session names (`admin-prod`, `user-staging`)
- Regularly clean expired sessions with `session clear`
- Test session validity before important test runs
- Keep sessions environment-specific

## 🎭 Profile Management Deep Dive

### Default Profiles

| Profile | Viewport | User Agent | Use Case |
|---------|----------|------------|----------|
| `admin` | 1920x1080 | Desktop Chrome | Administrator testing |
| `user` | 1366x768 | Desktop Chrome | Standard user scenarios |
| `guest` | 1280x720 | Desktop Chrome | Anonymous user testing |
| `mobile` | 375x667 | Mobile Safari | Mobile device simulation |

### Custom Profile Creation
```bash
# Desktop profile with specific settings
claude-playwright profile create designer \
  --viewport 2560x1440 \
  --role designer \
  --description "High-res designer workflow"

# Mobile profile with touch support  
claude-playwright profile create android \
  --viewport 412x915 \
  --role mobile_user \
  --description "Android device simulation"
```

## 🏗️ Scaffold System Deep Dive

### Generated Page Object Structure
```typescript
// Generated by: scaffold page LoginPage
import { Page, expect } from '@playwright/test';
import { BasePage } from './base-page';

export class LoginPage extends BasePage {
  // Locators - using data-testid for stability
  private readonly emailInput = '[data-testid="email"]';
  private readonly passwordInput = '[data-testid="password"]';
  private readonly submitButton = '[data-testid="login-submit"]';
  
  constructor(page: Page) {
    super(page);
  }
  
  // Navigation methods
  async goto() {
    await this.navigateTo('/login');
  }
  
  // Action methods
  async login(email: string, password: string) {
    await this.fillForm({
      [this.emailInput]: email,
      [this.passwordInput]: password
    });
    await this.clickAndWait(this.submitButton);
  }
  
  // Assertion methods
  async expectLoginForm() {
    await expect(this.page.locator(this.emailInput)).toBeVisible();
    await expect(this.page.locator(this.passwordInput)).toBeVisible();
  }
}
```

### Generated Test Structure
```typescript
// Generated by: scaffold test auth-flow
import { test, expect } from '@playwright/test';
import { BasePage } from '../pages/base-page';

test.describe('Auth Flow Tests', () => {
  let basePage: BasePage;
  
  test.beforeEach(async ({ page }) => {
    basePage = new BasePage(page);
    await basePage.navigateTo('/');
  });
  
  test('should complete login flow', async ({ page }) => {
    // Add your test implementation
    await expect(page).toHaveTitle(/Login/);
  });
  
  test('should handle logout', async ({ page }) => {
    // Add logout test
    await expect(page.locator('[data-testid="logout"]')).toBeVisible();
  });
});
```

### Generated Fixture Structure
```typescript
// Generated by: scaffold fixture AuthFixture  
import { test as base, expect } from '@playwright/test';
import { BasePage } from '../pages/base-page';
import { SessionManager } from 'claude-playwright';

export interface AuthFixtures {
  authenticatedPage: BasePage;
  sessionManager: SessionManager;
}

export const test = base.extend<AuthFixtures>({
  authenticatedPage: async ({ page }, use) => {
    const sessionManager = new SessionManager();
    const storageState = await sessionManager.loadSession('default-user');
    
    await page.context().addCookies(storageState.cookies || []);
    const authPage = new BasePage(page);
    
    await use(authPage);
  },
  
  sessionManager: async ({}, use) => {
    const manager = new SessionManager();
    await use(manager);
  }
});

export { expect } from '@playwright/test';
```

## 🎨 Template System

### Available Templates

#### Minimal Template
- Basic Playwright setup
- Simple Page Object Model
- Essential test structure
- Minimal dependencies

#### Enterprise Template  
- Advanced Playwright configuration
- Component-based architecture
- Docker and CI/CD integration
- Authentication fixtures
- Data generation utilities
- Performance testing setup

#### Testing Template
- Testing-focused configuration
- Advanced fixtures and utilities
- Custom test helpers
- Assertion libraries

## 🔧 Configuration

### Environment Variables
```bash
# Session management
PLAYWRIGHT_SESSIONS_DIR=./custom-sessions
PLAYWRIGHT_SESSION_EXPIRY=24  # hours

# Profile management  
BROWSER_PROFILES_DIR=./custom-profiles

# MCP configuration
CLAUDE_MCP_CONFIG_PATH=~/.claude/claude_desktop_config.json
```

### Playwright Configuration Integration
```typescript
// playwright.config.ts - Generated configuration
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Session and profile integration
  use: {
    // Persistent browser profiles
    launchOptions: {
      args: ['--user-data-dir=./browser-profiles/default']
    },
    
    // Session state management
    storageState: process.env.SESSION_STATE_PATH,
  },
  
  // Multiple profile projects
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-safari', 
      use: { ...devices['iPhone 12'] }
    }
  ]
});
```

## 🔗 Integration with Claude Code

### MCP Configuration
The toolkit automatically configures Claude Code's MCP integration:

```json
// ~/.claude/claude_desktop_config.json
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

### CLAUDE.md Templates
Each template includes optimized Claude Code instructions:

- **Minimal**: Focus on basic Page Object patterns
- **Enterprise**: Comprehensive enterprise development patterns  
- **Testing**: Testing-specific best practices and utilities

## 🚨 Troubleshooting

### Common Issues

#### Session Not Loading
```bash
# Check session status
claude-playwright session list

# Verify session data
cat ./playwright-sessions/session-name.json

# Clear expired sessions
claude-playwright session clear
```

#### Profile Issues
```bash
# List available profiles
claude-playwright profile list

# Recreate default profiles
claude-playwright profile setup

# Check profile data
ls -la ./browser-profiles/
```

#### MCP Configuration Issues
```bash
# Reconfigure MCP
claude-playwright configure-mcp

# Check Claude configuration
cat ~/.claude/claude_desktop_config.json
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔧 Development

### Building from Source
```bash
git clone https://github.com/smartlabsAT/claude-playwright.git
cd claude-playwright-toolkit
npm install
npm run build
```

### Running Tests  
```bash
npm test
```