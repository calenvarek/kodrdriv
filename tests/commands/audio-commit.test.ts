import { vi, describe, it, expect, beforeEach, afterEach, MockedFunction } from 'vitest';
import { execute } from '../../src/commands/audio-commit';
import { Config } from '../../src/types';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '@eldrforge/ai-service';
import { execute as executeCommit } from '../../src/commands/commit';
import { createAudioRecordingCountdown } from '../../src/util/countdown';
import { getTimestampedAudioFilename } from '../../src/util/general';
import * as StorageAdapter from '../../src/util/storageAdapter';
import * as LoggerAdapter from '../../src/util/loggerAdapter';
import path from 'path';

// Mock the logging module
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    })),
    getDryRunLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

vi.mock('../../src/commands/commit');
vi.mock('@theunwalked/unplayable');
vi.mock('@eldrforge/ai-service');
vi.mock('../../src/util/countdown');
vi.mock('../../src/util/general');
vi.mock('../../src/util/storageAdapter');
vi.mock('../../src/util/loggerAdapter');
vi.mock('path');

describe('audio-commit', () => {
    let mockLogger: any;

    // Helper function to create base config with required properties
    const createBaseConfig = (overrides: Partial<Config> = {}): Config => ({
        configDirectory: '/test/config',
        discoveredConfigDirs: ['/test/config'],
        resolvedConfigDirs: ['/test/config'],
        ...overrides
    });

    beforeEach(async () => {
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        // Setup logging mocks
        const Logging = await import('../../src/logging');
        (Logging.getLogger as MockedFunction<typeof Logging.getLogger>).mockReturnValue(mockLogger);
        (Logging.getDryRunLogger as MockedFunction<typeof Logging.getDryRunLogger>).mockReturnValue(mockLogger);

        // Setup adapter mocks
        vi.mocked(StorageAdapter.createStorageAdapter).mockReturnValue({} as any);
        vi.mocked(LoggerAdapter.createLoggerAdapter).mockReturnValue({
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn()
        } as any);

        // Setup countdown mock to return proper timer object
        (createAudioRecordingCountdown as MockedFunction<typeof createAudioRecordingCountdown>).mockReturnValue({
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn(),
            options: { totalSeconds: 60, beepAtSeconds: [30] },
            intervalId: null,
            currentSeconds: 60,
            hasBeepedAt30: false,
            hasBeepedAt10: false,
            hasBeepedAt5: false,
            hasBeepedAt4: false,
            hasBeepedAt3: false,
            hasBeepedAt2: false,
            hasBeepedAt1: false
        } as any);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('dry run mode', () => {
        it('should log dry run messages with provided audio file', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: true,
                audioCommit: {
                    file: 'test-audio.wav'
                },
                commit: {
                    direction: 'existing direction'
                }
            });
            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_FILE_DRY_RUN: Would process audio file | Mode: dry-run | File: %s | Action: Transcribe + generate commit', 'test-audio.wav');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_WORKFLOW_DRY_RUN: Would transcribe and generate message | Mode: dry-run | Purpose: Commit message from audio');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_DELEGATE_DRY_RUN: Would delegate to regular commit command | Mode: dry-run | Next: Standard commit flow');
            expect(result).toBe('DRY RUN: Would process audio, transcribe it, and generate commit message with audio context');
            // Should not call the actual commit command in dry run
            expect(executeCommit as MockedFunction<typeof executeCommit>).not.toHaveBeenCalled();
        });

        it('should log dry run messages without provided audio file', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: true,
                commit: {
                    direction: 'existing direction'
                }
            });
            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_RECORD_DRY_RUN: Would start audio recording | Mode: dry-run | Purpose: Commit context');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_TRANSCRIPT_DRY_RUN: Would transcribe and generate | Mode: dry-run | Purpose: Extract commit message');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_DELEGATE_DRY_RUN: Would delegate to regular commit command | Mode: dry-run | Next: Standard commit flow');
            expect(result).toBe('DRY RUN: Would process audio, transcribe it, and generate commit message with audio context');
            // Should not call the actual commit command in dry run
            expect(executeCommit as MockedFunction<typeof executeCommit>).not.toHaveBeenCalled();
        });
    });

    describe('audio recording and processing', () => {
        it('should process audio recording without provided file', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 60
                },
                outputDirectory: 'test-output',
                debug: true
            });
            const mockAudioResult = {
                cancelled: false,
                audioFilePath: 'test-output/recorded-audio.wav'
            };
            const mockTranscription = {
                text: 'This is a test transcription'
            };

            // Set up mocks
            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockAudioResult);
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('commit result');
            (path.join as MockedFunction<typeof path.join>).mockReturnValue('test-output/kodrdriv');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(processAudio as MockedFunction<typeof processAudio>).toHaveBeenCalledWith({
                file: undefined,
                maxRecordingTime: 60,
                outputDirectory: 'test-output',
                debug: true
            });
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).toHaveBeenCalledWith('test-output/recorded-audio.wav', expect.objectContaining({
                model: 'whisper-1',
                debug: true,
                storage: expect.any(Object),
                logger: expect.any(Object),
                onArchive: expect.any(Function)
            }));
            expect(executeCommit as MockedFunction<typeof executeCommit>).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'This is a test transcription'
                }
            });
            expect(result).toBe('commit result');
        });

        it('should process provided audio file', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'existing-audio.wav'
                },
                outputDirectory: 'test-output',
                debug: false
            });
            const mockAudioResult = {
                cancelled: false,
                audioFilePath: 'unused-path.wav' // This should be ignored when file is provided
            };
            const mockTranscription = {
                text: 'Transcription from provided file'
            };

            // Set up mocks
            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockAudioResult);
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('file commit result');
            (path.join as MockedFunction<typeof path.join>).mockReturnValue('test-output/kodrdriv');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(processAudio as MockedFunction<typeof processAudio>).toHaveBeenCalledWith({
                file: 'existing-audio.wav',
                maxRecordingTime: undefined,
                outputDirectory: 'test-output',
                debug: false
            });
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).toHaveBeenCalledWith('existing-audio.wav', expect.objectContaining({
                model: 'whisper-1',
                debug: false,
                storage: expect.any(Object),
                logger: expect.any(Object),
                onArchive: expect.any(Function)
            }));
            expect(executeCommit as MockedFunction<typeof executeCommit>).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'Transcription from provided file'
                }
            });
            expect(result).toBe('file commit result');
        });

        it('should handle maxRecordingTime configuration', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 120
                },
                debug: false
            });
            const mockTranscription = {
                text: 'Recorded with max time'
            };

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('max time commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(processAudio as MockedFunction<typeof processAudio>).toHaveBeenCalledWith({
                file: undefined,
                maxRecordingTime: 120,
                outputDirectory: 'output',
                debug: false
            });
            expect(result).toBe('max time commit');
        });

        it('should use fallback filename when audioFilePath is not provided', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                outputDirectory: 'test-output'
            });
            const mockAudioResult = {
                cancelled: false
                // No audioFilePath provided
            };
            const mockTranscription = {
                text: 'Fallback transcription'
            };

            // Set up mocks
            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockAudioResult);
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('fallback commit');
            (getTimestampedAudioFilename as MockedFunction<typeof getTimestampedAudioFilename>).mockReturnValue('fallback-audio.wav');
            (path.join as MockedFunction<typeof path.join>).mockImplementation((...args) => args.join('/'));

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(getTimestampedAudioFilename).toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_COMMIT_FILENAME_GENERATED: Using generated filename for audio | Filename: %s | Warning: May not match actual file from unplayable', 'test-output/fallback-audio.wav');
            expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_COMMIT_FILENAME_NOTE: Filename mismatch possible | Tool: unplayable | Impact: May need manual file lookup');
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).toHaveBeenCalledWith('test-output/fallback-audio.wav', expect.any(Object));
            expect(result).toBe('fallback commit');
        });

        it('should preserve existing commit direction when audio context is empty', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'silent-audio.wav'
                },
                commit: {
                    direction: 'existing direction'
                }
            });
            const mockAudioResult = {
                cancelled: false,
                audioFilePath: 'silent-audio.wav'
            };
            const mockTranscription = {
                text: '   ' // Empty trimmed text
            };

            // Set up mocks
            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue(mockAudioResult);
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue(mockTranscription);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('silent commit result');
            (path.join as MockedFunction<typeof path.join>).mockReturnValue('output/kodrdriv');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_COMMIT_NO_CONTENT: No audio content transcribed | Reason: Empty or invalid | Action: Proceeding without audio context');
            expect(executeCommit as MockedFunction<typeof executeCommit>).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'existing direction'
                }
            });
            expect(result).toBe('silent commit result');
        });
    });

    describe('countdown timer functionality', () => {
        it('should start and stop countdown timer when recording with maxRecordingTime', async () => {
            // Arrange
            const mockTimer = {
                start: vi.fn().mockResolvedValue(undefined),
                stop: vi.fn(),
                options: { totalSeconds: 90, beepAtSeconds: [30] },
                intervalId: null,
                currentSeconds: 90,
                hasBeepedAt30: false,
                hasBeepedAt10: false,
                hasBeepedAt5: false,
                hasBeepedAt4: false,
                hasBeepedAt3: false,
                hasBeepedAt2: false,
                hasBeepedAt1: false
            };
            (createAudioRecordingCountdown as MockedFunction<typeof createAudioRecordingCountdown>).mockReturnValue(mockTimer as any);

            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 90
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'timer-audio.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Timer test'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('timer commit');

            // Act
            await execute(mockConfig);

            // Assert
            expect(createAudioRecordingCountdown).toHaveBeenCalledWith(90);
            expect(mockTimer.start).toHaveBeenCalled();
            expect(mockTimer.stop).toHaveBeenCalled();
        });

        it('should not create countdown timer when processing provided file', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'provided.wav',
                    maxRecordingTime: 60
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'provided.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'No timer needed'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('no timer commit');

            // Act
            await execute(mockConfig);

            // Assert
            expect(createAudioRecordingCountdown).not.toHaveBeenCalled();
        });

        it('should not create countdown timer when maxRecordingTime is not set', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {}
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'no-timer.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'No timer set'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('no timer commit');

            // Act
            await execute(mockConfig);

            // Assert
            expect(createAudioRecordingCountdown).not.toHaveBeenCalled();
        });

        it('should handle countdown timer errors gracefully', async () => {
            // Arrange
            const mockTimer = {
                start: vi.fn().mockRejectedValue(new Error('Timer failed')),
                stop: vi.fn(),
                options: { totalSeconds: 60, beepAtSeconds: [30] },
                intervalId: null,
                currentSeconds: 60,
                hasBeepedAt30: false,
                hasBeepedAt10: false,
                hasBeepedAt5: false,
                hasBeepedAt4: false,
                hasBeepedAt3: false,
                hasBeepedAt2: false,
                hasBeepedAt1: false
            };
            (createAudioRecordingCountdown as MockedFunction<typeof createAudioRecordingCountdown>).mockReturnValue(mockTimer as any);

            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 60
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'timer-error.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Timer error handled'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('timer error commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockTimer.start).toHaveBeenCalled();
            expect(mockTimer.stop).toHaveBeenCalled();
            expect(result).toBe('timer error commit');
        });
    });

    describe('user cancellation scenarios', () => {
        it('should handle user cancellation from processAudio', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 60
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: true
            });

            // Act & Assert
            await expect(execute(mockConfig)).rejects.toThrow('Audio commit cancelled by user');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_CANCELLED: Audio commit cancelled by user | Reason: User choice | Status: aborted');
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).not.toHaveBeenCalled();
            expect(executeCommit as MockedFunction<typeof executeCommit>).not.toHaveBeenCalled();
        });

        it('should convert CancellationError to UserCancellationError', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {}
            });

            const cancellationError = new Error('User cancelled recording');
            cancellationError.name = 'CancellationError';
            (processAudio as MockedFunction<typeof processAudio>).mockRejectedValue(cancellationError);

            // Act & Assert
            await expect(execute(mockConfig)).rejects.toThrow('User cancelled recording');
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).not.toHaveBeenCalled();
            expect(executeCommit as MockedFunction<typeof executeCommit>).not.toHaveBeenCalled();
        });

        it('should handle legacy CancellationError instances', async () => {
            // First, let's import the actual CancellationError to properly test it
            const { CancellationError } = await import('../../src/error/CancellationError');

            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {}
            });

            const legacyCancellationError = new CancellationError('Legacy cancellation');
            (processAudio as MockedFunction<typeof processAudio>).mockRejectedValue(legacyCancellationError);

            // Act & Assert
            await expect(execute(mockConfig)).rejects.toThrow('Legacy cancellation');
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).not.toHaveBeenCalled();
            expect(executeCommit as MockedFunction<typeof executeCommit>).not.toHaveBeenCalled();
        });

        it('should log cancellation message and re-throw error', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {}
            });

            const { UserCancellationError } = await import('../../src/error/CommandErrors');
            const userCancellationError = new UserCancellationError('User cancelled operation');
            (processAudio as MockedFunction<typeof processAudio>).mockRejectedValue(userCancellationError);

            // Act & Assert
            await expect(execute(mockConfig)).rejects.toThrow('User cancelled operation');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_ERROR: Error during audio commit | Error: User cancelled operation');
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).not.toHaveBeenCalled();
            expect(executeCommit as MockedFunction<typeof executeCommit>).not.toHaveBeenCalled();
        });
    });

    describe('audio processing error handling', () => {
        it('should handle processAudio failure and continue with empty audio context', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'invalid-file.wav'
                },
                commit: {
                    direction: 'fallback direction'
                }
            });

            const processingError = new Error('Failed to process audio file');
            (processAudio as MockedFunction<typeof processAudio>).mockRejectedValue(processingError);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('fallback commit result');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_COMMIT_PROCESSING_FAILED: Audio processing failed | Error: %s | Impact: No audio context available', 'Failed to process audio file');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_FALLBACK: Proceeding without audio context | Mode: fallback | Next: Standard commit generation');
            expect(executeCommit as MockedFunction<typeof executeCommit>).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'fallback direction'
                }
            });
            expect(result).toBe('fallback commit result');
        });

        it('should handle transcription failure and continue with empty audio context', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'valid-audio.wav'
                },
                commit: {
                    direction: 'original direction'
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'valid-audio.wav'
            });
            const transcriptionError = new Error('Transcription service unavailable');
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockRejectedValue(transcriptionError);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('transcription error commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_COMMIT_PROCESSING_FAILED: Audio processing failed | Error: %s | Impact: No audio context available', 'Transcription service unavailable');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_FALLBACK: Proceeding without audio context | Mode: fallback | Next: Standard commit generation');
            expect(executeCommit as MockedFunction<typeof executeCommit>).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'original direction'
                }
            });
            expect(result).toBe('transcription error commit');
        });

        it('should handle empty transcription results', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'silent-audio.wav'
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'silent-audio.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: ''
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('empty transcription commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_COMMIT_NO_CONTENT: No audio content transcribed | Reason: Empty or invalid | Action: Proceeding without audio context');
            expect(executeCommit as MockedFunction<typeof executeCommit>).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: ''
                }
            });
            expect(result).toBe('empty transcription commit');
        });

        it('should handle commit execution failure', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'good-audio.wav'
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'good-audio.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Good transcription'
            });
            const commitError = new Error('Git repository not found');
            (executeCommit as MockedFunction<typeof executeCommit>).mockRejectedValue(commitError);

            // Act & Assert
            await expect(execute(mockConfig)).rejects.toThrow('Git repository not found');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_COMMIT_FAILED: Audio commit command failed | Error: Git repository not found | Impact: Commit not generated');
        });

        it('should handle errors with cause property', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {}
            });

            const causeError = new Error('Root cause error');
            const mainError = new Error('Main error');
            (mainError as any).cause = causeError;

            (processAudio as MockedFunction<typeof processAudio>).mockRejectedValue(mainError);
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('error with cause commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_COMMIT_PROCESSING_FAILED: Audio processing failed | Error: %s | Impact: No audio context available', 'Main error');
            expect(result).toBe('error with cause commit');
        });
    });

    describe('configuration edge cases', () => {
        it('should handle missing audioCommit configuration', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false
                // No audioCommit property
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'default-audio.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Default config transcription'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('default config commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(processAudio as MockedFunction<typeof processAudio>).toHaveBeenCalledWith({
                file: undefined,
                maxRecordingTime: undefined,
                outputDirectory: 'output',
                debug: undefined
            });
            expect(result).toBe('default config commit');
        });

        it('should handle missing outputDirectory in config', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'test.wav'
                }
                // No outputDirectory property
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'No output dir transcription'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('no output dir commit');
            (path.join as MockedFunction<typeof path.join>).mockReturnValue('output/kodrdriv');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(processAudio as MockedFunction<typeof processAudio>).toHaveBeenCalledWith({
                file: 'test.wav',
                maxRecordingTime: undefined,
                outputDirectory: 'output',
                debug: undefined
            });
            expect(transcribeAudio as MockedFunction<typeof transcribeAudio>).toHaveBeenCalledWith('test.wav', expect.objectContaining({
                model: 'whisper-1',
                debug: undefined,
                storage: expect.any(Object),
                logger: expect.any(Object),
                onArchive: expect.any(Function)
            }));
            expect(result).toBe('no output dir commit');
        });

        it('should handle zero maxRecordingTime', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 0
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'zero-time.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Zero time transcription'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('zero time commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(createAudioRecordingCountdown).not.toHaveBeenCalled();
            expect(result).toBe('zero time commit');
        });

        it('should handle negative maxRecordingTime', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: -30
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'negative-time.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Negative time transcription'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('negative time commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(createAudioRecordingCountdown).not.toHaveBeenCalled();
            expect(result).toBe('negative time commit');
        });
    });

    describe('logging and debug scenarios', () => {
        it('should log debug information when debug is enabled', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                debug: true,
                audioCommit: {
                    file: 'debug-audio.wav'
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'debug-audio.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Debug transcription text'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('debug commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('AUDIO_COMMIT_TRANSCRIPT_SUCCESS'));
            expect(mockLogger.debug).toHaveBeenCalledWith('Transcribed text: %s', 'Debug transcription text');
            expect(result).toBe('debug commit');
        });

        it('should provide appropriate logging for recording instructions', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {}
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'recording.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'Recording instructions test'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('instructions commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_RECORDING_STARTING: Starting audio recording | Purpose: Capture commit context | Tool: unplayable');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_RECORDING_ACTIVE: Recording in progress | Action: Press ENTER to stop | Alternative: Press C to cancel');
            expect(result).toBe('instructions commit');
        });

        it('should not show recording instructions when processing provided file', async () => {
            // Arrange
            const mockConfig = createBaseConfig({
                dryRun: false,
                audioCommit: {
                    file: 'provided-file.wav'
                }
            });

            (processAudio as MockedFunction<typeof processAudio>).mockResolvedValue({
                cancelled: false,
                audioFilePath: 'provided-file.wav'
            });
            (transcribeAudio as MockedFunction<typeof transcribeAudio>).mockResolvedValue({
                text: 'No instructions needed'
            });
            (executeCommit as MockedFunction<typeof executeCommit>).mockResolvedValue('no instructions commit');

            // Act
            const result = await execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_COMMIT_RECORDING_STARTING: Starting audio recording | Purpose: Capture commit context | Tool: unplayable');
            expect(mockLogger.info).not.toHaveBeenCalledWith('AUDIO_COMMIT_RECORDING_ACTIVE: Recording in progress | Action: Press ENTER to stop | Alternative: Press C to cancel');
            expect(result).toBe('no instructions commit');
        });
    });
});
