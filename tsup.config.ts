import { defineConfig } from 'tsup';

export default defineConfig([
  // CLI entry point
  {
    entry: ['src/cli/index.ts'],
    format: ['cjs', 'esm'],
    target: 'node18',
    dts: true,
    sourcemap: true,
    clean: true,
    splitting: false,
    bundle: true, // Bundle dependencies for CLI
    external: ['better-sqlite3', 'playwright', /^node:/], // Keep these external
    noExternal: ['lru-cache', 'chalk', 'commander', 'fs-extra'], // Bundle these
    outDir: 'dist/cli'
  },
  // MCP Server (will be TypeScript soon)
  {
    entry: ['src/mcp/server.ts'],
    format: ['cjs', 'esm'],
    target: 'node18',
    dts: true,
    sourcemap: true,
    clean: false, // Don't clean since CLI already did
    splitting: false,
    bundle: true, // Bundle local dependencies
    external: ['@modelcontextprotocol/sdk', 'playwright', 'zod', 'better-sqlite3', /^node:/],
    noExternal: ['lru-cache', 'chalk', 'fs-extra'],
    outDir: 'dist/mcp',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js'
      };
    }
  },
  // Main library exports
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    target: 'node18',
    dts: true,
    sourcemap: true,
    clean: false,
    splitting: false,
    outDir: 'dist',
    outExtension({ format }) {
      return {
        js: format === 'cjs' ? '.cjs' : '.js'
      };
    }
  }
]);