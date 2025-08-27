/**
 * Claude-Playwright Configuration
 * This file configures the base settings for your project
 */

module.exports = {
  // Base URL for all browser operations
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  
  // Session configuration
  sessions: {
    // Default session timeout (8 hours)
    timeout: 8 * 60 * 60 * 1000,
    
    // Auto-extend sessions that expire in less than 2 hours
    autoExtend: true,
    
    // Directory for session storage
    directory: './playwright-sessions'
  },
  
  // MCP Server configuration
  mcp: {
    // Automatically use base URL for all navigations
    enforceBaseURL: true,
    
    // Allowed URL patterns (regex)
    allowedURLs: [
      '^http://localhost:\\d+',  // Any localhost with port
      '^https?://127\\.0\\.0\\.1:\\d+',  // 127.0.0.1 with port
      // Add your production URLs here:
      // '^https://app\\.example\\.com',
      // '^https://staging\\.example\\.com'
    ],
    
    // Redirect all relative paths to base URL
    redirectRelativeToBase: true
  },
  
  // Browser profiles
  profiles: {
    default: 'desktop',
    directory: './browser-profiles'
  },
  
  // Playwright configuration overrides
  playwright: {
    // Default timeout for actions
    timeout: 30000,
    
    // Navigation timeout
    navigationTimeout: 30000,
    
    // Default viewport
    viewport: { width: 1920, height: 1080 },
    
    // Headless mode for MCP
    headless: false
  }
};