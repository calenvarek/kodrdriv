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
            expect(mockLogger.info).toHaveBeenCalledWith('Would start audio device selection process');
            expect(mockLogger.info).toHaveBeenCalledWith('Would save selected device to %s', expect.any(String));
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
            expect(mockLogger.info).toHaveBeenCalledWith('Would start audio device selection process');
            expect(mockLogger.info).toHaveBeenCalledWith('Would save selected device to %s', expect.any(String));
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
            expect(mockLogger.error).toHaveBeenCalledWith('❌ Audio device selection failed: %s', 'Audio device selection failed');
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
            expect(mockLogger.error).toHaveBeenCalledWith('❌ Audio device selection failed: %s', 'No audio devices found');
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
            expect(mockLogger.error).toHaveBeenCalledWith('❌ Audio device selection failed: %s', 'Custom error object');
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
            expect(mockLogger.info).toHaveBeenCalledWith('Would save selected device to %s', '/test/home/.unplayable/audio-device.json');
        });
    });
});
