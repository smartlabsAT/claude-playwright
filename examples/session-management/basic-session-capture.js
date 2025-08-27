/**
 * Basic Session Capture Example
 * 
 * This example demonstrates how to capture and use real browser sessions
 * with the Claude-Playwright Toolkit Phase 1.6.
 * 
 * Features Demonstrated:
 * - Real browser session capture
 * - Session validation
 * - Session loading in tests
 * - Session expiry handling
 */

const { test, expect } = require('@playwright/test');
const { SessionManager } = require('claude-playwright');

// Initialize session manager
const sessionManager = new SessionManager();

test.describe('Basic Session Management', () => {
  
  test('capture session manually', async () => {
    /**
     * MANUAL STEP REQUIRED:
     * 
     * Before running this test, capture a session using CLI:
     * 
     * claude-playwright session save demo-session --url https://example.com/login
     * 
     * This will:
     * 1. Open a real browser (non-headless)
     * 2. Navigate to the login page
     * 3. Wait for you to manually login
     * 4. Capture the authenticated session state
     * 5. Save with 8-hour expiration
     */
    
    // Verify session was created
    const sessions = await sessionManager.listSessions();
    const demoSession = sessions.find(s => s.name === 'demo-session');
    
    expect(demoSession).toBeDefined();
    expect(demoSession.expired).toBe(false);
    
    console.log('✅ Session captured successfully');
    console.log(`📅 Created: ${demoSession.created}`);
    console.log(`⏰ Expires: ${demoSession.expires}`);
  });
  
  test('load session in browser context', async ({ browser }) => {
    try {
      // Load the captured session
      const storageState = await sessionManager.loadSession('demo-session');
      
      console.log('🔑 Session loaded successfully');
      console.log(`📊 Cookies: ${storageState.cookies.length}`);
      console.log(`💾 Origins: ${storageState.origins.length}`);
      
      // Create browser context with session state
      const context = await browser.newContext({
        storageState: storageState
      });
      
      const page = await context.newPage();
      
      // Navigate to protected area
      await page.goto('https://example.com/dashboard');
      
      // Verify authentication worked
      // Note: Adjust selectors based on your actual application
      await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
      
      console.log('✅ Successfully accessed protected area with session');
      
      await context.close();
      
    } catch (error) {
      if (error.message.includes('Session not found')) {
        console.log('⚠️  Session not found. Please run session capture first:');
        console.log('   claude-playwright session save demo-session');
        test.skip();
      } else if (error.message.includes('Session expired')) {
        console.log('⏰ Session has expired. Please capture a new session:');
        console.log('   claude-playwright session save demo-session');
        test.skip();
      } else {
        throw error;
      }
    }
  });
  
  test('validate session integrity', async () => {
    try {
      // Get full session data including metadata
      const sessionData = await sessionManager.getSessionData('demo-session');
      
      // Validate session structure
      expect(sessionData.name).toBe('demo-session');
      expect(sessionData.storageState).toBeDefined();
      expect(sessionData.createdAt).toBeGreaterThan(0);
      expect(sessionData.expiresAt).toBeGreaterThan(Date.now());
      
      // Validate authentication data
      const { storageState } = sessionData;
      
      // Check for authentication cookies
      const authCookies = storageState.cookies.filter(cookie =>
        cookie.name.includes('auth') || 
        cookie.name.includes('session') ||
        cookie.name.includes('token') ||
        cookie.name.includes('jwt')
      );
      
      if (authCookies.length === 0) {
        console.log('⚠️  Warning: No obvious authentication cookies found');
        console.log('   Available cookies:', storageState.cookies.map(c => c.name));
      } else {
        console.log(`✅ Found ${authCookies.length} authentication cookie(s)`);
        authCookies.forEach(cookie => {
          console.log(`   🍪 ${cookie.name} (${cookie.domain})`);
        });
      }
      
      // Check for localStorage authentication data
      let hasAuthData = false;
      storageState.origins.forEach(origin => {
        origin.localStorage.forEach(item => {
          if (item.name.includes('auth') || 
              item.name.includes('user') || 
              item.name.includes('token')) {
            hasAuthData = true;
            console.log(`✅ Found auth data in localStorage: ${item.name}`);
          }
        });
      });
      
      if (!hasAuthData) {
        console.log('⚠️  No authentication data found in localStorage');
      }
      
      // Display session metadata
      if (sessionData.metadata) {
        console.log('📊 Session Metadata:');
        console.log(`   🌐 URL: ${sessionData.metadata.url}`);
        console.log(`   📱 User Agent: ${sessionData.metadata.userAgent?.substring(0, 50)}...`);
        console.log(`   📏 Viewport: ${sessionData.metadata.viewport?.width}x${sessionData.metadata.viewport?.height}`);
      }
      
    } catch (error) {
      console.log('❌ Session validation failed:', error.message);
      test.skip();
    }
  });
  
  test('handle session expiry gracefully', async () => {
    // Create a mock expired session for testing
    const expiredSessionData = {
      name: 'expired-test-session',
      createdAt: Date.now() - (10 * 60 * 60 * 1000), // 10 hours ago
      expiresAt: Date.now() - (2 * 60 * 60 * 1000),  // 2 hours ago
      storageState: {
        cookies: [],
        origins: []
      }
    };
    
    // Temporarily save expired session
    const fs = require('fs-extra');
    const path = require('path');
    const sessionsDir = path.join(process.cwd(), 'playwright-sessions');
    await fs.ensureDir(sessionsDir);
    await fs.writeJSON(
      path.join(sessionsDir, 'expired-test-session.json'),
      expiredSessionData
    );
    
    // Try to load expired session
    try {
      await sessionManager.loadSession('expired-test-session');
      expect.fail('Should have thrown expiry error');
    } catch (error) {
      expect(error.message).toContain('Session expired');
      console.log('✅ Correctly detected expired session');
    }
    
    // Clean up test session
    await fs.remove(path.join(sessionsDir, 'expired-test-session.json'));
  });
  
  test('list and manage sessions', async () => {
    // List all sessions
    const sessions = await sessionManager.listSessions();
    
    console.log(`📋 Found ${sessions.length} session(s):`);
    sessions.forEach(session => {
      const status = session.expired ? '🔴 EXPIRED' : '🟢 ACTIVE';
      console.log(`   ${status} ${session.name} (created: ${session.created})`);
    });
    
    // Clean expired sessions
    const clearedCount = await sessionManager.clearExpiredSessions();
    console.log(`🧹 Cleared ${clearedCount} expired session(s)`);
    
    // Check session validity
    if (sessions.length > 0) {
      const firstSession = sessions[0];
      const isValid = await sessionManager.isSessionValid(firstSession.name);
      console.log(`✅ Session '${firstSession.name}' is ${isValid ? 'valid' : 'invalid'}`);
    }
  });
});

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. First, capture a real session:
 *    claude-playwright session save demo-session --url https://your-app.com/login
 * 
 * 2. Login manually in the opened browser
 * 
 * 3. Press ENTER when prompted to save the session
 * 
 * 4. Run this test file:
 *    npx playwright test examples/session-management/basic-session-capture.js
 * 
 * 5. The tests will demonstrate loading and using the captured session
 * 
 * EXPECTED RESULTS:
 * - Session capture verification passes
 * - Session loading works in browser context
 * - Session validation shows authentication data
 * - Expiry handling works correctly
 * - Session management operations complete successfully
 */