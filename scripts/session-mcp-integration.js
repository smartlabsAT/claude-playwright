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
      console.log(`📱 Auto-loading session: ${latestSession.name}`);
      
      // Set environment variables that MCP server can use
      process.env.PLAYWRIGHT_ACTIVE_SESSION = latestSession.name;
      process.env.PLAYWRIGHT_SESSION_STORAGE_STATE = JSON.stringify(latestSession.storageState);
      
      if (latestSession.browserProfile) {
        process.env.PLAYWRIGHT_ACTIVE_PROFILE = latestSession.browserProfile;
        console.log(`🎭 Using browser profile: ${latestSession.browserProfile}`);
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
      console.log(`⏰ Session expires: ${expiresAt.toLocaleString()} (${hoursRemaining.toFixed(1)}h remaining)`);
      
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
      console.log(`   Sessions: ${result.sessionData.hasSession ? '✓' : '✗'} ${result.sessionData.sessionName || 'none'}`);
      console.log(`   Profile: ${result.profileData ? '✓' : '✗'} ${result.profileData?.name || 'none'}`);
      
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