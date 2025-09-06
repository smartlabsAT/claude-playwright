#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';
import { SessionManager } from '../core/session-manager';
import { MCPIntegration } from '../utils/mcp-integration';
import { autoExtendSessionIfNeeded, promptForUrl, saveRealSession } from './session-commands';
import { listProfiles, createProfile, setupDefaultProfiles, showProfile, deleteProfile } from './profile-commands';
import { showCacheInfo, clearCache, showCacheHealth, debugCache } from './cache-commands';

/**
 * Show comprehensive cache help information
 */
function showCacheHelp(action?: string): void {
  console.log();
  console.log(chalk.blue.bold('🏆 Unified Cache System Help'));
  console.log(chalk.gray('AI-aware caching with 100% reliability'));
  console.log();
  
  if (action && action !== 'help') {
    console.log(chalk.red(`❌ Unknown action: ${chalk.white(action)}`));
    console.log();
  }
  
  console.log(chalk.cyan.bold('Available Commands:'));
  console.log();
  
  // Info command
  console.log(`  ${chalk.green('info')} ${chalk.gray('(or status)')}`);
  console.log(`    ${chalk.white('Show comprehensive cache statistics and performance metrics')}`);
    console.log(`    ${chalk.gray('• Cache hit rates by type (exact, normalized, reverse, fuzzy)')}`);
  console.log(`    ${chalk.gray('• Unified system metrics (selectors + snapshots)')}`);
  console.log(`    ${chalk.gray('• Memory and SQLite performance breakdown')}`);
  console.log(`    ${chalk.gray('• File sizes and storage information')}`);
  console.log();
  
  // Clear command
  console.log(`  ${chalk.red('clear')} ${chalk.gray('[--force]')}`);
  console.log(`    ${chalk.white('Remove all cached data and rebuild from scratch')}`);
  console.log(`    ${chalk.gray('• Clears selector cache, snapshots, and learned patterns')}`);
  console.log(`    ${chalk.gray('• Use --force to skip confirmation prompt')}`);
  console.log(`    ${chalk.gray('• Cache rebuilds automatically during usage')}`);
  console.log();
  
  // Health command
  console.log(`  ${chalk.blue('health')}`);
  console.log(`    ${chalk.white('Comprehensive system health check with recommendations')}`);
  console.log(`    ${chalk.gray('• Tests all cache components (memory, SQLite, bidirectional)')}`);
  console.log(`    ${chalk.gray('• Performance analysis and optimization suggestions')}`);
  console.log(`    ${chalk.gray('• Identifies potential issues and solutions')}`);
  console.log();
  
  // Debug command  
  console.log(`  ${chalk.yellow('debug')}`);
  console.log(`    ${chalk.white('Detailed debug information for troubleshooting')}`);
  console.log(`    ${chalk.gray('• Recent cache operations and failure analysis')}`);
  console.log(`    ${chalk.gray('• Similarity calculation insights')}`);
  console.log(`    ${chalk.gray('• Includes full cache info for comprehensive debugging')}`);
  console.log();
  
  console.log(chalk.cyan.bold('Examples:'));
  console.log();
  console.log(`  ${chalk.white('npx claude-playwright cache info')}`);
  console.log(`  ${chalk.gray('# View unified cache statistics and performance metrics')}`);
  console.log();
  console.log(`  ${chalk.white('npx claude-playwright cache clear --force')}`);
  console.log(`  ${chalk.gray('# Clear all cache data without confirmation')}`);
  console.log();
  console.log(`  ${chalk.white('npx claude-playwright cache health')}`);
  console.log(`  ${chalk.gray('# Check system health and get performance recommendations')}`);
  console.log();
  console.log(`  ${chalk.white('npx claude-playwright cache debug')}`);
  console.log(`  ${chalk.gray('# Show detailed debug information for troubleshooting')}`);
  console.log();
  

  

  
  console.log(chalk.gray('📚 For more information: https://github.com/smartlabsAT/claude-playwright'));
}
import { createMcpCommand } from '../commands/mcp';
import { createMigrationCommand } from '../commands/migration';

const program = new Command();

// Dynamically read version from package.json
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = fs.readJsonSync(packageJsonPath);
const version = packageJson.version;

program
  .name('claude-playwright')
  .description('🎭 Seamless integration between Claude Code and Playwright MCP')
  .version(version, '-v, --version', 'Display version number')
  .addHelpText('before', `
${chalk.blue.bold('🎭 Claude Playwright')}
${chalk.gray('Powerful browser automation integration for Claude Code')}
`)
  .addHelpText('after', `
${chalk.cyan('Quick Start:')}
  ${chalk.white('npx claude-playwright mcp init --base-url http://localhost:3000')}
  ${chalk.gray('# Initialize MCP integration with your app')}

${chalk.cyan('Common Commands:')}
  ${chalk.white('npx claude-playwright session list')}        ${chalk.gray('# List all browser sessions')}
  ${chalk.white('npx claude-playwright session save <name>')}  ${chalk.gray('# Save authenticated session')}
  ${chalk.white('npx claude-playwright cache info')}          ${chalk.gray('# View unified cache statistics')}
  ${chalk.white('npx claude-playwright mcp status')}         ${chalk.gray('# Check MCP server connection')}

${chalk.cyan('Key Features:')}
  ${chalk.green('✅')} 20+ browser automation tools for Claude
  ${chalk.green('✅')} Unified bidirectional cache system (AI-aware)
  ${chalk.green('✅')} Persistent browser sessions with authentication
  ${chalk.green('✅')} Universal selector fallbacks (100% reliability)
  ${chalk.green('✅')} Multilingual support (English/German)

${chalk.yellow('📚 Documentation:')} https://github.com/smartlabsAT/claude-playwright
`);

// Session Management Commands
program
  .command('session <action>')
  .description('Manage browser sessions')
  .argument('[name]', 'Session name (required for save/load/delete/extend actions)')
  .option('-d, --dir <directory>', 'Project directory', '.')
  .option('--url <url>', 'URL to navigate to for session capture')
  .option('--profile <profile>', 'Browser profile to use (desktop, mobile, tablet)')
  .action(async (action, name, options) => {
    const sessionManager = new SessionManager(); // Use project-local storage
    
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

// Cache Management Commands
program
  .command('cache [action]')
  .description('Manage unified bidirectional cache system')
  .addHelpText('after', `
${chalk.cyan('Available Actions:')}
  ${chalk.green('info')}     Show comprehensive cache statistics
  ${chalk.red('clear')}    Clear all cached data
  ${chalk.blue('health')}   System health check with recommendations
  ${chalk.yellow('debug')}    Detailed debug information

${chalk.cyan('Examples:')}
  ${chalk.white('npx claude-playwright cache info')}
  ${chalk.white('npx claude-playwright cache clear --force')}
  ${chalk.white('npx claude-playwright cache health')}

Run ${chalk.white('npx claude-playwright cache help')} for detailed information.
`)
  .option('--force', 'Force operation without confirmation (for clear action)')
  .action(async (action, options) => {
    // If no action is provided, show help
    if (!action) {
      showCacheHelp();
      return;
    }
    
    try {
      switch (action) {
        case 'info':
        case 'status':
          await showCacheInfo();
          break;
          
        case 'clear':
          await clearCache({ force: options.force });
          break;
          
        case 'health':
          await showCacheHealth();
          break;
          
        case 'debug':
          await debugCache();
          break;
          
        case 'help':
        case '--help':
        case '-h':
          showCacheHelp();
          break;
          
        default:
          showCacheHelp(action);
          process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ Cache command failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// ============= TEST MANAGEMENT COMMANDS =============

program
  .command('test <action>')
  .description('Intelligent test scenario management')
  .option('-n, --name <name>', 'Test scenario name')
  .option('-d, --description <desc>', 'Test description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .option('-u, --url <url>', 'Target URL for test')
  .option('-p, --profile <profile>', 'Browser profile')
  .option('-f, --file <file>', 'JSON file containing test steps')
  .option('-q, --query <query>', 'Search query for finding tests')
  .option('-l, --limit <limit>', 'Maximum number of results', '5')
  .option('--save-adapted', 'Save adapted test as new scenario')
  .option('--force', 'Force operation without confirmation')
  .option('--all', 'Delete all test scenarios')
  .option('--tag <tag>', 'Target tag for operations')
  .action(async (action: string, options) => {
    try {
      await handleTestCommand(action, options);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(chalk.red('❌ Test command failed:'), errorMessage);
      process.exit(1);
    }
  });

async function handleTestCommand(action: string, options: any): Promise<void> {
  const { TestScenarioCache } = await import('../core/test-scenario-cache.js');
  const { TestPatternMatcher } = await import('../core/test-pattern-matcher.js');
  
  const cache = new TestScenarioCache();
  const matcher = new TestPatternMatcher(cache);

  switch (action) {
    case 'save':
      await handleTestSave(cache, options);
      break;
      
    case 'list':
      await handleTestList(cache, options);
      break;
      
    case 'find':
      await handleTestFind(cache, options);
      break;
      
    case 'run':
      await handleTestRun(cache, options);
      break;
      
    case 'adapt':
      await handleTestAdapt(matcher, cache, options);
      break;
      
    case 'stats':
      await handleTestStats(cache);
      break;
      
    case 'delete':
      await handleTestDelete(cache, options);
      break;
      
    case 'help':
      showTestHelp();
      break;
      
    default:
      console.error(chalk.red(`❌ Unknown test action: ${action}`));
      showTestHelp();
      process.exit(1);
  }
}

async function handleTestSave(cache: any, options: any): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('💾 Save Test Scenario'));
  console.log();

  if (!options.name) {
    console.error(chalk.red('❌ Test name is required. Use --name <name>'));
    process.exit(1);
  }

  let steps = [];
  
  if (options.file) {
    // Load steps from JSON file
    const filePath = path.resolve(options.file);
    if (!fs.existsSync(filePath)) {
      console.error(chalk.red(`❌ File not found: ${filePath}`));
      process.exit(1);
    }
    
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      steps = data.steps || data;
    } catch (error) {
      console.error(chalk.red('❌ Failed to parse JSON file:'), error);
      process.exit(1);
    }
  } else {
    // Interactive step builder
    console.log(chalk.yellow('🔧 Interactive test builder mode'));
    console.log(chalk.gray('Enter test steps (type "done" when finished):'));
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    steps = await new Promise<any[]>((resolve) => {
      const testSteps: any[] = [];
      
      const askForStep = () => {
        rl.question(chalk.cyan(`Step ${testSteps.length + 1} - Action (navigate/click/type/wait/assert/screenshot) or "done": `), (action: string) => {
          if (action.toLowerCase() === 'done') {
            rl.close();
            resolve(testSteps);
            return;
          }
          
          if (!['navigate', 'click', 'type', 'wait', 'assert', 'screenshot'].includes(action)) {
            console.log(chalk.red('❌ Invalid action. Use: navigate, click, type, wait, assert, screenshot'));
            askForStep();
            return;
          }
          
          rl.question(chalk.cyan('Description: '), (description: string) => {
            rl.question(chalk.cyan('Target/Selector (optional): '), (target: string) => {
              rl.question(chalk.cyan('Value (optional): '), (value: string) => {
                const step = {
                  action,
                  description,
                  target: target || undefined,
                  value: value || undefined,
                  selector: target || undefined
                };
                
                testSteps.push(step);
                console.log(chalk.green('✓ Step added'));
                askForStep();
              });
            });
          });
        });
      };
      
      askForStep();
    });
  }

  if (steps.length === 0) {
    console.error(chalk.red('❌ No test steps provided'));
    process.exit(1);
  }

  const scenario = {
    name: options.name,
    description: options.description,
    steps,
    tags: options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined,
    urlPattern: options.url || 'http://localhost:3000',
    profile: options.profile
  };

  try {
    const id = await cache.saveTestScenario(scenario);
    
    console.log();
    console.log(chalk.green.bold('✅ Test scenario saved successfully!'));
    console.log(chalk.gray(`ID: ${id}`));
    console.log(chalk.gray(`Name: ${scenario.name}`));
    console.log(chalk.gray(`Steps: ${steps.length}`));
    console.log(chalk.gray(`URL Pattern: ${scenario.urlPattern}`));
    console.log();
  } catch (error) {
    console.error(chalk.red('❌ Failed to save test scenario:'), error);
    process.exit(1);
  }
}

async function handleTestList(cache: any, options: any): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('📚 Test Library'));
  console.log();

  try {
    const filterOptions = {
      profile: options.profile,
      tag: options.tag,
      urlPattern: options.url
    };

    const scenarios = await cache.listTestScenarios(filterOptions);
    const stats = await cache.getTestLibraryStats();

    console.log(chalk.cyan.bold('📊 Library Statistics:'));
    console.log(`   Total Tests: ${chalk.white(stats.totalTests)}`);
    console.log(`   Average Success Rate: ${chalk.white((stats.avgSuccessRate * 100).toFixed(1))}%`);
    console.log(`   Total Executions: ${chalk.white(stats.totalExecutions)}`);
    console.log();

    if (scenarios.length === 0) {
      console.log(chalk.yellow('🔍 No tests found matching the filters'));
      return;
    }

    console.log(chalk.cyan.bold(`🎯 Available Tests (${scenarios.length} found):`));
    console.log();

    scenarios.forEach((scenario: any, i: number) => {
      console.log(`${chalk.white.bold(`${i + 1}. ${scenario.name}`)}`);
      console.log(`   ${chalk.gray('📝')} ${scenario.description || 'No description'}`);
      console.log(`   ${chalk.gray('📍')} URL: ${scenario.urlPattern}`);
      console.log(`   ${chalk.gray('📋')} Steps: ${scenario.steps.length} (${scenario.steps.map((s: any) => s.action).join(' → ')})`);
      console.log(`   ${chalk.gray('🏷️')} Tags: ${scenario.tags ? scenario.tags.join(', ') : 'none'}`);
      console.log(`   ${chalk.gray('👤')} Profile: ${scenario.profile || 'default'}`);
      console.log();
    });
  } catch (error) {
    console.error(chalk.red('❌ Failed to list tests:'), error);
    process.exit(1);
  }
}

async function handleTestFind(cache: any, options: any): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('🔍 Find Similar Tests'));
  console.log();

  const query = options.query || options.name;
  if (!query) {
    console.error(chalk.red('❌ Search query required. Use --query <query>'));
    process.exit(1);
  }

  try {
    const limit = parseInt(options.limit) || 5;
    const results = await cache.findSimilarTests(query, options.url, options.profile, limit);

    if (results.length === 0) {
      console.log(chalk.yellow(`🔍 No similar tests found for: "${query}"`));
      return;
    }

    console.log(chalk.cyan.bold(`🎯 Found ${results.length} similar tests for: "${query}"`));
    console.log();

    results.forEach((result: any, i: number) => {
      const scenario = result.scenario;
      const similarity = (result.similarity * 100).toFixed(1);
      const confidence = (result.confidence * 100).toFixed(1);

      console.log(`${chalk.white.bold(`${i + 1}. ${scenario.name}`)} ${chalk.green(`(${similarity}% similarity)`)}`);
      console.log(`   ${chalk.gray('📝')} ${scenario.description || 'No description'}`);
      console.log(`   ${chalk.gray('🎯')} Confidence: ${confidence}%`);
      console.log(`   ${chalk.gray('📍')} URL: ${scenario.urlPattern}`);
      console.log(`   ${chalk.gray('📋')} Steps: ${scenario.steps.length}`);
      console.log(`   ${chalk.gray('🏷️')} Tags: ${scenario.tags ? scenario.tags.join(', ') : 'none'}`);
      console.log(`   ${chalk.gray('⚡')} Actions: ${scenario.steps.map((s: any) => s.action).join(' → ')}`);
      
      if (result.adaptationSuggestions && result.adaptationSuggestions.length > 0) {
        console.log(`   ${chalk.gray('🔧')} Adaptations: ${result.adaptationSuggestions.join(', ')}`);
      }
      console.log();
    });
  } catch (error) {
    console.error(chalk.red('❌ Failed to find tests:'), error);
    process.exit(1);
  }
}

async function handleTestRun(cache: any, options: any): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('🏃 Run Test Scenario'));
  console.log();

  if (!options.name) {
    console.error(chalk.red('❌ Test name required. Use --name <name>'));
    process.exit(1);
  }

  try {
    console.log(chalk.cyan(`🎯 Executing test: ${options.name}`));
    
    const adaptContext = {
      url: options.url,
      profile: options.profile
    };

    const result = await cache.executeTestScenario(options.name, adaptContext);
    
    console.log();
    if (result.success) {
      console.log(chalk.green.bold('✅ Test PASSED'));
    } else {
      console.log(chalk.red.bold('❌ Test FAILED'));
    }
    
    console.log(chalk.gray(`⏱️ Execution Time: ${result.executionTime}ms`));
    
    if (result.adaptations.length > 0) {
      console.log(chalk.yellow(`🔧 Adaptations Applied: ${result.adaptations.length}`));
      result.adaptations.forEach((adaptation: string, i: number) => {
        console.log(`   ${i + 1}. ${adaptation}`);
      });
    }
    console.log();
  } catch (error) {
    console.error(chalk.red('❌ Test execution failed:'), error);
    process.exit(1);
  }
}

async function handleTestAdapt(matcher: any, cache: any, options: any): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('🔄 Adapt Test Scenario'));
  console.log();

  if (!options.name) {
    console.error(chalk.red('❌ Test name required. Use --name <name>'));
    process.exit(1);
  }

  try {
    // Get original scenario
    const scenarios = await cache.listTestScenarios();
    const originalScenario = scenarios.find((s: any) => s.name === options.name);
    
    if (!originalScenario) {
      console.error(chalk.red(`❌ Test scenario '${options.name}' not found`));
      process.exit(1);
    }

    const context = {
      url: options.url || 'http://localhost:3000',
      profile: options.profile || 'default'
    };

    console.log(chalk.cyan(`🎯 Adapting test: ${options.name}`));
    console.log(chalk.gray(`📍 Target URL: ${context.url}`));
    
    const adaptation = await matcher.adaptTestScenario(originalScenario, context);
    
    console.log();
    console.log(chalk.yellow.bold('🔄 Adaptation Results:'));
    console.log();
    console.log(chalk.gray(`📍 Original URL: ${originalScenario.urlPattern}`));
    console.log(chalk.gray(`📍 Target URL: ${context.url}`));
    console.log(chalk.gray(`🔧 Adaptations: ${adaptation.adaptations.length}`));
    console.log();
    
    if (adaptation.adaptations.length > 0) {
      console.log(chalk.cyan.bold('Adaptations Made:'));
      adaptation.adaptations.forEach((adapt: string, i: number) => {
        console.log(`${i + 1}. ${adapt}`);
      });
      console.log();
    }

    console.log(chalk.cyan.bold('Adapted Test Steps:'));
    adaptation.adaptedScenario.steps.forEach((step: any, i: number) => {
      console.log(`${i + 1}. ${chalk.white.bold(step.action.toUpperCase())}: ${step.description}`);
      if (step.selector) console.log(`   🎯 Selector: ${step.selector}`);
      if (step.target) console.log(`   🎯 Target: ${step.target}`);
      if (step.value) console.log(`   💭 Value: ${step.value}`);
    });

    if (options.saveAdapted) {
      const adaptedName = `${options.name} (Adapted)`;
      const adaptedScenario = { ...adaptation.adaptedScenario, name: adaptedName };
      await cache.saveTestScenario(adaptedScenario);
      console.log();
      console.log(chalk.green(`✅ Adapted test saved as '${adaptedName}'`));
    }
    console.log();
  } catch (error) {
    console.error(chalk.red('❌ Test adaptation failed:'), error);
    process.exit(1);
  }
}

async function handleTestStats(cache: any): Promise<void> {
  console.log();
  console.log(chalk.blue.bold('📊 Test Library Statistics'));
  console.log();

  try {
    const stats = await cache.getTestLibraryStats();
    const scenarios = await cache.listTestScenarios();
    
    console.log(chalk.cyan.bold('📈 Overall Statistics:'));
    console.log(`   Total Tests: ${chalk.white.bold(stats.totalTests)}`);
    console.log(`   Average Success Rate: ${chalk.white.bold((stats.avgSuccessRate * 100).toFixed(1))}%`);
    console.log(`   Total Executions: ${chalk.white.bold(stats.totalExecutions)}`);
    console.log();
    
    if (scenarios.length > 0) {
      // Group by tags
      const tagStats: Record<string, number> = {};
      scenarios.forEach((scenario: any) => {
        if (scenario.tags) {
          scenario.tags.forEach((tag: string) => {
            tagStats[tag] = (tagStats[tag] || 0) + 1;
          });
        }
      });

      if (Object.keys(tagStats).length > 0) {
        console.log(chalk.cyan.bold('🏷️ Tests by Tags:'));
        Object.entries(tagStats)
          .sort(([,a], [,b]) => b - a)
          .forEach(([tag, count]) => {
            console.log(`   ${tag}: ${chalk.white.bold(count)}`);
          });
        console.log();
      }

      // Profile stats
      const profileStats: Record<string, number> = {};
      scenarios.forEach((scenario: any) => {
        const profile = scenario.profile || 'default';
        profileStats[profile] = (profileStats[profile] || 0) + 1;
      });

      console.log(chalk.cyan.bold('👤 Tests by Profile:'));
      Object.entries(profileStats)
        .sort(([,a], [,b]) => b - a)
        .forEach(([profile, count]) => {
          console.log(`   ${profile}: ${chalk.white.bold(count)}`);
        });
      console.log();
    }
  } catch (error) {
    console.error(chalk.red('❌ Failed to get statistics:'), error);
    process.exit(1);
  }
}

async function handleTestDelete(cache: any, options: any): Promise<void> {
  console.log();
  console.log(chalk.red.bold('🗑️ Delete Test Scenarios'));
  console.log();

  try {
    // Delete specific test by name
    if (options.name) {
      console.log(`Deleting test scenario: ${chalk.cyan(options.name)}`);
      
      const deleted = await cache.deleteTestScenario(options.name);
      
      if (deleted) {
        console.log(`✅ Test scenario '${chalk.green(options.name)}' deleted successfully`);
      } else {
        console.log(`❌ Test scenario '${chalk.red(options.name)}' not found`);
        process.exit(1);
      }
      return;
    }

    // Delete all tests
    if (options.all) {
      if (!options.force) {
        // Get confirmation
        const readline = await import('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question(chalk.yellow('⚠️ Are you sure you want to delete ALL test scenarios? This cannot be undone. [y/N]: '), (answer) => {
            rl.close();
            resolve(answer.toLowerCase());
          });
        });

        if (answer !== 'y' && answer !== 'yes') {
          console.log(chalk.gray('❌ Operation cancelled'));
          return;
        }
      }

      const result = await cache.deleteAllTestScenarios();
      
      if (result.deleted > 0) {
        console.log(`✅ Deleted ${chalk.green(result.deleted)} test scenarios and ${chalk.green(result.executionsDeleted)} executions`);
      } else {
        console.log(chalk.gray('ℹ️ No test scenarios found to delete'));
      }
      return;
    }

    // Delete by tag
    if (options.tag) {
      console.log(`Deleting test scenarios with tag: ${chalk.cyan(options.tag)}`);
      
      const result = await cache.deleteTestScenariosByTag(options.tag);
      
      if (result.deleted > 0) {
        console.log(`✅ Deleted ${chalk.green(result.deleted)} test scenarios with tag '${options.tag}' and ${chalk.green(result.executionsDeleted)} executions`);
      } else {
        console.log(`❌ No test scenarios found with tag '${chalk.red(options.tag)}'`);
      }
      return;
    }

    // No valid options provided
    console.log(chalk.red('❌ Please specify what to delete:'));
    console.log(`  ${chalk.gray('--name <name>')}`);
    console.log(`  ${chalk.gray('--all [--force]')}`);
    console.log(`  ${chalk.gray('--tag <tag>')}`);
    console.log();
    console.log(`Run ${chalk.cyan('claude-playwright test help')} for more information.`);
    process.exit(1);

  } catch (error) {
    console.error(chalk.red('❌ Failed to delete test scenarios:'), error);
    process.exit(1);
  }
}

function showTestHelp(): void {
  console.log();
  console.log(chalk.blue.bold('🧪 Test Management Help'));
  console.log();
  
  console.log(chalk.cyan.bold('Available Commands:'));
  console.log();
  
  console.log(`  ${chalk.green('save')} ${chalk.gray('--name <name> [options]')}`);
  console.log(`    ${chalk.white('Save current interaction sequence as reusable test')}`);
  console.log(`    ${chalk.gray('Options: --description, --tags, --url, --profile, --file')}`);
  console.log();
  
  console.log(`  ${chalk.green('list')} ${chalk.gray('[filters]')}`);
  console.log(`    ${chalk.white('Show all test scenarios with statistics')}`);
  console.log(`    ${chalk.gray('Options: --profile, --tag, --url')}`);
  console.log();
  
  console.log(`  ${chalk.green('find')} ${chalk.gray('--query <query> [options]')}`);
  console.log(`    ${chalk.white('Find similar tests using AI-powered matching')}`);
  console.log(`    ${chalk.gray('Options: --url, --profile, --limit')}`);
  console.log();
  
  console.log(`  ${chalk.green('run')} ${chalk.gray('--name <name> [options]')}`);
  console.log(`    ${chalk.white('Execute saved test with intelligent adaptation')}`);
  console.log(`    ${chalk.gray('Options: --url, --profile')}`);
  console.log();
  
  console.log(`  ${chalk.green('adapt')} ${chalk.gray('--name <name> [options]')}`);
  console.log(`    ${chalk.white('Adapt existing test to new context')}`);
  console.log(`    ${chalk.gray('Options: --url, --profile, --save-adapted')}`);
  console.log();
  
  console.log(`  ${chalk.green('stats')}`);
  console.log(`    ${chalk.white('Show comprehensive library statistics')}`);
  console.log();
  
  console.log(`  ${chalk.green('delete')} ${chalk.gray('--name <name>')}`);
  console.log(`    ${chalk.white('Delete a specific test scenario')}`);
  console.log();
  
  console.log(`  ${chalk.green('delete')} ${chalk.gray('--all [--force]')}`);
  console.log(`    ${chalk.white('Delete all test scenarios')}`);
  console.log(`    ${chalk.gray('Use --force to skip confirmation')}`);
  console.log();
  
  console.log(`  ${chalk.green('delete')} ${chalk.gray('--tag <tag>')}`);
  console.log(`    ${chalk.white('Delete all tests with specific tag')}`);
  console.log();
  
  console.log(chalk.yellow.bold('Examples:'));
  console.log();
  console.log(`  ${chalk.gray('# Save a login test interactively')}`);
  console.log(`  claude-playwright test save --name "User Login" --tags "auth,login"`);
  console.log();
  console.log(`  ${chalk.gray('# Find tests related to todo management')}`);
  console.log(`  claude-playwright test find --query "todo management"`);
  console.log();
  console.log(`  ${chalk.gray('# Run a test with adaptation')}`);
  console.log(`  claude-playwright test run --name "User Login" --url "https://staging.app.com"`);
  console.log();
  console.log(`  ${chalk.gray('# Adapt test for different environment')}`);
  console.log(`  claude-playwright test adapt --name "User Login" --url "https://prod.app.com" --save-adapted`);
  console.log();
  console.log(`  ${chalk.gray('# Delete a specific test')}`);
  console.log(`  claude-playwright test delete --name "User Login"`);
  console.log();
  console.log(`  ${chalk.gray('# Delete all tests with confirmation')}`);
  console.log(`  claude-playwright test delete --all`);
  console.log();
  console.log(`  ${chalk.gray('# Delete all auth-related tests')}`);
  console.log(`  claude-playwright test delete --tag "auth"`);
  console.log();
}

// Add MCP subcommand
program.addCommand(createMcpCommand());

// Add migration subcommand  
program.addCommand(createMigrationCommand());

// Always run when executed directly (not when imported as module)
program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red('❌ CLI Error:'), error.message);
  process.exit(1);
});

export { program };