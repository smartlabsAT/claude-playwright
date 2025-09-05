import Database from 'better-sqlite3';
import { EnhancedCacheKeyManager, EnhancedCacheKey, CacheKeyComponents } from './enhanced-cache-key.js';
import { SmartNormalizer } from './smart-normalizer.js';
import crypto from 'crypto';

/**
 * Database Migration System for Phase 2.2 - Enhanced Cache Key System
 * Handles migration from old cache format to new enhanced cache key format
 * with backward compatibility and graceful fallback
 */

export interface MigrationResult {
  success: boolean;
  migrated: number;
  skipped: number;
  errors: number;
  duration: number;
  details: string[];
}

export interface MigrationOptions {
  batchSize: number;
  retryFailures: boolean;
  preserveOldData: boolean;
  validateAfterMigration: boolean;
  dryRun: boolean;
}

export interface LegacyCacheEntry {
  id: number;
  selector: string;
  selector_hash: string;
  url: string;
  confidence: number;
  created_at: number;
  last_used: number;
  use_count: number;
  dom_signature?: string;
}

export interface EnhancedCacheEntry {
  id?: number;
  enhanced_key: string;               // Serialized EnhancedCacheKey
  base_key_hash: string;             // Hash of the enhanced key for fast lookup
  legacy_key_hash?: string;          // Original key hash for compatibility
  test_name_normalized: string;      // Extracted for indexing
  url_pattern: string;               // Extracted for indexing
  dom_signature: string;             // Extracted for indexing
  steps_structure_hash: string;      // Extracted for indexing
  profile: string;                   // Extracted for indexing
  version: number;                   // Schema version
  selector: string;                  // Original selector for compatibility
  confidence: number;                // Confidence score
  created_at: number;                // Creation timestamp
  last_used: number;                 // Last access timestamp
  use_count: number;                 // Usage count
  migration_source: 'legacy' | 'enhanced' | 'manual';  // Source of the entry
}

export class CacheMigrationManager {
  private db: Database.Database;
  private enhancedKeyManager: EnhancedCacheKeyManager;
  private normalizer: SmartNormalizer;
  
  constructor(database: Database.Database) {
    this.db = database;
    this.enhancedKeyManager = new EnhancedCacheKeyManager();
    this.normalizer = new SmartNormalizer();
  }

  /**
   * Create new enhanced cache key table structure
   */
  createEnhancedCacheSchema(): void {
    console.error('[CacheMigration] Creating enhanced cache key schema...');

    // Create the new enhanced cache keys table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_keys_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        enhanced_key TEXT NOT NULL,
        base_key_hash TEXT NOT NULL UNIQUE,
        legacy_key_hash TEXT,
        test_name_normalized TEXT NOT NULL,
        url_pattern TEXT NOT NULL,
        dom_signature TEXT NOT NULL,
        steps_structure_hash TEXT NOT NULL,
        profile TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        selector TEXT NOT NULL,
        confidence REAL DEFAULT 0.5,
        created_at INTEGER NOT NULL,
        last_used INTEGER NOT NULL,
        use_count INTEGER DEFAULT 1,
        migration_source TEXT DEFAULT 'enhanced'
      );
    `);

    // Create performance indexes
    this.createEnhancedCacheIndexes();

    console.error('[CacheMigration] Enhanced cache key schema created successfully');
  }

  /**
   * Create optimized indexes for the enhanced cache key system
   */
  private createEnhancedCacheIndexes(): void {
    const indexes = [
      // Primary lookup indexes
      'CREATE INDEX IF NOT EXISTS idx_enhanced_base_key ON cache_keys_v2(base_key_hash);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_legacy_key ON cache_keys_v2(legacy_key_hash);',
      
      // Component-based indexes for pattern matching
      'CREATE INDEX IF NOT EXISTS idx_enhanced_test_name ON cache_keys_v2(test_name_normalized);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_url_pattern ON cache_keys_v2(url_pattern);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_dom_signature ON cache_keys_v2(dom_signature);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_steps_hash ON cache_keys_v2(steps_structure_hash);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_profile ON cache_keys_v2(profile);',
      
      // Composite indexes for common query patterns
      'CREATE INDEX IF NOT EXISTS idx_enhanced_pattern_profile ON cache_keys_v2(url_pattern, profile);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_dom_profile ON cache_keys_v2(dom_signature, profile);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_name_pattern ON cache_keys_v2(test_name_normalized, url_pattern);',
      
      // Maintenance indexes
      'CREATE INDEX IF NOT EXISTS idx_enhanced_last_used ON cache_keys_v2(last_used);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_version ON cache_keys_v2(version);',
      'CREATE INDEX IF NOT EXISTS idx_enhanced_source ON cache_keys_v2(migration_source);'
    ];

    indexes.forEach(indexSQL => {
      try {
        this.db.exec(indexSQL);
      } catch (error) {
        console.error(`[CacheMigration] Index creation warning:`, error);
      }
    });
  }

  /**
   * Check if migration is needed
   */
  isMigrationNeeded(): boolean {
    try {
      // Check if enhanced table exists
      const enhancedTableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='cache_keys_v2'
      `).get();

      if (!enhancedTableExists) {
        return true; // Need to create table and migrate
      }

      // Check if there are unmigrated entries in legacy tables
      const legacySelectors = this.db.prepare(`
        SELECT COUNT(*) as count FROM selector_cache_v2 
        WHERE selector_hash NOT IN (
          SELECT legacy_key_hash FROM cache_keys_v2 
          WHERE legacy_key_hash IS NOT NULL
        )
      `).get() as { count: number };

      return legacySelectors.count > 0;

    } catch (error) {
      console.error('[CacheMigration] Migration check failed:', error);
      return true; // Assume migration needed on error
    }
  }

  /**
   * Perform full migration from legacy to enhanced cache key system
   */
  async performMigration(options: Partial<MigrationOptions> = {}): Promise<MigrationResult> {
    const opts: MigrationOptions = {
      batchSize: options.batchSize ?? 1000,
      retryFailures: options.retryFailures ?? true,
      preserveOldData: options.preserveOldData ?? true,
      validateAfterMigration: options.validateAfterMigration ?? true,
      dryRun: options.dryRun ?? false
    };

    const startTime = Date.now();
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const details: string[] = [];

    try {
      console.error('[CacheMigration] Starting migration to enhanced cache key system...');
      details.push('Migration started');

      // Create enhanced schema if it doesn't exist
      if (!opts.dryRun) {
        this.createEnhancedCacheSchema();
      }
      details.push('Enhanced schema created/verified');

      // Migrate selector cache entries
      const selectorMigrationResult = await this.migrateSelectorCache(opts);
      migrated += selectorMigrationResult.migrated;
      skipped += selectorMigrationResult.skipped;
      errors += selectorMigrationResult.errors;
      details.push(`Selector migration: ${selectorMigrationResult.migrated} migrated, ${selectorMigrationResult.skipped} skipped, ${selectorMigrationResult.errors} errors`);

      // Migrate test scenario entries
      const testMigrationResult = await this.migrateTestScenarios(opts);
      migrated += testMigrationResult.migrated;
      skipped += testMigrationResult.skipped; 
      errors += testMigrationResult.errors;
      details.push(`Test scenario migration: ${testMigrationResult.migrated} migrated, ${testMigrationResult.skipped} skipped, ${testMigrationResult.errors} errors`);

      // Validate migration if requested
      if (opts.validateAfterMigration && !opts.dryRun) {
        const validationResult = await this.validateMigration();
        details.push(`Validation: ${validationResult.isValid ? 'PASSED' : 'FAILED'} - ${validationResult.details}`);
      }

      const duration = Date.now() - startTime;
      details.push(`Migration completed in ${duration}ms`);

      console.error(`[CacheMigration] Migration completed: ${migrated} migrated, ${skipped} skipped, ${errors} errors in ${duration}ms`);

      return {
        success: errors === 0 || migrated > 0,
        migrated,
        skipped,
        errors,
        duration,
        details
      };

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[CacheMigration] Migration failed:', error);
      details.push(`Migration failed: ${error}`);

      return {
        success: false,
        migrated,
        skipped,
        errors: errors + 1,
        duration,
        details
      };
    }
  }

  /**
   * Migrate selector cache entries to enhanced format
   */
  private async migrateSelectorCache(options: MigrationOptions): Promise<MigrationResult> {
    let migrated = 0;
    let skipped = 0;
    let errors = 0;
    const details: string[] = [];

    try {
      // Get all unmigrated selector entries
      const legacyEntries = this.db.prepare(`
        SELECT * FROM selector_cache_v2 
        WHERE selector_hash NOT IN (
          SELECT legacy_key_hash FROM cache_keys_v2 
          WHERE legacy_key_hash IS NOT NULL
        )
        ORDER BY last_used DESC
        LIMIT ?
      `).all(options.batchSize * 10) as LegacyCacheEntry[]; // Get larger batch for processing

      console.error(`[CacheMigration] Found ${legacyEntries.length} selector entries to migrate`);

      // Process in batches
      for (let i = 0; i < legacyEntries.length; i += options.batchSize) {
        const batch = legacyEntries.slice(i, i + options.batchSize);
        console.error(`[CacheMigration] Processing selector batch ${Math.floor(i / options.batchSize) + 1} (${batch.length} entries)`);

        for (const entry of batch) {
          try {
            const enhancedEntry = await this.convertLegacySelectorToEnhanced(entry);
            
            if (!options.dryRun) {
              this.insertEnhancedCacheEntry(enhancedEntry);
            }
            
            migrated++;
            
          } catch (error) {
            console.error(`[CacheMigration] Failed to migrate selector entry ${entry.id}:`, error);
            errors++;
            
            if (options.retryFailures) {
              // Could implement retry logic here
            }
          }
        }
      }

    } catch (error) {
      console.error('[CacheMigration] Selector migration failed:', error);
      errors++;
    }

    return { success: errors === 0, migrated, skipped, errors, duration: 0, details };
  }

  /**
   * Migrate test scenarios to enhanced cache key format
   */
  private async migrateTestScenarios(options: MigrationOptions): Promise<MigrationResult> {
    let migrated = 0;
    let skipped = 0; 
    let errors = 0;

    try {
      // Check if test_scenarios table exists
      const tableExists = this.db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='test_scenarios'
      `).get();

      if (!tableExists) {
        console.error('[CacheMigration] test_scenarios table does not exist, skipping test scenario migration');
        return { success: true, migrated, skipped, errors, duration: 0, details: ['Test scenarios table not found - skipped'] };
      }

      // Get all test scenarios
      const testScenarios = this.db.prepare(`
        SELECT * FROM test_scenarios 
        ORDER BY created_at DESC
      `).all() as any[];

      console.error(`[CacheMigration] Found ${testScenarios.length} test scenarios to migrate`);

      for (const scenario of testScenarios) {
        try {
          if (!options.dryRun) {
            await this.migrateTestScenario(scenario);
          }
          migrated++;
          
        } catch (error) {
          console.error(`[CacheMigration] Failed to migrate test scenario ${scenario.name}:`, error);
          errors++;
        }
      }

    } catch (error) {
      console.error('[CacheMigration] Test scenario migration failed:', error);
      errors++;
    }

    return { success: errors === 0, migrated, skipped, errors, duration: 0, details: [] };
  }

  /**
   * Convert legacy selector entry to enhanced format
   */
  private async convertLegacySelectorToEnhanced(entry: LegacyCacheEntry): Promise<EnhancedCacheEntry> {
    // Extract test name from URL path (fallback approach)
    const testName = this.extractTestNameFromURL(entry.url);
    
    // Generate enhanced cache key components
    const keyComponents = this.enhancedKeyManager.generateCacheKeyComponents(
      testName,
      entry.url,
      entry.dom_signature,
      undefined, // No steps for selector-only entries
      'default' // Default profile for legacy entries
    );

    return {
      enhanced_key: this.enhancedKeyManager.serializeEnhancedKey(keyComponents.enhancedKey),
      base_key_hash: keyComponents.baseKey,
      legacy_key_hash: entry.selector_hash,
      test_name_normalized: keyComponents.enhancedKey.test_name_normalized,
      url_pattern: keyComponents.enhancedKey.url_pattern,
      dom_signature: keyComponents.enhancedKey.dom_signature,
      steps_structure_hash: keyComponents.enhancedKey.steps_structure_hash,
      profile: keyComponents.enhancedKey.profile,
      version: keyComponents.enhancedKey.version,
      selector: entry.selector,
      confidence: entry.confidence,
      created_at: entry.created_at,
      last_used: entry.last_used,
      use_count: entry.use_count,
      migration_source: 'legacy'
    };
  }

  /**
   * Migrate individual test scenario
   */
  private async migrateTestScenario(scenario: any): Promise<void> {
    try {
      // Parse steps from JSON
      const steps = JSON.parse(scenario.steps_json || '[]');
      
      // Generate enhanced cache key
      const keyComponents = this.enhancedKeyManager.generateCacheKeyComponents(
        scenario.name,
        scenario.url_pattern,
        undefined, // DOM signature will be generated during runtime
        steps,
        scenario.profile || 'default'
      );

      // Create enhanced entry for test scenario
      const enhancedEntry: EnhancedCacheEntry = {
        enhanced_key: this.enhancedKeyManager.serializeEnhancedKey(keyComponents.enhancedKey),
        base_key_hash: keyComponents.baseKey,
        legacy_key_hash: scenario.pattern_hash, // Use pattern_hash as legacy key
        test_name_normalized: keyComponents.enhancedKey.test_name_normalized,
        url_pattern: keyComponents.enhancedKey.url_pattern,
        dom_signature: keyComponents.enhancedKey.dom_signature,
        steps_structure_hash: keyComponents.enhancedKey.steps_structure_hash,
        profile: keyComponents.enhancedKey.profile,
        version: keyComponents.enhancedKey.version,
        selector: `test-scenario:${scenario.name}`, // Special selector for test scenarios
        confidence: scenario.confidence || 0.8,
        created_at: scenario.created_at,
        last_used: scenario.last_run || scenario.created_at,
        use_count: scenario.total_runs || 1,
        migration_source: 'legacy'
      };

      this.insertEnhancedCacheEntry(enhancedEntry);
      
    } catch (error) {
      console.error(`[CacheMigration] Failed to migrate test scenario ${scenario.name}:`, error);
      throw error;
    }
  }

  /**
   * Insert enhanced cache entry into database
   */
  private insertEnhancedCacheEntry(entry: EnhancedCacheEntry): void {
    const insertStmt = this.db.prepare(`
      INSERT OR REPLACE INTO cache_keys_v2 (
        enhanced_key, base_key_hash, legacy_key_hash, test_name_normalized,
        url_pattern, dom_signature, steps_structure_hash, profile, version,
        selector, confidence, created_at, last_used, use_count, migration_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertStmt.run(
      entry.enhanced_key,
      entry.base_key_hash,
      entry.legacy_key_hash,
      entry.test_name_normalized,
      entry.url_pattern,
      entry.dom_signature,
      entry.steps_structure_hash,
      entry.profile,
      entry.version,
      entry.selector,
      entry.confidence,
      entry.created_at,
      entry.last_used,
      entry.use_count,
      entry.migration_source
    );
  }

  /**
   * Extract test name from URL (fallback method)
   */
  private extractTestNameFromURL(url: string): string {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part.length > 0);
      
      // Use the last meaningful path component as test name
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && lastPart !== 'index' && lastPart !== 'home') {
        return lastPart.replace(/[-_]/g, ' ');
      }
      
      // Fallback to domain-based name
      const domain = urlObj.hostname.replace(/^www\./, '');
      return `${domain} page`;
      
    } catch (error) {
      // Final fallback
      return 'unknown test';
    }
  }

  /**
   * Validate migration results
   */
  private async validateMigration(): Promise<{ isValid: boolean; details: string }> {
    try {
      // Check if enhanced table has entries
      const enhancedCount = this.db.prepare('SELECT COUNT(*) as count FROM cache_keys_v2').get() as { count: number };
      
      // Check if all legacy entries have been migrated
      const unmigrated = this.db.prepare(`
        SELECT COUNT(*) as count FROM selector_cache_v2 
        WHERE selector_hash NOT IN (
          SELECT legacy_key_hash FROM cache_keys_v2 
          WHERE legacy_key_hash IS NOT NULL
        )
      `).get() as { count: number };

      const isValid = enhancedCount.count > 0 && unmigrated.count === 0;
      const details = `Enhanced entries: ${enhancedCount.count}, Unmigrated legacy: ${unmigrated.count}`;

      return { isValid, details };

    } catch (error) {
      return { isValid: false, details: `Validation failed: ${error}` };
    }
  }

  /**
   * Get migration status
   */
  getMigrationStatus(): {
    isComplete: boolean;
    enhancedEntries: number;
    legacyEntries: number;
    unmigratedEntries: number;
  } {
    try {
      const enhancedCount = this.db.prepare('SELECT COUNT(*) as count FROM cache_keys_v2').get() as { count: number };
      
      const legacyCount = this.db.prepare('SELECT COUNT(*) as count FROM selector_cache_v2').get() as { count: number };
      
      const unmigratedCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM selector_cache_v2 
        WHERE selector_hash NOT IN (
          SELECT legacy_key_hash FROM cache_keys_v2 
          WHERE legacy_key_hash IS NOT NULL
        )
      `).get() as { count: number };

      return {
        isComplete: unmigratedCount.count === 0,
        enhancedEntries: enhancedCount.count,
        legacyEntries: legacyCount.count,
        unmigratedEntries: unmigratedCount.count
      };

    } catch (error) {
      console.error('[CacheMigration] Status check failed:', error);
      return {
        isComplete: false,
        enhancedEntries: 0,
        legacyEntries: 0,
        unmigratedEntries: 0
      };
    }
  }

  /**
   * Rollback migration (if needed for emergency)
   */
  rollbackMigration(): boolean {
    try {
      console.error('[CacheMigration] Rolling back enhanced cache key migration...');
      
      // Drop enhanced table (preserving legacy data)
      this.db.exec('DROP TABLE IF EXISTS cache_keys_v2');
      
      console.error('[CacheMigration] Migration rollback completed');
      return true;
      
    } catch (error) {
      console.error('[CacheMigration] Rollback failed:', error);
      return false;
    }
  }
}

// Types are already exported above as interface declarations