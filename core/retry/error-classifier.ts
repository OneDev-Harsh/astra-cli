/**
 * Error Classification Module
 *
 * Analyzes errors to determine if they are retryable and
 * suggests appropriate retry delays.
 */

import { ErrorCategory, type ClassifiedError } from './retry-config';

/**
 * HTTP status codes that indicate rate limiting
 */
const RATE_LIMIT_STATUS_CODES = [429, 503];

/**
 * HTTP status codes that indicate server errors (potentially transient)
 */
const SERVER_ERROR_STATUS_CODES = [500, 502, 504];

/**
 * HTTP status codes that indicate authentication failures
 */
const AUTH_STATUS_CODES = [401, 403];

/**
 * Network error codes that indicate connectivity issues
 */
const NETWORK_ERROR_CODES = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ENETUNREACH',
    'EHOSTUNREACH',
    'EPIPE',
    'ECONNABORTED',
];

/**
 * Error message patterns that indicate specific error categories
 */
const ERROR_PATTERNS: { pattern: RegExp; category: ErrorCategory }[] = [
    // Rate limiting
    { pattern: /rate\s*limit/i, category: ErrorCategory.RATE_LIMIT },
    { pattern: /too\s*many\s*requests/i, category: ErrorCategory.RATE_LIMIT },
    { pattern: /throttl/i, category: ErrorCategory.RATE_LIMIT },
    { pattern: /quota\s*exceeded/i, category: ErrorCategory.RATE_LIMIT },

    // Network errors
    { pattern: /network\s*error/i, category: ErrorCategory.NETWORK },
    { pattern: /connection\s*refused/i, category: ErrorCategory.NETWORK },
    { pattern: /connection\s*reset/i, category: ErrorCategory.NETWORK },
    { pattern: /dns\s*error/i, category: ErrorCategory.NETWORK },
    { pattern: /socket\s*hang\s*up/i, category: ErrorCategory.NETWORK },

    // Timeout errors
    { pattern: /timeout/i, category: ErrorCategory.TIMEOUT },
    { pattern: /timed?\s*out/i, category: ErrorCategory.TIMEOUT },
    { pattern: /deadline\s*exceeded/i, category: ErrorCategory.TIMEOUT },

    // Authentication errors
    { pattern: /unauthorized/i, category: ErrorCategory.AUTH },
    { pattern: /forbidden/i, category: ErrorCategory.AUTH },
    { pattern: /invalid\s*api\s*key/i, category: ErrorCategory.AUTH },
    { pattern: /authentication\s*failed/i, category: ErrorCategory.AUTH },
    { pattern: /api\s*key\s*invalid/i, category: ErrorCategory.AUTH },

    // Permanent errors
    { pattern: /not\s*found/i, category: ErrorCategory.PERMANENT },
    { pattern: /invalid\s*request/i, category: ErrorCategory.PERMANENT },
    { pattern: /bad\s*request/i, category: ErrorCategory.PERMANENT },
    { pattern: /malformed/i, category: ErrorCategory.PERMANENT },
    { pattern: /unsupported/i, category: ErrorCategory.PERMANENT },
];

/**
 * Extract status code from various error formats
 */
function extractStatusCode(error: Error): number | undefined {
    // Direct status code property
    if ('status' in error && typeof error.status === 'number') {
        return error.status;
    }
    if ('statusCode' in error && typeof error.statusCode === 'number') {
        return error.statusCode;
    }

    // Extract from error message
    const statusMatch = error.message.match(/\b(\d{3})\b/);
    if (statusMatch) {
        return parseInt(statusMatch[1]!, 10);
    }

    return undefined;
}

/**
 * Extract error code from various error formats
 */
function extractErrorCode(error: Error): string | undefined {
    if ('code' in error && typeof error.code === 'string') {
        return error.code;
    }
    return undefined;
}

/**
 * Determine if an error category is retryable
 */
function isRetryableCategory(category: ErrorCategory): boolean {
    switch (category) {
        case ErrorCategory.TRANSIENT:
        case ErrorCategory.RATE_LIMIT:
        case ErrorCategory.NETWORK:
        case ErrorCategory.TIMEOUT:
        case ErrorCategory.UNKNOWN:
            return true;
        case ErrorCategory.PERMANENT:
        case ErrorCategory.AUTH:
            return false;
    }
}

/**
 * Get suggested delay for an error category
 */
function getSuggestedDelay(category: ErrorCategory): number {
    switch (category) {
        case ErrorCategory.RATE_LIMIT:
            return 5000; // 5 seconds for rate limits
        case ErrorCategory.NETWORK:
            return 2000; // 2 seconds for network issues
        case ErrorCategory.TIMEOUT:
            return 3000; // 3 seconds for timeouts
        case ErrorCategory.TRANSIENT:
        case ErrorCategory.UNKNOWN:
            return 1000; // 1 second for transient/unknown
        case ErrorCategory.PERMANENT:
        case ErrorCategory.AUTH:
            return 0; // No delay for permanent errors
    }
}

/**
 * Classify an error to determine retry behavior
 */
export function classifyError(error: Error): ClassifiedError {
    const message = error.message || 'Unknown error';
    const statusCode = extractStatusCode(error);
    const errorCode = extractErrorCode(error);

    let category: ErrorCategory = ErrorCategory.UNKNOWN;

    // Check HTTP status codes first
    if (statusCode) {
        if (RATE_LIMIT_STATUS_CODES.includes(statusCode)) {
            category = ErrorCategory.RATE_LIMIT;
        } else if (AUTH_STATUS_CODES.includes(statusCode)) {
            category = ErrorCategory.AUTH;
        } else if (SERVER_ERROR_STATUS_CODES.includes(statusCode)) {
            category = ErrorCategory.TRANSIENT;
        } else if (statusCode >= 400 && statusCode < 500) {
            category = ErrorCategory.PERMANENT;
        }
    }

    // Check error codes
    if (errorCode && NETWORK_ERROR_CODES.includes(errorCode)) {
        category = ErrorCategory.NETWORK;
    }

    // Check error message patterns (if not already classified)
    if (category === ErrorCategory.UNKNOWN) {
        for (const { pattern, category: cat } of ERROR_PATTERNS) {
            if (pattern.test(message)) {
                category = cat;
                break;
            }
        }
    }

    const isRetryable = isRetryableCategory(category);
    const suggestedDelayMs = getSuggestedDelay(category);

    return {
        originalError: error,
        category,
        message,
        statusCode,
        isRetryable,
        suggestedDelayMs,
    };
}

/**
 * Check if an error is retryable
 */
export function isRetryable(error: Error): boolean {
    return classifyError(error).isRetryable;
}

/**
 * Get retry delay for an error
 */
export function getRetryDelay(error: Error): number {
    return classifyError(error).suggestedDelayMs;
}
