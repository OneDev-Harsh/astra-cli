/**
 * Automatic Retry Module for AI Calls
 *
 * Provides seamless integration of retry logic with the existing
 * AI provider calls, replacing the manual retry prompt with
 * automatic retry capability.
 */

import chalk from 'chalk';
import { withRetry, RetryPresets } from '../core/retry';
import type { RetryConfig } from '../core/retry';

/**
 * Configuration for AI call retries
 */
export interface AiRetryConfig {
    /** Enable automatic retry (default: true) */
    enabled: boolean;
    /** Retry configuration */
    retryConfig: Partial<RetryConfig>;
    /** Show retry progress to user */
    showProgress: boolean;
    /** Ask user before retrying (fallback to manual mode) */
    askBeforeRetry: boolean;
}

/**
 * Default AI retry configuration
 */
export const DEFAULT_AI_RETRY_CONFIG: AiRetryConfig = {
    enabled: true,
    retryConfig: RetryPresets.aiCall,
    showProgress: true,
    askBeforeRetry: false,
};

/**
 * Execute an AI call with automatic retry
 */
export async function withAiRetry<T>(
    operation: () => Promise<T>,
    context: string,
    config: Partial<AiRetryConfig> = {},
): Promise<T> {
    const fullConfig = {
        ...DEFAULT_AI_RETRY_CONFIG,
        ...config,
        retryConfig: {
            ...DEFAULT_AI_RETRY_CONFIG.retryConfig,
            ...config.retryConfig,
        },
    };

    if (!fullConfig.enabled) {
        return operation();
    }

    const { showProgress } = fullConfig;

    try {
        const { result, stats } = await withRetry(
            operation,
            {
                ...fullConfig.retryConfig,
                onRetry: (attempt, error, delayMs) => {
                    if (showProgress) {
                        console.log(
                            chalk.yellow(`\n  ⚠ Retry ${attempt}/${fullConfig.retryConfig.maxRetries} after ${error.category} error`)
                        );
                        console.log(chalk.dim(`    Waiting ${Math.round(delayMs / 1000)}s before retry...`));
                    }
                },
                onExhausted: (error, totalAttempts) => {
                    if (showProgress) {
                        console.log(
                            chalk.red(`\n  ✗ All ${totalAttempts} attempts failed (${error.category})`)
                        );
                    }
                },
            },
        );

        if (showProgress && stats.totalRetries > 0) {
            console.log(
                chalk.green(`  ✓ Succeeded after ${stats.totalAttempts} attempt(s)`)
            );
        }

        return result;
    } catch (error) {
        // If automatic retry is enabled but failed, optionally fall back to manual retry
        if (fullConfig.askBeforeRetry) {
            const { promptToRetryAiCall } = await import('./retry-prompt');
            const shouldRetry = await promptToRetryAiCall(context, error);
            if (shouldRetry) {
                return withAiRetry(operation, context, {
                    ...config,
                    askBeforeRetry: false, // Prevent infinite loop
                });
            }
        }
        throw error;
    }
}

/**
 * Create a retryable version of an AI call function
 */
export function createRetryableAiCall<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    context: string,
    config: Partial<AiRetryConfig> = {},
): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
        return withAiRetry(() => fn(...args), context, config);
    };
}
