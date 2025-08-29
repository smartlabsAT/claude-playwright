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
import { createMcpCommand } from '../commands/mcp';

const program = new Command();

// Dynamically read version from package.json
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = fs.readJsonSync(packageJsonPath);
const version = packageJson.version;

program
  .name('claude-playwright')
  .description('Seamless integration between Claude Code and Playwright MCP')
  .version(version);

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

// Cache Management Commands
program
  .command('cache <action>')
  .description('Manage browser automation cache system')
  .option('--force', 'Force operation without confirmation (for clear action)')
  .action(async (action, options) => {
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
          
        default:
          console.error(chalk.red(`❌ Unknown action: ${action}`));
          console.log('Available actions: info, clear, health, debug');
          console.log('');
          console.log('Examples:');
          console.log('  claude-playwright cache info         # Show cache statistics');
          console.log('  claude-playwright cache clear        # Clear all cached data');
          console.log('  claude-playwright cache health       # Check cache system health');
          console.log('  claude-playwright cache debug        # Show debug information');
          process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red('❌ Cache command failed:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Add MCP subcommand
program.addCommand(createMcpCommand());

// Always run when executed directly (not when imported as module)
program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red('❌ CLI Error:'), error.message);
  process.exit(1);
});

export { program };