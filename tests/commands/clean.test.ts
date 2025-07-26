import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the logging module
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }),
    getDryRunLogger: vi.fn().mockImplementation((isDryRun: boolean) => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }))
}));

// Mock the storage module
vi.mock('../../src/util/storage', () => ({
    create: vi.fn().mockReturnValue({
        exists: vi.fn(),
        removeDirectory: vi.fn(),
    })
}));

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

// Mock the constants module
vi.mock('../../src/constants', () => ({
    DEFAULT_OUTPUT_DIRECTORY: 'output/kodrdriv'
}));

describe('clean command', () => {
    let Clean: any;
    let Logging: any;
    let Storage: any;
    let Constants: any;
    let mockLogger: any;
    let mockStorage: any;

    beforeEach(async () => {
        // Import modules after mocking
        Logging = await import('../../src/logging');
        Storage = await import('../../src/util/storage');
        Constants = await import('../../src/constants');
        Clean = await import('../../src/commands/clean');

        // Setup mock implementations
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        mockStorage = {
            exists: vi.fn(),
            removeDirectory: vi.fn(),
        };

        Logging.getLogger.mockReturnValue(mockLogger);
        Logging.getDryRunLogger.mockReturnValue(mockLogger);
        Storage.create.mockReturnValue(mockStorage);
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockExit.mockClear();
    });

    describe('dry run mode', () => {
        it('should log dry run message and check if directory exists', async () => {
            // Arrange
            const runConfig = {
                dryRun: true,
                outputDirectory: 'custom/output'
            };

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Would remove output directory: custom/output');
            expect(mockLogger.info).toHaveBeenCalledWith('Would check if output directory exists: custom/output');
            expect(mockLogger.info).toHaveBeenCalledWith('Would remove directory if it exists');
            // Storage operations should not be called in dry run
            expect(mockStorage.exists).not.toHaveBeenCalled();
            expect(mockStorage.removeDirectory).not.toHaveBeenCalled();
        });

        it('should log dry run message when directory does not exist', async () => {
            // Arrange
            const runConfig = {
                dryRun: true,
                outputDirectory: 'custom/output'
            };

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Would remove output directory: custom/output');
            expect(mockLogger.info).toHaveBeenCalledWith('Would check if output directory exists: custom/output');
            expect(mockLogger.info).toHaveBeenCalledWith('Would remove directory if it exists');
            // Storage operations should not be called in dry run
            expect(mockStorage.exists).not.toHaveBeenCalled();
            expect(mockStorage.removeDirectory).not.toHaveBeenCalled();
        });

        it('should use default output directory when not specified in dry run', async () => {
            // Arrange
            const runConfig = {
                dryRun: true
            };

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Would remove output directory: output/kodrdriv');
            // Storage operations should not be called in dry run
            expect(mockStorage.exists).not.toHaveBeenCalled();
            expect(mockStorage.removeDirectory).not.toHaveBeenCalled();
        });
    });

    describe('normal operation', () => {
        it('should remove existing directory successfully', async () => {
            // Arrange
            const runConfig = {
                dryRun: false,
                outputDirectory: 'custom/output'
            };
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.removeDirectory.mockResolvedValue(undefined);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: custom/output');
            expect(mockStorage.exists).toHaveBeenCalledWith('custom/output');
            expect(mockStorage.removeDirectory).toHaveBeenCalledWith('custom/output');
            expect(mockLogger.info).toHaveBeenCalledWith('Successfully removed output directory: custom/output');
        });

        it('should log message when directory does not exist', async () => {
            // Arrange
            const runConfig = {
                dryRun: false,
                outputDirectory: 'custom/output'
            };
            mockStorage.exists.mockResolvedValue(false);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: custom/output');
            expect(mockStorage.exists).toHaveBeenCalledWith('custom/output');
            expect(mockStorage.removeDirectory).not.toHaveBeenCalled();
            expect(mockLogger.info).toHaveBeenCalledWith('Output directory does not exist: custom/output');
        });

        it('should use default output directory when not specified', async () => {
            // Arrange
            const runConfig = {
                dryRun: false
            };
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.removeDirectory.mockResolvedValue(undefined);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: output/kodrdriv');
            expect(mockStorage.exists).toHaveBeenCalledWith('output/kodrdriv');
            expect(mockStorage.removeDirectory).toHaveBeenCalledWith('output/kodrdriv');
        });

        it('should handle undefined dryRun as false', async () => {
            // Arrange
            const runConfig = {
                outputDirectory: 'custom/output'
            };
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.removeDirectory.mockResolvedValue(undefined);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: custom/output');
            expect(mockStorage.removeDirectory).toHaveBeenCalledWith('custom/output');
        });
    });

    describe('error handling', () => {
        it('should log error and rethrow when removeDirectory fails', async () => {
            // Arrange
            const runConfig = {
                dryRun: false,
                outputDirectory: 'custom/output'
            };
            const error = new Error('Permission denied');
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.removeDirectory.mockRejectedValue(error);

            // Act & Assert
            await expect(Clean.execute(runConfig)).rejects.toThrow('process.exit called');
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to clean output directory: Permission denied');
            expect(mockStorage.removeDirectory).toHaveBeenCalledWith('custom/output');
        });

        it('should handle error with undefined message', async () => {
            // Arrange
            const runConfig = {
                dryRun: false,
                outputDirectory: 'custom/output'
            };
            const error = new Error();
            error.message = undefined as any;
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.removeDirectory.mockRejectedValue(error);

            // Act & Assert
            await expect(Clean.execute(runConfig)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to clean output directory: undefined');
        });

        it('should handle non-Error objects thrown from removeDirectory', async () => {
            // Arrange
            const runConfig = {
                dryRun: false,
                outputDirectory: 'custom/output'
            };
            const error = 'String error';
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.removeDirectory.mockRejectedValue(error);

            // Act & Assert
            await expect(Clean.execute(runConfig)).rejects.toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('Failed to clean output directory: undefined');
        });
    });

    describe('storage utility initialization', () => {
        it('should create storage utility with logger info function', async () => {
            // Arrange
            const runConfig = {
                dryRun: true,
                outputDirectory: 'custom/output'
            };
            mockStorage.exists.mockResolvedValue(false);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(Storage.create).toHaveBeenCalledWith({ log: mockLogger.info });
        });
    });

    describe('configuration edge cases', () => {
        it('should handle empty configuration object', async () => {
            // Arrange
            const runConfig = {};
            mockStorage.exists.mockResolvedValue(false);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: output/kodrdriv');
            expect(mockStorage.exists).toHaveBeenCalledWith('output/kodrdriv');
        });

        it('should handle null outputDirectory', async () => {
            // Arrange
            const runConfig = {
                outputDirectory: null as any
            };
            mockStorage.exists.mockResolvedValue(false);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: output/kodrdriv');
            expect(mockStorage.exists).toHaveBeenCalledWith('output/kodrdriv');
        });

        it('should handle empty string outputDirectory', async () => {
            // Arrange
            const runConfig = {
                outputDirectory: ''
            };
            mockStorage.exists.mockResolvedValue(false);

            // Act
            await Clean.execute(runConfig);

            // Assert
            expect(mockLogger.info).toHaveBeenCalledWith('Removing output directory: output/kodrdriv');
            expect(mockStorage.exists).toHaveBeenCalledWith('output/kodrdriv');
        });
    });
});
