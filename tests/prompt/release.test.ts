import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the RiotPrompt recipe API
vi.mock('@riotprompt/riotprompt', () => {
    return {
        recipe: vi.fn().mockImplementation(() => ({
            persona: vi.fn().mockImplementation(() => ({
                instructions: vi.fn().mockImplementation(() => ({
                    overridePaths: vi.fn().mockImplementation(() => ({
                        overrides: vi.fn().mockImplementation(() => ({
                            content: vi.fn().mockImplementation(() => ({
                                context: vi.fn().mockImplementation(() => ({
                                    cook: vi.fn().mockResolvedValue('mock-prompt')
                                }))
                            }))
                        }))
                    }))
                }))
            }))
        }))
    };
});

// Mock the project logger so the real implementation is not invoked
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn(),
    }))
}));

// Import constants so we can assert correct paths are forwarded
import * as Constants from '../../src/constants';

// Import the module under test AFTER mocks are in place
import { recipe } from '@riotprompt/riotprompt';
import * as ReleasePrompt from '../../src/prompt/release';

describe('prompt/release.createPrompt', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('basic functionality', () => {
        it('builds a prompt with release focus, context and directories when provided', async () => {
            const config = { overridePaths: ['/custom'], overrides: true };
            const content = { logContent: 'log', diffContent: 'diff' };
            const ctx = { releaseFocus: 'focus', context: 'additional', directories: ['src'] };

            const result = await ReleasePrompt.createPrompt(config, content, ctx);

            // Ensure we got the expected structure
            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000, // Small release should use default tokens
                isLargeRelease: false
            });

            // Verify the recipe function was called
            expect(recipe).toHaveBeenCalledTimes(1);
            expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
        });

        it('builds a prompt with only mandatory content when optional params are omitted', async () => {
            const config = {} as any;
            const content = { logContent: 'log', diffContent: 'diff' };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000, // Small release should use default tokens
                isLargeRelease: false
            });

            // Verify the recipe function was called
            expect(recipe).toHaveBeenCalledTimes(1);
            expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
        });

        it('builds a prompt with milestone issues when provided', async () => {
            const config = {} as any;
            const content = {
                logContent: 'log',
                diffContent: 'diff',
                milestoneIssues: 'Issue #1: Fixed bug\nIssue #2: Added feature'
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });

            expect(recipe).toHaveBeenCalledTimes(1);
        });

        it('builds a prompt with release focus when provided', async () => {
            const config = {} as any;
            const content = {
                logContent: 'log',
                diffContent: 'diff',
                releaseFocus: 'Major bug fixes and performance improvements'
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });

            expect(recipe).toHaveBeenCalledTimes(1);
        });
    });

    describe('content handling edge cases', () => {
        it('handles empty diffContent', async () => {
            const config = {} as any;
            const content = { logContent: 'log', diffContent: '' };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles empty logContent', async () => {
            const config = {} as any;
            const content = { logContent: '', diffContent: 'diff' };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles missing diffContent', async () => {
            const config = {} as any;
            const content = { logContent: 'log' } as any;

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles all content items provided', async () => {
            const config = {} as any;
            const content = {
                logContent: 'log',
                diffContent: 'diff',
                milestoneIssues: 'issues',
                releaseFocus: 'focus'
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });
    });

    describe('context handling', () => {
        it('handles context without directories', async () => {
            const config = {} as any;
            const content = { logContent: 'log', diffContent: 'diff' };
            const ctx = { context: 'test context' };

            const result = await ReleasePrompt.createPrompt(config, content, ctx);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles directories without context', async () => {
            const config = {} as any;
            const content = { logContent: 'log', diffContent: 'diff' };
            const ctx = { directories: ['src', 'tests'] };

            const result = await ReleasePrompt.createPrompt(config, content, ctx);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles empty directories array', async () => {
            const config = {} as any;
            const content = { logContent: 'log', diffContent: 'diff' };
            const ctx = { directories: [] };

            const result = await ReleasePrompt.createPrompt(config, content, ctx);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles undefined context object', async () => {
            const config = {} as any;
            const content = { logContent: 'log', diffContent: 'diff' };

            const result = await ReleasePrompt.createPrompt(config, content, undefined);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });
    });

    describe('release size analysis', () => {
        it('detects large releases by log lines count (>60 lines)', async () => {
            const config = {} as any;
            const largeLogContent = 'log line\n'.repeat(70); // 70 lines
            const content = { logContent: largeLogContent, diffContent: 'diff' };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 25000,
                isLargeRelease: true
            });
        });

        it('detects large releases by diff lines count (>500 lines)', async () => {
            const config = {} as any;
            const largeDiffContent = 'diff line\n'.repeat(600); // 600 lines
            const content = { logContent: 'log', diffContent: largeDiffContent };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 25000,
                isLargeRelease: true
            });
        });

        it('detects large releases by milestone issues count (>50 lines)', async () => {
            const config = {} as any;
            const largeMilestoneIssues = 'Issue #1\n'.repeat(60); // 60 lines
            const content = {
                logContent: 'log',
                diffContent: 'diff',
                milestoneIssues: largeMilestoneIssues
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 25000,
                isLargeRelease: true
            });
        });

        it('detects large releases by total content length (>50KB)', async () => {
            const config = {} as any;
            // Create content that totals more than 50KB
            const largeContent = 'x'.repeat(25000); // 25KB each
            const content = {
                logContent: largeContent,
                diffContent: largeContent,
                milestoneIssues: 'short'
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 25000,
                isLargeRelease: true
            });
        });

        it('remains small release when just under thresholds', async () => {
            const config = {} as any;
            const content = {
                logContent: 'log line\n'.repeat(59), // 59 lines (just under 60)
                diffContent: 'diff line\n'.repeat(499), // 499 lines (just under 500)
                milestoneIssues: 'Issue #1\n'.repeat(49) // 49 lines (just under 50)
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 10000,
                isLargeRelease: false
            });
        });

        it('handles missing milestoneIssues in size calculation', async () => {
            const config = {} as any;
            const content = {
                logContent: 'log line\n'.repeat(70), // Should trigger large release
                diffContent: 'diff'
            };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result).toEqual({
                prompt: 'mock-prompt',
                maxTokens: 25000,
                isLargeRelease: true
            });
        });

        it('adds large release context when detected', async () => {
            const config = {} as any;
            const largeLogContent = 'log line\n'.repeat(100);
            const content = { logContent: largeLogContent, diffContent: 'diff' };

            const result = await ReleasePrompt.createPrompt(config, content);

            expect(result.isLargeRelease).toBe(true);
            expect(result.maxTokens).toBe(25000);
            expect(recipe).toHaveBeenCalledTimes(1);
        });
    });

    describe('configuration handling', () => {
        it('passes overridePaths correctly', async () => {
            const config = { overridePaths: ['/path1', '/path2'] };
            const content = { logContent: 'log', diffContent: 'diff' };

            await ReleasePrompt.createPrompt(config, content);

            expect(recipe).toHaveBeenCalledTimes(1);
            expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
        });

        it('passes overrides correctly', async () => {
            const config = { overrides: false };
            const content = { logContent: 'log', diffContent: 'diff' };

            await ReleasePrompt.createPrompt(config, content);

            expect(recipe).toHaveBeenCalledTimes(1);
        });

        it('handles undefined overridePaths', async () => {
            const config = { overrides: true };
            const content = { logContent: 'log', diffContent: 'diff' };

            await ReleasePrompt.createPrompt(config, content);

            expect(recipe).toHaveBeenCalledTimes(1);
        });

        it('handles undefined overrides', async () => {
            const config = { overridePaths: ['/path'] };
            const content = { logContent: 'log', diffContent: 'diff' };

            await ReleasePrompt.createPrompt(config, content);

            expect(recipe).toHaveBeenCalledTimes(1);
        });
    });
});
