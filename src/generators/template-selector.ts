import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export interface TemplateMetadata {
  name: string;
  description: string;
  files: string[];
  features: string[];
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export const TEMPLATES: Record<string, TemplateMetadata> = {
  minimal: {
    name: 'Minimal Template',
    description: 'Basic setup for quick start with essential components',
    files: [
      'CLAUDE.md',
      'playwright.config.ts', 
      'src/pages/base/BasePage.ts',
      'src/tests/example.spec.ts'
    ],
    features: [
      'Basic Page Object Model',
      'Essential Playwright configuration',
      'Claude MCP integration',
      'Example test'
    ],
    dependencies: {
      '@playwright/test': '^1.40.0'
    },
    devDependencies: {
      'typescript': '^5.0.0'
    }
  },
  
  enterprise: {
    name: 'Enterprise Template',
    description: 'Full featured setup with CI/CD pipeline and best practices',
    files: [
      'CLAUDE.md',
      'playwright.config.ts',
      'docker-compose.yml',
      '.github/workflows/tests.yml',
      'src/pages/base/BasePage.ts',
      'src/pages/base/BaseComponent.ts',
      'src/fixtures/AuthFixture.ts',
      'src/utils/DataGenerator.ts',
      'src/tests/example.spec.ts'
    ],
    features: [
      'Advanced Page Object Model with Components',
      'Docker containerization',
      'GitHub Actions CI/CD',
      'Authentication fixtures',
      'Test data generation',
      'Visual regression testing',
      'Performance monitoring'
    ],
    dependencies: {
      '@playwright/test': '^1.40.0',
      'dotenv': '^16.0.0'
    },
    devDependencies: {
      'typescript': '^5.0.0',
      '@types/node': '^20.0.0'
    }
  },
  
  testing: {
    name: 'Testing Template',
    description: 'Test-focused setup with advanced utilities and fixtures',
    files: [
      'CLAUDE.md',
      'playwright.config.ts',
      'src/pages/base/BasePage.ts',
      'src/fixtures/BaseFixture.ts',
      'src/utils/TestHelpers.ts',
      'src/utils/MockData.ts',
      'src/tests/example.spec.ts'
    ],
    features: [
      'Advanced test fixtures',
      'Test utilities and helpers',
      'Mock data generation',
      'Enhanced reporting',
      'Test parallelization optimized',
      'Custom assertions',
      'API testing integration'
    ],
    dependencies: {
      '@playwright/test': '^1.40.0',
      'faker': '^8.0.0'
    },
    devDependencies: {
      'typescript': '^5.0.0',
      '@types/faker': '^8.0.0'
    }
  }
};

export async function selectTemplate(templateName: string): Promise<TemplateMetadata> {
  const template = TEMPLATES[templateName];
  
  if (!template) {
    throw new Error(`Unknown template: ${templateName}`);
  }
  
  console.log(chalk.blue(`\n=Ë Selected Template: ${template.name}`));
  console.log(chalk.gray(`${template.description}\n`));
  
  console.log(chalk.cyan('Features:'));
  template.features.forEach(feature => {
    console.log(chalk.gray(`  " ${feature}`));
  });
  
  return template;
}

export async function listAvailableTemplates(): Promise<void> {
  console.log(chalk.blue('\n=Ë Available Templates:\n'));
  
  for (const [key, template] of Object.entries(TEMPLATES)) {
    console.log(chalk.cyan(`${key}:`));
    console.log(chalk.white(`  ${template.name}`));
    console.log(chalk.gray(`  ${template.description}`));
    console.log(chalk.gray(`  Features: ${template.features.length} included\n`));
  }
}

export function getTemplateFiles(templateName: string): string[] {
  const template = TEMPLATES[templateName];
  return template ? template.files : [];
}

export function getTemplateDependencies(templateName: string): {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
} {
  const template = TEMPLATES[templateName];
  
  if (!template) {
    return { dependencies: {}, devDependencies: {} };
  }
  
  return {
    dependencies: template.dependencies,
    devDependencies: template.devDependencies
  };
}