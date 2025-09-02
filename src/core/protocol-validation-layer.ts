/**
 * Protocol Validation Layer
 * 
 * Main integration point for protocol validation in the MCP server.
 * Wraps all message processing with validation and error recovery.
 */

import { DefaultMCPProtocolValidator, MCPProtocolValidator, ProtocolError, ValidationResult } from './protocol-validator.js';
import { ProtocolErrorRecovery } from './protocol-error-recovery.js';

export interface ValidatedMessage {
  original: any;
  validated: any;
  validationResult: ValidationResult;
  processingTime: number;
}

export interface ProtocolValidationConfig {
  enabled: boolean;
  strictMode: boolean;
  sanitizeInputs: boolean;
  enableRecovery: boolean;
  maxRecoveryAttempts: number;
}

export class ProtocolValidationLayer {
  private validator: MCPProtocolValidator;
  private errorRecovery: ProtocolErrorRecovery;
  private config: ProtocolValidationConfig;
  private validationStats = {
    totalMessages: 0,
    validMessages: 0,
    invalidMessages: 0,
    recoveredMessages: 0,
    averageValidationTime: 0
  };

  constructor(config: Partial<ProtocolValidationConfig> = {}) {
    this.config = {
      enabled: true,
      strictMode: false,
      sanitizeInputs: true,
      enableRecovery: true,
      maxRecoveryAttempts: 3,
      ...config
    };

    this.validator = new DefaultMCPProtocolValidator();
    this.errorRecovery = new ProtocolErrorRecovery();

    console.error('[ProtocolValidation] Layer initialized with config:', this.config);
  }

  /**
   * Main entry point for message validation
   */
  async processMessage(message: any): Promise<ValidatedMessage> {
    const startTime = Date.now();
    this.validationStats.totalMessages++;

    try {
      // Skip validation if disabled
      if (!this.config.enabled) {
        return {
          original: message,
          validated: message,
          validationResult: { isValid: true, errors: [] },
          processingTime: Date.now() - startTime
        };
      }

      // Sanitize inputs if enabled
      let processedMessage = message;
      if (this.config.sanitizeInputs && message) {
        const sanitized = this.validator.sanitizeInput(message);
        processedMessage = sanitized.sanitizedInput;
        
        if (sanitized.sanitizationApplied.length > 0) {
          console.error(`[ProtocolValidation] Applied sanitization: ${sanitized.sanitizationApplied.join(', ')}`);
        }
      }

      // Validate the message
      const validation = this.validator.validateMessage(processedMessage);
      
      if (validation.isValid) {
        this.validationStats.validMessages++;
        const processingTime = Date.now() - startTime;
        this.updateAverageValidationTime(processingTime);
        
        return {
          original: message,
          validated: processedMessage,
          validationResult: validation,
          processingTime
        };
      }

      // Handle validation failure
      this.validationStats.invalidMessages++;
      console.error('[ProtocolValidation] Message validation failed:', validation.errors);

      if (this.config.enableRecovery) {
        return await this.attemptRecovery(message, validation, startTime);
      } else if (this.config.strictMode) {
        throw new ProtocolError(
          `Message validation failed: ${validation.errors.join(', ')}`,
          'VALIDATION_ERROR',
          message
        );
      } else {
        // Lenient mode - log warnings but proceed
        console.error('[ProtocolValidation] Proceeding with invalid message (lenient mode)');
        const processingTime = Date.now() - startTime;
        this.updateAverageValidationTime(processingTime);
        
        return {
          original: message,
          validated: processedMessage,
          validationResult: validation,
          processingTime
        };
      }

    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error('[ProtocolValidation] Processing error:', error);
      
      if (error instanceof ProtocolError) {
        throw error;
      }
      
      throw new ProtocolError(
        `Protocol validation processing failed: ${error instanceof Error ? error.message : String(error)}`,
        'VALIDATION_ERROR',
        message
      );
    }
  }

  /**
   * Validates and processes tool calls specifically
   */
  async processToolCall(toolName: string, params: any): Promise<{ toolName: string; params: any }> {
    const toolCallMessage = {
      jsonrpc: '2.0',
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: params
      },
      id: Math.random().toString(36).substr(2, 9)
    };

    const validatedMessage = await this.processMessage(toolCallMessage);
    
    return {
      toolName: validatedMessage.validated.params.name,
      params: validatedMessage.validated.params.arguments
    };
  }

  /**
   * Validates response before sending
   */
  async processResponse(response: any): Promise<any> {
    const responseMessage = {
      jsonrpc: '2.0',
      id: response.id || Math.random().toString(36).substr(2, 9),
      result: response
    };

    const validatedMessage = await this.processMessage(responseMessage);
    return validatedMessage.validated.result;
  }

  /**
   * Validates error response
   */
  async processErrorResponse(error: Error, id?: string): Promise<any> {
    const errorResponse = {
      jsonrpc: '2.0',
      id: id || Math.random().toString(36).substr(2, 9),
      error: {
        code: -32603, // Internal error
        message: error.message,
        data: error.stack
      }
    };

    const validatedMessage = await this.processMessage(errorResponse);
    return validatedMessage.validated;
  }

  /**
   * Get validation statistics
   */
  getStats() {
    const successRate = this.validationStats.totalMessages > 0 
      ? (this.validationStats.validMessages / this.validationStats.totalMessages) * 100 
      : 100;

    return {
      ...this.validationStats,
      successRate: parseFloat(successRate.toFixed(2)),
      recoveryRate: this.validationStats.invalidMessages > 0 
        ? (this.validationStats.recoveredMessages / this.validationStats.invalidMessages) * 100 
        : 0
    };
  }

  /**
   * Reset validation statistics
   */
  resetStats() {
    this.validationStats = {
      totalMessages: 0,
      validMessages: 0,
      invalidMessages: 0,
      recoveredMessages: 0,
      averageValidationTime: 0
    };
    console.error('[ProtocolValidation] Statistics reset');
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<ProtocolValidationConfig>) {
    this.config = { ...this.config, ...newConfig };
    console.error('[ProtocolValidation] Configuration updated:', this.config);
  }

  // Private helper methods

  private async attemptRecovery(
    originalMessage: any, 
    validation: ValidationResult, 
    startTime: number
  ): Promise<ValidatedMessage> {
    let attempts = 0;
    let lastError: ProtocolError | null = null;

    while (attempts < this.config.maxRecoveryAttempts) {
      try {
        attempts++;
        console.error(`[ProtocolValidation] Recovery attempt ${attempts}/${this.config.maxRecoveryAttempts}`);

        const protocolError = new ProtocolError(
          `Validation failed: ${validation.errors.join(', ')}`,
          'VALIDATION_ERROR',
          originalMessage
        );

        const recoveryResult = await this.errorRecovery.handleProtocolError(protocolError);
        
        if (recoveryResult.recovered && recoveryResult.recoveredMessage) {
          // Validate the recovered message
          const revalidation = this.validator.validateMessage(recoveryResult.recoveredMessage);
          
          if (revalidation.isValid) {
            this.validationStats.recoveredMessages++;
            const processingTime = Date.now() - startTime;
            this.updateAverageValidationTime(processingTime);
            
            console.error('[ProtocolValidation] Message successfully recovered');
            return {
              original: originalMessage,
              validated: recoveryResult.recoveredMessage,
              validationResult: revalidation,
              processingTime
            };
          } else {
            console.error('[ProtocolValidation] Recovery produced invalid message, retrying...');
            validation = revalidation; // Update validation for next attempt
          }
        }
      } catch (error) {
        lastError = error instanceof ProtocolError ? error : new ProtocolError(
          `Recovery attempt failed: ${error instanceof Error ? error.message : String(error)}`,
          'VALIDATION_ERROR',
          originalMessage
        );
        console.error(`[ProtocolValidation] Recovery attempt ${attempts} failed:`, lastError.message);
      }
    }

    // All recovery attempts failed
    const finalError = lastError || new ProtocolError(
      `All ${this.config.maxRecoveryAttempts} recovery attempts failed. Last errors: ${validation.errors.join(', ')}`,
      'VALIDATION_ERROR',
      originalMessage
    );

    if (this.config.strictMode) {
      throw finalError;
    } else {
      // Return the original message with validation errors in lenient mode
      console.error('[ProtocolValidation] Recovery failed, proceeding with original message (lenient mode)');
      const processingTime = Date.now() - startTime;
      this.updateAverageValidationTime(processingTime);
      
      return {
        original: originalMessage,
        validated: originalMessage,
        validationResult: validation,
        processingTime
      };
    }
  }

  private updateAverageValidationTime(newTime: number) {
    const totalValidated = this.validationStats.validMessages + this.validationStats.recoveredMessages;
    if (totalValidated === 1) {
      this.validationStats.averageValidationTime = newTime;
    } else {
      this.validationStats.averageValidationTime = 
        (this.validationStats.averageValidationTime * (totalValidated - 1) + newTime) / totalValidated;
    }
  }
}