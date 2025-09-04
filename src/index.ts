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

// Protocol Validation exports (Phase 0)
export { DefaultMCPProtocolValidator, ProtocolError } from './core/protocol-validator';
export { ProtocolValidationLayer } from './core/protocol-validation-layer';
export { ProtocolErrorRecovery } from './core/protocol-error-recovery';

// Tool Naming Revolution exports (Phase 1)
export { ToolNamingStrategy } from './core/tool-naming-strategy';
export { ProgressiveToolLoader } from './core/progressive-tool-loader';