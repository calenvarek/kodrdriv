import { vi, describe, it, expect, beforeEach, afterEach, MockedFunction } from 'vitest';
import { execute } from '../../src/commands/audio-review';
import { Config } from '../../src/types';
import { getLogger } from '../../src/logging';
import { execute as executeReview } from '../../src/commands/review';
import { CancellationError } from '@eldrforge/shared';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '@eldrforge/ai-service';
import { getTimestampedAudioFilename } from '../../src/util/general';
import * as Storage from '@eldrforge/shared';
import * as StorageAdapter from '../../src/util/storageAdapter';
import * as LoggerAdapter from '../../src/util/loggerAdapter';
import path from 'path';
import * as Logging from '../../src/logging';
import * as ReviewCommand from '../../src/commands/review';
import * as Unplayable from '@theunwalked/unplayable';
import * as AIService from '@eldrforge/ai-service';
import * as Countdown from '../../src/util/countdown';

// Mock the logging module
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(),
    getDryRunLogger: vi.fn()
}));
vi.mock('../../src/commands/review');
vi.mock('@theunwalked/unplayable');
vi.mock('@eldrforge/ai-service');
vi.mock('../../src/util/general');
vi.mock('@eldrforge/shared');
vi.mock('../../src/util/storageAdapter');
vi.mock('../../src/util/loggerAdapter');
vi.mock('../../src/util/countdown');

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
    // Create mock logger instance
    const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    };

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup logging mocks
        vi.mocked(Logging.getLogger).mockReturnValue(mockLogger as any);
        vi.mocked(Logging.getDryRunLogger).mockReturnValue(mockLogger as any);

        vi.mocked(Storage.createStorage).mockReturnValue(mockStorage);

        // Mock adapter functions
        vi.mocked(StorageAdapter.createStorageAdapter).mockReturnValue({} as any);
        vi.mocked(LoggerAdapter.createLoggerAdapter).mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        } as any);

        vi.mocked(AIService.transcribeAudio).mockResolvedValue({ text: 'Mock transcription' } as any);
        vi.mocked(ReviewCommand.execute).mockResolvedValue('Mock review result');
        vi.mocked(Unplayable.processAudio).mockResolvedValue({
            audioFilePath: '/mock/audio.wav'
        } as any);
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
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_FILES_FOUND: Found audio files in directory | Count: 2 | Directory: /test/directory | Status: ready-for-processing');
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
                expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_REVIEW_NO_FILES: No audio files found in directory | Directory: %s | Extensions: .mp3, .wav, .m4a, .ogg | Action: Nothing to process', '/test/directory');
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
                expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_REVIEW_BATCH_FAILED: Directory batch processing failed | Error: %s | Impact: Batch incomplete', 'Directory error');
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

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_FILE_DRY_RUN: Would process audio file | Mode: dry-run | File: %s | Action: Transcribe + analyze', '/test/audio.wav');
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_WORKFLOW_DRY_RUN: Would transcribe and analyze | Mode: dry-run | Purpose: Review context from audio');
                expect(result).toBe('DRY RUN: Would process audio, transcribe it, and perform review analysis with audio context');
                // Should not call the actual review command in dry run
                expect(executeReview).not.toHaveBeenCalled();
            });

            it('should handle dry run without file', async () => {
                const config = {
                    ...baseConfig,
                    dryRun: true
                };

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_RECORD_DRY_RUN: Would start audio recording | Mode: dry-run | Purpose: Review context');
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_TRANSCRIPT_DRY_RUN: Would transcribe and analyze | Mode: dry-run | Purpose: Extract review content');
                expect(result).toBe('DRY RUN: Would process audio, transcribe it, and perform review analysis with audio context');
                // Should not call the actual review command in dry run
                expect(executeReview).not.toHaveBeenCalled();
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

                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_BATCH_STARTING: Starting directory batch audio review | Directory: %s | Mode: batch | Purpose: Process all audio files', '/test/directory');
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_BATCH_DRY_RUN: Would discover and process audio files | Mode: dry-run | Directory: %s | Action: Discover + transcribe + analyze', '/test/directory');
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

                vi.mocked(Unplayable.processAudio).mockResolvedValue(mockProcessAudioResult);
                vi.mocked(AIService.transcribeAudio).mockResolvedValue(mockTranscription);
                vi.mocked(ReviewCommand.execute).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(vi.mocked(Unplayable.processAudio)).toHaveBeenCalledWith({
                    file: '/test/audio.wav',
                    maxRecordingTime: undefined,
                    outputDirectory: 'output',
                    debug: false
                });
                expect(vi.mocked(AIService.transcribeAudio)).toHaveBeenCalledWith('/test/audio.wav', expect.objectContaining({
                    model: "whisper-1",
                    debug: false,
                    storage: expect.any(Object),
                    logger: expect.any(Object),
                    onArchive: expect.any(Function)
                }));
                expect(result).toBe(mockReviewResult);
            });

            it.skip('should handle cancelled recording', async () => {
                const config = baseConfig;

                // Override the beforeEach mock for this specific test
                vi.mocked(Unplayable.processAudio).mockResolvedValueOnce({
                    cancelled: true,
                    audioFilePath: undefined
                } as any);

                // The execute function should throw CancellationError when cancelled
                await expect(execute(config)).rejects.toThrowError(expect.objectContaining({
                    name: 'CancellationError',
                    message: 'Audio review cancelled by user'
                }));

                // Verify the cancellation was logged
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_CANCELLED: Audio review cancelled by user | Reason: User choice | Status: aborted');

                // Review.execute should NOT have been called
                expect(ReviewCommand.execute).not.toHaveBeenCalled();
            });

            it('should handle audio processing error gracefully', async () => {
                const config = baseConfig;
                const error = new Error('Audio processing failed');

                vi.mocked(Unplayable.processAudio).mockRejectedValue(error);

                const mockReviewResult = 'Review result without audio';
                vi.mocked(ReviewCommand.execute).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_REVIEW_PROCESSING_FAILED: Audio processing failed | Error: %s | Impact: No audio context available', 'Audio processing failed');
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_FALLBACK: Proceeding without audio context | Mode: fallback | Next: Standard review analysis');
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

                vi.mocked(Unplayable.processAudio).mockResolvedValue(mockProcessAudioResult);
                vi.mocked(AIService.transcribeAudio).mockResolvedValue(mockTranscription);
                vi.mocked(ReviewCommand.execute).mockResolvedValue(mockReviewResult);

                const result = await execute(config);

                expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_REVIEW_NO_CONTENT: No audio content transcribed | Reason: Empty or invalid | Action: Proceeding without audio context');
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

                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_RECORDING_STARTING: Starting audio recording | Purpose: Capture review context | Tool: unplayable');
                expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_REVIEW_RECORDING_ACTIVE: Recording in progress | Action: Press ENTER to stop | Alternative: Press C to cancel');
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

                expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_REVIEW_FILENAME_NOTE: Filename mismatch possible | Tool: unplayable | Impact: May need manual file lookup');
                expect(result).toBe(mockReviewResult);
            });
        });

        describe('countdown timer integration', () => {
            let mockCountdownTimer: any;

            beforeEach(() => {
                mockCountdownTimer = {
                    start: vi.fn().mockResolvedValue(undefined),
                    stop: vi.fn()
                };

                // Set up the countdown mock properly
                vi.mocked(Countdown.createAudioRecordingCountdown).mockReturnValue(mockCountdownTimer);
            });

            it('should start countdown timer when recording with maxRecordingTime', async () => {
                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: 'test-audio.wav'
                };

                vi.mocked(processAudio).mockResolvedValue(mockProcessAudioResult);
                vi.mocked(transcribeAudio).mockResolvedValue({
                    text: 'test transcription'
                });
                vi.mocked(executeReview).mockResolvedValue('Review completed');

                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    audioReview: {
                        maxRecordingTime: 120 // 2 minutes
                    }
                };

                await execute(config);

                expect(vi.mocked(Countdown.createAudioRecordingCountdown)).toHaveBeenCalledWith(120);
                expect(mockCountdownTimer.start).toHaveBeenCalled();
                expect(mockCountdownTimer.stop).toHaveBeenCalled();
            });

            it('should not start countdown timer when processing existing file', async () => {
                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: 'existing-audio.wav'
                };

                vi.mocked(processAudio).mockResolvedValue(mockProcessAudioResult);
                vi.mocked(transcribeAudio).mockResolvedValue({
                    text: 'test transcription'
                });
                vi.mocked(executeReview).mockResolvedValue('Review completed');

                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    audioReview: {
                        file: 'existing-audio.wav',
                        maxRecordingTime: 120
                    }
                };

                await execute(config);

                expect(vi.mocked(Countdown.createAudioRecordingCountdown)).not.toHaveBeenCalled();
                expect(mockCountdownTimer.start).not.toHaveBeenCalled();
            });

            it('should not start countdown timer when maxRecordingTime is not set', async () => {
                const mockProcessAudioResult = {
                    cancelled: false,
                    audioFilePath: 'test-audio.wav'
                };

                vi.mocked(processAudio).mockResolvedValue(mockProcessAudioResult);
                vi.mocked(transcribeAudio).mockResolvedValue({
                    text: 'test transcription'
                });
                vi.mocked(executeReview).mockResolvedValue('Review completed');

                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    audioReview: {}
                };

                await execute(config);

                expect(vi.mocked(Countdown.createAudioRecordingCountdown)).not.toHaveBeenCalled();
            });

            it('should stop countdown timer even when audio processing fails', async () => {
                vi.mocked(processAudio).mockRejectedValue(new Error('Recording failed'));

                const config: Config = {
                    configDirectory: '/test',
                    discoveredConfigDirs: [],
                    resolvedConfigDirs: [],
                    audioReview: {
                        maxRecordingTime: 60
                    }
                };

                await execute(config);

                expect(vi.mocked(Countdown.createAudioRecordingCountdown)).toHaveBeenCalledWith(60);
                expect(mockCountdownTimer.start).toHaveBeenCalled();
                expect(mockCountdownTimer.stop).toHaveBeenCalled();
            });
        });
    });
});
