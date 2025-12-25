/**
 * Kodrdriv-specific validation utilities
 *
 * Note: Generic validation functions (validateString, validateNumber, etc.)
 * are in @eldrforge/shared
 */

export interface ReleaseSummary {
    title: string;
    body: string;
}

export interface TranscriptionResult {
    text: string;
    [key: string]: any;
}

/**
 * Validates and safely casts data to ReleaseSummary type
 */
export const validateReleaseSummary = (data: any): ReleaseSummary => {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid release summary: not an object');
    }
    if (typeof data.title !== 'string') {
        throw new Error('Invalid release summary: title must be a string');
    }
    if (typeof data.body !== 'string') {
        throw new Error('Invalid release summary: body must be a string');
    }
    return data as ReleaseSummary;
};

/**
 * Validates transcription result has required text property
 */
export const validateTranscriptionResult = (data: any): TranscriptionResult => {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid transcription result: not an object');
    }
    if (typeof data.text !== 'string') {
        throw new Error('Invalid transcription result: text property must be a string');
    }
    return data as TranscriptionResult;
};

/**
 * Sanitizes and truncates direction parameter for safe use in prompts
 * @param direction The direction string to sanitize
 * @param maxLength Maximum length before truncation (default: 2000)
 * @returns Sanitized and truncated direction string
 */
export const sanitizeDirection = (direction: string | undefined, maxLength: number = 2000): string | undefined => {
    if (!direction) {
        return undefined;
    }

    // Remove newlines and excessive whitespace to prevent template breakage
    const sanitized = direction
        .replace(/\r?\n/g, ' ') // Replace newlines with spaces
        .replace(/\s+/g, ' ')   // Replace multiple whitespace with single space
        .trim();

    // Truncate if too long
    if (sanitized.length > maxLength) {
        const truncated = sanitized.substring(0, maxLength - 3) + '...';
        // Log truncation for debugging
        // eslint-disable-next-line no-console
        console.warn(`Direction truncated from ${sanitized.length} to ${truncated.length} characters`);
        return truncated;
    }

    return sanitized;
};

