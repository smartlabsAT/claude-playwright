import crypto from 'crypto';
import { SmartNormalizer } from './smart-normalizer.js';
import { DOMSignatureManager, DOMSignatureResult } from '../utils/dom-signature.js';

/**
 * Enhanced Cache Key Schema for Phase 2.2
 * Provides improved cross-environment cache matching with structured test patterns
 */

export interface EnhancedCacheKey {
  test_name_normalized: string;      // SmartNormalizer processed test name
  url_pattern: string;               // Domain + path pattern, not full URL
  dom_signature: string;             // Page structure fingerprint from Phase 2.1
  steps_structure_hash: string;      // Test structure without sensitive values
  profile: string;                   // Browser profile
  version: number;                   // Schema version for migration
}

export interface CacheKeyComponents {
  baseKey: string;                   // Original cache key
  enhancedKey: EnhancedCacheKey;     // Enhanced structured key
  legacyKey?: string;                // Backward compatibility key
}

export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'assert' | 'screenshot';
  target?: string;
  value?: string;
  selector?: string;
  timeout?: number;
  description: string;
}

export interface StepsStructureAnalysis {
  actionPattern: string[];           // Sequence of actions: ['navigate', 'type', 'click']
  selectorTypes: string[];           // Types of selectors: ['url', 'input', 'button']
  conditionalLogic: boolean;         // Has conditional steps
  loopsDetected: boolean;           // Has repeated patterns
  structureComplexity: 'simple' | 'medium' | 'complex';
}

export interface URLPatternComponents {
  protocol?: string;                 // http/https
  domain?: string;                   // Domain name or wildcard
  port?: string;                     // Port number
  pathPattern: string;              // Path with wildcards: /login, /users/*/profile
  queryPattern?: string;            // Query parameter pattern
}

/**
 * Enhanced Cache Key Manager for Phase 2.2
 * Manages the new enhanced cache key system with backward compatibility
 */
export class EnhancedCacheKeyManager {
  private normalizer: SmartNormalizer;
  private domSignatureManager: DOMSignatureManager;
  private readonly CURRENT_VERSION = 1;

  constructor() {
    this.normalizer = new SmartNormalizer();
    this.domSignatureManager = new DOMSignatureManager();
  }

  /**
   * Generate enhanced cache key from components
   */
  generateEnhancedKey(
    testName: string,
    url: string,
    domSignature?: string,
    steps?: TestStep[],
    profile: string = 'default'
  ): EnhancedCacheKey {
    // Normalize test name using SmartNormalizer
    const normalizationResult = this.normalizer.normalize(testName);
    const testNameNormalized = normalizationResult.normalized;

    // Extract URL pattern
    const urlPattern = this.extractURLPattern(url);

    // Use provided DOM signature or generate fallback
    const domSig = domSignature || this.generateFallbackDOMSignature(url);

    // Generate steps structure hash
    const stepsStructureHash = steps ? this.generateStepsStructureHash(steps) : 'no-steps';

    return {
      test_name_normalized: testNameNormalized,
      url_pattern: urlPattern,
      dom_signature: domSig,
      steps_structure_hash: stepsStructureHash,
      profile: profile,
      version: this.CURRENT_VERSION
    };
  }

  /**
   * Generate cache key components for storage and lookup
   */
  generateCacheKeyComponents(
    testName: string,
    url: string,
    domSignature?: string,
    steps?: TestStep[],
    profile: string = 'default'
  ): CacheKeyComponents {
    const enhancedKey = this.generateEnhancedKey(testName, url, domSignature, steps, profile);
    
    // Generate base key for storage
    const baseKey = this.generateBaseKey(enhancedKey);
    
    // Generate legacy key for backward compatibility
    const legacyKey = this.generateLegacyKey(testName, url, profile);

    return {
      baseKey,
      enhancedKey,
      legacyKey
    };
  }

  /**
   * Extract URL pattern from full URL - replaces IDs with wildcards
   */
  extractURLPattern(url: string): string {
    try {
      const urlObj = new URL(url);
      
      // Extract path and normalize
      let pathPattern = urlObj.pathname;
      
      // Replace numeric IDs with wildcards
      pathPattern = pathPattern.replace(/\/\d+/g, '/*');
      
      // Replace UUIDs with wildcards
      pathPattern = pathPattern.replace(/\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/gi, '/*');
      
      // Replace common variable patterns
      pathPattern = pathPattern.replace(/\/[a-zA-Z0-9_-]{10,}/g, '/*');
      
      // Handle localhost/development environments
      if (urlObj.hostname === 'localhost' || urlObj.hostname.startsWith('127.') || urlObj.hostname.endsWith('.local')) {
        return '*' + pathPattern;
      }
      
      // Handle staging/production environments  
      if (urlObj.hostname.includes('staging') || urlObj.hostname.includes('dev')) {
        // Extract base domain for staging: staging.example.com → *.example.com
        const parts = urlObj.hostname.split('.');
        if (parts.length >= 2) {
          const baseDomain = parts.slice(-2).join('.'); // Get last 2 parts: example.com
          return `*.${baseDomain}${pathPattern}`;
        }
        return '*' + pathPattern;
      }
      
      // For production URLs, preserve domain pattern
      const domainPattern = urlObj.hostname.replace(/^(www\.)/, '*.'); // www.example.com → *.example.com
      
      // For subdomains like app.example.com → *.example.com
      const parts = urlObj.hostname.split('.');
      if (parts.length > 2 && !urlObj.hostname.startsWith('www.')) {
        const baseDomain = parts.slice(-2).join('.'); // Get last 2 parts
        return `*.${baseDomain}${pathPattern}`;
      }
      
      return domainPattern + pathPattern;
      
    } catch (error) {
      console.error('[EnhancedCacheKey] URL pattern extraction failed:', error);
      // Fallback to simple pattern
      return url.replace(/https?:\/\/[^/]+/, '*').replace(/\/\d+/g, '/*');
    }
  }

  /**
   * Analyze steps structure and generate hash
   */
  analyzeStepsStructure(steps: TestStep[]): StepsStructureAnalysis {
    if (!steps || steps.length === 0) {
      return {
        actionPattern: [],
        selectorTypes: [],
        conditionalLogic: false,
        loopsDetected: false,
        structureComplexity: 'simple'
      };
    }

    // Extract action pattern
    const actionPattern = steps.map(step => step.action);
    
    // Classify selector types
    const selectorTypes = steps
      .filter(step => step.selector || step.target)
      .map(step => this.classifySelector(step.selector || step.target || ''));

    // Detect conditional logic (basic heuristics)
    const conditionalLogic = steps.some(step => 
      step.description?.toLowerCase().includes('if') ||
      step.description?.toLowerCase().includes('when') ||
      step.action === 'wait'
    );

    // Detect loops (repeated action patterns)
    const loopsDetected = this.detectActionLoops(actionPattern);

    // Determine complexity
    let structureComplexity: 'simple' | 'medium' | 'complex' = 'simple';
    if (steps.length > 10 || loopsDetected || conditionalLogic) {
      structureComplexity = 'complex';
    } else if (steps.length > 5 || selectorTypes.length > 3) {
      structureComplexity = 'medium';
    }

    return {
      actionPattern,
      selectorTypes: [...new Set(selectorTypes)], // Remove duplicates
      conditionalLogic,
      loopsDetected,
      structureComplexity
    };
  }

  /**
   * Generate steps structure hash without sensitive values
   */
  generateStepsStructureHash(steps: TestStep[]): string {
    const analysis = this.analyzeStepsStructure(steps);
    
    // Create structure signature without sensitive data
    const structureSignature = {
      actions: analysis.actionPattern,
      selectors: analysis.selectorTypes,
      conditional: analysis.conditionalLogic,
      loops: analysis.loopsDetected,
      complexity: analysis.structureComplexity,
      stepCount: steps.length
    };

    // Generate hash
    const signatureString = JSON.stringify(structureSignature, Object.keys(structureSignature).sort());
    return crypto.createHash('md5').update(signatureString).digest('hex').substring(0, 12);
  }

  /**
   * Classify selector type for pattern analysis
   */
  private classifySelector(selector: string): string {
    if (!selector) return 'unknown';
    
    // URL patterns
    if (selector.startsWith('http') || selector.includes('://')) {
      return 'url';
    }
    
    // Form inputs
    if (selector.includes('input') || selector.includes('textarea') || selector.includes('[type=')) {
      return 'input';
    }
    
    // Buttons
    if (selector.includes('button') || selector.includes('[role="button"]') || selector.includes('.btn')) {
      return 'button';
    }
    
    // Links
    if (selector.includes('a[') || selector.includes('link') || selector.includes('[href]')) {
      return 'link';
    }
    
    // Navigation
    if (selector.includes('nav') || selector.includes('menu') || selector.includes('[role="navigation"]')) {
      return 'navigation';
    }
    
    // Form elements
    if (selector.includes('form') || selector.includes('select') || selector.includes('option')) {
      return 'form';
    }
    
    // Generic element
    if (selector.startsWith('#') || selector.startsWith('.') || selector.includes('[')) {
      return 'element';
    }
    
    return 'text';
  }

  /**
   * Detect repeated action patterns in steps
   */
  private detectActionLoops(actions: string[]): boolean {
    if (actions.length < 4) return false;
    
    // Look for repeated subsequences
    for (let i = 0; i < actions.length - 3; i++) {
      const pattern = actions.slice(i, i + 2);
      const remaining = actions.slice(i + 2);
      
      // Check if pattern repeats in remaining actions
      for (let j = 0; j <= remaining.length - 2; j++) {
        const candidate = remaining.slice(j, j + 2);
        if (pattern[0] === candidate[0] && pattern[1] === candidate[1]) {
          return true;
        }
      }
    }
    
    return false;
  }

  /**
   * Generate fallback DOM signature when page is not available
   */
  private generateFallbackDOMSignature(url: string): string {
    // Generate a simple signature based on URL
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    return `fallback:${urlHash}:${urlHash}`;
  }

  /**
   * Generate base storage key from enhanced key
   */
  private generateBaseKey(enhancedKey: EnhancedCacheKey): string {
    const components = [
      `v${enhancedKey.version}`,
      enhancedKey.test_name_normalized,
      enhancedKey.url_pattern,
      enhancedKey.dom_signature,
      enhancedKey.steps_structure_hash,
      enhancedKey.profile
    ];
    
    return crypto.createHash('md5')
      .update(components.join(':'))
      .digest('hex');
  }

  /**
   * Generate legacy key for backward compatibility
   */
  private generateLegacyKey(testName: string, url: string, profile: string): string {
    const components = [testName, url, profile];
    return crypto.createHash('md5')
      .update(components.join(':'))
      .digest('hex');
  }

  /**
   * Parse enhanced cache key from stored data
   */
  parseEnhancedKey(keyData: string): EnhancedCacheKey | null {
    try {
      return JSON.parse(keyData);
    } catch (error) {
      console.error('[EnhancedCacheKey] Failed to parse enhanced key:', error);
      return null;
    }
  }

  /**
   * Serialize enhanced cache key for storage
   */
  serializeEnhancedKey(key: EnhancedCacheKey): string {
    return JSON.stringify(key);
  }

  /**
   * Calculate similarity between two enhanced cache keys
   */
  calculateKeySimilarity(key1: EnhancedCacheKey, key2: EnhancedCacheKey): number {
    let score = 0;
    let weights = 0;

    // Test name similarity (weight: 3)
    if (key1.test_name_normalized === key2.test_name_normalized) {
      score += 3;
    } else {
      // Normalize both keys for comparison
      const norm1 = this.normalizer.normalize(key1.test_name_normalized);
      const norm2 = this.normalizer.normalize(key2.test_name_normalized);
      const similarity = this.normalizer.calculateSimilarity(norm1, norm2);
      score += similarity * 3;
    }
    weights += 3;

    // URL pattern similarity (weight: 2)
    if (key1.url_pattern === key2.url_pattern) {
      score += 2;
    } else {
      // Check if patterns are compatible (wildcards)
      const urlSimilarity = this.calculateURLPatternSimilarity(key1.url_pattern, key2.url_pattern);
      score += urlSimilarity * 2;
    }
    weights += 2;

    // DOM signature similarity (weight: 2)
    if (key1.dom_signature === key2.dom_signature) {
      score += 2;
    } else if (DOMSignatureManager.isValidSignature(key1.dom_signature) && 
               DOMSignatureManager.isValidSignature(key2.dom_signature)) {
      // Use DOM signature similarity calculation
      const domSimilarity = this.calculateDOMSimilarity(key1.dom_signature, key2.dom_signature);
      score += domSimilarity * 2;
    }
    weights += 2;

    // Steps structure similarity (weight: 1)
    if (key1.steps_structure_hash === key2.steps_structure_hash) {
      score += 1;
    }
    weights += 1;

    // Profile match (weight: 1)
    if (key1.profile === key2.profile) {
      score += 1;
    }
    weights += 1;

    return weights > 0 ? score / weights : 0;
  }

  /**
   * Calculate URL pattern similarity
   */
  private calculateURLPatternSimilarity(pattern1: string, pattern2: string): number {
    // Exact match
    if (pattern1 === pattern2) return 1.0;
    
    // Split into components
    const parts1 = pattern1.split('/').filter(p => p.length > 0);
    const parts2 = pattern2.split('/').filter(p => p.length > 0);
    
    const maxLength = Math.max(parts1.length, parts2.length);
    if (maxLength === 0) return 1.0;
    
    let matches = 0;
    for (let i = 0; i < maxLength; i++) {
      const part1 = parts1[i] || '';
      const part2 = parts2[i] || '';
      
      if (part1 === part2) {
        matches++;
      } else if (part1 === '*' || part2 === '*') {
        matches += 0.5; // Partial match for wildcards
      }
    }
    
    return matches / maxLength;
  }

  /**
   * Calculate DOM signature similarity
   */
  private calculateDOMSimilarity(sig1: string, sig2: string): number {
    try {
      // Use existing DOM signature utility
      return require('../utils/dom-signature.js').DOMSignatureUtils.calculateSimilarity(sig1, sig2);
    } catch (error) {
      console.error('[EnhancedCacheKey] DOM similarity calculation failed:', error);
      return sig1 === sig2 ? 1.0 : 0.0;
    }
  }

  /**
   * Check if enhanced cache key is valid
   */
  isValidEnhancedKey(key: EnhancedCacheKey): boolean {
    return !!(
      key.test_name_normalized &&
      key.url_pattern &&
      key.dom_signature &&
      key.steps_structure_hash &&
      key.profile &&
      typeof key.version === 'number' &&
      key.version >= 1
    );
  }
}

// Main class is already exported above