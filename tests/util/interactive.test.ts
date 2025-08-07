import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock logger
const mockLogger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
};

// Mock dependencies
vi.mock('../../src/logging', () => ({
    getDryRunLogger: vi.fn(() => mockLogger)
}));

vi.mock('child_process', () => ({
    spawnSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
    open: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn()
}));

vi.mock('path', () => ({
    join: vi.fn()
}));

vi.mock('os', () => ({
    tmpdir: vi.fn()
}));

describe('Interactive Utility Module', () => {
    let interactive: any;
    let mockSpawnSync: any;
    let mockFs: any;
    let mockPath: any;
    let mockOs: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset process.stdin.isTTY before each test
        Object.defineProperty(process.stdin, 'isTTY', {
            writable: true,
            value: true
        });

        // Import the module after mocks are set up
        interactive = await import('../../src/util/interactive');

        // Get the mocked dependencies
        const { spawnSync } = await import('child_process');
        mockSpawnSync = spawnSync;

        mockFs = await import('fs/promises');
        mockPath = await import('path');
        mockOs = await import('os');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getUserChoice', () => {
        it('should display prompt and choices correctly', async () => {
            // Arrange
            const prompt = 'What would you like to do?';
            const choices = [
                { key: 'a', label: 'Action A' },
                { key: 'b', label: 'Action B' }
            ];

            // Mock stdin to simulate user pressing 'a'
            const mockStdin = {
                isTTY: true,
                ref: vi.fn(),
                setRawMode: vi.fn(),
                resume: vi.fn(),
                pause: vi.fn(),
                unref: vi.fn(),
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        // Simulate pressing 'a' key immediately
                        process.nextTick(() => callback(Buffer.from('a')));
                    }
                })
            };

            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                writable: true,
                configurable: true
            });

            // Act
            const result = await interactive.getUserChoice(prompt, choices);

            // Assert
            expect(result).toBe('a');
            expect(mockLogger.info).toHaveBeenCalledWith(prompt);
            expect(mockLogger.info).toHaveBeenCalledWith('   [a] Action A');
            expect(mockLogger.info).toHaveBeenCalledWith('   [b] Action B');
            expect(mockStdin.setRawMode).toHaveBeenCalledWith(true);
            expect(mockStdin.resume).toHaveBeenCalled();
        });

        it('should handle non-TTY gracefully', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });

            const prompt = 'What would you like to do?';
            const choices = [{ key: 'a', label: 'Action A' }];

            // Act
            const result = await interactive.getUserChoice(prompt, choices);

            // Assert
            expect(result).toBe('s'); // Default to skip
            expect(mockLogger.error).toHaveBeenCalledWith('⚠️  STDIN is piped but interactive mode is enabled');
        });

        it('should display custom non-TTY error suggestions', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });

            const prompt = 'What would you like to do?';
            const choices = [{ key: 'a', label: 'Action A' }];
            const options = {
                nonTtyErrorSuggestions: ['Use --sendit flag', 'Use --dry-run']
            };

            // Act
            await interactive.getUserChoice(prompt, choices, options);

            // Assert
            expect(mockLogger.error).toHaveBeenCalledWith('   • Use --sendit flag');
            expect(mockLogger.error).toHaveBeenCalledWith('   • Use --dry-run');
        });
    });

    describe('createSecureTempFile', () => {
        it('should create a secure temporary file with correct permissions', async () => {
            // Arrange
            const mockTmpDir = '/tmp';
            const mockTmpPath = '/tmp/kodrdriv_test_12345.txt';
            const mockFd = { close: vi.fn() };

            mockOs.tmpdir.mockReturnValue(mockTmpDir);
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);

            // Act
            const result = await interactive.createSecureTempFile('test', '.txt');

            // Assert
            expect(result).toBe(mockTmpPath);
            expect(mockOs.tmpdir).toHaveBeenCalled();
            expect(mockPath.join).toHaveBeenCalled();
            expect(mockFs.open).toHaveBeenCalledWith(mockTmpPath, 'w', 0o600);
            expect(mockFd.close).toHaveBeenCalled();
        });

        it('should use default prefix and extension when not provided', async () => {
            // Arrange
            const mockTmpDir = '/tmp';
            const mockTmpPath = '/tmp/kodrdriv_12345.txt';
            const mockFd = { close: vi.fn() };

            mockOs.tmpdir.mockReturnValue(mockTmpDir);
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);

            // Act
            await interactive.createSecureTempFile();

            // Assert
            expect(mockPath.join).toHaveBeenCalledWith(
                mockTmpDir,
                expect.stringMatching(/^kodrdriv_\d+_[a-z0-9]+\.txt$/)
            );
        });
    });

    describe('cleanupTempFile', () => {
        it('should delete the temporary file', async () => {
            // Arrange
            const filePath = '/tmp/test_file.txt';

            // Act
            await interactive.cleanupTempFile(filePath);

            // Assert
            expect(mockFs.unlink).toHaveBeenCalledWith(filePath);
        });

        it('should ignore ENOENT errors silently', async () => {
            // Arrange
            const filePath = '/tmp/test_file.txt';
            const enoentError = new Error('File not found');
            (enoentError as any).code = 'ENOENT';
            mockFs.unlink.mockRejectedValue(enoentError);

            // Act & Assert - should not throw
            await expect(interactive.cleanupTempFile(filePath)).resolves.toBeUndefined();
            expect(mockLogger.warn).not.toHaveBeenCalled();
        });

        it('should log warning for other errors', async () => {
            // Arrange
            const filePath = '/tmp/test_file.txt';
            const otherError = new Error('Permission denied');
            (otherError as any).code = 'EACCES';
            mockFs.unlink.mockRejectedValue(otherError);

            // Act
            await interactive.cleanupTempFile(filePath);

            // Assert
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Failed to cleanup temp file')
            );
        });
    });

    describe('editContentInEditor', () => {
        it('should edit content successfully', async () => {
            // Arrange
            const content = 'Original content';
            const templateLines = ['# Template line'];
            const fileExtension = '.md';
            const editedContent = 'Edited content';

            const mockTmpPath = '/tmp/test.md';
            const mockFd = { close: vi.fn() };

            mockOs.tmpdir.mockReturnValue('/tmp');
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);
            mockSpawnSync.mockReturnValue({ error: null });
            mockFs.readFile.mockResolvedValue(editedContent);

            // Act
            const result = await interactive.editContentInEditor(content, templateLines, fileExtension);

            // Assert
            expect(result.content).toBe(editedContent);
            expect(result.wasEdited).toBe(true);
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                mockTmpPath,
                expect.stringContaining('# Template line'),
                'utf8'
            );
            expect(mockSpawnSync).toHaveBeenCalledWith(
                expect.any(String), // Any editor (vi, emacs, nano, etc.)
                [mockTmpPath],
                { stdio: 'inherit' }
            );
            expect(mockFs.unlink).toHaveBeenCalledWith(mockTmpPath);
        });

        it('should use EDITOR environment variable when set', async () => {
            // Arrange
            const originalEditor = process.env.EDITOR;
            process.env.EDITOR = 'nano';

            const mockTmpPath = '/tmp/test.txt';
            const mockFd = { close: vi.fn() };

            mockOs.tmpdir.mockReturnValue('/tmp');
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);
            mockSpawnSync.mockReturnValue({ error: null });
            mockFs.readFile.mockResolvedValue('content');

            try {
                // Act
                await interactive.editContentInEditor('test');

                // Assert
                expect(mockSpawnSync).toHaveBeenCalledWith(
                    'nano',
                    [mockTmpPath],
                    { stdio: 'inherit' }
                );
            } finally {
                // Cleanup
                process.env.EDITOR = originalEditor;
            }
        });

        it('should throw error when editor fails to launch', async () => {
            // Arrange
            const mockTmpPath = '/tmp/test.txt';
            const mockFd = { close: vi.fn() };

            mockOs.tmpdir.mockReturnValue('/tmp');
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);
            mockSpawnSync.mockReturnValue({
                error: new Error('Editor not found')
            });

            // Act & Assert
            await expect(
                interactive.editContentInEditor('test')
            ).rejects.toThrow('Failed to launch editor');
        });

        it('should throw error when content is empty after editing', async () => {
            // Arrange
            const mockTmpPath = '/tmp/test.txt';
            const mockFd = { close: vi.fn() };

            mockOs.tmpdir.mockReturnValue('/tmp');
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);
            mockSpawnSync.mockReturnValue({ error: null });
            mockFs.readFile.mockResolvedValue('   \n  \n  '); // Only whitespace

            // Act & Assert
            await expect(
                interactive.editContentInEditor('test')
            ).rejects.toThrow('Content is empty after editing');
        });

        it('should filter out comment lines', async () => {
            // Arrange
            const mockTmpPath = '/tmp/test.txt';
            const mockFd = { close: vi.fn() };
            const fileContentWithComments = '# This is a comment\nActual content\n# Another comment\nMore content';

            mockOs.tmpdir.mockReturnValue('/tmp');
            mockPath.join.mockReturnValue(mockTmpPath);
            mockFs.open.mockResolvedValue(mockFd);
            mockSpawnSync.mockReturnValue({ error: null });
            mockFs.readFile.mockResolvedValue(fileContentWithComments);

            // Act
            const result = await interactive.editContentInEditor('test');

            // Assert
            expect(result.content).toBe('Actual content\nMore content');
        });
    });

    describe('requireTTY', () => {
        it('should not throw when TTY is available', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: true
            });

            // Act & Assert
            expect(() => interactive.requireTTY()).not.toThrow();
        });

        it('should throw when TTY is not available', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });

            // Act & Assert
            expect(() => interactive.requireTTY()).toThrow('Interactive mode requires a terminal');
        });

        it('should use custom error message when provided', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });
            const customMessage = 'Custom TTY error message';

            // Act & Assert
            expect(() => interactive.requireTTY(customMessage)).toThrow(customMessage);
        });

        it('should log error messages when TTY not available', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });

            // Act & Assert
            expect(() => interactive.requireTTY()).toThrow();
            expect(mockLogger.error).toHaveBeenCalledWith('❌ Interactive mode requires a terminal (TTY)');
            expect(mockLogger.error).toHaveBeenCalledWith('   Solutions:');
        });
    });

    describe('improveContentWithLLM', () => {
        it('should call improvement configuration functions correctly', async () => {
            // Arrange
            const currentContent = 'test content';
            const runConfig = { model: 'gpt-4' };
            const promptConfig = { test: 'config' };
            const promptContext = { test: 'context' };
            const outputDirectory = '/output';

            const mockImprovedPrompt = { prompt: 'improved prompt' };
            const mockImprovedResponse = 'improved content';

            const improvementConfig = {
                contentType: 'test content',
                createImprovedPrompt: vi.fn().mockResolvedValue(mockImprovedPrompt),
                callLLM: vi.fn().mockResolvedValue(mockImprovedResponse),
                processResponse: vi.fn().mockReturnValue('processed content')
            };

            // Act
            const result = await interactive.improveContentWithLLM(
                currentContent,
                runConfig,
                promptConfig,
                promptContext,
                outputDirectory,
                improvementConfig
            );

            // Assert
            expect(result).toBe('processed content');
            expect(improvementConfig.createImprovedPrompt).toHaveBeenCalledWith(
                promptConfig,
                currentContent,
                promptContext
            );
            expect(improvementConfig.callLLM).toHaveBeenCalledWith(
                mockImprovedPrompt,
                runConfig,
                outputDirectory
            );
            expect(improvementConfig.processResponse).toHaveBeenCalledWith(mockImprovedResponse);
            expect(mockLogger.info).toHaveBeenCalledWith('🤖 Requesting LLM to improve the test content...');
            expect(mockLogger.info).toHaveBeenCalledWith('✅ LLM has provided improved test content');
        });

        it('should work without processResponse function', async () => {
            // Arrange
            const currentContent = 'test content';
            const runConfig = { model: 'gpt-4' };
            const promptConfig = { test: 'config' };
            const promptContext = { test: 'context' };
            const outputDirectory = '/output';

            const mockImprovedPrompt = { prompt: 'improved prompt' };
            const mockImprovedResponse = 'improved content';

            const improvementConfig = {
                contentType: 'test content',
                createImprovedPrompt: vi.fn().mockResolvedValue(mockImprovedPrompt),
                callLLM: vi.fn().mockResolvedValue(mockImprovedResponse)
                // No processResponse function
            };

            // Act
            const result = await interactive.improveContentWithLLM(
                currentContent,
                runConfig,
                promptConfig,
                promptContext,
                outputDirectory,
                improvementConfig
            );

            // Assert
            expect(result).toBe(mockImprovedResponse);
        });
    });

    describe('getUserTextInput', () => {
        beforeEach(() => {
            // Mock stdin methods
            process.stdin.setEncoding = vi.fn();
            process.stdin.resume = vi.fn();
            process.stdin.pause = vi.fn();
            process.stdin.on = vi.fn();
            process.stdin.removeListener = vi.fn();
            process.stdin.ref = vi.fn();
            process.stdin.unref = vi.fn();
        });

        it('should return user input when valid text is provided', async () => {
            // Arrange
            const prompt = 'Enter your feedback:';
            const userInput = 'This is test feedback';
            let dataHandler: any;

            // Mock stdin.on to capture the data handler
            (process.stdin.on as any).mockImplementation((event: string, handler: any) => {
                if (event === 'data') {
                    dataHandler = handler;
                }
            });

            // Act
            const inputPromise = interactive.getUserTextInput(prompt);

            // Simulate user typing and pressing Enter
            dataHandler(`${userInput}\n`);

            const result = await inputPromise;

            // Assert
            expect(result).toBe(userInput);
            expect(mockLogger.info).toHaveBeenCalledWith(prompt);
            expect(mockLogger.info).toHaveBeenCalledWith('(Press Enter when done, or type Ctrl+C to cancel)');
        });

        it('should reject when empty input is provided', async () => {
            // Arrange
            const prompt = 'Enter your feedback:';
            let dataHandler: any;

            (process.stdin.on as any).mockImplementation((event: string, handler: any) => {
                if (event === 'data') {
                    dataHandler = handler;
                }
            });

            // Act & Assert
            const inputPromise = interactive.getUserTextInput(prompt);

            // Simulate user pressing Enter without typing anything
            dataHandler('\n');

            await expect(inputPromise).rejects.toThrow('Empty input received');
        });

        it('should throw error when not in TTY environment', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });

            const prompt = 'Enter your feedback:';

            // Act & Assert
            await expect(interactive.getUserTextInput(prompt)).rejects.toThrow('Interactive text input requires a terminal');
            expect(mockLogger.error).toHaveBeenCalledWith('⚠️  STDIN is piped but interactive text input is required');
        });

        it('should handle error events', async () => {
            // Arrange
            const prompt = 'Enter your feedback:';
            const testError = new Error('Input error');
            let errorHandler: any;

            (process.stdin.on as any).mockImplementation((event: string, handler: any) => {
                if (event === 'error') {
                    errorHandler = handler;
                }
            });

            // Act & Assert
            const inputPromise = interactive.getUserTextInput(prompt);

            // Simulate an error
            errorHandler(testError);

            await expect(inputPromise).rejects.toThrow('Input error');
        });
    });

    describe('STANDARD_CHOICES', () => {
        it('should export standard choice constants', () => {
            // Assert
            expect(interactive.STANDARD_CHOICES.CONFIRM).toEqual({
                key: 'c',
                label: 'Confirm and proceed'
            });
            expect(interactive.STANDARD_CHOICES.EDIT).toEqual({
                key: 'e',
                label: 'Edit in editor'
            });
            expect(interactive.STANDARD_CHOICES.SKIP).toEqual({
                key: 's',
                label: 'Skip and abort'
            });
            expect(interactive.STANDARD_CHOICES.IMPROVE).toEqual({
                key: 'i',
                label: 'Improve with LLM feedback'
            });
        });
    });

    describe('getLLMFeedbackInEditor', () => {
        it('should exist and be callable', () => {
            // Basic smoke test to ensure the function exists
            expect(typeof interactive.getLLMFeedbackInEditor).toBe('function');
        });

        // Note: Full integration tests for this function are complex due to editor interaction
        // Manual testing should be performed to ensure proper functionality
    });
});
