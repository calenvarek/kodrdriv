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

        const prompt = await ReleasePrompt.createPrompt(config, content, ctx);

        // Ensure we got the value returned from the recipe chain
        expect(prompt).toBe('mock-prompt');

        // Verify the recipe function was called
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });

    it('builds a prompt with only mandatory content when optional params are omitted', async () => {
        const config = {} as any;
        const content = { logContent: 'log', diffContent: 'diff' };

        const prompt = await ReleasePrompt.createPrompt(config, content);

        expect(prompt).toBe('mock-prompt');

        // Verify the recipe function was called
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });
});
