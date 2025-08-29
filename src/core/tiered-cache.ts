import { LRUCache } from 'lru-cache';
import { BidirectionalCache } from './bidirectional-cache.js';

interface CacheEntry {
  selector: string;
  confidence: number;
  source: 'exact' | 'normalized' | 'reverse' | 'fuzzy';
  cached: boolean;
  timestamp: number;
}

interface TieredCacheOptions {
  memorySize?: number;
  memoryTTL?: number;
  preloadCommonSelectors?: boolean;
}

export class TieredCache {
  private memoryCache: LRUCache<string, CacheEntry>;
  private bidirectionalCache: BidirectionalCache;
  private stats = {
    memoryHits: 0,
    sqliteHits: 0,
    misses: 0,
    totalRequests: 0
  };

  constructor(
    bidirectionalCache: BidirectionalCache, 
    options: TieredCacheOptions = {}
  ) {
    this.bidirectionalCache = bidirectionalCache;
    
    // Initialize LRU memory cache
    this.memoryCache = new LRUCache<string, CacheEntry>({
      max: options.memorySize ?? 100,
      ttl: options.memoryTTL ?? 300000, // 5 minutes
      updateAgeOnGet: true,
      updateAgeOnHas: true
    });

    // Preload common selectors if requested
    if (options.preloadCommonSelectors) {
      this.preloadCommonSelectors();
    }
  }

  async get(input: string, url: string): Promise<CacheEntry | null> {
    this.stats.totalRequests++;
    const memoryKey = this.createMemoryKey(input, url);

    // L1: Memory Cache (0.1ms)
    if (this.memoryCache.has(memoryKey)) {
      const cached = this.memoryCache.get(memoryKey);
      if (cached) {
        this.stats.memoryHits++;
        console.error(`[TieredCache] Memory HIT for "${input}": ${cached.selector} (${cached.source})`);
        return cached;
      }
    }

    // L2: SQLite Cache (1-5ms)  
    const result = await this.bidirectionalCache.get(input, url);
    
    if (result) {
      this.stats.sqliteHits++;
      const cacheEntry: CacheEntry = {
        ...result,
        timestamp: Date.now()
      };
      
      // Store in memory for next time
      this.memoryCache.set(memoryKey, cacheEntry);
      
      // Also cache variations for better hit rate
      await this.cacheVariations(input, url, cacheEntry);
      
      console.error(`[TieredCache] SQLite HIT for "${input}": ${result.selector} (${result.source})`);
      return cacheEntry;
    }

    this.stats.misses++;
    console.error(`[TieredCache] MISS for "${input}"`);
    return null;
  }

  async set(input: string, url: string, selector: string): Promise<void> {
    // Store in SQLite (persistent)
    await this.bidirectionalCache.set(input, url, selector);
    
    // Store in memory (fast access)
    const memoryKey = this.createMemoryKey(input, url);
    const cacheEntry: CacheEntry = {
      selector,
      confidence: 0.8, // New entries start with good confidence
      source: 'exact',
      cached: true,
      timestamp: Date.now()
    };
    
    this.memoryCache.set(memoryKey, cacheEntry);
    
    // Preemptively cache common variations
    await this.cacheVariations(input, url, cacheEntry);
    
    console.error(`[TieredCache] STORED "${input}" → ${selector}`);
  }

  private createMemoryKey(input: string, url: string): string {
    return `${input.toLowerCase().trim()}|${url}`;
  }

  private async cacheVariations(input: string, url: string, cacheEntry: CacheEntry): Promise<void> {
    // Generate and cache common variations
    const variations = this.generateInputVariations(input);
    
    for (const variation of variations) {
      const varKey = this.createMemoryKey(variation, url);
      if (!this.memoryCache.has(varKey)) {
        // Store with slightly lower confidence
        const varEntry: CacheEntry = {
          ...cacheEntry,
          confidence: cacheEntry.confidence * 0.95,
          source: 'normalized'
        };
        this.memoryCache.set(varKey, varEntry);
      }
    }
  }

  private generateInputVariations(input: string): string[] {
    const variations = new Set<string>();
    
    // Basic variations
    variations.add(input.toLowerCase());
    variations.add(input.toLowerCase().trim());
    variations.add(input.replace(/\s+/g, ' ').trim());
    
    // Remove articles
    variations.add(input.replace(/\b(the|a|an)\s+/gi, '').trim());
    
    // Action variations
    const actionMappings = [
      ['click', 'press', 'tap', 'hit'],
      ['type', 'enter', 'input', 'fill'],
      ['select', 'choose', 'pick']
    ];
    
    for (const synonyms of actionMappings) {
      for (let i = 0; i < synonyms.length; i++) {
        for (let j = 0; j < synonyms.length; j++) {
          if (i !== j) {
            const regex = new RegExp(`\\b${synonyms[i]}\\b`, 'gi');
            if (regex.test(input)) {
              variations.add(input.replace(regex, synonyms[j]));
            }
          }
        }
      }
    }
    
    // Remove "button" suffix
    variations.add(input.replace(/\s+button\s*$/i, '').trim());
    
    // Limit variations to prevent memory bloat
    return Array.from(variations).slice(0, 8);
  }

  private async preloadCommonSelectors(): Promise<void> {
    // This would preload frequently used selectors
    // Implementation depends on having historical data
    try {
      const stats = await this.bidirectionalCache.getStats();
      console.error(`[TieredCache] Preloading enabled - ${stats.storage?.unique_selectors || 0} selectors available`);
    } catch (error) {
      console.error('[TieredCache] Preload failed:', error);
    }
  }

  async invalidateForUrl(url: string): Promise<void> {
    // Clear memory cache entries for this URL
    const keysToDelete: string[] = [];
    
    for (const [key] of this.memoryCache.entries()) {
      if (key.endsWith(`|${url}`)) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.memoryCache.delete(key);
    }
    
    console.error(`[TieredCache] Invalidated ${keysToDelete.length} memory entries for ${url}`);
  }

  async clear(): Promise<void> {
    this.memoryCache.clear();
    await this.bidirectionalCache.clear();
    
    // Reset stats
    this.stats = {
      memoryHits: 0,
      sqliteHits: 0,
      misses: 0,
      totalRequests: 0
    };
    
    console.error('[TieredCache] All caches cleared');
  }

  getStats(): any {
    const memoryHitRate = this.stats.totalRequests > 0 
      ? (this.stats.memoryHits / this.stats.totalRequests) * 100
      : 0;
    
    const sqliteHitRate = this.stats.totalRequests > 0
      ? (this.stats.sqliteHits / this.stats.totalRequests) * 100  
      : 0;
      
    const overallHitRate = this.stats.totalRequests > 0
      ? ((this.stats.memoryHits + this.stats.sqliteHits) / this.stats.totalRequests) * 100
      : 0;

    return {
      tiered: {
        memoryHitRate: Math.round(memoryHitRate * 10) / 10,
        sqliteHitRate: Math.round(sqliteHitRate * 10) / 10,
        overallHitRate: Math.round(overallHitRate * 10) / 10,
        totalRequests: this.stats.totalRequests,
        memorySize: this.memoryCache.size,
        memoryMax: this.memoryCache.max
      },
      breakdown: {
        memoryHits: this.stats.memoryHits,
        sqliteHits: this.stats.sqliteHits,
        misses: this.stats.misses
      }
    };
  }

  // Enhanced wrapper for MCP server integration
  async wrapSelectorOperation<T>(
    description: string,
    url: string,
    operation: (selector: string) => Promise<T>,
    fallbackSelector?: string
  ): Promise<{ result: T; cached: boolean; selector: string }> {
    
    // Try cache first
    const cached = await this.get(description, url);
    if (cached) {
      console.error(`[TieredCache] Cache HIT for "${description}": ${cached.selector}`);
      
      // ALWAYS validate cached selectors in production - no blind trust!
      // High confidence selectors still need validation for critical operations
      try {
        const startTime = Date.now();
        const result = await operation(cached.selector);
        const duration = Date.now() - startTime;
        console.error(`[TieredCache] ✅ VALIDATED cached selector [${duration}ms]: ${cached.selector}`);
        
        // Boost confidence on successful validation
        await this.set(description, url, cached.selector);
        
        return { 
          result, 
          cached: true, 
          selector: cached.selector 
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[TieredCache] ❌ CACHED SELECTOR FAILED: ${cached.selector} → ${errorMsg.substring(0, 100)}`);
        
        // CRITICAL: Invalidate failed selector from cache
        const memKey = this.createMemoryKey(description, url);
        this.memoryCache.delete(memKey);
        
        // Also remove from bidirectional cache to prevent reuse
        await this.bidirectionalCache.invalidateSelector(cached.selector, url);
      }
    }

    // Generate UNIVERSAL fallback selectors
    const universalFallbacks = this.generateUniversalFallbacks(description, fallbackSelector);
    
    console.error(`[TieredCache] Trying ${universalFallbacks.length} universal fallbacks for "${description}"`);
    
    let lastError;
    for (let i = 0; i < universalFallbacks.length; i++) {
      const currentSelector = universalFallbacks[i];
      console.error(`[TieredCache] Fallback ${i+1}/${universalFallbacks.length}: "${currentSelector}"`);
      
      try {
        const startTime = Date.now();
        const result = await operation(currentSelector);
        const duration = Date.now() - startTime;
        
        // Cache successful operation
        await this.set(description, url, currentSelector);
        console.error(`[TieredCache] ✅ SUCCESS fallback #${i+1} [${duration}ms]: "${currentSelector}" → now cached`);
        
        return { 
          result, 
          cached: false, 
          selector: currentSelector,
          performance: { duration, fallbackIndex: i + 1 }
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[TieredCache] ❌ FAILED fallback #${i+1}: "${currentSelector}" → ${errorMsg.substring(0, 100)}`);
        lastError = error;
        continue;
      }
    }
    
    console.error(`[TieredCache] ALL fallbacks failed for "${description}"`);
    throw lastError || new Error('All universal fallback strategies failed');
  }

  /**
   * Extract pure text content from selector descriptions
   * Handles various selector patterns to get the actual text we're looking for
   */
  private extractTextFromSelector(description: string): string | null {
    // Common selector patterns to extract text from
    const patterns = [
      /:has-text\(["']([^"']+)["']\)/, // :has-text("text")
      /:has-text\(([^)]+)\)/,          // :has-text(text) without quotes
      /text=["']([^"']+)["']/,         // text="text"
      /text=([^"'\s)]+)/,              // text=text without quotes
      /["']([^"']+)["']/               // Any quoted text
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // If no pattern matches, check if it's a simple text description
    // Remove common selector prefixes and suffixes
    const cleaned = description
      .replace(/^(button|a|span|div|input)[:|\s]/i, '')
      .replace(/:first.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    return cleaned || null;
  }

  /**
   * Generate UNIVERSAL fallback selectors - works for ANY element type on ANY website
   * No hardcoded assumptions about buttons, links, apps, or frameworks
   */
  private generateUniversalFallbacks(description: string, originalSelector: string | null): string[] {
    const fallbacks: string[] = [];
    
    // Use original selector first if provided
    if (originalSelector && originalSelector.trim()) {
      fallbacks.push(originalSelector.trim());
    }
    
    // Extract PURE TEXT CONTENT from description (not full selectors)
    const extractedText = this.extractTextFromSelector(description);
    const cleanDescription = extractedText || description.trim();
    
    console.error(`[TieredCache] Text extraction: "${description}" → "${cleanDescription}"${extractedText ? ' (extracted)' : ' (original)'}`);
    
    if (cleanDescription && cleanDescription.length > 0) {
      // Fix common Playwright syntax errors first
      const fixedOriginal = originalSelector
        ?.replace(/:text\(/g, ':has-text(')     // Fix :text() → :has-text()
        ?.replace(/:first\b/g, ':first-of-type') // Fix :first → :first-of-type
        ?.replace(/\btext\(/g, 'text=');        // Fix text() → text=
      
      if (fixedOriginal && fixedOriginal !== originalSelector) {
        console.error(`[TieredCache] Syntax fixed: "${originalSelector}" → "${fixedOriginal}"`);
        fallbacks.push(fixedOriginal);
      }
      
      // UNIVERSAL selectors - work with ANY element type
      fallbacks.push(
        // Pure text matching (most generic)
        `text="${cleanDescription}"`,
        `text=${cleanDescription}`,
        
        // Any clickable element containing text
        `*:has-text("${cleanDescription}")`,
        
        // ARIA-compliant clickable elements
        `[role="button"]:has-text("${cleanDescription}")`,
        `[role="link"]:has-text("${cleanDescription}")`,
        `[role="menuitem"]:has-text("${cleanDescription}")`,
        
        // Any element with click handlers (universal)
        `[onclick]:has-text("${cleanDescription}")`,
        `[ng-click]:has-text("${cleanDescription}")`,
        `[v-on\\:click]:has-text("${cleanDescription}")`,
        
        // Attribute-based matching (framework agnostic)
        `[aria-label*="${cleanDescription}"]`,
        `[title*="${cleanDescription}"]`,
        `[alt*="${cleanDescription}"]`,
        `[data-testid*="${cleanDescription.toLowerCase().replace(/\s+/g, '-')}"]`,
        
        // Common interactive elements (but no hardcoded assumptions)
        `button:has-text("${cleanDescription}")`,
        `a:has-text("${cleanDescription}")`,
        `input[value*="${cleanDescription}"]`,
        `span:has-text("${cleanDescription}")`,
        `div:has-text("${cleanDescription}")`,
        
        // Nested text content
        `* >> text="${cleanDescription}"`,
        `* >> text=${cleanDescription}`,
        
        // Visible elements only (performance optimization)
        `*:visible:has-text("${cleanDescription}")`
      );
      
      // Handle :first modifiers universally
      if (cleanDescription.toLowerCase().includes('first')) {
        const baseText = cleanDescription.replace(/\s*(first|:first)\s*/gi, '').trim();
        if (baseText && baseText !== cleanDescription) {
          fallbacks.push(
            `*:has-text("${baseText}"):first-of-type`,
            `button:has-text("${baseText}"):first-of-type`,
            `a:has-text("${baseText}"):first-of-type`,
            `[role="button"]:has-text("${baseText}"):first-of-type`
          );
        }
      }
    }
    
    // Remove duplicates while preserving order
    return [...new Set(fallbacks.filter(Boolean))];
  }

  close(): void {
    this.memoryCache.clear();
    this.bidirectionalCache.close();
  }
}