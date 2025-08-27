import { SessionManager } from '../core/session-manager';
import { BrowserProfileManager } from '../core/browser-profile';
import chalk from 'chalk';

/**
 * MCP Integration Utilities
 * Handles coordination between Sessions and Browser Profiles for MCP server
 */
export class MCPIntegration {
  private sessionManager: SessionManager;
  private profileManager: BrowserProfileManager;
  
  constructor(workingDir?: string) {
    this.sessionManager = new SessionManager(workingDir);
    this.profileManager = new BrowserProfileManager(workingDir);
  }
  
  /**
   * Initialize MCP with best available session and profile combination
   */
  async initializeMCPEnvironment(): Promise<{
    sessionData: any;
    profileData: any;
    environmentVars: Record<string, string>;
  }> {
    const sessionData = await this.sessionManager.getMCPSessionData();
    let profileData = null;
    const environmentVars: Record<string, string> = {};
    
    // Set session environment variables
    if (sessionData.hasSession) {
      environmentVars.PLAYWRIGHT_ACTIVE_SESSION = sessionData.sessionName;
      environmentVars.PLAYWRIGHT_SESSION_STORAGE_STATE = JSON.stringify(sessionData.storageState);
      
      if (sessionData.metadata?.url) {
        environmentVars.PLAYWRIGHT_LAST_URL = sessionData.metadata.url;
      }
      
      if (sessionData.metadata?.viewport) {
        environmentVars.PLAYWRIGHT_VIEWPORT = JSON.stringify(sessionData.metadata.viewport);
      }
      
      if (sessionData.metadata?.userAgent) {
        environmentVars.PLAYWRIGHT_USER_AGENT = sessionData.metadata.userAgent;
      }
      
      console.log(chalk.green(`✓ Session loaded: ${sessionData.sessionName}`));
      
      // Load associated profile
      if (sessionData.browserProfile) {
        profileData = await this.profileManager.getProfileForSession(sessionData.browserProfile);
        if (profileData) {
          environmentVars.PLAYWRIGHT_ACTIVE_PROFILE = sessionData.browserProfile;
          console.log(chalk.green(`✓ Profile loaded: ${sessionData.browserProfile}`));
        }
      }
    }
    
    // If no profile was loaded with session, try to find a good default
    if (!profileData) {
      const defaultProfileName = await this.profileManager.findBestProfileForAutoLoad();
      if (defaultProfileName) {
        profileData = await this.profileManager.getProfileForSession(defaultProfileName);
        if (profileData) {
          environmentVars.PLAYWRIGHT_ACTIVE_PROFILE = defaultProfileName;
          environmentVars.PLAYWRIGHT_AUTO_SELECTED_PROFILE = 'true';
          console.log(chalk.yellow(`⚡ Auto-selected profile: ${defaultProfileName}`));
        }
      }
    }
    
    // Set profile-specific environment variables
    if (profileData) {
      if (profileData.settings.userAgent && !environmentVars.PLAYWRIGHT_USER_AGENT) {
        environmentVars.PLAYWRIGHT_USER_AGENT = profileData.settings.userAgent;
      }
      
      if (profileData.settings.viewport && !environmentVars.PLAYWRIGHT_VIEWPORT) {
        environmentVars.PLAYWRIGHT_VIEWPORT = JSON.stringify(profileData.settings.viewport);
      }
      
      if (profileData.settings.locale) {
        environmentVars.PLAYWRIGHT_LOCALE = profileData.settings.locale;
      }
      
      if (profileData.settings.timezone) {
        environmentVars.PLAYWRIGHT_TIMEZONE = profileData.settings.timezone;
      }
    }
    
    // Set all environment variables
    Object.entries(environmentVars).forEach(([key, value]) => {
      process.env[key] = value;
    });
    
    return {
      sessionData,
      profileData,
      environmentVars
    };
  }
  
  /**
   * Associate current session with a profile
   */
  async associateSessionWithProfile(sessionName: string, profileName: string): Promise<boolean> {
    return await this.profileManager.associateSessionWithProfile(profileName, sessionName);
  }
  
  /**
   * Save session with profile association
   */
  async saveSessionWithProfile(
    sessionName: string, 
    storageState: any, 
    profileName?: string, 
    metadata?: any
  ): Promise<boolean> {
    try {
      // Save session
      await this.sessionManager.saveSession(sessionName, storageState, {
        browserProfile: profileName,
        metadata
      });
      
      // Associate with profile if specified
      if (profileName) {
        await this.associateSessionWithProfile(sessionName, profileName);
      }
      
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to save session with profile:'), (error as Error).message);
      return false;
    }
  }
  
  /**
   * Get recommended profile for a session
   */
  async getRecommendedProfile(sessionName: string): Promise<string | null> {
    try {
      const sessionData = await this.sessionManager.getSessionData(sessionName);
      
      if (sessionData.browserProfile) {
        return sessionData.browserProfile;
      }
      
      // Analyze session metadata to recommend a profile
      if (sessionData.metadata) {
        const { viewport, userAgent } = sessionData.metadata;
        
        // Mobile detection
        if (viewport && viewport.width <= 768) {
          return 'mobile';
        }
        
        // Admin detection (basic heuristic)
        if (sessionData.metadata.url?.includes('admin') || sessionData.metadata.url?.includes('dashboard')) {
          return 'admin';
        }
        
        // Default to user profile
        return 'user';
      }
      
      return await this.profileManager.findBestProfileForAutoLoad();
    } catch (error) {
      console.warn(chalk.yellow('Could not determine recommended profile:'), (error as Error).message);
      return null;
    }
  }
  
  /**
   * Clean up expired sessions and optimize profiles
   */
  async cleanupAndOptimize(): Promise<void> {
    try {
      // Clean up expired sessions
      const expiredCount = await this.sessionManager.clearExpiredSessions();
      if (expiredCount > 0) {
        console.log(chalk.green(`✓ Cleaned up ${expiredCount} expired sessions`));
      }
      
      // Update profile associations to remove references to deleted sessions
      const profiles = await this.profileManager.listProfiles();
      
      for (const profile of profiles) {
        const associatedSessions = await this.profileManager.getAssociatedSessions(profile.name);
        const validSessions = [];
        
        for (const sessionName of associatedSessions) {
          if (await this.sessionManager.isSessionValid(sessionName)) {
            validSessions.push(sessionName);
          }
        }
        
        if (validSessions.length !== associatedSessions.length) {
          // Update profile to remove invalid session references
          const loadedProfile = await this.profileManager.loadProfile(profile.name);
          await this.profileManager.updateProfile(profile.name, {
            ...loadedProfile,
            metadata: {
              ...loadedProfile.metadata,
              associatedSessions: validSessions
            } as any
          });
        }
      }
      
      console.log(chalk.green('✓ Profile optimization completed'));
    } catch (error) {
      console.warn(chalk.yellow('Cleanup and optimization warning:'), (error as Error).message);
    }
  }
  
  /**
   * Get status report for MCP integration
   */
  async getStatusReport(): Promise<{
    activeSessions: number;
    expiredSessions: number;
    availableProfiles: number;
    currentSession?: string;
    currentProfile?: string;
    recommendations: string[];
  }> {
    const sessions = await this.sessionManager.listSessions();
    const profiles = await this.profileManager.listProfiles();
    
    const activeSessions = sessions.filter(s => !s.expired).length;
    const expiredSessions = sessions.filter(s => s.expired).length;
    
    const currentSession = process.env.PLAYWRIGHT_ACTIVE_SESSION;
    const currentProfile = process.env.PLAYWRIGHT_ACTIVE_PROFILE;
    
    const recommendations: string[] = [];
    
    if (expiredSessions > 0) {
      recommendations.push(`Clean up ${expiredSessions} expired sessions`);
    }
    
    if (activeSessions === 0) {
      recommendations.push('No active sessions - consider creating a session after browsing');
    }
    
    if (profiles.length === 0) {
      recommendations.push('No browser profiles found - run profile setup command');
    }
    
    if (currentSession && !currentProfile) {
      recommendations.push('Session has no associated profile - consider associating one');
    }
    
    return {
      activeSessions,
      expiredSessions,
      availableProfiles: profiles.length,
      currentSession,
      currentProfile,
      recommendations
    };
  }
}