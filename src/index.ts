/**
 * claude-playwright
 * Main exports for the Claude-Playwright integration toolkit
 */

// Core exports
export { SessionManager } from './core/session-manager';
export { BrowserProfileManager } from './core/browser-profile';
export { BidirectionalCache } from './core/bidirectional-cache';

// CLI exports (optional for programmatic use)
export { program } from './cli/index';

// Types
export * from './types/cli-types';

// Utils
export { SessionHelper } from './utils/session-helper';
export { MCPIntegration } from './utils/mcp-integration';
export { ProjectPaths } from './utils/project-paths';

// DOM Signature Infrastructure (Phase 2.1)
export { DOMSignatureManager, DOMSignatureUtils } from './utils/dom-signature';
export type { DOMSignatureResult, DOMSignatureOptions, ElementSignature } from './utils/dom-signature';

// Protocol Validation exports (Phase 0)
export { DefaultMCPProtocolValidator, ProtocolError } from './core/protocol-validator';
export { ProtocolValidationLayer } from './core/protocol-validation-layer';
export { ProtocolErrorRecovery } from './core/protocol-error-recovery';

// Tool Naming Revolution exports (Phase 1)
export { ToolNamingStrategy } from './core/tool-naming-strategy';
export { ProgressiveToolLoader } from './core/progressive-tool-loader';

// Enhanced Cache Key System exports (Phase 2.2)
export { EnhancedCacheKeyManager } from './core/enhanced-cache-key';
export { CacheMigrationManager } from './core/cache-migration';
export type { 
  EnhancedCacheKey, 
  CacheKeyComponents, 
  StepsStructureAnalysis, 
  URLPatternComponents 
} from './core/enhanced-cache-key';
export type { 
  MigrationResult, 
  MigrationOptions, 
  EnhancedCacheEntry 
} from './core/cache-migration';

// Context-Aware Similarity System exports (Phase 2.3)
export { ContextAwareSimilarity, SIMILARITY_THRESHOLDS, contextAwareSimilarity } from './core/context-aware-similarity';
export type { SimilarityContext } from './core/context-aware-similarity';
export { SmartNormalizer } from './core/smart-normalizer';
export type { NormalizationResult, InputFeatures } from './core/smart-normalizer';

// Circuit Breaker Foundation exports (Phase 3A)
export { MCPCircuitBreaker, ErrorClassifier, CircuitBreakerOpenError } from './core/circuit-breaker';
export { CircuitBreakerIntegration, withCircuitBreaker, executeProtectedTool } from './core/circuit-breaker-integration';
export type { 
  CircuitBreakerConfig, 
  CircuitBreakerState, 
  ErrorType,
  CircuitBreakerMetrics
} from './core/circuit-breaker';

// Graceful Degradation System exports (Phase 3C)
export { GracefulDegradationManager, DEGRADATION_LEVELS, RECOVERY_STRATEGIES, UX_ENHANCEMENTS } from './core/graceful-degradation';
export { GracefulDegradationIntegration } from './core/graceful-degradation-integration';
export { RecoveryStrategiesManager } from './core/recovery-strategies';
export { SIMPLIFIED_TOOL_REGISTRY, getSimplifiedTool, hasSimplifiedVersion } from './core/simplified-tools';
export type {
  DegradationLevel,
  DegradationLevelConfig,
  DegradationEvent,
  RecoveryStrategy,
  RecoveryAction,
  UXEnhancement,
  DegradationMetrics
} from './core/graceful-degradation';
export type {
  AdaptiveRecoveryStrategy,
  RecoveryExecutionContext,
  RecoveryActionResult,
  RecoveryAttemptRecord
} from './core/recovery-strategies';