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

// Build environment for MCP server with session
const mcpEnv = {
  ...process.env,
  PLAYWRIGHT_BASE_URL: projectConfig.baseURL,
  BASE_URL: projectConfig.baseURL
};

// Add session to environment if available
if (sessionName) {
  const sessionFile = path.join(sessionsDir, `${sessionName}.json`);
  if (fs.existsSync(sessionFile)) {
    // Read session data and pass through environment
    try {
      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      mcpEnv.PLAYWRIGHT_STORAGE_STATE = JSON.stringify(sessionData);
      console.error(`[MCP Interceptor] Session loaded: ${sessionName}`);
    } catch (err) {
      console.error(`[MCP Interceptor] Failed to load session: ${err.message}`);
    }
  }
}

// Start the actual MCP server - no arguments needed
const mcpProcess = spawn('npx', ['@playwright/mcp'], {
  stdio: ['pipe', 'pipe', 'pipe'],
  env: mcpEnv
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
    // Log all methods for debugging
    if (request.method) {
      console.error(`[MCP Interceptor] Processing method: ${request.method}`);
    }
    
    // ALWAYS check ALL methods for URL parameters
    // Claude might use different method names, so we check everything
    if (request.params) {
      // Deep search for any URL field in params
      function correctUrlsInObject(obj, path = '') {
        if (!obj || typeof obj !== 'object') return;
        
        for (const key in obj) {
          const value = obj[key];
          const currentPath = path ? `${path}.${key}` : key;
          
          // Check if this field might contain a URL
          if ((key === 'url' || key === 'uri' || key === 'href' || key === 'src' || key === 'action') && typeof value === 'string') {
            const originalUrl = value;
            obj[key] = correctUrl(value);
            
            if (originalUrl !== obj[key]) {
              console.error(`[MCP Interceptor] URL corrected at ${currentPath}: ${originalUrl} → ${obj[key]}`);
            }
          }
          
          // Recursively check nested objects
          if (value && typeof value === 'object') {
            correctUrlsInObject(value, currentPath);
          }
        }
      }
      
      // Correct URLs anywhere in params
      correctUrlsInObject(request.params, 'params');
    }
    
    // Also check if it's a tool call (MCP standard)
    if (request.method === 'tools/call' && request.params) {
      if (request.params.name && request.params.name.includes('navigate')) {
        console.error(`[MCP Interceptor] Navigation tool detected: ${request.params.name}`);
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
 * Parse LSP-style messages with Content-Length headers
 */
function parseLSPMessage(data, buffer, onMessage) {
  buffer += data.toString();
  
  while (true) {
    // Look for Content-Length header
    const headerMatch = buffer.match(/Content-Length: (\d+)\r?\n/);
    if (!headerMatch) break;
    
    const contentLength = parseInt(headerMatch[1]);
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;
    
    const messageStart = headerEnd + 4;
    const messageEnd = messageStart + contentLength;
    
    if (buffer.length < messageEnd) break; // Not enough data yet
    
    try {
      const messageText = buffer.substring(messageStart, messageEnd);
      const message = JSON.parse(messageText);
      onMessage(message);
    } catch (err) {
      console.error(`[MCP Interceptor] Failed to parse message: ${err.message}`);
    }
    
    buffer = buffer.substring(messageEnd);
  }
  
  return buffer;
}

/**
 * Format message for LSP transport
 */
function formatLSPMessage(message) {
  const content = JSON.stringify(message);
  const contentLength = Buffer.byteLength(content, 'utf8');
  return `Content-Length: ${contentLength}\r\n\r\n${content}`;
}

// Handle stdin (from Claude Code)
process.stdin.on('data', (data) => {
  inputBuffer = parseLSPMessage(data, inputBuffer, (message) => {
    // Process and forward request
    const processedMessage = processRequest(message);
    const formatted = formatLSPMessage(processedMessage);
    mcpProcess.stdin.write(formatted);
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