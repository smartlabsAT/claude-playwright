import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import chalk from 'chalk';

export async function setupMCPForClaude(projectPath: string): Promise<boolean> {
  // Create local .mcp.json in project directory
  const mcpConfigPath = path.join(projectPath, '.mcp.json');
  
  try {
    // Create MCP configuration for Claude Code with session support
    const mcpConfig = {
      mcpServers: {
        playwright: {
          command: 'npx',
          args: [
            '@playwright/mcp'
          ],
          env: {
            PLAYWRIGHT_AUTO_LOAD_SESSION: 'true',
            PLAYWRIGHT_SESSION_TIMEOUT: '28800000',
            PLAYWRIGHT_SESSION_AUTO_SAVE: 'true',
            PLAYWRIGHT_SESSION_CONFIG: './playwright-sessions/.config.json'
          }
        }
      }
    };
    
    // Write MCP configuration to project
    await fs.writeJSON(mcpConfigPath, mcpConfig, { spaces: 2 });
    
    console.log(chalk.green('✓ MCP configured for Claude Code'));
    console.log(chalk.gray(`📋 Configuration written to: ${mcpConfigPath}`));
    console.log(chalk.yellow('\n📌 Important: When starting Claude Code in this project:'));
    console.log(chalk.yellow('   1. Run: claude'));
    console.log(chalk.yellow('   2. Accept the MCP server when prompted'));
    console.log(chalk.yellow('   3. Check connection with /mcp command'));
    
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Failed to setup MCP:'), error);
    return false;
  }
}

export async function setupBrowserProfiles(projectPath: string): Promise<void> {
  const profilesPath = path.join(projectPath, 'browser-profiles', 'default');
  const authStatesPath = path.join(projectPath, 'auth-states');
  const sessionsPath = path.join(projectPath, 'playwright-sessions');
  
  await fs.ensureDir(profilesPath);
  await fs.ensureDir(authStatesPath);
  await fs.ensureDir(sessionsPath);
  
  // Create session configuration file
  await createSessionConfig(projectPath);
  
  console.log(chalk.green('✓ Browser profiles and sessions configured'));
  console.log(chalk.gray(`📁 Default profile: ${profilesPath}`));
  console.log(chalk.gray(`🔐 Auth states: ${authStatesPath}`));
  console.log(chalk.gray(`💾 Sessions: ${sessionsPath}`));
}

export async function createSessionConfig(projectPath: string): Promise<void> {
  const sessionConfigPath = path.join(projectPath, 'playwright-sessions', '.config.json');
  
  const sessionConfig = {
    defaultSessionTimeout: 28800000, // 8 hours
    autoCleanupExpired: true,
    autoLoadLatest: true,
    maxConcurrentSessions: 5,
    sessionBackupEnabled: true,
    profileIntegration: {
      enabled: true,
      autoSelectProfile: true,
      fallbackProfile: 'default'
    },
    logging: {
      enabled: true,
      level: 'info'
    }
  };
  
  await fs.writeJSON(sessionConfigPath, sessionConfig, { spaces: 2 });
  console.log(chalk.green('✓ Session configuration created'));
}

export async function setupSessionMCPIntegration(projectPath: string): Promise<boolean> {
  try {
    // Create MCP session integration helper script
    const sessionIntegrationPath = path.join(projectPath, 'scripts', 'session-mcp-integration.js');
    
    await fs.ensureDir(path.dirname(sessionIntegrationPath));
    
    const integrationScript = `
/**
 * Session-MCP Integration Script
 * Automatically loads the latest valid session when MCP server starts
 */
const fs = require('fs-extra');
const path = require('path');

// Import the MCP Integration utilities
const { MCPIntegration } = require('../dist/utils/mcp-integration.js');

class SessionMCPIntegration {
  constructor(projectPath = process.cwd()) {
    this.projectPath = projectPath;
    this.sessionsDir = path.join(projectPath, 'playwright-sessions');
    this.profilesDir = path.join(projectPath, 'browser-profiles');
  }

  async findLatestValidSession() {
    try {
      if (!await fs.pathExists(this.sessionsDir)) {
        return null;
      }

      const sessionFiles = await fs.readdir(this.sessionsDir);
      const validSessions = [];

      for (const file of sessionFiles) {
        if (file.endsWith('.json') && !file.startsWith('.')) {
          const sessionPath = path.join(this.sessionsDir, file);
          const session = await fs.readJSON(sessionPath);
          
          // Check if session is valid (not expired)
          if (session.expiresAt && Date.now() <= session.expiresAt) {
            validSessions.push({
              ...session,
              filePath: sessionPath
            });
          }
        }
      }

      // Sort by creation date, newest first
      validSessions.sort((a, b) => b.createdAt - a.createdAt);
      
      return validSessions.length > 0 ? validSessions[0] : null;
    } catch (error) {
      console.error('Error finding latest session:', error);
      return null;
    }
  }

  async autoLoadSession() {
    const latestSession = await this.findLatestValidSession();
    
    if (latestSession) {
      console.log(\`📱 Auto-loading session: \${latestSession.name}\`);
      
      // Set environment variables that MCP server can use
      process.env.PLAYWRIGHT_ACTIVE_SESSION = latestSession.name;
      process.env.PLAYWRIGHT_SESSION_STORAGE_STATE = JSON.stringify(latestSession.storageState);
      
      if (latestSession.browserProfile) {
        process.env.PLAYWRIGHT_ACTIVE_PROFILE = latestSession.browserProfile;
        console.log(\`🎭 Using browser profile: \${latestSession.browserProfile}\`);
      } else {
        // Try to find a suitable profile for this session
        console.log('🔍 No profile specified, using default profile selection');
        process.env.PLAYWRIGHT_AUTO_SELECT_PROFILE = 'true';
      }
      
      // Set additional metadata for MCP server
      if (latestSession.metadata) {
        if (latestSession.metadata.url) {
          process.env.PLAYWRIGHT_LAST_URL = latestSession.metadata.url;
        }
        if (latestSession.metadata.viewport) {
          process.env.PLAYWRIGHT_VIEWPORT = JSON.stringify(latestSession.metadata.viewport);
        }
        if (latestSession.metadata.userAgent) {
          process.env.PLAYWRIGHT_USER_AGENT = latestSession.metadata.userAgent;
        }
      }
      
      // Log session expiry info
      const expiresAt = new Date(latestSession.expiresAt);
      const hoursRemaining = (latestSession.expiresAt - Date.now()) / (1000 * 60 * 60);
      console.log(\`⏰ Session expires: \${expiresAt.toLocaleString()} (\${hoursRemaining.toFixed(1)}h remaining)\`);
      
      return latestSession;
    } else {
      console.log('🔍 No valid sessions found for auto-loading');
      console.log('💡 Start browsing to create a new session automatically');
      return null;
    }
  }

  async initializeForMCP() {
    try {
      // Use the new MCPIntegration class for better coordination
      const mcpIntegration = new MCPIntegration(this.projectPath);
      const result = await mcpIntegration.initializeMCPEnvironment();
      
      console.log('📊 MCP Integration Status:');
      console.log(\`   Sessions: \${result.sessionData.hasSession ? '✓' : '✗'} \${result.sessionData.sessionName || 'none'}\`);
      console.log(\`   Profile: \${result.profileData ? '✓' : '✗'} \${result.profileData?.name || 'none'}\`);
      
      // Perform cleanup
      await mcpIntegration.cleanupAndOptimize();
      
      return result.sessionData.hasSession ? result.sessionData : null;
    } catch (error) {
      console.error('Failed to initialize MCP integration:', error);
      
      // Fallback to basic session loading
      return await this.autoLoadSession();
    }
  }
}

// Initialize when script is run directly
if (require.main === module) {
  const integration = new SessionMCPIntegration();
  integration.initializeForMCP().then(session => {
    if (session) {
      console.log('✅ Session integration initialized successfully');
    } else {
      console.log('ℹ️  No session loaded - starting with clean state');
    }
  }).catch(error => {
    console.error('❌ Session integration failed:', error);
  });
}

module.exports = SessionMCPIntegration;
`;

    await fs.writeFile(sessionIntegrationPath, integrationScript.trim());
    
    // Make the script executable
    await fs.chmod(sessionIntegrationPath, '755');
    
    console.log(chalk.green('✓ Session-MCP integration script created'));
    console.log(chalk.gray(`📄 Integration script: ${sessionIntegrationPath}`));
    
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Failed to setup session MCP integration:'), error);
    return false;
  }
}

export async function checkClaudeInstallation(): Promise<boolean> {
  // Check if claude command is available
  try {
    const { execSync } = require('child_process');
    execSync('which claude', { stdio: 'ignore' });
    console.log(chalk.green('✓ Claude Code CLI detected'));
    return true;
  } catch (error) {
    console.log(chalk.yellow('⚠️ Claude Code CLI not found in PATH'));
    console.log(chalk.gray('  Install with: npm install -g @anthropic-ai/claude-code'));
    return false;
  }
}