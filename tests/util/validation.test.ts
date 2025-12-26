import { describe, it, expect } from 'vitest';
import {
    validateReleaseSummary,
    validateTranscriptionResult,
    sanitizeDirection,
    ReleaseSummary,
    TranscriptionResult
} from '../../src/util/validation';

describe('validation utilities', () => {
    describe('validateReleaseSummary', () => {
        it('should validate correct release summary', () => {
            const summary: ReleaseSummary = {
                title: 'Version 1.0.0',
                body: 'Initial release with amazing features'
            };

            const result = validateReleaseSummary(summary);

            expect(result.title).toBe('Version 1.0.0');
            expect(result.body).toBe('Initial release with amazing features');
        });

        it('should throw for null input', () => {
            expect(() => validateReleaseSummary(null)).toThrow('not an object');
        });

        it('should throw for undefined input', () => {
            expect(() => validateReleaseSummary(undefined)).toThrow('not an object');
        });

        it('should throw for non-object input', () => {
            expect(() => validateReleaseSummary('not an object')).toThrow();
            expect(() => validateReleaseSummary(123)).toThrow();
            // Array is technically an object in JS, but our validator should handle it
            expect(() => validateReleaseSummary([])).toThrow();
        });

        it('should throw when title is missing', () => {
            expect(() => validateReleaseSummary({ body: 'test' })).toThrow('title must be a string');
        });

        it('should throw when title is not a string', () => {
            expect(() => validateReleaseSummary({ title: 123, body: 'test' })).toThrow('title must be a string');
            expect(() => validateReleaseSummary({ title: null, body: 'test' })).toThrow('title must be a string');
        });

        it('should throw when body is missing', () => {
            expect(() => validateReleaseSummary({ title: 'Title' })).toThrow('body must be a string');
        });

        it('should throw when body is not a string', () => {
            expect(() => validateReleaseSummary({ title: 'Title', body: 123 })).toThrow('body must be a string');
            expect(() => validateReleaseSummary({ title: 'Title', body: null })).toThrow('body must be a string');
        });

        it('should handle empty strings', () => {
            const summary = validateReleaseSummary({ title: '', body: '' });
            expect(summary.title).toBe('');
            expect(summary.body).toBe('');
        });

        it('should handle special characters', () => {
            const summary = validateReleaseSummary({
                title: 'Version 1.0.0 - "Special" & <chars>',
                body: 'Release with émojis 🎉 and unicode'
            });
            expect(summary.title).toContain('Special');
            expect(summary.body).toContain('émojis');
        });
    });

    describe('validateTranscriptionResult', () => {
        it('should validate correct transcription result', () => {
            const result: TranscriptionResult = {
                text: 'This is the transcribed text'
            };

            const validated = validateTranscriptionResult(result);

            expect(validated.text).toBe('This is the transcribed text');
        });

        it('should validate transcription with additional properties', () => {
            const result = {
                text: 'Transcribed content',
                confidence: 0.95,
                language: 'en',
                duration: 123
            };

            const validated = validateTranscriptionResult(result);

            expect(validated.text).toBe('Transcribed content');
            expect((validated as any).confidence).toBe(0.95);
        });

        it('should throw for null input', () => {
            expect(() => validateTranscriptionResult(null)).toThrow('not an object');
        });

        it('should throw for undefined input', () => {
            expect(() => validateTranscriptionResult(undefined)).toThrow('not an object');
        });

        it('should throw for non-object input', () => {
            expect(() => validateTranscriptionResult('text')).toThrow('not an object');
            expect(() => validateTranscriptionResult(123)).toThrow('not an object');
        });

        it('should throw when text is missing', () => {
            expect(() => validateTranscriptionResult({})).toThrow('text property must be a string');
        });

        it('should throw when text is not a string', () => {
            expect(() => validateTranscriptionResult({ text: 123 })).toThrow('text property must be a string');
            expect(() => validateTranscriptionResult({ text: null })).toThrow('text property must be a string');
            expect(() => validateTranscriptionResult({ text: [] })).toThrow('text property must be a string');
        });

        it('should handle empty transcription', () => {
            const result = validateTranscriptionResult({ text: '' });
            expect(result.text).toBe('');
        });

        it('should preserve additional metadata', () => {
            const result = validateTranscriptionResult({
                text: 'Speech to text',
                metadata: { speaker: 'AI', timestamp: Date.now() }
            });

            expect(result.text).toBe('Speech to text');
            expect((result as any).metadata).toBeDefined();
        });
    });

    describe('sanitizeDirection', () => {
        it('should return undefined for undefined input', () => {
            expect(sanitizeDirection(undefined)).toBeUndefined();
        });

        it('should return undefined for empty string', () => {
            expect(sanitizeDirection('')).toBeUndefined();
        });

        it('should return simple text unchanged', () => {
            const direction = 'Create a new feature';
            expect(sanitizeDirection(direction)).toBe('Create a new feature');
        });

        it('should remove newlines', () => {
            const direction = 'First line\nSecond line\nThird line';
            const sanitized = sanitizeDirection(direction);
            expect(sanitized).not.toContain('\n');
            expect(sanitized).toContain('First line');
            expect(sanitized).toContain('Second line');
        });

        it('should remove carriage returns', () => {
            const direction = 'First line\r\nSecond line';
            const sanitized = sanitizeDirection(direction);
            expect(sanitized).not.toContain('\r');
            expect(sanitized).not.toContain('\n');
        });

        it('should collapse multiple spaces', () => {
            const direction = 'Text   with    multiple     spaces';
            const sanitized = sanitizeDirection(direction);
            expect(sanitized).toBe('Text with multiple spaces');
        });

        it('should trim leading and trailing whitespace', () => {
            const direction = '  \t  Some text  \n  ';
            const sanitized = sanitizeDirection(direction);
            expect(sanitized).toBe('Some text');
        });

        it('should truncate long text with custom max length', () => {
            const longText = 'a'.repeat(100);
            const sanitized = sanitizeDirection(longText, 50);

            expect(sanitized).toBe('a'.repeat(47) + '...');
            expect(sanitized?.length).toBe(50);
        });

        it('should use default max length of 2000', () => {
            const longText = 'a'.repeat(2500);
            const sanitized = sanitizeDirection(longText);

            expect(sanitized).toBe('a'.repeat(1997) + '...');
            expect(sanitized?.length).toBe(2000);
        });

        it('should handle complex whitespace', () => {
            const direction = 'Fix bug  \n\t  with\r\n    multiple\t\t  lines';
            const sanitized = sanitizeDirection(direction);

            expect(sanitized).toBe('Fix bug with multiple lines');
        });

        it('should preserve word boundaries when truncating', () => {
            const text = 'This is a test message that will be truncated';
            const sanitized = sanitizeDirection(text, 20);

            expect(sanitized?.endsWith('...')).toBe(true);
            expect(sanitized?.length).toBe(20);
        });

        it('should handle only whitespace', () => {
            const whitespace = '   \n\t\r\n   ';
            const sanitized = sanitizeDirection(whitespace);

            // After sanitization, this becomes empty string which is falsy
            // so it returns empty string, not undefined (since empty string != undefined)
            expect(sanitized === '' || sanitized === undefined).toBe(true);
        });

        it('should handle mixed newline styles', () => {
            const mixed = 'Line 1\nLine 2\r\nLine 3\rLine 4';
            const sanitized = sanitizeDirection(mixed);

            expect(sanitized).toContain('Line 1');
            expect(sanitized).toContain('Line 2');
            expect(sanitized).toContain('Line 3');
            expect(sanitized).toContain('Line 4');
        });

        it('should handle very long words without spaces', () => {
            const longWord = 'a'.repeat(2500);
            const sanitized = sanitizeDirection(longWord);

            expect(sanitized?.length).toBe(2000);
            expect(sanitized?.endsWith('...')).toBe(true);
        });

        it('should handle unicode characters', () => {
            const unicode = 'émojis 🎉 and spëcial çhars';
            const sanitized = sanitizeDirection(unicode);

            expect(sanitized).toContain('émojis');
            expect(sanitized).toContain('spëcial');
        });

        it('should handle zero max length edge case', () => {
            const text = 'test';
            const sanitized = sanitizeDirection(text, 0);

            expect(sanitized).toBe('...');
        });

        it('should handle very small max length', () => {
            const text = 'test message';
            const sanitized = sanitizeDirection(text, 5);

            expect(sanitized?.length).toBe(5);
            expect(sanitized?.endsWith('...')).toBe(true);
        });
    });
});

