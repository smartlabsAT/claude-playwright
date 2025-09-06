import { BidirectionalCache } from './bidirectional-cache.js';
import { SmartNormalizer, NormalizationResult } from './smart-normalizer.js';
import { TestScenario, TestStep } from './test-scenario-cache.js';

export interface PatternMatchResult {
  confidence: number;
  matchedPattern: TestPattern;
  suggestedAdaptations: string[];
  similarityScore: number;
}

export interface TestPattern {
  id: string;
  type: 'interaction' | 'navigation' | 'assertion' | 'workflow';
  elements: string[];
  actions: string[];
  contexts: string[];
  successIndicators: string[];
  adaptationRules: AdaptationRule[];
}

export interface AdaptationRule {
  condition: string;
  action: 'replace_selector' | 'modify_text' | 'adjust_timing' | 'add_fallback';
  parameters: Record<string, any>;
}

export interface InteractionContext {
  url: string;
  profile?: string;
  pageTitle?: string;
  recentActions?: string[];
  currentStep?: TestStep;
}

export class TestPatternMatcher {
  private cache: BidirectionalCache;
  private normalizer: SmartNormalizer;

  constructor(cache: BidirectionalCache | any) {
    this.cache = cache;
    this.normalizer = new SmartNormalizer();
  }

  /**
   * Analyze current context and suggest similar test patterns
   */
  async findMatchingPatterns(
    context: InteractionContext,
    intent: string,
    maxResults: number = 3
  ): Promise<PatternMatchResult[]> {
    try {
      const normalizedIntent = this.normalizer.normalize(intent);
      const patterns = await this.getLearnedPatterns();
      
      const matches: PatternMatchResult[] = [];

      for (const pattern of patterns) {
        const confidence = this.calculatePatternConfidence(normalizedIntent, pattern, context);
        
        // Use context-aware threshold for pattern matching
        const threshold = this.normalizer.getThresholdForOperation('pattern_match');
        if (confidence > threshold) {
          const adaptations = this.generateAdaptations(pattern, context);
          const similarity = this.calculateSimilarityScore(normalizedIntent, pattern);

          matches.push({
            confidence,
            matchedPattern: pattern,
            suggestedAdaptations: adaptations,
            similarityScore: similarity
          });
        }
      }

      // Sort by confidence and similarity
      matches.sort((a, b) => 
        (b.confidence * 0.6 + b.similarityScore * 0.4) - (a.confidence * 0.6 + a.similarityScore * 0.4)
      );

      console.error(`[TestPatternMatcher] 🎯 Found ${matches.length} matching patterns for: "${intent}"`);
      return matches.slice(0, maxResults);
    } catch (error) {
      console.error(`[TestPatternMatcher] ❌ Pattern matching failed:`, error);
      return [];
    }
  }

  /**
   * Learn new patterns from successful test executions
   */
  async learnFromTestExecution(
    scenario: TestScenario,
    context: InteractionContext,
    executionResult: {success: boolean, adaptations: string[], timing: number}
  ): Promise<void> {
    try {
      if (!executionResult.success) {
        console.error(`[TestPatternMatcher] ⚠️ Skipping learning from failed test: ${scenario.name}`);
        return;
      }

      const patterns = this.extractPatternsFromScenario(scenario, context, executionResult);
      
      for (const pattern of patterns) {
        await this.saveOrUpdatePattern(pattern);
      }

      console.error(`[TestPatternMatcher] 🧠 Learned ${patterns.length} patterns from successful test: ${scenario.name}`);
    } catch (error) {
      console.error(`[TestPatternMatcher] ❌ Failed to learn from test execution:`, error);
    }
  }

  /**
   * Generate intelligent test suggestions based on current context
   */
  async suggestTestActions(context: InteractionContext): Promise<string[]> {
    try {
      const suggestions: string[] = [];
      const patterns = await this.getLearnedPatterns();

      // Analyze current context for common patterns
      for (const pattern of patterns) {
        if (this.isPatternApplicable(pattern, context)) {
          const actionSuggestions = this.generateActionSuggestions(pattern, context);
          suggestions.push(...actionSuggestions);
        }
      }

      // Remove duplicates and sort by relevance
      const uniqueSuggestions = [...new Set(suggestions)];
      const scored = uniqueSuggestions.map(suggestion => ({
        text: suggestion,
        score: this.scoreActionRelevance(suggestion, context)
      }));

      scored.sort((a, b) => b.score - a.score);
      
      const topSuggestions = scored.slice(0, 5).map(s => s.text);
      
      console.error(`[TestPatternMatcher] 💡 Generated ${topSuggestions.length} action suggestions`);
      return topSuggestions;
    } catch (error) {
      console.error(`[TestPatternMatcher] ❌ Failed to generate suggestions:`, error);
      return [];
    }
  }

  /**
   * Adapt existing test scenario to new context
   */
  async adaptTestScenario(
    scenario: TestScenario,
    targetContext: InteractionContext
  ): Promise<{adaptedScenario: TestScenario, adaptations: string[]}> {
    try {
      const adaptations: string[] = [];
      const adaptedSteps: TestStep[] = [];

      for (const step of scenario.steps) {
        const adaptedStep = await this.adaptTestStep(step, targetContext);
        
        if (adaptedStep.adapted) {
          adaptations.push(`Step "${step.description}": ${adaptedStep.adaptation}`);
        }
        
        adaptedSteps.push(adaptedStep.step);
      }

      const adaptedScenario: TestScenario = {
        ...scenario,
        steps: adaptedSteps,
        urlPattern: this.adaptUrlPattern(scenario.urlPattern, targetContext.url),
        profile: targetContext.profile || scenario.profile,
        name: `${scenario.name} (Adapted)`
      };

      console.error(`[TestPatternMatcher] 🔄 Adapted test scenario with ${adaptations.length} changes`);
      
      return {
        adaptedScenario,
        adaptations
      };
    } catch (error) {
      console.error(`[TestPatternMatcher] ❌ Test adaptation failed:`, error);
      throw error;
    }
  }

  /**
   * Get learned patterns from the database
   */
  private async getLearnedPatterns(): Promise<TestPattern[]> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = (this.cache as any).db.prepare(`
          SELECT * FROM test_patterns 
          ORDER BY confidence DESC, success_count DESC
        `);
        
        const rows = stmt.all() as any[];
        const patterns: TestPattern[] = rows.map(row => ({
          id: row.pattern_hash,
          type: this.mapInteractionTypeToPatternType(row.interaction_type),
          elements: JSON.parse(row.element_patterns),
          actions: [row.interaction_type],
          contexts: [row.interaction_type],
          successIndicators: row.success_indicators.split('|').filter(Boolean),
          adaptationRules: JSON.parse(row.adaptation_rules)?.selectorAdaptations?.map((rule: string) => ({
            condition: 'selector_not_found',
            action: 'replace_selector' as const,
            parameters: { strategy: rule }
          })) || []
        }));

        resolve(patterns);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Calculate confidence score for a pattern match
   */
  private calculatePatternConfidence(
    normalizedIntent: NormalizationResult,
    pattern: TestPattern,
    context: InteractionContext
  ): number {
    let confidence = 0;
    let factors = 0;

    // Intent similarity
    const intentSimilarity = this.calculateIntentSimilarity(normalizedIntent, pattern);
    confidence += intentSimilarity * 0.4;
    factors += 0.4;

    // Context relevance
    const contextRelevance = this.calculateContextRelevance(pattern, context);
    confidence += contextRelevance * 0.3;
    factors += 0.3;

    // Pattern success rate
    const successRelevance = Math.min(pattern.successIndicators.length / 3, 1);
    confidence += successRelevance * 0.2;
    factors += 0.2;

    // Element availability
    const elementRelevance = this.calculateElementRelevance(pattern, context);
    confidence += elementRelevance * 0.1;
    factors += 0.1;

    return factors > 0 ? confidence / factors : 0;
  }

  /**
   * Calculate similarity between intent and pattern using context-aware methods
   */
  private calculateIntentSimilarity(normalizedIntent: NormalizationResult, pattern: TestPattern): number {
    const patternText = [
      ...pattern.actions,
      ...pattern.successIndicators,
      ...pattern.elements
    ].join(' ');
    
    const normalizedPattern = this.normalizer.normalize(patternText);
    
    // Use action detection to prevent conflicting patterns
    const similarity = this.normalizer.calculateSimilarityWithActionDetection(
      normalizedIntent.normalized,
      normalizedPattern.normalized
    );
    
    // Return 0 if actions conflict (similarity === -1)
    return similarity === -1 ? 0 : similarity;
  }

  /**
   * Calculate context relevance for a pattern
   */
  private calculateContextRelevance(pattern: TestPattern, context: InteractionContext): number {
    let relevance = 0.5; // Base relevance

    // URL pattern matching
    if (context.url) {
      const urlWords = context.url.split('/').filter(Boolean);
      const patternElements = pattern.elements.join(' ').toLowerCase();
      
      for (const word of urlWords) {
        if (patternElements.includes(word.toLowerCase())) {
          relevance += 0.1;
        }
      }
    }

    // Recent actions context
    if (context.recentActions) {
      for (const recentAction of context.recentActions) {
        if (pattern.actions.some(action => 
          this.normalizer.calculateJaccardSimilarity(action, recentAction) > 0.3
        )) {
          relevance += 0.2;
        }
      }
    }

    return Math.min(relevance, 1.0);
  }

  /**
   * Calculate element relevance for current context
   */
  private calculateElementRelevance(pattern: TestPattern, context: InteractionContext): number {
    // This would ideally check if pattern elements are available on current page
    // For now, we return a base score
    return 0.7;
  }

  /**
   * Calculate similarity score between intent and pattern
   */
  private calculateSimilarityScore(normalizedIntent: NormalizationResult, pattern: TestPattern): number {
    return this.calculateIntentSimilarity(normalizedIntent, pattern);
  }

  /**
   * Generate adaptation suggestions for a pattern
   */
  private generateAdaptations(pattern: TestPattern, context: InteractionContext): string[] {
    const adaptations: string[] = [];

    // URL adaptations
    if (context.url) {
      adaptations.push(`Adapt pattern for URL: ${context.url}`);
    }

    // Profile adaptations
    if (context.profile) {
      adaptations.push(`Adapt for profile: ${context.profile}`);
    }

    // Element adaptations
    for (const rule of pattern.adaptationRules) {
      adaptations.push(`Apply ${rule.action}: ${rule.parameters?.strategy || rule.condition}`);
    }

    return adaptations;
  }

  /**
   * Extract patterns from successful test scenario
   */
  private extractPatternsFromScenario(
    scenario: TestScenario,
    context: InteractionContext,
    result: {success: boolean, adaptations: string[], timing: number}
  ): TestPattern[] {
    const patterns: TestPattern[] = [];

    // Group steps by interaction type
    const stepGroups = scenario.steps.reduce((groups, step) => {
      if (!groups[step.action]) {
        groups[step.action] = [];
      }
      groups[step.action].push(step);
      return groups;
    }, {} as Record<string, TestStep[]>);

    for (const [action, steps] of Object.entries(stepGroups)) {
      const pattern: TestPattern = {
        id: `${scenario.name}_${action}_${Date.now()}`,
        type: this.mapInteractionTypeToPatternType(action),
        elements: steps.map(s => s.selector || s.target || '').filter(Boolean),
        actions: [action],
        contexts: [context.url],
        successIndicators: steps.map(s => s.description),
        adaptationRules: this.generateAdaptationRulesFromResult(result.adaptations)
      };

      patterns.push(pattern);
    }

    return patterns;
  }

  /**
   * Map interaction type to pattern type
   */
  private mapInteractionTypeToPatternType(interactionType: string): 'interaction' | 'navigation' | 'assertion' | 'workflow' {
    switch (interactionType) {
      case 'navigate':
        return 'navigation';
      case 'assert':
        return 'assertion';
      case 'click':
      case 'type':
        return 'interaction';
      default:
        return 'workflow';
    }
  }

  /**
   * Generate adaptation rules from execution adaptations
   */
  private generateAdaptationRulesFromResult(adaptations: string[]): AdaptationRule[] {
    return adaptations.map(adaptation => ({
      condition: 'context_change',
      action: 'modify_text' as const,
      parameters: { adaptation }
    }));
  }

  /**
   * Save or update a learned pattern
   */
  private async saveOrUpdatePattern(pattern: TestPattern): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = (this.cache as any).db.prepare(`
          INSERT OR REPLACE INTO test_patterns
          (interaction_type, element_patterns, success_indicators, adaptation_rules, pattern_hash, confidence, success_count, total_count, learned_from, created_at, last_used)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const now = Date.now();
        stmt.run(
          pattern.actions[0],
          JSON.stringify(pattern.elements),
          pattern.successIndicators.join('|'),
          JSON.stringify(pattern.adaptationRules),
          pattern.id,
          0.8,
          1,
          1,
          'learned',
          now,
          now
        );

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Check if pattern is applicable to current context
   */
  private isPatternApplicable(pattern: TestPattern, context: InteractionContext): boolean {
    // Check URL context
    if (pattern.contexts.some(ctx => context.url.includes(ctx))) {
      return true;
    }

    // Check recent actions
    if (context.recentActions) {
      return context.recentActions.some(action => 
        pattern.actions.some(patternAction => 
          this.normalizer.calculateJaccardSimilarity(action, patternAction) > 0.4
        )
      );
    }

    return false;
  }

  /**
   * Generate action suggestions based on pattern
   */
  private generateActionSuggestions(pattern: TestPattern, context: InteractionContext): string[] {
    const suggestions: string[] = [];

    for (const indicator of pattern.successIndicators) {
      if (indicator.length > 5) { // Filter out too short indicators
        suggestions.push(`Try: ${indicator}`);
      }
    }

    for (const element of pattern.elements.slice(0, 2)) { // Limit to avoid spam
      if (element.length > 3) {
        suggestions.push(`Interact with: ${element}`);
      }
    }

    return suggestions;
  }

  /**
   * Score action relevance for current context
   */
  private scoreActionRelevance(suggestion: string, context: InteractionContext): number {
    let score = 0.5;

    // Check if suggestion contains URL keywords
    if (context.url) {
      const urlWords = context.url.split(/[\/\-\_\.]/).filter(w => w.length > 2);
      for (const word of urlWords) {
        if (suggestion.toLowerCase().includes(word.toLowerCase())) {
          score += 0.2;
        }
      }
    }

    // Check recent actions
    if (context.recentActions) {
      for (const action of context.recentActions) {
        if (this.normalizer.calculateJaccardSimilarity(suggestion, action) > 0.3) {
          score += 0.3;
        }
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Adapt a single test step to new context
   */
  private async adaptTestStep(
    step: TestStep,
    context: InteractionContext
  ): Promise<{step: TestStep, adapted: boolean, adaptation?: string}> {
    let adaptedStep = { ...step };
    let adapted = false;
    let adaptation = '';

    // Adapt selector if needed
    if (step.selector) {
      const normalizedSelector = this.normalizer.normalize(step.selector);
      
      // Try to find similar selector in cache
      const fallback = await this.findSelectorFallback(step.selector, context.url);
      if (fallback && fallback !== step.selector) {
        adaptedStep.selector = fallback;
        adapted = true;
        adaptation = `Updated selector from "${step.selector}" to "${fallback}"`;
      }
    }

    // Adapt URL in navigate steps
    if (step.action === 'navigate' && step.target) {
      const adaptedUrl = this.adaptUrlForContext(step.target, context.url);
      if (adaptedUrl !== step.target) {
        adaptedStep.target = adaptedUrl;
        adapted = true;
        adaptation = `Updated URL from "${step.target}" to "${adaptedUrl}"`;
      }
    }

    return { step: adaptedStep, adapted, adaptation };
  }

  /**
   * Find selector fallback using cache intelligence
   */
  private async findSelectorFallback(originalSelector: string, url: string): Promise<string | null> {
    try {
      // Use existing BidirectionalCache lookup
      const result = await this.cache.get('fallback search', url);
      return result?.selector || null;
    } catch {
      return null;
    }
  }

  /**
   * Adapt URL pattern for new context
   */
  private adaptUrlPattern(originalPattern: string, targetUrl: string): string {
    try {
      const originalDomain = new URL(originalPattern).hostname;
      const targetDomain = new URL(targetUrl).hostname;
      
      if (originalDomain !== targetDomain) {
        return originalPattern.replace(originalDomain, targetDomain);
      }
      
      return originalPattern;
    } catch {
      return targetUrl;
    }
  }

  /**
   * Adapt URL for current context
   */
  private adaptUrlForContext(originalUrl: string, contextUrl: string): string {
    try {
      // If original is relative, make it absolute with context domain
      if (originalUrl.startsWith('/')) {
        const contextBase = new URL(contextUrl).origin;
        return contextBase + originalUrl;
      }
      
      // If different domains, try to adapt
      const originalDomain = new URL(originalUrl).hostname;
      const contextDomain = new URL(contextUrl).hostname;
      
      if (originalDomain !== contextDomain) {
        return originalUrl.replace(originalDomain, contextDomain);
      }
      
      return originalUrl;
    } catch {
      return originalUrl;
    }
  }
}