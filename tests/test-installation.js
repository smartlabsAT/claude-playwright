#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

/**
 * Installation Test Suite for claude-playwright-toolkit
 * Tests package installation, file structure, and dependencies
 */
class InstallationTestRunner {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.testsPassed = 0;
    this.testsFailed = 0;
    this.tests = [];
  }

  // Test assertion helper
  assert(condition, message) {
    if (condition) {
      console.log(`  ✅ ${message}`);
      return true;
    } else {
      console.log(`  ❌ ${message}`);
      return false;
    }
  }

  // Test helper
  async runTest(testName, testFunc) {
    console.log(`\n🔬 Test: ${testName}`);
    console.log('─'.repeat(50));
    
    try {
      const result = await testFunc();
      if (result) {
        this.testsPassed++;
        console.log(`✅ PASS: ${testName}`);
      } else {
        this.testsFailed++;
        console.log(`❌ FAIL: ${testName}`);
      }
      this.tests.push({ name: testName, passed: result });
      return result;
    } catch (error) {
      this.testsFailed++;
      console.log(`❌ ERROR in ${testName}: ${error.message}`);
      this.tests.push({ name: testName, passed: false, error: error.message });
      return false;
    }
  }

  // Test basic file structure
  async testFileStructure() {
    return await this.runTest('Required file structure exists', async () => {
      const requiredFiles = [
        'package.json',
        'bin/claude-playwright.js',
        'dist/cli/index.js',
        'dist/index.js',
        'tsconfig.json'
      ];

      const requiredDirs = [
        'src',
        'dist',
        'bin',
        'browser-profiles',
        'scripts'
      ];

      let allFilesExist = true;
      let allDirsExist = true;

      console.log('  📁 Checking required files:');
      for (const file of requiredFiles) {
        const fullPath = path.join(this.projectRoot, file);
        const exists = fs.existsSync(fullPath);
        this.assert(exists, `${file} exists`);
        if (!exists) allFilesExist = false;
      }

      console.log('  📂 Checking required directories:');
      for (const dir of requiredDirs) {
        const fullPath = path.join(this.projectRoot, dir);
        const exists = fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory();
        this.assert(exists, `${dir}/ directory exists`);
        if (!exists) allDirsExist = false;
      }

      return allFilesExist && allDirsExist;
    });
  }

  // Test package.json configuration
  async testPackageConfiguration() {
    return await this.runTest('Package configuration is correct', async () => {
      try {
        const packagePath = path.join(this.projectRoot, 'package.json');
        const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

        const hasCorrectName = this.assert(
          pkg.name === 'claude-playwright',
          'Package name is correct'
        );

        const hasVersion = this.assert(
          pkg.version && pkg.version.length > 0,
          'Package has version'
        );

        const hasMain = this.assert(
          pkg.main === 'dist/index.cjs',
          'Package main entry is correct'
        );

        const hasBin = this.assert(
          pkg.bin && pkg.bin['claude-playwright'],
          'Package has bin entry'
        );

        const hasBinPath = this.assert(
          pkg.bin['claude-playwright'] === './bin/claude-playwright.js',
          'Bin path is correct'
        );

        const hasScripts = this.assert(
          pkg.scripts && typeof pkg.scripts === 'object',
          'Package has scripts section'
        );

        const hasDependencies = this.assert(
          pkg.dependencies && typeof pkg.dependencies === 'object',
          'Package has dependencies'
        );

        const hasRequiredDeps = this.assert(
          pkg.dependencies.chalk && pkg.dependencies.commander,
          'Package has required dependencies (chalk, commander)'
        );

        return hasCorrectName && hasVersion && hasMain && hasBin && 
               hasBinPath && hasScripts && hasDependencies && hasRequiredDeps;
      } catch (error) {
        console.log(`  ❌ Package.json parsing failed: ${error.message}`);
        return false;
      }
    });
  }

  // Test build artifacts
  async testBuildArtifacts() {
    return await this.runTest('Build artifacts are present and valid', async () => {
      const distFiles = [
        'dist/index.js',
        'dist/cli/index.js',
        'dist/core/session-manager.js',
        'dist/core/browser-profile.js',
        'dist/generators/mcp-setup.js'
      ];

      let allBuiltFilesExist = true;
      
      console.log('  🏗️ Checking build artifacts:');
      for (const file of distFiles) {
        const fullPath = path.join(this.projectRoot, file);
        const exists = fs.existsSync(fullPath);
        
        if (exists) {
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            const isValid = content.length > 0 && content.includes('exports');
            this.assert(isValid, `${file} exists and appears valid`);
            if (!isValid) allBuiltFilesExist = false;
          } catch (error) {
            this.assert(false, `${file} exists but cannot be read`);
            allBuiltFilesExist = false;
          }
        } else {
          this.assert(false, `${file} is missing`);
          allBuiltFilesExist = false;
        }
      }

      return allBuiltFilesExist;
    });
  }

  // Test CLI executable permissions and shebang
  async testCLIExecutable() {
    return await this.runTest('CLI executable is properly configured', async () => {
      const cliPath = path.join(this.projectRoot, 'bin/claude-playwright.js');
      
      try {
        const exists = fs.existsSync(cliPath);
        this.assert(exists, 'CLI executable exists');
        
        if (!exists) return false;

        const content = fs.readFileSync(cliPath, 'utf8');
        const hasShebang = content.startsWith('#!/usr/bin/env node');
        this.assert(hasShebang, 'CLI has correct shebang');

        const hasRequire = content.includes("require('../dist/cli/index.js')");
        this.assert(hasRequire, 'CLI requires correct entry point');

        const stats = fs.statSync(cliPath);
        const isFile = stats.isFile();
        this.assert(isFile, 'CLI path points to a file');

        return hasShebang && hasRequire && isFile;
      } catch (error) {
        console.log(`  ❌ CLI executable test failed: ${error.message}`);
        return false;
      }
    });
  }

  // Test browser profiles setup
  async testBrowserProfiles() {
    return await this.runTest('Browser profiles are configured', async () => {
      const profilesDir = path.join(this.projectRoot, 'browser-profiles');
      const exists = fs.existsSync(profilesDir);
      this.assert(exists, 'Browser profiles directory exists');

      if (!exists) return false;

      const profiles = ['desktop.json', 'mobile.json', 'tablet.json'];
      let allProfilesExist = true;

      console.log('  📱 Checking browser profiles:');
      for (const profile of profiles) {
        const profilePath = path.join(profilesDir, profile);
        const profileExists = fs.existsSync(profilePath);
        
        if (profileExists) {
          try {
            const content = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
            const isValid = (content.settings && content.settings.viewport) || content.viewport || content.userAgent || content.settings;
            this.assert(isValid, `${profile} exists and is valid JSON`);
            if (!isValid) allProfilesExist = false;
          } catch (error) {
            this.assert(false, `${profile} exists but is invalid JSON`);
            allProfilesExist = false;
          }
        } else {
          this.assert(false, `${profile} is missing`);
          allProfilesExist = false;
        }
      }

      return allProfilesExist;
    });
  }

  // Test TypeScript configuration
  async testTypeScriptConfig() {
    return await this.runTest('TypeScript configuration is valid', async () => {
      const tsconfigPath = path.join(this.projectRoot, 'tsconfig.json');
      
      try {
        const exists = fs.existsSync(tsconfigPath);
        this.assert(exists, 'tsconfig.json exists');
        
        if (!exists) return false;

        const content = fs.readFileSync(tsconfigPath, 'utf8');
        const config = JSON.parse(content);

        const hasCompilerOptions = this.assert(
          config.compilerOptions,
          'Has compiler options'
        );

        const hasOutDir = this.assert(
          config.compilerOptions.outDir === './dist',
          'Output directory is ./dist'
        );

        const hasTarget = this.assert(
          config.compilerOptions.target,
          'Has compilation target'
        );

        const hasModule = this.assert(
          config.compilerOptions.module,
          'Has module type'
        );

        return hasCompilerOptions && hasOutDir && hasTarget && hasModule;
      } catch (error) {
        console.log(`  ❌ TypeScript config test failed: ${error.message}`);
        return false;
      }
    });
  }

  // Test node_modules presence (basic check)
  async testDependenciesInstalled() {
    return await this.runTest('Dependencies are installed', async () => {
      const nodeModulesPath = path.join(this.projectRoot, 'node_modules');
      const exists = fs.existsSync(nodeModulesPath);
      this.assert(exists, 'node_modules directory exists');

      if (!exists) return false;

      const requiredDeps = ['chalk', 'commander', 'fs-extra', 'inquirer'];
      let allDepsPresent = true;

      console.log('  📦 Checking key dependencies:');
      for (const dep of requiredDeps) {
        const depPath = path.join(nodeModulesPath, dep);
        const depExists = fs.existsSync(depPath);
        this.assert(depExists, `${dep} is installed`);
        if (!depExists) allDepsPresent = false;
      }

      return allDepsPresent;
    });
  }

  // Main test runner
  async runAllTests() {
    console.log('🚀 Starting Claude Playwright Toolkit Installation Tests');
    console.log('═'.repeat(60));
    console.log(`📁 Project root: ${this.projectRoot}`);
    console.log('═'.repeat(60));

    // Run all tests
    await this.testFileStructure();
    await this.testPackageConfiguration();
    await this.testBuildArtifacts();
    await this.testCLIExecutable();
    await this.testBrowserProfiles();
    await this.testTypeScriptConfig();
    await this.testDependenciesInstalled();

    // Generate summary
    this.generateSummary();
    
    // Exit with appropriate code
    process.exit(this.testsFailed > 0 ? 1 : 0);
  }

  generateSummary() {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 INSTALLATION TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Passed: ${this.testsPassed}`);
    console.log(`❌ Failed: ${this.testsFailed}`);
    console.log(`📈 Success Rate: ${((this.testsPassed / (this.testsPassed + this.testsFailed)) * 100).toFixed(1)}%`);
    console.log('');

    if (this.testsFailed > 0) {
      console.log('❌ FAILED TESTS:');
      this.tests
        .filter(test => !test.passed)
        .forEach(test => {
          console.log(`   • ${test.name}${test.error ? `: ${test.error}` : ''}`);
        });
      console.log('');
    }

    console.log(this.testsFailed === 0 ? 
      '🎉 ALL INSTALLATION TESTS PASSED!' : 
      `⚠️ ${this.testsFailed} installation test(s) failed`
    );
    
    console.log('');
    if (this.testsFailed === 0) {
      console.log('✅ Package is properly installed and configured');
    } else {
      console.log('❌ Installation issues detected - please fix before using');
    }
    console.log('═'.repeat(60));
  }
}

// Run tests if called directly
if (require.main === module) {
  const runner = new InstallationTestRunner();
  runner.runAllTests().catch(console.error);
}

module.exports = InstallationTestRunner;