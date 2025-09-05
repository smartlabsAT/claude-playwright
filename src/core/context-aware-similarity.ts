import { SmartNormalizer, NormalizationResult } from './smart-normalizer.js';

/**
 * Context information for similarity calculations
 */
export interface SimilarityContext {
  /** Current URL for context */
  currentUrl: string;
  
  /** DOM signature for page state */
  domSignature?: string;
  
  /** Browser profile being used */
  profile: string;
  
  /** Whether domains match between contexts */
  domainMatch: boolean;
  
  /** Operation type context */
  operationType?: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default';
  
  /** Additional context metadata */
  metadata?: {
    /** Environment type (local, staging, prod) */
    environment?: string;
    
    /** Page type (login, dashboard, settings) */
    pageType?: string;
    
    /** User intent confidence */
    intentConfidence?: number;
  };
}

/**
 * Context-aware similarity threshold configuration
 * Different use cases require different sensitivity levels
 */
export const SIMILARITY_THRESHOLDS = {
  /** Stricter for test matching to prevent false positives */
  test_search: 0.35,
  
  /** Permissive for selector variation tolerance */
  cache_lookup: 0.15,
  
  /** Moderate for pattern recognition */
  pattern_match: 0.25,
  
  /** Very strict for cross-environment matching */
  cross_env: 0.40,
  
  /** Default fallback threshold */
  default: 0.20
} as const;

/**
 * Action conflict pairs - actions that should never match
 */
const ACTION_CONFLICTS: Record<string, string[]> = {
  'login': ['logout', 'signout', 'disconnect'],
  'logout': ['login', 'signin', 'connect'],
  'create': ['delete', 'remove', 'destroy'],
  'delete': ['create', 'add', 'new'],
  'open': ['close', 'minimize', 'hide'],
  'close': ['open', 'maximize', 'show'],
  'start': ['stop', 'end', 'finish'],
  'stop': ['start', 'begin', 'resume'],
  'enable': ['disable', 'deactivate'],
  'disable': ['enable', 'activate'],
  'save': ['discard', 'cancel', 'reset'],
  'cancel': ['save', 'submit', 'confirm']
};

/**
 * Domain extraction for cross-environment matching
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url.split('/')[0] || url;
  }
}

/**
 * Enhanced context-aware similarity calculation system
 * Provides intelligent matching with action conflict detection and contextual thresholds
 */
export class ContextAwareSimilarity {
  private normalizer: SmartNormalizer;

  constructor() {
    this.normalizer = new SmartNormalizer();
  }

  /**
   * Calculate context-aware similarity between two texts
   * Returns enhanced similarity score with context considerations
   */
  calculateSimilarity(
    query: string, 
    candidate: string, 
    context: SimilarityContext
  ): number {
    if (!query || !candidate) return 0;

    // Get normalized results for both inputs
    const queryNorm = this.normalizer.normalize(query);
    const candidateNorm = this.normalizer.normalize(candidate);

    // Base Jaccard similarity
    let similarity = this.calculateBaseSimilarity(queryNorm, candidateNorm);

    // Apply context-aware enhancements
    similarity = this.applyContextEnhancements(similarity, query, candidate, context);

    // Apply action-specific logic
    similarity = this.applyActionLogic(similarity, queryNorm, candidateNorm);

    // Apply domain matching bonuses
    similarity = this.applyDomainMatching(similarity, context);

    // Ensure bounds
    return Math.max(0, Math.min(1, similarity));
  }

  /**
   * Check if query has exact action match with candidate
   */
  hasExactActionMatch(query: string, candidate: string): boolean {
    const queryActions = this.extractActions(query);
    const candidateActions = this.extractActions(candidate);

    return queryActions.some(qAction => 
      candidateActions.some(cAction => qAction === cAction)
    );
  }

  /**
   * Check if query has conflicting actions with candidate
   * Returns true if actions should prevent matching
   */
  hasConflictingActions(query: string, candidate: string): boolean {
    const queryActions = this.extractActions(query);
    const candidateActions = this.extractActions(candidate);

    for (const qAction of queryActions) {
      const conflicts = ACTION_CONFLICTS[qAction] || [];
      for (const cAction of candidateActions) {
        if (conflicts.includes(cAction)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get appropriate threshold for given context
   */
  getThresholdForContext(context: SimilarityContext): number {
    if (context.operationType && context.operationType in SIMILARITY_THRESHOLDS) {
      return SIMILARITY_THRESHOLDS[context.operationType];
    }
    return SIMILARITY_THRESHOLDS.default;
  }

  /**
   * Check if similarity meets threshold for context
   */
  meetsThreshold(similarity: number, context: SimilarityContext): boolean {
    const threshold = this.getThresholdForContext(context);
    return similarity >= threshold;
  }

  /**
   * Calculate base Jaccard similarity using normalized results
   */
  private calculateBaseSimilarity(
    queryNorm: NormalizationResult, 
    candidateNorm: NormalizationResult
  ): number {
    return this.normalizer.calculateSimilarity(queryNorm, candidateNorm);
  }

  /**
   * Apply context-aware enhancements to similarity score
   */
  private applyContextEnhancements(
    baseSimilarity: number, 
    query: string, 
    candidate: string,
    context: SimilarityContext
  ): number {
    let enhanced = baseSimilarity;

    // Environment context boost
    if (context.metadata?.environment) {
      if (query.toLowerCase().includes(context.metadata.environment) ||
          candidate.toLowerCase().includes(context.metadata.environment)) {
        enhanced += 0.1;
      }
    }

    // Page type context boost
    if (context.metadata?.pageType) {
      if (query.toLowerCase().includes(context.metadata.pageType) ||
          candidate.toLowerCase().includes(context.metadata.pageType)) {
        enhanced += 0.1;
      }
    }

    // Intent confidence scaling
    if (context.metadata?.intentConfidence !== undefined) {
      enhanced *= context.metadata.intentConfidence;
    }

    // Profile-specific considerations
    if (context.profile !== 'default') {
      // Mobile profile might need different matching
      if (context.profile.includes('mobile') && 
          (query.includes('tap') || candidate.includes('tap'))) {
        enhanced += 0.05;
      }
    }

    return enhanced;
  }

  /**
   * Apply action-specific logic (boosts and conflicts)
   */
  private applyActionLogic(
    similarity: number,
    queryNorm: NormalizationResult,
    candidateNorm: NormalizationResult
  ): number {
    const queryText = queryNorm.normalized;
    const candidateText = candidateNorm.normalized;

    // Exact action match boost
    if (this.hasExactActionMatch(queryText, candidateText)) {
      similarity += 0.2;
    }

    // Conflicting action penalty
    if (this.hasConflictingActions(queryText, candidateText)) {
      // Severe penalty for conflicting actions
      similarity -= 0.5;
    }

    // Semantic action matching (synonyms)
    const actionBoost = this.calculateActionSynonymBoost(queryText, candidateText);
    similarity += actionBoost;

    return similarity;
  }

  /**
   * Apply domain matching logic for cross-environment scenarios
   */
  private applyDomainMatching(similarity: number, context: SimilarityContext): number {
    if (context.domainMatch) {
      // Same domain - slight boost for consistency
      return similarity + 0.05;
    } else {
      // Different domains - apply cross-environment logic
      const domains = this.extractDomainPatterns(context.currentUrl);
      
      // Common domain patterns get smaller penalty
      if (domains.some(domain => 
        ['localhost', 'staging', 'dev', 'test'].some(pattern => 
          domain.includes(pattern)))) {
        return similarity - 0.05; // Small penalty for dev environments
      }
      
      // Completely different domains get larger penalty
      return similarity - 0.1;
    }
  }

  /**
   * Extract actions from normalized text
   */
  private extractActions(text: string): string[] {
    const actions: string[] = [];
    const normalized = text.toLowerCase();
    
    // Common action patterns
    const actionPatterns = [
      /\b(click|tap|press|select|choose)\b/g,
      /\b(type|enter|input|fill|write)\b/g,
      /\b(navigate|go|open|visit|load)\b/g,
      /\b(login|signin|authenticate)\b/g,
      /\b(logout|signout|disconnect)\b/g,
      /\b(create|add|new|make)\b/g,
      /\b(delete|remove|destroy|clear)\b/g,
      /\b(save|submit|confirm)\b/g,
      /\b(cancel|discard|reset)\b/g,
      /\b(start|begin|initiate)\b/g,
      /\b(stop|end|finish|close)\b/g,
      /\b(enable|activate|turn\s+on)\b/g,
      /\b(disable|deactivate|turn\s+off)\b/g
    ];

    for (const pattern of actionPatterns) {
      const matches = normalized.match(pattern);
      if (matches) {
        actions.push(...matches);
      }
    }

    return [...new Set(actions)]; // Remove duplicates
  }

  /**
   * Calculate boost for action synonyms
   */
  private calculateActionSynonymBoost(query: string, candidate: string): number {
    const queryActions = this.extractActions(query);
    const candidateActions = this.extractActions(candidate);

    let boost = 0;

    // Check for synonym matches
    const synonymGroups = [
      ['click', 'tap', 'press', 'select'],
      ['type', 'enter', 'input', 'fill'],
      ['navigate', 'go', 'open', 'visit'],
      ['login', 'signin', 'authenticate'],
      ['logout', 'signout', 'disconnect'],
      ['create', 'add', 'new'],
      ['delete', 'remove', 'destroy'],
      ['save', 'submit', 'confirm'],
      ['cancel', 'discard', 'reset']
    ];

    for (const group of synonymGroups) {
      const queryHasSynonym = queryActions.some(action => 
        group.some(synonym => action.includes(synonym))
      );
      const candidateHasSynonym = candidateActions.some(action =>
        group.some(synonym => action.includes(synonym))
      );

      if (queryHasSynonym && candidateHasSynonym) {
        boost += 0.1;
      }
    }

    return Math.min(boost, 0.3); // Cap the synonym boost
  }

  /**
   * Extract domain patterns for analysis
   */
  private extractDomainPatterns(url: string): string[] {
    const domain = extractDomain(url);
    const parts = domain.split('.');
    
    return [
      domain,
      ...parts,
      parts.slice(-2).join('.') // TLD + domain
    ];
  }

  /**
   * Create similarity context from available information
   */
  static createContext(
    currentUrl: string,
    operationType: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default' = 'default',
    options: Partial<SimilarityContext> = {}
  ): SimilarityContext {
    const context: SimilarityContext = {
      currentUrl,
      operationType: operationType as any,
      profile: options.profile || 'default',
      domainMatch: false,
      ...options
    };

    // Determine domain match if comparing URLs
    if (options.domSignature && context.currentUrl) {
      const currentDomain = extractDomain(context.currentUrl);
      const contextDomain = extractDomain(options.domSignature);
      context.domainMatch = currentDomain === contextDomain;
    }

    return context;
  }

  /**
   * Enhanced similarity with automatic context detection
   */
  calculateSimilarityWithAutoContext(
    query: string,
    candidate: string,
    currentUrl: string,
    operationType: 'test_search' | 'cache_lookup' | 'pattern_match' | 'cross_env' | 'default' = 'default'
  ): number {
    const context = ContextAwareSimilarity.createContext(currentUrl, operationType);
    return this.calculateSimilarity(query, candidate, context);
  }

  /**
   * Batch similarity calculation with context
   */
  calculateBatchSimilarity(
    query: string,
    candidates: string[],
    context: SimilarityContext
  ): Array<{ candidate: string; similarity: number; meetsThreshold: boolean }> {
    return candidates.map(candidate => {
      const similarity = this.calculateSimilarity(query, candidate, context);
      return {
        candidate,
        similarity,
        meetsThreshold: this.meetsThreshold(similarity, context)
      };
    });
  }

  /**
   * Find best matches with context awareness
   */
  findBestMatches(
    query: string,
    candidates: string[],
    context: SimilarityContext,
    maxResults: number = 5
  ): Array<{ candidate: string; similarity: number; rank: number }> {
    const results = this.calculateBatchSimilarity(query, candidates, context)
      .filter(result => result.meetsThreshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, maxResults);

    return results.map((result, index) => ({
      candidate: result.candidate,
      similarity: result.similarity,
      rank: index + 1
    }));
  }
}

/**
 * Singleton instance for global usage
 */
export const contextAwareSimilarity = new ContextAwareSimilarity();