import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock external dependencies
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

vi.mock('../../src/commands/commit', () => ({
    execute: vi.fn()
}));

vi.mock('@theunwalked/unplayable', () => ({
    processAudio: vi.fn()
}));

vi.mock('../../src/util/openai', () => ({
    transcribeAudio: vi.fn()
}));

vi.mock('../../src/util/general', () => ({
    getTimestampedAudioFilename: vi.fn()
}));

vi.mock('path', () => ({
    default: {
        join: vi.fn()
    }
}));

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

describe('audio-commit', () => {
    let AudioCommit: any;
    let Logging: any;
    let CommitCommand: any;
    let Unplayable: any;
    let OpenAI: any;
    let General: any;
    let path: any;

    beforeEach(async () => {
        // Import modules after mocking
        Logging = await import('../../src/logging');
        CommitCommand = await import('../../src/commands/commit');
        Unplayable = await import('@theunwalked/unplayable');
        OpenAI = await import('../../src/util/openai');
        General = await import('../../src/util/general');
        path = (await import('path')).default;
        AudioCommit = await import('../../src/commands/audio-commit');
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockExit.mockClear();
    });

    describe('dry run mode', () => {
        it('should log dry run messages with provided audio file', async () => {
            // Arrange
            const mockConfig = {
                dryRun: true,
                audioCommit: {
                    file: 'test-audio.wav'
                },
                commit: {
                    direction: 'existing direction'
                }
            };
            const mockLogger = Logging.getLogger();
            CommitCommand.execute.mockResolvedValue('dry run commit result');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would process audio file: %s', 'test-audio.wav');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would transcribe audio and use as context for commit message generation');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would then delegate to regular commit command');
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'existing direction'
                }
            });
            expect(result).toBe('dry run commit result');
        });

        it('should log dry run messages without provided audio file', async () => {
            // Arrange
            const mockConfig = {
                dryRun: true,
                audioCommit: {},
                commit: {}
            };
            const mockLogger = Logging.getLogger();
            CommitCommand.execute.mockResolvedValue('dry run commit result');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would start audio recording for commit context');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would transcribe audio and use as context for commit message generation');
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: ''
                }
            });
            expect(result).toBe('dry run commit result');
        });
    });

    describe('audio recording and processing', () => {
        it('should process audio recording without provided file', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {
                    maxRecordingTime: 60
                },
                outputDirectory: 'test-output',
                debug: true
            };
            const mockAudioResult = {
                cancelled: false,
                audioFilePath: 'test-output/recorded-audio.wav'
            };
            const mockTranscription = {
                text: 'This is a test transcription'
            };

            Unplayable.processAudio.mockResolvedValue(mockAudioResult);
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('commit result');
            path.join.mockReturnValue('test-output/kodrdriv');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(Unplayable.processAudio).toHaveBeenCalledWith({
                file: undefined,
                maxRecordingTime: 60,
                outputDirectory: 'test-output',
                debug: true
            });
            expect(OpenAI.transcribeAudio).toHaveBeenCalledWith('test-output/recorded-audio.wav', {
                model: 'whisper-1',
                debug: true,
                outputDirectory: 'test-output/kodrdriv'
            });
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'This is a test transcription'
                }
            });
            expect(result).toBe('commit result');
        });

        it('should process provided audio file', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {
                    file: 'provided-audio.mp3'
                },
                outputDirectory: 'output'
            };
            const mockAudioResult = {
                cancelled: false,
                audioFilePath: 'some-other-path.wav'
            };
            const mockTranscription = {
                text: 'Transcribed content from provided file'
            };

            Unplayable.processAudio.mockResolvedValue(mockAudioResult);
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('commit with provided file');
            path.join.mockReturnValue('output/kodrdriv');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(Unplayable.processAudio).toHaveBeenCalledWith({
                file: 'provided-audio.mp3',
                maxRecordingTime: undefined,
                outputDirectory: 'output',
                debug: undefined
            });
            expect(OpenAI.transcribeAudio).toHaveBeenCalledWith('provided-audio.mp3', {
                model: 'whisper-1',
                debug: undefined,
                outputDirectory: 'output/kodrdriv'
            });
            expect(result).toBe('commit with provided file');
        });

        it('should handle audio recording cancellation', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockAudioResult = {
                cancelled: true
            };

            Unplayable.processAudio.mockResolvedValue(mockAudioResult);
            const mockLogger = Logging.getLogger();

            // Act & Assert
            let errorCaught = false;
            try {
                await AudioCommit.execute(mockConfig);
            } catch (error) {
                errorCaught = true;
                expect(error).toEqual(new Error('process.exit called'));
            }

            // Verify that process.exit was called regardless of whether an error was thrown
            expect(mockLogger.info).toHaveBeenCalledWith('❌ Audio commit cancelled by user');
            expect(mockExit).toHaveBeenCalledWith(0);

            // We expect either an error to be thrown or process.exit to be called
            // In some test environments, process.exit might be mocked differently
            if (!errorCaught) {
                expect(mockExit).toHaveBeenCalledWith(0);
            }
        });

        it('should use fallback filename when no audio file path in result', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {},
                outputDirectory: 'fallback-output'
            };
            const mockAudioResult = {
                cancelled: false,
                audioFilePath: undefined
            };
            const mockTranscription = {
                text: 'Fallback transcription'
            };

            Unplayable.processAudio.mockResolvedValue(mockAudioResult);
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('fallback commit');
            General.getTimestampedAudioFilename.mockReturnValue('timestamped-audio.wav');
            path.join.mockImplementation((dir: string, file: string) => `${dir}/${file}`);

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(General.getTimestampedAudioFilename).toHaveBeenCalled();
            expect(OpenAI.transcribeAudio).toHaveBeenCalledWith('fallback-output/timestamped-audio.wav', expect.any(Object));
            expect(result).toBe('fallback commit');
        });
    });

    describe('transcription handling', () => {
        beforeEach(() => {
            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
        });

        it('should handle successful transcription', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockTranscription = {
                text: 'Successfully transcribed audio content'
            };

            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('successful commit');
            const mockLogger = Logging.getLogger();

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('📝 Successfully transcribed audio using kodrdriv');
            expect(mockLogger.debug).toHaveBeenCalledWith('Transcribed text: %s', 'Successfully transcribed audio content');
            expect(result).toBe('successful commit');
        });

        it('should handle empty transcription', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockTranscription = {
                text: '   '  // Empty/whitespace only
            };

            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('empty transcription commit');
            const mockLogger = Logging.getLogger();

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.warn).toHaveBeenCalledWith('No audio content was transcribed. Proceeding without audio context.');
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: ''
                }
            });
            expect(result).toBe('empty transcription commit');
        });

        it('should handle transcription with existing commit direction', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {},
                commit: {
                    direction: 'existing direction'
                }
            };
            const mockTranscription = {
                text: 'Audio transcription content'
            };

            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('merged direction commit');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'Audio transcription content'
                }
            });
            expect(result).toBe('merged direction commit');
        });
    });

    describe('error handling', () => {
        it('should handle audio processing errors', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const audioError = new Error('Audio processing failed');

            Unplayable.processAudio.mockRejectedValue(audioError);
            CommitCommand.execute.mockResolvedValue('error recovery commit');
            const mockLogger = Logging.getLogger();

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('Audio processing failed: %s', 'Audio processing failed');
            expect(mockLogger.info).toHaveBeenCalledWith('Proceeding with commit generation without audio context...');
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: ''
                }
            });
            expect(result).toBe('error recovery commit');
        });

        it('should handle transcription errors', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const transcriptionError = new Error('Transcription failed');

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            OpenAI.transcribeAudio.mockRejectedValue(transcriptionError);
            CommitCommand.execute.mockResolvedValue('transcription error recovery');
            const mockLogger = Logging.getLogger();

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('Audio processing failed: %s', 'Transcription failed');
            expect(mockLogger.info).toHaveBeenCalledWith('Proceeding with commit generation without audio context...');
            expect(result).toBe('transcription error recovery');
        });

        it('should preserve existing commit direction when audio processing fails', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {},
                commit: {
                    direction: 'fallback direction'
                }
            };
            const error = new Error('Audio failed');

            Unplayable.processAudio.mockRejectedValue(error);
            CommitCommand.execute.mockResolvedValue('fallback commit');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'fallback direction'
                }
            });
            expect(result).toBe('fallback commit');
        });
    });

    describe('configuration variations', () => {
        it('should handle default output directory', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockTranscription = {
                text: 'Test transcription'
            };

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('default directory commit');
            path.join.mockReturnValue('output/kodrdriv');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(Unplayable.processAudio).toHaveBeenCalledWith({
                file: undefined,
                maxRecordingTime: undefined,
                outputDirectory: 'output',
                debug: undefined
            });
            expect(OpenAI.transcribeAudio).toHaveBeenCalledWith('test-audio.wav', {
                model: 'whisper-1',
                debug: undefined,
                outputDirectory: 'output/kodrdriv'
            });
            expect(result).toBe('default directory commit');
        });

        it('should handle missing audioCommit configuration', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false
            };
            const mockTranscription = {
                text: 'No audio config transcription'
            };

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('no audio config commit');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(Unplayable.processAudio).toHaveBeenCalledWith({
                file: undefined,
                maxRecordingTime: undefined,
                outputDirectory: 'output',
                debug: undefined
            });
            expect(result).toBe('no audio config commit');
        });

        it('should handle missing commit configuration', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockTranscription = {
                text: 'No commit config transcription'
            };

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('no commit config result');

            // Act
            const result = await AudioCommit.execute(mockConfig);

            // Assert
            expect(CommitCommand.execute).toHaveBeenCalledWith({
                ...mockConfig,
                commit: {
                    direction: 'No commit config transcription'
                }
            });
            expect(result).toBe('no commit config result');
        });
    });

    describe('logging and user feedback', () => {
        it('should log recording start messages', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockTranscription = {
                text: 'Test transcription'
            };

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('logged commit');
            const mockLogger = Logging.getLogger();

            // Act
            await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('🎙️  Starting audio recording for commit context...');
            expect(mockLogger.info).toHaveBeenCalledWith('Press ENTER to stop recording or C to cancel');
            expect(mockLogger.info).toHaveBeenCalledWith('🤖 Transcribing audio locally using OpenAI Whisper...');
            expect(mockLogger.info).toHaveBeenCalledWith('🤖 Generating commit message using audio context...');
        });

        it('should not log recording instructions when file is provided', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {
                    file: 'provided-file.wav'
                }
            };
            const mockTranscription = {
                text: 'Test transcription'
            };

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: 'test-audio.wav'
            });
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('provided file commit');
            const mockLogger = Logging.getLogger();

            // Act
            await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('🎙️  Starting audio recording for commit context...');
            expect(mockLogger.info).not.toHaveBeenCalledWith('Press ENTER to stop recording or C to cancel');
        });

        it('should log warning when using fallback filename', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                audioCommit: {}
            };
            const mockTranscription = {
                text: 'Fallback transcription'
            };

            Unplayable.processAudio.mockResolvedValue({
                cancelled: false,
                audioFilePath: undefined
            });
            OpenAI.transcribeAudio.mockResolvedValue(mockTranscription);
            CommitCommand.execute.mockResolvedValue('fallback commit');
            General.getTimestampedAudioFilename.mockReturnValue('fallback-audio.wav');
            path.join.mockImplementation((dir: string, file: string) => `${dir}/${file}`);
            const mockLogger = Logging.getLogger();

            // Act
            await AudioCommit.execute(mockConfig);

            // Assert
            expect(mockLogger.warn).toHaveBeenCalledWith('Using generated filename for recorded audio: %s', 'output/fallback-audio.wav');
            expect(mockLogger.warn).toHaveBeenCalledWith('Note: This may not match the actual file created by unplayable');
        });
    });
});
