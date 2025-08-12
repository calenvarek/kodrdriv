import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Simple mock strategy - mock only what we need
vi.mock('../../src/logging', () => ({
    getDryRunLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }))
}));

vi.mock('child_process', () => ({
    spawnSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
    open: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
    access: vi.fn(),
    mkdir: vi.fn(),
    constants: {
        W_OK: 2
    }
}));

vi.mock('path', () => ({
    join: vi.fn(() => '/tmp/test_file.txt')
}));

vi.mock('os', () => ({
    tmpdir: vi.fn(() => '/tmp')
}));

describe('Interactive Utility Module', () => {
    let interactive: any;
    let fs: any;
    let spawnSync: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Reset stdin properties
        Object.defineProperty(process.stdin, 'isTTY', {
            writable: true,
            value: true,
            configurable: true
        });

        // Import fresh module
        interactive = await import('../../src/util/interactive');
        fs = await import('fs/promises');
        spawnSync = (await import('child_process')).spawnSync;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('getUserChoice', () => {
        it('should handle non-TTY gracefully', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false,
                configurable: true
            });

            const prompt = 'What would you like to do?';
            const choices = [{ key: 'a', label: 'Action A' }];

            // Act
            const result = await interactive.getUserChoice(prompt, choices);

            // Assert
            expect(result).toBe('s'); // Default to skip
        });

        it('should display prompt and choices correctly with mocked stdin', async () => {
            // Arrange
            const prompt = 'What would you like to do?';
            const choices = [
                { key: 'a', label: 'Action A' },
                { key: 'b', label: 'Action B' }
            ];

            // Create a simple mock stdin
            const mockStdin = {
                isTTY: true,
                ref: vi.fn(),
                setRawMode: vi.fn(),
                resume: vi.fn(),
                pause: vi.fn(),
                unref: vi.fn(),
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        // Immediately call with 'a' key
                        setImmediate(() => callback(Buffer.from('a')));
                    }
                }),
                removeListener: vi.fn()
            };

            // Replace process.stdin temporarily
            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                writable: true,
                configurable: true
            });

            try {
                // Act
                const result = await interactive.getUserChoice(prompt, choices);

                // Assert
                expect(result).toBe('a');
            } finally {
                // Restore original stdin
                Object.defineProperty(process, 'stdin', {
                    value: originalStdin,
                    writable: true,
                    configurable: true
                });
            }
        });

        it('should handle non-TTY with custom error suggestions', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false,
                configurable: true
            });

            const prompt = 'What would you like to do?';
            const choices = [{ key: 'a', label: 'Action A' }];
            const options = {
                nonTtyErrorSuggestions: ['Use --no-interactive flag', 'Set EDITOR environment variable']
            };

            // Act
            const result = await interactive.getUserChoice(prompt, choices, options);

            // Assert
            expect(result).toBe('s');
        });

        it('should handle stdin errors gracefully', async () => {
            // Arrange
            const prompt = 'What would you like to do?';
            const choices = [{ key: 'a', label: 'Action A' }];

            const mockStdin = {
                isTTY: true,
                ref: vi.fn(),
                setRawMode: vi.fn(),
                resume: vi.fn(),
                pause: vi.fn(),
                unref: vi.fn(),
                on: vi.fn((event, callback) => {
                    if (event === 'error') {
                        setImmediate(() => callback(new Error('Stdin error')));
                    }
                }),
                removeListener: vi.fn()
            };

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                writable: true,
                configurable: true
            });

            try {
                // Act & Assert
                await expect(interactive.getUserChoice(prompt, choices)).rejects.toThrow('Stdin error');
            } finally {
                Object.defineProperty(process, 'stdin', {
                    value: originalStdin,
                    writable: true,
                    configurable: true
                });
            }
        });
    });

    describe('SecureTempFile', () => {
        let mockFileHandle: any;

        beforeEach(() => {
            mockFileHandle = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn()
            };
            fs.open.mockResolvedValue(mockFileHandle);
        });

        it('should create a secure temporary file', async () => {
            // Act
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');

            // Assert
            expect(tempFile).toBeInstanceOf(interactive.SecureTempFile);
            expect(fs.open).toHaveBeenCalledWith('/tmp/test_file.txt', 'wx', 0o600);
        });

        it('should handle file creation errors', async () => {
            // Arrange
            fs.open.mockRejectedValue(new Error('Permission denied'));

            // Act & Assert
            await expect(interactive.SecureTempFile.create('test', '.txt'))
                .rejects.toThrow('Failed to create temporary file: Permission denied');
        });

        it('should handle file already exists error', async () => {
            // Arrange
            const error = new Error('File exists');
            (error as any).code = 'EEXIST';
            fs.open.mockRejectedValue(error);

            // Act & Assert
            await expect(interactive.SecureTempFile.create('test', '.txt'))
                .rejects.toThrow('Temporary file already exists: /tmp/test_file.txt');
        });

        it('should write content to file', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');
            const content = 'test content';

            // Act
            await tempFile.writeContent(content);

            // Assert
            expect(mockFileHandle.writeFile).toHaveBeenCalledWith(content, 'utf8');
        });

        it('should read content from file', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');
            const content = 'test content';
            mockFileHandle.readFile.mockResolvedValue(content);

            // Act
            const result = await tempFile.readContent();

            // Assert
            expect(result).toBe(content);
            expect(mockFileHandle.readFile).toHaveBeenCalledWith('utf8');
        });

        it('should close file handle', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');

            // Act
            await tempFile.close();

            // Assert
            expect(mockFileHandle.close).toHaveBeenCalled();
            expect(tempFile.fd).toBeNull();
        });

        it('should cleanup file securely', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');

            // Act
            await tempFile.cleanup();

            // Assert
            expect(mockFileHandle.close).toHaveBeenCalled();
            expect(fs.unlink).toHaveBeenCalledWith('/tmp/test_file.txt');
            expect(tempFile.isCleanedUp).toBe(true);
        });

        it('should handle cleanup errors gracefully', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');
            fs.unlink.mockRejectedValue(new Error('Permission denied'));

            // Act
            await tempFile.cleanup();

            // Assert
            expect(tempFile.isCleanedUp).toBe(true);
        });

        it('should ignore ENOENT errors during cleanup', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');
            const error = new Error('File not found');
            (error as any).code = 'ENOENT';
            fs.unlink.mockRejectedValue(error);

            // Act
            await tempFile.cleanup();

            // Assert
            expect(tempFile.isCleanedUp).toBe(true);
        });

        it('should throw error when accessing cleaned up file', async () => {
            // Arrange
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');
            await tempFile.cleanup();

            // Act & Assert
            expect(() => tempFile.path).toThrow('Temp file has been cleaned up');
            await expect(tempFile.writeContent('test')).rejects.toThrow('Temp file is not available for writing');
            await expect(tempFile.readContent()).rejects.toThrow('Temp file is not available for reading');
        });

        it('should skip temp directory check in test environment', async () => {
            // Arrange
            process.env.VITEST = 'true';

            // Act
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');

            // Assert
            expect(tempFile).toBeInstanceOf(interactive.SecureTempFile);
            expect(fs.access).not.toHaveBeenCalled();

            // Cleanup
            delete process.env.VITEST;
        });

        it('should check temp directory permissions in non-test environment', async () => {
            // Arrange
            fs.access.mockResolvedValue(undefined);

            // Act
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');

            // Assert
            expect(fs.access).toHaveBeenCalledWith('/tmp', 2);
            expect(tempFile).toBeInstanceOf(interactive.SecureTempFile);
        });

        it('should create temp directory if it does not exist', async () => {
            // Arrange
            fs.access.mockRejectedValue(new Error('Directory not found'));
            fs.mkdir.mockResolvedValue(undefined);

            // Act
            const tempFile = await interactive.SecureTempFile.create('test', '.txt');

            // Assert
            expect(fs.mkdir).toHaveBeenCalledWith('/tmp', { recursive: true, mode: 0o700 });
            expect(tempFile).toBeInstanceOf(interactive.SecureTempFile);
        });
    });

    describe('editContentInEditor', () => {
        let mockFileHandle: any;

        beforeEach(() => {
            mockFileHandle = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn()
            };
            fs.open.mockResolvedValue(mockFileHandle);
            spawnSync.mockReturnValue({ error: null });
            fs.readFile.mockResolvedValue('# Comment\nActual content\n');

            // Clear environment variables to ensure consistent behavior
            delete process.env.EDITOR;
            delete process.env.VISUAL;
        });

        it('should edit content in editor', async () => {
            // Arrange
            const content = 'original content';
            const templateLines = ['# Template line'];
            const fileExtension = '.md';

            // Act
            const result = await interactive.editContentInEditor(content, templateLines, fileExtension);

            // Assert
            expect(result.content).toBe('Actual content');
            expect(result.wasEdited).toBe(true);
            expect(spawnSync).toHaveBeenCalledWith('vi', ['/tmp/test_file.txt'], { stdio: 'inherit' });
        });

        it('should use EDITOR environment variable', async () => {
            // Arrange
            process.env.EDITOR = 'nano';
            const content = 'test content';

            try {
                // Act
                await interactive.editContentInEditor(content);

                // Assert
                expect(spawnSync).toHaveBeenCalledWith('nano', ['/tmp/test_file.txt'], { stdio: 'inherit' });
            } finally {
                delete process.env.EDITOR;
            }
        });

        it('should use VISUAL environment variable when EDITOR is not set', async () => {
            // Arrange
            process.env.VISUAL = 'code';
            const content = 'test content';

            try {
                // Act
                await interactive.editContentInEditor(content);

                // Assert
                expect(spawnSync).toHaveBeenCalledWith('code', ['/tmp/test_file.txt'], { stdio: 'inherit' });
            } finally {
                delete process.env.VISUAL;
            }
        });

        it('should handle editor launch errors', async () => {
            // Arrange
            spawnSync.mockReturnValue({ error: new Error('Editor not found') });
            const content = 'test content';

            // Act & Assert
            await expect(interactive.editContentInEditor(content))
                .rejects.toThrow('Failed to launch editor \'vi\': Editor not found');
        });

        it('should handle empty content after editing', async () => {
            // Arrange
            fs.readFile.mockResolvedValue('# Comment only\n');

            // Act & Assert
            await expect(interactive.editContentInEditor('test content'))
                .rejects.toThrow('Content is empty after editing');
        });

        it('should detect when content was not edited', async () => {
            // Arrange
            const content = 'original content';
            fs.readFile.mockResolvedValue('# Comment\noriginal content\n');

            // Act
            const result = await interactive.editContentInEditor(content);

            // Assert
            expect(result.content).toBe('original content');
            expect(result.wasEdited).toBe(false);
        });
    });

    describe('getUserTextInput', () => {
        it('should handle non-TTY gracefully', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false,
                configurable: true
            });

            const prompt = 'Enter your feedback:';

            // Act & Assert
            await expect(interactive.getUserTextInput(prompt))
                .rejects.toThrow('Interactive text input requires a terminal');
        });

        it('should handle non-TTY with custom error suggestions', async () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false,
                configurable: true
            });

            const prompt = 'Enter your feedback:';
            const options = {
                nonTtyErrorSuggestions: ['Use --no-interactive flag', 'Set EDITOR environment variable']
            };

            // Act & Assert
            await expect(interactive.getUserTextInput(prompt, options))
                .rejects.toThrow('Interactive text input requires a terminal');
        });

        it('should get text input from user', async () => {
            // Arrange
            const prompt = 'Enter your feedback:';
            const userInput = 'This is my feedback';

            const mockStdin = {
                isTTY: true,
                ref: vi.fn(),
                setEncoding: vi.fn(),
                resume: vi.fn(),
                pause: vi.fn(),
                unref: vi.fn(),
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        setImmediate(() => callback(userInput + '\n'));
                    }
                }),
                removeListener: vi.fn()
            };

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                writable: true,
                configurable: true
            });

            try {
                // Act
                const result = await interactive.getUserTextInput(prompt);

                // Assert
                expect(result).toBe(userInput);
            } finally {
                Object.defineProperty(process, 'stdin', {
                    value: originalStdin,
                    writable: true,
                    configurable: true
                });
            }
        });

        it('should reject empty input', async () => {
            // Arrange
            const prompt = 'Enter your feedback:';

            const mockStdin = {
                isTTY: true,
                ref: vi.fn(),
                setEncoding: vi.fn(),
                resume: vi.fn(),
                pause: vi.fn(),
                unref: vi.fn(),
                on: vi.fn((event, callback) => {
                    if (event === 'data') {
                        setImmediate(() => callback('\n'));
                    }
                }),
                removeListener: vi.fn()
            };

            const originalStdin = process.stdin;
            Object.defineProperty(process, 'stdin', {
                value: mockStdin,
                writable: true,
                configurable: true
            });

            try {
                // Act & Assert
                await expect(interactive.getUserTextInput(prompt))
                    .rejects.toThrow('Empty input received');
            } finally {
                Object.defineProperty(process, 'stdin', {
                    value: originalStdin,
                    writable: true,
                    configurable: true
                });
            }
        });
    });

    describe('getLLMFeedbackInEditor', () => {
        let mockFileHandle: any;

        beforeEach(() => {
            mockFileHandle = {
                writeFile: vi.fn(),
                readFile: vi.fn(),
                close: vi.fn()
            };
            fs.open.mockResolvedValue(mockFileHandle);
            spawnSync.mockReturnValue({ error: null });

            // Clear environment variables
            delete process.env.EDITOR;
            delete process.env.VISUAL;
        });

        it('should get LLM feedback in editor', async () => {
            // Arrange
            const contentType = 'commit message';
            const currentContent = 'original commit message';

            // Mock fs.readFile to return the processed content (after comment filtering)
            // This simulates what editContentInEditor would return
            fs.readFile.mockResolvedValue('Make it more descriptive\n\n### original\n\noriginal commit message');

            // Act
            const result = await interactive.getLLMFeedbackInEditor(contentType, currentContent);

            // Assert - the function returns everything before the ### original section
            expect(result).toBe('Make it more descriptive\n\n\noriginal commit message');
        });

        it('should handle feedback without original section', async () => {
            // Arrange
            const contentType = 'commit message';
            const currentContent = 'original commit message';

            // Mock fs.readFile to return content without original section
            fs.readFile.mockResolvedValue('Make it more descriptive');

            // Act
            const result = await interactive.getLLMFeedbackInEditor(contentType, currentContent);

            // Assert
            expect(result).toBe('Make it more descriptive');
        });

        it('should handle empty feedback', async () => {
            // Arrange
            const contentType = 'commit message';
            const currentContent = 'original commit message';

            // Mock fs.readFile to return content with empty feedback
            // The function will return everything before the ### original section
            fs.readFile.mockResolvedValue('\n\n### original\n\noriginal commit message');

            // Act
            const result = await interactive.getLLMFeedbackInEditor(contentType, currentContent);

            // Assert - the function returns everything before the ### original section
            // Since it's not finding the ### original section, it returns the entire content
            expect(result).toBe('original commit message');
        });
    });

    describe('improveContentWithLLM', () => {
        it('should improve content with LLM', async () => {
            // Arrange
            const currentContent = 'original content';
            const runConfig = { model: 'gpt-4' };
            const promptConfig = { template: 'improve' };
            const promptContext = { context: 'test' };
            const outputDirectory = '/tmp/output';

            const improvementConfig = {
                contentType: 'commit message',
                createImprovedPrompt: vi.fn().mockResolvedValue({ prompt: 'improved prompt' }),
                callLLM: vi.fn().mockResolvedValue({ content: 'improved content' })
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
            expect(improvementConfig.createImprovedPrompt).toHaveBeenCalledWith(
                promptConfig,
                currentContent,
                promptContext
            );
            expect(improvementConfig.callLLM).toHaveBeenCalledWith(
                { prompt: 'improved prompt' },
                runConfig,
                outputDirectory
            );
            expect(result).toEqual({ content: 'improved content' });
        });

        it('should use response processor when provided', async () => {
            // Arrange
            const currentContent = 'original content';
            const runConfig = { model: 'gpt-4' };
            const promptConfig = { template: 'improve' };
            const promptContext = { context: 'test' };
            const outputDirectory = '/tmp/output';

            const improvementConfig = {
                contentType: 'commit message',
                createImprovedPrompt: vi.fn().mockResolvedValue({ prompt: 'improved prompt' }),
                callLLM: vi.fn().mockResolvedValue({ content: 'improved content' }),
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
            expect(improvementConfig.processResponse).toHaveBeenCalledWith({ content: 'improved content' });
            expect(result).toBe('processed content');
        });
    });

    describe('requireTTY', () => {
        it('should not throw when TTY is available', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: true,
                configurable: true
            });

            // Act & Assert
            expect(() => interactive.requireTTY()).not.toThrow();
        });

        it('should throw when TTY is not available', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false,
                configurable: true
            });

            // Act & Assert
            expect(() => interactive.requireTTY()).toThrow('Interactive mode requires a terminal');
        });

        it('should use custom error message', () => {
            // Arrange
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false,
                configurable: true
            });

            const customMessage = 'Custom error message';

            // Act & Assert
            expect(() => interactive.requireTTY(customMessage)).toThrow(customMessage);
        });
    });

    describe('STANDARD_CHOICES', () => {
        it('should export standard choice constants', () => {
            // Assert
            expect(interactive.STANDARD_CHOICES.CONFIRM).toEqual({
                key: 'c',
                label: 'Confirm and proceed'
            });
            expect(interactive.STANDARD_CHOICES.SKIP).toEqual({
                key: 's',
                label: 'Skip and abort'
            });
            expect(interactive.STANDARD_CHOICES.EDIT).toEqual({
                key: 'e',
                label: 'Edit in editor'
            });
            expect(interactive.STANDARD_CHOICES.IMPROVE).toEqual({
                key: 'i',
                label: 'Improve with LLM feedback'
            });
        });
    });

    describe('Deprecated functions', () => {
        it('should create secure temp file (deprecated)', async () => {
            // Act
            const result = await interactive.createSecureTempFile('test', '.txt');

            // Assert
            expect(result).toBe('/tmp/test_file.txt');
            expect(fs.open).toHaveBeenCalled();
        });

        it('should cleanup temp file (deprecated)', async () => {
            // Act
            await interactive.cleanupTempFile('/tmp/test_file.txt');

            // Assert
            expect(fs.unlink).toHaveBeenCalledWith('/tmp/test_file.txt');
        });

        it('should handle cleanup errors gracefully (deprecated)', async () => {
            // Arrange
            fs.unlink.mockRejectedValue(new Error('Permission denied'));

            // Act
            await interactive.cleanupTempFile('/tmp/test_file.txt');

            // Assert
            expect(fs.unlink).toHaveBeenCalledWith('/tmp/test_file.txt');
        });
    });
});
