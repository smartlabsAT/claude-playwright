import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export interface BrowserProfile {
  name: string;
  description: string;
  role: string;
  createdAt: number;
  lastUsed: number;
  settings: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    locale?: string;
    timezone?: string;
    permissions?: string[];
    cookies?: any[];
    localStorage?: Record<string, string>;
    sessionStorage?: Record<string, string>;
    hasTouch?: boolean;
    isMobile?: boolean;
    deviceScaleFactor?: number;
  };
  authState?: {
    storageState?: any;
    authFile?: string;
  };
  metadata?: {
    tags?: string[];
    environment?: 'dev' | 'staging' | 'prod';
    baseUrl?: string;
    associatedSessions?: string[];
  };
}

export interface ProfileSummary {
  name: string;
  role: string;
  lastUsed: string;
  environment?: string;
  description: string;
  metadata?: {
    tags?: string[];
    environment?: 'dev' | 'staging' | 'prod';
    baseUrl?: string;
    associatedSessions?: string[];
  };
  configuration?: {
    viewport?: { width: number; height: number };
    userAgent?: string;
    hasTouch?: boolean;
    isMobile?: boolean;
    deviceScaleFactor?: number;
    locale?: string;
    timezone?: string;
  };
}

/**
 * Browser Profile Manager for managing multiple browser profiles with different user roles
 */
export class BrowserProfileManager {
  private profilesDir: string = './browser-profiles';
  private authStatesDir: string = './playwright-auth';
  
  constructor(workingDir?: string) {
    if (workingDir) {
      this.profilesDir = path.join(workingDir, 'browser-profiles');
      this.authStatesDir = path.join(workingDir, 'playwright-auth');
    }
  }
  
  /**
   * Create a new browser profile for a specific role
   */
  async createProfile(profileData: {
    name: string;
    role: string;
    description?: string;
    settings?: BrowserProfile['settings'];
    metadata?: BrowserProfile['metadata'];
    silent?: boolean;
  }): Promise<string> {
    await fs.ensureDir(this.profilesDir);
    const profilePath = path.join(this.profilesDir, `${profileData.name}.json`);
    
    // Check if profile already exists
    if (await fs.pathExists(profilePath)) {
      throw new Error(`Profile already exists: ${profileData.name}`);
    }
    
    const profile: BrowserProfile = {
      name: profileData.name,
      description: profileData.description || `Browser profile for ${profileData.role}`,
      role: profileData.role,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      settings: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        locale: 'en-US',
        timezone: 'America/New_York',
        permissions: [],
        cookies: [],
        localStorage: {},
        sessionStorage: {},
        ...profileData.settings
      },
      metadata: {
        tags: [],
        environment: 'dev',
        ...profileData.metadata
      }
    };
    
    await fs.writeJSON(profilePath, profile, { spaces: 2 });
    
    // Create profile-specific directories
    const profileDataDir = path.join(this.profilesDir, profileData.name);
    await fs.ensureDir(profileDataDir);
    await fs.ensureDir(path.join(profileDataDir, 'downloads'));
    await fs.ensureDir(path.join(profileDataDir, 'cache'));
    
    if (!profileData.silent) {
      console.log(chalk.green('✓') + ` Browser profile created: ${profileData.name}`);
    }
    
    return profilePath;
  }
  
  /**
   * Load a browser profile
   */
  async loadProfile(profileName: string): Promise<BrowserProfile> {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);
    
    if (!await fs.pathExists(profilePath)) {
      throw new Error(`Profile not found: ${profileName}`);
    }
    
    const profile: BrowserProfile = await fs.readJSON(profilePath);
    
    // Update last used timestamp
    profile.lastUsed = Date.now();
    await fs.writeJSON(profilePath, profile, { spaces: 2 });
    
    return profile;
  }
  
  /**
   * Update an existing profile
   */
  async updateProfile(profileName: string, updates: Partial<BrowserProfile>): Promise<boolean> {
    try {
      const profile = await this.loadProfile(profileName);
      
      // Merge updates
      const updatedProfile: BrowserProfile = {
        ...profile,
        ...updates,
        settings: { ...profile.settings, ...updates.settings },
        metadata: { ...profile.metadata, ...updates.metadata },
        lastUsed: Date.now()
      };
      
      const profilePath = path.join(this.profilesDir, `${profileName}.json`);
      await fs.writeJSON(profilePath, updatedProfile, { spaces: 2 });
      
      console.log(chalk.green('✓') + ` Profile updated: ${profileName}`);
      return true;
    } catch (error) {
      console.error(chalk.red('Failed to update profile:'), (error as Error).message);
      return false;
    }
  }
  
  /**
   * List all browser profiles
   */
  async listProfiles(): Promise<ProfileSummary[]> {
    await fs.ensureDir(this.profilesDir);
    const files = await fs.readdir(this.profilesDir);
    
    const profiles: ProfileSummary[] = [];
    
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const profile: BrowserProfile = await fs.readJSON(path.join(this.profilesDir, file));
          profiles.push({
            name: profile.name,
            role: profile.role,
            lastUsed: new Date(profile.lastUsed).toLocaleString(),
            environment: profile.metadata?.environment,
            description: profile.description,
            metadata: profile.metadata,
            configuration: {
              viewport: profile.settings?.viewport,
              userAgent: profile.settings?.userAgent,
              hasTouch: profile.settings?.hasTouch || false,
              isMobile: profile.settings?.isMobile || false,
              deviceScaleFactor: profile.settings?.deviceScaleFactor || 1,
              locale: profile.settings?.locale,
              timezone: profile.settings?.timezone
            }
          });
        } catch (error) {
          console.warn(chalk.yellow(`Warning: Could not read profile file ${file}`));
        }
      }
    }
    
    // Sort by last used (most recent first)
    return profiles.sort((a, b) => new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime());
  }
  
  /**
   * Delete a browser profile
   */
  async deleteProfile(profileName: string, silent: boolean = false): Promise<boolean> {
    const profilePath = path.join(this.profilesDir, `${profileName}.json`);
    const profileDataDir = path.join(this.profilesDir, profileName);
    
    if (!await fs.pathExists(profilePath)) {
      return false;
    }
    
    // Remove profile file
    await fs.remove(profilePath);
    
    // Remove profile data directory if it exists
    if (await fs.pathExists(profileDataDir)) {
      await fs.remove(profileDataDir);
    }
    
    // Remove associated auth state if it exists
    const authStatePath = path.join(this.authStatesDir, `${profileName}-auth.json`);
    if (await fs.pathExists(authStatePath)) {
      await fs.remove(authStatePath);
    }
    
    if (!silent) {
      console.log(chalk.green('✓') + ` Profile deleted: ${profileName}`);
    }
    return true;
  }
  
  /**
   * Create predefined profiles for common roles
   */
  async setupDefaultProfiles(): Promise<void> {
    const defaultProfiles = [
      {
        name: 'admin',
        role: 'administrator',
        description: 'Administrator user with full permissions',
        settings: {
          permissions: ['geolocation', 'camera', 'microphone', 'notifications'],
          viewport: { width: 1920, height: 1080 }
        },
        metadata: {
          tags: ['admin', 'elevated'],
          environment: 'dev' as const
        }
      },
      {
        name: 'user',
        role: 'regular_user',
        description: 'Standard user with basic permissions',
        settings: {
          permissions: ['geolocation'],
          viewport: { width: 1366, height: 768 }
        },
        metadata: {
          tags: ['user', 'standard'],
          environment: 'dev' as const
        }
      },
      {
        name: 'guest',
        role: 'guest',
        description: 'Guest user with minimal permissions',
        settings: {
          permissions: [],
          viewport: { width: 1280, height: 720 }
        },
        metadata: {
          tags: ['guest', 'anonymous'],
          environment: 'dev' as const
        }
      },
      {
        name: 'mobile',
        role: 'mobile_user',
        description: 'Mobile user simulation',
        settings: {
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
          viewport: { width: 375, height: 667 },
          permissions: ['geolocation']
        },
        metadata: {
          tags: ['mobile', 'ios'],
          environment: 'dev' as const
        }
      }
    ];
    
    for (const profileData of defaultProfiles) {
      try {
        await this.createProfile(profileData);
      } catch (error) {
        if ((error as Error).message.includes('already exists')) {
          console.log(chalk.yellow(`⚠ Profile '${profileData.name}' already exists, skipping`));
        } else {
          console.error(chalk.red(`Failed to create profile '${profileData.name}':`, (error as Error).message));
        }
      }
    }
    
    console.log(chalk.green('✓') + ' Default profiles setup completed');
  }
  
  /**
   * Get profile configuration for MCP integration
   */
  async getProfileForSession(browserProfile?: string): Promise<BrowserProfile | null> {
    try {
      if (!browserProfile) {
        // Try to find a default profile
        const profiles = await this.listProfiles();
        const defaultProfile = profiles.find(p => p.name === 'default' || p.name === 'user');
        
        if (defaultProfile) {
          return await this.loadProfile(defaultProfile.name);
        }
        
        return null;
      }
      
      return await this.loadProfile(browserProfile);
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load profile '${browserProfile}':`, (error as Error).message));
      return null;
    }
  }
  
  /**
   * Associate a session with a browser profile
   */
  async associateSessionWithProfile(profileName: string, sessionName: string): Promise<boolean> {
    try {
      const profile = await this.loadProfile(profileName);
      
      // Update profile metadata to track associated sessions
      if (!profile.metadata) {
        profile.metadata = {};
      }
      if (!profile.metadata.associatedSessions) {
        (profile.metadata as any).associatedSessions = [];
      }
      
      const sessions = ((profile.metadata as any).associatedSessions as string[]) || [];
      if (!sessions.includes(sessionName)) {
        sessions.push(sessionName);
        
        // Keep only the last 10 associated sessions
        if (sessions.length > 10) {
          sessions.splice(0, sessions.length - 10);
        }
        
        // Update the metadata
        (profile.metadata as any).associatedSessions = sessions;
      }
      
      return await this.updateProfile(profileName, profile);
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not associate session '${sessionName}' with profile '${profileName}':`, (error as Error).message));
      return false;
    }
  }
  
  /**
   * Get sessions associated with a profile
   */
  async getAssociatedSessions(profileName: string): Promise<string[]> {
    try {
      const profile = await this.loadProfile(profileName);
      return ((profile.metadata as any)?.associatedSessions as string[]) || [];
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not get associated sessions for profile '${profileName}':`, (error as Error).message));
      return [];
    }
  }
  
  /**
   * Find the best profile for auto-loading with a session
   */
  async findBestProfileForAutoLoad(): Promise<string | null> {
    try {
      const profiles = await this.listProfiles();
      
      if (profiles.length === 0) {
        return null;
      }
      
      // Prioritize profiles by usage and type
      const prioritizedProfiles = profiles.sort((a, b) => {
        // First, prioritize by role (user > admin > guest > mobile)
        const roleOrder = { user: 4, admin: 3, guest: 2, mobile: 1 };
        const aRoleScore = (roleOrder as any)[a.role] || 0;
        const bRoleScore = (roleOrder as any)[b.role] || 0;
        
        if (aRoleScore !== bRoleScore) {
          return bRoleScore - aRoleScore;
        }
        
        // Then by last used time (more recent first)
        return new Date(b.lastUsed).getTime() - new Date(a.lastUsed).getTime();
      });
      
      return prioritizedProfiles[0].name;
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not find best profile for auto-load:', (error as Error).message));
      return null;
    }
  }
}