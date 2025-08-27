import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { promptForOptions, validateProjectName, InitOptions } from './init-interactive';
import { selectTemplate } from './template-selector';
import { TemplateGenerator } from './template-generator';
import { setupMCPForClaude, checkClaudeInstallation, setupBrowserProfiles } from './mcp-setup';

export async function initProject(options: {
  name: string;
  template: string;
}) {
  const projectPath = path.join(process.cwd(), options.name);
  
  // Create project directory
  await fs.ensureDir(projectPath);
  
  // Copy templates
  await copyTemplates(projectPath, options);
  
  // Generate MCP config
  await generateMCPConfig(projectPath);
  
  // Generate CLAUDE.md
  await generateClaudeMD(projectPath, options.name);
  
  console.log(chalk.green('✓') + ' Project structure created');
  console.log(chalk.green('✓') + ' MCP configuration generated');
  console.log(chalk.green('✓') + ' CLAUDE.md created');
}

/**
 * Interactive project initialization
 */
export async function initProjectInteractive(): Promise<void> {
  console.log(chalk.blue('🚀 Claude-Playwright Interactive Setup'));
  
  try {
    // Get user preferences through interactive prompts
    const options = await promptForOptions();
    
    // Validate project name and directory
    const isValid = await validateProjectName(options.name);
    if (!isValid) {
      console.log(chalk.yellow('⚠ Initialization cancelled'));
      return;
    }

    const projectPath = path.resolve(options.name);

    // Check Claude installation if MCP is requested
    if (options.configureMCP) {
      const claudeInstalled = await checkClaudeInstallation();
      if (!claudeInstalled) {
        console.log(chalk.red('❌ Please install Claude Code first'));
        process.exit(1);
      }
    }

    // Select and load template
    const templateMetadata = await selectTemplate(options.template);
    
    // Generate project from template
    const generator = new TemplateGenerator(projectPath, {
      PROJECT_NAME: options.name,
      TEMPLATE_TYPE: options.template
    });
    
    await generator.generateFromTemplate(options.template, templateMetadata);

    // Setup MCP configuration if requested
    if (options.configureMCP) {
      await setupBrowserProfiles(projectPath);
      const mcpSuccess = await setupMCPForClaude(projectPath);
      if (!mcpSuccess) {
        console.log(chalk.yellow('⚠ MCP configuration failed, but project was created'));
      }
    }

    // Install dependencies if requested
    if (options.installDeps) {
      await installDependencies(projectPath);
    }

    // Show completion message
    showCompletionMessage(options);

  } catch (error) {
    console.error(chalk.red('❌ Initialization failed:'), error);
    process.exit(1);
  }
}

/**
 * Install project dependencies
 */
async function installDependencies(projectPath: string): Promise<void> {
  console.log(chalk.blue('\n📦 Installing dependencies...'));
  
  const { spawn } = await import('child_process');
  
  return new Promise<void>((resolve, reject) => {
    const npm = spawn('npm', ['install'], {
      cwd: projectPath,
      stdio: 'inherit',
      shell: true
    });

    npm.on('close', (code) => {
      if (code === 0) {
        console.log(chalk.green('✓ Dependencies installed successfully'));
        resolve();
      } else {
        console.log(chalk.yellow('⚠ Failed to install dependencies automatically'));
        console.log(chalk.gray('  You can install them manually with: npm install'));
        resolve(); // Don't fail the whole process
      }
    });

    npm.on('error', (err) => {
      console.log(chalk.yellow('⚠ Failed to install dependencies automatically'));
      console.log(chalk.gray('  You can install them manually with: npm install'));
      resolve(); // Don't fail the whole process
    });
  });
}

/**
 * Show completion message with next steps
 */
function showCompletionMessage(options: InitOptions): void {
  console.log(chalk.green('\n🎉 Project initialized successfully!'));
  
  console.log(chalk.blue('\n📋 Next steps:'));
  console.log(chalk.white(`1. cd ${options.name}`));
  
  if (!options.installDeps) {
    console.log(chalk.white('2. npm install'));
    console.log(chalk.white('3. npx playwright install'));
  } else {
    console.log(chalk.white('2. npx playwright install'));
  }
  
  if (options.configureMCP) {
    console.log(chalk.white('3. Restart Claude Code to load MCP configuration'));
    console.log(chalk.white('4. Open your project in Claude Code'));
  }
  
  console.log(chalk.white('5. Start writing tests with: npm test'));
  
  console.log(chalk.blue('\n🧪 Available Commands:'));
  console.log(chalk.gray('  npm test         - Run all tests'));
  console.log(chalk.gray('  npm run test:ui  - Run tests with UI mode'));
  console.log(chalk.gray('  npm run test:debug - Debug tests'));
  console.log(chalk.gray('  npm run codegen  - Generate test code'));
  
  if (options.template === 'enterprise') {
    console.log(chalk.gray('  npm run test:docker - Run tests in Docker'));
    console.log(chalk.gray('  npm run test:visual - Visual regression tests'));
  }

  console.log(chalk.blue('\n🎯 You can now use Playwright with Claude Code integration!'));
}

async function copyTemplates(projectPath: string, options: any) {
  const templatePath = path.join(__dirname, '../../templates/minimal');
  
  // Create directories
  const dirs = [
    'src/pages/base',
    'src/fixtures',
    'src/tests',
    'src/utils',
    'playwright-auth',
    'browser-profiles'
  ];
  
  for (const dir of dirs) {
    await fs.ensureDir(path.join(projectPath, dir));
  }
  
  // Copy package.json
  const packageJson = {
    name: options.name,
    version: '1.0.0',
    scripts: {
      'test': 'playwright test',
      'test:ui': 'playwright test --ui',
      'test:debug': 'playwright test --debug'
    },
    devDependencies: {
      '@playwright/test': '^1.40.0',
      'typescript': '^5.0.0'
    }
  };
  
  await fs.writeJSON(
    path.join(projectPath, 'package.json'),
    packageJson,
    { spaces: 2 }
  );
  
  // Copy playwright.config.ts
  await fs.writeFile(
    path.join(projectPath, 'playwright.config.ts'),
    PLAYWRIGHT_CONFIG_TEMPLATE
  );
  
  // Copy BasePage
  await fs.writeFile(
    path.join(projectPath, 'src/pages/base/BasePage.ts'),
    BASE_PAGE_TEMPLATE
  );
  
  // Create example test
  await fs.writeFile(
    path.join(projectPath, 'src/tests/example.spec.ts'),
    EXAMPLE_TEST_TEMPLATE
  );
}

async function generateMCPConfig(projectPath: string) {
  const config = {
    mcpServers: {
      playwright: {
        command: 'npx',
        args: [
          '@playwright/mcp'
        ]
      }
    }
  };
  
  await fs.writeJSON(
    path.join(projectPath, 'mcp.config.json'),
    config,
    { spaces: 2 }
  );
}

async function generateClaudeMD(projectPath: string, projectName: string) {
  const claudeMd = `# ${projectName} - Claude Code Integration

## 🚨 IMPORTANT RULES
1. **ALWAYS** check existing implementations before writing new code
2. **NEVER** rewrite existing functionality
3. **ALWAYS** extend BasePage for new Page Objects

## Project Structure
- @src/pages/base/BasePage.ts - Base class for ALL Page Objects
- @src/tests/ - Test files
- @src/fixtures/ - Reusable fixtures
- @playwright.config.ts - Playwright configuration

## Test Pattern
\`\`\`typescript
import { test, expect } from '@playwright/test';
import { BasePage } from '../pages/base/BasePage';

test('example test', async ({ page }) => {
  const basePage = new BasePage(page);
  await basePage.navigateTo('/');
  await expect(page).toHaveTitle(/Example/);
});
\`\`\`

## MCP Integration
- Server runs on port 8931
- Browser profiles in ./browser-profiles/
- Auth states in ./playwright-auth/

## Commands
- npm test - Run tests
- npm run test:ui - UI mode
- npm run test:debug - Debug mode
`;
  
  await fs.writeFile(
    path.join(projectPath, 'CLAUDE.md'),
    claudeMd
  );
}

// Template-Strings
const PLAYWRIGHT_CONFIG_TEMPLATE = `import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
});
`;

const BASE_PAGE_TEMPLATE = `import { Page, expect } from '@playwright/test';

export class BasePage {
  readonly page: Page;
  readonly baseUrl: string;

  constructor(page: Page) {
    this.page = page;
    this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
  }

  async navigateTo(path: string = '') {
    await this.page.goto(\`\${this.baseUrl}\${path}\`);
    await this.page.waitForLoadState('networkidle');
  }

  async takeScreenshot(name: string) {
    await this.page.screenshot({ 
      path: \`screenshots/\${name}.png\`,
      fullPage: true 
    });
  }

  async expectPageTitle(title: string | RegExp) {
    await expect(this.page).toHaveTitle(title);
  }

  async expectURL(url: string | RegExp) {
    await expect(this.page).toHaveURL(url);
  }

  async clickAndWait(selector: string) {
    await this.page.click(selector);
    await this.page.waitForLoadState('networkidle');
  }

  async fillForm(fields: Record<string, string>) {
    for (const [selector, value] of Object.entries(fields)) {
      await this.page.fill(selector, value);
    }
  }
}
`;

const EXAMPLE_TEST_TEMPLATE = `import { test, expect } from '@playwright/test';
import { BasePage } from '../pages/base/BasePage';

test.describe('Example Tests', () => {
  test('homepage should load', async ({ page }) => {
    const basePage = new BasePage(page);
    await basePage.navigateTo('/');
    
    // Add your assertions here
    await expect(page).toHaveTitle(/Home/);
  });

  test('should take screenshot', async ({ page }) => {
    const basePage = new BasePage(page);
    await basePage.navigateTo('/');
    await basePage.takeScreenshot('homepage');
  });
});
`;