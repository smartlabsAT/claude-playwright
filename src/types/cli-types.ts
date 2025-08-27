import { BrowserProfile, ProfileSummary } from '../core/browser-profile';
import { SessionData, SessionListItem } from '../core/session-manager';

/**
 * Command line interface types for session and profile management
 */

// Session Commands Types
export interface SessionCommandOptions {
  dir?: string;
  profile?: string;
  metadata?: SessionMetadata;
  extend?: boolean;
}

export interface SessionMetadata {
  url?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
  description?: string;
  tags?: string[];
  environment?: 'dev' | 'staging' | 'prod';
}

export interface SessionSaveOptions extends SessionCommandOptions {
  browserProfile?: string;
  metadata?: SessionMetadata;
  storageState?: StorageState;  // Made optional since it can be created by the save function
}

export interface SessionLoadResult {
  storageState: StorageState;
  metadata?: SessionMetadata;
  profile?: string;
}

export interface SessionListOptions {
  dir?: string;
  filter?: 'all' | 'valid' | 'expired';
  format?: 'table' | 'json' | 'csv';
}

// Profile Commands Types  
export interface ProfileCommandOptions {
  dir?: string;
  role?: string;
  description?: string;
  environment?: 'dev' | 'staging' | 'prod';
  template?: string;
}

export interface ProfileCreateOptions extends ProfileCommandOptions {
  name?: string;  // Made optional since it can be provided as parameter
  role?: string;  // Made optional since it can be provided via options
  settings?: BrowserProfileSettings;
  metadata?: ProfileMetadata;
}

export interface BrowserProfileSettings {
  userAgent?: string;
  viewport?: { width: number; height: number };
  locale?: string;
  timezone?: string;
  permissions?: string[];
  cookies?: CookieData[];
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

export interface ProfileMetadata {
  tags?: string[];
  environment?: 'dev' | 'staging' | 'prod';
  baseUrl?: string;
  description?: string;
  team?: string;
  version?: string;
  associatedSessions?: string[];
}

export interface ProfileListOptions {
  dir?: string;
  role?: string;
  environment?: string;
  format?: 'table' | 'json' | 'csv';
}

// Scaffold Generator Types
export interface ScaffoldOptions {
  path?: string;
  template?: string;
  overwrite?: boolean;
  dryRun?: boolean;
}

export interface ScaffoldPageOptions extends ScaffoldOptions {
  extends?: string;
  selectors?: string[];
  actions?: string[];
  assertions?: string[];
}

export interface ScaffoldTestOptions extends ScaffoldOptions {
  fixture?: string;
  tags?: string[];
  describe?: string;
  parallel?: boolean;
}

export interface ScaffoldFixtureOptions extends ScaffoldOptions {
  type?: 'auth' | 'data' | 'api' | 'custom';
  dependencies?: string[];
  shared?: boolean;
}

// Storage State Types
export interface StorageState {
  cookies: CookieData[];
  origins: OriginData[];
}

export interface CookieData {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

export interface OriginData {
  origin: string;
  localStorage: Array<{ name: string; value: string }>;
  sessionStorage: Array<{ name: string; value: string }>;
}

// Command Execution Types
export interface CommandResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  warnings?: string[];
  metadata?: {
    executionTime?: number;
    affectedFiles?: string[];
    createdDirectories?: string[];
  };
}

export interface CommandContext {
  workingDir: string;
  verbose?: boolean;
  dryRun?: boolean;
  force?: boolean;
}

// Template and Generation Types
export interface TemplateContext {
  projectName: string;
  templateType: string;
  variables: Record<string, string>;
  features: string[];
}

export interface GeneratorOptions {
  targetPath: string;
  templatePath: string;
  context: TemplateContext;
  overwrite?: boolean;
  backup?: boolean;
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  suggestion?: string;
}

// CLI Action Types
export type SessionAction = 'list' | 'save' | 'load' | 'delete' | 'clear' | 'extend' | 'info';
export type ProfileAction = 'list' | 'create' | 'delete' | 'update' | 'setup' | 'export' | 'import';
export type ScaffoldType = 'page' | 'test' | 'fixture' | 'component' | 'helper';

// Export commonly used types from core modules
export type { BrowserProfile, ProfileSummary } from '../core/browser-profile';
export type { SessionData, SessionListItem } from '../core/session-manager';