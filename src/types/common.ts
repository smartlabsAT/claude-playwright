/**
 * Common type definitions for claude-playwright-toolkit
 */

import { Page, Cookie, BrowserContext } from 'playwright';

// Browser and page related types
export type { Page, Cookie, BrowserContext };

// MCP Tool Response Types - Use SDK's type instead
export type MCPToolResponse = any; // Will be replaced by SDK type

// Cache Statistics Types
export interface CacheStats {
  performance: {
    hitRate: number;
    hits: {
      exact: number;
      normalized: number;
      reverse: number;
      fuzzy: number;
      enhanced: number;
    };
    misses: number;
    totalLookups: number;
  };
  storage: {
    unique_selectors: number;
    total_mappings: number;
    avg_success_count: number;
    avg_inputs_per_selector: number;
    learning_rate: number;
  };
  snapshots: {
    total_snapshots: number;
    total_hits: number;
    avg_hits_per_snapshot: number;
    unique_urls: number;
    unique_profiles: number;
  };
  operations: {
    sets: number;
    learnings: number;
  };
}

export interface SnapshotData {
  html?: string;
  accessibility?: unknown;
  timestamp: number;
  url: string;
  profile?: string;
}

export interface SnapshotMetrics {
  total: number;
  byProfile: Record<string, number>;
  byUrl: Record<string, number>;
  avgHitRate: number;
}

export interface DOMSignatureMetrics {
  total: number;
  critical: number;
  important: number;
  context: number;
  avgElementCounts: {
    critical: number;
    important: number;
    context: number;
  };
}

// Test Scenario Types
export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'assert' | 'screenshot';
  description: string;
  selector?: string;
  value?: string;
  target?: string;
  timeout?: number;
}

export interface TestScenario {
  id?: number;
  name: string;
  description?: string;
  steps: TestStep[];
  pattern_hash?: string;
  url_pattern?: string;
  tags?: string;
  profile?: string;
  success_rate?: number;
  total_runs?: number;
  last_run?: number;
  created_at?: number;
  confidence?: number;
}

// Performance Metrics
export interface PerformanceMetrics {
  duration: number;
  cacheHit: boolean;
  cacheType?: 'exact' | 'normalized' | 'reverse' | 'fuzzy' | 'enhanced';
  retrievalTime?: number;
}

// Session Types
export interface SessionData {
  cookies?: Cookie[];
  origins?: Array<{
    origin: string;
    localStorage: Array<{
      name: string;
      value: string;
    }>;
  }>;
  currentUrl?: string | null;
  timestamp?: number;
}

export interface SessionConfig {
  name: string;
  url?: string;
  profile?: string;
  created: number;
  lastUsed: number;
  expires?: number;
}

// Error Context Types
export interface ErrorContext {
  operation: string;
  selector?: string;
  url?: string;
  text?: string;
  [key: string]: unknown;
}

// CLI Option Types
export interface TestCommandOptions {
  name?: string;
  file?: string;
  tags?: string;
  profile?: string;
  query?: string;
  url?: string;
  limit?: number;
  all?: boolean;
  force?: boolean;
  saveAdapted?: boolean;
  tag?: string;
}

export interface CacheCommandOptions {
  force?: boolean;
  export?: string;
  verbose?: boolean;
}

export interface SessionCommandOptions {
  url?: string;
  profile?: string;
  extend?: boolean;
  health?: boolean;
}