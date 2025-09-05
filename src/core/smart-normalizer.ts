import crypto from 'crypto';

interface PositionalKeyword {
  word: string;
  position: number;
  context?: string;
}

export interface InputFeatures {
  hasId: boolean;
  hasClass: boolean;
  hasQuoted: boolean;
  numbers: string[];
  positions: PositionalKeyword[];
  attributes: string[];
  wordCount: number;
  hasImperative: boolean;
  casePattern: 'lower' | 'upper' | 'mixed' | 'title';
  isNavigation: boolean;
  isFormAction: boolean;
  hasDataTestId: boolean;
}

export interface NormalizationResult {
  normalized: string;
  tokens: string[];
  positions: PositionalKeyword[];
  features: InputFeatures;
  hash: string;
}

export class SmartNormalizer {
  private readonly POSITION_KEYWORDS = [
    'before', 'after', 'first', 'last', 'next', 'previous', 
    'above', 'below', 'top', 'bottom', 'left', 'right'
  ];
  
  private readonly RELATION_KEYWORDS = [
    'in', 'of', 'from', 'to', 'with', 'by', 'for'
  ];
  
  private readonly STOP_WORDS = [
    'the', 'a', 'an', 'and', 'or', 'but', 'at', 'on'
  ];
  
  private readonly ACTION_SYNONYMS = {
    'click': ['click', 'press', 'tap', 'hit', 'select', 'choose'],
    'type': ['type', 'enter', 'input', 'fill', 'write'],
    'navigate': ['go', 'navigate', 'open', 'visit', 'load'],
    'hover': ['hover', 'mouseover', 'move']
  };

  normalize(input: string): NormalizationResult {
    const original = input.trim();
    
    // STEP 0: Fix common Playwright syntax errors EARLY
    const syntaxFixed = this.fixPlaywrightSyntax(original);
    
    const features = this.extractFeatures(syntaxFixed);
    
    // Step 1: Basic cleanup
    let text = syntaxFixed.toLowerCase();
    
    // Step 2: Extract and preserve quoted strings
    const quotedStrings: string[] = [];
    text = text.replace(/(["'])((?:(?!\1)[^\\]|\\.)*)(\1)/g, (match, quote, content) => {
      quotedStrings.push(content);
      return `QUOTED_${quotedStrings.length - 1}`;
    });
    
    // Step 3: Extract positional information
    const positions = this.extractPositions(text);
    
    // Step 4: Normalize actions to canonical forms
    text = this.normalizeActions(text);
    
    // Step 5: Remove common patterns
    text = this.removeCommonPatterns(text);
    
    // Step 6: Tokenize and filter
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const tokens = [];
    const preserved = [];
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      
      if (this.POSITION_KEYWORDS.includes(word)) {
        // Preserve positional keywords with context
        preserved.push({
          word,
          position: i,
          context: words[i + 1] || null
        });
      } else if (!this.STOP_WORDS.includes(word) && 
                 !this.RELATION_KEYWORDS.includes(word) &&
                 !['button', 'field', 'element'].includes(word)) {
        tokens.push(word);
      }
    }
    
    // Step 7: Sort tokens for order-invariance (except preserved)
    tokens.sort();
    
    // Step 8: Build normalized string
    let normalized = tokens.join(' ');
    
    // Step 9: Add positional information
    if (preserved.length > 0) {
      const posInfo = preserved.map(p => 
        `${p.word}${p.context ? '-' + p.context : ''}`
      ).join(',');
      normalized += ` _pos:${posInfo}`;
    }
    
    // Step 10: Add quoted content back
    if (quotedStrings.length > 0) {
      normalized += ` _quoted:${quotedStrings.join(',')}`;
    }
    
    const hash = crypto.createHash('md5').update(normalized).digest('hex');
    
    return {
      normalized,
      tokens,
      positions,
      features,
      hash
    };
  }

  extractFeatures(input: string): InputFeatures {
    const text = input.toLowerCase();
    
    return {
      hasId: /#[\w-]+/.test(input),
      hasClass: /\.[\w-]+/.test(input),
      hasQuoted: /"[^"]+"|'[^']+'/.test(input),
      numbers: (input.match(/\d+/g) || []),
      positions: this.extractPositions(text),
      attributes: this.extractAttributes(input),
      wordCount: input.split(/\s+/).length,
      hasImperative: /^(click|press|tap|select|enter|type|fill)/i.test(input),
      casePattern: this.detectCasePattern(input),
      isNavigation: /^(go|navigate|open|visit)/i.test(input),
      isFormAction: /(submit|enter|fill|type|input)/i.test(input),
      hasDataTestId: /data-test|testid|data-cy/i.test(input)
    };
  }

  private extractPositions(text: string): PositionalKeyword[] {
    const positions: PositionalKeyword[] = [];
    const words = text.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (this.POSITION_KEYWORDS.includes(word)) {
        positions.push({
          word,
          position: i,
          context: words[i + 1] || words[i - 1] || undefined
        });
      }
    }
    
    return positions;
  }

  private extractAttributes(input: string): string[] {
    const attributes = [];
    
    // Extract common attribute patterns
    const patterns = [
      /\[([^\]]+)\]/g,  // [attribute=value]
      /data-[\w-]+/g,   // data-testid
      /aria-[\w-]+/g,   // aria-label
      /role="[\w-]+"/g, // role="button"
      /type="[\w-]+"/g, // type="submit"
      /placeholder="[^"]+"/g // placeholder="text"
    ];
    
    for (const pattern of patterns) {
      const matches = input.match(pattern);
      if (matches) {
        attributes.push(...matches);
      }
    }
    
    return attributes;
  }

  private detectCasePattern(input: string): 'lower' | 'upper' | 'mixed' | 'title' {
    const hasLower = /[a-z]/.test(input);
    const hasUpper = /[A-Z]/.test(input);
    
    if (!hasLower && hasUpper) return 'upper';
    if (hasLower && !hasUpper) return 'lower';
    
    // Check if it's title case
    const words = input.split(/\s+/);
    const isTitleCase = words.every(word => 
      /^[A-Z][a-z]*$/.test(word) || /^[a-z]+$/.test(word)
    );
    
    return isTitleCase ? 'title' : 'mixed';
  }

  /**
   * Fix common Playwright CSS selector syntax errors early in the process
   */
  private fixPlaywrightSyntax(input: string): string {
    let fixed = input.trim();
    
    // Common syntax fixes
    fixed = fixed
      .replace(/:text\(/g, ':has-text(')           // :text() → :has-text()
      .replace(/\btext\(/g, 'text=')               // text() → text=
      .replace(/:first\b/g, ':first-of-type')      // :first → :first-of-type
      .replace(/:last\b/g, ':last-of-type')        // :last → :last-of-type
      .replace(/>>(\s+)first(\s|$)/g, '>> nth=0')  // >> first → >> nth=0
      .replace(/>>(\s+)last(\s|$)/g, '>> nth=-1'); // >> last → >> nth=-1
    
    // Log syntax fixes for debugging
    if (fixed !== input) {
      console.error(`[SmartNormalizer] Syntax fixed: "${input}" → "${fixed}"`);
    }
    
    return fixed;
  }

  private normalizeActions(text: string): string {
    for (const [canonical, synonyms] of Object.entries(this.ACTION_SYNONYMS)) {
      for (const synonym of synonyms) {
        const regex = new RegExp(`\\b${synonym}\\b`, 'g');
        text = text.replace(regex, canonical);
      }
    }
    return text;
  }

  private removeCommonPatterns(text: string): string {
    // Remove common prefixes and suffixes
    text = text.replace(/^(click|press|tap)(\s+on)?(\s+the)?/i, 'click');
    text = text.replace(/\s+(button|element|field)$/i, '');
    text = text.replace(/button\s+/i, '');
    
    // Remove articles and common words
    text = text.replace(/\b(the|a|an)\b/g, '');
    
    // Clean up punctuation
    text = text.replace(/[^\w\s#._-]/g, ' ');
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    return text;
  }

  // Utility methods for similarity
  calculateSimilarity(result1: NormalizationResult, result2: NormalizationResult): number {
    // Token-based Jaccard similarity
    const set1 = new Set(result1.tokens);
    const set2 = new Set(result2.tokens);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    let similarity = intersection.size / union.size;
    
    // Boost for matching quoted strings
    const quoted1 = result1.normalized.match(/_quoted:([^_]*)/)?.[1] || '';
    const quoted2 = result2.normalized.match(/_quoted:([^_]*)/)?.[1] || '';
    if (quoted1 === quoted2 && quoted1.length > 0) {
      similarity += 0.2;
    }
    
    // Penalty for mismatched positions
    const pos1 = result1.normalized.match(/_pos:([^_]*)/)?.[1] || '';
    const pos2 = result2.normalized.match(/_pos:([^_]*)/)?.[1] || '';
    if (pos1 !== pos2 && (pos1.length > 0 || pos2.length > 0)) {
      similarity -= 0.3;
    }
    
    return Math.max(0, Math.min(1, similarity));
  }

  // Fuzzy matching for typo tolerance
  damerauLevenshtein(a: string, b: string): number {
    const da: { [key: string]: number } = {};
    const maxdist = a.length + b.length;
    const H: number[][] = [];
    
    H[-1] = [];
    H[-1][-1] = maxdist;
    
    for (let i = 0; i <= a.length; i++) {
      H[i] = [];
      H[i][-1] = maxdist;
      H[i][0] = i;
    }
    
    for (let j = 0; j <= b.length; j++) {
      H[-1][j] = maxdist;
      H[0][j] = j;
    }
    
    for (let i = 1; i <= a.length; i++) {
      let db = 0;
      for (let j = 1; j <= b.length; j++) {
        const k = da[b[j - 1]] || 0;
        const l = db;
        let cost = 1;
        if (a[i - 1] === b[j - 1]) {
          cost = 0;
          db = j;
        }
        
        H[i][j] = Math.min(
          H[i - 1][j] + 1,     // insertion
          H[i][j - 1] + 1,     // deletion
          H[i - 1][j - 1] + cost, // substitution
          H[k - 1][l - 1] + (i - k - 1) + 1 + (j - l - 1) // transposition
        );
      }
      da[a[i - 1]] = i;
    }
    
    return H[a.length][b.length];
  }

  // Create fuzzy variations for learning
  generateVariations(input: string): string[] {
    const variations = [input];
    const normalized = this.normalize(input);
    
    // Generate common variations
    variations.push(input.toLowerCase());
    variations.push(input.replace(/\s+/g, ' ').trim());
    variations.push(input.replace(/^(click|press)\s+/i, 'tap '));
    variations.push(input.replace(/\s+button$/i, ''));
    
    // Token permutations (limited)
    if (normalized.tokens.length <= 4) {
      const permutations = this.generateTokenPermutations(normalized.tokens);
      variations.push(...permutations.slice(0, 3)); // Limit to 3 permutations
    }
    
    return [...new Set(variations)];
  }

  private generateTokenPermutations(tokens: string[]): string[] {
    if (tokens.length <= 1) return tokens;
    if (tokens.length > 4) return []; // Too many combinations
    
    const result: string[] = [];
    const permute = (arr: string[], start = 0) => {
      if (start === arr.length) {
        result.push(arr.join(' '));
        return;
      }
      
      for (let i = start; i < arr.length; i++) {
        [arr[start], arr[i]] = [arr[i], arr[start]];
        permute(arr, start + 1);
        [arr[start], arr[i]] = [arr[i], arr[start]]; // backtrack
      }
    };
    
    permute([...tokens]);
    return result;
  }

  /**
   * Calculate Jaccard similarity between two texts
   * Returns similarity score between 0 (no similarity) and 1 (identical)
   */
  calculateJaccardSimilarity(text1: string, text2: string): number {
    if (!text1 || !text2) return 0;
    
    const tokens1 = new Set(text1.toLowerCase().split(/\s+/).filter(t => t.length > 0));
    const tokens2 = new Set(text2.toLowerCase().split(/\s+/).filter(t => t.length > 0));
    
    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)));
    const union = new Set([...tokens1, ...tokens2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Context-aware similarity calculation
   * Integrates with ContextAwareSimilarity for enhanced matching
   */
  calculateContextAwareSimilarity(
    text1: string, 
    text2: string, 
    context?: {
      currentUrl?: string;
      operationType?: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default';
      profile?: string;
      domainMatch?: boolean;
    }
  ): number {
    // Lazy load to avoid circular dependencies
    const { contextAwareSimilarity } = require('./context-aware-similarity.js');
    
    if (!context || !context.currentUrl) {
      // Fallback to basic Jaccard similarity
      return this.calculateJaccardSimilarity(text1, text2);
    }
    
    const similarityContext = {
      currentUrl: context.currentUrl,
      profile: context.profile || 'default',
      domainMatch: context.domainMatch || false,
      operationType: context.operationType || 'default'
    };
    
    return contextAwareSimilarity.calculateSimilarity(text1, text2, similarityContext);
  }

  /**
   * Enhanced similarity that automatically detects action conflicts
   * Returns -1 if actions conflict (should prevent matching)
   */
  calculateSimilarityWithActionDetection(text1: string, text2: string): number {
    // Lazy load to avoid circular dependencies
    const { contextAwareSimilarity } = require('./context-aware-similarity.js');
    
    // Check for conflicting actions first
    if (contextAwareSimilarity.hasConflictingActions(text1, text2)) {
      return -1; // Special value indicating conflict
    }
    
    // Check for exact action match boost
    const baseSimilarity = this.calculateJaccardSimilarity(text1, text2);
    if (contextAwareSimilarity.hasExactActionMatch(text1, text2)) {
      return Math.min(1, baseSimilarity + 0.2); // Boost exact matches
    }
    
    return baseSimilarity;
  }

  /**
   * Get context-appropriate threshold for similarity matching
   */
  getThresholdForOperation(operationType: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default' = 'default'): number {
    // Lazy load to avoid circular dependencies
    const { SIMILARITY_THRESHOLDS } = require('./context-aware-similarity.js');
    
    return SIMILARITY_THRESHOLDS[operationType] || SIMILARITY_THRESHOLDS.default;
  }

  /**
   * Check if similarity meets context-appropriate threshold
   */
  meetsThresholdForOperation(
    similarity: number, 
    operationType: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default' = 'default'
  ): boolean {
    const threshold = this.getThresholdForOperation(operationType);
    return similarity >= threshold;
  }
}