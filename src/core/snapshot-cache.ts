import { Page } from 'playwright';
import { CacheManager } from './cache-manager';
import crypto from 'crypto';

interface SnapshotEntry {
  snapshot: any;
  url: string;
  timestamp: number;
  domHash: string;
  viewportSize: { width: number; height: number };
}

export class SnapshotCache {
  private cacheManager: CacheManager;
  private currentUrl: string = '';
  private currentProfile?: string;
  private page?: Page;
  private lastDomHash?: string;

  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }

  setContext(page: Page, url: string, profile?: string): void {
    this.page = page;
    this.currentUrl = url;
    this.currentProfile = profile;
  }

  async getCachedSnapshot(): Promise<any | null> {
    if (!this.page) return null;

    const domHash = await this.computeDomHash();
    const cacheKey = {
      url: this.currentUrl,
      domHash
    };

    const cached = await this.cacheManager.get(
      cacheKey,
      'snapshot',
      this.currentProfile
    );

    if (cached) {
      this.lastDomHash = domHash;
      return cached.snapshot;
    }

    return null;
  }

  async cacheSnapshot(snapshot: any): Promise<void> {
    if (!this.page) return;

    const domHash = await this.computeDomHash();
    const viewportSize = await this.page.viewportSize();

    const entry: SnapshotEntry = {
      snapshot,
      url: this.currentUrl,
      timestamp: Date.now(),
      domHash,
      viewportSize: viewportSize || { width: 1280, height: 720 }
    };

    const cacheKey = {
      url: this.currentUrl,
      domHash
    };

    await this.cacheManager.set(
      cacheKey,
      entry,
      'snapshot',
      {
        url: this.currentUrl,
        profile: this.currentProfile,
        ttl: 1800000 // 30 minutes
      }
    );

    this.lastDomHash = domHash;
  }

  async getOrCreateSnapshot(): Promise<any> {
    // Try to get cached snapshot first
    const cached = await this.getCachedSnapshot();
    if (cached) {
      return cached;
    }

    // Create new snapshot
    if (!this.page) {
      throw new Error('Page context not set');
    }

    const snapshot = await this.page.accessibility.snapshot();
    await this.cacheSnapshot(snapshot);
    return snapshot;
  }

  private async computeDomHash(): Promise<string> {
    if (!this.page) return '';

    try {
      // Get a simplified representation of the DOM structure
      const domStructure = await this.page.evaluate(() => {
        const getStructure = (element: Element, depth: number = 0): string => {
          if (depth > 5) return ''; // Limit depth
          
          let structure = element.tagName;
          const id = element.id ? `#${element.id}` : '';
          const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
          structure += id + classes;

          // Get child elements structure
          const children = Array.from(element.children)
            .slice(0, 10) // Limit children
            .map(child => getStructure(child, depth + 1))
            .filter(s => s)
            .join(',');

          if (children) {
            structure += `[${children}]`;
          }

          return structure;
        };

        return getStructure(document.body);
      });

      return crypto.createHash('md5').update(domStructure).digest('hex');
    } catch (error) {
      console.error('Error computing DOM hash:', error);
      return crypto.createHash('md5').update(this.currentUrl + Date.now()).digest('hex');
    }
  }

  async hasPageChanged(): Promise<boolean> {
    if (!this.page || !this.lastDomHash) return true;

    const currentHash = await this.computeDomHash();
    return currentHash !== this.lastDomHash;
  }

  async invalidateIfChanged(): Promise<boolean> {
    if (await this.hasPageChanged()) {
      await this.invalidateSnapshot();
      return true;
    }
    return false;
  }

  async invalidateSnapshot(): Promise<void> {
    await this.cacheManager.invalidate({
      url: this.currentUrl,
      type: 'snapshot',
      profile: this.currentProfile
    });
    this.lastDomHash = undefined;
  }

  async prefetchRelatedPages(urls: string[]): Promise<void> {
    // This would be used to prefetch snapshots for related pages
    // Implementation would depend on specific use cases
  }

  async getSnapshotMetrics(): Promise<any> {
    const metrics = await this.cacheManager.getMetrics();
    return metrics.find((m: any) => m.cache_type === 'snapshot');
  }
}