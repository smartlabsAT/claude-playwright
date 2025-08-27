import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import * as readline from 'readline';

/**
 * Generate project configuration file with base URL
 */
export async function generateProjectConfig(projectPath: string): Promise<void> {
  // Ask user for base URL
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const baseURL = await new Promise<string>((resolve) => {
    rl.question(chalk.blue('🌐 Enter your application base URL (default: http://localhost:3000): '), (url) => {
      rl.close();
      resolve(url.trim() || 'http://localhost:3000');
    });
  });

  const configSource = path.join(__dirname, '../../templates/claude-playwright.config.js');
  const configDest = path.join(projectPath, 'claude-playwright.config.js');
  
  // Check if template exists
  if (await fs.pathExists(configSource)) {
    // Read template config
    let configContent = await fs.readFile(configSource, 'utf8');
    
    // Replace base URL
    configContent = configContent.replace(
      "baseURL: process.env.BASE_URL || 'http://localhost:3000'",
      `baseURL: process.env.BASE_URL || '${baseURL}'`
    );
    
    await fs.writeFile(configDest, configContent);
  } else {
    // Generate minimal config if template doesn't exist
    const minimalConfig = `/**
 * Claude-Playwright Configuration
 */

module.exports = {
  // Base URL for all browser operations
  baseURL: process.env.BASE_URL || '${baseURL}',
  
  // Session configuration
  sessions: {
    timeout: 8 * 60 * 60 * 1000,
    autoExtend: true,
    directory: './playwright-sessions'
  },
  
  // MCP Server configuration
  mcp: {
    enforceBaseURL: true,
    redirectRelativeToBase: true
  }
};`;
    
    await fs.writeFile(configDest, minimalConfig);
  }
  
  console.log(chalk.green(`✓ Project config created with base URL: ${baseURL}`));
}