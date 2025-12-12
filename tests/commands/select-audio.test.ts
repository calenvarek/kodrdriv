import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Create shared mock logger instance
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn()
};

// Mock external dependencies
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue(mockLogger),
    getDryRunLogger: vi.fn().mockReturnValue(mockLogger)
}));

vi.mock('@theunwalked/unplayable', () => ({
    selectAndConfigureAudioDevice: vi.fn()
}));

vi.mock('path', () => ({
    default: {
        join: vi.fn()
    }
}));

vi.mock('os', () => ({
    default: {
        homedir: vi.fn()
    }
}));

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

describe('select-audio', () => {
    let SelectAudio: any;
    let Logging: any;
    let Unplayable: any;
    let path: any;
    let os: any;

    beforeEach(async () => {
        // Import modules after mocking
        Logging = await import('../../src/logging');
        Unplayable = await import('@theunwalked/unplayable');
        path = (await import('path')).default;
        os = (await import('os')).default;
        SelectAudio = await import('../../src/commands/select-audio');

        // Setup default mock implementations
        os.homedir.mockReturnValue('/home/user');
        path.join.mockImplementation((...args: string[]) => args.join('/'));
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockExit.mockClear();
    });

    describe('dry run mode', () => {
        it('should log dry run messages and return success message', async () => {
            // Arrange
            const mockConfig = {
                dryRun: true,
                debug: false
            };
            const mockLogger = Logging.getLogger();

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_SELECT_DRY_RUN: Would start audio device selection | Mode: dry-run | Purpose: Choose input device');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_SELECT_SAVE_DRY_RUN: Would save device to config | Mode: dry-run | Path: %s', expect.any(String));
            expect(result).toBe('Audio device selection completed (dry run)');
            expect(Unplayable.selectAndConfigureAudioDevice).not.toHaveBeenCalled();
        });

        it('should handle dry run with debug mode', async () => {
            // Arrange
            const mockConfig = {
                dryRun: true,
                debug: true
            };
            const mockLogger = Logging.getLogger();

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_SELECT_DRY_RUN: Would start audio device selection | Mode: dry-run | Purpose: Choose input device');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_SELECT_SAVE_DRY_RUN: Would save device to config | Mode: dry-run | Path: %s', expect.any(String));
            expect(result).toBe('Audio device selection completed (dry run)');
        });

        it('should handle dry run when dryRun is undefined but falsy', async () => {
            // Arrange
            const mockConfig = {
                dryRun: undefined,
                debug: false
            };
            const mockSuccessMessage = 'Audio device configured successfully';

            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalled();
            expect(result).toBe(mockSuccessMessage);
        });
    });

    describe('normal execution', () => {
        it('should call selectAndConfigureAudioDevice with correct parameters', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: true
            };
            const mockSuccessMessage = 'Audio device configured successfully';
            const mockLogger = Logging.getLogger();

            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalledWith(
                '/home/user/.unplayable',
                mockLogger,
                true
            );
            expect(result).toBe(mockSuccessMessage);
        });

        it('should handle execution without debug mode', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };
            const mockSuccessMessage = 'Device selection completed';
            const mockLogger = Logging.getLogger();

            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalledWith(
                '/home/user/.unplayable',
                mockLogger,
                false
            );
            expect(result).toBe(mockSuccessMessage);
        });

        it('should handle execution with undefined debug mode', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: undefined
            };
            const mockSuccessMessage = 'Device selection completed';
            const mockLogger = Logging.getLogger();

            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalledWith(
                '/home/user/.unplayable',
                mockLogger,
                undefined
            );
            expect(result).toBe(mockSuccessMessage);
        });

        it('should use correct preferences directory path', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };
            const mockSuccessMessage = 'Device configured';

            os.homedir.mockReturnValue('/custom/home/path');
            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(os.homedir).toHaveBeenCalled();
            expect(path.join).toHaveBeenCalledWith('/custom/home/path', '.unplayable');
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalledWith(
                '/custom/home/path/.unplayable',
                expect.any(Object),
                false
            );
            expect(result).toBe(mockSuccessMessage);
        });
    });

    describe('error handling', () => {
        it('should handle selectAndConfigureAudioDevice errors and throw error', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };
            const mockError = new Error('Audio device selection failed');

            Unplayable.selectAndConfigureAudioDevice.mockRejectedValue(mockError);

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Audio device selection failed: Audio device selection failed');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', 'Audio device selection failed');
        });

        it('should handle errors with custom error messages', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: true
            };
            const mockError = new Error('No audio devices found');

            Unplayable.selectAndConfigureAudioDevice.mockRejectedValue(mockError);

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Audio device selection failed: No audio devices found');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', 'No audio devices found');
        });

        it('should handle errors without message property', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };
            const mockError = { toString: () => 'Custom error object' };
            const mockLogger = Logging.getLogger();

            Unplayable.selectAndConfigureAudioDevice.mockRejectedValue(mockError);

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Audio device selection failed: Custom error object');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', 'Custom error object');
        });
    });

    describe('configuration variations', () => {
        it('should handle empty config object', async () => {
            // Arrange
            const mockConfig = {};
            const mockSuccessMessage = 'Default configuration success';
            const mockLogger = Logging.getLogger();

            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalledWith(
                '/home/user/.unplayable',
                mockLogger,
                undefined
            );
            expect(result).toBe(mockSuccessMessage);
        });

        it('should handle config with only debug set', async () => {
            // Arrange
            const mockConfig = {
                debug: true
            };
            const mockSuccessMessage = 'Debug mode success';
            const mockLogger = Logging.getLogger();

            Unplayable.selectAndConfigureAudioDevice.mockResolvedValue(mockSuccessMessage);

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(Unplayable.selectAndConfigureAudioDevice).toHaveBeenCalledWith(
                '/home/user/.unplayable',
                mockLogger,
                true
            );
            expect(result).toBe(mockSuccessMessage);
        });
    });

    describe('getUnplayableConfigPath utility', () => {
        it('should construct correct config path', () => {
            // This tests the internal getUnplayableConfigPath function indirectly
            // by checking the path construction in dry run mode
            const mockConfig = {
                dryRun: true
            };
            const mockLogger = Logging.getLogger();

            os.homedir.mockReturnValue('/test/home');
            path.join.mockReturnValue('/test/home/.unplayable/audio-device.json');

            SelectAudio.execute(mockConfig);

            expect(path.join).toHaveBeenCalledWith('/test/home', '.unplayable', 'audio-device.json');
            expect(mockLogger.info).toHaveBeenCalledWith('AUDIO_SELECT_SAVE_DRY_RUN: Would save device to config | Mode: dry-run | Path: %s', '/test/home/.unplayable/audio-device.json');
        });

        it('should handle home directory error in dry run mode', async () => {
            // Arrange
            const mockConfig = {
                dryRun: true,
                debug: false
            };
            const mockLogger = Logging.getLogger();

            // Mock os.homedir to throw an error
            os.homedir.mockImplementation(() => {
                throw new Error('Home directory not found');
            });

            // Act
            const result = await SelectAudio.execute(mockConfig);

            // Assert
            expect(mockLogger.warn).toHaveBeenCalledWith('AUDIO_SELECT_CONFIG_PATH_ERROR: Error determining config path | Error: %s | Impact: Cannot show save location', 'Failed to determine home directory: Home directory not found');
            expect(result).toBe('Audio device selection completed (dry run)');
        });
    });

    describe('home directory error handling', () => {
        it('should handle home directory error during normal execution', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };

            // Mock os.homedir to throw an error in the normal execution path
            os.homedir.mockImplementation(() => {
                throw new Error('Cannot access home directory');
            });

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Audio device selection failed: Cannot access home directory');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', 'Cannot access home directory');
        });

        it('should handle specific home directory error message patterns', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: true
            };

            // Mock os.homedir to throw an error with specific message pattern
            os.homedir.mockImplementation(() => {
                throw new Error('ENOENT: no such file or directory');
            });

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Audio device selection failed: ENOENT: no such file or directory');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', 'ENOENT: no such file or directory');
        });

        it('should handle path.join error during normal execution', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };

            // Mock path.join to throw an error
            os.homedir.mockReturnValue('/home/user');
            path.join.mockImplementation(() => {
                throw new Error('Path join failed');
            });

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Audio device selection failed: Path join failed');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', 'Path join failed');
        });

        it('should handle home directory error with specific error message check', async () => {
            // Arrange
            const mockConfig = {
                dryRun: false,
                debug: false
            };

            // Mock os.homedir to throw an error that contains the specific message pattern
            os.homedir.mockImplementation(() => {
                throw new Error('Failed to determine home directory: permission denied');
            });

            // Act & Assert
            await expect(SelectAudio.execute(mockConfig)).rejects.toThrow('Failed to determine home directory: permission denied');
            expect(mockLogger.error).toHaveBeenCalledWith('AUDIO_SELECT_FAILED: Audio device selection failed | Error: %s', 'Failed to determine home directory: permission denied');
        });
    });
});
