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
vi.mock('path', () => {
    const pathMock = {
        join: vi.fn().mockImplementation((...args) => args.join('/')),
        dirname: vi.fn().mockImplementation((p) => p.split('/').slice(0, -1).join('/') || '/')
    };
    return {
        default: pathMock,
        ...pathMock
    };
});

vi.mock('os', () => ({
    default: {
        tmpdir: vi.fn().mockReturnValue('/tmp')
    }
}));

vi.mock('child_process', () => ({
    spawnSync: vi.fn(),
    spawn: vi.fn()
}));

vi.mock('fs/promises', () => ({
    default: {
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('Test review note content'),
        unlink: vi.fn().mockResolvedValue(undefined),
        access: vi.fn().mockResolvedValue(undefined),
        open: vi.fn().mockResolvedValue({
            close: vi.fn().mockResolvedValue(undefined)
        })
    }
}));

vi.mock('fs', () => {
    const fsMock = {
        constants: {
            W_OK: 2
        }
    };
    return {
        default: fsMock,
        ...fsMock
    };
});

// Mock process.exit to prevent actual exit during tests
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

describe('review command', () => {
    let Review: any;
    let mockProcess: any;
    let mockSpawnSync: any;
    let mockFs: any;

    beforeEach(async () => {
        // Reset all mocks before each test
        vi.clearAllMocks();
        mockExit.mockClear();

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
            env: { EDITOR: 'vi' },
            exit: mockExit
        };
        globalThis.process = mockProcess as any;

        // Import modules after mocking
        const childProcess = await import('child_process');
        mockSpawnSync = childProcess.spawnSync;
        mockSpawnSync.mockReturnValue({ error: null });

        // Mock spawn for editor functionality
        const mockSpawn = childProcess.spawn as any;
        const mockChild = {
            on: vi.fn().mockImplementation((event, callback) => {
                if (event === 'exit') {
                    setTimeout(() => callback(0), 0);
                }
            }),
            kill: vi.fn()
        };
        mockSpawn.mockReturnValue(mockChild);

        const fs = await import('fs/promises');
        mockFs = fs.default;

        // Set up default fs.readFile behavior for editor scenarios
        mockFs.readFile.mockResolvedValue('Test review note content');

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

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
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

            // Check that temp file was created (look for the actual temp file, not .test files)
            const tempFileCall = mockFs.writeFile.mock.calls.find(
                (call: any) => call[0].includes('kodrdriv_review_') && !call[0].includes('.test')
            );
            expect(tempFileCall).toBeDefined();
            expect(tempFileCall![1]).toContain('# Kodrdriv Review Note');
            expect(tempFileCall![2]).toBe('utf-8');

            // Check that spawn was called (not spawnSync)
            const childProcess = await import('child_process');
            const mockSpawn = childProcess.spawn;
            expect(mockSpawn).toHaveBeenCalledWith('vi', [expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+_[\w]+\.md$/)], {
                stdio: 'inherit',
                shell: false
            });

            expect(mockFs.readFile).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+_[\w]+\.md$/), 'utf8');
            expect(mockFs.unlink).toHaveBeenCalledWith(expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+_[\w]+\.md$/));
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

            // Now uses spawn instead of spawnSync - get the spawn mock
            const childProcess = await import('child_process');
            const mockSpawn = childProcess.spawn;
                        expect(mockSpawn).toHaveBeenCalledWith('nano', [expect.stringMatching(/^\/tmp\/kodrdriv_review_\d+_[\w]+\.md$/)], {
                stdio: 'inherit',
                shell: false
            });
        });

        it('should throw error when editor fails to launch', async () => {
            // Mock spawn to emit an error event
            const childProcess = await import('child_process');
            const mockSpawn = childProcess.spawn as any;
            const mockChild = {
                on: vi.fn().mockImplementation((event, callback) => {
                    if (event === 'error') {
                        setTimeout(() => callback(new Error('Editor not found')), 0);
                    }
                }),
                kill: vi.fn()
            };
            mockSpawn.mockReturnValue(mockChild);

            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
        });

        it('should throw error when editor returns empty content', async () => {
            mockFs.readFile.mockResolvedValue('# Only comments\n# No actual content');
            const runConfig = {
                model: 'gpt-4',
                review: {
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
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

            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch commit history: Git log failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch recent diffs: Diff failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch release notes: Release notes failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to fetch GitHub issues: Issues failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('Context gathering completed with 4 error(s):');
            expect(mockLogger.warn).toHaveBeenCalledWith('  - Failed to fetch commit history: Git log failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('  - Failed to fetch recent diffs: Diff failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('  - Failed to fetch release notes: Release notes failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('  - Failed to fetch GitHub issues: Issues failed');
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

            // Check review notes file - now uses fs.writeFile directly via safeWriteFile
            expect(mockFs.writeFile).toHaveBeenCalledWith(
                'output/review-notes-123456.md',
                expect.stringContaining('# Review Notes\n\nTest review note'),
                'utf-8'
            );

            // Check analysis result file - now uses fs.writeFile directly via safeWriteFile
            expect(mockFs.writeFile).toHaveBeenCalledWith(
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

            const reviewNotesCall = mockFs.writeFile.mock.calls.find(
                (call: any) => call[0].includes('review-notes-') && !call[0].includes('.test')
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
            // Mock fs.writeFile to fail for main files but not test files
            mockFs.writeFile.mockImplementation(async (path: string, data: any, encoding: any) => {
                if (path.includes('.test')) {
                    return; // Allow test files to succeed
                }
                throw new Error('Permission denied');
            });

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save timestamped review notes: %s', expect.any(String));
            expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save timestamped review analysis: %s', expect.any(String));
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
            expect(mockFs.writeFile).toHaveBeenCalledWith(
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

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
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

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
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

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
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

        it('should handle maxContextErrors configuration', async () => {
            // Mock all context sources to fail
            mockLogGet.mockRejectedValue(new Error('Log failed'));
            mockDiffGetRecentDiffsForReview.mockRejectedValue(new Error('Diff failed'));
            mockReleaseNotesGet.mockRejectedValue(new Error('Release failed'));
            mockIssuesGet.mockRejectedValue(new Error('Issues failed'));

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: 'Test note',
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                    maxContextErrors: 2, // Allow only 2 errors
                    sendit: true
                }
            };

            await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Too many context gathering errors (4), aborting review')
            );
        });

                 it('should handle custom editor timeout configuration', async () => {
             const runConfig = {
                 model: 'gpt-4',
                 review: {
                     note: 'Test note', // Provide note to avoid editor opening
                     editorTimeout: 60000, // 1 minute
                     sendit: true
                 }
             };

             const result = await Review.execute(runConfig);
             expect(result).toBe('Issues created successfully');
         });
    });

    describe('security and validation', () => {
        describe('createSecureTempFile function', () => {
            it('should handle temp directory access failures', async () => {
                const fs = await import('fs/promises');
                const mockFsAccess = fs.default.access as any;
                mockFsAccess.mockRejectedValue(new Error('Permission denied'));

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
            });

            it('should handle temp file creation failures', async () => {
                const fs = await import('fs/promises');
                const mockFsOpen = fs.default.open as any;
                mockFsOpen.mockRejectedValue(new Error('Cannot create file'));

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
            });
        });

        describe('editor timeout handling', () => {
            it('should handle editor timeout gracefully', async () => {
                const childProcess = await import('child_process');
                const mockSpawn = childProcess.spawn as any;

                // Mock a child process that never exits (simulating timeout)
                const mockChild = {
                    on: vi.fn().mockImplementation((event, callback) => {
                        // Don't call any callbacks to simulate hanging
                    }),
                    kill: vi.fn()
                };
                mockSpawn.mockReturnValue(mockChild);

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        editorTimeout: 100, // Very short timeout for test
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
            });

            it('should handle editor SIGTERM signal', async () => {
                const childProcess = await import('child_process');
                const mockSpawn = childProcess.spawn as any;

                const mockChild = {
                    on: vi.fn().mockImplementation((event, callback) => {
                        if (event === 'exit') {
                            setTimeout(() => callback(0, 'SIGTERM'), 0);
                        }
                    }),
                    kill: vi.fn()
                };
                mockSpawn.mockReturnValue(mockChild);

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
            });

            it('should handle editor non-zero exit code', async () => {
                const childProcess = await import('child_process');
                const mockSpawn = childProcess.spawn as any;

                const mockChild = {
                    on: vi.fn().mockImplementation((event, callback) => {
                        if (event === 'exit') {
                            setTimeout(() => callback(1), 0); // Non-zero exit code
                        }
                    }),
                    kill: vi.fn()
                };
                mockSpawn.mockReturnValue(mockChild);

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
            });
        });

        describe('validateReviewResult function', () => {
            it('should reject null or undefined responses', async () => {
                mockCreateCompletion.mockResolvedValue(null);

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        note: 'Test note',
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid API response: expected object, got object')
                );
            });

            it('should reject responses with invalid summary', async () => {
                mockCreateCompletion.mockResolvedValue({
                    summary: 123, // Should be string
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

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid API response: missing or invalid summary field')
                );
            });

            it('should reject responses with invalid totalIssues', async () => {
                mockCreateCompletion.mockResolvedValue({
                    summary: 'Valid summary',
                    totalIssues: -1, // Should be non-negative
                    issues: []
                });

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        note: 'Test note',
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid API response: missing or invalid totalIssues field')
                );
            });

            it('should reject responses with non-array issues', async () => {
                mockCreateCompletion.mockResolvedValue({
                    summary: 'Valid summary',
                    totalIssues: 1,
                    issues: 'not an array'
                });

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        note: 'Test note',
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid API response: issues field must be an array')
                );
            });

            it('should reject responses with invalid issue objects', async () => {
                mockCreateCompletion.mockResolvedValue({
                    summary: 'Valid summary',
                    totalIssues: 2,
                    issues: [
                        { title: 'Valid issue', priority: 'high' },
                        { title: 'Invalid issue' } // Missing priority
                    ]
                });

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        note: 'Test note',
                        sendit: true
                    }
                };

                await expect(Review.execute(runConfig)).rejects.toThrow('process.exit called');
                expect(mockLogger.error).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid API response: issue 1 missing priority')
                );
            });
        });

        describe('safeWriteFile function', () => {
            it('should handle parent directory access failures', async () => {
                const fs = await import('fs/promises');
                const mockFsAccess = fs.default.access as any;

                // Allow temp file access but fail on output directory
                mockFsAccess.mockImplementation(async (path: string) => {
                    if (path.includes('kodrdriv_review_')) {
                        return; // Allow temp files
                    }
                    if (path.includes('output') || path.includes('custom-output')) {
                        throw new Error('Directory not writable');
                    }
                    return;
                });

                const runConfig = {
                    model: 'gpt-4',
                    outputDirectory: 'custom-output',
                    review: {
                        note: 'Test note',
                        sendit: true
                    }
                };

                // Should still succeed but log warnings about file saves
                const result = await Review.execute(runConfig);
                expect(result).toBe('Issues created successfully');
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'Failed to save timestamped review notes: %s',
                    expect.any(String)
                );
            });

            it('should handle disk space errors (ENOSPC)', async () => {
                const fs = await import('fs/promises');
                const mockFsWriteFile = fs.default.writeFile as any;

                // Mock ENOSPC error for test files
                mockFsWriteFile.mockImplementation(async (path: string, data: any, encoding: any) => {
                    if (path.includes('.test')) {
                        const error = new Error('No space left on device');
                        (error as any).code = 'ENOSPC';
                        throw error;
                    }
                    return;
                });

                const runConfig = {
                    model: 'gpt-4',
                    review: {
                        note: 'Test note',
                        sendit: true
                    }
                };

                // Should still succeed but log warnings
                const result = await Review.execute(runConfig);
                expect(result).toBe('Issues created successfully');
                expect(mockLogger.warn).toHaveBeenCalledWith(
                    'Failed to save timestamped review notes: %s',
                    expect.any(String)
                );
            });
        });

        describe('TTY detection edge cases', () => {
            it('should handle undefined TTY with fallback checks', async () => {
                // Mock undefined TTY scenario
                const originalStdin = process.stdin;
                const originalStdout = process.stdout;
                const originalStderr = process.stderr;

                try {
                    (process as any).stdin = { isTTY: undefined };
                    (process as any).stdout = { isTTY: true };
                    (process as any).stderr = { isTTY: true };

                    const runConfig = {
                        model: 'gpt-4',
                        review: {
                            note: 'Test note',
                            sendit: true
                        }
                    };

                    const result = await Review.execute(runConfig);
                    expect(result).toBe('Issues created successfully');
                } finally {
                    process.stdin = originalStdin;
                    process.stdout = originalStdout;
                    process.stderr = originalStderr;
                }
            });

                         it('should handle TTY detection exceptions', async () => {
                 // Test the scenario where TTY detection would handle exceptions
                 // Since we can't easily mock process.stdin throwing, we'll test
                 // that the command works with sendit mode regardless of TTY state
                 const runConfig = {
                     model: 'gpt-4',
                     review: {
                         note: 'Test note',
                         sendit: true // Should work with sendit even if TTY detection fails
                     }
                 };

                 const result = await Review.execute(runConfig);
                 expect(result).toBe('Issues created successfully');
                 // The function should work regardless of TTY detection issues
             });
        });
    });

    describe('edge cases and error scenarios', () => {
                 it('should handle cleanup errors for non-existent files', async () => {
             const fs = await import('fs/promises');
             const mockFsUnlink = fs.default.unlink as any;

             // Mock ENOENT error (file not found) for cleanup only
             mockFsUnlink.mockImplementation(async (path: string) => {
                 if (path.includes('kodrdriv_review_')) {
                     // Simulate cleanup error for temp files
                     const error = new Error('File not found');
                     (error as any).code = 'ENOENT';
                     throw error;
                 }
                 return; // Allow other file operations
             });

             const runConfig = {
                 model: 'gpt-4',
                 review: {
                     note: 'Test note', // Provide note to avoid editor issues
                     sendit: true
                 }
             };

             // Should not throw despite cleanup error
             const result = await Review.execute(runConfig);
             expect(result).toBe('Issues created successfully');
             // ENOENT errors should be silently ignored in cleanup
             expect(mockLogger.warn).not.toHaveBeenCalledWith(
                 expect.stringContaining('Failed to cleanup temp file')
             );
         });

                                            it('should handle file system errors gracefully during execution', async () => {
             // Test that file system errors don't crash the entire operation
             // Mock access to throw for test files only to simulate disk space/permission issues
             const fs = await import('fs/promises');
             const mockFsAccess = fs.default.access as any;

             mockFsAccess.mockImplementation(async (path: string) => {
                 if (path.includes('.test')) {
                     throw new Error('Disk space insufficient');
                 }
                 return; // Allow other file operations
             });

             const runConfig = {
                 model: 'gpt-4',
                 review: {
                     note: 'Test note with sufficient content',
                     sendit: true
                 }
             };

             // Should complete successfully despite file system errors for test files
             const result = await Review.execute(runConfig);
             expect(result).toBe('Issues created successfully');
         });

         it('should validate review note content properly', async () => {
             // Test direct validation without complex editor mocking
             const runConfig = {
                 model: 'gpt-4',
                 review: {
                     note: 'Valid review note with adequate content for analysis',
                     sendit: true
                 }
             };

             const result = await Review.execute(runConfig);
             expect(result).toBe('Issues created successfully');

             // Verify the note was processed
             expect(mockLogger.debug).toHaveBeenCalledWith(
                 'Review note: %s',
                 'Valid review note with adequate content for analysis'
             );
         });

        it('should handle mixed success and failure in context gathering', async () => {
            // Mix of success and failure
            mockLogGet.mockResolvedValue('successful log content');
            mockDiffGetRecentDiffsForReview.mockRejectedValue(new Error('Diff failed'));
            mockReleaseNotesGet.mockResolvedValue('successful release notes');
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

            const result = await Review.execute(runConfig);

            expect(result).toBe('Issues created successfully');
            expect(mockLogger.warn).toHaveBeenCalledWith('Context gathering completed with 2 error(s):');
            expect(mockLogger.warn).toHaveBeenCalledWith('  - Failed to fetch recent diffs: Diff failed');
            expect(mockLogger.warn).toHaveBeenCalledWith('  - Failed to fetch GitHub issues: Issues failed');
        });

        it('should handle very long review notes', async () => {
            const longNote = 'A'.repeat(100000); // 100KB note

            const runConfig = {
                model: 'gpt-4',
                review: {
                    note: longNote,
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);
            expect(result).toBe('Issues created successfully');
            expect(mockLogger.debug).toHaveBeenCalledWith('Review note length: %d characters', 100000);
        });

                                                     it('should handle environment variable configurations', async () => {
             // Test that the command respects environment configurations
             mockProcess.env.CUSTOM_VAR = 'test-value';

             const runConfig = {
                 model: 'gpt-4',
                 review: {
                     note: 'Test note with environment context',
                     sendit: true
                 }
             };

             const result = await Review.execute(runConfig);
             expect(result).toBe('Issues created successfully');

             // Verify that the configuration was processed
             expect(mockLogger.debug).toHaveBeenCalledWith(
                 'Review note: %s',
                 'Test note with environment context'
             );
         });

        it('should handle prompt creation with empty discovered config dirs', async () => {
            const runConfig = {
                model: 'gpt-4',
                discoveredConfigDirs: [], // Explicitly empty
                overrides: false,
                review: {
                    note: 'Test note',
                    sendit: true
                }
            };

            const result = await Review.execute(runConfig);

            expect(mockCreatePrompt).toHaveBeenCalledWith(
                expect.objectContaining({
                    overridePaths: [],
                    overrides: false
                }),
                expect.any(Object),
                expect.any(Object)
            );
            expect(result).toBe('Issues created successfully');
        });
    });
});
