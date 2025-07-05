import { vi, describe, it, expect, beforeEach, afterEach, MockedFunction } from 'vitest';
import { execute } from '../../src/commands/audio-review';
import { Config } from '../../src/types';
import { getLogger } from '../../src/logging';
import { execute as executeReview } from '../../src/commands/review';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '../../src/util/openai';
import { getTimestampedAudioFilename } from '../../src/util/general';
import * as Storage from '../../src/util/storage';
import path from 'path';

// Mock all dependencies
vi.mock('../../src/logging');
vi.mock('../../src/commands/review');
vi.mock('@theunwalked/unplayable');
vi.mock('../../src/util/openai');
vi.mock('../../src/util/general');
vi.mock('../../src/util/storage');

// Mock logger 
const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
} as any;

// Mock storage that matches the Storage.Utility interface
const mockStorage = {
    exists: vi.fn(),
    isDirectory: vi.fn(),
    isFile: vi.fn(),
    isReadable: vi.fn(),
    isWritable: vi.fn(),
    isFileReadable: vi.fn(),
    isDirectoryWritable: vi.fn(),
    isDirectoryReadable: vi.fn().mockResolvedValue(true),
    createDirectory: vi.fn(),
    ensureDirectory: vi.fn(),
    readFile: vi.fn(),
    readStream: vi.fn(),
    writeFile: vi.fn(),
    rename: vi.fn(),
    forEachFileIn: vi.fn(),
    hashFile: vi.fn(),
    listFiles: vi.fn().mockResolvedValue([]),
    removeDirectory: vi.fn(),
} as any;

describe('audio-review command', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (getLogger as MockedFunction<typeof getLogger>).mockReturnValue(mockLogger);
        (Storage.create as MockedFunction<typeof Storage.create>).mockReturnValue(mockStorage);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Note: discoverAudioFiles and processSingleAudioFile are internal functions 
    // and are tested indirectly through the execute function

    describe('execute function', () => {
        const baseConfig: Config = {
            audioReview: {
                includeCommitHistory: true,
                includeRecentDiffs: true,
                includeReleaseNotes: true,
                includeGithubIssues: true,
                commitHistoryLimit: 10,
                diffHistoryLimit: 5,
                releaseNotesLimit: 3,
                githubIssuesLimit: 5,
                sendit: false,
                context: 'test context'
            },
            debug: false,
            // Add required properties from Cardigantime.Config
            configDirectory: '/test/config',
            discoveredConfigDirs: ['/test/config'],
            resolvedConfigDirs: ['/test/config']
        } as Config;

        describe('directory batch processing', () => {
            it('should process multiple audio files in directory', async () => {
                const config = {
                    ...baseConfig,
                    audioReview: {
                        ...baseConfig.audioReview,
                        directory: '/test/directory'
                    }
                };

                const mockFiles = ['/test/directory/file1.wav', '/test/directory/file2.mp3'];
                mockStorage.isDirectoryReadable.mockResolvedValue(true);
                mockStorage.listFiles.mockResolvedValue(['file1.wav', 'file2.mp3']);

                const mockTranscription = { text: 'Transcribed content' };
                const mockReviewResult = 'Review result';

                (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(result).toContain('Batch Audio Review Results (2 files)');
                expect(result).toContain('File: file1.wav');
                expect(result).toContain('File: file2.mp3');
                expect(mockLogger.info).toHaveBeenCalledWith('🎵 Starting directory batch audio review for: %s', '/test/directory');
            });

            it('should handle empty directory', async () => {
                const config = {
                    ...baseConfig,
                    audioReview: {
                        ...baseConfig.audioReview,
                        directory: '/test/directory'
                    }
                };

                mockStorage.isDirectoryReadable.mockResolvedValue(true);
                mockStorage.listFiles.mockResolvedValue([]);

                const result = await execute(config);

                expect(result).toBe('No audio files found to process');
                expect(mockLogger.warn).toHaveBeenCalledWith('No audio files found in directory: %s', '/test/directory');
            });

            it('should handle directory processing error', async () => {
                const config = {
                    ...baseConfig,
                    audioReview: {
                        ...baseConfig.audioReview,
                        directory: '/test/directory'
                    }
                };

                const error = new Error('Directory error');
                mockStorage.isDirectoryReadable.mockRejectedValue(error);

                await expect(execute(config)).rejects.toThrow('Directory error');
                expect(mockLogger.error).toHaveBeenCalledWith('Directory batch processing failed: %s', 'Directory error');
            });
        });

        describe('dry run mode', () => {
            it('should handle dry run with file', async () => {
                const config = {
                    ...baseConfig,
                    dryRun: true,
                    audioReview: {
                        ...baseConfig.audioReview,
                        file: '/test/audio.wav'
                    }
                };

                const mockReviewResult = 'Dry run review result';
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would process audio file: %s', '/test/audio.wav');
                expect(result).toBe(mockReviewResult);
            });

            it('should handle dry run without file', async () => {
                const config = {
                    ...baseConfig,
                    dryRun: true
                };

                const mockReviewResult = 'Dry run review result';
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would start audio recording for review context');
                expect(result).toBe(mockReviewResult);
            });

            it('should handle dry run directory mode', async () => {
                const config = {
                    ...baseConfig,
                    dryRun: true,
                    audioReview: {
                        ...baseConfig.audioReview,
                        directory: '/test/directory'
                    }
                };

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would discover and process all audio files in directory: %s', '/test/directory');
                expect(result).toBe('DRY RUN: Directory batch processing would be performed');
            });
        });

        describe('single file processing', () => {
            it('should process specified audio file', async () => {
                const config = {
                    ...baseConfig,
                    audioReview: {
                        ...baseConfig.audioReview,
                        file: '/test/audio.wav'
                    }
                };

                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: '/test/audio.wav'
                };
                const mockTranscription = { text: 'Transcribed content' };
                const mockReviewResult = 'Review result';

                (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockProcessAudioResult);
                (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(processAudio).toHaveBeenCalledWith({
                    file: '/test/audio.wav',
                    maxRecordingTime: undefined,
                    outputDirectory: 'output',
                    debug: false
                });
                expect(transcribeAudio).toHaveBeenCalledWith('/test/audio.wav', {
                    model: "whisper-1",
                    debug: false,
                    outputDirectory: path.join('output', 'kodrdriv')
                });
                expect(result).toBe(mockReviewResult);
            });

            it('should handle cancelled recording', async () => {
                const config = baseConfig;
                const mockProcessAudioResult = {
                    cancelled: true,
                    audioFilePath: undefined
                };

                (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockProcessAudioResult);

                // Mock process.exit to prevent actual exit but still throw to simulate termination
                const mockExit = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
                    // Don't throw here, just prevent actual exit
                    return undefined as never;
                }) as any);

                // The execute function should not return normally when cancelled
                const result = await execute(config);

                // Verify the cancellation was logged
                expect(mockLogger.info).toHaveBeenCalledWith('❌ Audio review cancelled by user');
                expect(mockExit).toHaveBeenCalledWith(0);

                // Since process.exit was mocked to not actually exit, the function returns undefined
                expect(result).toBeUndefined();

                mockExit.mockRestore();
            });

            it('should handle audio processing error gracefully', async () => {
                const config = baseConfig;
                const error = new Error('Audio processing failed');

                (processAudio as MockedFunction<typeof processAudio>).mockRejectedValue(error);

                const mockReviewResult = 'Review result without audio';
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.error).toHaveBeenCalledWith('Audio processing failed: %s', 'Audio processing failed');
                expect(mockLogger.info).toHaveBeenCalledWith('Proceeding with review analysis without audio context...');
                expect(result).toBe(mockReviewResult);
            });

            it('should handle empty transcription gracefully', async () => {
                const config = baseConfig;
                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: '/test/audio.wav'
                };
                const mockTranscription = { text: '' };
                const mockReviewResult = 'Review result';

                (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockProcessAudioResult);
                (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.warn).toHaveBeenCalledWith('No audio content was transcribed. Proceeding without audio context.');
                expect(result).toBe(mockReviewResult);
            });
        });

        describe('recording mode', () => {
            it('should handle recording with generated filename', async () => {
                const config = baseConfig;
                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: '/output/recorded_audio.wav'
                };
                const mockTranscription = { text: 'Recorded content' };
                const mockReviewResult = 'Review result';

                (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockProcessAudioResult);
                (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('🎙️  Starting audio recording for review context...');
                expect(mockLogger.info).toHaveBeenCalledWith('Press ENTER to stop recording or C to cancel');
                expect(result).toBe(mockReviewResult);
            });

            it('should handle fallback to generated filename', async () => {
                const config = baseConfig;
                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: undefined // No audio file path returned
                };
                const mockTranscription = { text: 'Recorded content' };
                const mockReviewResult = 'Review result';
                const mockTimestampedFilename = 'audio_20231201_120000.wav';

                (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockProcessAudioResult);
                (getTimestampedAudioFilename as MockedFunction<typeof getTimestampedAudioFilename>).mockReturnValue(mockTimestampedFilename);
                (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
                (executeReview as MockedFunction<typeof executeReview>).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.warn).toHaveBeenCalledWith('Using generated filename for recorded audio: %s', path.join('output', mockTimestampedFilename));
                expect(result).toBe(mockReviewResult);
            });
        });
    });
});
