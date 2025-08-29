import { Page, Locator } from 'playwright';
import { CacheManager } from './cache-manager';

interface SelectorCacheEntry {
  selector: string;
  strategy: 'css' | 'xpath' | 'text' | 'role' | 'testid';
  attributes?: Record<string, any>;
  boundingBox?: { x: number; y: number; width: number; height: number };
  isVisible?: boolean;
  isEnabled?: boolean;
  text?: string;
}

interface ElementState {
  isVisible: boolean;
  isEnabled: boolean;
  isEditable: boolean;
  boundingBox: { x: number; y: number; width: number; height: number } | null;
  text: string;
  value: string;
  attributes: Record<string, string>;
}

export class SelectorCache {
  private cacheManager: CacheManager;
  private currentUrl: string = '';
  private currentProfile?: string;
  private page?: Page;

  constructor(cacheManager: CacheManager) {
    this.cacheManager = cacheManager;
  }

  setContext(page: Page, url: string, profile?: string): void {
    this.page = page;
    this.currentUrl = url;
    this.currentProfile = profile;
  }

  async getCachedSelector(
    elementDescription: string,
    elementRef?: string
  ): Promise<SelectorCacheEntry | null> {
    const cacheKey = {
      description: elementDescription,
      ref: elementRef,
      url: this.currentUrl
    };

    const cached = await this.cacheManager.get(
      cacheKey,
      'selector',
      this.currentProfile
    );

    if (cached) {
      // Validate that the selector still works
      if (this.page && await this.validateSelector(cached)) {
        return cached;
      } else {
        // Invalidate if selector no longer works
        await this.invalidateSelector(elementDescription, elementRef);
        return null;
      }
    }

    return null;
  }

  async cacheSelector(
    elementDescription: string,
    selector: string,
    strategy: 'css' | 'xpath' | 'text' | 'role' | 'testid',
    elementRef?: string,
    additionalData?: Partial<SelectorCacheEntry>
  ): Promise<void> {
    const cacheKey = {
      description: elementDescription,
      ref: elementRef,
      url: this.currentUrl
    };

    const entry: SelectorCacheEntry = {
      selector,
      strategy,
      ...additionalData
    };

    await this.cacheManager.set(
      cacheKey,
      entry,
      'selector',
      {
        url: this.currentUrl,
        profile: this.currentProfile
      }
    );
  }

  async getCachedElementState(
    selector: string
  ): Promise<ElementState | null> {
    const cacheKey = {
      selector,
      url: this.currentUrl
    };

    return await this.cacheManager.get(
      cacheKey,
      'state',
      this.currentProfile
    );
  }

  async cacheElementState(
    selector: string,
    state: ElementState
  ): Promise<void> {
    const cacheKey = {
      selector,
      url: this.currentUrl
    };

    await this.cacheManager.set(
      cacheKey,
      state,
      'state',
      {
        url: this.currentUrl,
        profile: this.currentProfile
      }
    );
  }

  async getElementState(locator: Locator): Promise<ElementState> {
    // Try to get from cache first
    const selector = locator.toString();
    const cached = await this.getCachedElementState(selector);
    
    if (cached) {
      return cached;
    }

    // Fetch fresh state
    const [isVisible, isEnabled, isEditable, boundingBox, text, value] = await Promise.all([
      locator.isVisible(),
      locator.isEnabled(),
      locator.isEditable(),
      locator.boundingBox(),
      locator.textContent(),
      locator.inputValue().catch(() => '')
    ]);

    const attributes = await locator.evaluate((el: Element) => {
      const attrs: Record<string, string> = {};
      for (const attr of el.attributes) {
        attrs[attr.name] = attr.value;
      }
      return attrs;
    });

    const state: ElementState = {
      isVisible,
      isEnabled,
      isEditable,
      boundingBox,
      text: text || '',
      value,
      attributes
    };

    // Cache the state
    await this.cacheElementState(selector, state);

    return state;
  }

  async validateSelector(entry: SelectorCacheEntry): Promise<boolean> {
    if (!this.page) return false;

    try {
      let locator: Locator;
      
      switch (entry.strategy) {
        case 'css':
          locator = this.page.locator(entry.selector);
          break;
        case 'xpath':
          locator = this.page.locator(`xpath=${entry.selector}`);
          break;
        case 'text':
          locator = this.page.getByText(entry.selector);
          break;
        case 'role':
          locator = this.page.getByRole(entry.selector as any);
          break;
        case 'testid':
          locator = this.page.getByTestId(entry.selector);
          break;
        default:
          return false;
      }

      // Check if element exists
      const count = await locator.count();
      return count > 0;
    } catch {
      return false;
    }
  }

  async invalidateSelector(
    elementDescription: string,
    elementRef?: string
  ): Promise<void> {
    const cacheKey = {
      description: elementDescription,
      ref: elementRef,
      url: this.currentUrl
    };

    await this.cacheManager.invalidate({
      url: this.currentUrl,
      type: 'selector',
      profile: this.currentProfile
    });
  }

  async invalidateForUrl(url: string): Promise<void> {
    await this.cacheManager.invalidate({
      url,
      profile: this.currentProfile
    });
  }

  async invalidateAll(): Promise<void> {
    await this.cacheManager.invalidate({
      profile: this.currentProfile
    });
  }

  async batchCacheSelectors(
    entries: Array<{
      description: string;
      selector: string;
      strategy: 'css' | 'xpath' | 'text' | 'role' | 'testid';
      ref?: string;
    }>
  ): Promise<void> {
    await Promise.all(
      entries.map(entry =>
        this.cacheSelector(
          entry.description,
          entry.selector,
          entry.strategy,
          entry.ref
        )
      )
    );
  }

  async preloadCommonSelectors(): Promise<void> {
    if (!this.page) return;

    // Common selectors that are often used
    const commonSelectors = [
      { selector: 'input[type="text"]', strategy: 'css' as const, description: 'text input' },
      { selector: 'input[type="email"]', strategy: 'css' as const, description: 'email input' },
      { selector: 'input[type="password"]', strategy: 'css' as const, description: 'password input' },
      { selector: 'button[type="submit"]', strategy: 'css' as const, description: 'submit button' },
      { selector: 'form', strategy: 'css' as const, description: 'form' },
      { selector: 'a', strategy: 'css' as const, description: 'link' },
      { selector: 'select', strategy: 'css' as const, description: 'dropdown' }
    ];

    const validSelectors = [];
    for (const entry of commonSelectors) {
      const locator = this.page.locator(entry.selector);
      const count = await locator.count();
      if (count > 0) {
        validSelectors.push(entry);
      }
    }

    await this.batchCacheSelectors(validSelectors);
  }
}