/**
 * Retry Engine Module
 *
 * Core retry execution logic with exponential backoff, jitter,
 * and comprehensive error handling.
 */

import {
    type RetryConfig,
    type RetryStats,
    type RetryResult,
    type ClassifiedError,
    DEFAULT_RETRY_CONFIG,
    mergeRetryConfig,
} from './retry-config';
import { classifyError } from './error-classifier';
import { logAndContinue } from '../logger';

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay for a retry attempt using exponential backoff
 */
function calculateDelay(
    attempt: number,
    baseDelayMs: number,
    maxDelayMs: number,
    backoffMultiplier: number,
    jitter: boolean,
    maxJitterMs: number,
    classifiedError: ClassifiedError,
): number {
    // Use suggested delay from error classification as base
    const errorDelay = classifiedError.suggestedDelayMs;
    const effectiveBase = Math.max(baseDelayMs, errorDelay);

    // Calculate exponential backoff
    const backoffDelay = effectiveBase * Math.pow(backoffMultiplier, attempt - 1);

    // Cap at max delay
    let delay = Math.min(backoffDelay, maxDelayMs);

    // Add jitter if enabled
    if (jitter && maxJitterMs > 0) {
        const jitterAmount = Math.random() * maxJitterMs;
        delay += jitterAmount;
    }

    return Math.round(delay);
}

/**
 * Execute an operation with automatic retry on failure
 */
export async function withRetry<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
): Promise<RetryResult<T>> {
    const fullConfig = mergeRetryConfig(config);
    const stats: RetryStats = {
        totalAttempts: 0,
        totalRetries: 0,
        totalDelayMs: 0,
        errors: [],
        succeeded: false,
        finalAttemptNumber: 0,
    };

    let lastError: ClassifiedError | null = null;

    for (let attempt = 1; attempt <= fullConfig.maxRetries + 1; attempt++) {
        stats.totalAttempts++;
        stats.finalAttemptNumber = attempt;

        try {
            // Execute the operation with optional timeout
            let result: T;

            if (fullConfig.attemptTimeoutMs) {
                result = await Promise.race([
                    operation(),
                    new Promise<never>((_, reject) => {
                        setTimeout(() => {
                            reject(new Error(`Operation timed out after ${fullConfig.attemptTimeoutMs}ms`));
                        }, fullConfig.attemptTimeoutMs);
                    }),
                ]);
            } else {
                result = await operation();
            }

            // Success!
            stats.succeeded = true;
            return { result, stats };

        } catch (error) {
            const classifiedError = classifyError(error instanceof Error ? error : new Error(String(error)));
            lastError = classifiedError;
            stats.errors.push(classifiedError);

            // Log every classified error to the central log file
            logAndContinue("retry-engine", classifiedError.originalError, {
                category: classifiedError.category,
                attempt,
                isRetryable: classifiedError.isRetryable,
                statusCode: classifiedError.statusCode,
            });

            // Check if we should retry
            const isLastAttempt = attempt > fullConfig.maxRetries;

            if (!classifiedError.isRetryable || isLastAttempt) {
                // Don't retry permanent errors or if we've exhausted retries
                if (isLastAttempt && fullConfig.onExhausted) {
                    await fullConfig.onExhausted(classifiedError, stats.totalAttempts);
                }
                throw classifiedError.originalError;
            }

            // Calculate delay before next retry
            const delayMs = calculateDelay(
                attempt,
                fullConfig.baseDelayMs,
                fullConfig.maxDelayMs,
                fullConfig.backoffMultiplier,
                fullConfig.jitter,
                fullConfig.maxJitterMs,
                classifiedError,
            );

            stats.totalRetries++;
            stats.totalDelayMs += delayMs;

            // Call onRetry callback if provided
            if (fullConfig.onRetry) {
                await fullConfig.onRetry(attempt, classifiedError, delayMs);
            }

            // Wait before retrying
            await sleep(delayMs);
        }
    }

    // This should never be reached, but just in case
    throw lastError?.originalError || new Error('Retry exhausted');
}

/**
 * Execute an operation with retry, returning the result or null on failure
 */
export async function withRetryOrNull<T>(
    operation: () => Promise<T>,
    config: Partial<RetryConfig> = {},
): Promise<T | null> {
    try {
        const { result } = await withRetry(operation, config);
        return result;
    } catch {
        return null;
    }
}

/**
 * Create a retry wrapper for a function
 */
export function createRetryWrapper<TArgs extends unknown[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    config: Partial<RetryConfig> = {},
): (...args: TArgs) => Promise<TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
        const { result } = await withRetry(() => fn(...args), config);
        return result;
    };
}

/**
 * Retry configuration presets for common scenarios
 */
export const RetryPresets = {
    /** For AI API calls - moderate retries with backoff */
    aiCall: {
        maxRetries: 3,
        baseDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        jitter: true,
        maxJitterMs: 1000,
    },

    /** For tool execution - fewer retries, shorter delays */
    toolExecution: {
        maxRetries: 2,
        baseDelayMs: 500,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitter: false,
        maxJitterMs: 0,
    },

    /** For network operations - more retries, longer delays */
    network: {
        maxRetries: 5,
        baseDelayMs: 2000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitter: true,
        maxJitterMs: 2000,
    },

    /** For critical operations - aggressive retries */
    critical: {
        maxRetries: 5,
        baseDelayMs: 1000,
        maxDelayMs: 60000,
        backoffMultiplier: 2,
        jitter: true,
        maxJitterMs: 1500,
    },
} as const;
