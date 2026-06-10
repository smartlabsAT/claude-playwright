#!/usr/bin/env node
/**
 * claude-playwright MCP server (proxy).
 *
 * Architecture:
 *  - Speaks MCP over stdio with the calling client (e.g. Claude Code).
 *  - Routes `tools/list` and `tools/call` between an empty local-tool registry
 *    (populated in Epic 3) and the upstream `@playwright/mcp` subprocess.
 *  - Owns the upstream subprocess lifecycle and forwards SIGINT/SIGTERM.
 *
 * Tool-name collision policy:
 *  - Local tools win over upstream tools with the same name.
 *  - In Epic 1 the local registry is empty, so all calls forward upstream.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { UpstreamClient } from './upstream-client.js';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

interface LocalTool {
  definition: Tool;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Local-tool registry. Empty in Epic 1; Epic 3 populates this with
 * session/test/cache tools that the upstream doesn't know about.
 */
const LOCAL_TOOLS: LocalTool[] = [];

function buildLocalToolIndex(): Map<string, LocalTool> {
  const index = new Map<string, LocalTool>();
  for (const tool of LOCAL_TOOLS) {
    index.set(tool.definition.name, tool);
  }
  return index;
}

async function main(): Promise<void> {
  const upstream = new UpstreamClient();
  const localIndex = buildLocalToolIndex();

  const server = new Server(
    {
      name: PACKAGE_NAME,
      version: PACKAGE_VERSION
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // Surface upstream errors instead of silently degrading to a (possibly
    // empty) local-only list — a caller would otherwise mistake an unreachable
    // upstream for "no tools available". The MCP SDK converts thrown errors
    // into proper error responses so the client can retry or diagnose.
    const upstreamDefs = await upstream.listTools();
    const localDefs = LOCAL_TOOLS.map((t) => t.definition);
    const localNames = new Set(localDefs.map((t) => t.name));
    // Local tools win on name collision.
    return {
      tools: [
        ...localDefs,
        ...upstreamDefs.filter((t) => !localNames.has(t.name))
      ]
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const local = localIndex.get(name);
    if (local) {
      const result = await local.handler(args ?? {});
      return result as Awaited<ReturnType<typeof local.handler>> as never;
    }
    return (await upstream.callTool(name, args)) as never;
  });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`[Proxy] received ${signal}, shutting down`);
    try {
      await upstream.stop();
    } catch (err) {
      console.error('[Proxy] upstream stop failed:', err);
    }
    try {
      await server.close();
    } catch (err) {
      console.error('[Proxy] server close failed:', err);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[Proxy] claude-playwright MCP server ready');
}

main().catch((err) => {
  console.error('[Proxy] fatal error:', err);
  process.exit(1);
});
