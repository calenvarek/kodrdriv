import { describe, test, expect } from 'vitest';
import { deepMerge, stringifyJSON, incrementPatchVersion, incrementMinorVersion, incrementMajorVersion, validateVersionString, calculateTargetVersion, checkIfTagExists, confirmVersionInteractively, getOutputPath, getTimestampedFilename, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedCommitFilename, getTimestampedReleaseNotesFilename, getTimestampedAudioFilename, getTimestampedTranscriptFilename, getTimestampedReviewFilename, getTimestampedReviewNotesFilename, getTimestampedArchivedAudioFilename, getTimestampedArchivedTranscriptFilename, archiveAudio } from '../../src/util/general';
import { beforeEach, afterEach, vi } from 'vitest';
import * as Storage from '../../src/util/storage';
import * as fs from 'fs';
import * as Logging from '../../src/logging';

describe('deepMerge', () => {
    test('should merge two flat objects', () => {
        const target = { a: 1, b: 2 };
        const source = { b: 3, c: 4 };
        const result = deepMerge(target, source);

        expect(result).toEqual({ a: 1, b: 3, c: 4 });
        expect(result).toBe(target); // should modify the target object
    });

    test('should recursively merge nested objects', () => {
        const target = { a: 1, b: { x: 1, y: 2 } };
        const source = { b: { y: 3, z: 4 }, c: 5 };
        const result = deepMerge(target, source);

        expect(result).toEqual({
            a: 1,
            b: { x: 1, y: 3, z: 4 },
            c: 5
        });
        expect(result).toBe(target);
    });

    test('should handle nested objects with missing properties in target', () => {
        const target = { a: 1 };
        const source = { b: { x: 1, y: 2 } };
        const result = deepMerge(target, source);

        expect(result).toEqual({ a: 1, b: { x: 1, y: 2 } });
        expect(result.b).toEqual({ x: 1, y: 2 });
    });

    test('should replace arrays (not merge them)', () => {
        const target = { a: [1, 2, 3], b: 2 };
        const source = { a: [4, 5], c: 3 };
        const result = deepMerge(target, source);

        expect(result).toEqual({ a: [4, 5], b: 2, c: 3 });
        expect(result.a).toBe(source.a); // Array reference should be replaced
    });

    test('should handle null and undefined values', () => {
        const target = { a: 1, b: null, c: undefined };
        const source = { a: null, b: 2, d: undefined };
        const result = deepMerge(target, source);

        expect(result).toEqual({ a: null, b: 2, c: undefined, d: undefined });
    });

    test('should handle empty objects', () => {
        const target = {};
        const source = {};
        const result = deepMerge(target, source);

        expect(result).toEqual({});
        expect(result).toBe(target);
    });

    test('should handle complex nested structures', () => {
        const target = {
            config: {
                api: {
                    endpoint: 'https://old-api.com',
                    version: 'v1',
                    settings: {
                        timeout: 1000
                    }
                }
            },
            data: [1, 2, 3]
        };

        const source = {
            config: {
                api: {
                    endpoint: 'https://new-api.com',
                    settings: {
                        timeout: 2000,
                        retry: true
                    }
                },
                newSetting: true
            },
            data: [4, 5]
        };

        const result = deepMerge(target, source);

        expect(result).toEqual({
            config: {
                api: {
                    endpoint: 'https://new-api.com',
                    version: 'v1',
                    settings: {
                        timeout: 2000,
                        retry: true
                    }
                },
                newSetting: true
            },
            data: [4, 5]
        });
    });

    test('should skip prototype-polluting keys', () => {
        const target = { a: 1 };
        const source = {
            b: 2,
            __proto__: { polluted: true },
            constructor: { polluted: true }
        };
        const result = deepMerge(target, source);

        expect(result).toEqual({ a: 1, b: 2 });
        expect(result.polluted).toBeUndefined();
    });

    test('should handle deeply nested objects without prototype pollution', () => {
        const target = { level1: { level2: { safe: true } } };
        const source = {
            level1: {
                level2: {
                    __proto__: { polluted: true },
                    newProp: 'value'
                }
            }
        };
        const result = deepMerge(target, source);

        expect(result).toEqual({
            level1: {
                level2: {
                    safe: true,
                    newProp: 'value'
                }
            }
        });
    });
});

describe('stringifyJSON', () => {
    test('should stringify JSON with proper formatting', () => {
        const obj = {
            name: 'test',
            value: 123,
            nested: {
                array: [1, 2, 3],
                bool: true
            }
        };

        const result = stringifyJSON(obj);
        const expected = `{"name":"test","value":123,"nested":{"array":[1,2,3],"bool":true}}`;

        expect(result).toBe(expected);
    });

    test('should handle circular references', () => {
        const obj: any = { name: 'test' };
        obj.circular = obj;

        const result = stringifyJSON(obj);
        expect(result).toContain('Maximum depth reached');
    });

    test('should handle undefined values', () => {
        const obj = {
            name: 'test',
            value: undefined,
            nested: {
                empty: undefined
            }
        };

        const result = stringifyJSON(obj);
        expect(result).toBe('{"name":"test",,"nested":{}}');
    });

    test('should handle null values', () => {
        const obj = {
            name: 'test',
            value: null,
            nested: {
                empty: null
            }
        };

        const result = stringifyJSON(obj);
        expect(result).toBe('{"name":"test","value":null,"nested":{"empty":null}}');
    });

    test('should handle primitive types', () => {
        expect(stringifyJSON(42)).toBe('42');
        expect(stringifyJSON(true)).toBe('true');
        expect(stringifyJSON(false)).toBe('false');
        expect(stringifyJSON(null)).toBe('null');
        expect(stringifyJSON('hello')).toBe('"hello"');
    });

    test('should handle empty arrays', () => {
        expect(stringifyJSON([])).toBe('[]');
    });

    test('should handle arrays with mixed types', () => {
        const arr = [1, 'string', true, null, { key: 'value' }];
        const result = stringifyJSON(arr);
        expect(result).toBe('[1,"string",true,null,{"key":"value"}]');
    });

    test('should skip functions in objects', () => {
        const obj = {
            name: 'test',
            fn: function () { return 'hello'; },
            arrow: () => 'world',
            value: 42
        };
        const result = stringifyJSON(obj);
        expect(result).toBe('{"name":"test",,,"value":42}');
    });

    test('should handle nested arrays', () => {
        const obj = {
            matrix: [[1, 2], [3, 4]],
            single: [1, 2, 3]
        };
        const result = stringifyJSON(obj);
        expect(result).toBe('{"matrix":[[1,2],[3,4]],"single":[1,2,3]}');
    });

    test('should handle Date objects as regular objects', () => {
        const date = new Date('2023-01-01');
        const result = stringifyJSON({ date });
        // Date objects will be processed as regular objects with their properties
        expect(result).toContain('"date"');
    });

    test('should reach maximum depth limit', () => {
        let deepObj: any = {};
        let current = deepObj;

        // Create an object with depth > 10
        for (let i = 0; i < 15; i++) {
            current.nested = {};
            current = current.nested;
        }
        current.value = 'deep';

        const result = stringifyJSON(deepObj);
        expect(result).toContain('Maximum depth reached');
    });
});

describe('incrementPatchVersion', () => {
    test('should increment patch version correctly', () => {
        expect(incrementPatchVersion('1.2.3')).toBe('1.2.4');
        expect(incrementPatchVersion('0.0.1')).toBe('0.0.2');
        expect(incrementPatchVersion('10.5.99')).toBe('10.5.100');
    });

    test('should increment from zero', () => {
        expect(incrementPatchVersion('1.2.0')).toBe('1.2.1');
    });

    test('should handle large patch numbers', () => {
        expect(incrementPatchVersion('1.0.999')).toBe('1.0.1000');
        expect(incrementPatchVersion('2.1.9999')).toBe('2.1.10000');
    });

    test('should handle versions with v prefix', () => {
        expect(incrementPatchVersion('v1.2.3')).toBe('1.2.4');
        expect(incrementPatchVersion('v0.0.1')).toBe('0.0.2');
        expect(incrementPatchVersion('v10.5.99')).toBe('10.5.100');
    });

    test('should handle pre-release versions', () => {
        expect(incrementPatchVersion('4.6.24-dev.0')).toBe('4.6.24');
        expect(incrementPatchVersion('v4.6.24-dev.0')).toBe('4.6.24');
        expect(incrementPatchVersion('1.2.3-alpha.1')).toBe('1.2.3');
        expect(incrementPatchVersion('1.2.3-beta')).toBe('1.2.3');
        expect(incrementPatchVersion('1.2.3-rc.1')).toBe('1.2.3');
        expect(incrementPatchVersion('1.2.3-snapshot')).toBe('1.2.3');
    });

    test('should handle complex pre-release versions', () => {
        expect(incrementPatchVersion('2.0.0-alpha.beta.1')).toBe('2.0.0');
        expect(incrementPatchVersion('v1.0.0-x.7.z.92')).toBe('1.0.0');
        expect(incrementPatchVersion('1.2.10-20130313144700')).toBe('1.2.10');
    });

    test('should throw error for invalid version string format', () => {
        expect(() => incrementPatchVersion('1.2')).toThrow('Invalid version string: 1.2');
        expect(() => incrementPatchVersion('1')).toThrow('Invalid version string: 1');
        expect(() => incrementPatchVersion('')).toThrow('Invalid version string: ');
    });

    test('should throw error for non-numeric patch version', () => {
        expect(() => incrementPatchVersion('1.2.abc')).toThrow('Invalid patch version: abc');
        expect(() => incrementPatchVersion('1.2.')).toThrow('Invalid patch version: ');
        expect(() => incrementPatchVersion('1.2.v3')).toThrow('Invalid patch version: v3');
        expect(() => incrementPatchVersion('v1.2.abc-dev.0')).toThrow('Invalid patch version: abc-dev');
    });

    test('should handle version strings with leading zeros', () => {
        expect(incrementPatchVersion('1.2.03')).toBe('1.2.4');
        expect(incrementPatchVersion('01.02.00')).toBe('01.02.1');
        expect(incrementPatchVersion('v1.2.03-dev.0')).toBe('1.2.03');
    });

    test('should handle versions with non-numeric major or minor parts', () => {
        // Note: The function only validates the patch part, so these would pass
        // This documents the current behavior - major/minor validation could be added
        expect(incrementPatchVersion('1.v2.3')).toBe('1.v2.4');
        expect(incrementPatchVersion('major.minor.3')).toBe('major.minor.4');
    });

    test('should handle negative numbers in patch', () => {
        // Note: parseInt('-1', 10) returns -1, which is a valid number, so it gets incremented
        expect(incrementPatchVersion('1.2.-1')).toBe('1.2.0');
        expect(incrementPatchVersion('1.2.-5')).toBe('1.2.-4');
        expect(incrementPatchVersion('v1.2.-1-dev.0')).toBe('1.2.-1');
    });

    test('should handle multiple dots in version (more than 3 parts)', () => {
        // The function now accepts versions with more than 3 parts (like semver with pre-release)
        expect(incrementPatchVersion('1.2.3.4')).toBe('1.2.4'); // Only uses first 3 parts for version
        expect(incrementPatchVersion('1.2.3.4.5')).toBe('1.2.4');
    });

    test('should handle edge cases with pre-release identifiers', () => {
        // Note: '1.2.3a' parses as 3 via parseInt, so it doesn't throw
        expect(incrementPatchVersion('1.2.3a')).toBe('1.2.4');
        expect(incrementPatchVersion('1.2.3-')).toBe('1.2.3');
        expect(incrementPatchVersion('v1.2.3-')).toBe('1.2.3');
    });
});

describe('incrementMinorVersion', () => {
    test('should increment minor version correctly', () => {
        expect(incrementMinorVersion('1.2.3')).toBe('1.3.0');
        expect(incrementMinorVersion('0.0.1')).toBe('0.1.0');
        expect(incrementMinorVersion('10.5.99')).toBe('10.6.0');
    });

    test('should increment from zero', () => {
        expect(incrementMinorVersion('1.0.0')).toBe('1.1.0');
        expect(incrementMinorVersion('0.0.0')).toBe('0.1.0');
    });

    test('should handle large minor numbers', () => {
        expect(incrementMinorVersion('1.999.0')).toBe('1.1000.0');
        expect(incrementMinorVersion('2.9999.1')).toBe('2.10000.0');
    });

    test('should handle versions with v prefix', () => {
        expect(incrementMinorVersion('v1.2.3')).toBe('1.3.0');
        expect(incrementMinorVersion('v0.0.1')).toBe('0.1.0');
        expect(incrementMinorVersion('v10.5.99')).toBe('10.6.0');
    });

    test('should handle pre-release versions', () => {
        expect(incrementMinorVersion('4.6.24-dev.0')).toBe('4.7.0');
        expect(incrementMinorVersion('v4.6.24-dev.0')).toBe('4.7.0');
        expect(incrementMinorVersion('1.2.3-alpha.1')).toBe('1.3.0');
        expect(incrementMinorVersion('1.2.3-beta')).toBe('1.3.0');
        expect(incrementMinorVersion('1.2.3-rc.1')).toBe('1.3.0');
        expect(incrementMinorVersion('1.2.3-snapshot')).toBe('1.3.0');
    });

    test('should handle pre-release versions on minor component', () => {
        expect(incrementMinorVersion('1.23-dev.0.3')).toBe('1.24.0');
        expect(incrementMinorVersion('v1.23-alpha.1.5')).toBe('1.24.0');
        expect(incrementMinorVersion('2.0-rc.2.10')).toBe('2.1.0');
    });

    test('should throw error for invalid version string format', () => {
        expect(() => incrementMinorVersion('1.2')).toThrow('Invalid version string: 1.2');
        expect(() => incrementMinorVersion('1')).toThrow('Invalid version string: 1');
        expect(() => incrementMinorVersion('')).toThrow('Invalid version string: ');
    });

    test('should throw error for non-numeric version components', () => {
        expect(() => incrementMinorVersion('abc.2.3')).toThrow('Invalid version numbers in: abc.2.3');
        expect(() => incrementMinorVersion('1.abc.3')).toThrow('Invalid version numbers in: 1.abc.3');
        expect(() => incrementMinorVersion('v1.abc-dev.0.3')).toThrow('Invalid version numbers in: v1.abc-dev.0.3');
    });

    test('should handle version strings with leading zeros', () => {
        expect(incrementMinorVersion('1.02.3')).toBe('1.3.0');
        expect(incrementMinorVersion('01.02.00')).toBe('1.3.0'); // Leading zeros are not preserved in major
        expect(incrementMinorVersion('v1.02.3-dev.0')).toBe('1.3.0');
    });

    test('should reset patch to 0', () => {
        expect(incrementMinorVersion('1.2.99')).toBe('1.3.0');
        expect(incrementMinorVersion('1.2.1234')).toBe('1.3.0');
        expect(incrementMinorVersion('v1.2.99-beta')).toBe('1.3.0');
    });
});

describe('incrementMajorVersion', () => {
    test('should increment major version correctly', () => {
        expect(incrementMajorVersion('1.2.3')).toBe('2.0.0');
        expect(incrementMajorVersion('0.0.1')).toBe('1.0.0');
        expect(incrementMajorVersion('10.5.99')).toBe('11.0.0');
    });

    test('should increment from zero', () => {
        expect(incrementMajorVersion('0.2.3')).toBe('1.0.0');
        expect(incrementMajorVersion('0.0.0')).toBe('1.0.0');
    });

    test('should handle large major numbers', () => {
        expect(incrementMajorVersion('999.5.0')).toBe('1000.0.0');
        expect(incrementMajorVersion('9999.1.1')).toBe('10000.0.0');
    });

    test('should handle versions with v prefix', () => {
        expect(incrementMajorVersion('v1.2.3')).toBe('2.0.0');
        expect(incrementMajorVersion('v0.0.1')).toBe('1.0.0');
        expect(incrementMajorVersion('v10.5.99')).toBe('11.0.0');
    });

    test('should handle pre-release versions', () => {
        expect(incrementMajorVersion('4.6.24-dev.0')).toBe('5.0.0');
        expect(incrementMajorVersion('v4.6.24-dev.0')).toBe('5.0.0');
        expect(incrementMajorVersion('1.2.3-alpha.1')).toBe('2.0.0');
        expect(incrementMajorVersion('1.2.3-beta')).toBe('2.0.0');
        expect(incrementMajorVersion('1.2.3-rc.1')).toBe('2.0.0');
        expect(incrementMajorVersion('1.2.3-snapshot')).toBe('2.0.0');
    });

    test('should handle pre-release versions on major component', () => {
        expect(incrementMajorVersion('4-dev.0.6.24')).toBe('5.0.0');
        expect(incrementMajorVersion('v4-alpha.1.6.24')).toBe('5.0.0');
        expect(incrementMajorVersion('10-rc.2.5.99')).toBe('11.0.0');
    });

    test('should throw error for invalid version string format', () => {
        expect(() => incrementMajorVersion('1.2')).toThrow('Invalid version string: 1.2');
        expect(() => incrementMajorVersion('1')).toThrow('Invalid version string: 1');
        expect(() => incrementMajorVersion('')).toThrow('Invalid version string: ');
    });

    test('should throw error for non-numeric major version', () => {
        expect(() => incrementMajorVersion('abc.2.3')).toThrow('Invalid major version number in: abc.2.3');
        expect(() => incrementMajorVersion('v.2.3')).toThrow('Invalid major version number in: v.2.3');
        expect(() => incrementMajorVersion('vv1.2.3')).toThrow('Invalid major version number in: vv1.2.3');
    });

    test('should handle version strings with leading zeros', () => {
        expect(incrementMajorVersion('01.2.3')).toBe('2.0.0');
        expect(incrementMajorVersion('001.02.00')).toBe('2.0.0');
        expect(incrementMajorVersion('v01.2.3-dev.0')).toBe('2.0.0');
    });

    test('should reset minor and patch to 0', () => {
        expect(incrementMajorVersion('1.99.99')).toBe('2.0.0');
        expect(incrementMajorVersion('1.1234.5678')).toBe('2.0.0');
        expect(incrementMajorVersion('v1.99.99-beta')).toBe('2.0.0');
    });
});

describe('validateVersionString', () => {
    test('should validate correct semver strings', () => {
        expect(validateVersionString('1.2.3')).toBe(true);
        expect(validateVersionString('0.0.0')).toBe(true);
        expect(validateVersionString('10.5.99')).toBe(true);
        expect(validateVersionString('999.999.999')).toBe(true);
    });

    test('should validate versions with v prefix', () => {
        expect(validateVersionString('v1.2.3')).toBe(true);
        expect(validateVersionString('v0.0.0')).toBe(true);
        expect(validateVersionString('v10.5.99')).toBe(true);
    });

    test('should reject invalid version formats', () => {
        expect(validateVersionString('1.2')).toBe(false);
        expect(validateVersionString('1')).toBe(false);
        expect(validateVersionString('')).toBe(false);
        expect(validateVersionString('1.2.3.4')).toBe(false);
        expect(validateVersionString('1.2.3-alpha')).toBe(false);
        expect(validateVersionString('1.2.3-dev.0')).toBe(false);
        expect(validateVersionString('1.2.3+build')).toBe(false);
    });

    test('should reject non-numeric components', () => {
        expect(validateVersionString('a.b.c')).toBe(false);
        expect(validateVersionString('1.b.c')).toBe(false);
        expect(validateVersionString('1.2.c')).toBe(false);
        expect(validateVersionString('va.2.3')).toBe(false);
    });

    test('should reject negative numbers', () => {
        expect(validateVersionString('-1.2.3')).toBe(false);
        expect(validateVersionString('1.-2.3')).toBe(false);
        expect(validateVersionString('1.2.-3')).toBe(false);
        expect(validateVersionString('v-1.2.3')).toBe(false);
    });

    test('should accept leading zeros', () => {
        expect(validateVersionString('01.02.03')).toBe(true);
        expect(validateVersionString('001.002.003')).toBe(true);
        expect(validateVersionString('v01.02.03')).toBe(true);
    });

    test('should reject special characters', () => {
        expect(validateVersionString('1.2.3!')).toBe(false);
        expect(validateVersionString('1.2.3@')).toBe(false);
        expect(validateVersionString('1.2.3#')).toBe(false);
        expect(validateVersionString('1.2.3$')).toBe(false);
        expect(validateVersionString('1.2.3%')).toBe(false);
        expect(validateVersionString('1.2.3^')).toBe(false);
        expect(validateVersionString('1.2.3&')).toBe(false);
        expect(validateVersionString('1.2.3*')).toBe(false);
        expect(validateVersionString('1.2.3()')).toBe(false);
    });
});

describe('calculateTargetVersion', () => {
    test('should calculate patch version increment', () => {
        expect(calculateTargetVersion('1.2.3', 'patch')).toBe('1.2.4');
        expect(calculateTargetVersion('v1.2.3', 'patch')).toBe('1.2.4');
        expect(calculateTargetVersion('0.0.1', 'patch')).toBe('0.0.2');
    });

    test('should calculate minor version increment', () => {
        expect(calculateTargetVersion('1.2.3', 'minor')).toBe('1.3.0');
        expect(calculateTargetVersion('v1.2.3', 'minor')).toBe('1.3.0');
        expect(calculateTargetVersion('0.0.1', 'minor')).toBe('0.1.0');
    });

    test('should calculate major version increment', () => {
        expect(calculateTargetVersion('1.2.3', 'major')).toBe('2.0.0');
        expect(calculateTargetVersion('v1.2.3', 'major')).toBe('2.0.0');
        expect(calculateTargetVersion('0.0.1', 'major')).toBe('1.0.0');
    });

    test('should handle case-insensitive increment types', () => {
        expect(calculateTargetVersion('1.2.3', 'PATCH')).toBe('1.2.4');
        expect(calculateTargetVersion('1.2.3', 'MINOR')).toBe('1.3.0');
        expect(calculateTargetVersion('1.2.3', 'MAJOR')).toBe('2.0.0');
        expect(calculateTargetVersion('1.2.3', 'Patch')).toBe('1.2.4');
        expect(calculateTargetVersion('1.2.3', 'Minor')).toBe('1.3.0');
        expect(calculateTargetVersion('1.2.3', 'Major')).toBe('2.0.0');
    });

    test('should accept explicit version numbers', () => {
        expect(calculateTargetVersion('1.2.3', '2.0.0')).toBe('2.0.0');
        expect(calculateTargetVersion('1.2.3', '1.3.5')).toBe('1.3.5');
        expect(calculateTargetVersion('1.2.3', '10.20.30')).toBe('10.20.30');
    });

    test('should handle explicit version numbers with v prefix', () => {
        expect(calculateTargetVersion('1.2.3', 'v2.0.0')).toBe('2.0.0');
        expect(calculateTargetVersion('1.2.3', 'v1.3.5')).toBe('1.3.5');
        expect(calculateTargetVersion('v1.2.3', 'v10.20.30')).toBe('10.20.30');
    });

    test('should throw error for invalid explicit version format', () => {
        expect(() => calculateTargetVersion('1.2.3', '1.2')).toThrow('Invalid version format: 1.2. Expected format: "x.y.z" or one of: "patch", "minor", "major"');
        expect(() => calculateTargetVersion('1.2.3', '1')).toThrow('Invalid version format: 1. Expected format: "x.y.z" or one of: "patch", "minor", "major"');
        expect(() => calculateTargetVersion('1.2.3', 'invalid')).toThrow('Invalid version format: invalid. Expected format: "x.y.z" or one of: "patch", "minor", "major"');
        expect(() => calculateTargetVersion('1.2.3', '1.2.3-alpha')).toThrow('Invalid version format: 1.2.3-alpha. Expected format: "x.y.z" or one of: "patch", "minor", "major"');
    });

    test('should handle pre-release versions in current version', () => {
        expect(calculateTargetVersion('1.2.3-alpha.1', 'patch')).toBe('1.2.3');
        expect(calculateTargetVersion('1.2.3-dev.0', 'minor')).toBe('1.3.0');
        expect(calculateTargetVersion('1.2.3-rc.1', 'major')).toBe('2.0.0');
    });

    test('should accept empty string target version', () => {
        expect(() => calculateTargetVersion('1.2.3', '')).toThrow('Invalid version format: . Expected format: "x.y.z" or one of: "patch", "minor", "major"');
    });

    test('should handle edge cases', () => {
        expect(calculateTargetVersion('999.999.999', 'patch')).toBe('999.999.1000');
        expect(calculateTargetVersion('999.999.999', 'minor')).toBe('999.1000.0');
        expect(calculateTargetVersion('999.999.999', 'major')).toBe('1000.0.0');
    });
});

describe('getOutputPath', () => {
    test('should join output directory and filename correctly', () => {
        expect(getOutputPath('output', 'test.json')).toBe('output/test.json');
        expect(getOutputPath('/usr/local/output', 'data.txt')).toBe('/usr/local/output/data.txt');
    });

    test('should handle empty filename', () => {
        expect(getOutputPath('output', '')).toBe('output');
    });

    test('should handle relative paths', () => {
        expect(getOutputPath('../output', 'file.txt')).toBe('../output/file.txt');
        expect(getOutputPath('./output', 'file.txt')).toBe('output/file.txt');
    });

    test('should handle nested directory structure', () => {
        expect(getOutputPath('output/logs', 'app.log')).toBe('output/logs/app.log');
    });
});

describe('getTimestampedFilename', () => {
    let mockDate: Date;

    beforeEach(() => {
        // Mock Date to return a fixed timestamp
        mockDate = new Date('2025-01-07T10:30:45Z');
        vi.useFakeTimers();
        vi.setSystemTime(mockDate);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('should generate filename with default extension', () => {
        const result = getTimestampedFilename('test');
        expect(result).toBe('250107-0530-test.json');
    });

    test('should generate filename with custom extension', () => {
        const result = getTimestampedFilename('test', '.txt');
        expect(result).toBe('250107-0530-test.txt');
    });

    test('should generate filename with no extension', () => {
        const result = getTimestampedFilename('test', '');
        expect(result).toBe('250107-0530-test');
    });

    test('should handle baseName with spaces', () => {
        const result = getTimestampedFilename('test file', '.log');
        expect(result).toBe('250107-0530-test file.log');
    });

    test('should handle different times correctly', () => {
        // Test with different time
        const differentTime = new Date('2025-12-31T23:59:59Z');
        vi.setSystemTime(differentTime);

        const result = getTimestampedFilename('test');
        expect(result).toBe('251231-1859-test.json');
    });

    test('should pad single digit months and days', () => {
        const earlyDate = new Date('2025-01-01T09:05:00Z');
        vi.setSystemTime(earlyDate);

        const result = getTimestampedFilename('test');
        expect(result).toBe('250101-0405-test.json');
    });
});

describe('specific timestamped filename functions', () => {
    beforeEach(() => {
        const mockDate = new Date('2025-01-07T10:30:45Z');
        vi.useFakeTimers();
        vi.setSystemTime(mockDate);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    test('getTimestampedRequestFilename should generate request filename', () => {
        const result = getTimestampedRequestFilename('test');
        expect(result).toBe('250107-0530-test.request.json');
    });

    test('getTimestampedResponseFilename should generate response filename', () => {
        const result = getTimestampedResponseFilename('test');
        expect(result).toBe('250107-0530-test.response.json');
    });

    test('getTimestampedCommitFilename should generate commit filename', () => {
        const result = getTimestampedCommitFilename();
        expect(result).toBe('250107-0530-commit-message.md');
    });

    test('getTimestampedReleaseNotesFilename should generate release notes filename', () => {
        const result = getTimestampedReleaseNotesFilename();
        expect(result).toBe('250107-0530-release-notes.md');
    });

    test('getTimestampedAudioFilename should generate audio filename', () => {
        const result = getTimestampedAudioFilename();
        expect(result).toBe('250107-0530-audio-recording.wav');
    });

    test('getTimestampedTranscriptFilename should generate transcript filename', () => {
        const result = getTimestampedTranscriptFilename();
        expect(result).toBe('250107-0530-audio-transcript.md');
    });

    test('getTimestampedReviewFilename should generate review filename', () => {
        const result = getTimestampedReviewFilename();
        expect(result).toBe('250107-0530-review-analysis.md');
    });

    test('getTimestampedReviewNotesFilename should generate review notes filename', () => {
        const result = getTimestampedReviewNotesFilename();
        expect(result).toBe('250107-0530-review-notes.md');
    });

    test('getTimestampedArchivedAudioFilename should generate archived audio filename with default extension', () => {
        const result = getTimestampedArchivedAudioFilename();
        expect(result).toBe('250107-0530-review-audio.wav');
    });

    test('getTimestampedArchivedAudioFilename should generate archived audio filename with custom extension', () => {
        const result = getTimestampedArchivedAudioFilename('.mp3');
        expect(result).toBe('250107-0530-review-audio.mp3');
    });

    test('getTimestampedArchivedTranscriptFilename should generate archived transcript filename', () => {
        const result = getTimestampedArchivedTranscriptFilename();
        expect(result).toBe('250107-0530-review-transcript.md');
    });
});

describe('checkIfTagExists', () => {
    let mockRun: any;

    beforeEach(async () => {
        // Mock the dynamic import of child module
        mockRun = vi.fn();
        vi.doMock('../../src/util/child', () => ({
            run: mockRun,
            runSecure: mockRun, // Use the same mock for both since we're testing the same behavior
            validateGitRef: vi.fn(() => true),
            escapeShellArg: vi.fn((arg) => `'${arg}'`),
            validateFilePath: vi.fn(() => true),
            runSecureWithInheritedStdio: vi.fn(),
            runWithInheritedStdio: vi.fn(),
            runWithDryRunSupport: vi.fn(),
            runSecureWithDryRunSupport: vi.fn()
        }));
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.doUnmock('../../src/util/child');
    });

    test('should return true when tag exists', async () => {
        mockRun.mockResolvedValue({ stdout: 'v1.2.3' });

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(true);
    });

    test('should return false when tag does not exist', async () => {
        mockRun.mockResolvedValue({ stdout: '' });

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(false);
    });

    test('should return false when tag has different case', async () => {
        mockRun.mockResolvedValue({ stdout: 'V1.2.3' });

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(false);
    });

    test('should return false when stdout contains partial match', async () => {
        mockRun.mockResolvedValue({ stdout: 'v1.2.3-alpha' });

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(false);
    });

    test('should handle tags without v prefix', async () => {
        mockRun.mockResolvedValue({ stdout: '1.2.3' });

        const result = await checkIfTagExists('1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', '1.2.3']);
        expect(result).toBe(true);
    });

    test('should trim whitespace from stdout', async () => {
        mockRun.mockResolvedValue({ stdout: '  v1.2.3  \n' });

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(true);
    });

    test('should return false when git command fails', async () => {
        mockRun.mockRejectedValue(new Error('Git command failed'));

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(false);
    });

    test('should handle special characters in tag names', async () => {
        mockRun.mockResolvedValue({ stdout: 'release/1.2.3' });

        const result = await checkIfTagExists('release/1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'release/1.2.3']);
        expect(result).toBe(true);
    });

    test('should handle empty tag name', async () => {
        mockRun.mockResolvedValue({ stdout: '' });

        const result = await checkIfTagExists('');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', '']);
        expect(result).toBe(true); // Empty stdout matches empty tagName after trim
    });

    test('should handle multiple lines in stdout (should only match exact)', async () => {
        mockRun.mockResolvedValue({ stdout: 'v1.2.2\nv1.2.3\nv1.2.4' });

        const result = await checkIfTagExists('v1.2.3');

        expect(mockRun).toHaveBeenCalledWith('git', ['tag', '-l', 'v1.2.3']);
        expect(result).toBe(false); // Because stdout.trim() !== tagName
    });
});

describe('confirmVersionInteractively', () => {
    let mockGetUserChoice: any;
    let mockGetUserTextInput: any;
    let mockRequireTTY: any;
    let mockGetLogger: any;
    let mockLogger: any;

    beforeEach(async () => {
        // Mock interactive module
        mockGetUserChoice = vi.fn();
        mockGetUserTextInput = vi.fn();
        mockRequireTTY = vi.fn();
        vi.doMock('../../src/util/interactive', () => ({
            getUserChoice: mockGetUserChoice,
            getUserTextInput: mockGetUserTextInput,
            requireTTY: mockRequireTTY
        }));

        // Mock logger
        mockLogger = {
            info: vi.fn(),
            debug: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        };
        mockGetLogger = vi.fn().mockReturnValue(mockLogger);
        vi.doMock('../../src/logging', () => ({
            getLogger: mockGetLogger
        }));
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.doUnmock('../../src/util/interactive');
        vi.doUnmock('../../src/logging');
    });

    test('should confirm proposed version when user chooses confirm', async () => {
        mockGetUserChoice.mockResolvedValue('c');

        const result = await confirmVersionInteractively('1.2.3', '1.2.4');

        expect(mockRequireTTY).toHaveBeenCalledWith('Interactive version confirmation requires a terminal.');
        expect(mockLogger.info).toHaveBeenCalledWith('\n📦 Version Confirmation:');
        expect(mockLogger.info).toHaveBeenCalledWith('   Current version: 1.2.3');
        expect(mockLogger.info).toHaveBeenCalledWith('   Proposed version: 1.2.4');
        expect(mockGetUserChoice).toHaveBeenCalledWith(
            '\n🤔 Confirm the version for this release:',
            [
                { key: 'c', label: 'Confirm 1.2.4' },
                { key: 'e', label: 'Enter custom version' },
                { key: 'a', label: 'Abort publish' }
            ]
        );
        expect(result).toBe('1.2.4');
    });

    test('should display target input when provided', async () => {
        mockGetUserChoice.mockResolvedValue('c');

        const result = await confirmVersionInteractively('1.2.3', '1.2.4', 'patch');

        expect(mockLogger.info).toHaveBeenCalledWith('   Target input: patch');
        expect(result).toBe('1.2.4');
    });

    test('should handle custom version input', async () => {
        mockGetUserChoice.mockResolvedValue('e');
        mockGetUserTextInput.mockResolvedValue('2.0.0');

        const result = await confirmVersionInteractively('1.2.3', '1.2.4');

        expect(mockGetUserTextInput).toHaveBeenCalledWith('\n📝 Enter the version number (e.g., "4.30.0"):');
        expect(mockLogger.info).toHaveBeenCalledWith('✅ Using custom version: 2.0.0');
        expect(result).toBe('2.0.0');
    });

    test('should handle custom version with v prefix', async () => {
        mockGetUserChoice.mockResolvedValue('e');
        mockGetUserTextInput.mockResolvedValue('v2.0.0');

        const result = await confirmVersionInteractively('1.2.3', '1.2.4');

        expect(mockLogger.info).toHaveBeenCalledWith('✅ Using custom version: 2.0.0');
        expect(result).toBe('2.0.0');
    });

    test('should throw error for invalid custom version format', async () => {
        mockGetUserChoice.mockResolvedValue('e');
        mockGetUserTextInput.mockResolvedValue('invalid-version');

        await expect(confirmVersionInteractively('1.2.3', '1.2.4')).rejects.toThrow(
            'Invalid version format: invalid-version. Expected format: "x.y.z"'
        );
    });

    test('should throw error when user aborts', async () => {
        mockGetUserChoice.mockResolvedValue('a');

        await expect(confirmVersionInteractively('1.2.3', '1.2.4')).rejects.toThrow(
            'Release aborted by user'
        );
    });

    test('should throw error for unexpected choice', async () => {
        mockGetUserChoice.mockResolvedValue('x');

        await expect(confirmVersionInteractively('1.2.3', '1.2.4')).rejects.toThrow(
            'Unexpected choice: x'
        );
    });

    test('should validate various custom version formats', async () => {
        // Test valid formats
        const validVersions = ['0.0.1', '1.0.0', '10.20.30', '999.999.999'];

        for (const version of validVersions) {
            mockGetUserChoice.mockResolvedValue('e');
            mockGetUserTextInput.mockResolvedValue(version);

            const result = await confirmVersionInteractively('1.2.3', '1.2.4');
            expect(result).toBe(version);
        }
    });

    test('should reject invalid custom version formats', async () => {
        const invalidVersions = ['1.2', '1', 'abc', '1.2.3.4', '1.2.3-alpha'];

        for (const version of invalidVersions) {
            mockGetUserChoice.mockResolvedValue('e');
            mockGetUserTextInput.mockResolvedValue(version);

            await expect(confirmVersionInteractively('1.2.3', '1.2.4')).rejects.toThrow(
                `Invalid version format: ${version}. Expected format: "x.y.z"`
            );
        }
    });

    test('should handle edge cases with version display', async () => {
        mockGetUserChoice.mockResolvedValue('c');

        // Test with versions that have leading zeros, etc.
        const result = await confirmVersionInteractively('v01.02.03', '01.02.04', 'PATCH');

        expect(mockLogger.info).toHaveBeenCalledWith('   Current version: v01.02.03');
        expect(mockLogger.info).toHaveBeenCalledWith('   Proposed version: 01.02.04');
        expect(mockLogger.info).toHaveBeenCalledWith('   Target input: PATCH');
        expect(result).toBe('01.02.04');
    });

    test('should not display target input when not provided', async () => {
        mockGetUserChoice.mockResolvedValue('c');

        await confirmVersionInteractively('1.2.3', '1.2.4');

        // Verify target input line was not called
        const targetInputCalls = mockLogger.info.mock.calls.filter(
            (call: any[]) => call[0].includes('Target input')
        );
        expect(targetInputCalls).toHaveLength(0);
    });
});

describe('archiveAudio', () => {
    let mockStorage: any;
    let mockLogger: any;

    beforeEach(() => {
        // Mock Storage
        mockStorage = {
            ensureDirectory: vi.fn().mockResolvedValue(undefined),
            isFileReadable: vi.fn(),
            writeFile: vi.fn().mockResolvedValue(undefined)
        };
        vi.spyOn(Storage, 'create').mockReturnValue(mockStorage);

        // Mock Logger
        mockLogger = {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn()
        };

        // Mock the getLogger function
        vi.spyOn(Logging, 'getLogger').mockReturnValue(mockLogger);

        // Mock fs.promises.readFile
        vi.spyOn(fs.promises, 'readFile').mockResolvedValue(Buffer.from('audio data'));

        // Mock Date
        const mockDate = new Date('2025-01-07T10:30:45Z');
        vi.useFakeTimers();
        vi.setSystemTime(mockDate);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    test('should archive audio file and transcription successfully', async () => {
        mockStorage.isFileReadable.mockResolvedValue(true);

        const result = await archiveAudio('/path/to/audio.wav', 'Test transcription', 'output');

        expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('output');
        expect(mockStorage.isFileReadable).toHaveBeenCalledWith('/path/to/audio.wav');
        expect(fs.promises.readFile).toHaveBeenCalledWith('/path/to/audio.wav');
        expect(mockStorage.writeFile).toHaveBeenCalledWith(
            'output/250107-0530-review-audio.wav',
            expect.any(Buffer),
            'binary'
        );
        expect(mockStorage.writeFile).toHaveBeenCalledWith(
            'output/250107-0530-review-transcript.md',
            expect.stringContaining('Test transcription'),
            'utf8'
        );

        expect(result).toEqual({
            audioPath: 'output/250107-0530-review-audio.wav',
            transcriptPath: 'output/250107-0530-review-transcript.md'
        });
    });

    test('should handle missing audio file gracefully', async () => {
        mockStorage.isFileReadable.mockResolvedValue(false);

        const result = await archiveAudio('/path/to/missing.wav', 'Test transcription', 'output');

        expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('output');
        expect(mockStorage.isFileReadable).toHaveBeenCalledWith('/path/to/missing.wav');
        expect(fs.promises.readFile).not.toHaveBeenCalled();
        expect(mockLogger.warn).toHaveBeenCalledWith(
            'Original audio file not found or not readable: %s',
            '/path/to/missing.wav'
        );

        // Should still write transcription
        expect(mockStorage.writeFile).toHaveBeenCalledWith(
            'output/250107-0530-review-transcript.md',
            expect.stringContaining('Test transcription'),
            'utf8'
        );

        expect(result).toEqual({
            audioPath: 'output/250107-0530-review-audio.wav',
            transcriptPath: 'output/250107-0530-review-transcript.md'
        });
    });

    test('should use default output directory when not specified', async () => {
        mockStorage.isFileReadable.mockResolvedValue(true);

        const result = await archiveAudio('/path/to/audio.wav', 'Test transcription');

        expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('output');
        expect(result.audioPath).toBe('output/250107-0530-review-audio.wav');
        expect(result.transcriptPath).toBe('output/250107-0530-review-transcript.md');
    });

    test('should handle different audio file extensions', async () => {
        mockStorage.isFileReadable.mockResolvedValue(true);

        const result = await archiveAudio('/path/to/audio.mp3', 'Test transcription', 'output');

        expect(result.audioPath).toBe('output/250107-0530-review-audio.mp3');
    });

    test('should format transcription content correctly', async () => {
        mockStorage.isFileReadable.mockResolvedValue(true);

        await archiveAudio('/path/to/audio.wav', 'Test transcription text', 'output');

        const transcriptCall = mockStorage.writeFile.mock.calls.find(
            (call: any[]) => call[0].includes('review-transcript.md')
        );
        expect(transcriptCall[1]).toContain('# Audio Transcription Archive');
        expect(transcriptCall[1]).toContain('**Original Audio File:** /path/to/audio.wav');
        expect(transcriptCall[1]).toContain('**Archived:** 2025-01-07T10:30:45.000Z');
        expect(transcriptCall[1]).toContain('## Transcription');
        expect(transcriptCall[1]).toContain('Test transcription text');
    });

    test('should handle storage errors', async () => {
        mockStorage.ensureDirectory.mockRejectedValue(new Error('Storage error'));

        await expect(archiveAudio('/path/to/audio.wav', 'Test transcription', 'output'))
            .rejects
            .toThrow('Audio archiving failed: Storage error');

        expect(mockLogger.error).toHaveBeenCalledWith(
            'Failed to archive audio: %s',
            'Storage error'
        );
    });

    test('should handle file read errors', async () => {
        mockStorage.isFileReadable.mockResolvedValue(true);
        vi.spyOn(fs.promises, 'readFile').mockRejectedValue(new Error('File read error'));

        await expect(archiveAudio('/path/to/audio.wav', 'Test transcription', 'output'))
            .rejects
            .toThrow('Audio archiving failed: File read error');
    });

    test('should log success message', async () => {
        mockStorage.isFileReadable.mockResolvedValue(true);

        await archiveAudio('/path/to/audio.wav', 'Test transcription', 'output');

        expect(mockLogger.info).toHaveBeenCalledWith(
            '📁 Audio archived successfully - Audio: %s, Transcript: %s',
            '250107-0530-review-audio.wav',
            '250107-0530-review-transcript.md'
        );
    });
});
