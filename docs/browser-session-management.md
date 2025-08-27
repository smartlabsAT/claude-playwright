# Browser Session Management Guide

Comprehensive guide to real browser session capture and management in the Claude-Playwright Toolkit.

## 🎯 Overview

The Claude-Playwright Toolkit provides **real browser session management** that captures authentic login sessions from actual browser interactions, stores them securely, and reuses them across test runs for 8-hour periods.

## 🚀 Key Features

- **Real Browser Integration**: Opens actual browser for manual login
- **Authentic Session Capture**: Captures real cookies, localStorage, sessionStorage
- **8-Hour Session Caching**: Automatic expiration and cleanup
- **Session Validation**: Integrity checking and authentication verification
- **Multi-Environment Support**: Environment-specific session management
- **Profile Integration**: Sessions work with browser profiles

## 📋 Session Management Commands

### Session Capture

#### Basic Session Capture
```bash
# Interactive session capture with URL prompt
claude-playwright session save my-session

# Direct URL specification
claude-playwright session save admin-session --url https://app.example.com/login

# Using specific browser profile
claude-playwright session save mobile-session --profile mobile --url https://m.example.com
```

#### Advanced Session Capture
```bash
# Environment-specific sessions
claude-playwright session save prod-admin --url https://app.example.com/admin
claude-playwright session save staging-user --url https://staging.example.com/login
claude-playwright session save dev-session --url http://localhost:3000/auth

# Role-based sessions
claude-playwright session save admin-session --url https://app.example.com/admin
claude-playwright session save editor-session --url https://app.example.com/editor
claude-playwright session save viewer-session --url https://app.example.com/viewer
```

### Session Management

#### List Sessions
```bash
# Show all sessions with status
claude-playwright session list

# Filter options (future enhancement)
claude-playwright session list --expired    # Show only expired sessions
claude-playwright session list --valid      # Show only valid sessions
claude-playwright session list --profile mobile  # Filter by profile
```

#### Session Cleanup
```bash
# Remove expired sessions
claude-playwright session clear

# Delete specific session
claude-playwright session delete old-session

# Bulk cleanup (future enhancement)
claude-playwright session clear --older-than 24h
```

## 🔍 Real Browser Session Capture Process

### Step-by-Step Workflow

1. **Command Execution**
   ```bash
   claude-playwright session save my-session --url https://app.example.com/login
   ```

2. **Browser Launch**
   - Non-headless Chromium browser opens
   - Maximized window for better user experience
   - Navigation to specified URL

3. **Manual Login**
   - User performs login in real browser
   - Complete authentication flow (2FA, CAPTCHA, etc.)
   - Navigate to desired authenticated state

4. **Session Confirmation**
   - User presses ENTER when ready to save
   - Toolkit captures current browser state

5. **State Capture**
   - Cookies (including httpOnly and secure)
   - localStorage data
   - sessionStorage data
   - Current URL and metadata

6. **Validation**
   - Verifies authentication cookies exist
   - Checks for session tokens
   - Validates localStorage auth data

7. **Storage**
   - Saves with 8-hour expiration
   - Includes metadata and timestamps
   - Stores in `./playwright-sessions/`

### Browser Session Capture Implementation

```typescript
// Internal capture process (for understanding)
async function captureRealSession(sessionName: string, url: string): Promise<SessionData> {
  // 1. Launch browser with optimal settings
  const browser = await chromium.launch({
    headless: false,
    args: [
      '--start-maximized',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });

  // 2. Create context with profile settings
  const context = await browser.newContext({
    viewport: null, // Use full screen
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...'
  });

  // 3. Navigate and wait for user interaction
  const page = await context.newPage();
  await page.goto(url);
  
  console.log('👤 Please complete login in the browser...');
  console.log('📝 Navigate to your desired authenticated state');
  console.log('⏎ Press ENTER when ready to save session');
  
  await waitForUserConfirmation();

  // 4. Capture complete storage state
  const storageState = await context.storageState();
  
  // 5. Validate authentication
  if (!validateAuthenticationState(storageState)) {
    throw new Error('No authentication data found in session');
  }

  // 6. Create session data with metadata
  const sessionData: SessionData = {
    name: sessionName,
    storageState,
    createdAt: Date.now(),
    expiresAt: Date.now() + (8 * 60 * 60 * 1000), // 8 hours
    metadata: {
      url: page.url(),
      userAgent: await page.evaluate(() => navigator.userAgent),
      viewport: page.viewportSize(),
      timestamp: new Date().toISOString()
    }
  };

  await browser.close();
  return sessionData;
}
```

## 🔐 Session Data Structure

### Complete Session Format
```json
{
  "name": "admin-session",
  "createdAt": 1647875400000,
  "expiresAt": 1647904200000,
  "storageState": {
    "cookies": [
      {
        "name": "auth_token",
        "value": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
        "domain": ".example.com",
        "path": "/",
        "expires": 1647961800,
        "httpOnly": true,
        "secure": true,
        "sameSite": "Lax"
      },
      {
        "name": "session_id",
        "value": "abc123def456",
        "domain": "app.example.com",
        "path": "/",
        "httpOnly": false,
        "secure": true
      }
    ],
    "origins": [
      {
        "origin": "https://app.example.com",
        "localStorage": [
          {
            "name": "user_preferences",
            "value": "{\"theme\":\"dark\",\"language\":\"en\"}"
          },
          {
            "name": "auth_state",
            "value": "{\"user_id\":\"12345\",\"role\":\"admin\"}"
          }
        ],
        "sessionStorage": [
          {
            "name": "csrf_token",
            "value": "xyz789abc123"
          }
        ]
      }
    ]
  },
  "browserProfile": "admin",
  "metadata": {
    "url": "https://app.example.com/dashboard",
    "userAgent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36...",
    "viewport": { "width": 1920, "height": 1080 },
    "timestamp": "2024-01-15T10:30:00.000Z",
    "captureMethod": "manual_browser",
    "validationPassed": true
  }
}
```

## 🧪 Using Sessions in Tests

### Basic Session Usage
```typescript
import { test, expect } from '@playwright/test';
import { SessionManager } from 'claude-playwright';

test.describe('Authenticated Tests', () => {
  let sessionManager: SessionManager;
  
  test.beforeAll(async () => {
    sessionManager = new SessionManager();
  });

  test('dashboard access with captured session', async ({ browser }) => {
    // Load captured session
    const storageState = await sessionManager.loadSession('admin-session');
    
    // Create context with session
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    
    // Navigate to protected area
    await page.goto('/admin/dashboard');
    
    // Verify authentication worked
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
    await expect(page.locator('[data-testid="admin-panel"]')).toBeVisible();
    
    await context.close();
  });
});
```

### Advanced Session Usage with Error Handling
```typescript
import { test, expect } from '@playwright/test';
import { SessionManager, SessionError } from 'claude-playwright';

test.describe('Robust Session Management', () => {
  let sessionManager: SessionManager;
  
  test.beforeAll(async () => {
    sessionManager = new SessionManager();
  });

  test('handles session expiry gracefully', async ({ browser }) => {
    try {
      const storageState = await sessionManager.loadSession('user-session');
      
      const context = await browser.newContext({ storageState });
      const page = await context.newPage();
      
      await page.goto('/dashboard');
      
      // Verify authentication state
      const isAuthenticated = await page.locator('[data-testid="user-menu"]').isVisible();
      
      if (!isAuthenticated) {
        console.log('⚠️ Session appears invalid, user not authenticated');
        // Handle re-authentication or skip test
      }
      
      await context.close();
      
    } catch (error) {
      if (error instanceof SessionError && error.message.includes('expired')) {
        console.log('⏰ Session expired, please capture new session:');
        console.log('   claude-playwright session save user-session');
        test.skip();
      } else if (error.message.includes('not found')) {
        console.log('🔍 Session not found, please capture session:');
        console.log('   claude-playwright session save user-session');
        test.skip();
      } else {
        throw error;
      }
    }
  });
});
```

### Multi-Environment Session Strategy
```typescript
// Environment-aware session manager
class EnvironmentSessionManager {
  private sessionManager = new SessionManager();
  private currentEnv = process.env.TEST_ENV || 'dev';
  
  async getEnvironmentSession(role: string): Promise<any> {
    const sessionName = `${this.currentEnv}-${role}`;
    
    try {
      return await this.sessionManager.loadSession(sessionName);
    } catch (error) {
      console.log(`❌ Session ${sessionName} not available`);
      console.log(`💡 Capture session with: claude-playwright session save ${sessionName}`);
      throw error;
    }
  }
}

// Usage in tests
test('environment-specific testing', async ({ browser }) => {
  const envSessionManager = new EnvironmentSessionManager();
  
  const adminSession = await envSessionManager.getEnvironmentSession('admin');
  const context = await browser.newContext({ storageState: adminSession });
  const page = await context.newPage();
  
  // Test with environment-specific admin session
  await page.goto('/admin');
});
```

## 🎭 Session and Profile Integration

### Combining Sessions with Browser Profiles
```typescript
import { SessionManager, BrowserProfileManager } from 'claude-playwright';

test('mobile session with profile', async ({ browser }) => {
  const sessionManager = new SessionManager();
  const profileManager = new BrowserProfileManager();
  
  // Load mobile session and profile
  const mobileSession = await sessionManager.loadSession('mobile-user');
  const mobileProfile = await profileManager.loadProfile('mobile');
  
  // Create mobile context with session
  const context = await browser.newContext({
    storageState: mobileSession,
    userAgent: mobileProfile.settings.userAgent,
    viewport: mobileProfile.settings.viewport,
    isMobile: true,
    hasTouch: true
  });
  
  const page = await context.newPage();
  
  // Test mobile-authenticated experience
  await page.goto('/mobile-dashboard');
  await page.locator('[data-testid="mobile-nav"]').tap();
});
```

## 🔍 Session Validation and Security

### Authentication Validation
```typescript
// Session validation utilities
class SessionValidator {
  static validateStorageState(storageState: any): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      warnings: [],
      errors: []
    };
    
    // Check for authentication cookies
    const authCookies = storageState.cookies.filter(cookie => 
      this.isAuthenticationCookie(cookie.name)
    );
    
    if (authCookies.length === 0) {
      result.warnings.push('No authentication cookies found');
    }
    
    // Validate cookie expiration
    const expiredCookies = storageState.cookies.filter(cookie =>
      cookie.expires && cookie.expires < Date.now() / 1000
    );
    
    if (expiredCookies.length > 0) {
      result.errors.push(`${expiredCookies.length} cookies have expired`);
      result.valid = false;
    }
    
    // Check localStorage authentication data
    let hasAuthData = false;
    storageState.origins.forEach(origin => {
      origin.localStorage.forEach(item => {
        if (this.isAuthenticationData(item.name)) {
          hasAuthData = true;
        }
      });
    });
    
    if (!hasAuthData) {
      result.warnings.push('No authentication data in localStorage');
    }
    
    return result;
  }
  
  private static isAuthenticationCookie(name: string): boolean {
    const authPatterns = [
      'auth', 'session', 'token', 'jwt', 'login', 'user',
      '_session', 'auth_', 'access_token', 'refresh_token'
    ];
    return authPatterns.some(pattern => 
      name.toLowerCase().includes(pattern)
    );
  }
  
  private static isAuthenticationData(name: string): boolean {
    const authPatterns = [
      'auth', 'user', 'token', 'login', 'session',
      'current_user', 'user_data', 'auth_state'
    ];
    return authPatterns.some(pattern => 
      name.toLowerCase().includes(pattern)
    );
  }
}
```

### Security Considerations
```typescript
// Security-conscious session management
class SecureSessionManager extends SessionManager {
  async loadSessionWithValidation(sessionName: string): Promise<any> {
    const sessionData = await this.getSessionData(sessionName);
    
    // Validate session integrity
    const validation = SessionValidator.validateStorageState(sessionData.storageState);
    
    if (!validation.valid) {
      console.warn(`⚠️ Session validation failed: ${validation.errors.join(', ')}`);
      throw new Error(`Invalid session: ${sessionName}`);
    }
    
    if (validation.warnings.length > 0) {
      console.warn(`⚠️ Session warnings: ${validation.warnings.join(', ')}`);
    }
    
    // Check for sensitive data exposure
    this.checkForSensitiveData(sessionData.storageState);
    
    return sessionData.storageState;
  }
  
  private checkForSensitiveData(storageState: any): void {
    const sensitivePatterns = ['password', 'secret', 'private_key', 'api_key'];
    
    // Check cookies for sensitive data
    storageState.cookies.forEach(cookie => {
      if (sensitivePatterns.some(pattern => cookie.name.toLowerCase().includes(pattern))) {
        console.warn(`⚠️ Potentially sensitive cookie detected: ${cookie.name}`);
      }
    });
    
    // Check localStorage for sensitive data
    storageState.origins.forEach(origin => {
      origin.localStorage.forEach(item => {
        if (sensitivePatterns.some(pattern => item.name.toLowerCase().includes(pattern))) {
          console.warn(`⚠️ Potentially sensitive localStorage item: ${item.name}`);
        }
      });
    });
  }
}
```

## 🎯 Best Practices

### Session Management Best Practices

1. **Descriptive Session Names**
   ```bash
   # Good
   claude-playwright session save prod-admin-dashboard
   claude-playwright session save staging-editor-cms
   claude-playwright session save dev-user-checkout
   
   # Avoid
   claude-playwright session save session1
   claude-playwright session save test
   ```

2. **Environment Separation**
   ```bash
   # Environment-specific sessions
   claude-playwright session save prod-admin --url https://app.example.com/admin
   claude-playwright session save staging-admin --url https://staging.example.com/admin
   claude-playwright session save dev-admin --url http://localhost:3000/admin
   ```

3. **Role-Based Sessions**
   ```bash
   # Different user roles
   claude-playwright session save admin-session
   claude-playwright session save editor-session
   claude-playwright session save viewer-session
   claude-playwright session save guest-session
   ```

4. **Regular Session Maintenance**
   ```bash
   # Daily maintenance
   claude-playwright session list
   claude-playwright session clear
   
   # Weekly cleanup
   claude-playwright session list | grep EXPIRED
   ```

### Test Implementation Best Practices

1. **Session Validation in Tests**
   ```typescript
   test.beforeEach(async ({ browser }, testInfo) => {
     try {
       const storageState = await sessionManager.loadSession('user-session');
       testInfo.attach('session-loaded', {
         body: `Successfully loaded session: user-session`,
         contentType: 'text/plain'
       });
     } catch (error) {
       testInfo.attach('session-error', {
         body: `Session load failed: ${error.message}`,
         contentType: 'text/plain'
       });
       throw error;
     }
   });
   ```

2. **Graceful Session Handling**
   ```typescript
   test('with session fallback', async ({ browser }) => {
     let context;
     
     try {
       // Try to use captured session
       const storageState = await sessionManager.loadSession('user-session');
       context = await browser.newContext({ storageState });
     } catch (error) {
       // Fallback to manual login
       console.log('Session unavailable, using manual login');
       context = await browser.newContext();
       await performManualLogin(context);
     }
     
     const page = await context.newPage();
     // Continue with test...
   });
   ```

## 📊 Session Analytics and Monitoring

### Session Usage Tracking
```typescript
// Session analytics utility
class SessionAnalytics {
  static async getSessionStats(): Promise<SessionStats> {
    const sessionManager = new SessionManager();
    const sessions = await sessionManager.listSessions();
    
    const stats = {
      total: sessions.length,
      valid: sessions.filter(s => !s.expired).length,
      expired: sessions.filter(s => s.expired).length,
      byEnvironment: this.groupByEnvironment(sessions),
      oldestValid: this.getOldestValidSession(sessions),
      expiringWitinHour: this.getExpiringSoon(sessions, 1),
      averageAge: this.getAverageAge(sessions)
    };
    
    return stats;
  }
  
  static async reportSessionHealth(): Promise<void> {
    const stats = await this.getSessionStats();
    
    console.log('📊 Session Health Report');
    console.log(`   Total Sessions: ${stats.total}`);
    console.log(`   Valid: ${stats.valid}`);
    console.log(`   Expired: ${stats.expired}`);
    
    if (stats.expiringWitinHour.length > 0) {
      console.log(`   ⚠️ Expiring Soon: ${stats.expiringWitinHour.length}`);
    }
    
    console.log(`   Oldest Valid: ${stats.oldestValid}`);
    console.log(`   Average Age: ${stats.averageAge} hours`);
  }
}
```

## 🚨 Troubleshooting

### Common Issues and Solutions

1. **Session Not Found**
   ```
   Error: Session not found: admin-session
   
   Solution:
   claude-playwright session save admin-session --url https://app.example.com/login
   ```

2. **Session Expired**
   ```
   Error: Session expired: user-session. Session was valid until 1/15/24, 6:30:00 PM
   
   Solution:
   claude-playwright session save user-session --url https://app.example.com/login
   ```

3. **No Authentication Data**
   ```
   Warning: No authentication cookies found
   
   Solution:
   - Ensure you're fully logged in before capturing
   - Check that cookies are being set by the application
   - Verify the login process completed successfully
   ```

4. **Session Validation Failed**
   ```
   Error: Invalid session: expired cookies detected
   
   Solution:
   - Capture a fresh session
   - Check application's session timeout settings
   - Verify cookie domains and paths are correct
   ```

### Debug Mode
```bash
# Enable debug logging for session operations
DEBUG=session:* claude-playwright session save debug-session

# Verbose session list with validation
claude-playwright session list --verbose

# Check session integrity
claude-playwright session validate my-session
```

## 🔮 Future Enhancements

### Planned Features
- **Session Refresh**: Automatic session extension before expiry
- **Multi-Factor Authentication**: Support for 2FA/MFA capture
- **Session Sharing**: Team-based session management
- **Session Templates**: Predefined session configurations
- **Integration APIs**: REST API for session management

### Advanced Use Cases
- **Load Testing**: Use sessions for performance testing
- **CI/CD Integration**: Automated session capture in pipelines
- **Multi-Tenant Testing**: Tenant-specific session management
- **Cross-Browser Sessions**: Session compatibility across browsers