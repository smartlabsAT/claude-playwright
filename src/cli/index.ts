#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { setupMCPForClaude, checkClaudeInstallation, setupBrowserProfiles, setupSessionMCPIntegration } from '../generators/mcp-setup';
import { SessionManager } from '../core/session-manager';
import { BrowserProfileManager } from '../core/browser-profile';
import { MCPIntegration } from '../utils/mcp-integration';
import { autoExtendSessionIfNeeded, promptForUrl, saveRealSession } from './session-commands';
import { listProfiles, createProfile, setupDefaultProfiles, showProfile, deleteProfile } from './profile-commands';

const program = new Command();

// Dynamically read version from package.json
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = fs.readJsonSync(packageJsonPath);
const version = packageJson.version;

program
  .name('claude-playwright')
  .description('Seamless integration between Claude Code and Playwright MCP')
  .version(version);

program
  .command('init')
  .description('Initialize a new Claude-Playwright project with MCP integration')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('-t, --template <template>', 'Template to use (minimal, enterprise, testing)', 'minimal')
  .option('-n, --name <name>', 'Project name')
  .option('--no-interactive', 'Skip interactive prompts')
  .action(async (options) => {
    try {
      // Use interactive mode by default, unless explicitly disabled
      if (options.interactive !== false && !options.name) {
        const { initProjectInteractive } = await import('../generators/init');
        await initProjectInteractive();
        return;
      }

      // Non-interactive mode - legacy support
      const projectDir = path.resolve(options.dir);
      const projectName = options.name || path.basename(projectDir);
      
      console.log(chalk.blue('🚀 Initializing Claude-Playwright project...'));
      console.log(chalk.gray(`📁 Project directory: ${projectDir}`));
      console.log(chalk.gray(`📋 Template: ${options.template}`));
      
      // Check if Claude Code is installed
      const claudeInstalled = await checkClaudeInstallation();
      if (!claudeInstalled) {
        console.log(chalk.red('❌ Please install Claude Code first'));
        process.exit(1);
      }
      
      // Use new template system for non-interactive mode
      const { selectTemplate } = await import('../generators/template-selector');
      const { TemplateGenerator } = await import('../generators/template-generator');
      
      const templateMetadata = await selectTemplate(options.template);
      const generator = new TemplateGenerator(projectDir, {
        PROJECT_NAME: projectName,
        TEMPLATE_TYPE: options.template
      });
      
      await generator.generateFromTemplate(options.template, templateMetadata);
      
      // Setup MCP configuration with session support
      await setupBrowserProfiles(projectDir);
      const mcpSuccess = await setupMCPForClaude(projectDir);
      const sessionIntegrationSuccess = await setupSessionMCPIntegration(projectDir);
      
      if (!mcpSuccess) {
        console.log(chalk.yellow('⚠ MCP configuration failed, but project was created'));
      }
      
      if (!sessionIntegrationSuccess) {
        console.log(chalk.yellow('⚠ Session-MCP integration setup failed'));
      }
      
      console.log(chalk.green('✅ Project initialized successfully!'));
      console.log(chalk.blue('\n📋 Next steps:'));
      console.log(chalk.white(`1. cd ${projectName}`));
      console.log(chalk.white('2. npm install'));
      console.log(chalk.white('3. npx playwright install'));
      console.log(chalk.white('4. Restart Claude Code to load MCP configuration'));
      console.log(chalk.blue('\n🎯 You can now use Playwright MCP tools directly in Claude Code!'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Initialization failed:'), error);
      process.exit(1);
    }
  });

program
  .command('configure-mcp')
  .description('Configure MCP for Claude Code without full project initialization')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .action(async (options) => {
    const projectDir = path.resolve(options.dir);
    
    console.log(chalk.blue('🔧 Configuring MCP for Claude Code...'));
    
    try {
      // Check if Claude Code is installed
      const claudeInstalled = await checkClaudeInstallation();
      if (!claudeInstalled) {
        console.log(chalk.red('❌ Please install Claude Code first'));
        process.exit(1);
      }
      
      // Create project config if it doesn't exist
      const configPath = path.join(projectDir, 'claude-playwright.config.js');
      if (!await fs.pathExists(configPath)) {
        const { generateProjectConfig } = await import('../generators/project-config');
        await generateProjectConfig(projectDir);
      }
      
      // Setup browser profiles and sessions
      await setupBrowserProfiles(projectDir);
      
      // Setup MCP configuration
      const mcpSuccess = await setupMCPForClaude(projectDir);
      const sessionIntegrationSuccess = await setupSessionMCPIntegration(projectDir);
      
      if (mcpSuccess && sessionIntegrationSuccess) {
        console.log(chalk.green('✅ MCP and session integration configured successfully!'));
        console.log(chalk.blue('📋 Please restart Claude Code to load the new configuration'));
        console.log(chalk.gray('💡 Sessions will now auto-load when MCP starts'));
      } else {
        if (!mcpSuccess) {
          console.log(chalk.red('❌ Failed to configure MCP'));
        }
        if (!sessionIntegrationSuccess) {
          console.log(chalk.red('❌ Failed to configure session integration'));
        }
        process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Configuration failed:'), error);
      process.exit(1);
    }
  });

// Scaffold commands - Generate code from templates
program
  .command('scaffold <type> <name>')
  .description('Generate code from templates (types: page, test, fixture)')
  .option('-p, --path <path>', 'Target directory')
  .option('--url <url>', 'URL for page objects')
  .option('--page-object <class>', 'Page object class to use')
  .option('--session <name>', 'Session to use for authenticated tests')
  .option('--fixture <name>', 'Fixture to use')
  .option('--test-type <type>', 'Test type: basic, e2e, api, visual', 'e2e')
  .option('--fixture-type <type>', 'Fixture type: auth, data, api, mixed', 'mixed')
  .option('--no-interactive', 'Skip interactive prompts')
  .action(async (type, name, options) => {
    console.log(chalk.blue(`🏗️ Scaffolding ${type}: ${name}...`));
    
    try {
      let success = false;
      
      switch (type.toLowerCase()) {
        case 'page':
          const { scaffoldPage } = await import('../generators/scaffold-page');
          success = await scaffoldPage(name, {
            path: options.path,
            url: options.url,
            interactive: options.interactive,
            browserProfile: options.profile
          });
          break;
          
        case 'test':
          const { scaffoldTest } = await import('../generators/scaffold-test');
          success = await scaffoldTest(name, {
            path: options.path,
            pageObject: options.pageObject,
            session: options.session,
            fixture: options.fixture,
            type: options.testType,
            interactive: options.interactive,
            browserProfile: options.profile
          });
          break;
          
        case 'fixture':
          const { scaffoldFixture } = await import('../generators/scaffold-fixture');
          success = await scaffoldFixture(name, {
            path: options.path,
            type: options.fixtureType,
            session: options.session,
            pageObject: options.pageObject,
            interactive: options.interactive,
            browserProfile: options.profile
          });
          break;
          
        default:
          console.error(chalk.red(`❌ Unknown scaffold type: ${type}`));
          console.log('Available types: page, test, fixture');
          console.log('');
          console.log('Examples:');
          console.log('  claude-playwright scaffold page LoginPage --url https://app.com/login');
          console.log('  claude-playwright scaffold test LoginTest --page-object LoginPage');
          console.log('  claude-playwright scaffold fixture AuthFixture --fixture-type auth');
          process.exit(1);
      }
      
      if (!success) {
        process.exit(1);
      }
      
    } catch (error: any) {
      console.error(chalk.red('❌ Scaffolding failed:'), error.message);
      process.exit(1);
    }
  });

async function createProjectStructure(projectDir: string): Promise<void> {
  const directories = [
    'tests',
    'tests/pages',
    'tests/fixtures',
    'playwright-config',
    'browser-profiles',
    'browser-profiles/default',
    'playwright-auth',
    'playwright-sessions'
  ];
  
  for (const dir of directories) {
    await fs.ensureDir(path.join(projectDir, dir));
  }
  
  console.log(chalk.green('✓ Project structure created'));
}

async function createProjectPackageJson(projectDir: string): Promise<void> {
  const packageJsonPath = path.join(projectDir, 'package.json');
  
  // Check if package.json already exists
  if (await fs.pathExists(packageJsonPath)) {
    console.log(chalk.yellow('⚠ package.json already exists, skipping creation'));
    return;
  }
  
  const packageJson = {
    name: path.basename(projectDir),
    version: "1.0.0",
    description: "Playwright testing project with Claude MCP integration",
    scripts: {
      "test": "playwright test",
      "test:ui": "playwright test --ui",
      "test:debug": "playwright test --debug",
      "codegen": "playwright codegen"
    },
    devDependencies: {
      "@playwright/test": "^1.40.0"
    }
  };
  
  await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
  console.log(chalk.green('✓ Package.json created'));
}

async function createClaudeInstructions(projectDir: string): Promise<void> {
  const claudeInstructionsPath = path.join(projectDir, 'CLAUDE.md');
  
  const instructions = `# Claude-Playwright Project Instructions

## MCP Integration Active
This project is configured with Playwright MCP integration for Claude Code.

## Available MCP Tools
- Browser automation via Playwright
- Screenshot capture and analysis
- Page interaction and testing
- Element selection and manipulation

## Project Structure
- \`tests/\` - Playwright test files
- \`tests/pages/\` - Page Object Model files
- \`tests/fixtures/\` - Test fixtures and data
- \`browser-profiles/\` - Browser profiles for persistent sessions
- \`auth-states/\` - Authentication state storage

## Usage with Claude
1. Use MCP tools for browser automation
2. Create Page Object Models in \`tests/pages/\`
3. Write tests using Playwright best practices
4. Leverage browser profiles for authenticated testing

## Commands
- \`npm run test\` - Run all tests
- \`npm run test:ui\` - Run tests with UI mode
- \`npm run test:debug\` - Run tests in debug mode
- \`npm run codegen\` - Generate test code interactively
`;
  
  await fs.writeFile(claudeInstructionsPath, instructions);
  console.log(chalk.green('✓ Claude instructions created'));
}

async function copyTemplateFiles(projectDir: string): Promise<void> {
  const templatePath = path.join(__dirname, '../../templates');
  
  // Copy playwright.config.ts if it exists
  const playwrightConfigTemplate = path.join(templatePath, 'playwright.config.ts');
  const playwrightConfigTarget = path.join(projectDir, 'playwright.config.ts');
  
  if (await fs.pathExists(playwrightConfigTemplate)) {
    await fs.copyFile(playwrightConfigTemplate, playwrightConfigTarget);
    console.log(chalk.green('✓ Playwright config copied'));
  }
  
  // Copy base page template
  const basePageTemplate = path.join(templatePath, 'base-page.ts');
  const basePageTarget = path.join(projectDir, 'tests/pages/base-page.ts');
  
  if (await fs.pathExists(basePageTemplate)) {
    await fs.copyFile(basePageTemplate, basePageTarget);
    console.log(chalk.green('✓ Base page template copied'));
  }
  
  // Copy example test
  const exampleTestTemplate = path.join(templatePath, 'example.spec.ts');
  const exampleTestTarget = path.join(projectDir, 'tests/example.spec.ts');
  
  if (await fs.pathExists(exampleTestTemplate)) {
    await fs.copyFile(exampleTestTemplate, exampleTestTarget);
    console.log(chalk.green('✓ Example test copied'));
  }
}

// Session Management Commands
program
  .command('session <action>')
  .description('Manage browser sessions')
  .argument('[name]', 'Session name (required for save/load/delete/extend actions)')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--url <url>', 'URL to navigate to for session capture')
  .option('--profile <profile>', 'Browser profile to use (desktop, mobile, tablet)')
  .action(async (action, name, options) => {
    const projectDir = path.resolve(options.dir);
    const sessionManager = new SessionManager(projectDir);
    
    try {
      switch (action) {
        case 'list':
          const sessions = await sessionManager.listSessions();
          if (sessions.length === 0) {
            console.log(chalk.gray('No saved sessions found'));
            return;
          }
          
          console.log(chalk.blue('📋 Browser Sessions:'));
          console.log('');
          console.log(chalk.cyan('Name'.padEnd(20)) + chalk.cyan('Created'.padEnd(20)) + chalk.cyan('Expires'.padEnd(20)) + chalk.cyan('Status'.padEnd(10)));
          console.log('─'.repeat(70));
          
          for (const session of sessions) {
            const statusColor = session.expired ? chalk.red : chalk.green;
            const statusText = session.expired ? 'EXPIRED' : 'VALID';
            
            // Add null checks and default values for padEnd() calls
            const safeName = (session.name || 'unknown').padEnd(20);
            const safeCreated = (session.created || 'N/A').padEnd(20);
            const safeExpires = (session.expires || 'N/A').padEnd(20);
            const safeStatus = statusText.padEnd(10);
            
            console.log(
              chalk.white(safeName) +
              chalk.gray(safeCreated) +
              chalk.gray(safeExpires) +
              statusColor(safeStatus)
            );
          }
          break;
          
        case 'save':
          if (!name) {
            console.error(chalk.red('❌ Session name required for save action'));
            process.exit(1);
          }
          
          // Check if session should be auto-extended
          await autoExtendSessionIfNeeded(name);
          
          // Get URL from options or prompt user
          const url = options.url || await promptForUrl();
          
          // Save real session using browser automation
          const success = await saveRealSession(name, url, {
            browserProfile: options.profile,
            timeout: 300000 // 5 minutes timeout
          });
          
          if (!success) {
            console.error(chalk.red('❌ Failed to save session'));
            process.exit(1);
          }
          break;
          
        case 'load':
          if (!name) {
            console.error(chalk.red('❌ Session name required for load action'));
            process.exit(1);
          }
          
          await sessionManager.loadSession(name);
          console.log(chalk.green('✓') + ` Session loaded: ${name}`);
          break;
          
        case 'clear':
          const clearedCount = await sessionManager.clearExpiredSessions();
          if (clearedCount === 0) {
            console.log(chalk.green('✓ No expired sessions to clear'));
          } else {
            console.log(chalk.green(`✓ Cleared ${clearedCount} expired session(s)`));
          }
          break;
          
        case 'extend':
          if (!name) {
            console.error(chalk.red('❌ Session name required for extend action'));
            process.exit(1);
          }
          
          const extended = await sessionManager.extendSession(name);
          if (!extended) {
            process.exit(1);
          }
          break;
          
        case 'health':
          if (name) {
            // Check specific session health
            const health = await sessionManager.checkSessionHealth(name);
            console.log(chalk.blue(`🏥 Session Health: ${name}`));
            console.log('');
            console.log(`Status: ${health.isValid ? chalk.green('VALID') : chalk.red('INVALID')}`);
            console.log(`Hours Remaining: ${health.hoursRemaining.toFixed(1)}`);
            console.log(`Recommendation: ${health.recommendation}`);
            console.log(`Needs Extension: ${health.needsExtension ? chalk.yellow('YES') : chalk.green('NO')}`);
          } else {
            // Check all sessions health
            const healthChecks = await sessionManager.checkAllSessionsHealth();
            
            if (healthChecks.length === 0) {
              console.log(chalk.gray('No sessions found'));
              return;
            }
            
            console.log(chalk.blue('🏥 All Sessions Health Check:'));
            console.log('');
            
            for (const health of healthChecks) {
              const statusColor = health.isValid ? chalk.green : chalk.red;
              const statusText = health.isValid ? 'VALID' : 'INVALID';
              
              console.log(`${chalk.white(health.name)} - ${statusColor(statusText)} (${health.hoursRemaining.toFixed(1)}h)`);
              console.log(chalk.gray(`  ${health.recommendation}`));
              
              if (health.needsExtension) {
                console.log(chalk.yellow(`  ⚠️ Needs extension`));
              }
              console.log('');
            }
          }
          break;
          
        case 'delete':
          if (!name) {
            console.error(chalk.red('❌ Session name required for delete action'));
            process.exit(1);
          }
          
          const deleted = await sessionManager.deleteSession(name);
          if (!deleted) {
            console.error(chalk.red(`❌ Session not found: ${name}`));
            process.exit(1);
          }
          break;
          
        case 'switch':
          if (!name) {
            // Show available sessions if no name provided
            const sessions = await sessionManager.listSessions();
            if (sessions.length === 0) {
              console.log(chalk.gray('No saved sessions found'));
            } else {
              console.log(chalk.blue('📋 Available sessions:'));
              for (const session of sessions) {
                console.log(`  - ${session.name}`);
              }
            }
            
            // Show current active session
            const activeSession = await sessionManager.getActiveSession();
            if (activeSession) {
              console.log(chalk.green(`\n✓ Active session: ${activeSession}`));
            } else {
              console.log(chalk.gray('\nNo active session'));
            }
            
            console.log(chalk.gray('\nUsage: claude-playwright session switch <session-name>'));
            return;
          }
          
          // Switch to specified session
          const switched = await sessionManager.switchSession(name);
          if (switched) {
            console.log(chalk.green(`✓ Switched to session: ${name}`));
            console.log(chalk.gray('\nNote: Restart Claude Code or reconnect MCP for changes to take effect'));
          } else {
            console.error(chalk.red(`❌ Failed to switch to session: ${name}`));
            process.exit(1);
          }
          break;
          
        default:
          console.error(chalk.red(`❌ Unknown action: ${action}`));
          console.log('Available actions: list, save, load, clear, delete, extend, health, switch');
          console.log('');
          console.log('Examples:');
          console.log('  claude-playwright session save mysite --url https://example.com/login');
          console.log('  claude-playwright session list');
          console.log('  claude-playwright session switch mysite');
          console.log('  claude-playwright session health');
          console.log('  claude-playwright session health mysite');
          console.log('  claude-playwright session extend mysite');
          process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Session command failed:'), error.message);
      process.exit(1);
    }
  });

// Profile Management Commands
program
  .command('profile <action>')
  .description('Manage browser profiles for different device types and use cases')
  .argument('[name]', 'Profile name (required for some actions)')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--viewport <size>', 'Viewport size (e.g., 375x667)')
  .option('--device <type>', 'Device type: desktop, mobile, tablet')
  .option('--user-agent <ua>', 'Custom user agent string')
  .option('--description <desc>', 'Profile description')
  .option('--force', 'Force overwrite existing profiles (for setup action)')
  .action(async (action, name, options) => {
    const projectDir = path.resolve(options.dir);
    
    try {
      switch (action) {
        case 'list':
          await listProfiles();
          break;
          
        case 'create':
          if (!name) {
            console.error(chalk.red('❌ Profile name required'));
            console.log(chalk.gray('Usage: claude-playwright profile create <name> --device <type>'));
            process.exit(1);
          }
          
          const success = await createProfile(name, {
            viewport: options.viewport,
            userAgent: options.userAgent,
            deviceType: options.device,
            description: options.description
          });
          
          if (!success) {
            process.exit(1);
          }
          break;
          
        case 'setup':
          const forceFlag = options.force || false;
          await setupDefaultProfiles(forceFlag);
          break;
          
        case 'show':
          if (!name) {
            console.error(chalk.red('❌ Profile name required'));
            process.exit(1);
          }
          
          await showProfile(name);
          break;
          
        case 'delete':
          if (!name) {
            console.error(chalk.red('❌ Profile name required'));
            process.exit(1);
          }
          
          const deleted = await deleteProfile(name);
          if (!deleted) {
            process.exit(1);
          }
          break;
          
        default:
          console.error(chalk.red(`❌ Unknown action: ${action}`));
          console.log('Available actions: list, create, show, setup, delete');
          console.log('');
          console.log('Examples:');
          console.log('  claude-playwright profile create mobile --device mobile');
          console.log('  claude-playwright profile create custom --viewport 1440x900 --device desktop');
          console.log('  claude-playwright profile setup');
          console.log('  claude-playwright profile setup --force');
          console.log('  claude-playwright profile list');
          console.log('  claude-playwright profile show mobile');
          process.exit(1);
      }
    } catch (error: any) {
      console.error(chalk.red('❌ Profile command failed:'), error.message);
      process.exit(1);
    }
  });

// MCP Integration Status Command
program
  .command('mcp-status')
  .description('Check MCP integration status and session/profile information')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .action(async (options) => {
    const projectDir = path.resolve(options.dir);
    const mcpIntegration = new MCPIntegration(projectDir);
    
    try {
      console.log(chalk.blue('🔍 MCP Integration Status Report'));
      console.log('');
      
      const status = await mcpIntegration.getStatusReport();
      
      console.log(chalk.cyan('📊 Current Status:'));
      console.log(`   Active Sessions: ${chalk.green(status.activeSessions)}`);
      console.log(`   Expired Sessions: ${status.expiredSessions > 0 ? chalk.red(status.expiredSessions) : chalk.gray('0')}`);
      console.log(`   Available Profiles: ${chalk.green(status.availableProfiles)}`);
      console.log('');
      
      if (status.currentSession) {
        console.log(chalk.cyan('🎯 Active MCP Session:'));
        console.log(`   Session: ${chalk.green(status.currentSession)}`);
        
        if (status.currentProfile) {
          console.log(`   Profile: ${chalk.green(status.currentProfile)}`);
        } else {
          console.log(`   Profile: ${chalk.gray('none')}`);
        }
        console.log('');
      } else {
        console.log(chalk.yellow('⚠️  No active MCP session found'));
        console.log('');
      }
      
      if (status.recommendations.length > 0) {
        console.log(chalk.cyan('💡 Recommendations:'));
        for (const recommendation of status.recommendations) {
          console.log(`   • ${recommendation}`);
        }
        console.log('');
      }
      
      // Show environment variables
      console.log(chalk.cyan('🌐 Environment Variables:'));
      const envVars = [
        'PLAYWRIGHT_ACTIVE_SESSION',
        'PLAYWRIGHT_ACTIVE_PROFILE',
        'PLAYWRIGHT_LAST_URL',
        'PLAYWRIGHT_VIEWPORT',
        'PLAYWRIGHT_USER_AGENT'
      ];
      
      for (const envVar of envVars) {
        const value = process.env[envVar];
        if (value) {
          const displayValue = value.length > 50 ? value.substring(0, 50) + '...' : value;
          console.log(`   ${envVar}: ${chalk.gray(displayValue)}`);
        }
      }
      
      console.log('');
      console.log(chalk.green('✅ Status check completed'));
      
    } catch (error: any) {
      console.error(chalk.red('❌ Status check failed:'), error.message);
      process.exit(1);
    }
  });

// Always run when executed directly (not when imported as module)
program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red('❌ CLI Error:'), error.message);
  process.exit(1);
});

export { program };