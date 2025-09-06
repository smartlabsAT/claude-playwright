import crypto from 'crypto';

interface ElementSignature {
  tag: string;
  attributes: Record<string, string>;
  textContent?: string;
  position?: number;
}

interface DOMSignatureResult {
  criticalHash: string;
  importantHash: string;
  contextHash: string;
  fullSignature: string;
  elementCounts: {
    critical: number;
    important: number;
    context: number;
  };
}

interface CachedSignature {
  signature: DOMSignatureResult;
  timestamp: number;
  url: string;
}

interface DOMSignatureOptions {
  cacheTTL?: number; // milliseconds
  includeTextContent?: boolean;
  includePositions?: boolean;
  maxElementsPerLevel?: number;
}

/**
 * DOMSignatureManager creates hierarchical page fingerprints for cache key generation.
 * 
 * Generates 3-level DOM signatures:
 * - Level 1: Critical interactive elements (buttons, inputs, forms)
 * - Level 2: Important structural elements (links, navigation, containers)  
 * - Level 3: Page context (headings, main content areas, sections)
 * 
 * Final signature format: criticalHash:importantHash:contextHash
 */
export class DOMSignatureManager {
  private signatureCache = new Map<string, CachedSignature>();
  private cleanupTimer?: NodeJS.Timeout;
  private options: Required<DOMSignatureOptions>;

  constructor(options: DOMSignatureOptions = {}) {
    this.options = {
      cacheTTL: options.cacheTTL ?? 60000, // 1 minute default
      includeTextContent: options.includeTextContent ?? true,
      includePositions: options.includePositions ?? false,
      maxElementsPerLevel: options.maxElementsPerLevel ?? 50
    };

    this.startCleanupTimer();
  }

  /**
   * Generate hierarchical DOM signature for a page
   * @param page Playwright Page object or DOM content string
   * @param url Current page URL for caching
   * @returns Promise<DOMSignatureResult> with hierarchical hashes
   */
  async generateSignature(page: any, url: string): Promise<DOMSignatureResult> {
    // Check cache first
    const cached = this.getCachedSignature(url);
    if (cached) {
      return cached.signature;
    }

    try {
      // Extract DOM structure based on page type
      let domElements: ElementSignature[];
      
      if (typeof page === 'string') {
        // Handle raw DOM content
        domElements = this.extractElementsFromHTML(page);
      } else if (page.evaluate) {
        // Handle Playwright Page object
        domElements = await page.evaluate(DOMSignatureManager.getDOMExtractionScript());
      } else {
        throw new Error('Invalid page parameter: must be Playwright Page or HTML string');
      }

      // Generate hierarchical signatures
      const signature = this.createHierarchicalSignature(domElements);

      // Cache the result
      this.cacheSignature(url, signature);

      return signature;
    } catch (error) {
      console.error('[DOMSignature] Error generating signature:', error);
      
      // Return fallback signature
      return {
        criticalHash: 'fallback',
        importantHash: 'fallback', 
        contextHash: 'fallback',
        fullSignature: 'fallback:fallback:fallback',
        elementCounts: { critical: 0, important: 0, context: 0 }
      };
    }
  }

  /**
   * Extract elements from raw HTML string
   */
  private extractElementsFromHTML(html: string): ElementSignature[] {
    // Simple HTML parsing for fallback - in production you'd use a proper HTML parser
    const elements: ElementSignature[] = [];
    
    // Extract button elements
    const buttonMatches = html.match(/<button[^>]*>.*?<\/button>/gi) || [];
    buttonMatches.forEach((match, index) => {
      const attributes = this.extractAttributesFromHTML(match);
      const textContent = match.replace(/<[^>]*>/g, '').trim();
      elements.push({
        tag: 'button',
        attributes,
        textContent,
        position: index
      });
    });

    // Extract input elements
    const inputMatches = html.match(/<input[^>]*\/?>/gi) || [];
    inputMatches.forEach((match, index) => {
      const attributes = this.extractAttributesFromHTML(match);
      elements.push({
        tag: 'input',
        attributes,
        position: index
      });
    });

    return elements;
  }

  /**
   * Extract attributes from HTML string
   */
  private extractAttributesFromHTML(html: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrMatches = html.match(/\s+(\w+)=["']([^"']*)["']/g) || [];
    
    attrMatches.forEach(match => {
      const [, name, value] = match.match(/\s+(\w+)=["']([^"']*)["']/) || [];
      if (name && value !== undefined) {
        attributes[name] = value;
      }
    });

    return attributes;
  }

  /**
   * Extract elements from live DOM (runs in browser context)
   * This method would be injected into page.evaluate()
   * Note: This is a placeholder - actual implementation should be converted to string 
   * and executed in browser context via page.evaluate()
   */
  private extractElementsFromDOM(): ElementSignature[] {
    // This method is not meant to be called directly in Node.js context
    // It should be stringified and passed to page.evaluate()
    throw new Error('extractElementsFromDOM should only be used in browser context via page.evaluate()');
  }

  /**
   * Get the DOM extraction function as a string for page.evaluate()
   */
  static getDOMExtractionScript(): string {
    return `
      function extractElementsFromDOM() {
        const elements = [];

        // Critical interactive elements
        const criticalSelectors = [
          'button', 'input', 'textarea', 'select', 'form',
          '[role="button"]', '[onclick]', '[type="submit"]',
          '.btn', '.button', '.form-control'
        ];

        // Important structural elements  
        const importantSelectors = [
          'a', 'nav', 'header', 'footer', 'aside', 'section',
          '[role="navigation"]', '[role="main"]', '.nav', '.navbar',
          '.menu', '.container', '.content'
        ];

        // Context elements
        const contextSelectors = [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main', 'article',
          '.title', '.heading', '.page-title', '[role="heading"]'
        ];

        const allSelectors = [...criticalSelectors, ...importantSelectors, ...contextSelectors];
        
        allSelectors.forEach(selector => {
          try {
            const elements_found = document.querySelectorAll(selector);
            Array.from(elements_found).forEach((el, index) => {
              const attributes = {};
              
              // Extract key attributes
              ['id', 'class', 'type', 'name', 'role', 'data-testid'].forEach(attr => {
                const value = el.getAttribute(attr);
                if (value) attributes[attr] = value;
              });

              elements.push({
                tag: el.tagName.toLowerCase(),
                attributes,
                textContent: el.textContent?.trim().substring(0, 100), // Limit text length
                position: index
              });
            });
          } catch (error) {
            // Ignore selector errors
          }
        });

        return elements;
      }
      return extractElementsFromDOM();
    `;
  }

  /**
   * Create hierarchical signature from extracted elements
   */
  private createHierarchicalSignature(elements: ElementSignature[]): DOMSignatureResult {
    // Level 1: Critical interactive elements
    const critical = elements.filter(el => 
      ['button', 'input', 'textarea', 'select', 'form'].includes(el.tag) ||
      el.attributes.role === 'button' ||
      el.attributes.onclick ||
      el.attributes.type === 'submit' ||
      el.attributes.class?.includes('btn') ||
      el.attributes.class?.includes('button')
    );

    // Level 2: Important structural elements
    const important = elements.filter(el =>
      ['a', 'nav', 'header', 'footer', 'aside', 'section'].includes(el.tag) ||
      el.attributes.role === 'navigation' ||
      el.attributes.role === 'main' ||
      ['nav', 'navbar', 'menu', 'container', 'content'].some(cls => 
        el.attributes.class?.includes(cls)
      )
    );

    // Level 3: Context elements  
    const context = elements.filter(el =>
      ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'main', 'article'].includes(el.tag) ||
      el.attributes.role === 'heading' ||
      ['title', 'heading', 'page-title'].some(cls =>
        el.attributes.class?.includes(cls)
      )
    );

    // Generate hashes for each level
    const criticalHash = this.hashElements(critical.slice(0, this.options.maxElementsPerLevel));
    const importantHash = this.hashElements(important.slice(0, this.options.maxElementsPerLevel));
    const contextHash = this.hashElements(context.slice(0, this.options.maxElementsPerLevel));

    // Create full signature
    const fullSignature = `${criticalHash}:${importantHash}:${contextHash}`;

    return {
      criticalHash,
      importantHash,
      contextHash,
      fullSignature,
      elementCounts: {
        critical: critical.length,
        important: important.length,
        context: context.length
      }
    };
  }

  /**
   * Generate deterministic hash for a group of elements
   */
  private hashElements(elements: ElementSignature[]): string {
    if (elements.length === 0) return 'empty';

    // Sort elements deterministically for consistent hashing
    const sortedElements = elements.sort((a, b) => {
      // Primary sort: tag name
      if (a.tag !== b.tag) return a.tag.localeCompare(b.tag);
      
      // Secondary sort: id attribute  
      const aId = a.attributes.id || '';
      const bId = b.attributes.id || '';
      if (aId !== bId) return aId.localeCompare(bId);

      // Tertiary sort: class attribute
      const aClass = a.attributes.class || '';
      const bClass = b.attributes.class || '';
      if (aClass !== bClass) return aClass.localeCompare(bClass);

      // Final sort: text content
      const aText = a.textContent || '';
      const bText = b.textContent || '';
      return aText.localeCompare(bText);
    });

    // Create signature string
    const signatureData = sortedElements.map(el => {
      let sig = el.tag;
      
      // Add key attributes in consistent order
      if (el.attributes.id) sig += `#${el.attributes.id}`;
      if (el.attributes.class) sig += `.${el.attributes.class.replace(/\s+/g, '.')}`;
      if (el.attributes.type) sig += `[type="${el.attributes.type}"]`;
      if (el.attributes.role) sig += `[role="${el.attributes.role}"]`;
      if (el.attributes.name) sig += `[name="${el.attributes.name}"]`;

      // Add text content if enabled and available
      if (this.options.includeTextContent && el.textContent) {
        sig += `{${el.textContent.substring(0, 50)}}`;
      }

      // Add position if enabled
      if (this.options.includePositions && el.position !== undefined) {
        sig += `@${el.position}`;
      }

      return sig;
    }).join('|');

    // Generate hash
    return crypto.createHash('md5').update(signatureData).digest('hex').substring(0, 16);
  }

  /**
   * Get cached signature if valid
   */
  private getCachedSignature(url: string): CachedSignature | null {
    const cached = this.signatureCache.get(url);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > this.options.cacheTTL) {
      this.signatureCache.delete(url);
      return null;
    }

    return cached;
  }

  /**
   * Cache signature result
   */
  private cacheSignature(url: string, signature: DOMSignatureResult): void {
    this.signatureCache.set(url, {
      signature,
      timestamp: Date.now(),
      url
    });
  }

  /**
   * Start cleanup timer for expired cache entries
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const expiredKeys: string[] = [];

      for (const [url, cached] of this.signatureCache) {
        if (now - cached.timestamp > this.options.cacheTTL) {
          expiredKeys.push(url);
        }
      }

      expiredKeys.forEach(url => this.signatureCache.delete(url));
      
      if (expiredKeys.length > 0) {
        console.error(`[DOMSignature] Cleaned up ${expiredKeys.length} expired cache entries`);
      }
    }, this.options.cacheTTL);
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hits: number; misses: number } {
    return {
      size: this.signatureCache.size,
      hits: 0, // Would need to track these
      misses: 0 // Would need to track these  
    };
  }

  /**
   * Clear signature cache
   */
  clearCache(): void {
    this.signatureCache.clear();
  }

  /**
   * Close and cleanup
   */
  close(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.clearCache();
  }

  /**
   * Validate DOM signature format
   */
  static isValidSignature(signature: string): boolean {
    return /^[a-f0-9]{1,16}:[a-f0-9]{1,16}:[a-f0-9]{1,16}$/.test(signature);
  }

  /**
   * Parse DOM signature into components  
   */
  static parseSignature(signature: string): { critical: string; important: string; context: string } | null {
    if (!this.isValidSignature(signature)) return null;
    
    const [critical, important, context] = signature.split(':');
    return { critical, important, context };
  }
}

/**
 * Static utility functions for DOM signature operations
 */
export const DOMSignatureUtils = {
  /**
   * Compare two DOM signatures for similarity
   */
  calculateSimilarity(sig1: string, sig2: string): number {
    const parsed1 = DOMSignatureManager.parseSignature(sig1);
    const parsed2 = DOMSignatureManager.parseSignature(sig2);
    
    if (!parsed1 || !parsed2) return 0;

    let matches = 0;
    let total = 0;

    // Compare each level with different weights
    if (parsed1.critical === parsed2.critical) matches += 3; // Critical elements are weighted higher
    total += 3;

    if (parsed1.important === parsed2.important) matches += 2; // Important elements medium weight
    total += 2;

    if (parsed1.context === parsed2.context) matches += 1; // Context elements lower weight
    total += 1;

    return matches / total;
  },

  /**
   * Check if signature indicates significant page change
   */
  hasSignificantChange(oldSignature: string, newSignature: string, threshold: number = 0.7): boolean {
    const similarity = this.calculateSimilarity(oldSignature, newSignature);
    return similarity < threshold;
  },

  /**
   * Generate cache key incorporating DOM signature
   */
  generateCacheKey(baseKey: string, domSignature: string, profile?: string): string {
    const components = [baseKey, domSignature];
    if (profile) components.push(profile);
    
    return crypto.createHash('md5')
      .update(components.join(':'))
      .digest('hex');
  }
};

export type { DOMSignatureResult, DOMSignatureOptions, ElementSignature };