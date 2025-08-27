/**
 * Complete Code Generation Workflow Example
 * 
 * This example demonstrates the full scaffold system capabilities
 * including page objects, tests, fixtures, and components.
 * 
 * Features Demonstrated:
 * - Page Object Model generation
 * - Test file scaffolding
 * - Fixture creation with session integration
 * - Complete workflow automation
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

// Test directory for generated files
const GENERATED_DIR = path.join(__dirname, 'generated');

test.describe('Complete Code Generation Workflow', () => {
  
  test.beforeAll(async () => {
    // Clean up any existing generated files
    await fs.remove(GENERATED_DIR);
    await fs.ensureDir(GENERATED_DIR);
    console.log('🧹 Cleaned up generated files directory');
  });
  
  test('generate login page object', async () => {
    console.log('🏗️  Generating LoginPage object...');
    
    try {
      // Generate login page using CLI
      execSync(`claude-playwright scaffold page LoginPage --path ${GENERATED_DIR}`, {
        stdio: 'inherit'
      });
      
      // Verify file was created
      const pageFilePath = path.join(GENERATED_DIR, 'loginpage.ts');
      const exists = await fs.pathExists(pageFilePath);
      expect(exists).toBe(true);
      
      // Read and validate generated content
      const content = await fs.readFile(pageFilePath, 'utf8');
      
      // Check for essential Page Object Model patterns
      expect(content).toContain('export class LoginPage');
      expect(content).toContain('extends BasePage');
      expect(content).toContain('constructor(page: Page)');
      expect(content).toContain('private readonly');
      expect(content).toContain('async goto()');
      expect(content).toContain('async clickSubmit()');
      expect(content).toContain('async expectHeading');
      
      console.log('✅ LoginPage generated successfully');
      console.log(`📁 File: ${pageFilePath}`);
      
      // Display generated code snippet
      const lines = content.split('\n');
      console.log('📄 Generated code preview:');
      lines.slice(0, 15).forEach((line, i) => {
        console.log(`   ${(i + 1).toString().padStart(2)}: ${line}`);
      });
      
    } catch (error) {
      console.error('❌ Page generation failed:', error.message);
      throw error;
    }
  });
  
  test('generate authentication test file', async () => {
    console.log('🧪 Generating authentication test...');
    
    try {
      // Generate test file using CLI
      execSync(`claude-playwright scaffold test auth-flow --path ${GENERATED_DIR}`, {
        stdio: 'inherit'
      });
      
      // Verify file was created
      const testFilePath = path.join(GENERATED_DIR, 'auth-flow.spec.ts');
      const exists = await fs.pathExists(testFilePath);
      expect(exists).toBe(true);
      
      // Read and validate generated content
      const content = await fs.readFile(testFilePath, 'utf8');
      
      // Check for essential test patterns
      expect(content).toContain('test.describe');
      expect(content).toContain('auth-flow Tests');
      expect(content).toContain('test.beforeEach');
      expect(content).toContain('BasePage');
      expect(content).toContain('should load successfully');
      expect(content).toContain('should display content');
      expect(content).toContain('await expect');
      
      console.log('✅ Auth test generated successfully');
      console.log(`📁 File: ${testFilePath}`);
      
      // Show test structure
      const lines = content.split('\n');
      const testLines = lines.filter(line => 
        line.includes('test(') || line.includes('test.describe') || line.includes('test.beforeEach')
      );
      console.log('🧪 Generated test structure:');
      testLines.forEach(line => {
        console.log(`   ${line.trim()}`);
      });
      
    } catch (error) {
      console.error('❌ Test generation failed:', error.message);
      throw error;
    }
  });
  
  test('generate authentication fixture', async () => {
    console.log('🔧 Generating authentication fixture...');
    
    try {
      // Generate fixture using CLI
      execSync(`claude-playwright scaffold fixture AuthFixture --path ${GENERATED_DIR}`, {
        stdio: 'inherit'
      });
      
      // Verify file was created
      const fixtureFilePath = path.join(GENERATED_DIR, 'authfixture.ts');
      const exists = await fs.pathExists(fixtureFilePath);
      expect(exists).toBe(true);
      
      // Read and validate generated content
      const content = await fs.readFile(fixtureFilePath, 'utf8');
      
      // Check for essential fixture patterns
      expect(content).toContain('interface AuthffixtureFixtures');
      expect(content).toContain('export const test = base.extend');
      expect(content).toContain('authenticatedPage');
      expect(content).toContain('authData');
      expect(content).toContain('storageState');
      expect(content).toContain('saveAuthState');
      
      console.log('✅ Auth fixture generated successfully');
      console.log(`📁 File: ${fixtureFilePath}`);
      
      // Show fixture structure
      const lines = content.split('\n');
      const fixtureLines = lines.filter(line => 
        line.includes('interface') || 
        line.includes('extend<') ||
        line.includes('async ({ page }, use) =>')
      );
      console.log('🔧 Generated fixture structure:');
      fixtureLines.forEach(line => {
        console.log(`   ${line.trim()}`);
      });
      
    } catch (error) {
      console.error('❌ Fixture generation failed:', error.message);
      throw error;
    }
  });
  
  test('validate generated code integration', async () => {
    console.log('🔗 Validating code integration...');
    
    // Check if all expected files exist
    const expectedFiles = [
      'loginpage.ts',
      'auth-flow.spec.ts', 
      'authfixture.ts'
    ];
    
    for (const fileName of expectedFiles) {
      const filePath = path.join(GENERATED_DIR, fileName);
      const exists = await fs.pathExists(filePath);
      expect(exists).toBe(true);
      console.log(`✅ Found: ${fileName}`);
    }
    
    // Read all generated files
    const pageContent = await fs.readFile(path.join(GENERATED_DIR, 'loginpage.ts'), 'utf8');
    const testContent = await fs.readFile(path.join(GENERATED_DIR, 'auth-flow.spec.ts'), 'utf8');
    const fixtureContent = await fs.readFile(path.join(GENERATED_DIR, 'authfixture.ts'), 'utf8');
    
    // Check integration patterns
    
    // 1. Page Object should extend BasePage
    expect(pageContent).toContain('extends BasePage');
    console.log('✅ Page Object extends BasePage correctly');
    
    // 2. Test should import and use BasePage
    expect(testContent).toContain("import { BasePage } from './pages/base-page'");
    expect(testContent).toContain('basePage = new BasePage(page)');
    console.log('✅ Test imports and uses BasePage correctly');
    
    // 3. Fixture should provide authentication capabilities
    expect(fixtureContent).toContain('authenticatedPage');
    expect(fixtureContent).toContain('storageState');
    console.log('✅ Fixture provides authentication capabilities');
    
    // 4. Check for TypeScript compliance
    const hasTypeAnnotations = [pageContent, testContent, fixtureContent].every(content =>
      content.includes(': Promise<') || content.includes(': void') || content.includes(': string')
    );
    expect(hasTypeAnnotations).toBe(true);
    console.log('✅ Generated code includes proper TypeScript annotations');
  });
  
  test('create integrated test workflow', async () => {
    console.log('🎯 Creating integrated test workflow...');
    
    // Create a combined test file that uses all generated components
    const integratedTestContent = `
// Integrated Test Example - Uses all generated components
import { test, expect } from '@playwright/test';
import { LoginPage } from './loginpage';
import { test as authTest } from './authfixture';

// Use the generated auth fixture
authTest.describe('Complete Login Workflow', () => {
  
  authTest('should login using generated page object and fixture', async ({ 
    page, 
    authenticatedPage, 
    authData 
  }) => {
    // Use generated LoginPage
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    // Verify form is visible
    await loginPage.expectHeading('Login');
    
    // Perform login using fixture data
    await loginPage.login(authData.username, authData.password);
    
    // Use authenticated page from fixture
    await authenticatedPage.expectVisible('[data-testid="dashboard"]');
    
    console.log('✅ Integrated workflow completed successfully');
  });
  
  authTest('should handle login errors', async ({ page }) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    
    // Test invalid credentials
    await loginPage.login('invalid@example.com', 'wrongpassword');
    await loginPage.expectHeading('Login Error');
    
    console.log('✅ Error handling works correctly');
  });
});
`;
    
    // Save integrated test
    const integratedTestPath = path.join(GENERATED_DIR, 'integrated-workflow.spec.ts');
    await fs.writeFile(integratedTestPath, integratedTestContent);
    
    console.log('✅ Integrated test workflow created');
    console.log(`📁 File: ${integratedTestPath}`);
    
    // Verify integrated test file
    const exists = await fs.pathExists(integratedTestPath);
    expect(exists).toBe(true);
    
    // Show the integration pattern
    console.log('🔗 Integration pattern:');
    console.log('   1. LoginPage (Generated Page Object)');
    console.log('   2. AuthFixture (Generated Fixture)');
    console.log('   3. Integrated Test (Combines both)');
    console.log('   4. Session Management (From toolkit)');
  });
  
  test('generate project structure documentation', async () => {
    console.log('📚 Generating project structure documentation...');
    
    // Create README for generated code
    const readmeContent = `
# Generated Code Example

This directory contains code generated by the Claude-Playwright Toolkit scaffold system.

## Generated Files

### Page Objects
- \`loginpage.ts\` - LoginPage class extending BasePage
  - Contains locators, actions, and assertions
  - Follows Page Object Model pattern
  - Includes proper TypeScript typing

### Test Files  
- \`auth-flow.spec.ts\` - Authentication flow tests
  - Uses generated Page Objects
  - Includes setup and teardown
  - Follows Playwright best practices

### Fixtures
- \`authfixture.ts\` - Authentication test fixtures
  - Provides authenticated browser contexts
  - Manages session state
  - Includes helper functions

### Integration Examples
- \`integrated-workflow.spec.ts\` - Complete workflow example
  - Combines all generated components
  - Shows real-world usage patterns
  - Demonstrates toolkit integration

## Usage

1. Copy generated files to your project's appropriate directories
2. Update import paths to match your project structure
3. Customize selectors and actions for your application
4. Run tests to verify functionality

## Customization Tips

- Update selectors in Page Objects to match your application
- Modify fixture data to match your authentication system
- Add more test scenarios as needed
- Integrate with your existing test suite

Generated by Claude-Playwright Toolkit v0.1.0
`;
    
    const readmePath = path.join(GENERATED_DIR, 'README.md');
    await fs.writeFile(readmePath, readmeContent.trim());
    
    console.log('✅ Documentation generated');
    console.log(`📁 File: ${readmePath}`);
    
    // List all generated files with descriptions
    const files = await fs.readdir(GENERATED_DIR);
    console.log('📋 Complete generated file list:');
    files.forEach(file => {
      const description = getFileDescription(file);
      console.log(`   📄 ${file} - ${description}`);
    });
    
    function getFileDescription(filename) {
      const descriptions = {
        'loginpage.ts': 'Page Object Model class',
        'auth-flow.spec.ts': 'Authentication test suite',
        'authfixture.ts': 'Authentication test fixture',
        'integrated-workflow.spec.ts': 'Complete integration example',
        'README.md': 'Documentation and usage guide'
      };
      return descriptions[filename] || 'Generated file';
    }
  });
  
  test.afterAll(async () => {
    console.log('🏁 Code generation workflow completed successfully!');
    console.log('');
    console.log('📁 Generated files are available in:', GENERATED_DIR);
    console.log('');
    console.log('🎯 Next steps:');
    console.log('   1. Review generated code');
    console.log('   2. Copy to your project directories');
    console.log('   3. Customize for your application');
    console.log('   4. Run tests to verify functionality');
    console.log('');
    console.log('💡 Tip: Use the integrated-workflow.spec.ts as a starting point');
    console.log('   for combining Page Objects, Fixtures, and Session Management');
  });
});

/**
 * USAGE INSTRUCTIONS:
 * 
 * 1. Run this complete workflow example:
 *    npx playwright test examples/scaffold-examples/complete-generation-workflow.js
 * 
 * 2. Check the generated files in:
 *    examples/scaffold-examples/generated/
 * 
 * 3. Copy and customize the generated code for your project
 * 
 * EXPECTED RESULTS:
 * - LoginPage Page Object Model generated
 * - Auth flow test file created
 * - Authentication fixture generated
 * - Integrated workflow example created
 * - Complete documentation provided
 * 
 * GENERATED CODE FEATURES:
 * - Follows Playwright best practices
 * - Includes proper TypeScript typing
 * - Uses data-testid selectors for stability
 * - Integrates with BasePage pattern
 * - Provides authentication capabilities
 * - Includes comprehensive examples
 */