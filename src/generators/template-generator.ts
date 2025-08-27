import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { TemplateMetadata } from './template-selector';

export class TemplateGenerator {
  private templatesDir: string;
  private projectPath: string;
  private templateVars: Record<string, string>;

  constructor(projectPath: string, templateVars: Record<string, string> = {}) {
    this.templatesDir = path.join(__dirname, '../../templates');
    this.projectPath = projectPath;
    this.templateVars = templateVars;
  }

  /**
   * Generate project from template
   */
  async generateFromTemplate(templateName: string, metadata: TemplateMetadata): Promise<void> {
    const templatePath = path.join(this.templatesDir, templateName);
    
    if (!await fs.pathExists(templatePath)) {
      throw new Error(`Template directory not found: ${templatePath}`);
    }

    console.log(chalk.blue(`\n=� Generating ${metadata.name}...`));

    // Create project directories
    await this.createDirectories(templateName);

    // Process template files
    await this.processTemplateFiles(templatePath);

    // Generate package.json with template-specific dependencies
    await this.generatePackageJson(metadata);

    // Create gitignore
    await this.createGitIgnore();

    // Create additional directories based on template
    await this.createTemplateDirs(templateName);

    console.log(chalk.green(` ${metadata.name} generated successfully`));
  }

  /**
   * Create base project directories
   */
  private async createDirectories(templateName: string): Promise<void> {
    const baseDirs = [
      'src/pages/base',
      'src/tests',
      'src/fixtures',
      'src/utils',
      'browser-profiles',
      'auth-states',
      'screenshots',
      'test-results',
      'playwright-report'
    ];

    // Add template-specific directories
    if (templateName === 'enterprise') {
      baseDirs.push(
        'src/pages/components',
        'docker',
        'lighthouse-reports',
        '.github/workflows'
      );
    }

    for (const dir of baseDirs) {
      await fs.ensureDir(path.join(this.projectPath, dir));
    }

    console.log(chalk.gray('   Project structure created'));
  }

  /**
   * Process all template files
   */
  private async processTemplateFiles(templatePath: string): Promise<void> {
    const files = await this.getTemplateFiles(templatePath);

    for (const file of files) {
      await this.processTemplateFile(file);
    }

    console.log(chalk.gray('   Template files processed'));
  }

  /**
   * Get all template files recursively
   */
  private async getTemplateFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];
    const items = await fs.readdir(dirPath, { withFileTypes: true });

    for (const item of items) {
      const fullPath = path.join(dirPath, item.name);
      
      if (item.isDirectory()) {
        const subFiles = await this.getTemplateFiles(fullPath);
        files.push(...subFiles);
      } else if (item.isFile() && item.name.endsWith('.template')) {
        files.push(fullPath);
      }
    }

    return files;
  }

  /**
   * Process individual template file
   */
  private async processTemplateFile(filePath: string): Promise<void> {
    const content = await fs.readFile(filePath, 'utf-8');
    const processedContent = this.replaceTemplateVars(content);

    // Calculate target path (remove .template extension and adjust path)
    const relativePath = path.relative(
      path.join(this.templatesDir, path.basename(path.dirname(filePath))),
      filePath
    );
    const targetPath = path.join(
      this.projectPath,
      relativePath.replace('.template', '')
    );

    // Ensure target directory exists
    await fs.ensureDir(path.dirname(targetPath));
    
    // Write processed file
    await fs.writeFile(targetPath, processedContent);
  }

  /**
   * Replace template variables in content
   */
  private replaceTemplateVars(content: string): string {
    let processed = content;

    for (const [key, value] of Object.entries(this.templateVars)) {
      const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      processed = processed.replace(pattern, value);
    }

    return processed;
  }

  /**
   * Generate package.json with template dependencies
   */
  private async generatePackageJson(metadata: TemplateMetadata): Promise<void> {
    const packageJsonPath = path.join(this.projectPath, 'package.json');
    
    const packageJson = {
      name: this.templateVars.PROJECT_NAME || 'playwright-project',
      version: '1.0.0',
      description: `Playwright testing project generated with ${metadata.name}`,
      type: 'module',
      scripts: {
        'test': 'playwright test',
        'test:ui': 'playwright test --ui',
        'test:debug': 'playwright test --debug',
        'test:headed': 'playwright test --headed',
        'report': 'playwright show-report',
        'codegen': 'playwright codegen'
      },
      dependencies: {
        ...metadata.dependencies
      },
      devDependencies: {
        ...metadata.devDependencies
      }
    };

    // Add enterprise-specific scripts
    if (metadata.name.includes('Enterprise')) {
      const enterpriseScripts = {
        'test:docker': 'docker-compose up --build playwright-tests',
        'test:visual': 'playwright test --grep="@visual"',
        'test:performance': 'playwright test --grep="@performance"',
        'test:smoke': 'playwright test --grep="@smoke"',
        'docker:build': 'docker-compose build',
        'docker:up': 'docker-compose up -d',
        'docker:down': 'docker-compose down'
      };
      
      packageJson.scripts = {
        ...packageJson.scripts,
        ...enterpriseScripts
      };
    }

    await fs.writeJSON(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.gray('   package.json generated'));
  }

  /**
   * Create .gitignore file
   */
  private async createGitIgnore(): Promise<void> {
    const gitignoreContent = `# Dependencies
node_modules/
/.pnp
.pnp.js

# Testing
/coverage
test-results/
playwright-report/
playwright/.cache/

# Production
/build
/dist

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Browser data
browser-profiles/
auth-states/

# Screenshots
screenshots/

# Logs
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# OS
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDEs
.vscode/
.idea/
*.swp
*.swo

# Docker
.dockerignore
`;

    await fs.writeFile(
      path.join(this.projectPath, '.gitignore'),
      gitignoreContent
    );

    console.log(chalk.gray('   .gitignore created'));
  }

  /**
   * Create template-specific directories
   */
  private async createTemplateDirs(templateName: string): Promise<void> {
    if (templateName === 'enterprise') {
      // Create docker config directory
      const dockerDir = path.join(this.projectPath, 'docker');
      await fs.ensureDir(dockerDir);

      // Create nginx config for Docker
      const nginxConfig = `events {}
http {
    server {
        listen 80;
        location / {
            root /usr/share/nginx/html;
            index index.html;
            try_files $uri $uri/ /index.html;
        }
    }
}`;
      
      await fs.writeFile(
        path.join(dockerDir, 'nginx.conf'),
        nginxConfig
      );
    }

    if (templateName === 'testing') {
      // Create specific test data directories
      const testDataDir = path.join(this.projectPath, 'test-data');
      await fs.ensureDir(testDataDir);
      await fs.ensureDir(path.join(testDataDir, 'fixtures'));
      await fs.ensureDir(path.join(testDataDir, 'mocks'));
    }
  }

  /**
   * Set template variables
   */
  setTemplateVars(vars: Record<string, string>): void {
    this.templateVars = { ...this.templateVars, ...vars };
  }
}