import { TestScenarioCache, TestStep, TestScenario } from './test-scenario-cache.js';
import { TestPatternMatcher, InteractionContext } from './test-pattern-matcher.js';
import { SmartNormalizer } from './smart-normalizer.js';

export interface TestSuggestion {
  type: 'create_new' | 'use_existing' | 'adapt_existing';
  confidence: number;
  scenario?: TestScenario;
  steps?: TestStep[];
  reasoning: string;
  adaptationNeeded?: string[];
}

export interface RecognitionContext {
  url: string;
  pageTitle?: string;
  recentActions: string[];
  userIntent?: string;
  profile?: string;
}

export class IntelligentTestRecognition {
  private cache: TestScenarioCache;
  private matcher: TestPatternMatcher;
  private normalizer: SmartNormalizer;

  constructor() {
    this.cache = new TestScenarioCache();
    this.matcher = new TestPatternMatcher(this.cache);
    this.normalizer = new SmartNormalizer();
  }

  /**
   * Analyze user intent and suggest the best test approach
   */
  async analyzeUserIntent(
    intent: string,
    context: RecognitionContext
  ): Promise<TestSuggestion[]> {
    try {
      const suggestions: TestSuggestion[] = [];
      const normalizedIntent = this.normalizer.normalize(intent);

      // 1. Look for existing similar tests
      const similarTests = await this.cache.findSimilarTests(
        intent,
        context.url,
        context.profile,
        3
      );

      // 2. Find matching patterns
      const patterns = await this.matcher.findMatchingPatterns(
        {
          url: context.url,
          pageTitle: context.pageTitle,
          recentActions: context.recentActions,
          profile: context.profile
        },
        intent
      );

      // Process existing tests
      for (const result of similarTests) {
        if (result.similarity > 0.7) {
          // High similarity - suggest using existing test
          suggestions.push({
            type: 'use_existing',
            confidence: result.similarity,
            scenario: result.scenario,
            reasoning: `Found highly similar test "${result.scenario.name}" (${(result.similarity * 100).toFixed(1)}% match). You can run this directly or adapt it.`,
            adaptationNeeded: result.adaptationSuggestions
          });
        } else if (result.similarity > 0.4) {
          // Medium similarity - suggest adaptation
          suggestions.push({
            type: 'adapt_existing',
            confidence: result.similarity * 0.8, // Reduce confidence for adaptation
            scenario: result.scenario,
            reasoning: `Found similar test "${result.scenario.name}" (${(result.similarity * 100).toFixed(1)}% match). Adaptation recommended for your context.`,
            adaptationNeeded: result.adaptationSuggestions
          });
        }
      }

      // Process patterns for new test creation
      if (patterns.length > 0) {
        const suggestedSteps = this.generateStepsFromPatterns(patterns, context, intent);
        
        suggestions.push({
          type: 'create_new',
          confidence: patterns[0].confidence,
          steps: suggestedSteps,
          reasoning: `Based on learned patterns, I suggest creating a new test with ${suggestedSteps.length} steps. This approach has ${(patterns[0].confidence * 100).toFixed(1)}% confidence.`
        });
      }

      // If no good matches, suggest creating from scratch
      if (suggestions.length === 0 || suggestions.every(s => s.confidence < 0.3)) {
        const basicSteps = this.generateBasicSteps(intent, context);
        
        suggestions.push({
          type: 'create_new',
          confidence: 0.5,
          steps: basicSteps,
          reasoning: `No similar tests or patterns found. I suggest creating a new test tailored to your specific requirements.`
        });
      }

      // Sort by confidence and type priority
      suggestions.sort((a, b) => {
        const typePriority = { 'use_existing': 3, 'adapt_existing': 2, 'create_new': 1 };
        const aPriority = typePriority[a.type] * a.confidence;
        const bPriority = typePriority[b.type] * b.confidence;
        return bPriority - aPriority;
      });

      console.error(`[IntelligentTestRecognition] 🧠 Generated ${suggestions.length} test suggestions for: "${intent}"`);
      return suggestions.slice(0, 3); // Return top 3 suggestions

    } catch (error) {
      console.error(`[IntelligentTestRecognition] ❌ Analysis failed:`, error);
      return [{
        type: 'create_new',
        confidence: 0.3,
        reasoning: 'Analysis failed, but you can still create a basic test manually.',
        steps: []
      }];
    }
  }

  /**
   * Real-time test recognition during user interactions
   */
  async recognizeTestScenario(
    actionSequence: string[],
    context: RecognitionContext
  ): Promise<{recognized: boolean, suggestion?: string, confidence: number}> {
    try {
      if (actionSequence.length < 2) {
        return { recognized: false, confidence: 0 };
      }

      // Build a pattern from recent actions
      const actionsText = actionSequence.join(' ');
      const normalizedActions = this.normalizer.normalize(actionsText);

      // Look for similar patterns in existing tests
      const scenarios = await this.cache.listTestScenarios({
        profile: context.profile
      });

      let bestMatch = { similarity: 0, scenario: null as TestScenario | null };

      for (const scenario of scenarios) {
        const scenarioActions = scenario.steps.map(s => s.action).join(' ');
        const similarity = this.normalizer.calculateJaccardSimilarity(
          normalizedActions.normalized,
          this.normalizer.normalize(scenarioActions).normalized
        );

        if (similarity > bestMatch.similarity) {
          bestMatch = { similarity, scenario };
        }
      }

      if (bestMatch.similarity > 0.6) {
        return {
          recognized: true,
          confidence: bestMatch.similarity,
          suggestion: `Your current actions match "${bestMatch.scenario!.name}" test (${(bestMatch.similarity * 100).toFixed(1)}% similarity). Would you like to save this as a variant or continue the existing pattern?`
        };
      }

      // Check if actions form a recognizable pattern
      if (actionSequence.length >= 3) {
        const patterns = await this.matcher.findMatchingPatterns(
          {
            url: context.url,
            recentActions: actionSequence,
            profile: context.profile
          },
          actionsText
        );

        if (patterns.length > 0 && patterns[0].confidence > 0.5) {
          return {
            recognized: true,
            confidence: patterns[0].confidence,
            suggestion: `I recognize this as a ${patterns[0].matchedPattern.type} pattern. Consider saving these steps as a reusable test scenario.`
          };
        }
      }

      return { recognized: false, confidence: 0 };
    } catch (error) {
      console.error(`[IntelligentTestRecognition] ❌ Recognition failed:`, error);
      return { recognized: false, confidence: 0 };
    }
  }

  /**
   * Generate intelligent test name suggestions
   */
  async suggestTestNames(
    steps: TestStep[],
    context: RecognitionContext,
    userIntent?: string
  ): Promise<string[]> {
    try {
      const suggestions: string[] = [];

      // Extract key actions and elements
      const actions = steps.map(s => s.action);
      const descriptions = steps.map(s => s.description);
      const targets = steps.map(s => s.target || s.selector).filter(Boolean);

      // Analyze patterns
      const hasLogin = descriptions.some(d => 
        d.toLowerCase().includes('login') || 
        d.toLowerCase().includes('sign in') ||
        d.toLowerCase().includes('auth')
      );
      
      const hasNavigation = actions.includes('navigate');
      const hasFormFill = actions.includes('type');
      const hasClick = actions.includes('click');

      // Generate context-based names
      if (userIntent) {
        const cleaned = userIntent.replace(/[^\w\s]/g, '').trim();
        suggestions.push(this.capitalizeWords(cleaned));
      }

      // Pattern-based names
      if (hasLogin) {
        suggestions.push('User Authentication Test');
        suggestions.push('Login Workflow');
        suggestions.push('Sign In Process');
      }

      if (hasNavigation && hasFormFill) {
        suggestions.push('Form Submission Test');
        suggestions.push('Data Entry Workflow');
      }

      if (hasClick && hasNavigation) {
        suggestions.push('Navigation Test');
        suggestions.push('User Journey');
      }

      // URL-based suggestions
      try {
        const urlParts = new URL(context.url).pathname
          .split('/')
          .filter(Boolean)
          .map(part => this.capitalizeWords(part.replace(/[-_]/g, ' ')));
        
        if (urlParts.length > 0) {
          suggestions.push(`${urlParts[urlParts.length - 1]} Test`);
          suggestions.push(`${urlParts[urlParts.length - 1]} Workflow`);
        }
      } catch {
        // Invalid URL, skip
      }

      // Action-based suggestions
      const actionSequence = [...new Set(actions)].join(' ');
      suggestions.push(this.capitalizeWords(actionSequence.replace(/([A-Z])/g, ' $1').trim()) + ' Test');

      // Remove duplicates and return top 5
      return [...new Set(suggestions)].slice(0, 5);
    } catch (error) {
      console.error(`[IntelligentTestRecognition] ❌ Name suggestion failed:`, error);
      return ['Automated Test', 'User Workflow Test'];
    }
  }

  /**
   * Smart test categorization and tagging
   */
  async suggestTestTags(
    scenario: TestScenario,
    context: RecognitionContext
  ): Promise<string[]> {
    try {
      const tags: Set<string> = new Set();

      // Analyze steps for automatic tagging
      for (const step of scenario.steps) {
        const desc = step.description.toLowerCase();
        
        // Authentication tags
        if (desc.includes('login') || desc.includes('sign in') || desc.includes('auth')) {
          tags.add('authentication');
          tags.add('login');
        }
        
        // Form tags
        if (step.action === 'type') {
          tags.add('form');
          tags.add('input');
        }
        
        // Navigation tags
        if (step.action === 'navigate') {
          tags.add('navigation');
        }
        
        // CRUD operations
        if (desc.includes('create') || desc.includes('add')) {
          tags.add('crud');
          tags.add('create');
        }
        if (desc.includes('edit') || desc.includes('update') || desc.includes('modify')) {
          tags.add('crud');
          tags.add('update');
        }
        if (desc.includes('delete') || desc.includes('remove')) {
          tags.add('crud');
          tags.add('delete');
        }
        
        // UI interaction tags
        if (step.action === 'click') {
          tags.add('ui');
          tags.add('interaction');
        }
        
        // Verification tags
        if (step.action === 'assert' || desc.includes('verify') || desc.includes('check')) {
          tags.add('verification');
          tags.add('assertion');
        }
      }

      // URL-based tags
      try {
        const url = new URL(context.url);
        const domain = url.hostname.split('.')[0];
        tags.add(domain);
        
        const pathParts = url.pathname.split('/').filter(Boolean);
        pathParts.forEach(part => {
          if (part.length > 2 && part.length < 15) {
            tags.add(part.toLowerCase());
          }
        });
      } catch {
        // Invalid URL, skip
      }

      // Profile-based tags
      if (context.profile && context.profile !== 'default') {
        tags.add(`profile-${context.profile}`);
      }

      // Workflow complexity tags
      if (scenario.steps.length >= 10) {
        tags.add('complex');
      } else if (scenario.steps.length >= 5) {
        tags.add('medium');
      } else {
        tags.add('simple');
      }

      return Array.from(tags).slice(0, 8); // Limit to 8 most relevant tags
    } catch (error) {
      console.error(`[IntelligentTestRecognition] ❌ Tag suggestion failed:`, error);
      return ['automated', 'test'];
    }
  }

  /**
   * Generate test steps from recognized patterns
   */
  private generateStepsFromPatterns(
    patterns: any[],
    context: RecognitionContext,
    intent: string
  ): TestStep[] {
    const steps: TestStep[] = [];
    
    // Start with navigation if not already on target
    if (!context.recentActions.includes('navigate')) {
      steps.push({
        action: 'navigate',
        target: context.url,
        description: `Navigate to ${context.url}`
      });
    }

    // Generate steps based on top pattern
    const topPattern = patterns[0];
    for (const action of topPattern.matchedPattern.actions) {
      for (const element of topPattern.matchedPattern.elements.slice(0, 2)) {
        steps.push({
          action: action as any,
          selector: element,
          description: `${action} ${element} (pattern-based)`
        });
      }
    }

    // Add verification step
    steps.push({
      action: 'assert',
      description: `Verify ${intent} completed successfully`
    });

    return steps;
  }

  /**
   * Generate basic test steps when no patterns are found
   */
  private generateBasicSteps(intent: string, context: RecognitionContext): TestStep[] {
    const steps: TestStep[] = [];
    
    // Navigation step
    steps.push({
      action: 'navigate',
      target: context.url,
      description: `Navigate to target page`
    });

    // Infer steps from intent
    const normalizedIntent = intent.toLowerCase();
    
    if (normalizedIntent.includes('login') || normalizedIntent.includes('sign in')) {
      steps.push({
        action: 'type',
        selector: 'input[type="email"], input[name="email"], input[name="username"]',
        description: 'Enter username/email',
        value: 'test@example.com'
      });
      steps.push({
        action: 'type',
        selector: 'input[type="password"], input[name="password"]',
        description: 'Enter password',
        value: 'password123'
      });
      steps.push({
        action: 'click',
        selector: 'button[type="submit"], button:has-text("Login"), button:has-text("Sign In")',
        description: 'Click login button'
      });
    }

    if (normalizedIntent.includes('form') || normalizedIntent.includes('submit')) {
      steps.push({
        action: 'type',
        description: 'Fill form field',
        value: 'test data'
      });
      steps.push({
        action: 'click',
        selector: 'button[type="submit"]',
        description: 'Submit form'
      });
    }

    // Always end with verification
    steps.push({
      action: 'assert',
      description: `Verify ${intent} was successful`
    });

    return steps;
  }

  /**
   * Utility function to capitalize words
   */
  private capitalizeWords(text: string): string {
    return text.replace(/\b\w/g, char => char.toUpperCase());
  }

  /**
   * Get smart recommendations for test improvement
   */
  async getTestImprovementSuggestions(scenario: TestScenario): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      // Analyze test for potential improvements
      const steps = scenario.steps;
      
      // Check for brittle selectors
      const brittleSelectors = steps.filter(step => 
        step.selector && (
          step.selector.includes(':nth-child') ||
          step.selector.match(/^#\w{1,3}$/) || // Very short IDs
          step.selector.includes('absolute')
        )
      );

      if (brittleSelectors.length > 0) {
        suggestions.push(`Consider making ${brittleSelectors.length} selectors more robust (avoid nth-child, short IDs)`);
      }

      // Check for missing waits
      const clicksWithoutWaits = steps.filter((step, i) => 
        step.action === 'click' && 
        i < steps.length - 1 &&
        steps[i + 1].action !== 'wait'
      );

      if (clicksWithoutWaits.length > 2) {
        suggestions.push('Add wait conditions after important clicks to improve reliability');
      }

      // Check for missing assertions
      const hasAssertions = steps.some(step => step.action === 'assert');
      if (!hasAssertions) {
        suggestions.push('Add verification steps to ensure test validates expected outcomes');
      }

      // Check for hardcoded values
      const hardcodedValues = steps.filter(step => 
        step.value && 
        !step.value.includes('{{') && // Not templated
        step.value !== '' &&
        step.action === 'type'
      );

      if (hardcodedValues.length > 2) {
        suggestions.push('Consider parameterizing hardcoded values for reusability across environments');
      }

      // Performance suggestions
      if (steps.length > 15) {
        suggestions.push('Large test detected - consider breaking into smaller, focused tests');
      }

      // Pattern suggestions
      const actionPattern = steps.map(s => s.action).join('');
      if (actionPattern.includes('navigatenavigatenarvigate')) {
        suggestions.push('Multiple navigation steps detected - consider consolidating or adding page object pattern');
      }

      return suggestions;
    } catch (error) {
      console.error(`[IntelligentTestRecognition] ❌ Improvement analysis failed:`, error);
      return ['Consider adding more descriptive step names and robust selectors'];
    }
  }
}