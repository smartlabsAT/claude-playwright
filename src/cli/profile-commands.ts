import { BrowserProfileManager } from '../core/browser-profile';
import chalk from 'chalk';
import {
  ProfileAction,
  ProfileCommandOptions,
  ProfileCreateOptions as TypedProfileCreateOptions,
  ProfileListOptions,
  CommandResult,
  CommandContext,
  ValidationResult,
  BrowserProfileSettings,
  ProfileMetadata
} from '../types/cli-types';

export interface ProfileCreateOptions extends TypedProfileCreateOptions {
  viewport?: string;
  userAgent?: string;
  deviceType?: 'desktop' | 'mobile' | 'tablet';
  description?: string;
}

export interface ViewportSize {
  width: number;
  height: number;
}

/**
 * Create a new browser profile
 */
export async function createProfile(name: string, options: ProfileCreateOptions & {silent?: boolean}): Promise<boolean> {
  try {
    const manager = new BrowserProfileManager(); // Use project-local storage
    
    // Parse viewport if provided
    const viewport = options.viewport ? 
      parseViewport(options.viewport) : 
      getDefaultViewport(options.deviceType || 'desktop');
    
    // Get user agent
    const userAgent = options.userAgent || getDefaultUserAgent(options.deviceType || 'desktop');
    
    // Determine device characteristics
    const deviceType = options.deviceType || 'desktop';
    const hasTouch = deviceType === 'mobile' || deviceType === 'tablet';
    const isMobile = deviceType === 'mobile';
    
    // Create profile configuration
    const profileConfig = {
      name,
      role: deviceType,
      description: options.description || `${deviceType} profile with ${viewport.width}x${viewport.height} viewport`,
      settings: {
        viewport,
        userAgent,
        locale: 'en-US',
        timezone: 'America/New_York'
      },
      silent: options.silent
    };
    
    await manager.createProfile(profileConfig);
    
    if (!options.silent) {
      console.log(chalk.green(`✅ Profile "${name}" created successfully`));
      console.log(chalk.gray(`📱 Device type: ${deviceType}`));
      console.log(chalk.gray(`📐 Viewport: ${viewport.width}x${viewport.height}`));
      console.log(chalk.gray(`🤖 User Agent: ${userAgent.substring(0, 50)}...`));
    }
    
    return true;
    
  } catch (error) {
    if (!options.silent) {
      console.error(chalk.red('❌ Failed to create profile:'), (error as Error).message);
    }
    throw error; // Re-throw for setupDefaultProfiles to handle
  }
}

/**
 * List all browser profiles
 */
export async function listProfiles(): Promise<void> {
  try {
    const manager = new BrowserProfileManager(); // Use project-local storage
    const profiles = await manager.listProfiles();
    
    if (profiles.length === 0) {
      console.log(chalk.gray('No profiles found'));
      console.log(chalk.gray('Use "claude-playwright profile create <name>" to create a profile'));
      console.log(chalk.gray('Or "claude-playwright profile setup" to create default profiles'));
      return;
    }
    
    console.log(chalk.blue('🎭 Browser Profiles:'));
    console.log('');
    console.log(
      chalk.cyan('Name'.padEnd(15)) + 
      chalk.cyan('Type'.padEnd(12)) + 
      chalk.cyan('Viewport'.padEnd(15)) + 
      chalk.cyan('Last Used'.padEnd(20)) + 
      chalk.cyan('Description')
    );
    console.log('─'.repeat(80));
    
    for (const profile of profiles) {
      const viewport = profile.configuration?.viewport ? 
        `${profile.configuration.viewport.width}x${profile.configuration.viewport.height}` : 
        'Default';
        
      console.log(
        chalk.white(profile.name.padEnd(15)) +
        chalk.gray(profile.role.padEnd(12)) +
        chalk.gray(viewport.padEnd(15)) +
        chalk.gray(profile.lastUsed.padEnd(20)) +
        chalk.gray(profile.description)
      );
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to list profiles:'), (error as Error).message);
  }
}

/**
 * Delete a browser profile
 */
export async function deleteProfile(name: string): Promise<boolean> {
  try {
    if (!name) {
      console.error(chalk.red('❌ Profile name required'));
      return false;
    }
    
    const manager = new BrowserProfileManager(); // Use project-local storage
    const success = await manager.deleteProfile(name);
    
    if (success) {
      console.log(chalk.green(`✅ Profile "${name}" deleted successfully`));
    } else {
      console.error(chalk.red(`❌ Profile not found: ${name}`));
    }
    
    return success;
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to delete profile:'), (error as Error).message);
    return false;
  }
}

/**
 * Setup default browser profiles
 */
export async function setupDefaultProfiles(force: boolean = false): Promise<void> {
  try {
    const manager = new BrowserProfileManager(); // Use project-local storage
    
    console.log(chalk.blue('🔧 Setting up default browser profiles...'));
    
    // Check existing profiles first
    const existingProfiles = await manager.listProfiles();
    const profileNames = ['desktop', 'mobile', 'tablet'];
    
    let createdCount = 0;
    let skippedCount = 0;
    const results: Array<{name: string, status: 'created' | 'exists' | 'error', message?: string}> = [];
    
    for (const profileName of profileNames) {
      const existingProfile = existingProfiles.find(p => p.name === profileName);
      
      if (existingProfile && !force) {
        results.push({name: profileName, status: 'exists'});
        skippedCount++;
        continue;
      }
      
      try {
        // Delete existing profile if force is enabled
        if (existingProfile && force) {
          await manager.deleteProfile(profileName, true); // silent delete
        }
        
        // Create the profile (silently, we handle messages ourselves)
        switch (profileName) {
          case 'desktop':
            await createProfile('desktop', {
              deviceType: 'desktop',
              viewport: '1920x1080',
              description: 'Standard desktop browser profile',
              silent: true
            });
            break;
          case 'mobile':
            await createProfile('mobile', {
              deviceType: 'mobile',
              viewport: '375x667',
              description: 'iPhone-style mobile profile',
              silent: true
            });
            break;
          case 'tablet':
            await createProfile('tablet', {
              deviceType: 'tablet', 
              viewport: '768x1024',
              description: 'iPad-style tablet profile',
              silent: true
            });
            break;
        }
        
        results.push({name: profileName, status: 'created'});
        createdCount++;
        
      } catch (error) {
        results.push({
          name: profileName, 
          status: 'error', 
          message: (error as Error).message
        });
      }
    }
    
    // Display results
    console.log('');
    for (const result of results) {
      switch (result.status) {
        case 'created':
          console.log(chalk.green(`✓ Created new profile '${result.name}'`));
          break;
        case 'exists':
          console.log(chalk.cyan(`✓ Profile '${result.name}' already configured`));
          break;
        case 'error':
          console.log(chalk.red(`✗ Failed to create '${result.name}': ${result.message}`));
          break;
      }
    }
    
    console.log('');
    if (createdCount > 0 && skippedCount > 0) {
      console.log(chalk.green(`✅ Setup complete: ${createdCount} created, ${skippedCount} already existed`));
    } else if (createdCount > 0) {
      console.log(chalk.green(`✅ Setup complete: ${createdCount} profiles created`));
    } else if (skippedCount > 0) {
      console.log(chalk.green(`✅ All profiles already configured (${skippedCount} profiles)`));
    } else {
      console.log(chalk.red('❌ No profiles were created'));
    }
    
    if (skippedCount > 0 && !force) {
      console.log(chalk.gray('💡 Use --force flag to overwrite existing profiles'));
    }
    
    console.log(chalk.gray('📱 Available profiles: desktop, mobile, tablet'));
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to setup default profiles:'), (error as Error).message);
  }
}

/**
 * Show detailed profile information
 */
export async function showProfile(name: string): Promise<void> {
  try {
    if (!name) {
      console.error(chalk.red('❌ Profile name required'));
      return;
    }
    
    const manager = new BrowserProfileManager(); // Use project-local storage
    const profiles = await manager.listProfiles();
    const profile = profiles.find(p => p.name === name);
    
    if (!profile) {
      console.error(chalk.red(`❌ Profile not found: ${name}`));
      return;
    }
    
    console.log(chalk.blue(`🎭 Profile: ${profile.name}`));
    console.log('');
    console.log(chalk.cyan('Basic Information:'));
    console.log(`  Name: ${profile.name}`);
    console.log(`  Type: ${profile.role}`);
    console.log(`  Description: ${profile.description}`);
    console.log(`  Created: ${profile.lastUsed}`);
    
    if (profile.configuration) {
      console.log('');
      console.log(chalk.cyan('Configuration:'));
      
      if (profile.configuration.viewport) {
        console.log(`  Viewport: ${profile.configuration.viewport.width}x${profile.configuration.viewport.height}`);
      }
      
      if (profile.configuration.userAgent) {
        console.log(`  User Agent: ${profile.configuration.userAgent}`);
      }
      
      console.log(`  Touch Support: ${profile.configuration.hasTouch ? 'Yes' : 'No'}`);
      console.log(`  Mobile: ${profile.configuration.isMobile ? 'Yes' : 'No'}`);
      
      if (profile.configuration.deviceScaleFactor) {
        console.log(`  Device Scale: ${profile.configuration.deviceScaleFactor}x`);
      }
      
      if (profile.configuration.locale) {
        console.log(`  Locale: ${profile.configuration.locale}`);
      }
      
      if (profile.configuration.timezone) {
        console.log(`  Timezone: ${profile.configuration.timezone}`);
      }
    }
    
  } catch (error) {
    console.error(chalk.red('❌ Failed to show profile:'), (error as Error).message);
  }
}

/**
 * Parse viewport string (e.g., "1920x1080") to ViewportSize
 */
function parseViewport(viewportString: string): ViewportSize {
  const parts = viewportString.split('x');
  if (parts.length !== 2) {
    throw new Error(`Invalid viewport format: ${viewportString}. Use format: WIDTHxHEIGHT (e.g., 1920x1080)`);
  }
  
  const width = parseInt(parts[0], 10);
  const height = parseInt(parts[1], 10);
  
  if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid viewport dimensions: ${viewportString}`);
  }
  
  return { width, height };
}

/**
 * Get default viewport for device type
 */
function getDefaultViewport(deviceType: string): ViewportSize {
  const viewports: Record<string, ViewportSize> = {
    desktop: { width: 1920, height: 1080 },
    mobile: { width: 375, height: 667 },
    tablet: { width: 768, height: 1024 }
  };
  
  return viewports[deviceType] || viewports.desktop;
}

/**
 * Get default user agent for device type
 */
function getDefaultUserAgent(deviceType: string): string {
  const userAgents: Record<string, string> = {
    desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    tablet: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  };
  
  return userAgents[deviceType] || userAgents.desktop;
}