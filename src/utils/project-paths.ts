import path from 'path';
import * as fs from 'fs-extra';

/**
 * Centralized project path management
 * Uses project-local .claude-playwright directory instead of user home directory
 */
export class ProjectPaths {
  private static projectRoot: string | null = null;
  private static baseDir: string | null = null;

  /**
   * Find the project root by looking for package.json, .git, or other markers
   */
  static findProjectRoot(startDir: string = process.cwd()): string {
    if (this.projectRoot) {
      return this.projectRoot;
    }

    let currentDir = path.resolve(startDir);
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      // Look for project markers
      const markers = ['package.json', '.git', '.mcp.json', 'tsconfig.json', 'composer.json'];
      
      for (const marker of markers) {
        try {
          if (fs.pathExistsSync(path.join(currentDir, marker))) {
            this.projectRoot = currentDir;
            return currentDir;
          }
        } catch (error) {
          // Ignore errors and continue searching
        }
      }

      currentDir = path.dirname(currentDir);
    }

    // Fallback to current working directory if no project root found
    this.projectRoot = process.cwd();
    return this.projectRoot;
  }

  /**
   * Get the base .claude-playwright directory (project-local)
   */
  static getBaseDir(): string {
    if (this.baseDir) {
      return this.baseDir;
    }

    const projectRoot = this.findProjectRoot();
    this.baseDir = path.join(projectRoot, '.claude-playwright');
    return this.baseDir;
  }

  /**
   * Get the cache directory
   */
  static getCacheDir(): string {
    return path.join(this.getBaseDir(), 'cache');
  }

  /**
   * Get the sessions directory
   */
  static getSessionsDir(): string {
    return path.join(this.getBaseDir(), 'sessions');
  }

  /**
   * Get the profiles directory
   */
  static getProfilesDir(): string {
    return path.join(this.getBaseDir(), 'profiles');
  }

  /**
   * Get the logs directory
   */
  static getLogsDir(): string {
    return path.join(this.getBaseDir(), 'logs');
  }

  /**
   * Ensure all required directories exist
   */
  static async ensureDirectories(): Promise<void> {
    const dirs = [
      this.getBaseDir(),
      this.getCacheDir(),
      this.getSessionsDir(),
      this.getProfilesDir(),
      this.getLogsDir()
    ];

    for (const dir of dirs) {
      await fs.ensureDir(dir);
    }
  }

  /**
   * Reset cached paths (for testing)
   */
  static reset(): void {
    this.projectRoot = null;
    this.baseDir = null;
  }

  /**
   * Get project-relative path for display purposes
   */
  static getRelativePath(fullPath: string): string {
    const projectRoot = this.findProjectRoot();
    return path.relative(projectRoot, fullPath);
  }

  /**
   * Check if we're in a valid project (has project markers)
   */
  static isValidProject(): boolean {
    const projectRoot = this.findProjectRoot();
    const markers = ['package.json', '.git', '.mcp.json', 'tsconfig.json'];
    
    return markers.some(marker => {
      try {
        return fs.pathExistsSync(path.join(projectRoot, marker));
      } catch (error) {
        return false;
      }
    });
  }
}