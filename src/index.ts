/**
 * claude-playwright
 * Main exports for the Claude-Playwright integration toolkit
 */

// Core exports
export { SessionManager } from './core/session-manager';
export { BrowserProfileManager } from './core/browser-profile';
export { BidirectionalCache } from './core/bidirectional-cache';

// Note: CLI program is not exported to avoid automatic execution
// For CLI usage, use the bin entry point or import './cli/index' directly

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

// Security Validation exports
export { SecurityValidator } from './core/security-validator';

// Retry and Error Handling exports
export { RetryHelper } from './core/retry-helper';
export type { RetryConfig } from './core/retry-helper';
export { ErrorHelper } from './utils/error-helper';
export type { ErrorContext, UserFriendlyError } from './utils/error-helper';

// Automated Testing & Performance Validation Suite exports (Phase 4)
export { PerformanceBenchmark } from './core/performance-monitor';
export type { 
  PerformanceMetrics, 
  ConsistencyMetrics, 
  CacheMetrics, 
  ErrorRecoveryMetrics, 
  BenchmarkResults, 
  CrossEnvironmentMetrics 
} from './core/performance-monitor';

export { FeatureFlagManager } from './core/feature-flag-manager';
export type { 
  FeatureFlagConfig, 
  FeatureFlagMetrics, 
  RolloutStrategy
} from './core/feature-flag-manager';

export { TestOrchestrator } from './core/test-orchestrator';
export type { 
  TestResults, 
  E2EResults, 
  FeatureFlagResults, 
  ValidationReport 
} from './core/test-orchestrator';

export { ValidationReporter } from './core/validation-reporter';
export type { 
  ReportConfig, 
  HistoricalComparison 
} from './core/validation-reporter';