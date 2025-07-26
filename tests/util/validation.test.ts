import { describe, it, expect } from 'vitest';
import {
    validateReleaseSummary,
    validateLinkBackup,
    validateTranscriptionResult,
    safeJsonParse,
    validateString,
    validateHasProperty,
    validatePackageJson,
    ReleaseSummary,
    LinkBackup,
    TranscriptionResult
} from '../../src/util/validation';

describe('Validation utilities', () => {
    describe('validateReleaseSummary', () => {
        it('should validate a correct ReleaseSummary object', () => {
            const validSummary = {
                title: 'Release v1.0.0',
                body: 'This is the release body'
            };

            const result = validateReleaseSummary(validSummary);
            expect(result).toEqual(validSummary);
            expect(result.title).toBe('Release v1.0.0');
            expect(result.body).toBe('This is the release body');
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validateReleaseSummary(null)).toThrow('Invalid release summary: not an object');
            expect(() => validateReleaseSummary(undefined)).toThrow('Invalid release summary: not an object');
        });

        it('should throw error for non-object input', () => {
            expect(() => validateReleaseSummary('string')).toThrow('Invalid release summary: not an object');
            expect(() => validateReleaseSummary(123)).toThrow('Invalid release summary: not an object');
            expect(() => validateReleaseSummary([])).toThrow('Invalid release summary: title must be a string');
        });

        it('should throw error for missing title', () => {
            const invalidSummary = { body: 'Body text' };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: title must be a string');
        });

        it('should throw error for non-string title', () => {
            const invalidSummary = { title: 123, body: 'Body text' };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: title must be a string');
        });

        it('should throw error for missing body', () => {
            const invalidSummary = { title: 'Title' };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: body must be a string');
        });

        it('should throw error for non-string body', () => {
            const invalidSummary = { title: 'Title', body: 456 };
            expect(() => validateReleaseSummary(invalidSummary)).toThrow('Invalid release summary: body must be a string');
        });
    });

    describe('validateLinkBackup', () => {
        it('should validate a correct LinkBackup object', () => {
            const validBackup = {
                '@mypackage/ui': {
                    originalVersion: '1.0.0',
                    dependencyType: 'dependencies',
                    relativePath: '../ui-package'
                },
                'another-package': {
                    originalVersion: '2.1.0',
                    dependencyType: 'devDependencies',
                    relativePath: '../another-package'
                }
            };

            const result = validateLinkBackup(validBackup);
            expect(result).toEqual(validBackup);
        });

        it('should validate empty backup object', () => {
            const emptyBackup = {};
            const result = validateLinkBackup(emptyBackup);
            expect(result).toEqual(emptyBackup);
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validateLinkBackup(null)).toThrow('Invalid link backup: not an object');
            expect(() => validateLinkBackup(undefined)).toThrow('Invalid link backup: not an object');
        });

        it('should throw error for non-object input', () => {
            expect(() => validateLinkBackup('string')).toThrow('Invalid link backup: not an object');
            expect(() => validateLinkBackup(123)).toThrow('Invalid link backup: not an object');
        });

        it('should throw error for invalid backup entry', () => {
            const invalidBackup = {
                'package1': 'not an object'
            };
            expect(() => validateLinkBackup(invalidBackup)).toThrow('Invalid link backup entry for package1: not an object');
        });

        it('should throw error for missing originalVersion', () => {
            const invalidBackup = {
                'package1': {
                    dependencyType: 'dependencies',
                    relativePath: '../path'
                }
            };
            expect(() => validateLinkBackup(invalidBackup)).toThrow('Invalid link backup entry for package1: originalVersion must be a string');
        });

        it('should throw error for non-string originalVersion', () => {
            const invalidBackup = {
                'package1': {
                    originalVersion: 123,
                    dependencyType: 'dependencies',
                    relativePath: '../path'
                }
            };
            expect(() => validateLinkBackup(invalidBackup)).toThrow('Invalid link backup entry for package1: originalVersion must be a string');
        });

        it('should throw error for missing dependencyType', () => {
            const invalidBackup = {
                'package1': {
                    originalVersion: '1.0.0',
                    relativePath: '../path'
                }
            };
            expect(() => validateLinkBackup(invalidBackup)).toThrow('Invalid link backup entry for package1: dependencyType must be a string');
        });

        it('should throw error for missing relativePath', () => {
            const invalidBackup = {
                'package1': {
                    originalVersion: '1.0.0',
                    dependencyType: 'dependencies'
                }
            };
            expect(() => validateLinkBackup(invalidBackup)).toThrow('Invalid link backup entry for package1: relativePath must be a string');
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
            expect(result.text).toBe('This is the transcribed text');
        });

        it('should validate minimal TranscriptionResult with only text', () => {
            const minimalResult = { text: 'Just text' };
            const result = validateTranscriptionResult(minimalResult);
            expect(result).toEqual(minimalResult);
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validateTranscriptionResult(null)).toThrow('Invalid transcription result: not an object');
            expect(() => validateTranscriptionResult(undefined)).toThrow('Invalid transcription result: not an object');
        });

        it('should throw error for non-object input', () => {
            expect(() => validateTranscriptionResult('string')).toThrow('Invalid transcription result: not an object');
            expect(() => validateTranscriptionResult(123)).toThrow('Invalid transcription result: not an object');
        });

        it('should throw error for missing text property', () => {
            const invalidResult = { confidence: 0.95 };
            expect(() => validateTranscriptionResult(invalidResult)).toThrow('Invalid transcription result: text property must be a string');
        });

        it('should throw error for non-string text property', () => {
            const invalidResult = { text: 123 };
            expect(() => validateTranscriptionResult(invalidResult)).toThrow('Invalid transcription result: text property must be a string');
        });
    });

    describe('safeJsonParse', () => {
        it('should parse valid JSON', () => {
            const jsonString = '{"key": "value", "number": 42}';
            const result = safeJsonParse(jsonString);
            expect(result).toEqual({ key: 'value', number: 42 });
        });

        it('should parse arrays', () => {
            const jsonString = '[1, 2, 3]';
            const result = safeJsonParse(jsonString);
            expect(result).toEqual([1, 2, 3]);
        });

        it('should parse primitive values', () => {
            expect(safeJsonParse('"string"')).toBe('string');
            expect(safeJsonParse('42')).toBe(42);
            expect(safeJsonParse('true')).toBe(true);
            expect(safeJsonParse('false')).toBe(false);
        });

        it('should throw error for invalid JSON', () => {
            expect(() => safeJsonParse('invalid json')).toThrow('Failed to parse JSON: Unexpected token \'i\', "invalid json" is not valid JSON');
        });

        it('should throw error for null JSON result', () => {
            expect(() => safeJsonParse('null')).toThrow('Failed to parse JSON: Parsed JSON is null or undefined');
        });

        it('should include context in error message', () => {
            expect(() => safeJsonParse('invalid', 'test context')).toThrow('Failed to parse JSON (test context): Unexpected token \'i\', "invalid" is not valid JSON');
        });

        it('should handle empty string', () => {
            expect(() => safeJsonParse('')).toThrow('Failed to parse JSON: Unexpected end of JSON input');
        });
    });

    describe('validateString', () => {
        it('should validate non-empty strings', () => {
            const result = validateString('hello world', 'testField');
            expect(result).toBe('hello world');
        });

        it('should validate strings with whitespace', () => {
            const result = validateString('  hello  ', 'testField');
            expect(result).toBe('  hello  ');
        });

        it('should throw error for non-string values', () => {
            expect(() => validateString(123, 'testField')).toThrow('testField must be a string, got number');
            expect(() => validateString(null, 'testField')).toThrow('testField must be a string, got object');
            expect(() => validateString(undefined, 'testField')).toThrow('testField must be a string, got undefined');
            expect(() => validateString({}, 'testField')).toThrow('testField must be a string, got object');
            expect(() => validateString([], 'testField')).toThrow('testField must be a string, got object');
        });

        it('should throw error for empty strings', () => {
            expect(() => validateString('', 'testField')).toThrow('testField cannot be empty');
            expect(() => validateString('   ', 'testField')).toThrow('testField cannot be empty');
            expect(() => validateString('\t\n', 'testField')).toThrow('testField cannot be empty');
        });
    });

    describe('validateHasProperty', () => {
        it('should validate objects with the required property', () => {
            const obj = { requiredProp: 'value', other: 123 };
            expect(() => validateHasProperty(obj, 'requiredProp')).not.toThrow();
        });

        it('should validate objects with null/undefined property values', () => {
            const obj = { requiredProp: null, other: undefined };
            expect(() => validateHasProperty(obj, 'requiredProp')).not.toThrow();
            expect(() => validateHasProperty(obj, 'other')).not.toThrow();
        });

        it('should throw error for missing property', () => {
            const obj = { other: 'value' };
            expect(() => validateHasProperty(obj, 'requiredProp')).toThrow('Missing required property \'requiredProp\'');
        });

        it('should throw error for null/undefined objects', () => {
            expect(() => validateHasProperty(null, 'prop')).toThrow('Object is null or not an object');
            expect(() => validateHasProperty(undefined, 'prop')).toThrow('Object is null or not an object');
        });

        it('should throw error for non-object values', () => {
            expect(() => validateHasProperty('string', 'prop')).toThrow('Object is null or not an object');
            expect(() => validateHasProperty(123, 'prop')).toThrow('Object is null or not an object');
        });

        it('should include context in error messages', () => {
            expect(() => validateHasProperty(null, 'prop', 'test context')).toThrow('Object is null or not an object in test context');
            expect(() => validateHasProperty({}, 'prop', 'test context')).toThrow('Missing required property \'prop\' in test context');
        });
    });

    describe('validatePackageJson', () => {
        it('should validate correct package.json', () => {
            const validPackage = {
                name: 'my-package',
                version: '1.0.0',
                dependencies: {}
            };

            const result = validatePackageJson(validPackage);
            expect(result).toEqual(validPackage);
        });

        it('should validate package.json without name when requireName is false', () => {
            const packageWithoutName = {
                version: '1.0.0',
                dependencies: {}
            };

            const result = validatePackageJson(packageWithoutName, undefined, false);
            expect(result).toEqual(packageWithoutName);
        });

        it('should throw error for null/undefined input', () => {
            expect(() => validatePackageJson(null)).toThrow('Invalid package.json: not an object');
            expect(() => validatePackageJson(undefined)).toThrow('Invalid package.json: not an object');
        });

        it('should throw error for non-object input', () => {
            expect(() => validatePackageJson('string')).toThrow('Invalid package.json: not an object');
            expect(() => validatePackageJson(123)).toThrow('Invalid package.json: not an object');
        });

        it('should throw error for missing name when required', () => {
            const packageWithoutName = { version: '1.0.0' };
            expect(() => validatePackageJson(packageWithoutName)).toThrow('Invalid package.json: name must be a string');
        });

        it('should throw error for non-string name', () => {
            const packageWithBadName = { name: 123, version: '1.0.0' };
            expect(() => validatePackageJson(packageWithBadName)).toThrow('Invalid package.json: name must be a string');
        });

        it('should include context in error messages', () => {
            expect(() => validatePackageJson(null, 'test-file')).toThrow('Invalid package.json (test-file): not an object');
            expect(() => validatePackageJson({}, 'test-file')).toThrow('Invalid package.json (test-file): name must be a string');
        });

        it('should accept minimal package.json when name not required', () => {
            const minimal = {};
            const result = validatePackageJson(minimal, undefined, false);
            expect(result).toEqual(minimal);
        });
    });
});
