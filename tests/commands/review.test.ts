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
vi.mock('../../src/prompt/review', () => ({
    createPrompt: mockCreatePrompt
}));

const mockLogGet = vi.fn().mockResolvedValue('mock log content');
const mockLogCreate = vi.fn().mockReturnValue({
    get: mockLogGet
});
vi.mock('../../src/content/log', () => ({
    create: mockLogCreate
}));

const mockDiffGetRecentDiffsForReview = vi.fn().mockResolvedValue('mock diff content');
const mockDiffGetReviewExcludedPatterns = vi.fn().mockReturnValue(['*.test.ts', '*.spec.ts']);
vi.mock('../../src/content/diff', () => ({
    getRecentDiffsForReview: mockDiffGetRecentDiffsForReview,
    getReviewExcludedPatterns: mockDiffGetReviewExcludedPatterns
}));

const mockReleaseNotesGet = vi.fn().mockResolvedValue('mock release notes');
vi.mock('../../src/content/releaseNotes', () => ({
    get: mockReleaseNotesGet
}));

const mockIssuesGet = vi.fn().mockResolvedValue('mock issues content');
const mockIssuesHandleIssueCreation = vi.fn().mockResolvedValue('Issues created successfully');
vi.mock('../../src/content/issues', () => ({
    get: mockIssuesGet,
    handleIssueCreation: mockIssuesHandleIssueCreation
}));

const mockCreateCompletion = vi.fn().mockResolvedValue({
    summary: 'Review analysis summary',
    totalIssues: 3,
    issues: [
        { title: 'Issue 1', priority: 'high' },
        { title: 'Issue 2', priority: 'medium' },
        { title: 'Issue 3', priority: 'low' }
    ]
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
    getTimestampedReviewFilename: vi.fn().mockReturnValue('review-123456.md'),
    getTimestampedReviewNotesFilename: vi.fn().mockReturnValue('review-notes-123456.md')
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
    DEFAULT_EXCLUDED_PATTERNS: ['node_modules', '*.test.ts'],
    DEFAULT_OUTPUT_DIRECTORY: 'output'
}));

// Mock Node.js built-in modules
vi.mock('path', () => ({
    default: {
        join: vi.fn().mockImplementation((...args) => args.join('/'))
    }
}));

vi.mock('os', () => ({
    default: {
        tmpdir: vi.fn().mockReturnValue('/tmp')
    }
}));

vi.mock('child_process', () => ({
    spawnSync: vi.fn()
}));

vi.mock('fs/promises', () => ({
    default: {
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('Test review note content'),
        unlink: vi.fn().mockResolvedValue(undefined)
    }
}));

describe('review command', () => {
    let Review: any;
    let mockProcess: any;
    let mockSpawnSync: any;
    let mockFs: any;

    beforeEach(async () => {
        // Reset all mocks before each test
        vi.clearAllMocks();

        // Reset mock implementations
        mockCreatePrompt.mockResolvedValue('mock prompt');
        mockLogGet.mockResolvedValue('mock log content');
        mockDiffGetRecentDiffsForReview.mockResolvedValue('mock diff content');
        mockReleaseNotesGet.mockResolvedValue('mock release notes');
        mockIssuesGet.mockResolvedValue('mock issues content');
        mockCreateCompletion.mockResolvedValue({
            summary: 'Review analysis summary',
            totalIssues: 3,
            issues: [
                { title: 'Issue 1', priority: 'high' },
                { title: 'Issue 2', priority: 'medium' },
                { title: 'Issue 3', priority: 'low' }
            ]
        });
        mockIssuesHandleIssueCreation.mockResolvedValue('Issues created successfully');
        mockStorage.ensureDirectory.mockResolvedValue(undefined);
        mockStorage.writeFile.mockResolvedValue(undefined);
        mockDiffGetReviewExcludedPatterns.mockReturnValue(['*.test.ts', '*.spec.ts']);

        // Mock process stdin
        mockProcess = {
            stdin: { isTTY: true },
            env: { EDITOR: 'vi' }
        };
        globalThis.process = mockProcess as any;

        // Import modules after mocking
        const childProcess = await import('child_process');
        mockSpawnSync = childProcess.spawnSync;
        mockSpawnSync.mockReturnValue({ error: null });

        const fs = await import('fs/promises');
        mockFs = fs.default;

        Review = await import('../../src/commands/review');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('dry run mode', () => {
        it('should log configuration and return without executing when in dry run mode', async () => {
            const runConfig = {
                model: 'gpt-4',
                dryRun: true,
                review: {
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                    commitHistoryLimit: 10,
                    diffHistoryLimit: 5,
                    releaseNotesLimit: 3,
                    githubIssuesLimit: 20,
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would analyze provided note for review');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would gather additional context based on configuration above');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would analyze note and identify issues');
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would automatically create GitHub issues (sendit mode enabled)');
            expect(mockLogger.debug).toHaveBeenCalledWith('Review context configuration:');
            expect(result).toBe('DRY RUN: Review command would analyze note, gather context, and create GitHub issues');
        });

        it('should show exclusion patterns in dry run mode when including recent diffs', async () => {
            const runConfig = {
                model: 'gpt-4',
                dryRun: true,
                review: {
                    includeRecentDiffs: true
                }
            };

            await Review.execute(runConfig);

            expect(mockDiffGetReviewExcludedPatterns).toHaveBeenCalledWith(['node_modules', '*.test.ts']);
            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would use %d exclusion patterns for diff context', 2);
        });

        it('should show prompt mode instead of sendit mode in dry run', async () => {
            const runConfig = {
                model: 'gpt-4',
                dryRun: true,
                review: {
                    sendit: false
                }
            };

            await Review.execute(runConfig);

            expect(mockLogger.info).toHaveBeenCalledWith('DRY RUN: Would prompt for confirmation before creating GitHub issues');
        });
    });

    describe('STDIN validation', () => {
        it('should throw error when STDIN is piped but sendit is not enabled', async () => {
            mockProcess.stdin.isTTY = false;
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: false
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('Piped input requires --sendit flag for non-interactive operation');
            expect(mockLogger.error).toHaveBeenCalledWith('❌ STDIN is piped but --sendit flag is not enabled');
        });

        it('should not throw error when STDIN is piped and sendit is enabled', async () => {
            mockProcess.stdin.isTTY = false;
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test review note',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(result).toBe('Issues created successfully');
            expect(mockLogger.error).not.toHaveBeenCalled();
        });
    });

    describe('review note gathering', () => {
        it('should use review note from configuration when provided', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test review note from config',
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockLogger.debug).toHaveBeenCalledWith('Review note: %s', 'Test review note from config');
            expect(mockSpawnSync).not.toHaveBeenCalled();
        });

        it('should open editor when no review note is provided', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockFs.writeFile).toHaveBeenCalledWith(
                expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+\.md$/),
                expect.stringContaining('# Kodrdriv Review Note'),
                'utf8'
            );
            expect(mockSpawnSync).toHaveBeenCalledWith('vi', [expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+\.md$/)], { stdio: 'inherit' });
            expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+\.md$/), 'utf8');
            expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+\.md$/));
        });

        it('should use custom editor from environment variables', async () => {
            mockProcess.env.EDITOR = 'nano';
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockSpawnSync).toHaveBeenCalledWith('nano', [expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+\.md$/)], { stdio: 'inherit' });
        });

        it('should throw error when editor fails to launch', async () => {
            mockSpawnSync.mockReturnValue({ error: new Error('Editor not found') });
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('Failed to launch editor \'vi\': Editor not found');
        });

        it('should throw error when editor returns empty content', async () => {
            mockFs.readFile.mockResolvedValue('# Only comments\n# No actual content');
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('Review note is empty – aborting. Provide a note as an argument, via STDIN, or through the editor.');
        });

        it('should filter out comment lines from editor content', async () => {
            mockFs.readFile.mockResolvedValue('# This is a comment\nActual review note\n# Another comment\nMore content');
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockLogger.debug).toHaveBeenCalledWith('Review note: %s', 'Actual review note\nMore content');
        });
    });

    describe('context gathering', () => {
        it('should gather commit history when enabled', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeCommitHistory: true,
                    commitHistoryLimit: 10,
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockLogCreate).toHaveBeenCalledWith({ limit: 10 });
            expect(mockLogGet).toHaveBeenCalled();
            expect(mockLogger.debug).toHaveBeenCalledWith('Fetching recent commit history...');
        });

        it('should gather recent diffs when enabled', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeRecentDiffs: true,
                    diffHistoryLimit: 5,
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockDiffGetRecentDiffsForReview).toHaveBeenCalledWith({
                limit: 5,
                baseExcludedPatterns: ['node_modules', '*.test.ts']
            });
            expect(mockLogger.debug).toHaveBeenCalledWith('Fetching recent commit diffs...');
        });

        it('should gather release notes when enabled', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeReleaseNotes: true,
                    releaseNotesLimit: 3,
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockReleaseNotesGet).toHaveBeenCalledWith({ limit: 3 });
            expect(mockLogger.debug).toHaveBeenCalledWith('Fetching recent release notes from GitHub...');
        });

        it('should gather GitHub issues when enabled', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeGithubIssues: true,
                    githubIssuesLimit: 20,
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockIssuesGet).toHaveBeenCalledWith({ limit: 20 });
            expect(mockLogger.debug).toHaveBeenCalledWith('Fetching open GitHub issues...');
        });

        it('should handle errors in context gathering gracefully', async () => {
            mockLogGet.mockRejectedValue(new Error('Git log failed'));
            mockDiffGetRecentDiffsForReview.mockRejectedValue(new Error('Diff failed'));
            mockReleaseNotesGet.mockRejectedValue(new Error('Release notes failed'));
            mockIssuesGet.mockRejectedValue(new Error('Issues failed'));

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                    sendit: true
                }
            };

            // Should not throw, should handle errors gracefully
            await Review.execute(runConfig);

            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch commit history: %s', 'Git log failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch recent diffs: %s', 'Diff failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch release notes: %s', 'Release notes failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch GitHub issues: %s', 'Issues failed');
        });

        it('should use custom excluded patterns for diffs', async () => {
            const runConfig = {
                model: 'gpt-4',
                excludedPatterns: ['*.custom.ts', '*.spec.ts'],
                review: {
                    note: 'Test note',
                    includeRecentDiffs: true,
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockDiffGetRecentDiffsForReview).toHaveBeenCalledWith({
                limit: undefined,
                baseExcludedPatterns: ['*.custom.ts', '*.spec.ts']
            });
        });
    });

    describe('OpenAI analysis', () => {
        it('should analyze review note and create completion', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test review note',
                    context: 'Additional context',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockCreatePrompt).toHaveBeenCalledWith(
                expect.objectContaining({
                    overridePaths: [],
                    overrides: false
                }),
                expect.objectContaining({
                    notes: 'Test review note'
                }),
                expect.objectContaining({
                    context: 'Additional context'
                })
            );

            expect(mockCreateCompletion).toHaveBeenCalledWith(
                [],
                expect.objectContaining({
                    model: 'gpt-4',
                    responseFormat: { type: 'json_object' },
                    debug: undefined
                })
            );

            expect(result).toBe('Issues created successfully');
        });

        it('should handle debug mode with debug files', async () => {
            const runConfig = {
                model: 'gpt-4',
                debug: true,
                outputDirectory: 'debug-output',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockCreateCompletion).toHaveBeenCalledWith(
                [],
                expect.objectContaining({
                    debug: true,
                    debugRequestFile: 'debug-output/request-123456.json',
                    debugResponseFile: 'debug-output/response-123456.json'
                })
            );
        });

        it('should pass discovered config directories and overrides', async () => {
            const runConfig = {
                model: 'gpt-4',
                discoveredConfigDirs: ['config1', 'config2'],
                overrides: true,
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockCreatePrompt).toHaveBeenCalledWith(
                expect.objectContaining({
                    overridePaths: ['config1', 'config2'],
                    overrides: true
                }),
                expect.any(Object),
                expect.any(Object)
            );
        });

        it('should log analysis result details', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockLogger.debug).toHaveBeenCalledWith('Analysis result summary: %s', 'Review analysis summary');
            expect(mockLogger.debug).toHaveBeenCalledWith('Total issues found: %d', 3);
            expect(mockLogger.debug).toHaveBeenCalledWith('Issues array length: %d', 3);
        });
    });

    describe('file saving', () => {
        it('should save timestamped review notes and analysis results', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test review note',
                    context: 'User context',
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            // Check review notes file
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                'output/review-notes-123456.md',
                expect.stringContaining('# Review Notes\n\nTest review note'),
                'utf-8'
            );

            // Check analysis result file
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                'output/review-123456.md',
                expect.stringContaining('# Review Analysis Result'),
                'utf-8'
            );
        });

        it('should include all context sections in review notes file', async () => {
            mockLogGet.mockResolvedValue('commit history content');
            mockDiffGetRecentDiffsForReview.mockResolvedValue('diff content');
            mockReleaseNotesGet.mockResolvedValue('release notes content');
            mockIssuesGet.mockResolvedValue('issues content');

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test review note',
                    context: 'User context',
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            const reviewNotesCall = mockStorage.writeFile.mock.calls.find(
                call => call[0].includes('review-notes-')
            );
            expect(reviewNotesCall).toBeDefined();
            const content = reviewNotesCall![1];

            expect(content).toContain('# Review Notes\n\nTest review note');
            expect(content).toContain('# Commit History Context');
            expect(content).toContain('# Recent Diffs Context');
            expect(content).toContain('# Release Notes Context');
            expect(content).toContain('# GitHub Issues Context');
            expect(content).toContain('# User Context\n\nUser context');
        });

        it('should handle file saving errors gracefully', async () => {
            mockStorage.writeFile.mockRejectedValue(new Error('Permission denied'));

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save timestamped review notes: %s', 'Permission denied');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save timestamped review analysis: %s', 'Permission denied');
            expect(result).toBe('Issues created successfully');
        });

        it('should use custom output directory', async () => {
            const runConfig = {
                model: 'gpt-4',
                outputDirectory: 'custom-output',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await Review.execute(runConfig);

            expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('custom-output');
            expect(mockStorage.writeFile).toHaveBeenCalledWith(
                'custom-output/review-notes-123456.md',
                expect.any(String),
                'utf-8'
            );
        });
    });

    describe('GitHub issue creation', () => {
        it('should handle issue creation in sendit mode', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockIssuesHandleIssueCreation).toHaveBeenCalledWith({
                summary: 'Review analysis summary',
                totalIssues: 3,
                issues: [
                    { title: 'Issue 1', priority: 'high' },
                    { title: 'Issue 2', priority: 'medium' },
                    { title: 'Issue 3', priority: 'low' }
                ]
            }, true);
            expect(result).toBe('Issues created successfully');
        });

        it('should handle issue creation in interactive mode', async () => {
            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: false
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockIssuesHandleIssueCreation).toHaveBeenCalledWith({
                summary: 'Review analysis summary',
                totalIssues: 3,
                issues: [
                    { title: 'Issue 1', priority: 'high' },
                    { title: 'Issue 2', priority: 'medium' },
                    { title: 'Issue 3', priority: 'low' }
                ]
            }, false);
            expect(result).toBe('Issues created successfully');
        });
    });

    describe('error handling', () => {
        it('should handle OpenAI API errors', async () => {
            mockCreateCompletion.mockRejectedValue(new Error('OpenAI API error'));

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('OpenAI API error');
        });

        it('should handle prompt creation errors', async () => {
            mockCreatePrompt.mockRejectedValue(new Error('Prompt creation failed'));

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('Prompt creation failed');
        });

        it('should handle storage directory creation errors', async () => {
            mockStorage.ensureDirectory.mockRejectedValue(new Error('Directory creation failed'));

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('Directory creation failed');
        });
    });

    describe('complex scenarios', () => {
        it('should handle complete configuration with all features enabled', async () => {
            const runConfig = {
                model: 'gpt-4',
                debug: true,
                outputDirectory: 'custom-output',
                excludedPatterns: ['*.spec.ts'],
                discoveredConfigDirs: ['config1', 'config2'],
                overrides: true,
                review: {
                    note: 'Comprehensive review note',
                    context: 'Additional context',
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                    commitHistoryLimit: 15,
                    diffHistoryLimit: 10,
                    releaseNotesLimit: 5,
                    githubIssuesLimit: 25,
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockLogCreate).toHaveBeenCalledWith({ limit: 15 });
            expect(mockDiffGetRecentDiffsForReview).toHaveBeenCalledWith({
                limit: 10,
                baseExcludedPatterns: ['*.spec.ts']
            });
            expect(mockReleaseNotesGet).toHaveBeenCalledWith({ limit: 5 });
            expect(mockIssuesGet).toHaveBeenCalledWith({ limit: 25 });
            expect(mockStorage.ensureDirectory).toHaveBeenCalledWith('custom-output');
            expect(result).toBe('Issues created successfully');
        });

        it('should handle empty context content gracefully', async () => {
            mockLogGet.mockResolvedValue('');
            mockDiffGetRecentDiffsForReview.mockResolvedValue('');
            mockReleaseNotesGet.mockResolvedValue('');
            mockIssuesGet.mockResolvedValue('');

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(result).toBe('Issues created successfully');
        });

        it('should handle analysis with no issues found', async () => {
            mockCreateCompletion.mockResolvedValue({
                summary: 'No issues found',
                totalIssues: 0,
                issues: []
            });

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockLogger.debug).toHaveBeenCalledWith('Total issues found: %d', 0);
            expect(mockLogger.debug).toHaveBeenCalledWith('Issues array length: %d', 0);
            expect(result).toBe('Issues created successfully');
        });
    });
});
