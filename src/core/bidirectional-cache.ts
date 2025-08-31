import Database from 'better-sqlite3';
import { SmartNormalizer, NormalizationResult } from './smart-normalizer.js';
import crypto from 'crypto';
import * as path from 'path';
import { ProjectPaths } from '../utils/project-paths.js';
import * as fs from 'fs';

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

interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'assert' | 'screenshot';
  target?: string;
  value?: string;
  selector?: string;
  timeout?: number;
  description: string;
}

interface TestScenario {
  name: string;
  description?: string;
  steps: TestStep[];
  tags?: string[];
  urlPattern: string;
  profile?: string;
}

export class BidirectionalCache {
  private db: Database.Database;
  private normalizer: SmartNormalizer;
  private cleanupTimer?: NodeJS.Timeout;
  private options: Required<CacheOptions>;
  private cacheDir: string;
  private stats = {
    hits: { exact: 0, normalized: 0, reverse: 0, fuzzy: 0 },
    misses: 0,
    sets: 0,
    learnings: 0
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
    
    // Create cache directory
    this.cacheDir = ProjectPaths.getCacheDir();
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Initialize database
    const dbPath = path.join(this.cacheDir, 'bidirectional-cache.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    
    this.initializeDatabase();
    this.startCleanupTimer();
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
      console.error('[BidirectionalCache] Migration skipped (old cache not found):', error.message);
    }
  }

  async set(input: string, url: string, selector: string): Promise<void> {
    const now = Date.now();
    const selectorHash = this.createSelectorHash(selector);
    const normalizedResult = this.normalizer.normalize(input);

    try {
      // Begin transaction
      const transaction = this.db.transaction(() => {
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
      });

      transaction();
      this.stats.sets++;

      // 3. Learn from related inputs (async, non-blocking)
      setImmediate(() => this.learnRelatedInputs(selectorHash, input, url, normalizedResult));

    } catch (error) {
      console.error('[BidirectionalCache] Set error:', error);
    }
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
          const similarity = this.calculateJaccardSimilarity(
            normalizedResult.tokens,
            candidateTokens
          );

          // Boost score based on success count and confidence
          const boostedScore = similarity * 
            (1 + Math.log(1 + candidate.success_count) * 0.1) *
            candidate.confidence;

          console.error(`[BidirectionalCache] Reverse candidate: inputs="${candidate.all_inputs}" → ${candidate.selector} (similarity: ${similarity.toFixed(3)}, boosted: ${boostedScore.toFixed(3)})`);
          
          if (boostedScore > 0.15 && boostedScore > bestScore) {
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

  private calculateJaccardSimilarity(set1: string[], set2: string[]): number {
    if (set1.length === 0 && set2.length === 0) return 1.0;
    if (set1.length === 0 || set2.length === 0) return 0.0;
    
    // Direct intersection
    const directIntersection = set1.filter(x => set2.includes(x));
    
    // Semantic intersection (synonyms)
    const semanticIntersection = [];
    const synonyms = {
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
    try {
      const now = Date.now();
      const selectorHash = this.createSelectorHash(selector);
      
      const stmt = this.db.prepare(`
        UPDATE selector_cache_v2 
        SET last_used = ?, use_count = use_count + 1
        WHERE selector_hash = ? AND url = ?
      `);
      
      stmt.run(now, selectorHash, url);
    } catch (error) {
      console.error('[BidirectionalCache] Update usage error:', error);
    }
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
    try {
      const now = Date.now();
      
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

    } catch (error) {
      console.error('[BidirectionalCache] Cleanup error:', error);
    }
  }

  async getStats(): Promise<any> {
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
        hits: { exact: 0, normalized: 0, reverse: 0, fuzzy: 0 },
        misses: 0,
        sets: 0,
        learnings: 0
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
  async getSnapshot(key: object, profile?: string): Promise<any | null> {
    try {
      const cacheKey = this.createCacheKey(key);
      const now = Date.now();
      
      const stmt = this.db.prepare(`
        SELECT snapshot_data, hit_count, created_at, ttl
        FROM snapshot_cache
        WHERE cache_key = ? AND (profile = ? OR (profile IS NULL AND ? IS NULL))
        AND (created_at + ttl) > ?
      `);
      
      const result = stmt.get(cacheKey, profile || null, profile || null, now) as {
        snapshot_data: string;
        hit_count: number;
        created_at: number;
        ttl: number;
      } | undefined;
      
      if (result) {
        // Update hit count and last used
        const updateStmt = this.db.prepare(`
          UPDATE snapshot_cache 
          SET last_used = ?, hit_count = hit_count + 1
          WHERE cache_key = ? AND (profile = ? OR (profile IS NULL AND ? IS NULL))
        `);
        updateStmt.run(now, cacheKey, profile || null, profile || null);
        
        return JSON.parse(result.snapshot_data);
      }
    } catch (error) {
      console.error('[BidirectionalCache] Get snapshot error:', error);
    }
    return null;
  }

  async setSnapshot(key: object, value: any, options: { url?: string; profile?: string; ttl?: number } = {}): Promise<void> {
    try {
      const cacheKey = this.createCacheKey(key);
      const now = Date.now();
      const ttl = options.ttl ?? this.options.snapshotTTL;
      
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO snapshot_cache
        (cache_key, url, dom_hash, snapshot_data, profile, created_at, last_used, ttl, hit_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `);
      
      // Extract DOM hash from key if available
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
        ttl
      );
      
    } catch (error) {
      console.error('[BidirectionalCache] Set snapshot error:', error);
    }
  }

  async invalidateSnapshots(options: { url?: string; profile?: string } = {}): Promise<void> {
    try {
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
      
    } catch (error) {
      console.error('[BidirectionalCache] Invalidate snapshots error:', error);
    }
  }

  async getSnapshotMetrics(): Promise<any> {
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

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.db.close();
  }
}