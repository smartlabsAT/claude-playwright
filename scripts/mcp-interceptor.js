#!/usr/bin/env node

/**
 * MCP Interceptor - Intelligent middleware for Playwright MCP Server
 * 
 * Features:
 * - Automatic URL correction with base URL
 * - Config enforcement
 * - Session management
 * - Request/response interception
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Configuration paths
const projectConfigPath = path.join(process.cwd(), 'claude-playwright.config.js');
const sessionsDir = path.join(process.cwd(), 'playwright-sessions');
const activeSessionConfig = path.join(sessionsDir, 'active-session.json');

// Load project configuration
let projectConfig = {
  baseURL: process.env.BASE_URL || 'http://localhost:3000',
  mcp: { enforceBaseURL: true }
};

if (fs.existsSync(projectConfigPath)) {
  try {
    projectConfig = require(projectConfigPath);
    console.error(`[MCP Interceptor] Base URL configured: ${projectConfig.baseURL}`);
  } catch (err) {
    console.error(`[MCP Interceptor] Error loading config: ${err.message}`);
  }
} else {
  console.error(`[MCP Interceptor] No config found, using default base URL: ${projectConfig.baseURL}`);
}

// Determine active session
let sessionName = process.env.PLAYWRIGHT_SESSION;
if (!sessionName && fs.existsSync(activeSessionConfig)) {
  try {
    const config = JSON.parse(fs.readFileSync(activeSessionConfig, 'utf8'));
    sessionName = config.activeSession;
    console.error(`[MCP Interceptor] Active session: ${sessionName}`);
  } catch (err) {
    // Ignore
  }
}

// Build args for underlying MCP server
const mcpArgs = ['@playwright/mcp'];

// Add session if available
if (sessionName) {
  const sessionFile = path.join(sessionsDir, `${sessionName}.json`);
  if (fs.existsSync(sessionFile)) {
    mcpArgs.push(`--storage-state=${sessionFile}`);
    console.error(`[MCP Interceptor] Session loaded: ${sessionName}`);
  }
}

// Start the actual MCP server
const mcpProcess = spawn('npx', mcpArgs, {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: {
    ...process.env,
    PLAYWRIGHT_BASE_URL: projectConfig.baseURL,
    BASE_URL: projectConfig.baseURL
  }
});

// JSON-RPC message buffer
let inputBuffer = '';
let outputBuffer = '';

/**
 * Correct URL to use base URL
 */
function correctUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  // Already absolute URL
  if (url.startsWith('http://') || url.startsWith('https://')) {
    // Check if it's trying to use wrong domain/port
    const urlObj = new URL(url);
    const baseUrlObj = new URL(projectConfig.baseURL);
    
    if (urlObj.host !== baseUrlObj.host) {
      console.error(`[MCP Interceptor] Correcting domain: ${url} → ${projectConfig.baseURL}${urlObj.pathname}`);
      return `${projectConfig.baseURL}${urlObj.pathname}${urlObj.search}${urlObj.hash}`;
    }
    return url;
  }
  
  // Relative URL - prepend base URL
  const separator = url.startsWith('/') ? '' : '/';
  const corrected = `${projectConfig.baseURL}${separator}${url}`;
  console.error(`[MCP Interceptor] URL corrected: ${url} → ${corrected}`);
  return corrected;
}

/**
 * Process JSON-RPC request
 */
function processRequest(request) {
  try {
    // Check for navigation-related methods
    if (request.method === 'browser_navigate' || 
        request.method === 'navigate' ||
        request.method === 'goto') {
      
      // Correct the URL
      if (request.params) {
        if (request.params.url) {
          const originalUrl = request.params.url;
          request.params.url = correctUrl(request.params.url);
          
          if (originalUrl !== request.params.url) {
            console.error(`[MCP Interceptor] Navigation corrected: ${originalUrl} → ${request.params.url}`);
          }
        }
        
        // Also check for 'uri' parameter (some versions use this)
        if (request.params.uri) {
          const originalUri = request.params.uri;
          request.params.uri = correctUrl(request.params.uri);
          
          if (originalUri !== request.params.uri) {
            console.error(`[MCP Interceptor] Navigation corrected: ${originalUri} → ${request.params.uri}`);
          }
        }
      }
    }
    
    // Check for evaluate/execute methods that might navigate
    if (request.method === 'evaluate' || request.method === 'browser_evaluate') {
      if (request.params && request.params.code) {
        // Check if code contains navigation
        if (request.params.code.includes('window.location') || 
            request.params.code.includes('location.href')) {
          console.error(`[MCP Interceptor] ⚠️  JavaScript navigation detected - ensure base URL is used`);
        }
      }
    }
    
  } catch (err) {
    console.error(`[MCP Interceptor] Error processing request: ${err.message}`);
  }
  
  return request;
}

/**
 * Parse JSON-RPC messages from stream
 */
function parseJsonRpcStream(data, buffer, callback) {
  buffer += data.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop(); // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        // Try to parse as JSON-RPC
        if (line.includes('Content-Length:')) {
          // LSP-style message, extract content
          continue;
        }
        
        const message = JSON.parse(line);
        callback(message);
      } catch (err) {
        // Not JSON, might be header or other output
        if (line.trim()) {
          process.stderr.write(line + '\n');
        }
      }
    }
  }
  
  return buffer;
}

// Handle stdin (from Claude Code)
process.stdin.on('data', (data) => {
  inputBuffer = parseJsonRpcStream(data, inputBuffer, (message) => {
    // Process and forward request
    const processedMessage = processRequest(message);
    mcpProcess.stdin.write(JSON.stringify(processedMessage) + '\n');
  });
});

// Handle stdout from MCP server
mcpProcess.stdout.on('data', (data) => {
  // Forward responses directly
  process.stdout.write(data);
});

// Handle stderr from MCP server
mcpProcess.stderr.on('data', (data) => {
  process.stderr.write(data);
});

// Handle process termination
mcpProcess.on('exit', (code) => {
  console.error(`[MCP Interceptor] MCP server exited with code ${code}`);
  process.exit(code || 0);
});

// Handle signals
['SIGINT', 'SIGTERM'].forEach(signal => {
  process.on(signal, () => {
    console.error(`[MCP Interceptor] Received ${signal}, shutting down...`);
    mcpProcess.kill(signal);
  });
});

// Initial message
console.error(`[MCP Interceptor] Started with base URL: ${projectConfig.baseURL}`);
console.error(`[MCP Interceptor] All navigation will be corrected to use this base URL`);