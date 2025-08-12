import { describe, it, expect } from 'vitest';
import {
    validateReleaseSummary,
    validateTranscriptionResult,
    safeJsonParse,
    validateString,
    validateHasProperty,
    validatePackageJson,
    ReleaseSummary,
    TranscriptionResult
} from '../../src/util/validation';

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

    describe('safeJsonParse', () => {
        it('should parse valid JSON string', () => {
            const jsonString = '{"name": "test", "value": 123}';
            const result = safeJsonParse(jsonString, 'test context');
            expect(result).toEqual({ name: 'test', value: 123 });
        });

        it('should throw error for invalid JSON with context', () => {
            const invalidJson = '{"invalid": json}';
            expect(() => safeJsonParse(invalidJson, 'test file')).toThrow('Failed to parse JSON (test file):');
        });

        it('should throw error for empty string', () => {
            expect(() => safeJsonParse('', 'empty context')).toThrow('Failed to parse JSON (empty context):');
        });

        it('should parse JSON arrays', () => {
            const jsonArray = '[1, 2, 3]';
            const result = safeJsonParse(jsonArray, 'array context');
            expect(result).toEqual([1, 2, 3]);
        });

        it('should parse JSON primitives', () => {
            expect(safeJsonParse('123', 'number context')).toBe(123);
            expect(safeJsonParse('"hello"', 'string context')).toBe('hello');
            expect(safeJsonParse('true', 'boolean context')).toBe(true);
            expect(() => safeJsonParse('null', 'null context')).toThrow('Failed to parse JSON (null context): Parsed JSON is null or undefined');
        });
    });

    describe('validateString', () => {
        it('should validate valid string', () => {
            const result = validateString('test string', 'test value');
            expect(result).toBe('test string');
        });

        it('should throw error for non-string value', () => {
            expect(() => validateString(123, 'number value')).toThrow('number value must be a string');
            expect(() => validateString(null, 'null value')).toThrow('null value must be a string');
            expect(() => validateString(undefined, 'undefined value')).toThrow('undefined value must be a string');
        });

        it('should throw error for empty string', () => {
            expect(() => validateString('', 'empty string')).toThrow('empty string cannot be empty');
        });
    });

    describe('validateHasProperty', () => {
        it('should validate object has required property', () => {
            const obj = { name: 'test', value: 123 };
            validateHasProperty(obj, 'name', 'test object');
            validateHasProperty(obj, 'value', 'test object');
        });

        it('should throw error for missing property', () => {
            const obj = { name: 'test' };
            expect(() => validateHasProperty(obj, 'value', 'test object')).toThrow("Missing required property 'value' in test object");
        });

        it('should throw error for null/undefined object', () => {
            expect(() => validateHasProperty(null, 'name', 'null object')).toThrow('Object is null or not an object in null object');
            expect(() => validateHasProperty(undefined, 'name', 'undefined object')).toThrow('Object is null or not an object in undefined object');
        });

        it('should work with nested properties', () => {
            const obj = { nested: { value: 'test' } };
            validateHasProperty(obj, 'nested', 'test object');
            validateHasProperty(obj.nested, 'value', 'nested object');
        });
    });

    describe('validatePackageJson', () => {
        it('should validate valid package.json', () => {
            const validPackage = {
                name: '@test/package',
                version: '1.0.0',
                description: 'Test package',
                dependencies: {
                    'react': '^18.0.0'
                }
            };

            const result = validatePackageJson(validPackage, '/path/to/package.json');
            expect(result).toEqual(validPackage);
        });

        it('should validate minimal package.json', () => {
            const minimalPackage = {
                name: 'minimal-package',
                version: '0.1.0'
            };

            const result = validatePackageJson(minimalPackage, '/path/to/package.json');
            expect(result).toEqual(minimalPackage);
        });

        it('should throw error for missing name', () => {
            const invalidPackage = {
                version: '1.0.0'
            };
            expect(() => validatePackageJson(invalidPackage, '/path/to/package.json')).toThrow('Invalid package.json (/path/to/package.json): name must be a string');
        });

        it('should throw error for invalid name type', () => {
            const invalidPackage = {
                name: 123,
                version: '1.0.0'
            };
            expect(() => validatePackageJson(invalidPackage, '/path/to/package.json')).toThrow('Invalid package.json (/path/to/package.json): name must be a string');
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validatePackageJson(null, '/path/to/package.json')).toThrow('Invalid package.json (/path/to/package.json): not an object');
            expect(() => validatePackageJson(undefined, '/path/to/package.json')).toThrow('Invalid package.json (/path/to/package.json): not an object');
        });

        it('should allow missing version', () => {
            const packageWithoutVersion = {
                name: 'test-package'
            };

            const result = validatePackageJson(packageWithoutVersion, '/path/to/package.json');
            expect(result).toEqual(packageWithoutVersion);
        });

        it('should validate dependencies object', () => {
            const packageWithDeps = {
                name: 'test-package',
                version: '1.0.0',
                dependencies: {
                    'lodash': '^4.17.21',
                    'react': '^18.0.0'
                },
                devDependencies: {
                    'jest': '^29.0.0'
                }
            };

            const result = validatePackageJson(packageWithDeps, '/path/to/package.json');
            expect(result).toEqual(packageWithDeps);
        });
    });
});
