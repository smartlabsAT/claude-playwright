import { Command } from 'commander';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as os from 'os';

export function createMcpCommand(): Command {
  const mcp = new Command('mcp');
  
  mcp
    .description('MCP (Model Context Protocol) server management for Claude Code')
    .action(() => {
      console.log(chalk.cyan('\n📡 MCP Server Commands:'));
      console.log('  claude-playwright mcp init     - Initialize MCP configuration');
      console.log('  claude-playwright mcp status   - Check MCP server status');
      console.log('  claude-playwright mcp docs     - Open MCP documentation\n');
    });

  mcp
    .command('init')
    .description('Initialize MCP configuration for Claude Code')
    .option('-b, --base-url <url>', 'Set base URL for browser automation', 'http://localhost:3000')
    .option('-f, --force', 'Overwrite existing configuration')
    .action(async (options) => {
      console.log(chalk.blue('\n🚀 Initializing MCP Configuration...\n'));
      
      const projectRoot = process.cwd();
      const mcpConfigPath = path.join(projectRoot, '.mcp.json');
      
      // Check if .mcp.json already exists
      if (fs.existsSync(mcpConfigPath) && !options.force) {
        console.log(chalk.yellow('⚠️  .mcp.json already exists. Use --force to overwrite.'));
        return;
      }
      
      // Create .mcp.json configuration - server runs directly from package
      // Try to find the MCP server in the package
      let mcpServerPath: string;
      try {
        // If installed as dependency
        const packageRoot = path.dirname(require.resolve('claude-playwright/package.json'));
        mcpServerPath = path.join(packageRoot, 'dist', 'mcp', 'server.cjs');
      } catch {
        // If running from linked package or development
        mcpServerPath = path.join(__dirname, '..', '..', 'dist', 'mcp', 'server.cjs');
      }
      
      // Check if server exists
      if (!fs.existsSync(mcpServerPath)) {
        console.error(chalk.red('✗ MCP server not found in package'));
        console.log(chalk.yellow('  Please ensure claude-playwright is properly installed'));
        return;
      }
      
      const mcpConfig = {
        mcpServers: {
          playwright: {
            command: "node",
            args: [mcpServerPath],
            env: {
              BASE_URL: options.baseUrl
            }
          }
        }
      };
      
      try {
        fs.writeJsonSync(mcpConfigPath, mcpConfig, { spaces: 2 });
        console.log(chalk.green('✓ Created .mcp.json configuration'));
      } catch (error) {
        console.error(chalk.red('✗ Failed to create .mcp.json:'), (error as Error).message);
        return;
      }
      
      console.log(chalk.green('\n✅ MCP Configuration Complete!\n'));
      console.log(chalk.cyan('Next steps:'));
      console.log('1. Restart Claude Code to load the MCP server');
      console.log('2. Use /mcp command in Claude Code to verify connection');
      console.log('3. Start using browser automation tools!\n');
      console.log(chalk.dim('Available tools:'));
      console.log(chalk.dim('- browser_navigate, browser_click, browser_type'));
      console.log(chalk.dim('- browser_session_save, browser_session_restore'));
      console.log(chalk.dim('- browser_console_messages, browser_network_requests'));
      console.log(chalk.dim('- browser_screenshot, browser_evaluate, and more...'));
      console.log(chalk.dim('\nRun "claude-playwright mcp docs" for full documentation'));
    });

  mcp
    .command('status')
    .description('Check MCP server status and configuration')
    .action(() => {
      const projectRoot = process.cwd();
      const mcpConfigPath = path.join(projectRoot, '.mcp.json');
      
      console.log(chalk.blue('\n🔍 MCP Server Status\n'));
      
      // Check .mcp.json
      if (fs.existsSync(mcpConfigPath)) {
        console.log(chalk.green('✓ .mcp.json found'));
        try {
          const config = fs.readJsonSync(mcpConfigPath);
          const baseUrl = config.mcpServers?.playwright?.env?.BASE_URL || 'Not set';
          console.log(chalk.gray(`  BASE_URL: ${baseUrl}`));
        } catch (error) {
          console.log(chalk.red('  Error reading configuration'));
        }
      } else {
        console.log(chalk.red('✗ .mcp.json not found'));
        console.log(chalk.yellow('  Run "claude-playwright mcp init" to create it'));
      }
      
      // Check if package is installed
      try {
        require.resolve('claude-playwright');
        console.log(chalk.green('✓ MCP server available (from package)'));
      } catch {
        console.log(chalk.yellow('✓ MCP server will run via npx'));
      }
      
      // Check sessions directory
      const sessionsDir = path.join(os.homedir(), '.claude-playwright', 'sessions');
      if (fs.existsSync(sessionsDir)) {
        const sessions = fs.readdirSync(sessionsDir)
          .filter(f => f.endsWith('.session.json'))
          .map(f => f.replace('.session.json', ''));
        
        console.log(chalk.green(`✓ Sessions directory found`));
        if (sessions.length > 0) {
          console.log(chalk.gray(`  Saved sessions: ${sessions.join(', ')}`));
        } else {
          console.log(chalk.gray('  No saved sessions'));
        }
      } else {
        console.log(chalk.yellow('✓ Sessions directory will be created on first use'));
      }
      
      console.log(chalk.cyan('\n📝 Notes:'));
      console.log('- Restart Claude Code after making configuration changes');
      console.log('- Use /mcp command in Claude Code to test connection');
      console.log('- Sessions are stored globally and shared across projects\n');
    });

  mcp
    .command('docs')
    .description('Open MCP server documentation')
    .action(() => {
      const docsPath = path.join(__dirname, '..', '..', 'docs', 'MCP_SERVER.md');
      
      if (fs.existsSync(docsPath)) {
        console.log(chalk.blue('\n📚 MCP Server Documentation\n'));
        console.log(chalk.cyan('Opening documentation...\n'));
        
        // Copy docs to current directory for easy access
        const localDocsPath = path.join(process.cwd(), 'MCP_DOCUMENTATION.md');
        fs.copySync(docsPath, localDocsPath);
        
        console.log(chalk.green(`✓ Documentation copied to: ${localDocsPath}`));
        console.log(chalk.gray('\nYou can also view it online at:'));
        console.log(chalk.blue('https://github.com/smartlabsAT/claude-playwright/blob/main/docs/MCP_SERVER.md\n'));
      } else {
        console.log(chalk.red('Documentation file not found'));
      }
    });

  return mcp;
}