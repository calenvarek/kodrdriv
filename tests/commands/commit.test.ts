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
    hasStagedChanges: vi.fn()
}));

vi.mock('../../src/util/child', () => ({
    // @ts-ignore
    run: vi.fn(),
    runWithDryRunSupport: vi.fn()
}));

vi.mock('../../src/util/openai', () => ({
    // @ts-ignore
    createCompletion: vi.fn()
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

vi.mock('../../src/content/log', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        get: vi.fn()
    })
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
    getOutputPath: vi.fn(),
    getTimestampedRequestFilename: vi.fn(),
    getTimestampedResponseFilename: vi.fn()
}));

vi.mock('shell-escape', () => ({
    // @ts-ignore
    default: vi.fn()
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
    let Child: any;
    let OpenAI: any;
    let MinorPrompt: any;
    let Log: any;
    let General: any;
    let shellescape: any;

    beforeEach(async () => {
        // Import modules after mocking
        Logging = await import('../../src/logging');
        Commit = await import('../../src/prompt/commit');
        Diff = await import('../../src/content/diff');
        Child = await import('../../src/util/child');
        OpenAI = await import('../../src/util/openai');
        MinorPrompt = await import('@riotprompt/riotprompt');
        Log = await import('../../src/content/log');
        General = await import('../../src/util/general');
        shellescape = (await import('shell-escape')).default;
        // Import the mocked prompts module so it can be referenced in tests
        // @ts-ignore – path is mocked above, actual file is not required
        Prompts = await import('../../src/prompt/prompts');
        Commit = await import('../../src/commands/commit');
    });

    afterEach(() => {
        vi.clearAllMocks();
        mockExit.mockClear();
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
        // @ts-ignore
        Log.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockLogContent) });
        // @ts-ignore
        Prompts.create.mockReturnValue({
            // @ts-ignore
            createCommitPrompt: vi.fn().mockResolvedValue(mockPrompt),
            // @ts-ignore
            format: vi.fn().mockReturnValue(mockRequest)
        });
        // @ts-ignore
        OpenAI.createCompletion.mockResolvedValue(mockSummary);

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(result).toBe(mockSummary);
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'] });
        expect(OpenAI.createCompletion).toHaveBeenCalled();
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
        OpenAI.createCompletion.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.hasStagedChanges).toHaveBeenCalled();
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'] });
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
        OpenAI.createCompletion.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.hasStagedChanges).toHaveBeenCalled();
        expect(Diff.create).toHaveBeenCalledWith({ cached: false, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'] });
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
        OpenAI.createCompletion.mockResolvedValue(mockSummary);
        Child.run.mockResolvedValue({ stdout: 'Commit successful' });
        shellescape.mockReturnValue(mockEscapedSummary);

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(result).toBe(mockSummary);
        expect(shellescape).toHaveBeenCalledWith([mockSummary]);
        expect(Child.run).toHaveBeenCalledWith(`git commit -m ${mockEscapedSummary}`);
    });

    it('should exit early when sendit is true but no changes are staged', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: false,
                sendit: true
            }
        };

        // Act & Assert
        await expect(async () => {
            await Commit.execute(mockConfig);
        }).rejects.toThrow('process.exit called');
    });

    it('should exit with error when sendit is true but cached becomes false during execution', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: undefined,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test commit message';

        Diff.hasStagedChanges.mockResolvedValue(false);
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletion.mockResolvedValue(mockSummary);

        // Act & Assert
        await expect(async () => {
            await Commit.execute(mockConfig);
        }).rejects.toThrow('process.exit called');
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
        OpenAI.createCompletion.mockResolvedValue(mockSummary);
        Child.run.mockRejectedValue(mockError);
        shellescape.mockReturnValue("'test: add new feature'");

        // Act & Assert
        await expect(async () => {
            await Commit.execute(mockConfig);
        }).rejects.toThrow('process.exit called');

        expect(mockExit).toHaveBeenCalledWith(1);
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
        Log.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockLogContent) });
        // @ts-ignore
        Prompts.create.mockReturnValue({
            createCommitPrompt: vi.fn().mockResolvedValue('mock prompt'),
            format: vi.fn().mockReturnValue({ messages: [] })
        });
        OpenAI.createCompletion.mockResolvedValue('test commit');
        Child.run.mockResolvedValue({ stdout: 'Success' });

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Child.run).toHaveBeenCalledWith('git add -A');
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'] });
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
        OpenAI.createCompletion.mockResolvedValue('test commit');

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
        // @ts-ignore
        Log.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockLogContent) });

        // Spy on the new prompt creator
        const CommitPromptModule = await import('../../src/prompt/commit');
        const promptSpy = vi.spyOn(CommitPromptModule, 'createPrompt').mockResolvedValue(mockPrompt as any);

        OpenAI.createCompletion.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(promptSpy).toHaveBeenCalledWith(
            expect.any(Object),
            { diffContent: mockDiffContent, userDirection: undefined },
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
        OpenAI.createCompletion.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Log.create).toHaveBeenCalledWith({ limit: mockMessageLimit });
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
        OpenAI.createCompletion.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: customPatterns });
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
        OpenAI.createCompletion.mockResolvedValue(mockSummary);
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
        OpenAI.createCompletion.mockResolvedValue(mockSummary);
        Child.run.mockResolvedValue({ stdout: 'Success' });
        shellescape.mockReturnValue("'test: add feature'");

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(mockLogger.verbose).toHaveBeenCalledWith('Adding all changes to the index...');
        expect(mockLogger.info).toHaveBeenCalledWith('SendIt mode enabled. Committing with message: \n\n%s\n\n', mockSummary);
        expect(mockLogger.info).toHaveBeenCalledWith('Commit successful!');
    });

        describe('Error Handling', () => {
        it('should handle ValidationError for sendit without changes', async () => {
            // Arrange
            const mockConfig = {
                commit: { sendit: true },
                dryRun: false
            };

            // Mock no staged changes
            // @ts-ignore
            Diff.hasStagedChanges.mockResolvedValue(false);

            const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('process.exit called');
            });

            // Act & Assert
            await expect(async () => {
                await Commit.execute(mockConfig);
            }).rejects.toThrow('process.exit called');

            processExitSpy.mockRestore();
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
            Log.create.mockReturnValue({ get: vi.fn().mockResolvedValue('log content') });
            // @ts-ignore
            OpenAI.createCompletion.mockResolvedValue(mockSummary);

            // Mock git commit failure
            // @ts-ignore
            Child.run.mockRejectedValue(new Error('git commit failed'));

            const processExitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
                throw new Error('process.exit called');
            });

            // Act & Assert
            await expect(async () => {
                await Commit.execute(mockConfig);
            }).rejects.toThrow('process.exit called');

            processExitSpy.mockRestore();
        });
    });
});
