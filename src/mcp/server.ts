#!/usr/bin/env node
// Backward-compat shim for existing .mcp.json entries pointing at dist/mcp/server.cjs.
// The actual server lives in src/proxy/proxy-server.ts.
import '../proxy/proxy-server.js';
