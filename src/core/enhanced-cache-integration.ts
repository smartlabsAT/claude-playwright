import { Page } from 'playwright';
import { BidirectionalCache } from './bidirectional-cache.js';
import { TieredCache } from './tiered-cache.js';
import type { PerformanceMetrics, SnapshotData, CacheStats, TestStep } from '../types/common.js';

export class EnhancedCacheIntegration {
  private static instance: EnhancedCacheIntegration | null = null;
  private bidirectionalCache: BidirectionalCache;
  private tieredCache: TieredCache;
  private currentPage?: Page;
  private currentUrl: string = '';
  private currentProfile?: string;
  private navigationCount: number = 0;

  private constructor() {
    // Initialize new bidirectional cache system
    this.bidirectionalCache = new BidirectionalCache({
      maxSizeMB: 50,
      selectorTTL: 300000, // 5 minutes
      cleanupInterval: 60000, // 1 minute
      maxVariationsPerSelector: 15
    });
    
    // Add tiered cache layer (memory + SQLite)
    this.tieredCache = new TieredCache(this.bidirectionalCache, {
      memorySize: 100,
      memoryTTL: 300000, // 5 minutes
      preloadCommonSelectors: true
    });

    
    console.error('[EnhancedCache] Initialized bidirectional cache system');
  }

  static getInstance(): EnhancedCacheIntegration {
    if (!EnhancedCacheIntegration.instance) {
      EnhancedCacheIntegration.instance = new EnhancedCacheIntegration();
    }
    return EnhancedCacheIntegration.instance;
  }

  setPage(page: Page, url: string, profile?: string): void {
    this.currentPage = page;
    this.currentUrl = url;
    this.currentProfile = profile;
    
    
    // Setup page event listeners for cache invalidation
    this.setupPageListeners(page);
    
    console.error(`[EnhancedCache] Context set for ${url} (profile: ${profile || 'default'})`);
  }

  private setupPageListeners(page: Page): void {
    // Invalidate cache on navigation
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const newUrl = frame.url();
        if (newUrl !== this.currentUrl) {
          console.error(`[EnhancedCache] Navigation detected: ${this.currentUrl} -> ${newUrl}`);
          await this.handleNavigation(newUrl);
        }
      }
    });

  }

  private async handleNavigation(newUrl: string): Promise<void> {
    this.navigationCount++;
    
    // Invalidate memory cache for old URL
    await this.tieredCache.invalidateForUrl(this.currentUrl);
    
    // Update current URL
    this.currentUrl = newUrl;
    
    
    console.error(`[EnhancedCache] Navigation handled, count: ${this.navigationCount}`);
  }

  // Enhanced selector operations using bidirectional cache
  async getCachedSelector(description: string): Promise<any | null> {
    const result = await this.tieredCache.get(description, this.currentUrl);
    return result ? {
      selector: result.selector,
      strategy: 'cached',
      confidence: result.confidence,
      source: result.source
    } : null;
  }

  async cacheSelector(description: string, selector: string, strategy: string = 'css'): Promise<void> {
    await this.tieredCache.set(description, this.currentUrl, selector);
    console.error(`[EnhancedCache] Cached "${description}" -> ${selector}`);
  }

  // Enhanced wrapper for MCP operations
  async wrapSelectorOperation<T>(
    description: string,
    operation: (selector: string) => Promise<T>,
    fallbackSelector: string
  ): Promise<{ result: T; cached: boolean; performance: any }> {
    const startTime = Date.now();
    
    try {
      const wrappedResult = await this.tieredCache.wrapSelectorOperation(
        description,
        this.currentUrl,
        operation,
        fallbackSelector
      );
      
      const endTime = Date.now();
      return {
        ...wrappedResult,
        performance: {
          duration: endTime - startTime,
          cacheHit: wrappedResult.cached
        }
      };
    } catch (error) {
      const endTime = Date.now();
      console.error(`[EnhancedCache] Operation failed after ${endTime - startTime}ms:`, error);
      throw error;
    }
  }

  // Enhanced wrapper with Phase 2.2 enhanced cache key support
  async wrapSelectorOperationEnhanced<T>(
    testName: string,
    description: string,
    url: string,
    operation: (selector: string) => Promise<T>,
    steps?: any[],
    profile?: string,
    page?: any
  ): Promise<{ result: T; cached: boolean; performance: any }> {
    const startTime = Date.now();
    
    try {
      // Use enhanced cache key system for lookup
      const enhancedResult = await this.bidirectionalCache.getEnhanced(
        testName,
        url,
        steps,
        profile || this.currentProfile || 'default',
        page || this.currentPage
      );

      if (enhancedResult) {
        // Try cached selector
        try {
          const result = await operation(enhancedResult.selector);
          const endTime = Date.now();
          
          console.error(`[EnhancedCache] ✅ Enhanced cache HIT: ${testName} → ${enhancedResult.selector} [${endTime - startTime}ms]`);
          
          return {
            result,
            cached: true,
            performance: {
              duration: endTime - startTime,
              cacheHit: true,
              source: enhancedResult.source
            }
          };
        } catch (error) {
          console.error(`[EnhancedCache] Enhanced cache selector failed, will learn new one:`, error);
        }
      }

      // No cached result or cached selector failed - need to find working selector
      // For now, use the fallback approach until we have full selector discovery
      const fallbackSelector = description; // Use description as selector attempt
      
      try {
        const result = await operation(fallbackSelector);
        
        // Learn this working selector with enhanced cache key system
        await this.bidirectionalCache.setEnhanced(
          testName,
          description,
          url,
          fallbackSelector,
          steps,
          profile || this.currentProfile || 'default',
          page || this.currentPage
        );

        const endTime = Date.now();
        console.error(`[EnhancedCache] ✅ Enhanced cache MISS → LEARN: ${testName} → ${fallbackSelector} [${endTime - startTime}ms]`);
        
        return {
          result,
          cached: false,
          performance: {
            duration: endTime - startTime,
            cacheHit: false,
            learned: true
          }
        };
      } catch (error) {
        const endTime = Date.now();
        console.error(`[EnhancedCache] ❌ Enhanced operation failed after ${endTime - startTime}ms:`, error);
        throw error;
      }

    } catch (error) {
      const endTime = Date.now();
      console.error(`[EnhancedCache] Enhanced operation failed after ${endTime - startTime}ms:`, error);
      throw error;
    }
  }

  // Snapshot operations (using bidirectional cache)
  async getCachedSnapshot(): Promise<any | null> {
    if (!this.currentPage) return null;
    
    try {
      // Create cache key from current URL and DOM hash
      const domHash = await this.computeDomHash();
      const key = { url: this.currentUrl, domHash };
      
      return await this.bidirectionalCache.getSnapshot(key, this.currentProfile);
    } catch (error) {
      console.error('[EnhancedCache] Get snapshot error:', error);
      return null;
    }
  }

  async cacheSnapshot(snapshot: any): Promise<void> {
    if (!this.currentPage) return;
    
    try {
      const domHash = await this.computeDomHash();
      const key = { url: this.currentUrl, domHash };
      
      await this.bidirectionalCache.setSnapshot(key, snapshot, {
        url: this.currentUrl,
        profile: this.currentProfile
      });
      
      console.error(`[EnhancedCache] Cached snapshot for ${this.currentUrl}`);
    } catch (error) {
      console.error('[EnhancedCache] Cache snapshot error:', error);
    }
  }

  async getOrCreateSnapshot(): Promise<any> {
    // First try to get cached snapshot
    const cached = await this.getCachedSnapshot();
    if (cached) {
      return cached;
    }
    
    // Create new snapshot if page exists
    if (!this.currentPage) {
      throw new Error('No page context available for snapshot');
    }
    
    try {
      const snapshot = await this.currentPage.accessibility.snapshot();
      await this.cacheSnapshot(snapshot);
      return snapshot;
    } catch (error) {
      console.error('[EnhancedCache] Create snapshot error:', error);
      throw error;
    }
  }

  private async computeDomHash(): Promise<string> {
    if (!this.currentPage) return 'no-page';
    
    try {
      // Simple DOM fingerprint based on structure
      const domStructure = await this.currentPage.evaluate(() => {
        const elements = (globalThis as any).document.querySelectorAll('*');
        const tags = Array.from(elements).map((el: any) => el.tagName.toLowerCase());
        return tags.slice(0, 50).join(','); // First 50 elements
      });
      
      // Create hash of DOM structure
      const crypto = require('crypto');
      return crypto.createHash('md5').update(domStructure).digest('hex');
    } catch (error) {
      console.error('[EnhancedCache] DOM hash error:', error);
      return `error-${Date.now()}`;
    }
  }

  // Advanced learning capabilities
  async learnFromSuccess(description: string, selector: string, context?: any): Promise<void> {
    // Enhanced learning that considers context
    await this.tieredCache.set(description, this.currentUrl, selector);
    
    // Learn patterns
    if (context?.elementType || context?.attributes) {
      console.error(`[EnhancedCache] Learning with context: ${JSON.stringify(context)}`);
      // Future: Could train ML models here
    }
  }

  async suggestAlternatives(description: string): Promise<string[]> {
    // Get related selectors from cache
    try {
      const stats = await this.bidirectionalCache.getStats();
      // This could be enhanced to actually return similar selectors
      return [];
    } catch (error) {
      return [];
    }
  }

  // Comprehensive metrics
  async getMetrics(): Promise<any> {
    try {
      const tieredStats = this.tieredCache.getStats();
      const bidirectionalStats = await this.bidirectionalCache.getStats();
      
      return {
        overview: {
          currentUrl: this.currentUrl,
          currentProfile: this.currentProfile || 'default',
          navigationCount: this.navigationCount,
          systemType: 'bidirectional'
        },
        performance: {
          ...tieredStats.tiered,
          breakdown: tieredStats.breakdown
        },
        storage: {
          ...bidirectionalStats.storage,
          operations: bidirectionalStats.operations,
          snapshots: bidirectionalStats.snapshots
        },
        recommendations: this.generateRecommendations(tieredStats, bidirectionalStats)
      };
    } catch (error) {
      console.error('[EnhancedCache] Metrics error:', error);
      return {
        error: 'Failed to retrieve metrics',
        currentUrl: this.currentUrl,
        navigationCount: this.navigationCount
      };
    }
  }

  // Enhanced Phase 2.4: DOM Signature Metrics Collection
  private async getDOMSignatureMetrics(): Promise<any> {
    try {
      return await this.bidirectionalCache.getDOMSignatureStats();
    } catch (error) {
      console.error('[EnhancedCache] DOM signature metrics error:', error);
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
  
  // Enhanced Phase 2.4: Enhanced Cache Key Metrics
  private async getEnhancedKeyMetrics(): Promise<any> {
    try {
      return await this.bidirectionalCache.getEnhancedKeyStats();
    } catch (error) {
      console.error('[EnhancedCache] Enhanced key metrics error:', error);
      return {
        hits: 0,
        misses: 0,
        adaptations: 0,
        falsePositiveRate: 0,
        portabilityRate: 0,
        matchAccuracy: 0
      };
    }
  }
  
  private generateRecommendations(tieredStats: any, bidirectionalStats: any, domSignatureMetrics?: any, enhancedKeyMetrics?: any): string[] {
    const recommendations = [];
    
    if (tieredStats.tiered.overallHitRate < 50) {
      recommendations.push("Low hit rate - consider using more consistent selector descriptions");
    }
    
    if (tieredStats.tiered.memoryHitRate < 30) {
      recommendations.push("Memory cache underutilized - selectors may be too varied");
    }
    
    if (bidirectionalStats.storage?.avg_inputs_per_selector > 5) {
      recommendations.push("High variation per selector - check for pattern consistency");
    }
    
    if (this.navigationCount > 10) {
      recommendations.push("Frequent navigation detected - cache is adapting well");
    }
    
    // Enhanced Phase 2.4: DOM signature and enhanced key recommendations
    if (domSignatureMetrics?.hitRate < 70) {
      recommendations.push("Low DOM signature hit rate - consider improving page structure consistency");
    }
    
    if (enhancedKeyMetrics?.falsePositiveRate > 5) {
      recommendations.push("High false positive rate - consider tightening similarity thresholds");
    }
    
    if (enhancedKeyMetrics?.portabilityRate < 60) {
      recommendations.push("Low cross-environment portability - enhance cache key normalization");
    }
    
    return recommendations;
  }

  // Cache management operations
  async invalidateAll(): Promise<void> {
    await this.tieredCache.clear();
    console.error('[EnhancedCache] All caches cleared');
  }

  async invalidateForUrl(url: string): Promise<void> {
    await this.tieredCache.invalidateForUrl(url);
    console.error(`[EnhancedCache] Invalidated cache for ${url}`);
  }


  // Additional CLI-specific methods
  async clearAll(): Promise<void> {
    await this.tieredCache.clear();
    console.error('[EnhancedCache] All caches cleared completely');
  }

  async getBidirectionalStats(): Promise<any> {
    return await this.bidirectionalCache.getStats();
  }

  async healthCheck(): Promise<any> {
    try {
      const result = {
        integration: true,
        memoryCache: true,
        sqliteCache: true,
        bidirectionalCache: true,
        errors: [] as string[]
      };

      // Test memory cache
      try {
        this.tieredCache.getStats();
      } catch (error) {
        result.memoryCache = false;
        result.errors.push('Memory cache error: ' + (error instanceof Error ? error.message : String(error)));
      }

      // Test bidirectional cache
      try {
        await this.bidirectionalCache.getStats();
      } catch (error) {
        result.bidirectionalCache = false;
        result.errors.push('Bidirectional cache error: ' + (error instanceof Error ? error.message : String(error)));
      }

      // Test SQLite cache
      try {
        await this.bidirectionalCache.get('test', 'http://test.com');
      } catch (error) {
        result.sqliteCache = false;
        result.errors.push('SQLite cache error: ' + (error instanceof Error ? error.message : String(error)));
      }

      return result;
    } catch (error) {
      return {
        integration: false,
        memoryCache: false,
        sqliteCache: false,
        bidirectionalCache: false,
        errors: ['System error: ' + (error instanceof Error ? error.message : String(error))]
      };
    }
  }

  close(): void {
    this.tieredCache.close();
    EnhancedCacheIntegration.instance = null;
    console.error('[EnhancedCache] System closed');
  }
}