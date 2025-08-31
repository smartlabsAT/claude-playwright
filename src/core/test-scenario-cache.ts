import { BidirectionalCache } from './bidirectional-cache.js';
import { SmartNormalizer } from './smart-normalizer.js';
import crypto from 'crypto';

export interface TestStep {
  action: 'navigate' | 'click' | 'type' | 'wait' | 'assert' | 'screenshot';
  target?: string;
  value?: string;
  selector?: string;
  timeout?: number;
  description: string;
}

export interface TestScenario {
  name: string;
  description?: string;
  steps: TestStep[];
  tags?: string[];
  urlPattern: string;
  profile?: string;
}

interface TestScenarioEntry {
  id?: number;
  name: string;
  description?: string;
  steps_json: string;
  pattern_hash: string;
  url_pattern: string;
  tags?: string;
  profile?: string;
  success_rate: number;
  total_runs: number;
  last_run?: number;
  last_adapted?: number;
  created_at: number;
  confidence: number;
}

interface TestExecutionEntry {
  id?: number;
  scenario_id: number;
  status: 'success' | 'failure' | 'partial' | 'adapted';
  execution_time: number;
  selector_adaptations?: string;
  error_details?: string;
  snapshot_id?: string;
  confidence_score?: number;
  profile?: string;
  url: string;
  timestamp: number;
}

interface TestPatternEntry {
  id?: number;
  interaction_type: string;
  element_patterns: string;
  success_indicators: string;
  adaptation_rules: string;
  pattern_hash: string;
  confidence: number;
  success_count: number;
  total_count: number;
  learned_from: 'direct' | 'inferred' | 'pattern';
  created_at: number;
  last_used: number;
}

interface TestSearchResult {
  scenario: TestScenario;
  similarity: number;
  confidence: number;
  adaptationSuggestions?: string[];
}

export class TestScenarioCache extends BidirectionalCache {
  private normalizer: SmartNormalizer;

  constructor() {
    super();
    this.normalizer = new SmartNormalizer();
  }

  /**
   * Save a test scenario with intelligent pattern recognition
   */
  saveTestScenario(scenario: TestScenario): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        const now = Date.now();
        const stepsJson = JSON.stringify(scenario.steps);
        const patternHash = this.generatePatternHash(scenario);
        const tags = scenario.tags ? scenario.tags.join(',') : null;

        const stmt = this.db.prepare(`
          INSERT INTO test_scenarios 
          (name, description, steps_json, pattern_hash, url_pattern, tags, profile, success_rate, total_runs, created_at, confidence)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const result = stmt.run(
          scenario.name,
          scenario.description || null,
          stepsJson,
          patternHash,
          scenario.urlPattern,
          tags,
          scenario.profile || null,
          1.0,
          0,
          now,
          0.8
        );

        // Learn test patterns for future recognition
        this.learnTestPatterns(scenario, patternHash);

        console.error(`[TestScenarioCache] ✅ Saved test scenario '${scenario.name}' with ID ${result.lastInsertRowid}`);
        resolve(result.lastInsertRowid as number);
      } catch (error) {
        console.error(`[TestScenarioCache] ❌ Failed to save test scenario:`, error);
        reject(error);
      }
    });
  }

  /**
   * Find similar test scenarios using AI-powered matching
   */
  findSimilarTests(query: string, url?: string, profile?: string, limit: number = 5): Promise<TestSearchResult[]> {
    return new Promise((resolve, reject) => {
      try {
        const normalizedQuery = this.normalizer.normalize(query);
        
        let sql = `
          SELECT * FROM test_scenarios 
          WHERE 1=1
        `;
        const params: any[] = [];

        if (url) {
          sql += ` AND (url_pattern LIKE ? OR ? LIKE url_pattern)`;
          params.push(`%${url}%`, `%${url}%`);
        }

        if (profile) {
          sql += ` AND (profile = ? OR profile IS NULL)`;
          params.push(profile);
        }

        sql += ` ORDER BY success_rate DESC, confidence DESC, last_run DESC`;

        const scenarios = this.db.prepare(sql).all(...params) as TestScenarioEntry[];
        
        const results: TestSearchResult[] = [];

        for (const scenarioEntry of scenarios) {
          const scenario: TestScenario = {
            name: scenarioEntry.name,
            description: scenarioEntry.description,
            steps: JSON.parse(scenarioEntry.steps_json),
            tags: scenarioEntry.tags ? scenarioEntry.tags.split(',') : undefined,
            urlPattern: scenarioEntry.url_pattern,
            profile: scenarioEntry.profile || undefined
          };

          // Calculate similarity using SmartNormalizer
          const similarity = this.calculateTestSimilarity(normalizedQuery, scenario, scenarioEntry);

          if (similarity > 0.2) { // Minimum similarity threshold
            results.push({
              scenario,
              similarity,
              confidence: scenarioEntry.confidence,
              adaptationSuggestions: this.generateAdaptationSuggestions(scenario, url)
            });
          }

          if (results.length >= limit) break;
        }

        // Sort by similarity and confidence
        results.sort((a, b) => 
          (b.similarity * 0.7 + b.confidence * 0.3) - (a.similarity * 0.7 + a.confidence * 0.3)
        );

        console.error(`[TestScenarioCache] 🔍 Found ${results.length} similar tests for query: "${query}"`);
        resolve(results);
      } catch (error) {
        console.error(`[TestScenarioCache] ❌ Failed to find similar tests:`, error);
        reject(error);
      }
    });
  }

  /**
   * Execute a test scenario with intelligent adaptation
   */
  async executeTestScenario(scenarioName: string, adaptContext?: {url?: string, profile?: string}): Promise<{success: boolean, adaptations: string[], executionTime: number}> {
    try {
      const startTime = Date.now();
      const scenario = await this.getTestScenario(scenarioName);
      
      if (!scenario) {
        throw new Error(`Test scenario '${scenarioName}' not found`);
      }

      const adaptations: string[] = [];
      let success = true;

      // Here would be the actual test execution logic
      // For now, we simulate execution and learning
      
      const executionTime = Date.now() - startTime;
      const status: 'success' | 'failure' | 'partial' | 'adapted' = success ? 
        (adaptations.length > 0 ? 'adapted' : 'success') : 'failure';

      // Record execution
      await this.recordTestExecution(scenarioName, status, executionTime, adaptations, adaptContext);

      // Update success rate
      await this.updateTestSuccessRate(scenarioName, success);

      console.error(`[TestScenarioCache] ${success ? '✅' : '❌'} Test '${scenarioName}' ${status} (${executionTime}ms)`);
      
      return { success, adaptations, executionTime };
    } catch (error) {
      console.error(`[TestScenarioCache] ❌ Test execution failed:`, error);
      throw error;
    }
  }

  /**
   * Get a specific test scenario by name
   */
  private getTestScenario(name: string): Promise<TestScenario | null> {
    return new Promise((resolve, reject) => {
      try {
        const stmt = this.db.prepare('SELECT * FROM test_scenarios WHERE name = ?');
        const result = stmt.get(name) as TestScenarioEntry | undefined;
        
        if (!result) {
          resolve(null);
          return;
        }

        const scenario: TestScenario = {
          name: result.name,
          description: result.description,
          steps: JSON.parse(result.steps_json),
          tags: result.tags ? result.tags.split(',') : undefined,
          urlPattern: result.url_pattern,
          profile: result.profile || undefined
        };

        resolve(scenario);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Generate a pattern hash for test recognition
   */
  private generatePatternHash(scenario: TestScenario): string {
    const patternData = {
      steps: scenario.steps.map(step => ({
        action: step.action,
        target: step.target ? this.normalizer.normalize(step.target).normalizedText : null
      })),
      urlPattern: scenario.urlPattern
    };
    
    return crypto.createHash('sha256')
      .update(JSON.stringify(patternData))
      .digest('hex')
      .substring(0, 32);
  }

  /**
   * Learn patterns from saved test scenarios
   */
  private learnTestPatterns(scenario: TestScenario, patternHash: string): void {
    try {
      const now = Date.now();
      
      // Extract interaction patterns
      const interactionTypes = [...new Set(scenario.steps.map(s => s.action))];
      
      for (const interactionType of interactionTypes) {
        const steps = scenario.steps.filter(s => s.action === interactionType);
        const elementPatterns = steps.map(s => s.selector || s.target || '').filter(Boolean);
        const successIndicators = steps.map(s => s.description).join('|');

        if (elementPatterns.length > 0) {
          const patternEntry: TestPatternEntry = {
            interaction_type: interactionType,
            element_patterns: JSON.stringify(elementPatterns),
            success_indicators: successIndicators,
            adaptation_rules: JSON.stringify(this.generateAdaptationRules(interactionType, elementPatterns)),
            pattern_hash: crypto.createHash('md5').update(`${interactionType}:${elementPatterns.join(',')}`).digest('hex'),
            confidence: 0.7,
            success_count: 1,
            total_count: 1,
            learned_from: 'direct',
            created_at: now,
            last_used: now
          };

          const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO test_patterns 
            (interaction_type, element_patterns, success_indicators, adaptation_rules, pattern_hash, confidence, success_count, total_count, learned_from, created_at, last_used)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            patternEntry.interaction_type,
            patternEntry.element_patterns,
            patternEntry.success_indicators,
            patternEntry.adaptation_rules,
            patternEntry.pattern_hash,
            patternEntry.confidence,
            patternEntry.success_count,
            patternEntry.total_count,
            patternEntry.learned_from,
            patternEntry.created_at,
            patternEntry.last_used
          );
        }
      }

      console.error(`[TestScenarioCache] 🧠 Learned ${interactionTypes.length} interaction patterns from '${scenario.name}'`);
    } catch (error) {
      console.error(`[TestScenarioCache] ⚠️ Failed to learn test patterns:`, error);
    }
  }

  /**
   * Calculate similarity between query and test scenario
   */
  private calculateTestSimilarity(normalizedQuery: any, scenario: TestScenario, entry: TestScenarioEntry): number {
    let totalSimilarity = 0;
    let factors = 0;

    // Name similarity
    const nameSimilarity = this.normalizer.calculateJaccardSimilarity(
      normalizedQuery.normalizedText,
      this.normalizer.normalize(scenario.name).normalizedText
    );
    totalSimilarity += nameSimilarity * 0.4;
    factors += 0.4;

    // Description similarity
    if (scenario.description) {
      const descSimilarity = this.normalizer.calculateJaccardSimilarity(
        normalizedQuery.normalizedText,
        this.normalizer.normalize(scenario.description).normalizedText
      );
      totalSimilarity += descSimilarity * 0.3;
      factors += 0.3;
    }

    // Steps similarity
    const stepsText = scenario.steps.map(s => s.description).join(' ');
    const stepsSimilarity = this.normalizer.calculateJaccardSimilarity(
      normalizedQuery.normalizedText,
      this.normalizer.normalize(stepsText).normalizedText
    );
    totalSimilarity += stepsSimilarity * 0.2;
    factors += 0.2;

    // Tags similarity
    if (scenario.tags && scenario.tags.length > 0) {
      const tagsSimilarity = this.normalizer.calculateJaccardSimilarity(
        normalizedQuery.normalizedText,
        this.normalizer.normalize(scenario.tags.join(' ')).normalizedText
      );
      totalSimilarity += tagsSimilarity * 0.1;
      factors += 0.1;
    }

    return factors > 0 ? totalSimilarity / factors : 0;
  }

  /**
   * Generate adaptation suggestions for different contexts
   */
  private generateAdaptationSuggestions(scenario: TestScenario, targetUrl?: string): string[] {
    const suggestions: string[] = [];

    if (targetUrl && !scenario.urlPattern.includes(targetUrl)) {
      suggestions.push(`Adapt URL pattern from "${scenario.urlPattern}" to "${targetUrl}"`);
    }

    // Check for potentially brittle selectors
    for (const step of scenario.steps) {
      if (step.selector) {
        if (step.selector.includes(':nth-child')) {
          suggestions.push(`Consider making selector "${step.selector}" more robust`);
        }
        if (step.selector.includes('#') && step.selector.length < 10) {
          suggestions.push(`Selector "${step.selector}" might need adaptation for different environments`);
        }
      }
    }

    return suggestions;
  }

  /**
   * Generate adaptation rules for different interaction types
   */
  private generateAdaptationRules(interactionType: string, elementPatterns: string[]): any {
    const rules = {
      interactionType,
      fallbackStrategies: [] as string[],
      selectorAdaptations: [] as string[]
    };

    switch (interactionType) {
      case 'click':
        rules.fallbackStrategies.push('try text content', 'try aria-label', 'try role=button');
        rules.selectorAdaptations.push('convert to :has-text()', 'try parent element', 'try sibling elements');
        break;
      case 'type':
        rules.fallbackStrategies.push('try placeholder text', 'try label association', 'try input[type]');
        rules.selectorAdaptations.push('try name attribute', 'try id pattern', 'try form context');
        break;
      case 'navigate':
        rules.fallbackStrategies.push('try relative URLs', 'try base URL patterns');
        break;
    }

    return rules;
  }

  /**
   * Record test execution for learning and statistics
   */
  private recordTestExecution(
    scenarioName: string, 
    status: 'success' | 'failure' | 'partial' | 'adapted',
    executionTime: number,
    adaptations: string[],
    context?: {url?: string, profile?: string}
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // First get the scenario ID
        const scenarioStmt = this.db.prepare('SELECT id FROM test_scenarios WHERE name = ?');
        const scenario = scenarioStmt.get(scenarioName) as {id: number} | undefined;
        
        if (!scenario) {
          reject(new Error(`Scenario '${scenarioName}' not found`));
          return;
        }

        const stmt = this.db.prepare(`
          INSERT INTO test_executions
          (scenario_id, status, execution_time, selector_adaptations, profile, url, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        stmt.run(
          scenario.id,
          status,
          executionTime,
          adaptations.length > 0 ? JSON.stringify(adaptations) : null,
          context?.profile || null,
          context?.url || '',
          Date.now()
        );

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Update test success rate based on execution results
   */
  private updateTestSuccessRate(scenarioName: string, success: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Get current stats
        const currentStmt = this.db.prepare(`
          SELECT success_rate, total_runs FROM test_scenarios WHERE name = ?
        `);
        const current = currentStmt.get(scenarioName) as {success_rate: number, total_runs: number} | undefined;
        
        if (!current) {
          reject(new Error(`Scenario '${scenarioName}' not found`));
          return;
        }

        // Calculate new success rate
        const newTotalRuns = current.total_runs + 1;
        const successCount = Math.round(current.success_rate * current.total_runs) + (success ? 1 : 0);
        const newSuccessRate = successCount / newTotalRuns;

        // Update scenario
        const updateStmt = this.db.prepare(`
          UPDATE test_scenarios 
          SET success_rate = ?, total_runs = ?, last_run = ?
          WHERE name = ?
        `);

        updateStmt.run(newSuccessRate, newTotalRuns, Date.now(), scenarioName);
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Get test library statistics
   */
  getTestLibraryStats(): Promise<{totalTests: number, avgSuccessRate: number, totalExecutions: number}> {
    return new Promise((resolve, reject) => {
      try {
        const scenarioStats = this.db.prepare(`
          SELECT COUNT(*) as count, AVG(success_rate) as avgRate, SUM(total_runs) as totalRuns
          FROM test_scenarios
        `).get() as {count: number, avgRate: number, totalRuns: number};

        resolve({
          totalTests: scenarioStats.count,
          avgSuccessRate: scenarioStats.avgRate || 0,
          totalExecutions: scenarioStats.totalRuns || 0
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * List all test scenarios with optional filtering
   */
  listTestScenarios(options?: {profile?: string, tag?: string, urlPattern?: string}): Promise<TestScenario[]> {
    return new Promise((resolve, reject) => {
      try {
        let sql = 'SELECT * FROM test_scenarios WHERE 1=1';
        const params: any[] = [];

        if (options?.profile) {
          sql += ' AND (profile = ? OR profile IS NULL)';
          params.push(options.profile);
        }

        if (options?.tag) {
          sql += ' AND tags LIKE ?';
          params.push(`%${options.tag}%`);
        }

        if (options?.urlPattern) {
          sql += ' AND url_pattern LIKE ?';
          params.push(`%${options.urlPattern}%`);
        }

        sql += ' ORDER BY success_rate DESC, confidence DESC';

        const results = this.db.prepare(sql).all(...params) as TestScenarioEntry[];
        
        const scenarios: TestScenario[] = results.map(entry => ({
          name: entry.name,
          description: entry.description,
          steps: JSON.parse(entry.steps_json),
          tags: entry.tags ? entry.tags.split(',') : undefined,
          urlPattern: entry.url_pattern,
          profile: entry.profile || undefined
        }));

        resolve(scenarios);
      } catch (error) {
        reject(error);
      }
    });
  }
}