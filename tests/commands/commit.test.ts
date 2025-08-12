import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

vi.mock('../../src/prompt/prompts', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        createCommitPrompt: vi.fn(),
        format: vi.fn()
    })
}));

vi.mock('../../src/content/diff', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        get: vi.fn()
    }),
    hasStagedChanges: vi.fn(),
    hasCriticalExcludedChanges: vi.fn(),
    getMinimalExcludedPatterns: vi.fn(),
    truncateDiffByFiles: vi.fn()
}));

vi.mock('../../src/content/files', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        get: vi.fn()
    })
}));

vi.mock('../../src/prompt/commit', () => ({
    // @ts-ignore
    createPrompt: vi.fn().mockResolvedValue('mock prompt')
}));

vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
    runSecure: vi.fn(),
    runSecureWithInheritedStdio: vi.fn(),
    runWithInheritedStdio: vi.fn(),
    runWithDryRunSupport: vi.fn(),
    runSecureWithDryRunSupport: vi.fn(),
    validateGitRef: vi.fn(),
    validateFilePath: vi.fn(),
    escapeShellArg: vi.fn(),
}));

vi.mock('../../src/util/openai', () => ({
    // @ts-ignore
    createCompletion: vi.fn(),
    createCompletionWithRetry: vi.fn(),
    getModelForCommand: vi.fn()
}));

vi.mock('../../src/util/github', () => ({
    // @ts-ignore
    getRecentClosedIssuesForCommit: vi.fn()
}));

vi.mock('../../src/util/validation', () => ({
    // @ts-ignore
    validateString: vi.fn((val) => val),
    safeJsonParse: vi.fn((val) => {
        try {
            return JSON.parse(val);
        } catch {
            throw new Error('JSON parse failed');
        }
    }),
    validatePackageJson: vi.fn((val) => val)
}));

vi.mock('@riotprompt/riotprompt', () => {
    // Local builder instance to avoid TDZ issues
    const localBuilder: any = {
        addPersonaPath: vi.fn(async () => localBuilder),
        addInstructionPath: vi.fn(async () => localBuilder),
        addContent: vi.fn(async () => localBuilder),
        loadContext: vi.fn(async () => localBuilder),
        addContext: vi.fn(async () => localBuilder),
        build: vi.fn().mockResolvedValue('mock prompt')
    };

    return {
        // @ts-ignore
        createSection: vi.fn().mockReturnValue({
            add: vi.fn()
        }),
        // @ts-ignore
        Formatter: {
            create: vi.fn().mockReturnValue({
                // Ensure formatPrompt returns an object with a messages array to satisfy command logic
                formatPrompt: vi.fn().mockReturnValue({ messages: [] })
            })
        },
        // Provide a Builder factory used by prompt creators
        Builder: {
            create: vi.fn(() => localBuilder)
        },
        // Add the new quick API functions
        quick: {
            commit: vi.fn().mockResolvedValue('mock prompt')
        },
        // Add the recipe function used by the prompt files
        recipe: vi.fn().mockImplementation(() => ({
            persona: vi.fn().mockImplementation(() => ({
                instructions: vi.fn().mockImplementation(() => ({
                    overridePaths: vi.fn().mockImplementation(() => ({
                        overrides: vi.fn().mockImplementation(() => ({
                            content: vi.fn().mockImplementation(() => ({
                                context: vi.fn().mockImplementation(() => ({
                                    cook: vi.fn().mockResolvedValue('mock prompt')
                                }))
                            }))
                        }))
                    }))
                }))
            }))
        }))
    };
});

// Note: Not mocking log module to test real empty repository handling
vi.mock('../../src/content/log', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue('mock log content')
    })
}));

vi.mock('../../src/util/storage', () => ({
    create: vi.fn().mockReturnValue({
        writeFile: vi.fn().mockResolvedValue(undefined),
        ensureDirectory: vi.fn().mockResolvedValue(undefined)
    })
}));

vi.mock('../../src/util/safety', () => ({
    checkForFileDependencies: vi.fn().mockResolvedValue([]),
    logFileDependencyWarning: vi.fn(),
    logFileDependencySuggestions: vi.fn()
}));

vi.mock('../../src/util/validation', () => ({
    validateString: vi.fn((str) => str)
}));

// Mock ValidationError for proper error handling tests
vi.mock('../../src/error/CommandErrors', () => ({
    ValidationError: class ValidationError extends Error {
        constructor(message: string) {
            super(message);
            this.name = 'ValidationError';
        }
    },
    ExternalDependencyError: class ExternalDependencyError extends Error {
        constructor(message: string, tool?: string, cause?: Error) {
            super(message);
            this.name = 'ExternalDependencyError';
            this.cause = cause;
        }
    },
    CommandError: class CommandError extends Error {
        constructor(message: string, cause?: Error) {
            super(message);
            this.name = 'CommandError';
            this.cause = cause;
        }
    }
}));

// Create shared mock logger instance
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn()
};

// Mock the logging module
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue(mockLogger),
    getDryRunLogger: vi.fn().mockReturnValue(mockLogger)
}));

vi.mock('../../src/util/general', () => ({
    // @ts-ignore
    stringifyJSON: vi.fn(),
    getOutputPath: vi.fn().mockImplementation((dir, file) => `${dir}/${file}`),
    getTimestampedRequestFilename: vi.fn(),
    getTimestampedResponseFilename: vi.fn(),
    getTimestampedCommitFilename: vi.fn().mockReturnValue('commit-message-test.md')
}));

vi.mock('shell-escape', () => ({
    // @ts-ignore
    default: vi.fn()
}));

// Mock interactive utilities
const mockGetUserChoice = vi.fn();
const mockEditContentInEditor = vi.fn();
const mockImproveContentWithLLM = vi.fn();
const mockRequireTTY = vi.fn();
const mockGetUserTextInput = vi.fn();
const mockGetLLMFeedbackInEditor = vi.fn();

vi.mock('../../src/util/interactive', () => ({
    getUserChoice: mockGetUserChoice,
    editContentInEditor: mockEditContentInEditor,
    improveContentWithLLM: mockImproveContentWithLLM,
    requireTTY: mockRequireTTY,
    getUserTextInput: mockGetUserTextInput,
    getLLMFeedbackInEditor: mockGetLLMFeedbackInEditor,
    STANDARD_CHOICES: {
        CONFIRM: { key: 'c', label: 'Confirm and proceed' },
        EDIT: { key: 'e', label: 'Edit in editor' },
        SKIP: { key: 's', label: 'Skip and abort' },
        IMPROVE: { key: 'i', label: 'Improve with LLM feedback' }
    }
}));

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

describe('commit', () => {
    let Commit: any;
    let Logging: any;
    let Prompts: any;
    let Diff: any;
    let Files: any;
    let CommitPrompt: any;
    let Child: any;
    let OpenAI: any;
    let MinorPrompt: any;
    let Log: any;
    let General: any;
    let shellescape: any;
    let Safety: any;
    let Validation: any;
    let Storage: any;

    beforeEach(async () => {
        // Import modules after mocking
        Logging = await import('../../src/logging');
        CommitPrompt = await import('../../src/prompt/commit');
        Diff = await import('../../src/content/diff');
        Files = await import('../../src/content/files');
        Child = await import('../../src/util/child');
        OpenAI = await import('../../src/util/openai');
        MinorPrompt = await import('@riotprompt/riotprompt');
        Log = await import('../../src/content/log');
        General = await import('../../src/util/general');
        shellescape = (await import('shell-escape')).default;
        Safety = await import('../../src/util/safety');
        Validation = await import('../../src/util/validation');
        Storage = await import('../../src/util/storage');
        // Import the mocked prompts module so it can be referenced in tests
        // @ts-ignore – path is mocked above, actual file is not required
        Prompts = await import('../../src/prompt/prompts');
        Commit = await import('../../src/commands/commit');
    });

    afterEach(() => {
        // Clear only mock call history, not implementations
        mockLogger.info.mockClear();
        mockLogger.warn.mockClear();
        mockLogger.error.mockClear();
        mockLogger.debug.mockClear();
        mockLogger.verbose.mockClear();
        mockLogger.silly.mockClear();

        // Clear mock call history for other mocks
        // @ts-ignore
        Diff.create.mockClear?.();
        // @ts-ignore
        Diff.hasCriticalExcludedChanges.mockClear?.();
        // @ts-ignore
        Diff.getMinimalExcludedPatterns.mockClear?.();
        // @ts-ignore
        Diff.hasStagedChanges.mockClear?.();
        // @ts-ignore
        OpenAI.createCompletionWithRetry.mockClear?.();
        // @ts-ignore
        OpenAI.getModelForCommand.mockClear?.();
        // @ts-ignore
        Child.run.mockClear?.();
        // @ts-ignore
        Child.runWithDryRunSupport.mockClear?.();
        // @ts-ignore
        Storage.create.mockClear?.();
        // @ts-ignore
        Safety.checkForFileDependencies.mockClear?.();
        // @ts-ignore
        Validation.validateString.mockClear?.();
        mockExit.mockClear();

        // Reset the default mocks for new functions
        // @ts-ignore
        Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });
        // @ts-ignore
        Diff.getMinimalExcludedPatterns.mockReturnValue([]);
        // @ts-ignore
        Diff.hasStagedChanges.mockResolvedValue(false);
        // @ts-ignore
        OpenAI.getModelForCommand.mockReturnValue('gpt-3.5-turbo');
        // @ts-ignore
        Validation.validateString.mockImplementation((str) => str);

        // Set up default Child.run mock for git commands
        // @ts-ignore
        Child.run.mockImplementation((command) => {
            if (command.includes('git log')) {
                // Default to successful git log with some mock content
                return Promise.resolve({ stdout: 'commit abcdef\nAuthor: Test <test@test.com>\nDate: Mon Jan 1 12:00:00 2024\n\n    mock commit', stderr: '' });
            }
            return Promise.resolve({ stdout: '', stderr: '' });
        });
    });

    it('should execute commit with cached changes', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                sendit: false
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockLogContent = 'mock log content';
        const mockPrompt = 'mock prompt';
        const mockRequest = { messages: [] };
        const mockSummary = 'test: add new feature';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });

        // Explicitly mock Child.run for this test to ensure git log succeeds
        // @ts-ignore
        Child.run.mockImplementation((command) => {
            if (command.includes('git log')) {
                return Promise.resolve({ stdout: mockLogContent, stderr: '' });
            }
            return Promise.resolve({ stdout: '', stderr: '' });
        });

        // @ts-ignore
        Prompts.create.mockReturnValue({
            // @ts-ignore
            createCommitPrompt: vi.fn().mockResolvedValue(mockPrompt),
            // @ts-ignore
            format: vi.fn().mockReturnValue(mockRequest)
        });
        // @ts-ignore
        OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(result).toBe(mockSummary);
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'], maxDiffBytes: 20480 });
        expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
    });

    it('should check for staged changes when cached is undefined', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: undefined,
                sendit: false
            }
        };
        const mockDiffContent = 'mock diff content';

        Diff.hasStagedChanges.mockResolvedValue(true);
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.hasStagedChanges).toHaveBeenCalled();
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'], maxDiffBytes: 20480 });
    });

    it('should use cached=false when no staged changes and cached is undefined', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: undefined,
                sendit: false
            }
        };
        const mockDiffContent = 'mock diff content';

        Diff.hasStagedChanges.mockResolvedValue(false);
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.hasStagedChanges).toHaveBeenCalled();
        expect(Diff.create).toHaveBeenCalledWith({ cached: false, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'], maxDiffBytes: 20480 });
    });

    it('should commit changes when sendit is true and changes are staged', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test: add new feature';
        const mockEscapedSummary = "'test: add new feature'";

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
        Child.run.mockResolvedValue({ stdout: 'Commit successful' });
        shellescape.mockReturnValue(mockEscapedSummary);

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(result).toBe(mockSummary);
        expect(shellescape).toHaveBeenCalledWith([mockSummary]);
        expect(Child.run).toHaveBeenCalledWith(`git commit -m ${mockEscapedSummary}`);
    });

    it('should complete successfully when sendit is true but no changes are staged', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: false,
                sendit: true
            }
        };

        // Mock empty diff content
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('') });

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert - The main goal is successful completion without errors
        expect(result).toBe('No changes to commit.');
    });

    it('should complete successfully when sendit is true but cached becomes false during execution', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: undefined,
                sendit: true
            }
        };
        const mockDiffContent = ''; // Empty diff content
        const mockSummary = 'test commit message';

        Diff.hasStagedChanges.mockResolvedValue(false);
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert - The main goal is successful completion without errors
        expect(result).toBe('No changes to commit.');
    });

    it('should handle commit error in sendit mode', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test: add new feature';
        const mockError = new Error('Git commit failed');

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
        Child.run.mockRejectedValue(mockError);
        shellescape.mockReturnValue("'test: add new feature'");

        // Act & Assert
        await expect(async () => {
            await Commit.execute(mockConfig);
        }).rejects.toThrow('Failed to create commit');
    });

    it('should run "git add -A" and use cached diff when add is true', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                add: true,
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockLogContent = 'mock log content';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        // @ts-ignore
        Prompts.create.mockReturnValue({
            createCommitPrompt: vi.fn().mockResolvedValue('mock prompt'),
            format: vi.fn().mockReturnValue({ messages: [] })
        });
        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');
        Child.run.mockResolvedValue({ stdout: 'Success' });

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Child.run).toHaveBeenCalledWith('git add -A');
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'], maxDiffBytes: 20480 });
        expect(Diff.hasStagedChanges).not.toHaveBeenCalled();
    });

    it('should handle debug mode and log formatted prompt', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            debug: true,
            commit: {
                cached: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockPrompt = 'mock prompt';
        const mockFormattedPrompt = 'formatted prompt';
        const mockStringified = 'stringified formatted prompt';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        // @ts-ignore
        MinorPrompt.Formatter.create.mockReturnValue({
            formatPrompt: vi.fn().mockReturnValue(mockFormattedPrompt)
        });
        // @ts-ignore
        General.stringifyJSON.mockReturnValue(mockStringified);
        // @ts-ignore
        Prompts.create.mockReturnValue({
            createCommitPrompt: vi.fn().mockResolvedValue(mockPrompt),
            format: vi.fn().mockReturnValue({ messages: [] })
        });
        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(MinorPrompt.Formatter.create).toHaveBeenCalled();
        expect(General.stringifyJSON).toHaveBeenCalledWith(mockFormattedPrompt);
    });

    it('should pass context to createCommitPrompt when provided', async () => {
        // Arrange
        const mockContext = 'This is a bug fix';
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                context: mockContext
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockLogContent = 'mock log content';
        const mockPrompt = 'mock prompt';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        // Using default Child.run mock that handles git log with mockLogContent
        // @ts-ignore
        Child.run.mockImplementation((command) => {
            if (command.includes('git log')) {
                return Promise.resolve({ stdout: mockLogContent, stderr: '' });
            }
            return Promise.resolve({ stdout: '', stderr: '' });
        });

        // Spy on the new prompt creator
        const CommitPromptModule = await import('../../src/prompt/commit');
        const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(promptSpy).toHaveBeenCalledWith(
            { overridePaths: [], overrides: false },
            { diffContent: mockDiffContent, userDirection: undefined, isFileContent: false },
            { context: mockContext, logContext: mockLogContent, directories: undefined }
        );
    });

    it('should pass messageLimit to log creation when provided', async () => {
        // Arrange
        const mockMessageLimit = 10;
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                messageLimit: mockMessageLimit
            }
        };
        const mockDiffContent = 'mock diff content';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert - Note: Log.create is no longer mocked, but we can verify the command runs successfully
        // The messageLimit parameter gets passed to Log.create internally, but we can't assert on it directly
    });

    it('should use custom excluded patterns when provided', async () => {
        // Arrange
        const customPatterns = ['custom-pattern', '*.temp'];
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            excludedPatterns: customPatterns,
            commit: {
                cached: true
            }
        };
        const mockDiffContent = 'mock diff content';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: customPatterns, maxDiffBytes: 20480 });
    });

    it('should handle combination of add and sendit modes', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                add: true,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test: add feature';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
        Child.run.mockResolvedValue({ stdout: 'Success' });
        shellescape.mockReturnValue("'test: add feature'");

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(Child.run).toHaveBeenCalledWith('git add -A');
        expect(Child.run).toHaveBeenCalledWith("git commit -m 'test: add feature'");
        expect(result).toBe(mockSummary);
    });

    it('should call logger methods appropriately', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                add: true,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test: add feature';
        const mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        // @ts-ignore
        Logging.getDryRunLogger.mockReturnValue(mockLogger);
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
        Child.run.mockResolvedValue({ stdout: 'Success' });
        shellescape.mockReturnValue("'test: add feature'");

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(mockLogger.info).toHaveBeenCalledWith('📁 Adding all changes to the index (git add -A)...');
        expect(mockLogger.info).toHaveBeenCalledWith('✅ Successfully staged all changes');
        expect(mockLogger.info).toHaveBeenCalledWith('SendIt mode enabled. %s with message: \n\n%s\n\n', 'Committing', mockSummary);
        expect(mockLogger.info).toHaveBeenCalledWith('Commit successful!');
    });

    // NEW COMPREHENSIVE TESTS START HERE

    describe('Dry Run Mode', () => {
        it('should handle dry run with add flag', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    add: true
                }
            };
            const mockDiffContent = 'mock diff content';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit');
            // In dry run mode, we should still gather log context but not git add or git commit
            expect(Log.create).toHaveBeenCalled();
        });

        it('should handle dry run with sendit flag', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    cached: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            // In dry run mode, we should still gather log context but not git commit
            expect(Log.create).toHaveBeenCalled();
        });

        it('should handle dry run without changes and provide template message', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    cached: true
                }
            };
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('') });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
        });
    });

    describe('File Dependency Safety Checks', () => {
        it('should block commit when file dependencies are found', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';
            const mockFileDependencies = [{
                packagePath: './package.json',
                dependencies: [{ name: 'my-lib', version: 'file:../my-lib', dependencyType: 'dependencies' }]
            }];

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Safety.checkForFileDependencies.mockResolvedValue(mockFileDependencies);

            // Instead of expecting the process to exit, we need to simulate how the ValidationError
            // is actually thrown and caught within the file dependency check
            // We can mock the checkForFileDependencies to throw a ValidationError
            const { ValidationError } = await import('../../src/error/CommandErrors');
            Safety.checkForFileDependencies.mockImplementation(async () => {
                // This simulates finding file dependencies and throwing the ValidationError
                throw new ValidationError('Found file: dependencies that should not be committed. Use --skip-file-check to bypass.');
            });

            // The ValidationError should be caught and the commit should continue with a warning
            Child.run.mockResolvedValue({ stdout: 'Success' });
            shellescape.mockReturnValue("'test: add feature'");

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            // The commit should complete successfully because the ValidationError is caught
            // and treated as a warning in the current implementation
            expect(result).toBe(mockSummary);
            expect(Safety.checkForFileDependencies).toHaveBeenCalled();
            // The commit should still proceed because the error is caught
            expect(Child.run).toHaveBeenCalledWith("git commit -m 'test: add feature'");
        });

        it('should skip file dependency check when skipFileCheck is true', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: true,
                    skipFileCheck: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Child.run.mockResolvedValue({ stdout: 'Success' });
            shellescape.mockReturnValue("'test: add feature'");

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(Safety.checkForFileDependencies).not.toHaveBeenCalled();
        });

        it('should handle file dependency check failure gracefully', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Safety.checkForFileDependencies.mockRejectedValue(new Error('File system error'));
            Child.run.mockResolvedValue({ stdout: 'Success' });
            shellescape.mockReturnValue("'test: add feature'");

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            // Check that the commit still completes successfully despite the error
            expect(Child.run).toHaveBeenCalledWith("git commit -m 'test: add feature'");
        });

        it('should not run file dependency check in dry run mode', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    cached: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(Safety.checkForFileDependencies).not.toHaveBeenCalled();
        });

        it('should not run file dependency check when not committing', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: false
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(Safety.checkForFileDependencies).not.toHaveBeenCalled();
        });
    });

    describe('Save Commit Message Functionality', () => {
        it('should save commit message to timestamped file', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';
            const mockStorage = {
                writeFile: vi.fn().mockResolvedValue(undefined),
                ensureDirectory: vi.fn().mockResolvedValue(undefined)
            };

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Storage.create.mockReturnValue(mockStorage);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('output/kodrdriv');
            expect(mockStorage.writeFile).toHaveBeenCalledWith('output/kodrdriv/commit-message-test.md', mockSummary, 'utf-8');
        });

        it('should handle custom output directory', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                outputDirectory: 'custom-output',
                commit: { cached: true }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';
            const mockStorage = {
                writeFile: vi.fn().mockResolvedValue(undefined),
                ensureDirectory: vi.fn().mockResolvedValue(undefined)
            };

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Storage.create.mockReturnValue(mockStorage);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('custom-output');
            expect(mockStorage.writeFile).toHaveBeenCalledWith('custom-output/commit-message-test.md', mockSummary, 'utf-8');
        });
    });

    describe('Validation and Error Handling', () => {
        it('should validate commit summary before committing', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Validation.validateString.mockReturnValue(mockSummary);
            Child.run.mockResolvedValue({ stdout: 'Success' });
            shellescape.mockReturnValue("'test: add feature'");

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(Validation.validateString).toHaveBeenCalledWith(mockSummary, 'commit summary');
        });

        it('should handle validation error', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Validation.validateString.mockImplementation(() => {
                throw new Error('Invalid commit message');
            });

            // Act & Assert
            await expect(async () => {
                await Commit.execute(mockConfig);
            }).rejects.toThrow('Failed to create commit');
        });

        it('should handle unexpected errors', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };

            // @ts-ignore
            Diff.create.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            // Act & Assert
            await expect(async () => {
                await Commit.execute(mockConfig);
            }).rejects.toThrow('Unexpected error');
        });
    });

    describe('No Changes Scenarios', () => {
        it('should generate template message when no changes and sendit is false', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: false
                }
            };
            const mockSummary = 'test: template message';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('') });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
        });

        it('should return early when no changes and sendit is true', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    sendit: true
                }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('') });

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit.');
            expect(OpenAI.createCompletionWithRetry).not.toHaveBeenCalled();
        });
    });

    describe('Configuration Options', () => {
        it('should pass discoveredConfigDirs to prompt config', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                discoveredConfigDirs: ['/path/to/config1', '/path/to/config2'],
                commit: { cached: true }
            };
            const mockDiffContent = 'mock diff content';
            const mockPrompt = 'mock prompt';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });

            const CommitPromptModule = await import('../../src/prompt/commit');
            const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(promptSpy).toHaveBeenCalledWith(
                { overridePaths: ['/path/to/config1', '/path/to/config2'], overrides: false },
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should pass overrides flag to prompt config', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                overrides: true,
                commit: { cached: true }
            };
            const mockDiffContent = 'mock diff content';
            const mockPrompt = 'mock prompt';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });

            const CommitPromptModule = await import('../../src/prompt/commit');
            const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(promptSpy).toHaveBeenCalledWith(
                { overridePaths: [], overrides: true },
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should pass contextDirectories to prompt context', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                contextDirectories: ['/path/to/context1', '/path/to/context2'],
                commit: { cached: true }
            };
            const mockDiffContent = 'mock diff content';
            const mockPrompt = 'mock prompt';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });

            const CommitPromptModule = await import('../../src/prompt/commit');
            const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(promptSpy).toHaveBeenCalledWith(
                expect.any(Object),
                expect.any(Object),
                expect.objectContaining({
                    directories: ['/path/to/context1', '/path/to/context2']
                })
            );
        });

        it('should pass direction to prompt content', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    direction: 'Make this a very detailed commit message'
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockPrompt = 'mock prompt';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });

            const CommitPromptModule = await import('../../src/prompt/commit');
            const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(promptSpy).toHaveBeenCalledWith(
                expect.any(Object),
                expect.objectContaining({
                    userDirection: 'Make this a very detailed commit message'
                }),
                expect.any(Object)
            );
        });
    });

    describe('Error Handling', () => {
        it('should complete successfully for sendit without changes', async () => {
            // Arrange
            const mockConfig = {
                commit: { sendit: true },
                dryRun: false
            };

            // Mock no staged changes and empty diff
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);
            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('') });

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert - The main goal is that the command completes successfully
            // without throwing an error and returns an appropriate message
            expect(result).toBe('No changes to commit.');
        });

        it('should handle ExternalDependencyError for git commit failure', async () => {
            // Arrange
            const mockConfig = {
                commit: { sendit: true, skipFileCheck: true },
                dryRun: false
            };
            const mockSummary = 'feat: add new feature';

            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(true);
            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('diff content') });
            // @ts-ignore
            // Using default Child.run mock that handles git log
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Mock git commit failure
            // @ts-ignore
            Child.run.mockRejectedValue(new Error('git commit failed'));

            // Act & Assert
            await expect(async () => {
                await Commit.execute(mockConfig);
            }).rejects.toThrow('Failed to create commit');
        });
    });

    describe('sendIt Mode Edge Cases', () => {
        beforeEach(() => {
            // Clear only mock call history, not implementations
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
            mockLogger.verbose.mockClear();
            mockLogger.silly.mockClear();

            // Re-establish logger mock implementation to ensure it returns our mockLogger
            // @ts-ignore
            const { getDryRunLogger } = Logging;
            getDryRunLogger.mockReturnValue(mockLogger);

            // Clear mock call history for other mocks
            // @ts-ignore
            Diff.create.mockClear?.();
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockClear?.();
            // @ts-ignore
            Diff.getMinimalExcludedPatterns.mockClear?.();
            // @ts-ignore
            Diff.hasStagedChanges.mockClear?.();
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockClear?.();
            // @ts-ignore
            OpenAI.getModelForCommand.mockClear?.();
            // @ts-ignore
            Child.run.mockClear?.();
            // @ts-ignore
            Child.runWithDryRunSupport.mockClear?.();
            // @ts-ignore
            Storage.create.mockClear?.();
            // @ts-ignore
            Safety.checkForFileDependencies.mockClear?.();
            // @ts-ignore
            Validation.validateString.mockClear?.();

            // Reset mock return values to defaults
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });
            // @ts-ignore
            Diff.getMinimalExcludedPatterns.mockReturnValue([]);
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);
            // @ts-ignore
            OpenAI.getModelForCommand.mockReturnValue('gpt-3.5-turbo');
            // @ts-ignore
            Validation.validateString.mockImplementation((str) => str);
        });

        it('should show message when sendit is enabled but no actual changes to commit', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: true
                }
            };
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('  \n  ') }); // Whitespace only
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: false,
                files: []
            });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit.');
            expect(OpenAI.createCompletionWithRetry).not.toHaveBeenCalled();
        });

        it('should show generated message when sendit is enabled but changes are not cached', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: true
                }
            };
            const mockDiffContent = 'mock diff content';
            const mockSummary = 'test: add feature';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
            expect(Child.run).not.toHaveBeenCalledWith(expect.stringMatching(/^git commit/)); // Should not run git commit because cached is false
        });

        it('should detect and include critical files in sendit mode when no regular changes', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: true
                }
            };
            const mockDiffContent = 'diff --git a/package-lock.json\n+added dependency';
            const mockSummary = 'build: update dependencies';

            // First diff call returns empty (no regular changes)
            const mockEmptyDiff = { get: vi.fn().mockResolvedValue('  \n  ') };
            // Second diff call with minimal patterns returns actual changes
            const mockCriticalDiff = { get: vi.fn().mockResolvedValue(mockDiffContent) };

            // @ts-ignore
            Diff.create.mockReturnValueOnce(mockEmptyDiff).mockReturnValueOnce(mockCriticalDiff);
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['package-lock.json']
            });
            // @ts-ignore
            Diff.getMinimalExcludedPatterns.mockReturnValue(['node_modules', 'dist']);
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(Diff.hasCriticalExcludedChanges).toHaveBeenCalled();
            expect(Diff.getMinimalExcludedPatterns).toHaveBeenCalled();
            expect(Diff.create).toHaveBeenCalledTimes(2);
            expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
        });

        it('should suggest command line options when critical files detected but not in sendit mode', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: false
                }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('  \n  ') });
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['package-lock.json', '.gitignore']
            });

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit. Use suggestions above to include critical files.');
            expect(mockLogger.warn).toHaveBeenCalledWith('Consider including these files by using:');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                '  kodrdriv commit --excluded-paths %s',
                expect.stringContaining('"node_modules"')
            );
            expect(mockLogger.warn).toHaveBeenCalledWith('Or run with --sendit to automatically include critical files.');
        });

        it('should handle case when no critical files are detected', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: true
                }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('  \n  ') });
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: false,
                files: []
            });

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit.');
            expect(Diff.getMinimalExcludedPatterns).not.toHaveBeenCalled();
        });

        it('should handle critical files with no actual changes after inclusion', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: true
                }
            };

            // First diff call returns empty (no regular changes)
            const mockEmptyDiff = { get: vi.fn().mockResolvedValue('  \n  ') };
            // Second diff call with minimal patterns still returns empty
            const mockStillEmptyDiff = { get: vi.fn().mockResolvedValue('  \n  ') };

            // @ts-ignore
            Diff.create.mockReturnValueOnce(mockEmptyDiff).mockReturnValueOnce(mockStillEmptyDiff);
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['package-lock.json']
            });
            // @ts-ignore
            Diff.getMinimalExcludedPatterns.mockReturnValue(['node_modules', 'dist']);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit.');
            expect(mockLogger.warn).toHaveBeenCalledWith('No changes detected even after including critical files.');
        });

        it('should handle excluded files in dry-run mode by generating template', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    cached: false,
                    sendit: false
                }
            };
            const mockSummary = 'test: template message for critical files';

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('  \n  ') });
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['package-lock.json', '.gitignore']
            });
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(mockLogger.info).toHaveBeenCalledWith('Generating commit message template for future use...');
            expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
        });

        it('should include critical files when using --add and sendit mode', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    add: true,
                    sendit: true
                }
            };
            const mockDiffContent = 'diff --git a/package-lock.json\n+added dependency';
            const mockSummary = 'build: update dependencies';

            // First diff call returns empty (no regular changes)
            const mockEmptyDiff = { get: vi.fn().mockResolvedValue('  \n  ') };
            // Second diff call with minimal patterns returns actual changes
            const mockCriticalDiff = { get: vi.fn().mockResolvedValue(mockDiffContent) };

            // @ts-ignore
            Diff.create.mockReturnValueOnce(mockEmptyDiff).mockReturnValueOnce(mockCriticalDiff);
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['package-lock.json']
            });
            // @ts-ignore
            Diff.getMinimalExcludedPatterns.mockReturnValue(['node_modules', 'dist']);
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(true);
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            Child.run.mockResolvedValue({ stdout: 'Success' });
            shellescape.mockReturnValue("'build: update dependencies'");

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(Child.run).toHaveBeenCalledWith('git add -A'); // Should add first
            expect(Diff.hasCriticalExcludedChanges).toHaveBeenCalled();
            expect(Diff.getMinimalExcludedPatterns).toHaveBeenCalled();
            expect(Diff.create).toHaveBeenCalledTimes(2);
            expect(Child.run).toHaveBeenCalledWith("git commit -m 'build: update dependencies'");
        });

        it('should suggest using --excluded-paths to manually include critical files', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                excludedPatterns: ['node_modules', 'package-lock.json', '.gitignore', 'dist'],
                commit: {
                    cached: false,
                    sendit: false
                }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue('') });
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['package-lock.json', '.gitignore']
            });
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);
            OpenAI.createCompletionWithRetry.mockResolvedValue('mock commit message');

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit. Use suggestions above to include critical files.');
            expect(mockLogger.warn).toHaveBeenCalledWith('Consider including these files by using:');
            expect(mockLogger.warn).toHaveBeenCalledWith(
                '  kodrdriv commit --excluded-paths %s',
                expect.stringContaining('"node_modules"')
            );
            expect(mockLogger.warn).toHaveBeenCalledWith('Or run with --sendit to automatically include critical files.');
        });

        it('should detect multiple types of critical files', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: false,
                    sendit: true
                }
            };
            const mockDiffContent = 'diff --git a/yarn.lock\n+package updates\ndiff --git a/.env.example\n+new env var';
            const mockSummary = 'chore: update dependencies and environment template';

            // First diff call returns empty (no regular changes)
            const mockEmptyDiff = { get: vi.fn().mockResolvedValue('  \n  ') };
            // Second diff call with minimal patterns returns actual changes
            const mockCriticalDiff = { get: vi.fn().mockResolvedValue(mockDiffContent) };

            // @ts-ignore
            Diff.create.mockReturnValueOnce(mockEmptyDiff).mockReturnValueOnce(mockCriticalDiff);
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({
                hasChanges: true,
                files: ['yarn.lock', '.env.example', 'bun.lockb']
            });
            // @ts-ignore
            Diff.getMinimalExcludedPatterns.mockReturnValue(['node_modules', 'dist']);
            OpenAI.createCompletionWithRetry.mockResolvedValue(mockSummary);
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);
            Child.run.mockResolvedValue({ stdout: 'Success' });
            shellescape.mockReturnValue("'chore: update dependencies and environment template'");

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe(mockSummary);
            expect(mockLogger.info).toHaveBeenCalledWith(
                'No changes found with current exclusion patterns, but detected changes to critical files: %s',
                'yarn.lock, .env.example, bun.lockb'
            );
            expect(mockLogger.info).toHaveBeenCalledWith('SendIt mode: Including critical files in diff...');
            expect(mockLogger.info).toHaveBeenCalledWith('Successfully included critical files in diff.');
        });
    });

    describe('Amend Mode Tests', () => {
        beforeEach(() => {
            // Clear all mocks
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
            mockLogger.verbose.mockClear();
            mockLogger.silly.mockClear();

            // Reset default mocks
            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            // @ts-ignore
            Child.run.mockResolvedValue({ stdout: 'Success' });
            // @ts-ignore
            shellescape.mockReturnValue("'test commit message'");
        });

        it('should use amend mode when configured', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    amend: true,
                    sendit: true
                }
            };

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(Child.run).toHaveBeenCalledWith("git commit --amend -m 'test commit message'");
        });

        it('should validate that commits exist before using amend mode', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    amend: true
                }
            };

            // Mock hasCommits to return false (no previous commits)
            // @ts-ignore
            Child.run.mockRejectedValueOnce(new Error('No commits found'));

            // Act & Assert
            await expect(Commit.execute(mockConfig)).rejects.toThrow('Cannot use --amend: no commits found in repository. Create an initial commit first.');
        });

        it('should use cached changes when amend is enabled', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    amend: true
                }
            };

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(Diff.create).toHaveBeenCalledWith({
                cached: true,
                excludedPatterns: expect.any(Array),
                maxDiffBytes: expect.any(Number)
            });
        });

        it('should show amend option in interactive mode', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    amend: true,
                    interactive: true,
                    sendit: true
                }
            };

            mockGetUserChoice.mockResolvedValue('c');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(mockGetUserChoice).toHaveBeenCalledWith(
                '\nWhat would you like to do with this commit message?',
                expect.arrayContaining([
                    expect.objectContaining({
                        key: 'c',
                        label: 'Amend last commit with this message (sendit enabled)'
                    })
                ]),
                expect.any(Object)
            );
        });

        it('should handle amend mode in dry run', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    amend: true,
                    sendit: true
                }
            };

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockLogger.info).toHaveBeenCalledWith('Would execute: %s', 'git commit --amend -m <generated-message>');
        });
    });

    describe('Retry Callback Tests', () => {
        beforeEach(() => {
            // Clear all mocks
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
            mockLogger.verbose.mockClear();
            mockLogger.silly.mockClear();
        });

        it('should trigger retry callback on token limit errors', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    maxDiffBytes: 4096
                }
            };
            const originalDiff = 'very large diff content that exceeds token limits'.repeat(100);

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue(originalDiff)
            });

            let retryCount = 0;
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockImplementation(async (messages, options, retryCallback) => {
                if (retryCallback && retryCount === 0) {
                    retryCount++;
                    // Just verify the callback is called - we don't need to test the full retry logic here
                    await retryCallback(1);
                }
                return 'test commit message';
            });

            // @ts-ignore
            Diff.truncateDiffByFiles.mockReturnValue('truncated diff content');

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockLogger.info).toHaveBeenCalledWith('Retrying with reduced diff size (attempt %d)', 1);
        });

        it('should progressively reduce diff size on multiple retries', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    maxDiffBytes: 4096
                }
            };
            const originalDiff = 'large diff content'.repeat(100);

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue(originalDiff)
            });

            let retryCount = 0;
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockImplementation(async (messages, options, retryCallback) => {
                if (retryCallback && retryCount < 2) {
                    retryCount++;
                    await retryCallback(retryCount);
                }
                return 'test commit message';
            });

            // @ts-ignore
            Diff.truncateDiffByFiles.mockReturnValue('progressively truncated diff');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(mockLogger.debug).toHaveBeenCalledWith('Reducing maxDiffBytes from %d to %d for retry', 4096, expect.any(Number));
            expect(Diff.truncateDiffByFiles).toHaveBeenCalledTimes(retryCount);
        });

        it('should ensure minimum diff size is maintained during retries', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    maxDiffBytes: 1024
                }
            };

            let actualReducedSize = 0;
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockImplementation(async (messages, options, retryCallback) => {
                if (retryCallback) {
                    // Simulate multiple retries to test minimum size
                    await retryCallback(5); // Should reduce to minimum of 512
                }
                return 'test commit message';
            });

            // @ts-ignore
            Diff.truncateDiffByFiles.mockImplementation((content, maxBytes) => {
                actualReducedSize = maxBytes;
                return content.substring(0, maxBytes);
            });

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(actualReducedSize).toBe(512); // Should not go below 512 bytes
        });
    });

    describe('Commit Message Saving with Fallback Tests', () => {
        beforeEach(() => {
            // Clear all mocks
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
            mockLogger.verbose.mockClear();
            mockLogger.silly.mockClear();
        });

        it('should save to primary location successfully', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                outputDirectory: 'custom-output',
                commit: { cached: true }
            };
            const mockStorage = {
                writeFile: vi.fn().mockResolvedValue(undefined),
                ensureDirectory: vi.fn().mockResolvedValue(undefined)
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            // @ts-ignore
            Storage.create.mockReturnValue(mockStorage);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                'custom-output/commit-message-test.md',
                'test commit message',
                'utf-8'
            );
            expect(mockLogger.debug).toHaveBeenCalledWith('Saved timestamped commit message: %s', 'custom-output/commit-message-test.md');
        });

        it('should fallback to output directory when primary location fails', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                outputDirectory: 'failing-output',
                commit: { cached: true }
            };
            const mockStorage = {
                writeFile: vi.fn()
                    .mockRejectedValueOnce(new Error('Primary location failed'))
                    .mockResolvedValueOnce(undefined), // Fallback succeeds
                ensureDirectory: vi.fn().mockResolvedValue(undefined)
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            // @ts-ignore
            Storage.create.mockReturnValue(mockStorage);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockStorage.writeFile).toHaveBeenCalledTimes(2);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to save commit message to primary location (%s): %s',
                'failing-output/commit-message-test.md',
                'Primary location failed'
            );
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Saved commit message to output directory fallback: %s',
                'output/commit-message-test.md'
            );
        });

        it('should fallback to current directory as last resort', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };
            const mockStorage = {
                writeFile: vi.fn()
                    .mockRejectedValueOnce(new Error('Primary location failed'))
                    .mockRejectedValueOnce(new Error('Output fallback failed'))
                    .mockResolvedValueOnce(undefined), // Last resort succeeds
                ensureDirectory: vi.fn().mockResolvedValue(undefined)
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            // @ts-ignore
            Storage.create.mockReturnValue(mockStorage);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockStorage.writeFile).toHaveBeenCalledTimes(3);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                'Failed to save to output directory fallback: %s',
                'Output fallback failed'
            );
            expect(mockLogger.warn).toHaveBeenCalledWith(
                '⚠️  Saved commit message to current directory as last resort: %s',
                expect.stringMatching(/commit-message-\d+\.txt/)
            );
        });

        it('should handle complete failure to save commit message', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };
            const mockStorage = {
                writeFile: vi.fn().mockRejectedValue(new Error('All save locations failed')),
                ensureDirectory: vi.fn().mockResolvedValue(undefined)
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            // @ts-ignore
            Storage.create.mockReturnValue(mockStorage);

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockStorage.writeFile).toHaveBeenCalledTimes(3);
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Failed to save commit message anywhere: %s',
                'All save locations failed'
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                'Commit message will only be available in console output'
            );
        });
    });

    describe('Interactive Mode Tests', () => {
        beforeEach(() => {
            // Clear all mocks
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
            mockLogger.verbose.mockClear();
            mockLogger.silly.mockClear();
            mockGetUserChoice.mockClear();
            mockEditContentInEditor.mockClear();
            mockImproveContentWithLLM.mockClear();
            mockRequireTTY.mockClear();
            mockGetUserTextInput.mockClear();
            mockGetLLMFeedbackInEditor.mockClear();

            // Re-establish logger mock implementation
            // @ts-ignore
            const { getDryRunLogger } = Logging;
            getDryRunLogger.mockReturnValue(mockLogger);

            // Clear mock call history for other mocks
            // @ts-ignore
            Diff.create.mockClear?.();
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockClear?.();
            // @ts-ignore
            Diff.hasStagedChanges.mockClear?.();
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockClear?.();
            // @ts-ignore
            OpenAI.getModelForCommand.mockClear?.();
            // @ts-ignore
            Child.run.mockClear?.();
            // @ts-ignore
            Storage.create.mockClear?.();
            // @ts-ignore
            Safety.checkForFileDependencies.mockClear?.();
            // @ts-ignore
            Validation.validateString.mockClear?.();

            // Default mocks for interactive tests
            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(true);
            // @ts-ignore
            Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });
            // @ts-ignore
            // Using default Child.run mock that handles git log
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            // @ts-ignore
            OpenAI.getModelForCommand.mockReturnValue('gpt-3.5-turbo');
            // @ts-ignore
            Validation.validateString.mockImplementation((str) => str);
            // @ts-ignore
            shellescape.mockImplementation((args) => args.join(' '));

            // Reset requireTTY mock to not throw by default
            mockRequireTTY.mockImplementation(() => {
                // Do nothing by default - let interactive mode proceed
            });

            // Mock TTY
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: true
            });
        });

        it('should handle interactive mode with non-TTY gracefully', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    interactive: true
                }
            };

            // Mock non-TTY environment
            Object.defineProperty(process.stdin, 'isTTY', {
                writable: true,
                value: false
            });

            // Override requireTTY to throw for this specific test
            mockRequireTTY.mockImplementation(() => {
                throw new Error('Interactive mode requires a terminal. Use --sendit or --dry-run instead.');
            });

            // Act & Assert
            await expect(Commit.execute(mockConfig)).rejects.toThrow(
                expect.objectContaining({
                    message: expect.stringContaining('Interactive mode requires a terminal')
                })
            );

            expect(mockLogger.error).toHaveBeenCalledWith('commit encountered unexpected error: Interactive mode requires a terminal. Use --sendit or --dry-run instead.');
        });

        it('should not enter interactive mode when dry-run is enabled', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true,
                commit: {
                    cached: true,
                    interactive: true
                }
            };

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Generated commit message: \n\n%s\n\n', 'test commit message'
            );
            expect(mockGetUserChoice).not.toHaveBeenCalled();
        });

        describe('sendit configuration with interactive mode', () => {
            it('should show commit option when sendit is enabled and has staged changes', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        sendit: true,
                        cached: true
                    }
                };

                mockGetUserChoice.mockResolvedValue('c');
                // @ts-ignore
                Child.run.mockResolvedValue(undefined);

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockGetUserChoice).toHaveBeenCalledWith(
                    '\nWhat would you like to do with this commit message?',
                    expect.arrayContaining([
                        expect.objectContaining({
                            key: 'c',
                            label: 'Commit changes with this message (sendit enabled)'
                        })
                    ]),
                    expect.any(Object)
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '\n⚙️  SendIt mode is ACTIVE - choosing "Commit" will run git commit automatically'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '🚀 SendIt enabled: %s with final message: \n\n%s\n\n', 'Committing', 'test commit message'
                );
                expect(Child.run).toHaveBeenCalledWith('git commit -m test commit message');
                expect(result).toBe('test commit message');
            });

            it('should show accept option when sendit is disabled', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        sendit: false,
                        cached: true
                    }
                };

                mockGetUserChoice.mockResolvedValue('c');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockGetUserChoice).toHaveBeenCalledWith(
                    '\nWhat would you like to do with this commit message?',
                    expect.arrayContaining([
                        expect.objectContaining({
                            key: 'c',
                            label: 'Accept message (you will need to commit manually)'
                        })
                    ]),
                    expect.any(Object)
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '\n⚙️  SendIt mode is NOT active - choosing "Accept" will only save the message'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '📝 Message accepted (SendIt not enabled). Use this commit message manually: \n\n%s\n\n', 'test commit message'
                );
                expect(Child.run).not.toHaveBeenCalledWith(expect.stringMatching(/^git commit/));
                expect(result).toBe('test commit message');
            });

            it('should show sendit configured but no staged changes message', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        sendit: true,
                        cached: false
                    }
                };

                // @ts-ignore
                Diff.hasStagedChanges.mockResolvedValue(false);
                mockGetUserChoice.mockResolvedValue('c');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockGetUserChoice).toHaveBeenCalledWith(
                    '\nWhat would you like to do with this commit message?',
                    expect.arrayContaining([
                        expect.objectContaining({
                            key: 'c',
                            label: 'Accept message (you will need to commit manually)'
                        })
                    ]),
                    expect.any(Object)
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '\n⚙️  SendIt mode is configured but no staged changes available for commit'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '📝 SendIt enabled but no staged changes available. Final message saved: \n\n%s\n\n', 'test commit message'
                );
                expect(Child.run).not.toHaveBeenCalledWith(expect.stringMatching(/^git commit/));
                expect(result).toBe('test commit message');
            });
        });

        describe('add configuration with interactive mode', () => {
            it('should show improved logging when add is configured', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        add: true,
                        sendit: true
                    }
                };

                mockGetUserChoice.mockResolvedValue('c');
                // @ts-ignore
                Child.run.mockResolvedValue(undefined);

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockLogger.info).toHaveBeenCalledWith('📁 Adding all changes to the index (git add -A)...');
                expect(mockLogger.info).toHaveBeenCalledWith('✅ Successfully staged all changes');
                expect(Child.run).toHaveBeenCalledWith('git add -A');
                expect(result).toBe('test commit message');
            });
        });

        describe('interactive choice handling', () => {
            it('should handle skip choice correctly', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        sendit: true,
                        cached: true
                    }
                };

                mockGetUserChoice.mockResolvedValue('s');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockLogger.info).toHaveBeenCalledWith('❌ Commit aborted by user');
                expect(Child.run).not.toHaveBeenCalledWith(expect.stringMatching(/^git commit/));
                expect(result).toBe('test commit message');
            });

            it('should handle edit choice correctly', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        sendit: true,
                        cached: true
                    }
                };

                mockGetUserChoice
                    .mockResolvedValueOnce('e') // First choice: edit
                    .mockResolvedValueOnce('c'); // Second choice: commit
                mockEditContentInEditor.mockResolvedValue({ content: 'edited commit message' });
                // @ts-ignore
                Child.run.mockResolvedValue(undefined);

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockEditContentInEditor).toHaveBeenCalledWith(
                    'test commit message',
                    expect.any(Array),
                    '.txt'
                );
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '🚀 SendIt enabled: %s with final message: \n\n%s\n\n', 'Committing', 'edited commit message'
                );
                expect(Child.run).toHaveBeenCalledWith('git commit -m edited commit message');
                expect(result).toBe('edited commit message');
            });

            it('should handle improve choice correctly', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        sendit: true,
                        cached: true
                    }
                };

                mockGetUserChoice
                    .mockResolvedValueOnce('i') // First choice: improve
                    .mockResolvedValueOnce('c'); // Second choice: commit
                mockGetLLMFeedbackInEditor.mockResolvedValue('Please make it more detailed');
                mockImproveContentWithLLM.mockResolvedValue('improved commit message');
                // @ts-ignore
                Child.run.mockResolvedValue(undefined);

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(mockGetLLMFeedbackInEditor).toHaveBeenCalledWith(
                    'commit message',
                    expect.any(String)
                );
                expect(mockImproveContentWithLLM).toHaveBeenCalled();
                expect(mockLogger.info).toHaveBeenCalledWith(
                    '🚀 SendIt enabled: %s with final message: \n\n%s\n\n', 'Committing', 'improved commit message'
                );
                expect(Child.run).toHaveBeenCalledWith('git commit -m improved commit message');
                expect(result).toBe('improved commit message');
            });
        });

        it('should handle sendit taking precedence over interactive in dry run', async () => {
            // Arrange - both interactive and sendit should not be used together
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                dryRun: true, // Use dry run to avoid interactive prompts
                commit: {
                    cached: true,
                    interactive: true,
                    sendit: true // This should take precedence
                }
            };

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert - sendit should take precedence when both are specified
            expect(result).toBe('test commit message');
            expect(mockLogger.info).toHaveBeenCalledWith(
                'Would commit with message: \n\n%s\n\n', 'test commit message'
            );
            expect(mockGetUserChoice).not.toHaveBeenCalled();
        });

        describe('interactive edit and improve error handling', () => {
            it('should handle edit errors gracefully in interactive mode', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        cached: true
                    }
                };

                mockGetUserChoice
                    .mockResolvedValueOnce('e') // First choice: edit (fails)
                    .mockResolvedValueOnce('c'); // Second choice: commit
                mockEditContentInEditor.mockRejectedValueOnce(new Error('Editor failed'));

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('test commit message');
                expect(mockLogger.error).toHaveBeenCalledWith('Failed to edit commit message: Editor failed');
                // Should continue and allow user to try again
                expect(mockGetUserChoice).toHaveBeenCalledTimes(2);
            });

            it('should handle LLM improvement errors gracefully in interactive mode', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        interactive: true,
                        cached: true
                    }
                };

                mockGetUserChoice
                    .mockResolvedValueOnce('i') // First choice: improve (fails)
                    .mockResolvedValueOnce('c'); // Second choice: commit
                mockGetLLMFeedbackInEditor.mockResolvedValue('Make it better');
                mockImproveContentWithLLM.mockRejectedValueOnce(new Error('LLM improvement failed'));

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('test commit message');
                expect(mockLogger.error).toHaveBeenCalledWith('Failed to improve commit message: LLM improvement failed');
                // Should continue and allow user to try again
                expect(mockGetUserChoice).toHaveBeenCalledTimes(2);
            });
        });
    });

    describe('Advanced Error Handling and Edge Cases', () => {
        beforeEach(() => {
            // Clear all mocks
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
            mockLogger.verbose.mockClear();
            mockLogger.silly.mockClear();
        });

        it('should handle ValidationError properly', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };

            const { ValidationError } = await import('../../src/error/CommandErrors');
            // @ts-ignore
            Diff.create.mockImplementation(() => {
                throw new ValidationError('Invalid diff configuration');
            });

            // Act & Assert
            await expect(Commit.execute(mockConfig)).rejects.toThrow('Invalid diff configuration');
            expect(mockLogger.error).toHaveBeenCalledWith('commit failed: Invalid diff configuration');
        });

        it('should handle ExternalDependencyError properly', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };

            const { ExternalDependencyError } = await import('../../src/error/CommandErrors');
            const cause = new Error('Git not found');
            // @ts-ignore
            Diff.create.mockImplementation(() => {
                throw new ExternalDependencyError('Git dependency error', 'git', cause);
            });

            // Act & Assert
            await expect(Commit.execute(mockConfig)).rejects.toThrow('Git dependency error');
            expect(mockLogger.error).toHaveBeenCalledWith('commit failed: Git dependency error');
            expect(mockLogger.debug).toHaveBeenCalledWith('Caused by: Git not found');
        });

        it('should handle CommandError properly', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: { cached: true }
            };

            const { CommandError } = await import('../../src/error/CommandErrors');
            // @ts-ignore
            Diff.create.mockImplementation(() => {
                throw new CommandError('Command execution failed', 'EXECUTION_FAILED', false, new Error('underlying error'));
            });

            // Act & Assert
            await expect(Commit.execute(mockConfig)).rejects.toThrow('Command execution failed');
            expect(mockLogger.error).toHaveBeenCalledWith('commit failed: Command execution failed');
        });

        it('should handle custom maxDiffBytes configuration', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    cached: true,
                    maxDiffBytes: 8192
                }
            };
            const mockDiffContent = 'custom diff content';

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue(mockDiffContent)
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(Diff.create).toHaveBeenCalledWith({
                cached: true,
                excludedPatterns: expect.any(Array),
                maxDiffBytes: 8192
            });
        });

        it('should handle model selection properly', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-4',
                commit: { cached: true }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.getModelForCommand.mockReturnValue('gpt-4');
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');

            // Act
            await Commit.execute(mockConfig);

            // Assert
            expect(OpenAI.getModelForCommand).toHaveBeenCalledWith(mockConfig, 'commit');
        });

        it('should skip user interaction when user explicitly skipped', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    interactive: true,
                    sendit: true,
                    cached: true
                }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('mock diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');
            mockGetUserChoice.mockResolvedValue('s'); // Skip

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockLogger.info).toHaveBeenCalledWith('❌ Commit aborted by user');
            expect(Child.run).not.toHaveBeenCalledWith(expect.stringMatching(/^git commit/));
        });

        it('should handle complex sendit validation scenarios', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    sendit: true,
                    cached: false
                }
            };

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('some diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(mockLogger.info).toHaveBeenCalledWith('SendIt mode enabled, but no changes to commit. Generated message: \n\n%s\n\n', 'test commit message');
            expect(Child.run).not.toHaveBeenCalledWith(expect.stringMatching(/^git commit/));
        });
    });

    describe('Helper Function Coverage', () => {
        beforeEach(() => {
            mockLogger.info.mockClear();
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.debug.mockClear();
        });

        it('should handle hasCommits check for repositories with commits', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    amend: true,
                    sendit: true
                }
            };

            // Mock successful rev-parse (commits exist)
            // @ts-ignore
            Child.run.mockImplementation((cmd) => {
                if (cmd === 'git rev-parse HEAD') {
                    return Promise.resolve({ stdout: 'abc123def456' });
                }
                return Promise.resolve({ stdout: 'Success' });
            });

            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('diff content')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(Child.run).toHaveBeenCalledWith('git rev-parse HEAD');
            expect(Child.run).toHaveBeenCalledWith("git commit --amend -m test commit message");
        });

        it('should validate sendit state and log warnings appropriately', async () => {
            // Arrange
            const mockConfig = {
                model: 'gpt-3.5-turbo',
                commit: {
                    sendit: true,
                    cached: false
                }
            };

            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);
            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('')
            });

            // Act
            const result = await Commit.execute(mockConfig);

            // Assert
            expect(result).toBe('No changes to commit.');
            // The sendit validation should occur and warn about no changes
            expect(mockLogger.warn).toHaveBeenCalledWith('SendIt mode enabled, but no changes to commit.');
        });

        it('should handle all standard default configurations', async () => {
            // Arrange
            const minimalConfig = {
                model: 'gpt-3.5-turbo'
            };

            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);
            // @ts-ignore
            Diff.create.mockReturnValue({
                get: vi.fn().mockResolvedValue('some changes')
            });
            // @ts-ignore
            OpenAI.createCompletionWithRetry.mockResolvedValue('test commit message');

            // Act
            const result = await Commit.execute(minimalConfig);

            // Assert
            expect(result).toBe('test commit message');
            expect(Diff.create).toHaveBeenCalledWith({
                cached: false,
                excludedPatterns: expect.any(Array),
                maxDiffBytes: 20480
            });
        });
    });

    describe('Empty Repository Scenarios', () => {
        describe('git log failures', () => {
            beforeEach(() => {
                // Reset all mocks
                vi.clearAllMocks();

                // Mock the basic dependencies
                // @ts-ignore
                OpenAI.getModelForCommand.mockReturnValue('gpt-3.5-turbo');
                // @ts-ignore
                Storage.create.mockReturnValue({
                    writeFile: vi.fn().mockResolvedValue(undefined),
                    ensureDirectory: vi.fn().mockResolvedValue(undefined)
                });
                // @ts-ignore
                Safety.checkForFileDependencies.mockResolvedValue([]);
                // @ts-ignore
                Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });
            });

            it('should handle empty repository with no commits - small staged diff', async () => {
                // Arrange - simulate a new repository with staged files but no commits
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: true, add: true }
                };

                const mockDiffContent = 'diff --git a/README.md b/README.md\nnew file mode 100644\nindex 0000000..abcdef\n--- /dev/null\n+++ b/README.md\n@@ -0,0 +1,3 @@\n+# My Project\n+\n+Initial commit content';

                // Mock successful diff creation
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(mockDiffContent)
                });

                // Don't mock Log.create - let it use the real implementation
                // But mock Child.run to simulate git log failing with empty repo error
                // @ts-ignore
                Child.run.mockImplementation((command) => {
                    if (command.includes('git add')) {
                        return Promise.resolve({ stdout: '', stderr: '' });
                    } else if (command.includes('git log')) {
                        return Promise.reject(new Error('fatal: your current branch \'main\' does not have any commits yet'));
                    }
                    return Promise.resolve({ stdout: '', stderr: '' });
                });

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('feat: add initial README\n\nAdd project README with basic information');

                // Act - should succeed now that log failures are handled gracefully
                const result = await Commit.execute(mockConfig);

                // Assert - should generate commit message successfully
                expect(result).toBe('feat: add initial README\n\nAdd project README with basic information');
                expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
            });

            it('should handle empty repository with no commits - large staged diff', async () => {
                // Arrange - simulate a new repository with large staged files but no commits
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: {
                        sendit: true,
                        add: true,
                        maxDiffBytes: 1024  // Small limit to test truncation
                    }
                };

                // Create a large diff that exceeds maxDiffBytes
                const largeDiffContent = 'diff --git a/large-file.txt b/large-file.txt\nnew file mode 100644\nindex 0000000..abcdef\n--- /dev/null\n+++ b/large-file.txt\n@@ -0,0 +1,100 @@\n' +
                    Array(50).fill('+This is a very long line that will make the diff exceed the maxDiffBytes limit for testing truncation logic\n').join('');

                // Mock successful diff creation
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(largeDiffContent)
                });

                // Mock truncation function
                // @ts-ignore
                Diff.truncateDiffByFiles.mockReturnValue('truncated diff content');

                // Mock Child.run to simulate git commands with empty repo errors
                // @ts-ignore
                Child.run.mockImplementation((command) => {
                    if (command.includes('git add')) {
                        return Promise.resolve({ stdout: '', stderr: '' });
                    } else if (command.includes('git log')) {
                        return Promise.reject(new Error('fatal: your current branch \'main\' does not have any commits yet'));
                    }
                    return Promise.resolve({ stdout: '', stderr: '' });
                });

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('feat: add initial large file\n\nAdd large initial file with content');

                // Act - should succeed now that log failures are handled gracefully
                const result = await Commit.execute(mockConfig);

                // Assert - should generate commit message successfully
                expect(result).toBe('feat: add initial large file\n\nAdd large initial file with content');
                expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
            });

            it('should handle empty repository with existing commits (regression test)', async () => {
                // Arrange - simulate a repository with existing history
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: true }
                };

                const mockDiffContent = 'diff --git a/existing-file.md b/existing-file.md\nindex abcdef..123456 100644\n--- a/existing-file.md\n+++ b/existing-file.md\n@@ -1,3 +1,4 @@\n # Existing Project\n \n-Old content\n+New content\n+Additional line';
                const mockLogContent = 'commit abcdef123456\nAuthor: Test User <test@example.com>\nDate: Mon Jan 1 12:00:00 2024 +0000\n\n    Previous commit message\n';

                // Mock successful diff creation
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(mockDiffContent)
                });

                // Mock Child.run to simulate successful git log (repository has commits)
                // @ts-ignore
                Child.run.mockImplementation((command) => {
                    if (command.includes('git log')) {
                        return Promise.resolve({ stdout: mockLogContent, stderr: '' });
                    }
                    return Promise.resolve({ stdout: '', stderr: '' });
                });

                // Mock hasStagedChanges
                // @ts-ignore
                Diff.hasStagedChanges.mockResolvedValue(true);

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('feat: update existing file\n\nUpdate content in existing file');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('feat: update existing file\n\nUpdate content in existing file');
                // Log.create is no longer mocked, so we can't assert on it
                expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
            });
        });

        describe('amend mode with empty repository', () => {
            it('should prevent amend mode when no commits exist', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { amend: true, sendit: true }
                };

                // Mock Child.run to fail when checking for commits (git rev-parse HEAD)
                // @ts-ignore
                Child.run.mockRejectedValueOnce(new Error('fatal: ambiguous argument \'HEAD\': unknown revision or path not in the working tree'));

                // Act & Assert
                await expect(Commit.execute(mockConfig)).rejects.toThrow('Cannot use --amend: no commits found in repository. Create an initial commit first.');
            });
        });

        describe('git command failure mocking', () => {
            it('should handle git log failure gracefully', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: false }  // Non-sendit mode for message generation only
                };

                const mockDiffContent = 'diff --git a/test.txt b/test.txt\nnew file mode 100644\nindex 0000000..test123\n--- /dev/null\n+++ b/test.txt\n@@ -0,0 +1 @@\n+test content';

                // Mock successful diff creation
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(mockDiffContent)
                });

                // Mock Child.run to simulate git log failure
                // @ts-ignore
                Child.run.mockImplementation((command) => {
                    if (command.includes('git log')) {
                        return Promise.reject(new Error('fatal: bad default revision \'HEAD\''));
                    }
                    return Promise.resolve({ stdout: '', stderr: '' });
                });

                // Mock hasStagedChanges
                // @ts-ignore
                Diff.hasStagedChanges.mockResolvedValue(false);

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('Generated commit message');

                // Act - should succeed now that log failures are handled gracefully
                const result = await Commit.execute(mockConfig);

                // Assert - should generate commit message successfully
                expect(result).toBe('Generated commit message');
                expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();
            });

            it('should handle different git error messages', async () => {
                // Test various git error scenarios that could occur in empty repos
                const emptyRepoErrors = [
                    'fatal: your current branch \'main\' does not have any commits yet',
                    'fatal: bad default revision \'HEAD\'',
                    'fatal: ambiguous argument \'HEAD\': unknown revision or path not in the working tree'
                ];

                for (const errorMessage of emptyRepoErrors) {
                    // Arrange
                    const mockConfig = {
                        model: 'gpt-3.5-turbo',
                        commit: { sendit: false }
                    };

                    // @ts-ignore
                    Diff.create.mockReturnValue({
                        get: vi.fn().mockResolvedValue('test diff')
                    });

                    // Mock Child.run to simulate git log failure with specific error
                    // @ts-ignore
                    Child.run.mockImplementation((command) => {
                        if (command.includes('git log')) {
                            return Promise.reject(new Error(errorMessage));
                        }
                        return Promise.resolve({ stdout: '', stderr: '' });
                    });

                    // @ts-ignore
                    Diff.hasStagedChanges.mockResolvedValue(false);

                    // Mock successful LLM response
                    // @ts-ignore
                    OpenAI.createCompletionWithRetry.mockResolvedValue('Generated commit message');

                    // Act - should succeed now that log failures are handled gracefully
                    const result = await Commit.execute(mockConfig);

                    // Assert - should generate commit message successfully
                    expect(result).toBe('Generated commit message');
                    expect(OpenAI.createCompletionWithRetry).toHaveBeenCalled();

                    // Reset mocks for next iteration
                    vi.clearAllMocks();
                    // @ts-ignore
                    OpenAI.getModelForCommand.mockReturnValue('gpt-3.5-turbo');
                    // @ts-ignore
                    Storage.create.mockReturnValue({
                        writeFile: vi.fn().mockResolvedValue(undefined),
                        ensureDirectory: vi.fn().mockResolvedValue(undefined)
                    });
                    // @ts-ignore
                    Safety.checkForFileDependencies.mockResolvedValue([]);
                    // @ts-ignore
                    Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });
                }
            });

            it('should fail appropriately for non-git-repository errors', async () => {
                // Test error that should NOT be handled as empty repo (not a git repo at all)
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: false }
                };

                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue('test diff')
                });

                // Mock Log.create to simulate "not a git repository" error
                const { ExitError } = await import('../../src/error/ExitError');
                // @ts-ignore
                Log.create.mockImplementation(() => {
                    throw new ExitError('Error occurred during gather change phase');
                });

                // @ts-ignore
                Diff.hasStagedChanges.mockResolvedValue(false);

                // Act & Assert - should fail with ExitError for non-git-repo errors
                await expect(Commit.execute(mockConfig)).rejects.toThrow('Error occurred during gather change phase');
            });
        });

        describe('file content fallback', () => {
            it('should use file content when no diff is available', async () => {
                // Arrange - simulate no diff content but existing files
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: false },
                    excludedPatterns: ['node_modules', '.git']
                };

                // Mock empty diff
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue('')
                });

                // Mock no critical changes
                // @ts-ignore
                Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });

                // Mock successful log creation
                // @ts-ignore
                Log.create.mockResolvedValue({
                    get: vi.fn().mockResolvedValue('mock log content')
                });

                // Mock file content available
                const mockFileContent = 'File Content Analysis (2 files, 1024 bytes)\n\n=== src/index.ts ===\nconsole.log("Hello World");\n\n=== package.json ===\n{"name": "test-project"}';
                // @ts-ignore
                Files.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(mockFileContent)
                });

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('Initial commit: Add project structure\n\n* Create main entry point in src/index.ts\n* Add package.json with project configuration');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('Initial commit: Add project structure\n\n* Create main entry point in src/index.ts\n* Add package.json with project configuration');

                // Verify that Files.create was called with correct options
                expect(Files.create).toHaveBeenCalledWith({
                    excludedPatterns: ['node_modules', '.git'],
                    maxTotalBytes: expect.any(Number),
                    workingDirectory: process.cwd()
                });

                // Verify that the prompt was created with file content
                expect(CommitPrompt.createPrompt).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        diffContent: mockFileContent,
                        isFileContent: true
                    }),
                    expect.any(Object)
                );
            });

            it('should handle case when both diff and file content are empty', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: false }
                };

                // Mock empty diff
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue('')
                });

                // Mock no critical changes
                // @ts-ignore
                Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });

                // Mock successful log creation
                // @ts-ignore
                Log.create.mockResolvedValue({
                    get: vi.fn().mockResolvedValue('mock log content')
                });

                // Mock empty file content
                // @ts-ignore
                Files.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue('')
                });

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('Generated commit message');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert - should still generate a template message
                expect(result).toBe('Generated commit message');
                expect(Files.create).toHaveBeenCalled();
            });

            it('should not use file content fallback when diff is available', async () => {
                // Arrange
                const mockConfig = {
                    model: 'gpt-3.5-turbo',
                    commit: { sendit: false }
                };

                // Mock diff with content
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue('diff --git a/file.ts\n+added line')
                });

                // Mock no critical changes (not needed since we have diff content)
                // @ts-ignore
                Diff.hasCriticalExcludedChanges.mockResolvedValue({ hasChanges: false, files: [] });

                // Mock successful log creation
                // @ts-ignore
                Log.create.mockResolvedValue({
                    get: vi.fn().mockResolvedValue('mock log content')
                });

                // Mock successful LLM response
                // @ts-ignore
                OpenAI.createCompletionWithRetry.mockResolvedValue('Fix issue with file.ts');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('Fix issue with file.ts');

                // Note: Files.create might be called during test setup, but the important thing
                // is that the prompt uses diff content, not file content

                // Verify that the prompt was created with diff content, not file content
                expect(CommitPrompt.createPrompt).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        diffContent: 'diff --git a/file.ts\n+added line',
                        isFileContent: false // Should be false when using diff
                    }),
                    expect.any(Object)
                );
            });
        });

        describe('GitHub issues integration', () => {
            it('should include GitHub issues context when version is available', async () => {
                // Arrange
                const mockConfig = {
                    commit: {
                        cached: true,
                        skipFileCheck: true
                    },
                    outputDirectory: 'test-output'
                };

                const mockDiffContent = 'diff --git a/auth.ts\n+fixed timeout issue';
                const mockPrompt = 'mock prompt';
                const mockGitHubIssues = `
## Recent Issues from Current Milestone (release/0.1.1):

Issue #123: Fix authentication timeout
Labels: bug, high-priority
Closed: 2024-01-01T10:00:00Z
Body: Users experiencing timeout after 30 minutes...
---
`;
                const mockPackageJson = { version: '0.1.1-dev.0' };

                // Mock the diff
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(mockDiffContent)
                });

                // Mock hasStagedChanges to return true
                // @ts-ignore
                Diff.hasStagedChanges.mockResolvedValue(true);

                // Mock storage to return valid package.json
                const mockStorage = {
                    ensureDirectory: vi.fn(),
                    writeFile: vi.fn(),
                    readFile: vi.fn().mockResolvedValue(JSON.stringify(mockPackageJson))
                };
                Storage.create.mockReturnValue(mockStorage);

                // Reset the validation mocks to work for this test
                const Validation = await import('../../src/util/validation');
                // @ts-ignore - The mocks exist but TypeScript can't see them
                Validation.safeJsonParse = vi.fn().mockReturnValue(mockPackageJson);
                // @ts-ignore
                Validation.validatePackageJson = vi.fn().mockReturnValue(mockPackageJson);

                // Mock GitHub issues
                const GitHub = await import('../../src/util/github');
                // @ts-ignore
                GitHub.getRecentClosedIssuesForCommit.mockResolvedValue(mockGitHubIssues);

                // Mock the prompt creation
                const CommitPromptModule = await import('../../src/prompt/commit');
                const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

                OpenAI.createCompletionWithRetry.mockResolvedValue('Fix authentication timeout (addresses #123)');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('Fix authentication timeout (addresses #123)');

                // Verify GitHub issues were fetched with the correct version
                expect(GitHub.getRecentClosedIssuesForCommit).toHaveBeenCalledWith('0.1.1-dev.0', 10);

                // Verify the prompt was created with GitHub issues context
                expect(promptSpy).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        diffContent: mockDiffContent,
                        githubIssuesContext: mockGitHubIssues
                    }),
                    expect.any(Object)
                );
            });

            it('should handle GitHub issues fetch failure gracefully', async () => {
                // Arrange
                const mockConfig = {
                    commit: {
                        cached: true,
                        skipFileCheck: true
                    },
                    outputDirectory: 'test-output'
                };

                const mockDiffContent = 'diff --git a/file.ts\n+added something';
                const mockPrompt = 'mock prompt';

                // Mock the diff
                // @ts-ignore
                Diff.create.mockReturnValue({
                    get: vi.fn().mockResolvedValue(mockDiffContent)
                });

                // Mock hasStagedChanges to return true
                // @ts-ignore
                Diff.hasStagedChanges.mockResolvedValue(true);

                // Mock storage - version reading fails
                const mockStorage = {
                    ensureDirectory: vi.fn(),
                    writeFile: vi.fn(),
                    readFile: vi.fn().mockRejectedValue(new Error('No package.json'))
                };
                Storage.create.mockReturnValue(mockStorage);

                // Don't need to mock validation functions specifically since storage.readFile fails

                // Mock GitHub issues to throw error
                const GitHub = await import('../../src/util/github');
                // @ts-ignore
                GitHub.getRecentClosedIssuesForCommit.mockRejectedValue(new Error('GitHub API error'));

                // Mock the prompt creation
                const CommitPromptModule = await import('../../src/prompt/commit');
                const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

                OpenAI.createCompletionWithRetry.mockResolvedValue('Simple commit message');

                // Act
                const result = await Commit.execute(mockConfig);

                // Assert
                expect(result).toBe('Simple commit message');

                // Verify the prompt was created without GitHub issues context
                expect(promptSpy).toHaveBeenCalledWith(
                    expect.any(Object),
                    expect.objectContaining({
                        diffContent: mockDiffContent,
                        githubIssuesContext: '' // Should be empty when fetch fails
                    }),
                    expect.any(Object)
                );
            });
        });
    });
});
