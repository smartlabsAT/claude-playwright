import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import crypto from 'crypto';

interface CacheEntry {
  id?: number;
  cache_key: string;
  cache_type: 'selector' | 'state' | 'snapshot';
  url: string;
  data: string;
  ttl: number;
  created_at: number;
  accessed_at: number;
  hit_count: number;
  profile?: string;
}

interface CacheOptions {
  maxSizeMB?: number;
  selectorTTL?: number;
  stateTTL?: number;
  snapshotTTL?: number;
  cleanupInterval?: number;
}

export class CacheManager {
  private db: Database.Database;
  private cleanupTimer?: NodeJS.Timeout;
  private options: Required<CacheOptions>;
  private cacheDir: string;

  constructor(options: CacheOptions = {}) {
    this.options = {
      maxSizeMB: options.maxSizeMB ?? 50,
      selectorTTL: options.selectorTTL ?? 300000, // 5 minutes
      stateTTL: options.stateTTL ?? 2000, // 2 seconds
      snapshotTTL: options.snapshotTTL ?? 1800000, // 30 minutes
      cleanupInterval: options.cleanupInterval ?? 60000 // 1 minute
    };

    // Create cache directory
    this.cacheDir = path.join(os.homedir(), '.claude-playwright', 'cache');
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }

    // Initialize database
    const dbPath = path.join(this.cacheDir, 'selector-cache.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    
    this.initializeDatabase();
    this.startCleanupTimer();
  }

  private initializeDatabase(): void {
    // Create cache table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_key TEXT NOT NULL,
        cache_type TEXT NOT NULL,
        url TEXT NOT NULL,
        data TEXT NOT NULL,
        ttl INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        accessed_at INTEGER NOT NULL,
        hit_count INTEGER DEFAULT 0,
        profile TEXT,
        UNIQUE(cache_key, cache_type, profile)
      );

      CREATE INDEX IF NOT EXISTS idx_cache_key ON cache(cache_key);
      CREATE INDEX IF NOT EXISTS idx_cache_type ON cache(cache_type);
      CREATE INDEX IF NOT EXISTS idx_url ON cache(url);
      CREATE INDEX IF NOT EXISTS idx_ttl ON cache(created_at, ttl);
      CREATE INDEX IF NOT EXISTS idx_profile ON cache(profile);

      -- Metrics table for performance tracking
      CREATE TABLE IF NOT EXISTS cache_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cache_type TEXT NOT NULL,
        hits INTEGER DEFAULT 0,
        misses INTEGER DEFAULT 0,
        evictions INTEGER DEFAULT 0,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  private generateCacheKey(input: string | object): string {
    const data = typeof input === 'string' ? input : JSON.stringify(input);
    return crypto.createHash('md5').update(data).digest('hex');
  }

  async get(
    key: string | object,
    type: 'selector' | 'state' | 'snapshot',
    profile?: string
  ): Promise<any | null> {
    const cacheKey = this.generateCacheKey(key);
    const now = Date.now();

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM cache 
        WHERE cache_key = ? 
        AND cache_type = ? 
        AND (profile = ? OR (profile IS NULL AND ? IS NULL))
        AND (created_at + ttl) > ?
      `);

      const entry = stmt.get(cacheKey, type, profile, profile, now) as CacheEntry | undefined;

      if (entry) {
        // Update hit count and access time
        const updateStmt = this.db.prepare(`
          UPDATE cache 
          SET hit_count = hit_count + 1, accessed_at = ?
          WHERE id = ?
        `);
        updateStmt.run(now, entry.id);

        this.recordHit(type);
        return JSON.parse(entry.data);
      }

      this.recordMiss(type);
      return null;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set(
    key: string | object,
    value: any,
    type: 'selector' | 'state' | 'snapshot',
    options: { url?: string; profile?: string; ttl?: number } = {}
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(key);
    const now = Date.now();
    const ttl = options.ttl ?? this.getTTLForType(type);

    try {
      // Check cache size and evict if necessary
      await this.evictIfNeeded();

      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO cache 
        (cache_key, cache_type, url, data, ttl, created_at, accessed_at, hit_count, profile)
        VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `);

      stmt.run(
        cacheKey,
        type,
        options.url || '',
        JSON.stringify(value),
        ttl,
        now,
        now,
        options.profile
      );
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async invalidate(options: { url?: string; type?: string; profile?: string } = {}): Promise<void> {
    let query = 'DELETE FROM cache WHERE 1=1';
    const params: any[] = [];

    if (options.url) {
      query += ' AND url = ?';
      params.push(options.url);
    }

    if (options.type) {
      query += ' AND cache_type = ?';
      params.push(options.type);
    }

    if (options.profile !== undefined) {
      query += ' AND (profile = ? OR (profile IS NULL AND ? IS NULL))';
      params.push(options.profile, options.profile);
    }

    try {
      const stmt = this.db.prepare(query);
      const result = stmt.run(...params);
      
      if (result.changes > 0) {
        this.recordEvictions(result.changes);
      }
    } catch (error) {
      console.error('Cache invalidate error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      this.db.exec('DELETE FROM cache');
      this.db.exec('DELETE FROM cache_metrics');
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  private getTTLForType(type: 'selector' | 'state' | 'snapshot'): number {
    switch (type) {
      case 'selector':
        return this.options.selectorTTL;
      case 'state':
        return this.options.stateTTL;
      case 'snapshot':
        return this.options.snapshotTTL;
      default:
        return this.options.selectorTTL;
    }
  }

  private async evictIfNeeded(): Promise<void> {
    try {
      // Get database size
      const stats = fs.statSync(path.join(this.cacheDir, 'selector-cache.db'));
      const sizeMB = stats.size / (1024 * 1024);

      if (sizeMB > this.options.maxSizeMB) {
        // Evict least recently used entries
        const result = this.db.prepare('SELECT COUNT(*) as count FROM cache').get() as { count: number };
        const deleteCount = Math.floor(result.count * 0.2);
        
        const stmt = this.db.prepare(`
          DELETE FROM cache 
          WHERE id IN (
            SELECT id FROM cache 
            ORDER BY accessed_at ASC 
            LIMIT ?
          )
        `);
        
        const deleteResult = stmt.run(deleteCount);
        if (deleteResult.changes > 0) {
          this.recordEvictions(deleteResult.changes);
        }
      }
    } catch (error) {
      console.error('Eviction error:', error);
    }
  }

  private cleanup(): void {
    try {
      const now = Date.now();
      const stmt = this.db.prepare('DELETE FROM cache WHERE (created_at + ttl) < ?');
      const result = stmt.run(now);
      
      if (result.changes > 0) {
        this.recordEvictions(result.changes);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupInterval);
  }

  private recordHit(type: string): void {
    this.updateMetrics(type, 'hits');
  }

  private recordMiss(type: string): void {
    this.updateMetrics(type, 'misses');
  }

  private recordEvictions(count: number): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO cache_metrics (cache_type, evictions, timestamp)
        VALUES ('all', ?, ?)
      `);
      stmt.run(count, Date.now());
    } catch (error) {
      console.error('Metrics error:', error);
    }
  }

  private updateMetrics(type: string, metric: 'hits' | 'misses'): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO cache_metrics (cache_type, ${metric}, timestamp)
        VALUES (?, 1, ?)
      `);
      stmt.run(type, Date.now());
    } catch (error) {
      console.error('Metrics error:', error);
    }
  }

  async getMetrics(): Promise<any> {
    try {
      const stmt = this.db.prepare(`
        SELECT 
          cache_type,
          SUM(hits) as total_hits,
          SUM(misses) as total_misses,
          SUM(evictions) as total_evictions
        FROM cache_metrics
        GROUP BY cache_type
      `);
      
      return stmt.all();
    } catch (error) {
      console.error('Get metrics error:', error);
      return [];
    }
  }

  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.db.close();
  }
}