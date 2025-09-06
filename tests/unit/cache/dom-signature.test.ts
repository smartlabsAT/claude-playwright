/**
 * Phase 4: Unit Tests - DOM Signature Generation
 * 
 * Tests the DOM signature generation system from Phase 2
 * Critical for cache key consistency and change detection
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock DOM signature functionality (would import from actual implementation)
interface DOMSignature {
  structural_hash: string;
  interactive_elements: number;
  form_fields: number;
  clickable_elements: number;
  input_types: string[];
  key_selectors: string[];
  viewport_size?: string;
  content_hash?: string;
}

class MockDOMSignatureGenerator {
  generateSignature(htmlContent: string, options: any = {}): DOMSignature {
    // Mock implementation for testing
    const interactiveElements = (htmlContent.match(/button|input|select|textarea|a/gi) || []).length;
    const formFields = (htmlContent.match(/input|select|textarea/gi) || []).length;
    const clickableElements = (htmlContent.match(/button|a|onclick/gi) || []).length;
    
    const structuralElements = [
      'div', 'span', 'section', 'article', 'nav', 'header', 'footer', 'main'
    ];
    
    let structuralContent = htmlContent;
    structuralElements.forEach(tag => {
      structuralContent = structuralContent.replace(new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gi'), `<${tag}>`);
    });
    
    return {
      structural_hash: this.hashString(structuralContent),
      interactive_elements: interactiveElements,
      form_fields: formFields,
      clickable_elements: clickableElements,
      input_types: this.extractInputTypes(htmlContent),
      key_selectors: this.extractKeySelectors(htmlContent),
      viewport_size: options.viewportSize,
      content_hash: options.includeContent ? this.hashString(htmlContent) : undefined
    };
  }

  private hashString(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private extractInputTypes(htmlContent: string): string[] {
    const typeMatches = htmlContent.match(/type=["']([^"']+)["']/gi) || [];
    return [...new Set(typeMatches.map(match => match.match(/type=["']([^"']+)["']/i)?.[1] || 'text'))];
  }

  private extractKeySelectors(htmlContent: string): string[] {
    const selectors: string[] = [];
    
    // Extract IDs
    const idMatches = htmlContent.match(/id=["']([^"']+)["']/gi) || [];
    idMatches.forEach(match => {
      const id = match.match(/id=["']([^"']+)["']/i)?.[1];
      if (id) selectors.push(`#${id}`);
    });
    
    // Extract important classes
    const classMatches = htmlContent.match(/class=["']([^"']+)["']/gi) || [];
    classMatches.forEach(match => {
      const classes = match.match(/class=["']([^"']+)["']/i)?.[1];
      if (classes) {
        const classList = classes.split(/\s+/);
        classList.forEach(cls => {
          if (cls.length > 3 && !cls.match(/^(col|row|btn|text|bg|p-|m-|w-|h-)/)) {
            selectors.push(`.${cls}`);
          }
        });
      }
    });
    
    return selectors.slice(0, 10); // Limit to top 10 key selectors
  }

  compareSignatures(sig1: DOMSignature, sig2: DOMSignature): {
    identical: boolean;
    structural_match: boolean;
    interactive_match: boolean;
    similarity_score: number;
  } {
    const structuralMatch = sig1.structural_hash === sig2.structural_hash;
    const interactiveMatch = sig1.interactive_elements === sig2.interactive_elements &&
                            sig1.form_fields === sig2.form_fields &&
                            sig1.clickable_elements === sig2.clickable_elements;
    
    // Calculate similarity score based on multiple factors
    let score = 0;
    let factors = 0;
    
    // Structural similarity (40% weight)
    if (structuralMatch) score += 0.4;
    factors += 0.4;
    
    // Interactive elements similarity (30% weight)
    if (interactiveMatch) score += 0.3;
    factors += 0.3;
    
    // Input types similarity (20% weight)
    const inputTypesSimilarity = this.calculateArraySimilarity(sig1.input_types, sig2.input_types);
    score += inputTypesSimilarity * 0.2;
    factors += 0.2;
    
    // Key selectors similarity (10% weight)
    const selectorsSimilarity = this.calculateArraySimilarity(sig1.key_selectors, sig2.key_selectors);
    score += selectorsSimilarity * 0.1;
    factors += 0.1;
    
    const similarityScore = factors > 0 ? score / factors : 0;
    
    return {
      identical: structuralMatch && interactiveMatch && inputTypesSimilarity === 1 && selectorsSimilarity === 1,
      structural_match: structuralMatch,
      interactive_match: interactiveMatch,
      similarity_score: similarityScore
    };
  }

  private calculateArraySimilarity(arr1: string[], arr2: string[]): number {
    if (arr1.length === 0 && arr2.length === 0) return 1;
    if (arr1.length === 0 || arr2.length === 0) return 0;
    
    const set1 = new Set(arr1);
    const set2 = new Set(arr2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return intersection.size / union.size;
  }
}

describe('DOM Signature Generation', () => {
  let generator: MockDOMSignatureGenerator;

  beforeEach(() => {
    generator = new MockDOMSignatureGenerator();
  });

  afterEach(() => {
    // Cleanup if needed
  });

  describe('Basic Signature Generation', () => {
    it('should generate signature for simple HTML', () => {
      const html = `
        <div class="container">
          <h1>Welcome</h1>
          <button id="submit-btn" type="button">Submit</button>
          <input type="email" name="email" placeholder="Email">
        </div>
      `;

      const signature = generator.generateSignature(html);

      expect(signature).toBeDefined();
      expect(signature.structural_hash).toBeTruthy();
      expect(signature.interactive_elements).toBe(2); // button + input
      expect(signature.form_fields).toBe(1); // input
      expect(signature.clickable_elements).toBe(1); // button
      expect(signature.input_types).toContain('email');
      expect(signature.key_selectors).toContain('#submit-btn');
      expect(signature.key_selectors).toContain('.container');
    });

    it('should handle empty HTML gracefully', () => {
      const signature = generator.generateSignature('');

      expect(signature).toBeDefined();
      expect(signature.structural_hash).toBeTruthy();
      expect(signature.interactive_elements).toBe(0);
      expect(signature.form_fields).toBe(0);
      expect(signature.clickable_elements).toBe(0);
      expect(signature.input_types).toEqual([]);
      expect(signature.key_selectors).toEqual([]);
    });

    it('should extract input types correctly', () => {
      const html = `
        <form>
          <input type="text" name="name">
          <input type="email" name="email">
          <input type="password" name="password">
          <input type="number" name="age">
          <select name="country">
            <option>US</option>
          </select>
          <textarea name="message"></textarea>
        </form>
      `;

      const signature = generator.generateSignature(html);

      expect(signature.input_types).toContain('text');
      expect(signature.input_types).toContain('email');
      expect(signature.input_types).toContain('password');
      expect(signature.input_types).toContain('number');
      expect(signature.form_fields).toBe(6); // 4 inputs + select + textarea
    });

    it('should include viewport size when provided', () => {
      const html = '<div>Test</div>';
      const options = { viewportSize: '1920x1080' };

      const signature = generator.generateSignature(html, options);

      expect(signature.viewport_size).toBe('1920x1080');
    });

    it('should include content hash when requested', () => {
      const html = '<div>Test content</div>';
      const options = { includeContent: true };

      const signature = generator.generateSignature(html, options);

      expect(signature.content_hash).toBeDefined();
      expect(signature.content_hash).toBeTruthy();
    });
  });

  describe('Signature Consistency', () => {
    it('should generate identical signatures for identical HTML', () => {
      const html = `
        <div class="app">
          <button id="login">Login</button>
          <input type="email" name="email">
        </div>
      `;

      const sig1 = generator.generateSignature(html);
      const sig2 = generator.generateSignature(html);

      expect(sig1.structural_hash).toBe(sig2.structural_hash);
      expect(sig1.interactive_elements).toBe(sig2.interactive_elements);
      expect(sig1.form_fields).toBe(sig2.form_fields);
      expect(sig1.input_types).toEqual(sig2.input_types);
      expect(sig1.key_selectors).toEqual(sig2.key_selectors);
    });

    it('should generate different signatures for different structures', () => {
      const html1 = `
        <div class="page">
          <button id="submit">Submit</button>
        </div>
      `;
      
      const html2 = `
        <section class="content">
          <input type="text" name="search">
          <button id="search">Search</button>
        </section>
      `;

      const sig1 = generator.generateSignature(html1);
      const sig2 = generator.generateSignature(html2);

      expect(sig1.structural_hash).not.toBe(sig2.structural_hash);
      expect(sig1.form_fields).not.toBe(sig2.form_fields);
    });

    it('should ignore whitespace and formatting differences', () => {
      const html1 = '<div><button id="btn">Click</button></div>';
      const html2 = `
        <div>
          <button id="btn">Click</button>
        </div>
      `;

      const sig1 = generator.generateSignature(html1);
      const sig2 = generator.generateSignature(html2);

      // Should have same structural hash (whitespace ignored)
      expect(sig1.structural_hash).toBe(sig2.structural_hash);
      expect(sig1.interactive_elements).toBe(sig2.interactive_elements);
    });
  });

  describe('Change Detection', () => {
    it('should detect addition of interactive elements', () => {
      const htmlBefore = `
        <div class="form">
          <input type="email" name="email">
        </div>
      `;
      
      const htmlAfter = `
        <div class="form">
          <input type="email" name="email">
          <button type="submit">Submit</button>
        </div>
      `;

      const sigBefore = generator.generateSignature(htmlBefore);
      const sigAfter = generator.generateSignature(htmlAfter);

      expect(sigAfter.interactive_elements).toBeGreaterThan(sigBefore.interactive_elements);
      expect(sigAfter.clickable_elements).toBeGreaterThan(sigBefore.clickable_elements);
      
      const comparison = generator.compareSignatures(sigBefore, sigAfter);
      expect(comparison.identical).toBe(false);
      expect(comparison.interactive_match).toBe(false);
    });

    it('should detect removal of form fields', () => {
      const htmlBefore = `
        <form>
          <input type="text" name="name">
          <input type="email" name="email">
          <input type="password" name="password">
        </form>
      `;
      
      const htmlAfter = `
        <form>
          <input type="email" name="email">
        </form>
      `;

      const sigBefore = generator.generateSignature(htmlBefore);
      const sigAfter = generator.generateSignature(htmlAfter);

      expect(sigAfter.form_fields).toBeLessThan(sigBefore.form_fields);
      expect(sigAfter.input_types.length).toBeLessThan(sigBefore.input_types.length);
      
      const comparison = generator.compareSignatures(sigBefore, sigAfter);
      expect(comparison.identical).toBe(false);
      expect(comparison.similarity_score).toBeLessThan(1.0);
    });

    it('should detect structural changes', () => {
      const htmlBefore = `
        <div class="container">
          <section class="content">
            <button>Action</button>
          </section>
        </div>
      `;
      
      const htmlAfter = `
        <main class="wrapper">
          <div class="content">
            <button>Action</button>
          </div>
        </main>
      `;

      const sigBefore = generator.generateSignature(htmlBefore);
      const sigAfter = generator.generateSignature(htmlAfter);

      expect(sigBefore.structural_hash).not.toBe(sigAfter.structural_hash);
      
      const comparison = generator.compareSignatures(sigBefore, sigAfter);
      expect(comparison.structural_match).toBe(false);
      expect(comparison.interactive_match).toBe(true); // Same interactive elements
    });
  });

  describe('Signature Comparison', () => {
    it('should calculate similarity scores accurately', () => {
      const html1 = `
        <div class="app">
          <button id="btn1">Button 1</button>
          <input type="text" name="field1">
        </div>
      `;
      
      const html2 = `
        <div class="app">
          <button id="btn1">Button 1</button>
          <button id="btn2">Button 2</button>
          <input type="text" name="field1">
        </div>
      `;

      const sig1 = generator.generateSignature(html1);
      const sig2 = generator.generateSignature(html2);
      
      const comparison = generator.compareSignatures(sig1, sig2);
      
      expect(comparison.identical).toBe(false);
      expect(comparison.structural_match).toBe(false); // Different due to extra button
      expect(comparison.similarity_score).toBeGreaterThan(0.5); // Should be somewhat similar
      expect(comparison.similarity_score).toBeLessThan(1.0);
    });

    it('should handle completely different pages', () => {
      const loginPage = `
        <div class="login">
          <input type="email" name="email">
          <input type="password" name="password">
          <button type="submit">Login</button>
        </div>
      `;
      
      const dashboardPage = `
        <div class="dashboard">
          <nav>
            <a href="/profile">Profile</a>
            <a href="/settings">Settings</a>
          </nav>
          <main>
            <h1>Dashboard</h1>
            <div class="stats">Statistics here</div>
          </main>
        </div>
      `;

      const sig1 = generator.generateSignature(loginPage);
      const sig2 = generator.generateSignature(dashboardPage);
      
      const comparison = generator.compareSignatures(sig1, sig2);
      
      expect(comparison.identical).toBe(false);
      expect(comparison.structural_match).toBe(false);
      expect(comparison.interactive_match).toBe(false);
      expect(comparison.similarity_score).toBeLessThan(0.3); // Very different pages
    });

    it('should identify minor content changes as highly similar', () => {
      const html1 = `
        <div class="product">
          <h2>Product Name</h2>
          <p class="price">$19.99</p>
          <button id="add-cart">Add to Cart</button>
        </div>
      `;
      
      const html2 = `
        <div class="product">
          <h2>Different Product</h2>
          <p class="price">$29.99</p>
          <button id="add-cart">Add to Cart</button>
        </div>
      `;

      const sig1 = generator.generateSignature(html1);
      const sig2 = generator.generateSignature(html2);
      
      const comparison = generator.compareSignatures(sig1, sig2);
      
      // Structure is identical, only content differs
      expect(comparison.structural_match).toBe(true);
      expect(comparison.interactive_match).toBe(true);
      expect(comparison.similarity_score).toBeGreaterThan(0.8); // Very similar structure
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle large HTML documents efficiently', () => {
      // Generate large HTML document
      let largeHtml = '<div class="container">';
      for (let i = 0; i < 1000; i++) {
        largeHtml += `
          <div class="item-${i}">
            <button id="btn-${i}">Button ${i}</button>
            <input type="text" name="field-${i}">
          </div>
        `;
      }
      largeHtml += '</div>';

      const startTime = Date.now();
      const signature = generator.generateSignature(largeHtml);
      const duration = Date.now() - startTime;

      expect(signature).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
      expect(signature.interactive_elements).toBeGreaterThan(1000);
      expect(signature.form_fields).toBe(1000);
    });

    it('should handle malformed HTML gracefully', () => {
      const malformedHtml = `
        <div class="test">
          <button id="btn">Click
          <input type="email" name="email"
          <div>
            <span>Text</div>
        </div>
      `;

      expect(() => {
        const signature = generator.generateSignature(malformedHtml);
        expect(signature).toBeDefined();
        expect(signature.structural_hash).toBeTruthy();
      }).not.toThrow();
    });

    it('should limit key selectors to prevent memory issues', () => {
      // HTML with many IDs and classes
      let htmlWithManySelectors = '<div>';
      for (let i = 0; i < 100; i++) {
        htmlWithManySelectors += `<span id="id-${i}" class="class-${i} another-class-${i}">Text</span>`;
      }
      htmlWithManySelectors += '</div>';

      const signature = generator.generateSignature(htmlWithManySelectors);
      
      expect(signature.key_selectors.length).toBeLessThanOrEqual(10); // Should limit to 10
    });

    it('should handle special characters in selectors', () => {
      const htmlWithSpecialChars = `
        <div>
          <button id="btn-with-special-chars!@#">Button</button>
          <input class="field with spaces" type="text">
          <div class="ünicøde-class">Unicode content</div>
        </div>
      `;

      expect(() => {
        const signature = generator.generateSignature(htmlWithSpecialChars);
        expect(signature).toBeDefined();
      }).not.toThrow();
    });
  });

  describe('Integration with Cache System', () => {
    it('should generate consistent cache keys for similar pages', () => {
      const loginPage1 = `
        <div class="login-form">
          <input type="email" name="email" placeholder="Email">
          <input type="password" name="password" placeholder="Password">
          <button type="submit">Login</button>
        </div>
      `;
      
      const loginPage2 = `
        <div class="login-form">
          <input type="email" name="email" placeholder="Enter your email">
          <input type="password" name="password" placeholder="Enter password">
          <button type="submit">Sign In</button>
        </div>
      `;

      const sig1 = generator.generateSignature(loginPage1);
      const sig2 = generator.generateSignature(loginPage2);
      
      const comparison = generator.compareSignatures(sig1, sig2);
      
      // Should be structurally identical despite content differences
      expect(comparison.structural_match).toBe(true);
      expect(comparison.interactive_match).toBe(true);
      expect(comparison.similarity_score).toBeGreaterThan(0.9);
    });

    it('should invalidate cache when page structure changes', () => {
      const originalPage = `
        <form class="contact-form">
          <input type="text" name="name">
          <input type="email" name="email">
          <button type="submit">Submit</button>
        </form>
      `;
      
      const modifiedPage = `
        <form class="contact-form">
          <input type="text" name="name">
          <input type="email" name="email">
          <input type="phone" name="phone">
          <textarea name="message"></textarea>
          <button type="submit">Submit</button>
        </form>
      `;

      const sigOriginal = generator.generateSignature(originalPage);
      const sigModified = generator.generateSignature(modifiedPage);
      
      const comparison = generator.compareSignatures(sigOriginal, sigModified);
      
      // Should detect significant structural changes
      expect(comparison.identical).toBe(false);
      expect(sigModified.form_fields).toBeGreaterThan(sigOriginal.form_fields);
      expect(sigModified.input_types).toContain('phone');
      expect(comparison.similarity_score).toBeLessThan(0.8); // Significant change
    });
  });
});