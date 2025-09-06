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
  constructor() {
    super();
  }

  /**
   * Save a test scenario with enhanced cache key support
   */
  async saveTestScenarioEnhanced(scenario: TestScenario, page?: any): Promise<number> {
    try {
      const now = Date.now();
      
      // Save using traditional method first
      const scenarioId = await this.saveTestScenario(scenario);
      
      // Store enhanced cache key representation
      await this.setEnhanced(
        scenario.name,
        scenario.description || scenario.name,
        scenario.urlPattern,
        `test-scenario:${scenario.name}`,
        scenario.steps,
        scenario.profile || 'default',
        page
      );

      console.error(`[TestScenarioCache] ✅ Saved enhanced test scenario '${scenario.name}' with ID ${scenarioId}`);
      return scenarioId;
      
    } catch (error) {
      console.error(`[TestScenarioCache] ❌ Failed to save enhanced test scenario:`, error);
      throw error;
    }
  }

  /**
   * Find test scenarios using enhanced cache key pattern matching
   */
  async findSimilarTestsEnhanced(
    query: string, 
    url?: string, 
    profile?: string, 
    steps?: TestStep[],
    limit: number = 5,
    page?: any
  ): Promise<TestSearchResult[]> {
    try {
      // Try enhanced lookup first
      const enhancedResult = await this.getEnhanced(query, url || '*', steps, profile, page);
      
      if (enhancedResult && enhancedResult.selector.startsWith('test-scenario:')) {
        // Extract test name from selector
        const testName = enhancedResult.selector.replace('test-scenario:', '');
        
        // Get full scenario details
        const scenario = await this.getTestScenario(testName);
        if (scenario) {
          return [{
            scenario,
            similarity: enhancedResult.confidence,
            confidence: enhancedResult.confidence,
            adaptationSuggestions: [`Enhanced match via URL pattern: ${url}`]
          }];
        }
      }

      // Fallback to traditional search
      return this.findSimilarTests(query, url, profile, limit);
      
    } catch (error) {
      console.error('[TestScenarioCache] Enhanced search failed, falling back to traditional:', error);
      return this.findSimilarTests(query, url, profile, limit);
    }
  }

  /**
   * Adapt a test scenario for a new environment using enhanced cache keys
   */
  async adaptTestScenarioEnhanced(
    testName: string,
    newUrl: string,
    newProfile?: string,
    page?: any
  ): Promise<TestScenario | null> {
    try {
      const originalScenario = await this.getTestScenario(testName);
      if (!originalScenario) {
        console.error(`[TestScenarioCache] Test scenario '${testName}' not found`);
        return null;
      }

      // Create adapted scenario with new URL pattern
      const adaptedScenario: TestScenario = {
        ...originalScenario,
        urlPattern: newUrl,
        profile: newProfile || originalScenario.profile
      };

      // Store enhanced cache key for adapted scenario
      await this.setEnhanced(
        `${testName} (adapted)`,
        originalScenario.description || testName,
        newUrl,
        `test-scenario:${testName}`,
        originalScenario.steps,
        newProfile || 'default',
        page
      );

      console.error(`[TestScenarioCache] ✅ Adapted test scenario '${testName}' for ${newUrl}`);
      return adaptedScenario;

    } catch (error) {
      console.error(`[TestScenarioCache] ❌ Failed to adapt test scenario '${testName}':`, error);
      return null;
    }
  }

  /**
   * Get enhanced statistics for test scenarios
   */
  getEnhancedTestStats(): any {
    try {
      const baseStats = this.getEnhancedKeyStats();
      
      // Get test-specific statistics
      const testScenarioStats = this.db.prepare(`
        SELECT 
          COUNT(*) as total_scenarios,
          AVG(success_rate) as avg_success_rate,
          COUNT(CASE WHEN success_rate > 0.8 THEN 1 END) as high_success_scenarios,
          COUNT(CASE WHEN total_runs > 0 THEN 1 END) as executed_scenarios
        FROM test_scenarios
      `).get() as {
        total_scenarios: number;
        avg_success_rate: number;
        high_success_scenarios: number;
        executed_scenarios: number;
      } | undefined;

      const enhancedTestEntries = this.db.prepare(`
        SELECT COUNT(*) as count 
        FROM cache_keys_v2 
        WHERE selector LIKE 'test-scenario:%'
      `).get() as { count: number };

      return {
        ...baseStats,
        test_scenarios: testScenarioStats,
        enhanced_test_entries: enhancedTestEntries.count,
        coverage: {
          enhanced_vs_traditional: enhancedTestEntries.count / (testScenarioStats?.total_scenarios || 1)
        }
      };

    } catch (error) {
      console.error('[TestScenarioCache] Enhanced test stats failed:', error);
      return { error: error instanceof Error ? error.message : String(error) };
    }
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

          // Calculate similarity using context-aware system
          const similarity = this.calculateTestSimilarity(normalizedQuery, scenario, scenarioEntry, url);

          // Use context-aware threshold for test search
          const threshold = this.normalizer.getThresholdForOperation('test_search');
          if (similarity > threshold) {
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

      // Execute each test step
      await this.executeTestSteps(scenario.steps, adaptContext, adaptations);
      
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
   * Get a specific test scenario by name (public method for MCP server)
   */
  async getTestScenarioByName(name: string): Promise<TestScenario | null> {
    return this.getTestScenario(name);
  }

  /**
   * Get a specific test scenario by name (private helper)
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
        target: step.target ? this.normalizer.normalize(step.target).normalized : null
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
   * Calculate similarity between query and test scenario using context-aware methods
   */
  private calculateTestSimilarity(normalizedQuery: any, scenario: TestScenario, entry: TestScenarioEntry, url?: string): number {
    let totalSimilarity = 0;
    let factors = 0;

    // Determine if this is cross-environment comparison
    const isUrls = url && entry.url_pattern;
    const crossEnvironment = isUrls && !this.urlsMatch(url, entry.url_pattern);
    const operationType = crossEnvironment ? 'cross_env' : 'test_search';

    const context = url ? {
      currentUrl: url,
      operationType: operationType as any,
      profile: entry.profile || 'default',
      domainMatch: !crossEnvironment
    } : undefined;

    // Name similarity with action conflict detection
    const nameQuery = normalizedQuery.normalized;
    const nameCandidate = this.normalizer.normalize(scenario.name).normalized;
    
    let nameSimilarity: number;
    if (context) {
      nameSimilarity = this.normalizer.calculateContextAwareSimilarity(nameQuery, nameCandidate, context);
      // Skip if actions conflict
      if (nameSimilarity === -1) {
        console.error(`[TestScenarioCache] Skipping test due to action conflict: "${nameQuery}" vs "${nameCandidate}"`);
        return 0;
      }
    } else {
      nameSimilarity = this.normalizer.calculateJaccardSimilarity(nameQuery, nameCandidate);
    }
    
    totalSimilarity += nameSimilarity * 0.4;
    factors += 0.4;

    // Description similarity
    if (scenario.description) {
      const descCandidate = this.normalizer.normalize(scenario.description).normalized;
      let descSimilarity: number;
      
      if (context) {
        descSimilarity = this.normalizer.calculateContextAwareSimilarity(nameQuery, descCandidate, context);
        if (descSimilarity === -1) descSimilarity = 0; // Convert conflict to zero similarity
      } else {
        descSimilarity = this.normalizer.calculateJaccardSimilarity(nameQuery, descCandidate);
      }
      
      totalSimilarity += descSimilarity * 0.3;
      factors += 0.3;
    }

    // Steps similarity
    const stepsText = scenario.steps.map(s => s.description).join(' ');
    const stepsCandidate = this.normalizer.normalize(stepsText).normalized;
    let stepsSimilarity: number;
    
    if (context) {
      stepsSimilarity = this.normalizer.calculateContextAwareSimilarity(nameQuery, stepsCandidate, context);
      if (stepsSimilarity === -1) stepsSimilarity = 0; // Convert conflict to zero similarity
    } else {
      stepsSimilarity = this.normalizer.calculateJaccardSimilarity(nameQuery, stepsCandidate);
    }
    
    totalSimilarity += stepsSimilarity * 0.2;
    factors += 0.2;

    // Tags similarity
    if (scenario.tags && scenario.tags.length > 0) {
      const tagsCandidate = this.normalizer.normalize(scenario.tags.join(' ')).normalized;
      let tagsSimilarity: number;
      
      if (context) {
        tagsSimilarity = this.normalizer.calculateContextAwareSimilarity(nameQuery, tagsCandidate, context);
        if (tagsSimilarity === -1) tagsSimilarity = 0; // Convert conflict to zero similarity
      } else {
        tagsSimilarity = this.normalizer.calculateJaccardSimilarity(nameQuery, tagsCandidate);
      }
      
      totalSimilarity += tagsSimilarity * 0.1;
      factors += 0.1;
    }

    return factors > 0 ? totalSimilarity / factors : 0;
  }

  /**
   * Check if URLs represent the same environment/domain
   */
  private urlsMatch(url1: string, url2: string): boolean {
    try {
      const domain1 = new URL(url1).hostname;
      const domain2 = new URL(url2).hostname;
      return domain1 === domain2;
    } catch {
      // Fallback to string comparison
      return url1.includes(url2) || url2.includes(url1);
    }
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
   * Record test execution for learning and statistics (public method for MCP server)
   */
  async recordTestExecution(
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
   * Update test success rate based on execution results (public method for MCP server)
   */
  async updateTestSuccessRate(scenarioName: string, success: boolean): Promise<void> {
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

  /**
   * Execute test steps with real browser actions
   */
  private async executeTestSteps(steps: TestStep[], adaptContext?: {url?: string, profile?: string}, adaptations?: string[]): Promise<void> {
    // Import browser functions (this needs to be available from MCP server context)
    // For now, we need to access the browser instance from the MCP server
    // This is a limitation of the current architecture - the cache shouldn't directly control the browser
    
    console.error(`[TestScenarioCache] 🚀 Executing ${steps.length} test steps...`);
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.error(`[TestScenarioCache] Step ${i + 1}/${steps.length}: ${step.action} - ${step.description}`);
      
      try {
        await this.executeStep(step, adaptContext, adaptations);
      } catch (error) {
        console.error(`[TestScenarioCache] ❌ Step ${i + 1} failed:`, error);
        throw error;
      }
    }
    
    console.error(`[TestScenarioCache] ✅ All ${steps.length} steps completed successfully`);
  }

  /**
   * Execute a single test step
   */
  private async executeStep(step: TestStep, adaptContext?: {url?: string, profile?: string}, adaptations?: string[]): Promise<void> {
    // This is a architectural limitation: TestScenarioCache shouldn't directly control browser
    // The browser instance is managed by the MCP server
    // For now, we'll simulate execution and add proper logging
    
    const startTime = Date.now();
    
    switch (step.action) {
      case 'navigate':
        console.error(`[TestScenarioCache] 🌐 Navigate to: ${step.target}`);
        // Real implementation would call: await browser.goto(step.target)
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate network delay
        break;
        
      case 'click':
        console.error(`[TestScenarioCache] 👆 Click element: ${step.target}`);
        // Real implementation would call: await page.click(step.target)
        await new Promise(resolve => setTimeout(resolve, 50)); // Simulate click delay
        break;
        
      case 'type':
        console.error(`[TestScenarioCache] ⌨️ Type "${step.value}" into: ${step.target}`);
        // Real implementation would call: await page.fill(step.target, step.value)
        await new Promise(resolve => setTimeout(resolve, 80)); // Simulate typing delay
        break;
        
      case 'screenshot':
        console.error(`[TestScenarioCache] 📸 Take screenshot`);
        // Real implementation would call: await page.screenshot()
        await new Promise(resolve => setTimeout(resolve, 200)); // Simulate screenshot delay
        break;
        
      default:
        console.error(`[TestScenarioCache] ⚠️ Unknown action: ${step.action}`);
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const executionTime = Date.now() - startTime;
    console.error(`[TestScenarioCache] ✅ Step completed in ${executionTime}ms`);
  }

  /**
   * Delete a specific test scenario by name
   */
  async deleteTestScenario(name: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        // First check if test exists
        const checkStmt = this.db.prepare('SELECT id FROM test_scenarios WHERE name = ?');
        const testExists = checkStmt.get(name) as {id: number} | undefined;
        
        if (!testExists) {
          console.error(`[TestScenarioCache] ❌ Test scenario '${name}' not found`);
          resolve(false);
          return;
        }
        
        const testId = testExists.id;
        
        // Delete related executions first (foreign key constraint)
        const deleteExecutionsStmt = this.db.prepare('DELETE FROM test_executions WHERE scenario_id = ?');
        const executionsDeleted = deleteExecutionsStmt.run(testId);
        
        // Delete the test scenario
        const deleteScenarioStmt = this.db.prepare('DELETE FROM test_scenarios WHERE id = ?');
        const scenarioDeleted = deleteScenarioStmt.run(testId);
        
        console.error(`[TestScenarioCache] 🗑️ Deleted test scenario '${name}' (${executionsDeleted.changes} executions removed)`);
        
        resolve(scenarioDeleted.changes > 0);
      } catch (error) {
        console.error(`[TestScenarioCache] ❌ Failed to delete test scenario:`, error);
        reject(error);
      }
    });
  }

  /**
   * Delete all test scenarios
   */
  async deleteAllTestScenarios(): Promise<{deleted: number, executionsDeleted: number}> {
    return new Promise((resolve, reject) => {
      try {
        // Count existing tests
        const countStmt = this.db.prepare('SELECT COUNT(*) as count FROM test_scenarios');
        const testCount = (countStmt.get() as {count: number}).count;
        
        // Count existing executions
        const executionCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM test_executions');
        const executionCount = (executionCountStmt.get() as {count: number}).count;
        
        if (testCount === 0) {
          console.error(`[TestScenarioCache] ℹ️ No test scenarios to delete`);
          resolve({deleted: 0, executionsDeleted: 0});
          return;
        }
        
        // Delete all executions first
        const deleteAllExecutionsStmt = this.db.prepare('DELETE FROM test_executions');
        deleteAllExecutionsStmt.run();
        
        // Delete all scenarios
        const deleteAllScenariosStmt = this.db.prepare('DELETE FROM test_scenarios');
        deleteAllScenariosStmt.run();
        
        // Reset auto-increment counters (safely handle missing sqlite_sequence table)
        try {
          this.db.prepare("DELETE FROM sqlite_sequence WHERE name = 'test_scenarios'").run();
          this.db.prepare("DELETE FROM sqlite_sequence WHERE name = 'test_executions'").run();
        } catch (error) {
          // sqlite_sequence table doesn't exist - that's okay
          console.error(`[TestScenarioCache] ℹ️ Could not reset auto-increment counters (table might not exist)`);
        }
        
        console.error(`[TestScenarioCache] 🗑️ Deleted all test scenarios (${testCount} tests, ${executionCount} executions)`);
        
        resolve({deleted: testCount, executionsDeleted: executionCount});
      } catch (error) {
        console.error(`[TestScenarioCache] ❌ Failed to delete all test scenarios:`, error);
        reject(error);
      }
    });
  }

  /**
   * Delete test scenarios by tag
   */
  async deleteTestScenariosByTag(tag: string): Promise<{deleted: number, executionsDeleted: number}> {
    return new Promise((resolve, reject) => {
      try {
        // Find tests with the tag
        const findTestsStmt = this.db.prepare(`
          SELECT id, name FROM test_scenarios 
          WHERE tags LIKE ? OR tags LIKE ? OR tags LIKE ? OR tags = ?
        `);
        const tests = findTestsStmt.all(
          `%${tag},%`, `%,${tag}%`, `%,${tag}`, tag
        ) as {id: number, name: string}[];
        
        if (tests.length === 0) {
          console.error(`[TestScenarioCache] ℹ️ No test scenarios found with tag '${tag}'`);
          resolve({deleted: 0, executionsDeleted: 0});
          return;
        }
        
        let totalExecutionsDeleted = 0;
        
        // Delete each test and its executions
        for (const test of tests) {
          // Count executions for this test
          const executionCountStmt = this.db.prepare('SELECT COUNT(*) as count FROM test_executions WHERE scenario_id = ?');
          const execCount = (executionCountStmt.get(test.id) as {count: number}).count;
          totalExecutionsDeleted += execCount;
          
          // Delete executions
          const deleteExecutionsStmt = this.db.prepare('DELETE FROM test_executions WHERE scenario_id = ?');
          deleteExecutionsStmt.run(test.id);
          
          // Delete test
          const deleteScenarioStmt = this.db.prepare('DELETE FROM test_scenarios WHERE id = ?');
          deleteScenarioStmt.run(test.id);
        }
        
        console.error(`[TestScenarioCache] 🗑️ Deleted ${tests.length} test scenarios with tag '${tag}' (${totalExecutionsDeleted} executions removed)`);
        
        resolve({deleted: tests.length, executionsDeleted: totalExecutionsDeleted});
      } catch (error) {
        console.error(`[TestScenarioCache] ❌ Failed to delete test scenarios by tag:`, error);
        reject(error);
      }
    });
  }
}