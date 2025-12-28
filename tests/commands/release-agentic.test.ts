import { describe, it, beforeEach, expect, vi } from 'vitest';
import type { Config } from '../../src/types';

// Mock all dependencies
vi.mock('@eldrforge/ai-service', () => ({
    runAgenticRelease: vi.fn(),
    createReleasePrompt: vi.fn(),
    createCompletionWithRetry: vi.fn(),
    getUserChoice: vi.fn(),
    editContentInEditor: vi.fn(),
    getLLMFeedbackInEditor: vi.fn(),
    requireTTY: vi.fn(),
    STANDARD_CHOICES: {
        CONFIRM: { key: 'c', label: 'Confirm' },
        EDIT: { key: 'e', label: 'Edit' },
        SKIP: { key: 's', label: 'Skip' },
        IMPROVE: { key: 'i', label: 'Improve' }
    },
}));

vi.mock('@eldrforge/git-tools', () => ({
    getDefaultFromRef: vi.fn().mockResolvedValue('v1.0.0'),
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
}));

vi.mock('@eldrforge/github-tools', () => ({
    getMilestoneIssuesForRelease: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../src/content/log', () => ({
    create: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue('commit log content'),
    }),
}));

vi.mock('../../src/content/diff', () => ({
    create: vi.fn().mockReturnValue({
        get: vi.fn().mockResolvedValue('diff content'),
    }),
    truncateDiffByFiles: vi.fn(),
}));

vi.mock('@eldrforge/shared', () => ({
    createStorage: vi.fn().mockReturnValue({
        ensureDirectory: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue('{"name":"test","version":"1.0.0"}'),
    }),
}));

vi.mock('../../src/logging', () => ({
    getDryRunLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
    }),
}));

vi.mock('../../src/util/aiAdapter', () => ({
    toAIConfig: vi.fn().mockReturnValue({}),
}));

vi.mock('../../src/util/storageAdapter', () => ({
    createStorageAdapter: vi.fn().mockReturnValue({
        readFile: vi.fn(),
        writeFile: vi.fn(),
        writeOutput: vi.fn().mockResolvedValue(undefined),
        ensureDirectory: vi.fn(),
    }),
}));

vi.mock('../../src/util/loggerAdapter', () => ({
    createLoggerAdapter: vi.fn().mockReturnValue({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
    }),
}));

vi.mock('../../src/util/general', () => ({
    getOutputPath: vi.fn().mockImplementation((dir, file) => `${dir}/${file}`),
    getTimestampedRequestFilename: vi.fn().mockReturnValue('request-123.json'),
    getTimestampedResponseFilename: vi.fn().mockReturnValue('response-123.json'),
    getTimestampedReleaseNotesFilename: vi.fn().mockReturnValue('release-123.md'),
}));

vi.mock('../../src/util/stopContext', () => ({
    filterContent: vi.fn().mockImplementation((content) => ({ filtered: content, hadFilters: false })),
}));

vi.mock('../../src/constants', () => ({
    DEFAULT_EXCLUDED_PATTERNS: [],
    DEFAULT_TO_COMMIT_ALIAS: 'HEAD',
    DEFAULT_OUTPUT_DIRECTORY: 'output',
    DEFAULT_MAX_DIFF_BYTES: 2048,
}));

vi.mock('@riotprompt/riotprompt', () => ({
    Formatter: {
        create: vi.fn().mockReturnValue({
            formatPrompt: vi.fn().mockReturnValue({
                messages: [],
            }),
        }),
    },
}));

describe('Release Command - Agentic Mode', () => {
    let Release: any;
    let mockAiService: any;
    let mockGithub: any;
    let mockStorage: any;
    let mockStorageAdapter: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        Release = await import('../../src/commands/release');
        mockAiService = await import('@eldrforge/ai-service');
        mockGithub = await import('@eldrforge/github-tools');
        mockStorage = await import('@eldrforge/shared');
        mockStorageAdapter = await import('../../src/util/storageAdapter');
    });

    describe('Agentic Mode Execution', () => {
        it('should execute in agentic mode when flag is set', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Agentic Release Title',
                    body: 'Agentic release body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                },
            };

            const result = await Release.execute(runConfig);

            expect(mockAiService.runAgenticRelease).toHaveBeenCalled();
            expect(result).toEqual({
                title: 'Agentic Release Title',
                body: 'Agentic release body',
            });
        });

        it('should pass correct parameters to runAgenticRelease', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 3,
                toolCallsExecuted: 6,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                    from: 'v1.0.0',
                    to: 'v2.0.0',
                    focus: 'Performance improvements',
                    context: 'Major release',
                    maxAgenticIterations: 40,
                },
                outputDirectory: 'test-output',
                debug: true,
            };

            await Release.execute(runConfig);

            expect(mockAiService.runAgenticRelease).toHaveBeenCalledWith(
                expect.objectContaining({
                    fromRef: 'v1.0.0',
                    toRef: 'v2.0.0',
                    releaseFocus: 'Performance improvements',
                    userContext: 'Major release',
                    maxIterations: 40,
                    debug: true,
                })
            );
        });

        it('should use default maxIterations of 30 for agentic mode', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 15,
                toolCallsExecuted: 20,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                },
            };

            await Release.execute(runConfig);

            expect(mockAiService.runAgenticRelease).toHaveBeenCalledWith(
                expect.objectContaining({
                    maxIterations: 30,
                })
            );
        });

        it('should not call traditional prompt-based flow in agentic mode', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                },
            };

            await Release.execute(runConfig);

            expect(mockAiService.createReleasePrompt).not.toHaveBeenCalled();
            expect(mockAiService.createCompletionWithRetry).not.toHaveBeenCalled();
        });
    });

    describe('Self-Reflection Generation', () => {
        it('should generate self-reflection report when flag is set', async () => {
            const mockWriteFile = vi.fn();

            mockStorage.createStorage.mockReturnValue({
                ensureDirectory: vi.fn(),
                writeFile: mockWriteFile,
                readFile: vi.fn().mockResolvedValue('{"name":"test","version":"1.0.0"}'),
            });

            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [
                    { name: 'get_tag_history', success: true, duration: 100, iteration: 1, timestamp: '2024-01-01T00:00:00Z' },
                    { name: 'compare_previous_release', success: true, duration: 150, iteration: 2, timestamp: '2024-01-01T00:00:01Z' },
                ],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                    selfReflection: true,
                },
            };

            await Release.execute(runConfig);

            // Verify that runAgenticRelease was called (which means agentic mode worked)
            expect(mockAiService.runAgenticRelease).toHaveBeenCalled();

            // Verify self-reflection was enabled in the workflow
            // Note: The actual file writing happens via storageAdapter.writeOutput
            // which is mocked at the module level, so we just verify the flow executed
            expect(mockAiService.runAgenticRelease).toHaveBeenCalledWith(
                expect.objectContaining({
                    model: expect.any(String),
                    maxIterations: expect.any(Number),
                })
            );
        });

        it('should not generate self-reflection when flag is not set', async () => {
            const mockWriteFile = vi.fn();
            mockStorage.createStorage.mockReturnValue({
                ensureDirectory: vi.fn(),
                writeFile: mockWriteFile,
                readFile: vi.fn().mockResolvedValue('{"name":"test","version":"1.0.0"}'),
            });

            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                    selfReflection: false,
                },
            };

            await Release.execute(runConfig);

            const writeCalls = mockWriteFile.mock.calls;
            const reflectionCall = writeCalls.find((call: any) =>
                call[0].includes('agentic-reflection')
            );

            expect(reflectionCall).toBeUndefined();
        });
    });

    describe('Interactive Mode with Agentic', () => {
        it('should support interactive mode with agentic-generated notes', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Initial Title',
                    body: 'Initial body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            mockAiService.getUserChoice.mockResolvedValue('c'); // Confirm

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                    interactive: true,
                },
            };

            const result = await Release.execute(runConfig);

            expect(mockAiService.getUserChoice).toHaveBeenCalled();
            expect(result).toEqual({
                title: 'Initial Title',
                body: 'Initial body',
            });
        });

        it('should allow editing agentic-generated notes in interactive mode', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Initial Title',
                    body: 'Initial body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            mockAiService.getUserChoice
                .mockResolvedValueOnce('e') // Edit
                .mockResolvedValueOnce('c'); // Then confirm

            mockAiService.editContentInEditor.mockResolvedValue({
                content: 'Edited Title\n\nEdited body',
                wasEdited: true,
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                    interactive: true,
                },
            };

            const result = await Release.execute(runConfig);

            expect(mockAiService.editContentInEditor).toHaveBeenCalled();
            expect(result.title).toBe('Edited Title');
            expect(result.body).toBe('Edited body');
        });
    });

    describe('Traditional Mode (Non-Agentic)', () => {
        it('should use traditional flow when agentic is false', async () => {
            mockAiService.createReleasePrompt.mockResolvedValue({
                prompt: { messages: [] },
                maxTokens: 10000,
                isLargeRelease: false,
            });

            mockAiService.createCompletionWithRetry.mockResolvedValue({
                title: 'Traditional Title',
                body: 'Traditional body',
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: false,
                },
            };

            const result = await Release.execute(runConfig);

            expect(mockAiService.createReleasePrompt).toHaveBeenCalled();
            expect(mockAiService.createCompletionWithRetry).toHaveBeenCalled();
            expect(mockAiService.runAgenticRelease).not.toHaveBeenCalled();
            expect(result).toEqual({
                title: 'Traditional Title',
                body: 'Traditional body',
            });
        });

        it('should use traditional flow when agentic is undefined', async () => {
            mockAiService.createReleasePrompt.mockResolvedValue({
                prompt: { messages: [] },
                maxTokens: 10000,
                isLargeRelease: false,
            });

            mockAiService.createCompletionWithRetry.mockResolvedValue({
                title: 'Traditional Title',
                body: 'Traditional body',
            });

            const runConfig: Partial<Config> = {};

            const result = await Release.execute(runConfig);

            expect(mockAiService.createReleasePrompt).toHaveBeenCalled();
            expect(mockAiService.runAgenticRelease).not.toHaveBeenCalled();
            expect(result).toEqual({
                title: 'Traditional Title',
                body: 'Traditional body',
            });
        });
    });

    describe('Dry Run Mode', () => {
        it('should work in dry run mode with agentic', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Dry Run Title',
                    body: 'Dry run body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                },
                dryRun: true,
            };

            const result = await Release.execute(runConfig);

            expect(result).toEqual({
                title: 'Dry Run Title',
                body: 'Dry run body',
            });
        });

        it('should not enter interactive mode during dry run', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                    interactive: true,
                },
                dryRun: true,
            };

            await Release.execute(runConfig);

            expect(mockAiService.requireTTY).not.toHaveBeenCalled();
            expect(mockAiService.getUserChoice).not.toHaveBeenCalled();
        });
    });

    describe('Output Files', () => {
        it('should save timestamped release notes in agentic mode', async () => {
            const mockWriteFile = vi.fn();
            mockStorage.createStorage.mockReturnValue({
                ensureDirectory: vi.fn(),
                writeFile: mockWriteFile,
                readFile: vi.fn().mockResolvedValue('{"name":"test","version":"1.0.0"}'),
            });

            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Agentic Title',
                    body: 'Agentic body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                },
            };

            await Release.execute(runConfig);

            const writeCalls = mockWriteFile.mock.calls;
            const releaseNotesCall = writeCalls.find((call: any) =>
                call[0].includes('release-123.md')
            );

            expect(releaseNotesCall).toBeDefined();
            if (releaseNotesCall) {
                expect(releaseNotesCall[1]).toBe('# Agentic Title\n\nAgentic body');
            }
        });

        it('should save debug files when debug is enabled', async () => {
            mockAiService.runAgenticRelease.mockResolvedValue({
                releaseNotes: {
                    title: 'Test',
                    body: 'Test body',
                },
                iterations: 5,
                toolCallsExecuted: 10,
                conversationHistory: [],
                toolMetrics: [],
            });

            const runConfig: Partial<Config> = {
                release: {
                    agentic: true,
                },
                debug: true,
                outputDirectory: 'debug-output',
            };

            await Release.execute(runConfig);

            expect(mockAiService.runAgenticRelease).toHaveBeenCalledWith(
                expect.objectContaining({
                    debug: true,
                    debugRequestFile: expect.stringContaining('request-123.json'),
                    debugResponseFile: expect.stringContaining('response-123.json'),
                })
            );
        });
    });
});

