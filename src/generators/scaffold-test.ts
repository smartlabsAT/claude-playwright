import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';

interface TestOptions {
  path?: string;
  pageObject?: string;
  fixture?: string;
  session?: string;
  interactive?: boolean;
  type?: 'basic' | 'e2e' | 'api' | 'visual';
  browserProfile?: string;
}

interface TestCase {
  name: string;
  description: string;
  type: 'positive' | 'negative' | 'edge';
}

/**
 * Main function to scaffold a new Playwright test
 */
export async function scaffoldTest(name: string, options: TestOptions = {}) {
  const fileName = toFileName(name);
  const targetDir = options.path || 'src/tests';
  const filePath = path.join(targetDir, `${fileName}.spec.ts`);
  
  console.log(chalk.blue(`🧪 Scaffolding test: ${fileName}...`));
  
  // Check if file exists
  if (await fs.pathExists(filePath)) {
    const overwrite = await askConfirmation(`${filePath} already exists. Overwrite?`);
    if (!overwrite) {
      console.log(chalk.yellow('❌ Test scaffolding cancelled'));
      return false;
    }
  }
  
  // Detect or ask for page object
  let pageObjectClass = '';
  let pageObjectImport = '';
  
  if (options.pageObject) {
    pageObjectClass = options.pageObject;
    pageObjectImport = `import { ${pageObjectClass} } from '../pages/${pageObjectClass}';`;
  } else if (options.interactive !== false) {
    const result = await detectPageObject(name, targetDir);
    pageObjectClass = result.className;
    pageObjectImport = result.import;
  }
  
  // Interactive mode for collecting test cases
  let testCases: TestCase[] = [];
  if (options.interactive !== false) {
    console.log(chalk.cyan('\n📋 Let\'s define the test cases...'));
    testCases = await collectTestCases();
  }
  
  // Generate test content based on type
  const testContent = generateTestContent({
    fileName,
    name,
    pageObjectClass,
    pageObjectImport,
    testCases,
    options
  });
  
  // Ensure directory exists and write file
  await fs.ensureDir(targetDir);
  await fs.writeFile(filePath, testContent);
  
  // Success feedback
  console.log(chalk.green('✅ Test scaffolded successfully!'));
  console.log(chalk.gray(`📁 Location: ${filePath}`));
  console.log(chalk.gray(`🏃 Run with: npx playwright test ${fileName}`));
  
  // Generate fixture suggestion if needed
  if (!options.fixture && testCases.some(tc => tc.type === 'negative')) {
    console.log(chalk.blue(`\n💡 Suggestion: Generate fixture with:`));
    console.log(chalk.gray(`   claude-playwright scaffold fixture ${fileName}Fixture`));
  }
  
  return true;
}

/**
 * Detect existing page object for the test
 */
async function detectPageObject(testName: string, testDir: string): Promise<{className: string, import: string}> {
  const pagesDir = path.join(path.dirname(testDir), 'pages');
  
  if (await fs.pathExists(pagesDir)) {
    try {
      const pageFiles = await fs.readdir(pagesDir);
      const matchingPage = pageFiles.find(file => {
        const baseName = file.replace('.ts', '').toLowerCase();
        const testBaseName = testName.toLowerCase().replace(/test$|spec$/, '');
        return baseName.includes(testBaseName) || testBaseName.includes(baseName);
      });
      
      if (matchingPage) {
        const className = matchingPage.replace('.ts', '');
        const importPath = `../pages/${className}`;
        console.log(chalk.green(`🔍 Found page object: ${className}`));
        return {
          className,
          import: `import { ${className} } from '${importPath}';`
        };
      }
    } catch (error) {
      // Ignore errors, fall back to BasePage
    }
  }
  
  return {
    className: 'BasePage',
    import: `import { BasePage } from '../pages/base/BasePage';`
  };
}

/**
 * Interactive collection of test cases
 */
async function collectTestCases(): Promise<TestCase[]> {
  const testCases: TestCase[] = [];
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const askQuestion = (question: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(question, resolve);
    });
  };
  
  try {
    while (true) {
      console.log(chalk.cyan('\n🧠 Add a test case (or press Enter to finish):'));
      const testName = await askQuestion('Test name (e.g., "should login successfully"): ');
      
      if (!testName.trim()) break;
      
      const description = await askQuestion('Description [optional]: ');
      const type = await askQuestion('Type (positive/negative/edge) [positive]: ') || 'positive';
      
      testCases.push({
        name: testName,
        description: description || testName,
        type: type as TestCase['type']
      });
      
      console.log(chalk.green(`✓ Added test case: ${testName}`));
    }
  } finally {
    rl.close();
  }
  
  return testCases;
}

/**
 * Generate the complete test file content
 */
function generateTestContent(config: {
  fileName: string;
  name: string;
  pageObjectClass: string;
  pageObjectImport: string;
  testCases: TestCase[];
  options: TestOptions;
}): string {
  const { fileName, name, pageObjectClass, pageObjectImport, testCases, options } = config;
  
  const imports = generateImports(options, pageObjectImport);
  const fixtures = generateFixtures(options);
  const beforeHooks = generateBeforeHooks(pageObjectClass, options);
  const testMethods = generateTestMethods(testCases, pageObjectClass, options);
  
  return `${imports}

/**
 * ${name} Test Suite
 * Generated by claude-playwright scaffold
 */
test.describe('${name}', () => {${fixtures}${beforeHooks}

${testMethods}
});
`;
}

/**
 * Generate imports based on test type and options
 */
function generateImports(options: TestOptions, pageObjectImport: string): string {
  let imports = `import { test, expect`;
  
  if (options.fixture) {
    imports += `, ${options.fixture}`;
  }
  
  imports += ` } from '@playwright/test';`;
  
  if (pageObjectImport) {
    imports += `\n${pageObjectImport}`;
  }
  
  if (options.type === 'api') {
    imports += `\nimport { APIRequestContext } from '@playwright/test';`;
  }
  
  if (options.session) {
    imports += `\nimport { SessionManager } from '../core/session-manager';`;
  }

  if (options.browserProfile) {
    imports += `\nimport { BrowserProfileManager } from '../core/browser-profile';`;
  }
  
  return imports;
}

/**
 * Generate fixture setup if needed
 */
function generateFixtures(options: TestOptions): string {
  if (!options.fixture && !options.session && !options.browserProfile) return '';
  
  let fixtures = '';
  
  if (options.session) {
    fixtures += `\n  let sessionManager: SessionManager;\n`;
  }

  if (options.browserProfile) {
    fixtures += `\n  let profileManager: BrowserProfileManager;\n`;
  }
  
  return fixtures;
}

/**
 * Generate before hooks
 */
function generateBeforeHooks(pageObjectClass: string, options: TestOptions): string {
  let hooks = `\n  let ${pageObjectClass.toLowerCase()}: ${pageObjectClass};`;
  
  hooks += `\n\n  test.beforeEach(async ({ page }) => {`;
  
  if (options.browserProfile) {
    hooks += `\n    // Setup browser profile`;
    hooks += `\n    profileManager = new BrowserProfileManager();`;
    hooks += `\n    const profile = await profileManager.loadProfile('${options.browserProfile}');`;
    hooks += `\n    if (profile) {`;
    hooks += `\n      // Apply profile settings to page`;
    hooks += `\n      if (profile.settings.cookies) {`;
    hooks += `\n        await page.context().addCookies(profile.settings.cookies);`;
    hooks += `\n      }`;
    hooks += `\n    }`;
  }
  
  if (options.session) {
    hooks += `\n    // Load session if available`;
    hooks += `\n    sessionManager = new SessionManager();`;
    hooks += `\n    const session = await sessionManager.loadSession('${options.session}');`;
    hooks += `\n    if (session) {`;
    hooks += `\n      await page.context().addCookies(session.cookies);`;
    hooks += `\n    }`;
  }
  
  hooks += `\n    ${pageObjectClass.toLowerCase()} = new ${pageObjectClass}(page);`;
  
  if (options.type !== 'api') {
    hooks += `\n    await ${pageObjectClass.toLowerCase()}.goto();`;
  }
  
  hooks += `\n  });`;
  
  return hooks;
}

/**
 * Generate test methods based on test cases and type
 */
function generateTestMethods(testCases: TestCase[], pageObjectClass: string, options: TestOptions): string {
  if (testCases.length === 0) {
    // Generate default test cases based on type
    return generateDefaultTests(pageObjectClass, options);
  }
  
  return testCases.map(testCase => generateTestMethod(testCase, pageObjectClass, options)).join('\n\n');
}

/**
 * Generate a single test method
 */
function generateTestMethod(testCase: TestCase, pageObjectClass: string, options: TestOptions): string {
  const testName = testCase.name.startsWith('should ') ? testCase.name : `should ${testCase.name}`;
  
  let testBody = '';
  const pageVar = pageObjectClass.toLowerCase();
  
  switch (testCase.type) {
    case 'positive':
      testBody = `    // ${testCase.description}\n`;
      testBody += `    await ${pageVar}.waitForLoad();\n`;
      testBody += `    await expect(${pageVar}.page).toHaveTitle(/.+/);\n`;
      testBody += `    // Add your positive test assertions here`;
      break;
      
    case 'negative':
      testBody = `    // ${testCase.description}\n`;
      testBody += `    // Test negative scenario\n`;
      testBody += `    // Add your negative test logic here`;
      break;
      
    case 'edge':
      testBody = `    // ${testCase.description}\n`;
      testBody += `    // Test edge case scenario\n`;
      testBody += `    // Add your edge case test logic here`;
      break;
  }
  
  return `  test('${testName}', async ({ page }) => {\n${testBody}\n  });`;
}

/**
 * Generate default tests when no custom test cases provided
 */
function generateDefaultTests(pageObjectClass: string, options: TestOptions): string {
  const pageVar = pageObjectClass.toLowerCase();
  
  if (options.type === 'api') {
    return `  test('should have valid API response', async ({ request }) => {\n    // Add your API test implementation\n    const response = await request.get('/api/endpoint');\n    expect(response.ok()).toBeTruthy();\n  });`;
  }
  
  if (options.type === 'visual') {
    return `  test('should match visual snapshot', async ({ page }) => {\n    await ${pageVar}.waitForLoad();\n    await expect(page).toHaveScreenshot('${toFileName(pageObjectClass)}.png');\n  });`;
  }
  
  // Default E2E tests
  return `  test('should load page successfully', async ({ page }) => {\n    await ${pageVar}.waitForLoad();\n    await expect(page).toHaveTitle(/.+/);\n    await expect(${pageVar}.isLoaded()).resolves.toBeTruthy();\n  });\n\n  test('should display main content', async ({ page }) => {\n    await ${pageVar}.waitForLoad();\n    // Add your content assertions here\n  });`;
}

/**
 * Ask for user confirmation
 */
async function askConfirmation(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  return new Promise((resolve) => {
    rl.question(`${question} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase().startsWith('y'));
    });
  });
}

/**
 * Utility functions
 */
function toFileName(name: string): string {
  return name
    .replace(/Test$|Spec$|Page$/i, '')
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-');
}