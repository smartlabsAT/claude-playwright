/**
 * Intelligent retry helper for transient failures
 * Provides exponential backoff and smart error classification
 */

export interface RetryConfig {
  maxAttempts?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  timeout?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxAttempts: 3,
  baseDelay: 100,
  maxDelay: 2000,
  backoffMultiplier: 2,
  timeout: 30000,
  onRetry: () => {}
};

// Transient errors that should be retried
const TRANSIENT_ERRORS = [
  'TimeoutError',
  'Timeout',
  'exceeded',
  'not found',
  'not visible',
  'detached',
  'Target closed',
  'Connection closed',
  'Protocol error',
  'Execution context was destroyed'
];

// Permanent errors that should NOT be retried
const PERMANENT_ERRORS = [
  'Invalid selector',
  'Syntax error',
  'Permission denied',
  'Security',
  'Validation failed',
  'Invalid argument'
];

export class RetryHelper {
  /**
   * Classify if an error is transient (worth retrying)
   */
  static isTransientError(error: Error): boolean {
    const errorStr = error.message.toLowerCase();

    // Check for permanent errors first (higher priority)
    for (const permanent of PERMANENT_ERRORS) {
      if (errorStr.includes(permanent.toLowerCase())) {
        return false;
      }
    }

    // Check for transient errors
    for (const transient of TRANSIENT_ERRORS) {
      if (errorStr.includes(transient.toLowerCase())) {
        return true;
      }
    }

    // Default: don't retry unknown errors
    return false;
  }

  /**
   * Execute operation with intelligent retry logic
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    config: RetryConfig = {}
  ): Promise<T> {
    const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
      try {
        // Try the operation with timeout
        return await Promise.race([
          operation(),
          new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Operation timeout after ${finalConfig.timeout}ms`)),
            finalConfig.timeout)
          )
        ]);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry permanent errors
        if (!this.isTransientError(lastError)) {
          console.error(`[RetryHelper] Permanent error (no retry): ${lastError.message}`);
          throw lastError;
        }

        // Don't retry if this was the last attempt
        if (attempt === finalConfig.maxAttempts) {
          console.error(`[RetryHelper] Failed after ${attempt} attempts: ${lastError.message}`);
          throw lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          finalConfig.baseDelay * Math.pow(finalConfig.backoffMultiplier, attempt - 1),
          finalConfig.maxDelay
        );

        console.error(`[RetryHelper] Attempt ${attempt}/${finalConfig.maxAttempts} failed: ${lastError.message}`);
        console.error(`[RetryHelper] Retrying in ${delay}ms...`);

        // Call retry callback
        finalConfig.onRetry(attempt, lastError);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error('Operation failed');
  }

  /**
   * Create a retriable version of a function
   */
  static makeRetriable<T extends (...args: any[]) => Promise<any>>(
    fn: T,
    config: RetryConfig = {}
  ): T {
    return (async (...args: Parameters<T>) => {
      return await this.withRetry(() => fn(...args), config);
    }) as T;
  }
}

/**
 * Decorator for making methods retriable
 */
export function Retriable(config: RetryConfig = {}) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      return await RetryHelper.withRetry(
        () => originalMethod.apply(this, args),
        config
      );
    };

    return descriptor;
  };
}