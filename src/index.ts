/**
 * claude-playwright
 * Main exports for the Claude-Playwright integration toolkit
 */

// Core exports
export { SessionManager } from './core/session-manager';
export { BrowserProfileManager } from './core/browser-profile';

// CLI exports (optional for programmatic use)
export { program } from './cli/index';

// Types
export * from './types/cli-types';

// Utils
export { SessionHelper } from './utils/session-helper';
export { MCPIntegration } from './utils/mcp-integration';
export { ProjectPaths } from './utils/project-paths';