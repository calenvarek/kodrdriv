/**
 * Runtime validation utilities for safe type handling
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
 * Safely parses JSON with error handling
 */
export const safeJsonParse = <T = any>(jsonString: string, context?: string): T => {
    try {
        const parsed = JSON.parse(jsonString);
        if (parsed === null || parsed === undefined) {
            throw new Error('Parsed JSON is null or undefined');
        }
        return parsed;
    } catch (error) {
        const contextStr = context ? ` (${context})` : '';
        throw new Error(`Failed to parse JSON${contextStr}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

/**
 * Validates that a value is a non-empty string
 */
export const validateString = (value: any, fieldName: string): string => {
    if (typeof value !== 'string') {
        throw new Error(`${fieldName} must be a string, got ${typeof value}`);
    }
    if (value.trim() === '') {
        throw new Error(`${fieldName} cannot be empty`);
    }
    return value;
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

/**
 * Validates that a value exists and has a specific property
 */
export const validateHasProperty = (obj: any, property: string, context?: string): void => {
    if (!obj || typeof obj !== 'object') {
        const contextStr = context ? ` in ${context}` : '';
        throw new Error(`Object is null or not an object${contextStr}`);
    }
    if (!(property in obj)) {
        const contextStr = context ? ` in ${context}` : '';
        throw new Error(`Missing required property '${property}'${contextStr}`);
    }
};

/**
 * Validates package.json structure has basic required fields
 */
export const validatePackageJson = (data: any, context?: string, requireName: boolean = true): any => {
    if (!data || typeof data !== 'object') {
        const contextStr = context ? ` (${context})` : '';
        throw new Error(`Invalid package.json${contextStr}: not an object`);
    }
    if (requireName && typeof data.name !== 'string') {
        const contextStr = context ? ` (${context})` : '';
        throw new Error(`Invalid package.json${contextStr}: name must be a string`);
    }
    return data;
};
