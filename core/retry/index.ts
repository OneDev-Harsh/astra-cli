/**
 * Retry Module Public API
 */

export {
    ErrorCategory,
    type ClassifiedError,
    type RetryConfig,
    type RetryStats,
    type RetryResult,
    DEFAULT_RETRY_CONFIG,
    AGGRESSIVE_RETRY_CONFIG,
    CONSERVATIVE_RETRY_CONFIG,
    NO_RETRY_CONFIG,
    mergeRetryConfig,
} from './retry-config';

export {
    classifyError,
    isRetryable,
    getRetryDelay,
} from './error-classifier';

export {
    withRetry,
    withRetryOrNull,
    createRetryWrapper,
    RetryPresets,
} from './retry-engine';
