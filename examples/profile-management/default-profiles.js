/**
 * Default Browser Profiles Example
 * 
 * This example demonstrates the built-in browser profiles
 * and how to use them for different testing scenarios.
 * 
 * Features Demonstrated:
 * - Default profile setup
 * - Profile-based testing
 * - Mobile vs Desktop simulation
 * - Profile-specific assertions
 */

const { test, expect } = require('@playwright/test');
const { BrowserProfileManager } = require('claude-playwright');

// Initialize profile manager
const profileManager = new BrowserProfileManager();

test.describe('Default Browser Profiles', () => {
  
  test.beforeAll(async () => {
    /**
     * Setup default profiles programmatically
     * Equivalent to: claude-playwright profile setup
     */
    console.log('🏗️  Setting up default profiles...');
    await profileManager.setupDefaultProfiles();
    console.log('✅ Default profiles created');
  });
  
  test('list available profiles', async () => {
    const profiles = await profileManager.listProfiles();
    
    console.log(`🎭 Found ${profiles.length} profile(s):`);
    profiles.forEach(profile => {
      console.log(`   📱 ${profile.name} (${profile.role}) - ${profile.description}`);
      console.log(`      Last used: ${profile.lastUsed}`);
    });
    
    // Verify default profiles exist
    const expectedProfiles = ['admin', 'user', 'guest', 'mobile'];
    for (const expectedProfile of expectedProfiles) {
      const profile = profiles.find(p => p.name === expectedProfile);
      expect(profile).toBeDefined();
      console.log(`✅ Found ${expectedProfile} profile`);
    }
  });
  
  test('desktop admin profile testing', async ({ browser }) => {
    // Load admin profile
    const adminProfile = await profileManager.loadProfile('admin');
    
    console.log('🔧 Admin Profile Configuration:');
    console.log(`   👤 Role: ${adminProfile.role}`);
    console.log(`   📏 Viewport: ${adminProfile.settings.viewport.width}x${adminProfile.settings.viewport.height}`);
    console.log(`   🌐 User Agent: ${adminProfile.settings.userAgent?.substring(0, 50)}...`);
    console.log(`   🔒 Permissions: ${adminProfile.settings.permissions?.join(', ')}`);
    
    // Create context with admin profile settings
    const context = await browser.newContext({
      userAgent: adminProfile.settings.userAgent,
      viewport: adminProfile.settings.viewport,
      locale: adminProfile.settings.locale,
      timezoneId: adminProfile.settings.timezone,
      permissions: adminProfile.settings.permissions
    });
    
    const page = await context.newPage();
    
    // Test desktop-specific functionality
    await page.goto('https://example.com');
    
    // Verify desktop viewport
    const viewport = page.viewportSize();
    expect(viewport.width).toBe(1920);
    expect(viewport.height).toBe(1080);
    
    // Check user agent
    const userAgent = await page.evaluate(() => navigator.userAgent);
    expect(userAgent).toContain('Chrome');
    expect(userAgent).not.toContain('Mobile');
    
    console.log('✅ Desktop admin profile works correctly');
    
    await context.close();
  });
  
  test('mobile profile simulation', async ({ browser }) => {
    // Load mobile profile
    const mobileProfile = await profileManager.loadProfile('mobile');
    
    console.log('📱 Mobile Profile Configuration:');
    console.log(`   👤 Role: ${mobileProfile.role}`);
    console.log(`   📏 Viewport: ${mobileProfile.settings.viewport.width}x${mobileProfile.settings.viewport.height}`);
    console.log(`   🌐 User Agent: ${mobileProfile.settings.userAgent?.substring(0, 50)}...`);
    
    // Create mobile context
    const context = await browser.newContext({
      userAgent: mobileProfile.settings.userAgent,
      viewport: mobileProfile.settings.viewport,
      locale: mobileProfile.settings.locale,
      timezoneId: mobileProfile.settings.timezone,
      permissions: mobileProfile.settings.permissions,
      isMobile: true,
      hasTouch: true
    });
    
    const page = await context.newPage();
    await page.goto('https://example.com');
    
    // Verify mobile viewport
    const viewport = page.viewportSize();
    expect(viewport.width).toBe(375);
    expect(viewport.height).toBe(667);
    
    // Check mobile user agent
    const userAgent = await page.evaluate(() => navigator.userAgent);
    expect(userAgent).toContain('iPhone');
    expect(userAgent).toContain('Mobile');
    
    // Test touch capabilities
    const hasTouchscreen = await page.evaluate(() => {
      return 'ontouchstart' in window;
    });
    expect(hasTouchscreen).toBe(true);
    
    // Test mobile-specific interactions
    if (await page.locator('[data-testid="mobile-menu-button"]').isVisible()) {
      // Use tap instead of click for mobile
      await page.locator('[data-testid="mobile-menu-button"]').tap();
      console.log('✅ Mobile tap interaction works');
    }
    
    console.log('✅ Mobile profile simulation works correctly');
    
    await context.close();
  });
  
  test('guest profile minimal permissions', async ({ browser }) => {
    // Load guest profile
    const guestProfile = await profileManager.loadProfile('guest');
    
    console.log('🕵️  Guest Profile Configuration:');
    console.log(`   👤 Role: ${guestProfile.role}`);
    console.log(`   📏 Viewport: ${guestProfile.settings.viewport.width}x${guestProfile.settings.viewport.height}`);
    console.log(`   🔒 Permissions: ${guestProfile.settings.permissions?.join(', ') || 'None'}`);
    
    // Create guest context with minimal permissions
    const context = await browser.newContext({
      userAgent: guestProfile.settings.userAgent,
      viewport: guestProfile.settings.viewport,
      locale: guestProfile.settings.locale,
      permissions: guestProfile.settings.permissions || []
    });
    
    const page = await context.newPage();
    await page.goto('https://example.com');
    
    // Verify smaller viewport for guest users
    const viewport = page.viewportSize();
    expect(viewport.width).toBe(1280);
    expect(viewport.height).toBe(720);
    
    // Test that geolocation is not available (minimal permissions)
    const hasGeolocation = await page.evaluate(async () => {
      try {
        await navigator.geolocation.getCurrentPosition(() => {});
        return true;
      } catch (error) {
        return false;
      }
    });
    
    // Guest should not have geolocation access
    expect(hasGeolocation).toBe(false);
    
    console.log('✅ Guest profile with minimal permissions works correctly');
    
    await context.close();
  });
  
  test('profile comparison and selection', async ({ browser }) => {
    // Load all profiles for comparison
    const profiles = ['admin', 'user', 'guest', 'mobile'];
    
    console.log('📊 Profile Comparison:');
    console.log('Name     | Viewport    | Permissions | User Agent Type');
    console.log('---------|-------------|-------------|------------------');
    
    for (const profileName of profiles) {
      const profile = await profileManager.loadProfile(profileName);
      const viewport = `${profile.settings.viewport.width}x${profile.settings.viewport.height}`;
      const permissions = profile.settings.permissions?.length || 0;
      const userAgentType = profile.settings.userAgent?.includes('Mobile') ? 'Mobile' : 'Desktop';
      
      console.log(`${profileName.padEnd(8)} | ${viewport.padEnd(11)} | ${permissions.toString().padEnd(11)} | ${userAgentType}`);
    }
    
    // Test profile selection logic
    const testScenarios = [
      { scenario: 'admin testing', profile: 'admin' },
      { scenario: 'mobile testing', profile: 'mobile' },
      { scenario: 'anonymous testing', profile: 'guest' },
      { scenario: 'standard user testing', profile: 'user' }
    ];
    
    for (const { scenario, profile } of testScenarios) {
      const profileData = await profileManager.loadProfile(profile);
      console.log(`✅ Profile '${profile}' loaded for ${scenario}`);
      
      // Verify profile metadata
      expect(profileData.name).toBe(profile);
      expect(profileData.settings).toBeDefined();
      expect(profileData.settings.viewport).toBeDefined();
      expect(profileData.settings.userAgent).toBeDefined();
    }
  });
  
  test('profile environment configuration', async () => {
    // Test environment-specific profile usage
    const environments = ['dev', 'staging', 'prod'];
    
    for (const env of environments) {
      console.log(`🌍 Testing ${env.toUpperCase()} environment configuration`);
      
      // You can create environment-specific profiles
      // or modify existing profiles for different environments
      const adminProfile = await profileManager.loadProfile('admin');
      
      // Update profile for specific environment
      await profileManager.updateProfile('admin', {
        metadata: {
          ...adminProfile.metadata,
          environment: env,
          baseUrl: getBaseUrlForEnvironment(env)
        }
      });
      
      console.log(`✅ Admin profile configured for ${env} environment`);
    }
    
    // Helper function for environment URLs
    function getBaseUrlForEnvironment(env) {
      const urls = {
        dev: 'http://localhost:3000',
        staging: 'https://staging.example.com',
        prod: 'https://app.example.com'
      };
      return urls[env] || urls.dev;
    }
  });
});

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. Run this test to see all default profiles in action:
 *    npx playwright test examples/profile-management/default-profiles.js
 * 
 * 2. Or set up profiles via CLI first:
 *    claude-playwright profile setup
 * 
 * 3. View created profiles:
 *    claude-playwright profile list
 * 
 * EXPECTED RESULTS:
 * - 4 default profiles are created (admin, user, guest, mobile)
 * - Each profile has appropriate viewport, user-agent, and permissions
 * - Mobile profile correctly simulates touch device
 * - Guest profile has minimal permissions
 * - Admin profile has full permissions and large viewport
 * 
 * NEXT STEPS:
 * - Try examples/profile-management/custom-profiles.js for advanced usage
 * - Use profiles in your actual tests by loading them before test execution
 */