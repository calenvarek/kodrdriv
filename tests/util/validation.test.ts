import { describe, it, expect } from 'vitest';
import {
    validateReleaseSummary,
    validateTranscriptionResult,
    ReleaseSummary,
    TranscriptionResult,
    sanitizeDirection
} from '../../src/util/validation';

// Import generic validation functions from git-tools for tests
import {
    safeJsonParse,
    validateString,
    validateHasProperty,
    validatePackageJson
} from '@eldrforge/git-tools';

// Note: Generic validation functions (safeJsonParse, validateString, validateHasProperty, validatePackageJson)
// have been moved to @eldrforge/git-tools and their tests are now in that package

describe('Validation utilities', () => {
    describe('validateReleaseSummary', () => {
        it('should validate a correct ReleaseSummary object', () => {
            const validSummary = {
                title: 'Release v1.0.0',
                body: 'New features and bug fixes'
            };

            const result = validateReleaseSummary(validSummary);
            expect(result).toEqual(validSummary);
        });

        it('should throw error for missing title', () => {
            const invalidSummary = {
                body: 'Some body text'
            };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: title must be a string');
        });

        it('should throw error for missing body', () => {
            const invalidSummary = {
                title: 'Some title'
            };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: body must be a string');
        });

        it('should throw error for non-string title', () => {
            const invalidSummary = {
                title: 123,
                body: 'Some body text'
            };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: title must be a string');
        });

        it('should throw error for non-string body', () => {
            const invalidSummary = {
                title: 'Some title',
                body: null
            };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: body must be a string');
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validateReleaseSummary(null)).toThrow('Invalid release summary: not an object');
            expect(() => validateReleaseSummary(undefined)).toThrow('Invalid release summary: not an object');
        });

        it('should throw error for non-object input', () => {
            expect(() => validateReleaseSummary('string')).toThrow('Invalid release summary: not an object');
            expect(() => validateReleaseSummary(123)).toThrow('Invalid release summary: not an object');
        });
    });

    describe('validateTranscriptionResult', () => {
        it('should validate a correct TranscriptionResult object', () => {
            const validResult = {
                text: 'This is the transcribed text',
                confidence: 0.95,
                language: 'en'
            };

            const result = validateTranscriptionResult(validResult);
            expect(result).toEqual(validResult);
        });

        it('should validate minimal TranscriptionResult with just text', () => {
            const validResult = {
                text: 'Minimal transcription'
            };

            const result = validateTranscriptionResult(validResult);
            expect(result).toEqual(validResult);
        });

        it('should throw error for missing text property', () => {
            const invalidResult = {
                confidence: 0.95
            };
            expect(() => validateTranscriptionResult(invalidResult)).toThrow('Invalid transcription result: text property must be a string');
        });

        it('should throw error for non-string text', () => {
            const invalidResult = {
                text: 123
            };
            expect(() => validateTranscriptionResult(invalidResult)).toThrow('Invalid transcription result: text property must be a string');
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validateTranscriptionResult(null)).toThrow('Invalid transcription result: not an object');
            expect(() => validateTranscriptionResult(undefined)).toThrow('Invalid transcription result: not an object');
        });

        it('should throw error for non-object input', () => {
            expect(() => validateTranscriptionResult('string')).toThrow('Invalid transcription result: not an object');
            expect(() => validateTranscriptionResult(123)).toThrow('Invalid transcription result: not an object');
        });
    });
});

describe('sanitizeDirection', () => {
    it('should return undefined for empty input', () => {
        expect(sanitizeDirection(undefined)).toBeUndefined();
        expect(sanitizeDirection('')).toBeUndefined();
        expect(sanitizeDirection('   ')).toBe(''); // Empty string after trimming
    });

    it('should sanitize newlines and excessive whitespace', () => {
        const input = 'This is a\ntest direction\nwith multiple\nlines';
        const expected = 'This is a test direction with multiple lines';
        expect(sanitizeDirection(input)).toBe(expected);
    });

    it('should handle multiple whitespace characters', () => {
        const input = 'This   has   multiple   spaces';
        const expected = 'This has multiple spaces';
        expect(sanitizeDirection(input)).toBe(expected);
    });

    it('should truncate long directions', () => {
        const longDirection = 'A'.repeat(2001); // 2001 characters
        const result = sanitizeDirection(longDirection, 2000);
        expect(result).toHaveLength(2000);
        expect(result?.endsWith('...')).toBe(true);
    });

    it('should not truncate directions within limit', () => {
        const shortDirection = 'Short direction';
        const result = sanitizeDirection(shortDirection, 2000);
        expect(result).toBe(shortDirection);
    });

    it('should handle mixed whitespace and newlines', () => {
        const input = '  This   has\n  mixed   \n  whitespace  ';
        const expected = 'This has mixed whitespace';
        expect(sanitizeDirection(input)).toBe(expected);
    });
});
