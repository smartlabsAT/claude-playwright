import inquirer from 'inquirer';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs-extra';

export interface InitOptions {
  name: string;
  template: 'minimal' | 'enterprise' | 'testing';
  installDeps: boolean;
  configureMCP: boolean;
}

export async function promptForOptions(): Promise<InitOptions> {
  console.log(chalk.blue('\n<¯ Claude-Playwright Project Setup\n'));
  
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Project name:',
      default: path.basename(process.cwd()),
      validate: (input: string) => {
        if (/^[a-z0-9-]+$/.test(input)) return true;
        return 'Project name must be lowercase with hyphens only';
      }
    },
    {
      type: 'list',
      name: 'template',
      message: 'Select template:',
      choices: [
        { 
          name: '=€ Minimal - Quick start with basic setup', 
          value: 'minimal' 
        },
        { 
          name: '<â Enterprise - Full featured with CI/CD pipeline', 
          value: 'enterprise' 
        },
        { 
          name: '>ê Testing - Test focused with advanced utilities', 
          value: 'testing' 
        }
      ],
      default: 'minimal'
    },
    {
      type: 'confirm',
      name: 'installDeps',
      message: 'Install dependencies now?',
      default: true
    },
    {
      type: 'confirm',
      name: 'configureMCP',
      message: 'Configure MCP for Claude Code?',
      default: true
    }
  ]);
  
  return answers as InitOptions;
}

export async function validateProjectName(name: string): Promise<boolean> {
  const projectPath = path.resolve(name);
  
  if (await fs.pathExists(projectPath)) {
    const files = await fs.readdir(projectPath);
    if (files.length > 0) {
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: `Directory "${name}" is not empty. Continue anyway?`,
          default: false
        }
      ]);
      return overwrite;
    }
  }
  
  return true;
}