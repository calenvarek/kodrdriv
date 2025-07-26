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

    it('detects large releases and sets appropriate token limits', async () => {
        const config = {} as any;
        // Create large content to trigger large release detection
        const largeLogContent = 'log line\n'.repeat(100); // 100 lines
        const largeDiffContent = 'diff line\n'.repeat(600); // 600 lines
        const content = { logContent: largeLogContent, diffContent: largeDiffContent };

        const result = await ReleasePrompt.createPrompt(config, content);

        expect(result).toEqual({
            prompt: 'mock-prompt',
            maxTokens: 25000, // Large release should use increased tokens
            isLargeRelease: true
        });

        // Verify the recipe function was called
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });
});
