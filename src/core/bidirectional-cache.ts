import Database from 'better-sqlite3';
import { SmartNormalizer, NormalizationResult } from './smart-normalizer.js';
import { DOMSignatureManager, DOMSignatureResult, DOMSignatureUtils } from '../utils/dom-signature.js';
import { EnhancedCacheKeyManager, EnhancedCacheKey, CacheKeyComponents, TestStep } from './enhanced-cache-key.js';
import { CacheMigrationManager, EnhancedCacheEntry } from './cache-migration.js';
import crypto from 'crypto';
import * as path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';
import * as fs from 'fs';
import type { Page } from 'playwright';
import type { CacheStats, SnapshotData, SnapshotMetrics, DOMSignatureMetrics } from '../types/common.js';

interface SelectorCacheEntry {
  id?: number;
  selector: string;
  selector_hash: string;
  url: string;
  confidence: number;
  created_at: number;
  last_used: number;
  use_count: number;
}

interface InputMappingEntry {
  id?: number;
  selector_hash: string;
  input: string;
  normalized_input: string;
  input_tokens: string; // JSON array
  url: string;
  success_count: number;
  last_used: number;
  confidence: number;
  learned_from: 'direct' | 'inferred' | 'pattern';
}

interface CacheOptions {
  maxSizeMB?: number;
  selectorTTL?: number;
  snapshotTTL?: number;
  cleanupInterval?: number;
  maxVariationsPerSelector?: number;
}

interface LookupResult {
  selector: string;
  confidence: number;
  source: 'exact' | 'normalized' | 'reverse' | 'fuzzy';
  cached: boolean;
}

interface SnapshotCacheEntry {
  id?: number;
  cache_key: string;
  url: string;
  dom_hash: string;
  snapshot_data: string;
  viewport_width?: number;
  viewport_height?: number;
  profile?: string;
  created_at: number;
  last_used: number;
  ttl: number;
  hit_count: number;
}

interface TestScenarioEntry {
  id?: number;
  name: string;
  description?: string;
  steps_json: string;
  pattern_hash: string;
  url_pattern: string;
  tags?: string;
  profile?: string;
  success_rate: number;
  total_runs: number;
  last_run?: number;
  last_adapted?: number;
  created_at: number;
  confidence: number;
}

interface TestExecutionEntry {
  id?: number;
  scenario_id: number;
  status: 'success' | 'failure' | 'partial' | 'adapted';
  execution_time: number;
  selector_adaptations?: string;
  error_details?: string;
  snapshot_id?: string;
  confidence_score?: number;
  profile?: string;
  url: string;
  timestamp: number;
}

interface TestPatternEntry {
  id?: number;
  interaction_type: string;
  element_patterns: string;
  success_indicators: string;
  adaptation_rules: string;
  pattern_hash: string;
  confidence: number;
  success_count: number;
  total_count: number;
  learned_from: 'direct' | 'inferred' | 'pattern';
  created_at: number;
  last_used: number;
}

// TestStep interface imported from enhanced-cache-key.js

interface TestScenario {
  name: string;
  description?: string;
  steps: TestStep[];
  tags?: string[];
  urlPattern: string;
  profile?: string;
}

export class BidirectionalCache {
  protected db: Database.Database;
  protected normalizer: SmartNormalizer;
  private domSignatureManager: DOMSignatureManager;
  private enhancedKeyManager: EnhancedCacheKeyManager;
  private migrationManager: CacheMigrationManager;
  private cleanupTimer?: NodeJS.Timeout;
  private options: Required<CacheOptions>;
  private cacheDir: string;
  private stats = {
    hits: { exact: 0, normalized: 0, reverse: 0, fuzzy: 0, enhanced: 0 },
    misses: 0,
    sets: 0,
    learnings: 0,
    migrations: 0
  };

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxSizeMB: options.maxSizeMB ?? 50,
      selectorTTL: options.selectorTTL ?? 300000, // 5 minutes
      snapshotTTL: options.snapshotTTL ?? 1800000, // 30 minutes
      cleanupInterval: options.cleanupInterval ?? 60000, // 1 minute
      maxVariationsPerSelector: options.maxVariationsPerSelector ?? 20
    };

    this.normalizer = new SmartNormalizer();
    this.domSignatureManager = new DOMSignatureManager();
    this.enhancedKeyManager = new EnhancedCacheKeyManager();
    
    // Create cache directory
    this.cacheDir = ProjectPaths.getCacheDir();
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Initialize database
    const dbPath = path.join(this.cacheDir, 'bidirectional-cache.db');

    // Check for existing database and perform integrity check
    if (fs.existsSync(dbPath)) {
      try {
        this.db = new Database(dbPath);
        const integrityCheck = this.db.pragma('integrity_check');
        if (integrityCheck !== 'ok') {
          console.error('[Cache] Database corruption detected, creating backup and rebuilding...');
          const backupPath = `${dbPath}.corrupted.${Date.now()}`;
          fs.renameSync(dbPath, backupPath);
          console.error(`[Cache] Corrupted database backed up to: ${backupPath}`);
          this.db = new Database(dbPath);
        }
      } catch (error) {
        console.error('[Cache] Database initialization failed, creating new database:', error);
        const backupPath = `${dbPath}.error.${Date.now()}`;
        try {
          fs.renameSync(dbPath, backupPath);
        } catch (renameError) {
          console.error('[Cache] Could not backup corrupted database:', renameError);
        }
        this.db = new Database(dbPath);
      }
    } else {
      this.db = new Database(dbPath);
    }

    // Configure for maximum durability (prevents corruption)
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = FULL');  // Changed from NORMAL to FULL for corruption prevention
    this.db.pragma('wal_autocheckpoint = 1000');  // Checkpoint every 1000 pages
    
    // Initialize migration manager
    this.migrationManager = new CacheMigrationManager(this.db);
    
    this.initializeDatabase();
    this.performMigrationIfNeeded();
    this.startCleanupTimer();
  }

  // Transaction helpers
  private beginTransaction = () => this.db.prepare('BEGIN IMMEDIATE').run();
  private commitTransaction = () => this.db.prepare('COMMIT').run();
  private rollbackTransaction = () => this.db.prepare('ROLLBACK').run();

  // Execute database operation in a transaction
  private executeInTransaction<T>(operation: () => T, operationName: string = 'database operation'): T {
    try {
      this.beginTransaction();
      const result = operation();
      this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      console.error(`[Cache] Transaction failed for ${operationName}:`, error);
      throw error;
    }
  }

  private initializeDatabase(): void {
    // Create tables separately to avoid exec() issues
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS selector_cache_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        selector TEXT NOT NULL,
        selector_hash TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL,
        use_count INTEGER DEFAULT 1
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS input_mappings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        selector_hash TEXT NOT NULL,
        input TEXT NOT NULL,
        normalized_input TEXT NOT NULL,
        input_tokens TEXT NOT NULL,
        url TEXT NOT NULL,
        success_count INTEGER DEFAULT 1,
        last_used INTEGER NOT NULL,
        confidence REAL DEFAULT 0.5,
        learned_from TEXT DEFAULT 'direct',
        FOREIGN KEY (selector_hash) REFERENCES selector_cache_v2(selector_hash),
        UNIQUE(selector_hash, normalized_input, url)
      );
    `);

    // Create indexes separately
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_selector_hash_v2 ON selector_cache_v2(selector_hash);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_url_v2 ON selector_cache_v2(url);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_input_normalized ON input_mappings(normalized_input, url);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_mapping_selector_hash ON input_mappings(selector_hash);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_url_selector ON input_mappings(url, selector_hash);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_tokens ON input_mappings(input_tokens);`);

    // Create snapshot cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshot_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL UNIQUE,
        url TEXT NOT NULL,
        dom_hash TEXT NOT NULL,
        snapshot_data TEXT NOT NULL,
        viewport_width INTEGER,
        viewport_height INTEGER,
        profile TEXT,
        created_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL,
        ttl INTEGER NOT NULL,
        hit_count INTEGER DEFAULT 0
      );
    `);

    // Create snapshot indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshot_url ON snapshot_cache(url);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshot_profile ON snapshot_cache(profile);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshot_created ON snapshot_cache(created_at);`);

    // Test scenarios table for intelligent test persistence
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_scenarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT,
        steps_json TEXT NOT NULL,
        pattern_hash TEXT NOT NULL,
        url_pattern TEXT NOT NULL,
        tags TEXT,
        profile TEXT,
        success_rate REAL DEFAULT 1.0,
        total_runs INTEGER DEFAULT 0,
        last_run INTEGER,
        last_adapted INTEGER,
        created_at INTEGER NOT NULL,
        confidence REAL DEFAULT 0.8
      );
    `);

    // Test executions for learning and adaptation
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_executions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id INTEGER NOT NULL,
        status TEXT NOT NULL,
        execution_time INTEGER NOT NULL,
        selector_adaptations TEXT,
        error_details TEXT,
        snapshot_id TEXT,
        confidence_score REAL,
        profile TEXT,
        url TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (scenario_id) REFERENCES test_scenarios(id)
      );
    `);

    // Test patterns for automatic recognition and matching
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS test_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        interaction_type TEXT NOT NULL,
        element_patterns TEXT NOT NULL,
        success_indicators TEXT NOT NULL,
        adaptation_rules TEXT NOT NULL,
        pattern_hash TEXT NOT NULL UNIQUE,
        confidence REAL DEFAULT 0.7,
        success_count INTEGER DEFAULT 1,
        total_count INTEGER DEFAULT 1,
        learned_from TEXT DEFAULT 'direct',
        created_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL
      );
    `);

    // Create test-related indexes for performance
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_pattern_hash ON test_scenarios(pattern_hash);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_url_pattern ON test_scenarios(url_pattern);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_profile ON test_scenarios(profile);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_test_tags ON test_scenarios(tags);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_execution_scenario ON test_executions(scenario_id);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_execution_status ON test_executions(status);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pattern_type ON test_patterns(interaction_type);`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_pattern_hash_unique ON test_patterns(pattern_hash);`);

    // DOM Signature schema extensions (Phase 2.1)
    try {
      // Add DOM signature columns to selector_cache_v2 if they don't exist
      this.db.exec(`ALTER TABLE selector_cache_v2 ADD COLUMN dom_signature TEXT;`);
      console.error('[BidirectionalCache] Added dom_signature column to selector_cache_v2');
    } catch (error) {
      // Column already exists or other error - ignore
    }

    try {
      // Add DOM signature columns to snapshot_cache if they don't exist  
      this.db.exec(`ALTER TABLE snapshot_cache ADD COLUMN dom_signature TEXT;`);
      this.db.exec(`ALTER TABLE snapshot_cache ADD COLUMN critical_hash TEXT;`);
      this.db.exec(`ALTER TABLE snapshot_cache ADD COLUMN important_hash TEXT;`);
      this.db.exec(`ALTER TABLE snapshot_cache ADD COLUMN context_hash TEXT;`);
      console.error('[BidirectionalCache] Added DOM signature columns to snapshot_cache');
    } catch (error) {
      // Columns already exist or other error - ignore
    }

    // Create DOM signature indexes for performance
    try {
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_selector_dom_signature ON selector_cache_v2(dom_signature);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshot_dom_signature ON snapshot_cache(dom_signature);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshot_critical_hash ON snapshot_cache(critical_hash);`);
      this.db.exec(`CREATE INDEX IF NOT EXISTS idx_snapshot_important_hash ON snapshot_cache(important_hash);`);
    } catch (error) {
      // Index creation errors - ignore
    }

    // Migration from old cache if exists
    try {
      const tableExists = this.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cache'").get();
      if (tableExists) {
        this.db.exec(`
          INSERT OR IGNORE INTO selector_cache_v2 (selector, selector_hash, url, confidence, created_at, last_used)
          SELECT data as selector, 
                 substr(cache_key, 1, 32) as selector_hash,
                 url,
                 0.5 as confidence,
                 created_at,
                 accessed_at as last_used
          FROM cache 
          WHERE cache_type = 'selector';
        `);

        // Migrate snapshot data
        this.db.exec(`
          INSERT OR IGNORE INTO snapshot_cache (cache_key, url, dom_hash, snapshot_data, created_at, last_used, ttl, profile)
          SELECT cache_key,
                 url,
                 'migrated' as dom_hash,
                 data as snapshot_data,
                 created_at,
                 accessed_at as last_used,
                 ttl,
                 profile
          FROM cache
          WHERE cache_type = 'snapshot';
        `);
        console.error('[BidirectionalCache] Migrated data from old cache table');
      }
    } catch (error) {
      // Migration optional - table might not exist yet
      console.error('[BidirectionalCache] Migration skipped (old cache not found):', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Perform migration to enhanced cache key system if needed
   */
  private async performMigrationIfNeeded(): Promise<void> {
    try {
      if (this.migrationManager.isMigrationNeeded()) {
        console.error('[BidirectionalCache] Enhanced cache key migration required, starting...');
        
        const result = await this.migrationManager.performMigration({
          batchSize: 500,
          retryFailures: true,
          preserveOldData: true,
          validateAfterMigration: true,
          dryRun: false
        });

        if (result.success) {
          console.error(`[BidirectionalCache] Migration completed: ${result.migrated} entries migrated in ${result.duration}ms`);
          this.stats.migrations = result.migrated;
        } else {
          console.error(`[BidirectionalCache] Migration failed: ${result.errors} errors, ${result.migrated} entries migrated`);
        }
      } else {
        console.error('[BidirectionalCache] Enhanced cache key system already up to date');
      }
    } catch (error) {
      console.error('[BidirectionalCache] Migration check/execution failed:', error);
    }
  }

  /**
   * Enhanced cache key storage - stores using both legacy and enhanced keys
   */
  async setEnhanced(
    testName: string,
    input: string, 
    url: string, 
    selector: string, 
    steps?: TestStep[],
    profile: string = 'default',
    page?: Page
  ): Promise<void> {
    const now = Date.now();
    
    try {
      // Generate DOM signature if page is available
      let domSignature: string | undefined;
      if (page) {
        try {
          const signature = await this.domSignatureManager.generateSignature(page, url);
          domSignature = signature.fullSignature;
        } catch (error) {
          console.error('[BidirectionalCache] DOM signature generation failed:', error);
        }
      }

      // Generate enhanced cache key components
      const keyComponents = this.enhancedKeyManager.generateCacheKeyComponents(
        testName,
        url,
        domSignature,
        steps,
        profile
      );

      // Store in enhanced cache key table
      const enhancedEntry: EnhancedCacheEntry = {
        enhanced_key: this.enhancedKeyManager.serializeEnhancedKey(keyComponents.enhancedKey),
        base_key_hash: keyComponents.baseKey,
        legacy_key_hash: keyComponents.legacyKey,
        test_name_normalized: keyComponents.enhancedKey.test_name_normalized,
        url_pattern: keyComponents.enhancedKey.url_pattern,
        dom_signature: keyComponents.enhancedKey.dom_signature,
        steps_structure_hash: keyComponents.enhancedKey.steps_structure_hash,
        profile: keyComponents.enhancedKey.profile,
        version: keyComponents.enhancedKey.version,
        selector: selector,
        confidence: 0.8, // Higher confidence for enhanced keys
        created_at: now,
        last_used: now,
        use_count: 1,
        migration_source: 'enhanced'
      };

      const insertStmt = this.db.prepare(`
        INSERT OR REPLACE INTO cache_keys_v2 (
          enhanced_key, base_key_hash, legacy_key_hash, test_name_normalized,
          url_pattern, dom_signature, steps_structure_hash, profile, version,
          selector, confidence, created_at, last_used, use_count, migration_source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      insertStmt.run(
        enhancedEntry.enhanced_key,
        enhancedEntry.base_key_hash,
        enhancedEntry.legacy_key_hash,
        enhancedEntry.test_name_normalized,
        enhancedEntry.url_pattern,
        enhancedEntry.dom_signature,
        enhancedEntry.steps_structure_hash,
        enhancedEntry.profile,
        enhancedEntry.version,
        enhancedEntry.selector,
        enhancedEntry.confidence,
        enhancedEntry.created_at,
        enhancedEntry.last_used,
        enhancedEntry.use_count,
        enhancedEntry.migration_source
      );

      // Also store in legacy format for backward compatibility
      await this.set(input, url, selector);

      console.error(`[BidirectionalCache] Enhanced entry stored: ${testName} → ${selector} (pattern: ${keyComponents.enhancedKey.url_pattern})`);

    } catch (error) {
      console.error('[BidirectionalCache] Enhanced set failed:', error);
      throw error;
    }
  }

  /**
   * Enhanced cache key lookup with pattern matching and cross-environment support
   */
  async getEnhanced(
    testName: string,
    url: string,
    steps?: TestStep[],
    profile: string = 'default',
    page?: Page
  ): Promise<LookupResult | null> {
    try {
      // Generate DOM signature if page is available
      let domSignature: string | undefined;
      if (page) {
        try {
          const signature = await this.domSignatureManager.generateSignature(page, url);
          domSignature = signature.fullSignature;
        } catch (error) {
          console.error('[BidirectionalCache] DOM signature generation failed during lookup:', error);
        }
      }

      // Generate enhanced cache key for lookup
      const keyComponents = this.enhancedKeyManager.generateCacheKeyComponents(
        testName,
        url,
        domSignature,
        steps,
        profile
      );

      // Try exact enhanced key match first
      const exactMatch = this.db.prepare(`
        SELECT * FROM cache_keys_v2 
        WHERE base_key_hash = ?
      `).get(keyComponents.baseKey) as EnhancedCacheEntry | undefined;

      if (exactMatch) {
        this.updateLastUsed(exactMatch.id!);
        this.stats.hits.enhanced++;
        
        console.error(`[BidirectionalCache] Enhanced exact match: ${testName} → ${exactMatch.selector}`);
        
        return {
          selector: exactMatch.selector,
          confidence: exactMatch.confidence,
          source: 'exact',
          cached: true
        };
      }

      // Try pattern-based matching
      const patternMatch = await this.findBestEnhancedMatch(keyComponents.enhancedKey);
      if (patternMatch) {
        this.updateLastUsed(patternMatch.id!);
        this.stats.hits.enhanced++;
        
        console.error(`[BidirectionalCache] Enhanced pattern match: ${testName} → ${patternMatch.selector} (similarity: ${patternMatch.similarity?.toFixed(3)})`);
        
        return {
          selector: patternMatch.selector,
          confidence: patternMatch.confidence * (patternMatch.similarity || 0.8),
          source: 'exact', // Treat pattern matches as exact for enhanced system
          cached: true
        };
      }

      // Fallback to legacy lookup
      const legacyResult = await this.get(testName, url);
      if (legacyResult) {
        console.error(`[BidirectionalCache] Enhanced fallback to legacy: ${testName} → ${legacyResult.selector}`);
        return legacyResult;
      }

      this.stats.misses++;
      return null;

    } catch (error) {
      console.error('[BidirectionalCache] Enhanced lookup failed:', error);
      return null;
    }
  }

  /**
   * Find best matching enhanced cache entry using pattern similarity
   */
  private async findBestEnhancedMatch(targetKey: EnhancedCacheKey): Promise<(EnhancedCacheEntry & { similarity?: number }) | null> {
    try {
      // Get candidates with similar URL patterns
      const candidates = this.db.prepare(`
        SELECT * FROM cache_keys_v2 
        WHERE url_pattern = ? OR profile = ?
        ORDER BY last_used DESC, confidence DESC
        LIMIT 50
      `).all(targetKey.url_pattern, targetKey.profile) as EnhancedCacheEntry[];

      let bestMatch: (EnhancedCacheEntry & { similarity?: number }) | null = null;
      let bestSimilarity = 0.6; // Minimum threshold

      for (const candidate of candidates) {
        try {
          const candidateKey = this.enhancedKeyManager.parseEnhancedKey(candidate.enhanced_key);
          if (!candidateKey) continue;

          const similarity = this.enhancedKeyManager.calculateKeySimilarity(targetKey, candidateKey);
          
          if (similarity > bestSimilarity) {
            bestMatch = { ...candidate, similarity };
            bestSimilarity = similarity;
          }

        } catch (error) {
          console.error('[BidirectionalCache] Pattern matching error for candidate:', error);
          continue;
        }
      }

      return bestMatch;

    } catch (error) {
      console.error('[BidirectionalCache] Enhanced pattern matching failed:', error);
      return null;
    }
  }

  /**
   * Update last_used timestamp for enhanced cache entry
   */
  private updateLastUsed(id: number): void {
    this.executeInTransaction(() => {
      const updateStmt = this.db.prepare(`
        UPDATE cache_keys_v2
        SET last_used = ?, use_count = use_count + 1
        WHERE id = ?
      `);
      updateStmt.run(Date.now(), id);
    }, 'update last used timestamp');
  }


  async set(input: string, url: string, selector: string): Promise<void> {
    const now = Date.now();
    const selectorHash = this.createSelectorHash(selector);
    const normalizedResult = this.normalizer.normalize(input);

    this.executeInTransaction(() => {
        // 1. Store/update selector
        const selectorStmt = this.db.prepare(`
          INSERT INTO selector_cache_v2 
          (selector, selector_hash, url, confidence, created_at, last_used, use_count)
          VALUES (?, ?, ?, 0.5, ?, ?, 1)
          ON CONFLICT(selector_hash) DO UPDATE SET
            last_used = excluded.last_used,
            use_count = use_count + 1,
            confidence = MIN(confidence * 1.02, 1.0)
        `);
        
        selectorStmt.run(selector, selectorHash, url, now, now);

        // 2. Store input mapping
        const mappingStmt = this.db.prepare(`
          INSERT INTO input_mappings 
          (selector_hash, input, normalized_input, input_tokens, url, last_used, learned_from)
          VALUES (?, ?, ?, ?, ?, ?, 'direct')
          ON CONFLICT(selector_hash, normalized_input, url) DO UPDATE SET
            success_count = success_count + 1,
            confidence = MIN(confidence * 1.05, 1.0),
            last_used = excluded.last_used,
            input = CASE 
              WHEN length(excluded.input) > length(input) THEN excluded.input 
              ELSE input 
            END
        `);

        mappingStmt.run(
          selectorHash,
          input,
          normalizedResult.normalized,
          JSON.stringify(normalizedResult.tokens),
          url,
          now
        );

      this.stats.sets++;
    }, 'set cache entry');

    // 3. Learn from related inputs (async, non-blocking)
    setImmediate(() => this.learnRelatedInputs(selectorHash, input, url, normalizedResult));
  }

  async get(input: string, url: string): Promise<LookupResult | null> {
    const normalizedResult = this.normalizer.normalize(input);

    // Level 1: Exact Match
    const exactResult = await this.exactMatch(input, url);
    if (exactResult) {
      this.stats.hits.exact++;
      return { ...exactResult, source: 'exact', cached: true };
    }

    // Level 2: Normalized Match
    const normalizedMatch = await this.normalizedMatch(normalizedResult.normalized, url);
    if (normalizedMatch) {
      this.stats.hits.normalized++;
      return { ...normalizedMatch, source: 'normalized', cached: true };
    }

    // Level 3: Reverse Lookup
    const reverseMatch = await this.reverseLookup(normalizedResult, url);
    if (reverseMatch) {
      this.stats.hits.reverse++;
      return { ...reverseMatch, source: 'reverse', cached: true };
    }

    // Level 4: Fuzzy Match (typo tolerance)
    const fuzzyMatch = await this.fuzzyMatch(normalizedResult, url);
    if (fuzzyMatch) {
      this.stats.hits.fuzzy++;
      return { ...fuzzyMatch, source: 'fuzzy', cached: true };
    }

    this.stats.misses++;
    return null;
  }

  private async exactMatch(input: string, url: string): Promise<{ selector: string; confidence: number } | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT sc.selector, im.confidence
        FROM input_mappings im
        JOIN selector_cache_v2 sc ON sc.selector_hash = im.selector_hash
        WHERE im.input = ? AND im.url = ?
        ORDER BY im.confidence DESC, im.success_count DESC
        LIMIT 1
      `);

      const result = stmt.get(input, url) as { selector: string; confidence: number } | undefined;
      if (result) {
        await this.updateUsage(result.selector, url);
        return result;
      }
    } catch (error) {
      console.error('[BidirectionalCache] Exact match error:', error);
    }
    return null;
  }

  private async normalizedMatch(normalized: string, url: string): Promise<{ selector: string; confidence: number } | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT sc.selector, im.confidence
        FROM input_mappings im
        JOIN selector_cache_v2 sc ON sc.selector_hash = im.selector_hash
        WHERE im.normalized_input = ? AND im.url = ?
        ORDER BY im.confidence DESC, im.success_count DESC
        LIMIT 1
      `);

      const result = stmt.get(normalized, url) as { selector: string; confidence: number } | undefined;
      if (result) {
        await this.updateUsage(result.selector, url);
        return result;
      }
    } catch (error) {
      console.error('[BidirectionalCache] Normalized match error:', error);
    }
    return null;
  }

  private async reverseLookup(normalizedResult: NormalizationResult, url: string): Promise<{ selector: string; confidence: number } | null> {
    try {
      // Find selectors with similar token patterns
      const stmt = this.db.prepare(`
        SELECT 
          sc.selector,
          im.confidence,
          im.input_tokens,
          im.success_count,
          GROUP_CONCAT(im.input) as all_inputs
        FROM input_mappings im
        JOIN selector_cache_v2 sc ON sc.selector_hash = im.selector_hash
        WHERE im.url = ?
        AND im.input_tokens != '[]'
        GROUP BY sc.selector_hash
        ORDER BY im.confidence DESC, im.success_count DESC
        LIMIT 10
      `);

      const candidates = stmt.all(url) as Array<{
        selector: string;
        confidence: number;
        input_tokens: string;
        success_count: number;
        all_inputs: string;
      }>;

      let bestMatch: { selector: string; confidence: number } | null = null;
      let bestScore = 0;

      for (const candidate of candidates) {
        try {
          const candidateTokens = JSON.parse(candidate.input_tokens);
          // Use context-aware similarity for better matching
          const similarity = this.calculateContextAwareSimilarity(
            normalizedResult.tokens,
            candidateTokens,
            url,
            'cache_lookup'
          );

          // Skip if actions conflict
          if (similarity === -1) {
            console.error(`[BidirectionalCache] Skipping candidate due to action conflict: "${normalizedResult.normalized}" vs inputs="${candidate.all_inputs}"`);
            continue;
          }

          // Boost score based on success count and confidence
          const boostedScore = similarity * 
            (1 + Math.log(1 + candidate.success_count) * 0.1) *
            candidate.confidence;

          console.error(`[BidirectionalCache] Reverse candidate: inputs="${candidate.all_inputs}" → ${candidate.selector} (similarity: ${similarity.toFixed(3)}, boosted: ${boostedScore.toFixed(3)})`);
          
          // Use context-aware threshold
          const threshold = this.normalizer.getThresholdForOperation('cache_lookup');
          if (boostedScore > threshold && boostedScore > bestScore) {
            bestScore = boostedScore;
            bestMatch = {
              selector: candidate.selector,
              confidence: candidate.confidence * 0.9 // Slight penalty for reverse lookup
            };
          }
        } catch (e) {
          // Skip malformed JSON
          continue;
        }
      }

      if (bestMatch) {
        await this.updateUsage(bestMatch.selector, url);
        return bestMatch;
      }
    } catch (error) {
      console.error('[BidirectionalCache] Reverse lookup error:', error);
    }
    return null;
  }

  private async fuzzyMatch(normalizedResult: NormalizationResult, url: string): Promise<{ selector: string; confidence: number } | null> {
    try {
      const stmt = this.db.prepare(`
        SELECT sc.selector, im.normalized_input, im.confidence
        FROM input_mappings im
        JOIN selector_cache_v2 sc ON sc.selector_hash = im.selector_hash
        WHERE im.url = ?
        AND im.last_used > ?
        ORDER BY im.confidence DESC, im.success_count DESC
        LIMIT 20
      `);

      const candidates = stmt.all(url, Date.now() - 3600000) as Array<{ // Last hour only
        selector: string;
        normalized_input: string;
        confidence: number;
      }>;

      for (const candidate of candidates) {
        const distance = this.normalizer.damerauLevenshtein(
          normalizedResult.normalized,
          candidate.normalized_input
        );

        const maxDistance = Math.floor(normalizedResult.normalized.length / 8); // 12.5% tolerance
        
        if (distance <= maxDistance && distance > 0) {
          await this.updateUsage(candidate.selector, url);
          return {
            selector: candidate.selector,
            confidence: candidate.confidence * (1 - distance / 10) // Penalty for typos
          };
        }
      }
    } catch (error) {
      console.error('[BidirectionalCache] Fuzzy match error:', error);
    }
    return null;
  }

  /**
   * Context-aware similarity calculation that integrates with the enhanced similarity system
   */
  private calculateContextAwareSimilarity(
    tokens1: string[], 
    tokens2: string[], 
    url: string,
    operationType: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default' = 'cache_lookup'
  ): number {
    // Convert tokens to text for context-aware calculation
    const text1 = tokens1.join(' ');
    const text2 = tokens2.join(' ');
    
    // Use SmartNormalizer's context-aware calculation
    const context = {
      currentUrl: url,
      operationType,
      profile: 'default', // Use default profile for cache operations
      domainMatch: true // Within same session, assume domain match
    };
    
    return this.normalizer.calculateContextAwareSimilarity(text1, text2, context);
  }

  private calculateJaccardSimilarity(set1: string[], set2: string[]): number {
    if (set1.length === 0 && set2.length === 0) return 1.0;
    if (set1.length === 0 || set2.length === 0) return 0.0;
    
    // Direct intersection
    const directIntersection = set1.filter(x => set2.includes(x));
    
    // Semantic intersection (synonyms)
    const semanticIntersection = [];
    const synonyms: Record<string, string[]> = {
      'click': ['press', 'tap', 'hit', 'select'],
      'press': ['click', 'tap', 'hit', 'select'], 
      'tap': ['click', 'press', 'hit', 'select'],
      'hit': ['click', 'press', 'tap', 'select'],
      'select': ['click', 'press', 'tap', 'choose'],
      'button': ['option', 'link', 'element', 'btn'],
      'option': ['button', 'choice', 'item'],
      'todo': ['task', 'item', 'aufgabe'],
      'task': ['todo', 'item', 'aufgabe'],
      'add': ['create', 'new', 'erstellen'],
      'create': ['add', 'new', 'erstellen'],
      'delete': ['remove', 'löschen', 'entfernen'],
      'remove': ['delete', 'löschen', 'entfernen'],
      'first': ['initial', 'top', 'erste'],
      'submit': ['send', 'confirm'],
      'form': ['submission']
    };
    
    for (const word1 of set1) {
      for (const word2 of set2) {
        if (synonyms[word1]?.includes(word2) || synonyms[word2]?.includes(word1)) {
          semanticIntersection.push(word1);
          break;
        }
      }
    }
    
    const totalIntersection = [...new Set([...directIntersection, ...semanticIntersection])];
    const union = [...new Set([...set1, ...set2])];
    
    const similarity = totalIntersection.length / union.length;
    
    // Debug logging
    console.error(`[BidirectionalCache] Similarity: ${set1.join(',')} vs ${set2.join(',')} = ${similarity.toFixed(3)} (direct:${directIntersection.length} + semantic:${semanticIntersection.length} = ${totalIntersection.length}/${union.length})`);
    
    return similarity;
  }

  private createSelectorHash(selector: string): string {
    return crypto.createHash('md5').update(selector).digest('hex');
  }

  private async updateUsage(selector: string, url: string): Promise<void> {
    const now = Date.now();
    const selectorHash = this.createSelectorHash(selector);

    this.executeInTransaction(() => {
      const stmt = this.db.prepare(`
        UPDATE selector_cache_v2 
        SET last_used = ?, use_count = use_count + 1
        WHERE selector_hash = ? AND url = ?
      `);

      stmt.run(now, selectorHash, url);
    }, 'update usage statistics');
  }

  private async learnRelatedInputs(
    selectorHash: string, 
    newInput: string, 
    url: string, 
    normalizedResult: NormalizationResult
  ): Promise<void> {
    try {
      // Find other inputs for the same selector
      const stmt = this.db.prepare(`
        SELECT input, normalized_input, input_tokens, confidence
        FROM input_mappings
        WHERE selector_hash = ? AND url = ? AND input != ?
        AND success_count > 1
        ORDER BY confidence DESC
        LIMIT 5
      `);

      const related = stmt.all(selectorHash, url, newInput) as Array<{
        input: string;
        normalized_input: string;
        input_tokens: string;
        confidence: number;
      }>;

      for (const rel of related) {
        const pattern = this.findCommonPattern(newInput, rel.input);
        if (pattern && pattern.confidence > 0.7) {
          await this.saveLearnedPattern(pattern, selectorHash, url);
          this.stats.learnings++;
        }
      }
    } catch (error) {
      console.error('[BidirectionalCache] Learn related inputs error:', error);
    }
  }

  private findCommonPattern(input1: string, input2: string): { pattern: string; confidence: number } | null {
    // Simple pattern extraction - can be enhanced
    const norm1 = this.normalizer.normalize(input1);
    const norm2 = this.normalizer.normalize(input2);
    
    const commonTokens = norm1.tokens.filter(t => norm2.tokens.includes(t));
    if (commonTokens.length >= 2) {
      return {
        pattern: commonTokens.sort().join(' '),
        confidence: commonTokens.length / Math.max(norm1.tokens.length, norm2.tokens.length)
      };
    }
    
    return null;
  }

  private async saveLearnedPattern(
    pattern: { pattern: string; confidence: number },
    selectorHash: string,
    url: string
  ): Promise<void> {
    try {
      const now = Date.now();
      const stmt = this.db.prepare(`
        INSERT OR IGNORE INTO input_mappings
        (selector_hash, input, normalized_input, input_tokens, url, last_used, confidence, learned_from)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'pattern')
      `);

      stmt.run(
        selectorHash,
        `Pattern: ${pattern.pattern}`,
        pattern.pattern,
        JSON.stringify(pattern.pattern.split(' ')),
        url,
        now,
        pattern.confidence,
      );
    } catch (error) {
      // Ignore conflicts - pattern might already exist
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  private cleanup(): void {
    const now = Date.now();

    this.executeInTransaction(() => {
      // Remove expired entries
      const expiredStmt = this.db.prepare(`
        DELETE FROM input_mappings 
        WHERE (last_used + ?) < ?
      `);
      expiredStmt.run(this.options.selectorTTL, now);

      // Remove expired snapshots
      const expiredSnapshotsStmt = this.db.prepare(`
        DELETE FROM snapshot_cache 
        WHERE (created_at + ttl) < ?
      `);
      expiredSnapshotsStmt.run(now);

      // Limit variations per selector
      const limitStmt = this.db.prepare(`
        DELETE FROM input_mappings
        WHERE id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (
              PARTITION BY selector_hash, url 
              ORDER BY confidence DESC, success_count DESC, last_used DESC
            ) as rn
            FROM input_mappings
          ) WHERE rn <= ?
        )
      `);
      limitStmt.run(this.options.maxVariationsPerSelector);

      // Clean orphaned selectors
      const orphanStmt = this.db.prepare(`
        DELETE FROM selector_cache_v2
        WHERE selector_hash NOT IN (
          SELECT DISTINCT selector_hash FROM input_mappings
        )
      `);
      orphanStmt.run();
    }, 'cleanup old entries');
  }

  async getStats(): Promise<CacheStats> {
    try {
      const dbStats = this.db.prepare(`
        SELECT 
          COUNT(DISTINCT sc.selector_hash) as unique_selectors,
          COUNT(im.id) as total_mappings,
          AVG(im.success_count) as avg_success_count,
          COUNT(im.id) * 1.0 / COUNT(DISTINCT sc.selector_hash) as avg_inputs_per_selector,
          SUM(CASE WHEN im.learned_from = 'inferred' THEN 1 ELSE 0 END) * 100.0 / COUNT(im.id) as learning_rate
        FROM input_mappings im
        JOIN selector_cache_v2 sc ON sc.selector_hash = im.selector_hash
      `).get();

      const hitRate = Object.values(this.stats.hits).reduce((a, b) => a + b, 0) / 
                     (Object.values(this.stats.hits).reduce((a, b) => a + b, 0) + this.stats.misses);

      const snapshotStats = await this.getSnapshotMetrics();

      return {
        performance: {
          hitRate: hitRate || 0,
          hits: this.stats.hits,
          misses: this.stats.misses,
          totalLookups: Object.values(this.stats.hits).reduce((a, b) => a + b, 0) + this.stats.misses
        },
        storage: dbStats,
        snapshots: snapshotStats,
        operations: {
          sets: this.stats.sets,
          learnings: this.stats.learnings
        }
      };
    } catch (error) {
      console.error('[BidirectionalCache] Get stats error:', error);
      return {};
    }
  }

  async clear(): Promise<void> {
    try {
      this.db.exec('DELETE FROM input_mappings');
      this.db.exec('DELETE FROM selector_cache_v2');
      this.db.exec('DELETE FROM snapshot_cache');
      
      // Reset stats
      this.stats = {
        hits: { exact: 0, normalized: 0, reverse: 0, fuzzy: 0, enhanced: 0 },
        misses: 0,
        sets: 0,
        learnings: 0,
        migrations: 0
      };
    } catch (error) {
      console.error('[BidirectionalCache] Clear error:', error);
    }
  }

  // CRITICAL: Invalidate failed selectors to prevent cache corruption
  async invalidateSelector(selector: string, url: string): Promise<void> {
    try {
      const selectorHash = this.createSelectorHash(selector);
      
      // Remove from both tables in a transaction
      const transaction = this.db.transaction(() => {
        // 1. Remove all input mappings for this selector/URL
        const deleteMappings = this.db.prepare(`
          DELETE FROM input_mappings 
          WHERE selector_hash = ? AND url = ?
        `);
        const mappingResult = deleteMappings.run(selectorHash, url);
        
        // 2. Remove selector entry if no other URLs use it
        const checkOtherUrls = this.db.prepare(`
          SELECT COUNT(*) as count 
          FROM input_mappings 
          WHERE selector_hash = ?
        `);
        const otherUrls = checkOtherUrls.get(selectorHash) as { count: number };
        
        if (otherUrls.count === 0) {
          const deleteSelector = this.db.prepare(`
            DELETE FROM selector_cache_v2 
            WHERE selector_hash = ?
          `);
          deleteSelector.run(selectorHash);
        }
        
        return mappingResult.changes;
      });
      
      const removedMappings = transaction();
      console.error(`[BidirectionalCache] ⚡ INVALIDATED selector "${selector}" for ${url} (removed ${removedMappings} mappings)`);
      
    } catch (error) {
      console.error('[BidirectionalCache] Invalidate selector error:', error);
    }
  }

  // Snapshot cache methods
  async getSnapshot(key: object, profile?: string, options: { page?: Page; url?: string; domSignatureFallback?: boolean } = {}): Promise<SnapshotData | null> {
    try {
      const cacheKey = this.createCacheKey(key);
      const now = Date.now();
      
      // First try exact cache key match
      let stmt = this.db.prepare(`
        SELECT snapshot_data, hit_count, created_at, ttl, dom_signature
        FROM snapshot_cache
        WHERE cache_key = ? AND (profile = ? OR (profile IS NULL AND ? IS NULL))
        AND (created_at + ttl) > ?
      `);
      
      let result = stmt.get(cacheKey, profile || null, profile || null, now) as {
        snapshot_data: string;
        hit_count: number;
        created_at: number;
        ttl: number;
        dom_signature?: string;
        cache_key?: string;
      } | undefined;
      
      // If no exact match and DOM signature fallback is enabled, try DOM signature matching
      if (!result && options.domSignatureFallback && options.page && options.url) {
        try {
          const currentSignature = await this.domSignatureManager.generateSignature(options.page, options.url);
          
          // Try to find cache entries with similar DOM signatures
          const signatureStmt = this.db.prepare(`
            SELECT snapshot_data, hit_count, created_at, ttl, dom_signature, cache_key
            FROM snapshot_cache
            WHERE (profile = ? OR (profile IS NULL AND ? IS NULL))
            AND (created_at + ttl) > ?
            AND dom_signature IS NOT NULL
            ORDER BY created_at DESC
            LIMIT 10
          `);
          
          const candidates = signatureStmt.all(profile || null, profile || null, now) as {
            snapshot_data: string;
            hit_count: number;
            created_at: number;
            ttl: number;
            dom_signature: string;
            cache_key: string;
          }[];
          
          // Find best matching DOM signature
          let bestMatch = null;
          let bestSimilarity = 0;
          
          for (const candidate of candidates) {
            if (candidate.dom_signature && DOMSignatureManager.isValidSignature(candidate.dom_signature)) {
              const similarity = DOMSignatureUtils.calculateSimilarity(
                currentSignature.fullSignature, 
                candidate.dom_signature
              );
              
              if (similarity > bestSimilarity && similarity >= 0.8) { // 80% similarity threshold
                bestMatch = candidate;
                bestSimilarity = similarity;
              }
            }
          }
          
          if (bestMatch) {
            console.error(`[BidirectionalCache] DOM signature fallback match found: ${bestSimilarity.toFixed(3)} similarity`);
            result = bestMatch;
          }
        } catch (error) {
          console.error('[BidirectionalCache] DOM signature fallback failed:', error);
        }
      }
      
      if (result) {
        // Update hit count and last used
        const updateStmt = this.db.prepare(`
          UPDATE snapshot_cache 
          SET last_used = ?, hit_count = hit_count + 1
          WHERE cache_key = ? AND (profile = ? OR (profile IS NULL AND ? IS NULL))
        `);
        updateStmt.run(now, result.cache_key || cacheKey, profile || null, profile || null);
        
        return JSON.parse(result.snapshot_data);
      }
    } catch (error) {
      console.error('[BidirectionalCache] Get snapshot error:', error);
    }
    return null;
  }

  async setSnapshot(key: object, value: SnapshotData, options: { url?: string; profile?: string; ttl?: number; page?: Page } = {}): Promise<void> {
    const cacheKey = this.createCacheKey(key);
    const now = Date.now();
    const ttl = options.ttl ?? this.options.snapshotTTL;

    // Generate DOM signature if page is provided
    let domSignature = null;
    let criticalHash = null;
    let importantHash = null;
    let contextHash = null;

    if (options.page && options.url) {
      try {
        const signature = await this.domSignatureManager.generateSignature(options.page, options.url);
        domSignature = signature.fullSignature;
        criticalHash = signature.criticalHash;
        importantHash = signature.importantHash;
        contextHash = signature.contextHash;

        console.error(`[BidirectionalCache] Generated DOM signature: ${domSignature} (${signature.elementCounts.critical}/${signature.elementCounts.important}/${signature.elementCounts.context})`);
      } catch (error) {
        console.error('[BidirectionalCache] DOM signature generation failed:', error);
      }
    }

    this.executeInTransaction(() => {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO snapshot_cache
        (cache_key, url, dom_hash, snapshot_data, profile, created_at, last_used, ttl, hit_count, dom_signature, critical_hash, important_hash, context_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
      `);

      // Extract DOM hash from key if available (legacy support)
      const domHash = typeof key === 'object' && 'domHash' in key ?
        (key as any).domHash : 'unknown';

      stmt.run(
        cacheKey,
        options.url || '',
        domHash,
        JSON.stringify(value),
        options.profile || null,
        now,
        now,
        ttl,
        domSignature,
        criticalHash,
        importantHash,
        contextHash
      );
    }, 'set snapshot');
  }

  async invalidateSnapshots(options: { url?: string; profile?: string } = {}): Promise<void> {
    this.executeInTransaction(() => {
      let stmt;
      let params: any[] = [];
      
      if (options.url && options.profile) {
        stmt = this.db.prepare(`
          DELETE FROM snapshot_cache 
          WHERE url = ? AND (profile = ? OR profile IS NULL)
        `);
        params = [options.url, options.profile];
      } else if (options.url) {
        stmt = this.db.prepare(`DELETE FROM snapshot_cache WHERE url = ?`);
        params = [options.url];
      } else if (options.profile) {
        stmt = this.db.prepare(`DELETE FROM snapshot_cache WHERE profile = ?`);
        params = [options.profile];
      } else {
        stmt = this.db.prepare(`DELETE FROM snapshot_cache`);
      }
      
      const result = stmt.run(...params);
      console.error(`[BidirectionalCache] Invalidated ${result.changes} snapshots`);
    }, 'invalidate snapshots');
  }

  async getSnapshotMetrics(): Promise<SnapshotMetrics> {
    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_snapshots,
          SUM(hit_count) as total_hits,
          AVG(hit_count) as avg_hits_per_snapshot,
          COUNT(DISTINCT url) as unique_urls,
          COUNT(DISTINCT profile) as unique_profiles,
          MIN(created_at) as oldest_snapshot,
          MAX(last_used) as most_recent_access
        FROM snapshot_cache
      `).get();
      
      return stats || {};
    } catch (error) {
      console.error('[BidirectionalCache] Get snapshot metrics error:', error);
      return {};
    }
  }

  private createCacheKey(key: any): string {
    const keyString = typeof key === 'object' ? JSON.stringify(key) : String(key);
    return crypto.createHash('md5').update(keyString).digest('hex');
  }

  /**
   * Enhanced cache key generation incorporating DOM signature
   * Phase 2.1 - DOM Signature Infrastructure
   */
  async createDOMEnhancedCacheKey(baseKey: string, page: any, url: string, profile?: string): Promise<string> {
    try {
      const domSignature = await this.domSignatureManager.generateSignature(page, url);
      return DOMSignatureUtils.generateCacheKey(baseKey, domSignature.fullSignature, profile);
    } catch (error) {
      console.error('[BidirectionalCache] DOM enhanced cache key generation failed:', error);
      // Fallback to regular cache key
      return this.createCacheKey(baseKey + (profile ? `:${profile}` : ''));
    }
  }

  /**
   * Enhanced selector caching with DOM signature support
   * Phase 2.1 - DOM Signature Infrastructure
   */
  async setWithDOMSignature(
    input: string, 
    url: string, 
    selector: string, 
    page?: Page, 
    options: { confidence?: number } = {}
  ): Promise<void> {
    const now = Date.now();
    const selectorHash = this.createSelectorHash(selector);
    const normalizedResult = this.normalizer.normalize(input);
    const confidence = options.confidence ?? 0.8;

    // Generate DOM signature if page provided
    let domSignature = null;
    if (page) {
      try {
        const signature = await this.domSignatureManager.generateSignature(page, url);
        domSignature = signature.fullSignature;
        console.error(`[BidirectionalCache] Storing selector with DOM signature: ${domSignature}`);
      } catch (error) {
        console.error('[BidirectionalCache] DOM signature generation failed during set:', error);
      }
    }

    try {
      // Begin transaction
      const transaction = this.db.transaction(() => {
        // 1. Store/update selector with DOM signature
        const selectorStmt = this.db.prepare(`
          INSERT OR REPLACE INTO selector_cache_v2 
          (selector, selector_hash, url, confidence, created_at, last_used, use_count, dom_signature)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?)
          ON CONFLICT(selector_hash) DO UPDATE SET
            last_used = ?, use_count = use_count + 1, dom_signature = ?
        `);
        
        selectorStmt.run(selector, selectorHash, url, confidence, now, now, domSignature, now, domSignature);

        // 2. Store input mapping
        const inputStmt = this.db.prepare(`
          INSERT OR REPLACE INTO input_mappings 
          (selector_hash, input, normalized_input, input_tokens, url, last_used, learned_from)
          VALUES (?, ?, ?, ?, ?, ?, 'direct')
          ON CONFLICT(selector_hash, normalized_input, url) DO UPDATE SET
            last_used = ?, success_count = success_count + 1
        `);
        
        inputStmt.run(
          selectorHash, 
          input, 
          normalizedResult.normalized, 
          JSON.stringify(normalizedResult.tokens),
          url, 
          now,
          now
        );

        this.stats.sets++;
      });

      transaction();
    } catch (error) {
      console.error('[BidirectionalCache] Set with DOM signature error:', error);
    }
  }

  /**
   * Enhanced lookup with DOM signature fallback
   * Phase 2.1 - DOM Signature Infrastructure  
   */
  async getWithDOMSignatureFallback(
    input: string, 
    url: string,
    page?: Page,
    options: { similarityThreshold?: number } = {}
  ): Promise<LookupResult | null> {
    const threshold = options.similarityThreshold ?? 0.15;

    // First try regular lookup
    const regularResult = await this.get(input, url);
    if (regularResult) {
      return regularResult;
    }

    // If no result and page available, try DOM signature-based lookup
    if (page) {
      try {
        const currentSignature = await this.domSignatureManager.generateSignature(page, url);
        
        // Find selectors with similar DOM signatures
        const signatureStmt = this.db.prepare(`
          SELECT sc.selector, sc.confidence, sc.dom_signature, im.normalized_input
          FROM selector_cache_v2 sc
          JOIN input_mappings im ON sc.selector_hash = im.selector_hash
          WHERE sc.dom_signature IS NOT NULL
          AND im.url = ?
          ORDER BY sc.last_used DESC
          LIMIT 20
        `);

        const candidates = signatureStmt.all(url) as {
          selector: string;
          confidence: number;
          dom_signature: string;
          normalized_input: string;
        }[];

        const normalizedResult = this.normalizer.normalize(input);
        let bestMatch = null;
        let bestScore = 0;

        for (const candidate of candidates) {
          if (!candidate.dom_signature || !DOMSignatureManager.isValidSignature(candidate.dom_signature)) {
            continue;
          }

          // Calculate DOM signature similarity
          const domSimilarity = DOMSignatureUtils.calculateSimilarity(
            currentSignature.fullSignature,
            candidate.dom_signature
          );

          // Calculate context-aware input similarity
          const inputSimilarity = this.calculateContextAwareSimilarity(
            normalizedResult.tokens,
            candidate.normalized_input.split(' '),
            url,
            'cache_lookup'
          );

          // Skip if actions conflict
          if (inputSimilarity === -1) {
            console.error(`[BidirectionalCache] Skipping enhanced candidate due to action conflict: "${input}" vs "${candidate.normalized_input}"`);
            continue;
          }

          // Combined score (DOM signature weighted higher for structural stability)
          const combinedScore = (domSimilarity * 0.7) + (inputSimilarity * 0.3);

          // Use context-aware threshold for cross-environment matching
          const threshold = this.normalizer.getThresholdForOperation('cross_env');
          if (combinedScore > bestScore && combinedScore >= threshold) {
            bestMatch = candidate;
            bestScore = combinedScore;
          }
        }

        if (bestMatch) {
          console.error(`[BidirectionalCache] DOM signature fallback match: ${bestScore.toFixed(3)} combined score`);
          this.stats.hits.fuzzy++;
          
          return {
            selector: bestMatch.selector,
            confidence: bestMatch.confidence * bestScore, // Adjust confidence by match quality
            source: 'fuzzy',
            cached: true
          };
        }
      } catch (error) {
        console.error('[BidirectionalCache] DOM signature fallback lookup failed:', error);
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Get DOM signature statistics and health metrics
   */
  async getDOMSignatureMetrics(): Promise<DOMSignatureMetrics> {
    try {
      const selectorStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_selectors,
          COUNT(CASE WHEN dom_signature IS NOT NULL THEN 1 END) as selectors_with_dom_signature,
          COUNT(DISTINCT dom_signature) as unique_dom_signatures
        FROM selector_cache_v2
      `).get();

      const snapshotStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_snapshots,
          COUNT(CASE WHEN dom_signature IS NOT NULL THEN 1 END) as snapshots_with_dom_signature,
          COUNT(DISTINCT dom_signature) as unique_snapshot_signatures,
          COUNT(DISTINCT critical_hash) as unique_critical_hashes,
          COUNT(DISTINCT important_hash) as unique_important_hashes,
          COUNT(DISTINCT context_hash) as unique_context_hashes
        FROM snapshot_cache
      `).get();

      const domSignatureCacheStats = this.domSignatureManager.getCacheStats();

      return {
        selector_cache: selectorStats || {},
        snapshot_cache: snapshotStats || {},
        dom_signature_manager: domSignatureCacheStats,
        coverage: {
          selector_coverage: (selectorStats as any)?.selectors_with_dom_signature / Math.max((selectorStats as any)?.total_selectors || 1, 1),
          snapshot_coverage: (snapshotStats as any)?.snapshots_with_dom_signature / Math.max((snapshotStats as any)?.total_snapshots || 1, 1)
        }
      };
    } catch (error) {
      console.error('[BidirectionalCache] DOM signature metrics error:', error);
      return {};
    }
  }

  // Enhanced Phase 2.4: DOM Signature Statistics for MCP Integration
  async getDOMSignatureStats(): Promise<any> {
    try {
      const baseMetrics = await this.getDOMSignatureMetrics();
      
      // Additional DOM signature specific metrics for Phase 2.4
      const hitRateStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN dom_signature IS NOT NULL THEN 1 END) as signature_hits,
          COUNT(*) as total_requests,
          AVG(CASE WHEN confidence IS NOT NULL THEN confidence ELSE 0 END) as avg_confidence
        FROM selector_cache_v2
        WHERE created_at > datetime('now', '-24 hours')
      `).get() as any;
      
      const changeDetectionStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN dom_signature != context_hash THEN 1 END) as changes_detected,
          COUNT(*) as total_comparisons
        FROM snapshot_cache
        WHERE created_at > datetime('now', '-24 hours')
      `).get() as any;
      
      const crossEnvStats = this.db.prepare(`
        SELECT COUNT(DISTINCT url) as unique_environments
        FROM selector_cache_v2
        WHERE dom_signature IS NOT NULL
      `).get() as any;
      
      return {
        generated: baseMetrics.selector_cache?.total_selectors || 0,
        cached: baseMetrics.selector_cache?.selectors_with_dom_signature || 0,
        hitRate: ((hitRateStats?.signature_hits || 0) / Math.max(hitRateStats?.total_requests || 1, 1)) * 100,
        avgConfidence: hitRateStats?.avg_confidence || 0,
        changeDetections: changeDetectionStats?.changes_detected || 0,
        crossEnvMatches: crossEnvStats?.unique_environments || 0,
        changeDetectionRate: ((changeDetectionStats?.changes_detected || 0) / Math.max(changeDetectionStats?.total_comparisons || 1, 1)) * 100,
        ...baseMetrics
      };
    } catch (error) {
      console.error('[BidirectionalCache] DOM signature stats error:', error);
      return {
        generated: 0,
        cached: 0,
        hitRate: 0,
        avgConfidence: 0,
        changeDetections: 0,
        crossEnvMatches: 0,
        changeDetectionRate: 0
      };
    }
  }
  
  // Enhanced Phase 2.4: Enhanced Cache Key Statistics for MCP Integration
  async getEnhancedKeyStats(): Promise<any> {
    try {
      // Cache performance metrics
      const performanceStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN use_count > 1 THEN 1 END) as cache_hits,
          COUNT(CASE WHEN use_count = 1 THEN 1 END) as cache_misses,
          COUNT(CASE WHEN learned_from = 'adapted' THEN 1 END) as adaptations,
          AVG(confidence) as avg_confidence
        FROM input_mappings im
        JOIN selector_cache_v2 sc ON im.selector_hash = sc.selector_hash
        WHERE im.last_used > datetime('now', '-24 hours')
      `).get() as any;
      
      // Cross-environment portability
      const portabilityStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN environments > 1 THEN 1 END) as portable_selectors,
          COUNT(*) as total_selectors
        FROM (
          SELECT selector_hash, COUNT(DISTINCT url) as environments
          FROM selector_cache_v2
          GROUP BY selector_hash
        )
      `).get() as any;
      
      // False positive detection (selectors that failed after being cached)
      const falsePositiveStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN confidence < 0.5 AND use_count > 1 THEN 1 END) as potential_false_positives,
          COUNT(*) as total_cached_selectors
        FROM selector_cache_v2
        WHERE use_count > 1
      `).get() as any;
      
      // Match accuracy based on success rates
      const accuracyStats = this.db.prepare(`
        SELECT 
          COUNT(CASE WHEN success_count >= total_uses * 0.9 THEN 1 END) as high_accuracy_matches,
          COUNT(*) as total_mappings,
          AVG(success_count * 1.0 / GREATEST(success_count, 1)) as avg_success_rate
        FROM (
          SELECT 
            im.success_count,
            sc.use_count as total_uses
          FROM input_mappings im
          JOIN selector_cache_v2 sc ON im.selector_hash = sc.selector_hash
          WHERE sc.use_count > 1
        )
      `).get() as any;
      
      const hits = performanceStats?.cache_hits || 0;
      const misses = performanceStats?.cache_misses || 0;
      const totalRequests = hits + misses;
      const portabilityRate = ((portabilityStats?.portable_selectors || 0) / Math.max(portabilityStats?.total_selectors || 1, 1)) * 100;
      const falsePositiveRate = ((falsePositiveStats?.potential_false_positives || 0) / Math.max(falsePositiveStats?.total_cached_selectors || 1, 1)) * 100;
      const matchAccuracy = ((accuracyStats?.high_accuracy_matches || 0) / Math.max(accuracyStats?.total_mappings || 1, 1)) * 100;
      
      return {
        hits,
        misses,
        adaptations: performanceStats?.adaptations || 0,
        falsePositiveRate,
        portabilityRate,
        matchAccuracy,
        avgConfidence: performanceStats?.avg_confidence || 0,
        totalRequests,
        successRate: accuracyStats?.avg_success_rate || 0
      };
    } catch (error) {
      console.error('[BidirectionalCache] Enhanced key stats error:', error);
      return {
        hits: 0,
        misses: 0,
        adaptations: 0,
        falsePositiveRate: 0,
        portabilityRate: 0,
        matchAccuracy: 0,
        avgConfidence: 0,
        totalRequests: 0,
        successRate: 0
      };
    }
  }

  close(): void {
    // Clear interval timer first and set to undefined
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    // Close DOM signature manager if exists
    this.domSignatureManager?.close();

    // Ensure database closes even if error
    try {
      this.db.close();
    } catch (error) {
      console.error('[Cache] Error closing database:', error);
    }

    console.error('[Cache] Closed successfully');
  }
}