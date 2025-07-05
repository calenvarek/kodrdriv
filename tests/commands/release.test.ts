import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock ESM modules
vi.mock('@riotprompt/riotprompt', () => {
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
        Model: {
            GPT_4: 'gpt-4'
        },
        Formatter: {
            create: vi.fn().mockReturnValue({
                formatPrompt: vi.fn().mockReturnValue({ messages: [] })
            })
        },
        Builder: {
            create: vi.fn(() => localBuilder)
        },
        // Add the new quick API functions
        quick: {
            release: vi.fn().mockResolvedValue('mock prompt')
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

const mockCreatePrompt = vi.fn().mockResolvedValue('mock prompt');
vi.mock('../../src/prompt/release', () => ({
    createPrompt: mockCreatePrompt
}));

const mockLogGet = vi.fn().mockResolvedValue('mock log content');
const mockLogCreate = vi.fn().mockReturnValue({
    get: mockLogGet
});
vi.mock('../../src/content/log', () => ({
    create: mockLogCreate
}));

const mockDiffGet = vi.fn().mockResolvedValue('mock diff content');
const mockDiffCreate = vi.fn().mockReturnValue({
    get: mockDiffGet
});
vi.mock('../../src/content/diff', () => ({
    create: mockDiffCreate,
    hasStagedChanges: vi.fn()
}));

const mockCreateCompletion = vi.fn().mockResolvedValue({
    title: 'mock title',
    body: 'mock body'
});
vi.mock('../../src/util/openai', () => ({
    createCompletion: mockCreateCompletion
}));

const mockLogger = {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
};
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue(mockLogger)
}));

vi.mock('../../src/util/general', () => ({
    getOutputPath: vi.fn().mockImplementation((dir, file) => `${dir}/${file}`),
    getTimestampedRequestFilename: vi.fn().mockReturnValue('request-123456.json'),
    getTimestampedResponseFilename: vi.fn().mockReturnValue('response-123456.json'),
    getTimestampedReleaseNotesFilename: vi.fn().mockReturnValue('release-notes-123456.md')
}));

const mockStorage = {
    ensureDirectory: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
};
const mockCreateStorage = vi.fn().mockReturnValue(mockStorage);
vi.mock('../../src/util/storage', () => ({
    create: mockCreateStorage
}));

vi.mock('../../src/constants', () => ({
    DEFAULT_EXCLUDED_PATTERNS: ['*.test.ts'],
    DEFAULT_FROM_COMMIT_ALIAS: 'origin/HEAD',
    DEFAULT_TO_COMMIT_ALIAS: 'HEAD',
    DEFAULT_OUTPUT_DIRECTORY: 'output'
}));

describe('release command', () => {
    let Release: any;

    beforeEach(async () => {
        // Reset all mocks before each test
        vi.clearAllMocks();

        // Reset mock implementations
        mockCreatePrompt.mockResolvedValue('mock prompt');
        mockLogGet.mockResolvedValue('mock log content');
        mockDiffGet.mockResolvedValue('mock diff content');
        mockCreateCompletion.mockResolvedValue({
            title: 'mock title',
            body: 'mock body'
        });
        mockStorage.ensureDirectory.mockResolvedValue(undefined);
        mockStorage.writeFile.mockResolvedValue(undefined);

        // Import modules after mocking
        Release = await import('../../src/commands/release');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should execute release command with default parameters', async () => {
        const runConfig = {
            model: 'gpt-4'
        };

        const result = await Release.execute(runConfig);

        expect(mockLogCreate).toHaveBeenCalledWith({
            from: 'origin/HEAD',
            to: 'HEAD'
        });
        expect(mockDiffCreate).toHaveBeenCalledWith({
            from: 'origin/HEAD',
            to: 'HEAD',
            excludedPatterns: ['*.test.ts']
        });
        expect(mockCreateCompletion).toHaveBeenCalled();
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });

    it('should execute release command with custom parameters', async () => {
        const runConfig = {
            model: 'gpt-4',
            release: {
                from: 'v1.0.0',
                to: 'main'
            }
        };

        const result = await Release.execute(runConfig);

        expect(mockLogCreate).toHaveBeenCalledWith({
            from: 'v1.0.0',
            to: 'main'
        });
        expect(mockDiffCreate).toHaveBeenCalledWith({
            from: 'v1.0.0',
            to: 'main',
            excludedPatterns: ['*.test.ts']
        });
        expect(mockCreateCompletion).toHaveBeenCalled();
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });

    it('should handle dry run mode', async () => {
        const runConfig = {
            model: 'gpt-4',
            dryRun: true
        };

        const result = await Release.execute(runConfig);

        expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Generated release summary:');
        expect(mockLogger.info).toHaveBeenCalledWith('Title: %s', 'mock title');
        expect(mockLogger.info).toHaveBeenCalledWith('Body: %s', 'mock body');
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });

    it('should handle custom excluded patterns', async () => {
        const runConfig = {
            model: 'gpt-4',
            excludedPatterns: ['*.spec.ts', '*.test.ts']
        };

        await Release.execute(runConfig);

        expect(mockDiffCreate).toHaveBeenCalledWith({
            from: 'origin/HEAD',
            to: 'HEAD',
            excludedPatterns: ['*.spec.ts', '*.test.ts']
        });
    });

    it('should handle custom output directory', async () => {
        const runConfig = {
            model: 'gpt-4',
            outputDirectory: 'custom-output'
        };

        await Release.execute(runConfig);

        expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('custom-output');
    });

    it('should handle debug mode with debug files', async () => {
        const runConfig = {
            model: 'gpt-4',
            debug: true,
            outputDirectory: 'debug-output'
        };

        await Release.execute(runConfig);

        expect(mockCreateCompletion).toHaveBeenCalledWith(
            [],
            expect.objectContaining({
                model: 'gpt-4',
                responseFormat: { type: 'json_object' },
                debug: true,
                debugRequestFile: 'debug-output/request-123456.json',
                debugResponseFile: 'debug-output/response-123456.json'
            })
        );
    });

    it('should handle release focus and context', async () => {
        const runConfig = {
            model: 'gpt-4',
            release: {
                focus: 'bug fixes',
                context: 'hotfix release'
            },
            contextDirectories: ['src', 'tests']
        };

        await Release.execute(runConfig);

        expect(mockCreatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                overridePaths: [],
                overrides: false
            }),
            expect.objectContaining({
                logContent: 'mock log content',
                diffContent: 'mock diff content',
                releaseFocus: 'bug fixes'
            }),
            expect.objectContaining({
                context: 'hotfix release',
                directories: ['src', 'tests']
            })
        );
    });

    it('should handle discovered config directories and overrides', async () => {
        const runConfig = {
            model: 'gpt-4',
            discoveredConfigDirs: ['config1', 'config2'],
            overrides: true
        };

        await Release.execute(runConfig);

        expect(mockCreatePrompt).toHaveBeenCalledWith(
            expect.objectContaining({
                overridePaths: ['config1', 'config2'],
                overrides: true
            }),
            expect.any(Object),
            expect.any(Object)
        );
    });

    it('should save timestamped release notes successfully', async () => {
        const runConfig = {
            model: 'gpt-4'
        };

        await Release.execute(runConfig);

        expect(mockStorage.writeFile).toHaveBeenCalledWith(
            'output/release-notes-123456.md',
            '# mock title\n\nmock body',
            'utf-8'
        );
        expect(mockLogger.debug).toHaveBeenCalledWith(
            'Saved timestamped release notes: %s',
            'output/release-notes-123456.md'
        );
    });

    it('should handle file saving errors gracefully', async () => {
        mockStorage.writeFile.mockRejectedValue(new Error('Permission denied'));

        const runConfig = {
            model: 'gpt-4'
        };

        const result = await Release.execute(runConfig);

        expect(mockLogger.warn).toHaveBeenCalledWith(
            'Failed to save timestamped release notes: %s',
            'Permission denied'
        );
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });

    it('should handle empty log and diff content', async () => {
        mockLogGet.mockResolvedValue('');
        mockDiffGet.mockResolvedValue('');

        const runConfig = {
            model: 'gpt-4'
        };

        await Release.execute(runConfig);

        expect(mockCreatePrompt).toHaveBeenCalledWith(
            expect.any(Object),
            expect.objectContaining({
                logContent: '',
                diffContent: ''
            }),
            expect.any(Object)
        );
    });

    it('should handle OpenAI API errors', async () => {
        mockCreateCompletion.mockRejectedValue(new Error('OpenAI API error'));

        const runConfig = {
            model: 'gpt-4'
        };

        await expect(Release.execute(runConfig)).rejects.toThrow('OpenAI API error');
    });

    it('should handle prompt creation errors', async () => {
        mockCreatePrompt.mockRejectedValue(new Error('Prompt creation failed'));

        const runConfig = {
            model: 'gpt-4'
        };

        await expect(Release.execute(runConfig)).rejects.toThrow('Prompt creation failed');
    });

    it('should handle log content retrieval errors', async () => {
        mockLogGet.mockRejectedValue(new Error('Git log failed'));

        const runConfig = {
            model: 'gpt-4'
        };

        await expect(Release.execute(runConfig)).rejects.toThrow('Git log failed');
    });

    it('should handle diff content retrieval errors', async () => {
        mockDiffGet.mockRejectedValue(new Error('Git diff failed'));

        const runConfig = {
            model: 'gpt-4'
        };

        await expect(Release.execute(runConfig)).rejects.toThrow('Git diff failed');
    });

    it('should handle storage directory creation errors', async () => {
        mockStorage.ensureDirectory.mockRejectedValue(new Error('Directory creation failed'));

        const runConfig = {
            model: 'gpt-4'
        };

        await expect(Release.execute(runConfig)).rejects.toThrow('Directory creation failed');
    });

    it('should use default output directory when not specified', async () => {
        const runConfig = {
            model: 'gpt-4'
        };

        await Release.execute(runConfig);

        expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('output');
    });

    it('should handle complex configuration with all optional parameters', async () => {
        const runConfig = {
            model: 'gpt-4',
            dryRun: true,
            debug: true,
            outputDirectory: 'custom-output',
            excludedPatterns: ['*.spec.ts'],
            discoveredConfigDirs: ['config1', 'config2'],
            overrides: true,
            contextDirectories: ['src', 'lib'],
            release: {
                from: 'v1.0.0',
                to: 'v1.1.0',
                focus: 'performance improvements',
                context: 'quarterly release'
            }
        };

        const result = await Release.execute(runConfig);

        expect(mockLogCreate).toHaveBeenCalledWith({
            from: 'v1.0.0',
            to: 'v1.1.0'
        });
        expect(mockDiffCreate).toHaveBeenCalledWith({
            from: 'v1.0.0',
            to: 'v1.1.0',
            excludedPatterns: ['*.spec.ts']
        });
        expect(mockCreatePrompt).toHaveBeenCalledWith(
            {
                overridePaths: ['config1', 'config2'],
                overrides: true
            },
            {
                logContent: 'mock log content',
                diffContent: 'mock diff content',
                releaseFocus: 'performance improvements'
            },
            {
                context: 'quarterly release',
                directories: ['src', 'lib']
            }
        );
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });
});
