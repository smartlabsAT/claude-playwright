#!/usr/bin/env node

/**
 * MCP Wrapper for dynamic session loading
 * This wrapper allows Claude Code to switch between different sessions
 * 
 * Usage:
 * - Automatically loads session from active-session.json
 * - Can be overridden with PLAYWRIGHT_SESSION env variable
 * - Falls back to no session if none configured
 * - Enforces base URL from configuration
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const sessionsDir = path.join(process.cwd(), 'playwright-sessions');
const activeSessionConfig = path.join(sessionsDir, 'active-session.json');
const projectConfigPath = path.join(process.cwd(), 'claude-playwright.config.js');

// Load project configuration if exists
let projectConfig = {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  mcp: { enforceBaseURL: true }
};

if (fs.existsSync(projectConfigPath)) {
  try {
    projectConfig = require(projectConfigPath);
    console.error(`[Claude-Playwright MCP] Using base URL: ${projectConfig.baseURL}`);
  } catch (err) {
    console.error(`[Claude-Playwright MCP] Error loading config: ${err.message}`);
  }
}

// Determine which session to use
let sessionName = process.env.PLAYWRIGHT_SESSION;

// If no env var, check active-session.json
if (!sessionName && fs.existsSync(activeSessionConfig)) {
  try {
    const config = JSON.parse(fs.readFileSync(activeSessionConfig, 'utf8'));
    sessionName = config.activeSession;
    console.error(`[Claude-Playwright MCP] Using active session from config: ${sessionName}`);
  } catch (err) {
    console.error(`[Claude-Playwright MCP] Error reading active session config: ${err.message}`);
  }
}

// Default to no session if still not set
sessionName = sessionName || null;

// Build args for @playwright/mcp
const args = ['@playwright/mcp'];

// Check if session file exists and add storage-state
if (sessionName) {
  const sessionFile = path.join(sessionsDir, `${sessionName}.json`);
  if (fs.existsSync(sessionFile)) {
    console.error(`[Claude-Playwright MCP] Loading session: ${sessionName}`);
    args.push(`--storage-state=${sessionFile}`);
    
    // Log session details if available
    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      if (sessionData.metadata) {
        console.error(`[Claude-Playwright MCP] Session URL: ${sessionData.metadata.url}`);
        const createdAt = sessionData.createdAt ? new Date(sessionData.createdAt).toLocaleString() : 'unknown';
        console.error(`[Claude-Playwright MCP] Session created: ${createdAt}`);
      }
    } catch (err) {
      // Ignore errors reading session details
    }
  } else {
    console.error(`[Claude-Playwright MCP] Warning: Session file not found: ${sessionFile}`);
    console.error(`[Claude-Playwright MCP] Starting without session`);
  }
} else {
  console.error(`[Claude-Playwright MCP] Starting without session (no active session configured)`);
  console.error(`[Claude-Playwright MCP] Tip: Use 'claude-playwright session switch <name>' to activate a session`);
}

// Add any additional arguments passed to the wrapper
args.push(...process.argv.slice(2));

console.error(`[Claude-Playwright MCP] Starting @playwright/mcp with args:`, args.join(' '));

// Start the actual MCP server
const child = spawn('npx', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_ACTIVE_SESSION: sessionName || 'none',
    PLAYWRIGHT_BASE_URL: projectConfig.baseURL,
    BASE_URL: projectConfig.baseURL
  }
});

// Forward exit codes
child.on('exit', (code) => {
  process.exit(code || 0);
});

// Handle signals
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    child.kill(signal);
  });
});