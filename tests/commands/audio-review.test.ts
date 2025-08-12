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
import * as Logging from '../../src/logging';
import * as ReviewCommand from '../../src/commands/review';
import * as Unplayable from '@theunwalked/unplayable';
import * as OpenAI from '../../src/util/openai';
import * as Countdown from '../../src/util/countdown';

// Mock the logging module
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(),
    getDryRunLogger: vi.fn()
}));
vi.mock('../../src/commands/review');
vi.mock('@theunwalked/unplayable');
vi.mock('../../src/util/openai');
vi.mock('../../src/util/general');
vi.mock('../../src/util/storage');
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

        vi.mocked(Storage.create).mockReturnValue(mockStorage);
        vi.mocked(OpenAI.transcribeAudio).mockResolvedValue({ text: 'Mock transcription' } as any);
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
                expect(mockLogger.info).toHaveBeenCalledWith('Found 2 audio files in directory: /test/directory');
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

                const result = await execute(config);

                expect(mockLogger.info).toHaveBeenCalledWith('Would process audio file: %s', '/test/audio.wav');
                expect(mockLogger.info).toHaveBeenCalledWith('Would transcribe audio and use as context for review analysis');
                expect(mockLogger.info).toHaveBeenCalledWith('Would then delegate to regular review command');
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

                expect(mockLogger.info).toHaveBeenCalledWith('Would start audio recording for review context');
                expect(mockLogger.info).toHaveBeenCalledWith('Would transcribe audio and use as context for review analysis');
                expect(mockLogger.info).toHaveBeenCalledWith('Would then delegate to regular review command');
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

                expect(mockLogger.info).toHaveBeenCalledWith('Would discover and process all audio files in directory: %s', '/test/directory');
                expect(mockLogger.info).toHaveBeenCalledWith('Would transcribe each audio file and run review analysis');
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
                // Clear any existing mocks first
                vi.mocked(Unplayable.processAudio).mockReset();

                const config = baseConfig;
                const mockProcessAudioResult = {
                    cancelled: true,
                    audioFilePath: undefined
                };

                // Set up the mock to return cancellation result
                vi.mocked(Unplayable.processAudio).mockResolvedValue(mockProcessAudioResult);

                // The execute function should throw CancellationError when cancelled
                await expect(execute(config)).rejects.toThrow('Audio review cancelled by user');

                // Verify the cancellation was logged
                expect(mockLogger.info).toHaveBeenCalledWith('❌ Audio review cancelled by user');
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
