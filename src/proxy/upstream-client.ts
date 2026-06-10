/**
 * Upstream client — wraps the @playwright/mcp subprocess as an MCP client.
 *
 * Lifecycle:
 *  - `start()` spawns the subprocess (lazy; first request triggers it).
 *  - `transport.onclose` schedules a restart with a rate limit (max 5 per 60s).
 *  - `stop()` sets `intentionalShutdown` to suppress restart, then closes the client.
 *  - `restartWith(options)` is exposed for Epic 3 (session/profile changes).
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs';
import path from 'node:path';
import { PACKAGE_NAME, PACKAGE_VERSION } from './version.js';

export interface UpstreamOptions {
  /** Path to a Playwright storage-state JSON file (cookies, localStorage, etc.). */
  storageState?: string;
  /** Device name from Playwright's `devices` (e.g. "iPhone 15", "Pixel 7"). */
  device?: string;
  /** Viewport size as "WIDTHxHEIGHT" (e.g. "1280x720"). */
  viewportSize?: string;
}

/**
 * Resolve the @playwright/mcp CLI entry through Node's module resolver.
 * Works around the package's strict `exports` field by resolving `package.json`
 * (which IS exported) and deriving the sibling `cli.js` path.
 */
function resolveUpstreamCli(): string {
  if (process.env.PLAYWRIGHT_MCP_CLI_PATH) {
    const envPath = process.env.PLAYWRIGHT_MCP_CLI_PATH;
    if (!fs.existsSync(envPath)) {
      throw new Error(
        `[Upstream] PLAYWRIGHT_MCP_CLI_PATH points to "${envPath}" but that file does not exist. ` +
          `Fix the variable or unset it to fall back to npm package resolution.`
      );
    }
    return envPath;
  }
  // `require.resolve` is available in CJS at runtime; tsup polyfills it in the
  // ESM bundle output. We resolve the package.json (which IS in `exports`) and
  // derive the sibling `cli.js`, side-stepping the strict `exports` field.
  let pkgPath: string;
  try {
    pkgPath = require.resolve('@playwright/mcp/package.json');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException | undefined)?.code;
    if (code === 'MODULE_NOT_FOUND' || code === 'ERR_MODULE_NOT_FOUND') {
      throw new Error(
        '[Upstream] Cannot find @playwright/mcp. claude-playwright depends on @playwright/mcp@0.0.75 — ' +
          'it should normally install automatically. If installation was skipped, run ' +
          '`npm install @playwright/mcp@0.0.75`, or set PLAYWRIGHT_MCP_CLI_PATH to the full path of cli.js.'
      );
    }
    throw err;
  }
  const cliPath = path.join(path.dirname(pkgPath), 'cli.js');
  if (!fs.existsSync(cliPath)) {
    throw new Error(
      `[Upstream] Found @playwright/mcp at ${path.dirname(pkgPath)} but cli.js is missing — ` +
        'the package may be corrupted. Try `npm install @playwright/mcp@0.0.75` to reinstall.'
    );
  }
  return cliPath;
}

export class UpstreamClient {
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private started = false;
  private starting: Promise<void> | null = null;
  private intentionalShutdown = false;
  private restartTimestamps: number[] = [];
  private restartTimer: NodeJS.Timeout | null = null;
  private readonly maxRestartsPerWindow = 5;
  private readonly restartWindowMs = 60_000;
  private options: UpstreamOptions = {};

  /** Lazily start on first use; idempotent. */
  async ensureStarted(): Promise<void> {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = this.start().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async start(): Promise<void> {
    if (this.started) return;
    this.intentionalShutdown = false;

    const cliPath = resolveUpstreamCli();
    const args = [cliPath, ...this.buildCliArgs(this.options)];

    this.transport = new StdioClientTransport({
      command: 'node',
      args
    });

    this.transport.onclose = () => {
      this.handleTransportClose();
    };

    this.client = new Client(
      { name: PACKAGE_NAME, version: PACKAGE_VERSION },
      { capabilities: {} }
    );

    await this.client.connect(this.transport);
    this.started = true;

    console.error(`[Upstream] connected (cli=${cliPath})`);
  }

  /** Build CLI flags for the spawned subprocess based on current options. */
  private buildCliArgs(options: UpstreamOptions): string[] {
    const args: string[] = [];
    if (options.storageState) {
      args.push('--storage-state', options.storageState);
    }
    if (options.device) {
      args.push('--device', options.device);
    }
    if (options.viewportSize) {
      args.push('--viewport-size', options.viewportSize);
    }
    return args;
  }

  /** Clean shutdown — sets the flag so any pending close event won't restart. */
  async stop(): Promise<void> {
    this.intentionalShutdown = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const client = this.client;
    const transport = this.transport;
    this.client = null;
    this.transport = null;
    this.started = false;
    // Detach the stale onclose so the old transport's late close event
    // doesn't trigger `handleTransportClose` on this instance after stop().
    if (transport) {
      transport.onclose = undefined;
    }
    if (client) {
      try {
        await client.close();
      } catch {
        // ignore — process may already be gone
      }
    }
  }

  /**
   * Restart with new options. Used by Epic 3 to switch sessions/profiles.
   * In Epic 1 this is exposed but not wired to any tool.
   *
   * TODO (Epic 3): guard against a concurrent `listTools()`/`callTool()` call
   * that runs `ensureStarted()` between `stop()` and `ensureStarted()` here.
   * The current single-flight `starting` promise covers a single in-flight
   * `start()`, but a parallel caller could begin a start() before this method's
   * `await this.stop()` returns — needs a transition-state flag (e.g.
   * `transitioning: 'idle' | 'stopping' | 'restarting'`) or a small mutex.
   */
  async restartWith(options: UpstreamOptions): Promise<void> {
    this.options = { ...options };
    await this.stop();
    await this.ensureStarted();
  }

  async listTools(): Promise<Tool[]> {
    await this.ensureStarted();
    if (!this.client) {
      throw new Error('[Upstream] client is null after ensureStarted');
    }
    const result = await this.client.listTools();
    return result.tools as Tool[];
  }

  async callTool(name: string, args: Record<string, unknown> | undefined): Promise<unknown> {
    await this.ensureStarted();
    if (!this.client) {
      throw new Error('[Upstream] client is null after ensureStarted');
    }
    return await this.client.callTool({ name, arguments: args ?? {} });
  }

  /**
   * Handle unexpected transport close. Triggers a rate-limited restart unless
   * `intentionalShutdown` is set.
   */
  private handleTransportClose(): void {
    if (this.intentionalShutdown) {
      return;
    }
    console.error('[Upstream] subprocess transport closed unexpectedly');
    this.started = false;
    this.client = null;
    this.transport = null;

    const now = Date.now();
    this.restartTimestamps = this.restartTimestamps.filter(
      (t) => now - t < this.restartWindowMs
    );

    if (this.restartTimestamps.length >= this.maxRestartsPerWindow) {
      console.error(
        `[Upstream] restart rate limit exceeded (${this.maxRestartsPerWindow} per ${this.restartWindowMs / 1000}s) — exiting`
      );
      process.exit(1);
    }

    this.restartTimestamps.push(now);
    const attempt = this.restartTimestamps.length;

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      console.error(`[Upstream] restart attempt ${attempt}/${this.maxRestartsPerWindow}`);
      this.start().catch((err) => {
        console.error('[Upstream] restart failed:', err);
      });
    }, 500 * attempt); // small backoff per attempt
  }
}
