import { describe, test, expect } from 'vitest';
import { deepMerge, stringifyJSON, incrementPatchVersion, getOutputPath, getTimestampedFilename, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedCommitFilename, getTimestampedReleaseNotesFilename, getTimestampedAudioFilename, getTimestampedTranscriptFilename, getTimestampedReviewFilename, getTimestampedReviewNotesFilename, getTimestampedArchivedAudioFilename, getTimestampedArchivedTranscriptFilename, archiveAudio } from '../../src/util/general';
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
        expect(incrementPatchVersion('4.6.24-dev.0')).toBe('4.6.25');
        expect(incrementPatchVersion('v4.6.24-dev.0')).toBe('4.6.25');
        expect(incrementPatchVersion('1.2.3-alpha.1')).toBe('1.2.4');
        expect(incrementPatchVersion('1.2.3-beta')).toBe('1.2.4');
        expect(incrementPatchVersion('1.2.3-rc.1')).toBe('1.2.4');
        expect(incrementPatchVersion('1.2.3-snapshot')).toBe('1.2.4');
    });

    test('should handle complex pre-release versions', () => {
        expect(incrementPatchVersion('2.0.0-alpha.beta.1')).toBe('2.0.1');
        expect(incrementPatchVersion('v1.0.0-x.7.z.92')).toBe('1.0.1');
        expect(incrementPatchVersion('1.2.10-20130313144700')).toBe('1.2.11');
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
        expect(incrementPatchVersion('v1.2.03-dev.0')).toBe('1.2.4');
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
        expect(incrementPatchVersion('v1.2.-1-dev.0')).toBe('1.2.0');
    });

    test('should handle multiple dots in version (more than 3 parts)', () => {
        // The function now accepts versions with more than 3 parts (like semver with pre-release)
        expect(incrementPatchVersion('1.2.3.4')).toBe('1.2.4'); // Only uses first 3 parts for version
        expect(incrementPatchVersion('1.2.3.4.5')).toBe('1.2.4');
    });

    test('should handle edge cases with pre-release identifiers', () => {
        // Note: '1.2.3a' parses as 3 via parseInt, so it doesn't throw
        expect(incrementPatchVersion('1.2.3a')).toBe('1.2.4');
        expect(incrementPatchVersion('1.2.3-')).toBe('1.2.4');
        expect(incrementPatchVersion('v1.2.3-')).toBe('1.2.4');
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
