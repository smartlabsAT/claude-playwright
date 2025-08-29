import { Page } from 'playwright';
import { CacheManager } from './cache-manager';
import { SelectorCache } from './selector-cache';
import { SnapshotCache } from './snapshot-cache';

export class CacheIntegration {
  private static instance: CacheIntegration | null = null;
  private cacheManager: CacheManager;
  private selectorCache: SelectorCache;
  private snapshotCache: SnapshotCache;
  private currentPage?: Page;
  private currentUrl: string = '';
  private currentProfile?: string;
  private navigationCount: number = 0;

  private constructor() {
    this.cacheManager = new CacheManager({
      maxSizeMB: 50,
      selectorTTL: 300000, // 5 minutes
      stateTTL: 2000, // 2 seconds
      snapshotTTL: 1800000, // 30 minutes
      cleanupInterval: 60000 // 1 minute
    });
    
    this.selectorCache = new SelectorCache(this.cacheManager);
    this.snapshotCache = new SnapshotCache(this.cacheManager);
  }

  static getInstance(): CacheIntegration {
    if (!CacheIntegration.instance) {
      CacheIntegration.instance = new CacheIntegration();
    }
    return CacheIntegration.instance;
  }

  setPage(page: Page, url: string, profile?: string): void {
    this.currentPage = page;
    this.currentUrl = url;
    this.currentProfile = profile;
    
    this.selectorCache.setContext(page, url, profile);
    this.snapshotCache.setContext(page, url, profile);
    
    // Setup page event listeners for cache invalidation
    this.setupPageListeners(page);
  }

  private setupPageListeners(page: Page): void {
    // Invalidate cache on navigation
    page.on('framenavigated', async (frame) => {
      if (frame === page.mainFrame()) {
        const newUrl = frame.url();
        if (newUrl !== this.currentUrl) {
          console.error(`[Cache] Navigation detected: ${this.currentUrl} -> ${newUrl}`);
          await this.handleNavigation(newUrl);
        }
      }
    });

    // Track DOM changes
    page.on('load', async () => {
      console.error('[Cache] Page loaded, checking for changes...');
      await this.snapshotCache.invalidateIfChanged();
    });
  }

  private async handleNavigation(newUrl: string): Promise<void> {
    this.navigationCount++;
    
    // Invalidate state cache for old URL
    await this.cacheManager.invalidate({
      url: this.currentUrl,
      type: 'state',
      profile: this.currentProfile
    });
    
    // Update current URL
    this.currentUrl = newUrl;
    
    if (this.currentPage) {
      this.selectorCache.setContext(this.currentPage, newUrl, this.currentProfile);
      this.snapshotCache.setContext(this.currentPage, newUrl, this.currentProfile);
    }
    
    // Preload common selectors for new page
    await this.selectorCache.preloadCommonSelectors();
  }

  async getCachedSelector(description: string, ref?: string): Promise<any | null> {
    return await this.selectorCache.getCachedSelector(description, ref);
  }

  async cacheSelector(
    description: string,
    selector: string,
    strategy: 'css' | 'xpath' | 'text' | 'role' | 'testid',
    ref?: string
  ): Promise<void> {
    await this.selectorCache.cacheSelector(description, selector, strategy, ref);
  }

  async getCachedSnapshot(): Promise<any | null> {
    return await this.snapshotCache.getCachedSnapshot();
  }

  async cacheSnapshot(snapshot: any): Promise<void> {
    await this.snapshotCache.cacheSnapshot(snapshot);
  }

  async getOrCreateSnapshot(): Promise<any> {
    return await this.snapshotCache.getOrCreateSnapshot();
  }

  async getCachedElementState(selector: string): Promise<any | null> {
    return await this.selectorCache.getCachedElementState(selector);
  }

  async invalidateAll(): Promise<void> {
    await this.cacheManager.clear();
  }

  async invalidateForUrl(url: string): Promise<void> {
    await this.cacheManager.invalidate({ url, profile: this.currentProfile });
  }

  async getMetrics(): Promise<any> {
    const metrics = await this.cacheManager.getMetrics();
    return {
      metrics,
      navigationCount: this.navigationCount,
      currentUrl: this.currentUrl,
      currentProfile: this.currentProfile
    };
  }

  close(): void {
    this.cacheManager.close();
    CacheIntegration.instance = null;
  }

  // Helper method for MCP tools
  async wrapSelectorOperation<T>(
    description: string,
    ref: string | undefined,
    operation: (selector: string) => Promise<T>,
    fallbackSelector: string
  ): Promise<T> {
    // Try to get cached selector first
    const cached = await this.getCachedSelector(description, ref);
    
    if (cached && cached.selector) {
      console.error(`[Cache] Using cached selector for "${description}": ${cached.selector}`);
      try {
        return await operation(cached.selector);
      } catch (error) {
        console.error(`[Cache] Cached selector failed, using fallback: ${fallbackSelector}`);
        // Cache might be stale, invalidate it
        await this.selectorCache.invalidateSelector(description, ref);
      }
    }
    
    // Use fallback selector and cache it for next time
    const result = await operation(fallbackSelector);
    
    // Cache the successful selector
    await this.cacheSelector(description, fallbackSelector, 'css', ref);
    console.error(`[Cache] Cached new selector for "${description}": ${fallbackSelector}`);
    
    return result;
  }
}