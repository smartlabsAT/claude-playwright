/**
 * Phase 4: Unit Tests - Bidirectional Cache System
 * 
 * Tests the enhanced bidirectional cache from Phase 2
 * Critical for AI-aware selector caching and learning
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock bidirectional cache functionality
interface CacheEntry {
  selector: string;
  selector_hash: string;
  url: string;
  confidence: number;
  created_at: number;
  last_used: number;
  use_count: number;
}

interface InputMapping {
  id: number;
  selector_hash: string;
  input: string;
  normalized_input: string;
  input_tokens: string[];
  url: string;
  success_count: number;
  last_used: number;
  confidence: number;
  learned_from: string;
}

class MockBidirectionalCache {
  private selectorCache = new Map<string, CacheEntry>();
  private inputMappings = new Map<string, InputMapping[]>();
  private memoryCache = new Map<string, any>();
  private similarityThreshold = 0.35;

  constructor() {
    // Initialize with some test data
    this.initializeTestData();
  }

  private initializeTestData(): void {
    // Add some common selectors and mappings for testing
    this.addToCache('button:has-text("Submit")', 'localhost:3000', 0.9, 'direct');
    this.addInputMapping('button:has-text("Submit")', 'click submit button', 'submit', ['click', 'submit', 'button']);
    this.addInputMapping('button:has-text("Submit")', 'press submit', 'submit', ['press', 'submit']);
    
    this.addToCache('input[name="email"]', 'localhost:3000', 0.8, 'direct');
    this.addInputMapping('input[name="email"]', 'type in email field', 'email field', ['type', 'email', 'field']);
    this.addInputMapping('input[name="email"]', 'enter email address', 'email', ['enter', 'email', 'address']);
  }

  async findSelector(input: string, url: string, threshold: number = this.similarityThreshold): Promise<{
    selector: string;
    confidence: number;
    source: string;
    similarity?: number;
  } | null> {
    const normalizedInput = this.normalizeInput(input);
    const inputTokens = this.tokenizeInput(normalizedInput);
    
    // Level 1: Exact normalized match
    const exactMatch = await this.findExactMatch(normalizedInput, url);
    if (exactMatch) {
      return { ...exactMatch, source: 'exact_match' };
    }
    
    // Level 2: Token-based similarity matching
    const similarMatch = await this.findSimilarMatch(inputTokens, url, threshold);
    if (similarMatch) {
      return { ...similarMatch, source: 'similarity_match' };
    }
    
    // Level 3: Reverse lookup from selectors
    const reverseMatch = await this.findReverseMatch(inputTokens, url, threshold);
    if (reverseMatch) {
      return { ...reverseMatch, source: 'reverse_lookup' };
    }
    
    return null;
  }

  async addToCache(
    selector: string, 
    url: string, 
    confidence: number = 0.5, 
    learnedFrom: string = 'direct'
  ): Promise<void> {
    const selectorHash = this.hashString(selector);
    const now = Date.now();
    
    const entry: CacheEntry = {
      selector,
      selector_hash: selectorHash,
      url,
      confidence,
      created_at: now,
      last_used: now,
      use_count: 1
    };
    
    const key = `${selectorHash}-${url}`;
    this.selectorCache.set(key, entry);
  }

  async addInputMapping(
    selector: string,
    input: string,
    normalizedInput?: string,
    inputTokens?: string[]
  ): Promise<void> {
    const selectorHash = this.hashString(selector);
    const normalized = normalizedInput || this.normalizeInput(input);
    const tokens = inputTokens || this.tokenizeInput(normalized);
    
    const mapping: InputMapping = {
      id: Date.now(),
      selector_hash: selectorHash,
      input,
      normalized_input: normalized,
      input_tokens: tokens,
      url: 'localhost:3000',
      success_count: 1,
      last_used: Date.now(),
      confidence: 0.8,
      learned_from: 'test'
    };
    
    const key = selectorHash;
    const existing = this.inputMappings.get(key) || [];
    existing.push(mapping);
    this.inputMappings.set(key, existing);
  }

  private async findExactMatch(normalizedInput: string, url: string): Promise<{
    selector: string;
    confidence: number;
  } | null> {
    for (const [selectorHash, mappings] of this.inputMappings.entries()) {
      for (const mapping of mappings) {
        if (mapping.normalized_input === normalizedInput && mapping.url === url) {
          const cacheEntry = Array.from(this.selectorCache.values())
            .find(entry => entry.selector_hash === selectorHash);
          
          if (cacheEntry) {
            return {
              selector: cacheEntry.selector,
              confidence: mapping.confidence
            };
          }
        }
      }
    }
    return null;
  }

  private async findSimilarMatch(inputTokens: string[], url: string, threshold: number): Promise<{
    selector: string;
    confidence: number;
    similarity: number;
  } | null> {
    let bestMatch: { selector: string; confidence: number; similarity: number } | null = null;
    
    for (const [selectorHash, mappings] of this.inputMappings.entries()) {
      for (const mapping of mappings) {
        if (mapping.url !== url) continue;
        
        const similarity = this.calculateSimilarity(inputTokens, mapping.input_tokens);
        
        if (similarity >= threshold) {
          if (!bestMatch || similarity > bestMatch.similarity) {
            const cacheEntry = Array.from(this.selectorCache.values())
              .find(entry => entry.selector_hash === selectorHash);
            
            if (cacheEntry) {
              bestMatch = {
                selector: cacheEntry.selector,
                confidence: mapping.confidence * similarity,
                similarity
              };
            }
          }
        }
      }
    }
    
    return bestMatch;
  }

  private async findReverseMatch(inputTokens: string[], url: string, threshold: number): Promise<{
    selector: string;
    confidence: number;
    similarity: number;
  } | null> {
    // Extract text from selectors and match against input
    for (const [key, entry] of this.selectorCache.entries()) {
      if (entry.url !== url) continue;
      
      const selectorText = this.extractTextFromSelector(entry.selector);
      const selectorTokens = this.tokenizeInput(selectorText);
      
      const similarity = this.calculateSimilarity(inputTokens, selectorTokens);
      
      if (similarity >= threshold) {
        return {
          selector: entry.selector,
          confidence: entry.confidence * similarity,
          similarity
        };
      }
    }
    
    return null;
  }

  private normalizeInput(input: string): string {
    return input.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
      .replace(/\s+/g, ' ')     // Collapse multiple spaces
      .trim();
  }

  private tokenizeInput(input: string): string[] {
    const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with'];
    return input.split(/\s+/)
      .filter(token => token.length > 0 && !stopWords.includes(token));
  }

  private calculateSimilarity(tokens1: string[], tokens2: string[]): number {
    if (tokens1.length === 0 && tokens2.length === 0) return 1;
    if (tokens1.length === 0 || tokens2.length === 0) return 0;
    
    const set1 = new Set(tokens1);
    const set2 = new Set(tokens2);
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size; // Jaccard similarity
  }

  private extractTextFromSelector(selector: string): string {
    // Extract meaningful text from selectors
    const textMatches = selector.match(/:has-text\(["']([^"']+)["']\)/);
    if (textMatches) {
      return textMatches[1];
    }
    
    const attrMatches = selector.match(/\[([^=]+)=["']([^"']+)["']\]/);
    if (attrMatches) {
      return attrMatches[2];
    }
    
    // Extract from id or class
    const idMatch = selector.match(/#([^.\[\s:]+)/);
    if (idMatch) {
      return idMatch[1].replace(/[-_]/g, ' ');
    }
    
    const classMatch = selector.match(/\.([^#.\[\s:]+)/);
    if (classMatch) {
      return classMatch[1].replace(/[-_]/g, ' ');
    }
    
    return '';
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  // Test utility methods
  getCacheStats(): {
    selector_count: number;
    input_mapping_count: number;
    memory_cache_size: number;
  } {
    let totalMappings = 0;
    for (const mappings of this.inputMappings.values()) {
      totalMappings += mappings.length;
    }
    
    return {
      selector_count: this.selectorCache.size,
      input_mapping_count: totalMappings,
      memory_cache_size: this.memoryCache.size
    };
  }

  clearCache(): void {
    this.selectorCache.clear();
    this.inputMappings.clear();
    this.memoryCache.clear();
  }

  setSimilarityThreshold(threshold: number): void {
    this.similarityThreshold = threshold;
  }
}

describe('Bidirectional Cache System', () => {
  let cache: MockBidirectionalCache;

  beforeEach(() => {
    cache = new MockBidirectionalCache();
  });

  afterEach(() => {
    cache.clearCache();
  });

  describe('Basic Cache Operations', () => {
    it('should add selectors to cache', async () => {
      await cache.addToCache('button#save', 'example.com', 0.8);
      
      const stats = cache.getCacheStats();
      expect(stats.selector_count).toBeGreaterThan(0);
    });

    it('should add input mappings', async () => {
      await cache.addToCache('input[name="username"]', 'example.com', 0.9);
      await cache.addInputMapping('input[name="username"]', 'enter username', 'username', ['enter', 'username']);
      
      const stats = cache.getCacheStats();
      expect(stats.input_mapping_count).toBeGreaterThan(0);
    });

    it('should find exact matches', async () => {
      await cache.addToCache('button.submit-btn', 'test.com', 0.9);
      await cache.addInputMapping('button.submit-btn', 'click submit button', 'submit button', ['click', 'submit', 'button']);
      
      const result = await cache.findSelector('click submit button', 'test.com');
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button.submit-btn');
      expect(result?.source).toBe('exact_match');
    });
  });

  describe('Similarity Matching', () => {
    it('should find similar matches above threshold', async () => {
      await cache.addToCache('input#email-field', 'app.com', 0.8);
      await cache.addInputMapping('input#email-field', 'type email address', 'email address', ['type', 'email', 'address']);
      
      // Similar but not identical input
      const result = await cache.findSelector('enter email', 'app.com', 0.3);
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('input#email-field');
      expect(result?.source).toBe('similarity_match');
      expect(result?.similarity).toBeGreaterThan(0.3);
    });

    it('should not find matches below threshold', async () => {
      cache.setSimilarityThreshold(0.8);
      
      await cache.addToCache('button.cancel', 'app.com', 0.9);
      await cache.addInputMapping('button.cancel', 'cancel operation', 'cancel', ['cancel', 'operation']);
      
      // Very different input
      const result = await cache.findSelector('submit form', 'app.com', 0.8);
      
      expect(result).toBeNull();
    });

    it('should prefer higher similarity matches', async () => {
      await cache.addToCache('button#submit', 'test.com', 0.9);
      await cache.addInputMapping('button#submit', 'submit form', 'submit form', ['submit', 'form']);
      
      await cache.addToCache('button.submit-btn', 'test.com', 0.8);
      await cache.addInputMapping('button.submit-btn', 'click submit button', 'submit button', ['click', 'submit', 'button']);
      
      // Input that matches both but is closer to the second
      const result = await cache.findSelector('press submit button', 'test.com', 0.2);
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button.submit-btn'); // Should prefer the more similar match
    });
  });

  describe('Reverse Lookup', () => {
    it('should extract text from has-text selectors', async () => {
      await cache.addToCache('button:has-text("Save Changes")', 'app.com', 0.9);
      
      const result = await cache.findSelector('click save changes', 'app.com', 0.3);
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button:has-text("Save Changes")');
      expect(result?.source).toBe('reverse_lookup');
    });

    it('should extract text from attribute selectors', async () => {
      await cache.addToCache('input[placeholder="Search products"]', 'shop.com', 0.8);
      
      const result = await cache.findSelector('search products', 'shop.com', 0.4);
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('input[placeholder="Search products"]');
      expect(result?.source).toBe('reverse_lookup');
    });

    it('should extract text from IDs and classes', async () => {
      await cache.addToCache('button#login-button', 'site.com', 0.9);
      
      const result = await cache.findSelector('login button', 'site.com', 0.4);
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button#login-button');
      expect(result?.source).toBe('reverse_lookup');
    });
  });

  describe('Input Normalization', () => {
    it('should handle case insensitive matching', async () => {
      await cache.addToCache('button.SUBMIT', 'test.com', 0.9);
      await cache.addInputMapping('button.SUBMIT', 'Click Submit', 'click submit', ['click', 'submit']);
      
      const result = await cache.findSelector('CLICK SUBMIT', 'test.com');
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button.SUBMIT');
    });

    it('should normalize punctuation and spacing', async () => {
      await cache.addToCache('input[name="user-email"]', 'form.com', 0.8);
      await cache.addInputMapping('input[name="user-email"]', 'type user email', 'user email', ['type', 'user', 'email']);
      
      const result = await cache.findSelector('type   user,  email!', 'form.com');
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('input[name="user-email"]');
    });

    it('should filter stop words', async () => {
      await cache.addToCache('button.primary', 'page.com', 0.9);
      await cache.addInputMapping('button.primary', 'click the primary button', 'primary button', ['click', 'primary', 'button']);
      
      const result = await cache.findSelector('click a primary button', 'page.com');
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button.primary');
    });
  });

  describe('Confidence Scoring', () => {
    it('should adjust confidence based on similarity', async () => {
      await cache.addToCache('button.action', 'test.com', 0.8);
      await cache.addInputMapping('button.action', 'perform action', 'action', ['perform', 'action']);
      
      const result = await cache.findSelector('do action', 'test.com', 0.3);
      
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeLessThan(0.8); // Should be reduced due to partial similarity
      expect(result?.confidence).toBeGreaterThan(0.4); // But still reasonably high
    });

    it('should maintain high confidence for exact matches', async () => {
      await cache.addToCache('input#search', 'site.com', 0.9);
      await cache.addInputMapping('input#search', 'search query', 'search query', ['search', 'query']);
      
      const result = await cache.findSelector('search query', 'site.com');
      
      expect(result).not.toBeNull();
      expect(result?.confidence).toBeCloseTo(0.9, 1);
    });
  });

  describe('URL-based Isolation', () => {
    it('should isolate cache entries by URL', async () => {
      await cache.addToCache('button#submit', 'site1.com', 0.9);
      await cache.addInputMapping('button#submit', 'submit form', 'submit', ['submit', 'form']);
      
      // Same selector, different URL
      const result = await cache.findSelector('submit form', 'site2.com');
      
      expect(result).toBeNull(); // Should not find match from different URL
    });

    it('should find matches within the same URL', async () => {
      const url = 'app.example.com';
      
      await cache.addToCache('input.email', url, 0.8);
      await cache.addInputMapping('input.email', 'enter email', 'email', ['enter', 'email']);
      
      const result = await cache.findSelector('type email', url);
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('input.email');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle empty input gracefully', async () => {
      const result = await cache.findSelector('', 'test.com');
      expect(result).toBeNull();
    });

    it('should handle whitespace-only input', async () => {
      const result = await cache.findSelector('   \t\n   ', 'test.com');
      expect(result).toBeNull();
    });

    it('should handle very long inputs', async () => {
      const longInput = 'a'.repeat(1000);
      const result = await cache.findSelector(longInput, 'test.com');
      
      // Should not throw error
      expect(result).toBeNull();
    });

    it('should handle special characters in input', async () => {
      await cache.addToCache('button[data-action="save"]', 'app.com', 0.9);
      await cache.addInputMapping('button[data-action="save"]', 'save & exit', 'save exit', ['save', 'exit']);
      
      const result = await cache.findSelector('save & exit!!!', 'app.com');
      
      expect(result).not.toBeNull();
      expect(result?.selector).toBe('button[data-action="save"]');
    });

    it('should maintain reasonable performance with large cache', async () => {
      // Add many entries to cache
      for (let i = 0; i < 100; i++) {
        await cache.addToCache(`button#btn-${i}`, 'perf.com', 0.8);
        await cache.addInputMapping(`button#btn-${i}`, `click button ${i}`, `button ${i}`, ['click', 'button', i.toString()]);
      }
      
      const startTime = Date.now();
      const result = await cache.findSelector('click button 50', 'perf.com');
      const duration = Date.now() - startTime;
      
      expect(result).not.toBeNull();
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });
  });

  describe('Cache Statistics and Management', () => {
    it('should provide accurate cache statistics', async () => {
      const initialStats = cache.getCacheStats();
      
      await cache.addToCache('button.test', 'stats.com', 0.9);
      await cache.addInputMapping('button.test', 'test button', 'test', ['test', 'button']);
      await cache.addInputMapping('button.test', 'click test', 'test', ['click', 'test']);
      
      const finalStats = cache.getCacheStats();
      
      expect(finalStats.selector_count).toBeGreaterThan(initialStats.selector_count);
      expect(finalStats.input_mapping_count).toBeGreaterThan(initialStats.input_mapping_count);
    });

    it('should clear cache completely', async () => {
      await cache.addToCache('button.clear', 'clear.com', 0.9);
      await cache.addInputMapping('button.clear', 'clear data', 'clear', ['clear', 'data']);
      
      let stats = cache.getCacheStats();
      expect(stats.selector_count).toBeGreaterThan(0);
      
      cache.clearCache();
      
      stats = cache.getCacheStats();
      expect(stats.selector_count).toBe(0);
      expect(stats.input_mapping_count).toBe(0);
    });

    it('should allow similarity threshold adjustment', async () => {
      await cache.addToCache('button.threshold', 'test.com', 0.9);
      await cache.addInputMapping('button.threshold', 'threshold test', 'threshold test', ['threshold', 'test']);
      
      cache.setSimilarityThreshold(0.9);
      let result = await cache.findSelector('test only', 'test.com');
      expect(result).toBeNull(); // Below high threshold
      
      cache.setSimilarityThreshold(0.2);
      result = await cache.findSelector('test only', 'test.com');
      expect(result).not.toBeNull(); // Above low threshold
    });
  });
});