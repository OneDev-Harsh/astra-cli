/**
 * Retry Configuration Module
 *
 * Provides configurable retry policies with exponential backoff,
 * jitter, and error classification for resilient execution.
 */

/**
 * Error classification for determining retry behavior
 */
export enum ErrorCategory {
    /** Transient errors that are likely to succeed on retry */
    TRANSIENT = 'transient',
    /** Permanent errors that will never succeed */
    PERMANENT = 'permanent',
    /** Rate limiting errors - need longer backoff */
    RATE_LIMIT = 'rate_limit',
    /** Network connectivity issues */
    NETWORK = 'network',
    /** Authentication/authorization failures */
    AUTH = 'auth',
    /** Timeout errors */
    TIMEOUT = 'timeout',
    /** Unknown errors - treat as transient by default */
    UNKNOWN = 'unknown',
}

/**
 * Classified error with metadata for retry decisions
 */
export interface ClassifiedError {
    originalError: Error;
    category: ErrorCategory;
    message: string;
    statusCode?: number;
    isRetryable: boolean;
    suggestedDelayMs: number;
}

/**
 * Retry configuration options
 */
export interface RetryConfig {
    /** Maximum number of retry attempts (0 = no retries) */
    maxRetries: number;
    /** Base delay in ms before first retry */
    baseDelayMs: number;
    /** Maximum delay in ms between retries */
    maxDelayMs: number;
    /** Exponential backoff multiplier */
    backoffMultiplier: number;
    /** Add random jitter to prevent thundering herd */
    jitter: boolean;
    /** Maximum jitter in ms */
    maxJitterMs: number;
    /** Timeout for individual attempts in ms */
    attemptTimeoutMs?: number;
    /** Custom error classifier */
    errorClassifier?: (error: Error) => ErrorCategory;
    /** Callback invoked before each retry */
    onRetry?: (attempt: number, error: ClassifiedError, delayMs: number) => void | Promise<void>;
    /** Callback invoked when all retries are exhausted */
    onExhausted?: (error: ClassifiedError, totalAttempts: number) => void | Promise<void>;
}

/**
 * Retry execution statistics
 */
export interface RetryStats {
    totalAttempts: number;
    totalRetries: number;
    totalDelayMs: number;
    errors: ClassifiedError[];
    succeeded: boolean;
    finalAttemptNumber: number;
}

/**
 * Result of a retryable operation
 */
export interface RetryResult<T> {
    result: T;
    stats: RetryStats;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
    maxRetries: 3,
    baseDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
    jitter: true,
    maxJitterMs: 1000,
};

/**
 * Aggressive retry configuration for critical operations
 */
export const AGGRESSIVE_RETRY_CONFIG: RetryConfig = {
    maxRetries: 5,
    baseDelayMs: 500,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    jitter: true,
    maxJitterMs: 2000,
};

/**
 * Conservative retry configuration for sensitive operations
 */
export const CONSERVATIVE_RETRY_CONFIG: RetryConfig = {
    maxRetries: 2,
    baseDelayMs: 2000,
    maxDelayMs: 10000,
    backoffMultiplier: 3,
    jitter: false,
    maxJitterMs: 500,
};

/**
 * No retry configuration
 */
export const NO_RETRY_CONFIG: RetryConfig = {
    maxRetries: 0,
    baseDelayMs: 0,
    maxDelayMs: 0,
    backoffMultiplier: 1,
    jitter: false,
    maxJitterMs: 0,
};

/**
 * Merge user config with defaults
 */
export function mergeRetryConfig(userConfig: Partial<RetryConfig>): RetryConfig {
    return {
        ...DEFAULT_RETRY_CONFIG,
        ...userConfig,
    };
}
