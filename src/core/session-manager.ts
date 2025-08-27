import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export interface SessionData {
  name: string;
  createdAt: number;
  expiresAt: number;
  storageState: any;
  browserProfile?: string;
  metadata?: {
    url?: string;
    userAgent?: string;
    viewport?: { width: number; height: number };
  };
}

export interface SessionListItem {
  name: string;
  created: string;
  expires: string;
  expired: boolean;
  browserProfile?: string;
}

export class SessionManager {
  private sessionsDir: string = './playwright-sessions';
  private profilesDir: string = './browser-profiles';
  private configPath: string;
  
  constructor(workingDir?: string) {
    if (workingDir) {
      this.sessionsDir = path.join(workingDir, 'playwright-sessions');
      this.profilesDir = path.join(workingDir, 'browser-profiles');
    }
    this.configPath = path.join(this.sessionsDir, '.config.json');
  }
  
  /**
   * Get session configuration
   */
  async getSessionConfig(): Promise<any> {
    try {
      if (await fs.pathExists(this.configPath)) {
        return await fs.readJSON(this.configPath);
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not read session config'));
    }
    
    // Return default config
    return {
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
  }
  
  /**
   * Save a browser session with 8-hour expiry
   */
  async saveSession(name: string, storageState: any, options?: {
    browserProfile?: string;
    metadata?: SessionData['metadata'];
  }): Promise<string> {
    await fs.ensureDir(this.sessionsDir);
    const sessionPath = path.join(this.sessionsDir, `${name}.json`);
    
    const sessionData: SessionData = {
      name,
      createdAt: Date.now(),
      storageState,
      expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8 hours
      browserProfile: options?.browserProfile,
      metadata: options?.metadata
    };
    
    await fs.writeJSON(sessionPath, sessionData, { spaces: 2 });
    console.log(chalk.green('✓') + ` Session saved: ${name}`);
    
    return sessionPath;
  }
  
  /**
   * Load a stored session and check expiry
   */
  async loadSession(name: string): Promise<any> {
    const sessionPath = path.join(this.sessionsDir, `${name}.json`);
    
    if (!await fs.pathExists(sessionPath)) {
      throw new Error(`Session not found: ${name}`);
    }
    
    const session: SessionData = await fs.readJSON(sessionPath);
    
    // Check if expired
    if (Date.now() > session.expiresAt) {
      throw new Error(`Session expired: ${name}. Session was valid until ${new Date(session.expiresAt).toLocaleString()}`);
    }
    
    return session.storageState;
  }
  
  /**
   * Get full session data including metadata
   */
  async getSessionData(name: string): Promise<SessionData> {
    const sessionPath = path.join(this.sessionsDir, `${name}.json`);
    
    if (!await fs.pathExists(sessionPath)) {
      throw new Error(`Session not found: ${name}`);
    }
    
    const session: SessionData = await fs.readJSON(sessionPath);
    
    // Check if expired
    if (Date.now() > session.expiresAt) {
      throw new Error(`Session expired: ${name}. Session was valid until ${new Date(session.expiresAt).toLocaleString()}`);
    }
    
    return session;
  }
  
  /**
   * List all sessions with their status
   */
  async listSessions(): Promise<SessionListItem[]> {
    await fs.ensureDir(this.sessionsDir);
    const files = await fs.readdir(this.sessionsDir);
    
    const sessions: SessionListItem[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const session: SessionData = await fs.readJSON(path.join(this.sessionsDir, file));
          
          // Add null checks and default values
          const safeName = session.name || 'unknown';
          const safeCreatedAt = session.createdAt || Date.now();
          const safeExpiresAt = session.expiresAt || Date.now();
          
          sessions.push({
            name: safeName,
            created: new Date(safeCreatedAt).toLocaleString(),
            expires: new Date(safeExpiresAt).toLocaleString(),
            expired: Date.now() > safeExpiresAt,
            browserProfile: session.browserProfile
          });
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not read session file ${file}`));
        }
      }
    }
    
    // Sort by creation date (newest first)
    return sessions.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }
  
  /**
   * Clear expired sessions
   */
  async clearExpiredSessions(): Promise<number> {
    await fs.ensureDir(this.sessionsDir);
    const files = await fs.readdir(this.sessionsDir);
    
    let clearedCount = 0;
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const sessionPath = path.join(this.sessionsDir, file);
          const session: SessionData = await fs.readJSON(sessionPath);
          
          if (Date.now() > session.expiresAt) {
            await fs.remove(sessionPath);
            clearedCount++;
            console.log(chalk.gray(`Removed expired session: ${session.name}`));
          }
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not process session file ${file}`));
        }
      }
    }
    
    return clearedCount;
  }
  
  /**
   * Delete a specific session
   */
  async deleteSession(name: string): Promise<boolean> {
    const sessionPath = path.join(this.sessionsDir, `${name}.json`);
    
    if (!await fs.pathExists(sessionPath)) {
      return false;
    }
    
    await fs.remove(sessionPath);
    console.log(chalk.green('✓') + ` Session deleted: ${name}`);
    return true;
  }
  
  /**
   * Check if session exists and is valid
   */
  async isSessionValid(name: string): Promise<boolean> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${name}.json`);
      
      if (!await fs.pathExists(sessionPath)) {
        return false;
      }
      
      const session: SessionData = await fs.readJSON(sessionPath);
      return Date.now() <= session.expiresAt;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Update session expiry (extend for another 8 hours)
   */
  async extendSession(name: string): Promise<boolean> {
    try {
      const sessionPath = path.join(this.sessionsDir, `${name}.json`);
      
      if (!await fs.pathExists(sessionPath)) {
        throw new Error(`Session not found: ${name}`);
      }
      
      const session: SessionData = await fs.readJSON(sessionPath);
      session.expiresAt = Date.now() + (8 * 60 * 60 * 1000); // Extend for 8 more hours
      
      await fs.writeJSON(sessionPath, session, { spaces: 2 });
      console.log(chalk.green('✓') + ` Session extended: ${name} (expires: ${new Date(session.expiresAt).toLocaleString()})`);
      
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to extend session:'), (error as Error).message);
      return false;
    }
  }

  /**
   * Auto-extend session if it expires in less than 2 hours
   */
  async autoExtendSession(name: string): Promise<boolean> {
    try {
      const sessionData = await this.getSessionData(name);
      const expiresAt = sessionData.expiresAt || 0;
      const now = Date.now();
      const hoursRemaining = (expiresAt - now) / (1000 * 60 * 60);
      
      // Auto-extend if less than 2 hours remain and more than 0 hours
      if (hoursRemaining < 2 && hoursRemaining > 0) {
        console.log(chalk.yellow(`⏰ Session "${name}" expires in ${hoursRemaining.toFixed(1)} hours, auto-extending...`));
        return await this.extendSession(name);
      }
      
      // Session is still valid for more than 2 hours
      if (hoursRemaining >= 2) {
        console.log(chalk.gray(`✓ Session "${name}" is valid for ${hoursRemaining.toFixed(1)} more hours`));
        return true;
      }
      
      // Session is already expired
      if (hoursRemaining <= 0) {
        console.log(chalk.red(`❌ Session "${name}" has already expired`));
        return false;
      }
      
      return true;
      
    } catch (error) {
      // Session might not exist or be invalid, that's ok for auto-extend
      console.log(chalk.gray(`ℹ️ Could not auto-extend session "${name}": ${(error as Error).message}`));
      return false;
    }
  }

  /**
   * Check session health and provide recommendations
   */
  async checkSessionHealth(name: string): Promise<{
    isValid: boolean;
    hoursRemaining: number;
    recommendation: string;
    needsExtension: boolean;
  }> {
    try {
      const sessionData = await this.getSessionData(name);
      const expiresAt = sessionData.expiresAt || 0;
      const now = Date.now();
      const hoursRemaining = (expiresAt - now) / (1000 * 60 * 60);
      
      let recommendation = '';
      let needsExtension = false;
      
      if (hoursRemaining <= 0) {
        recommendation = 'Session has expired. Create a new session.';
      } else if (hoursRemaining < 1) {
        recommendation = 'Session expires very soon. Extend or recreate immediately.';
        needsExtension = true;
      } else if (hoursRemaining < 2) {
        recommendation = 'Session will be auto-extended on next use.';
        needsExtension = true;
      } else if (hoursRemaining < 4) {
        recommendation = 'Session is valid but will need extension soon.';
      } else {
        recommendation = 'Session is healthy and valid.';
      }
      
      return {
        isValid: hoursRemaining > 0,
        hoursRemaining,
        recommendation,
        needsExtension
      };
      
    } catch (error) {
      return {
        isValid: false,
        hoursRemaining: 0,
        recommendation: `Session not found or invalid: ${(error as Error).message}`,
        needsExtension: false
      };
    }
  }

  /**
   * Batch check health of all sessions
   */
  async checkAllSessionsHealth(): Promise<Array<{
    name: string;
    isValid: boolean;
    hoursRemaining: number;
    recommendation: string;
    needsExtension: boolean;
  }>> {
    const sessions = await this.listSessions();
    const healthChecks = [];
    
    for (const session of sessions) {
      const health = await this.checkSessionHealth(session.name);
      healthChecks.push({
        name: session.name,
        ...health
      });
    }
    
    return healthChecks;
  }
  
  /**
   * Find the latest valid session for auto-loading (MCP integration)
   */
  async findLatestValidSession(): Promise<SessionData | null> {
    try {
      const sessions = await this.listSessions();
      const validSessions = sessions.filter(s => !s.expired);
      
      if (validSessions.length === 0) {
        return null;
      }
      
      // Get the most recent valid session
      const latestSessionName = validSessions[0].name;
      return await this.getSessionData(latestSessionName);
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not find latest valid session'), (error as Error).message);
      return null;
    }
  }
  
  /**
   * Get MCP-compatible session data with environment variables
   */
  async getMCPSessionData(sessionName?: string): Promise<any> {
    try {
      let session: SessionData | null = null;
      
      if (sessionName) {
        session = await this.getSessionData(sessionName);
      } else {
        session = await this.findLatestValidSession();
      }
      
      if (!session) {
        return {
          hasSession: false,
          sessionName: null,
          storageState: null,
          browserProfile: null,
          metadata: null
        };
      }
      
      return {
        hasSession: true,
        sessionName: session.name,
        storageState: session.storageState,
        browserProfile: session.browserProfile,
        metadata: session.metadata,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt
      };
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not get MCP session data'), (error as Error).message);
      return {
        hasSession: false,
        sessionName: null,
        storageState: null,
        browserProfile: null,
        metadata: null
      };
    }
  }
  
  /**
   * Auto-save session during MCP usage
   */
  async autoSaveSession(storageState: any, metadata?: any): Promise<string | null> {
    try {
      const config = await this.getSessionConfig();
      
      if (!config.sessionBackupEnabled) {
        return null;
      }
      
      const sessionName = `auto-backup-${Date.now()}`;
      await this.saveSession(sessionName, storageState, { metadata });
      
      // Clean up old auto-backup sessions to prevent clutter
      await this.cleanupOldAutoBackups(config.maxConcurrentSessions || 5);
      
      return sessionName;
    } catch (error) {
      console.warn(chalk.yellow('Warning: Auto-save failed'), (error as Error).message);
      return null;
    }
  }
  
  /**
   * Clean up old auto-backup sessions
   */
  private async cleanupOldAutoBackups(maxBackups: number): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionsDir);
      const autoBackupSessions: Array<{name: string, createdAt: number, path: string}> = [];
      
      for (const file of files) {
        if (file.startsWith('auto-backup-') && file.endsWith('.json')) {
          const sessionPath = path.join(this.sessionsDir, file);
          const session = await fs.readJSON(sessionPath);
          autoBackupSessions.push({
            name: session.name,
            createdAt: session.createdAt,
            path: sessionPath
          });
        }
      }
      
      // Sort by creation date (newest first) and remove excess
      autoBackupSessions.sort((a, b) => b.createdAt - a.createdAt);
      
      if (autoBackupSessions.length > maxBackups) {
        const toRemove = autoBackupSessions.slice(maxBackups);
        for (const session of toRemove) {
          await fs.remove(session.path);
          console.log(chalk.gray(`Cleaned up old auto-backup: ${session.name}`));
        }
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not cleanup old auto-backups'), (error as Error).message);
    }
  }
}