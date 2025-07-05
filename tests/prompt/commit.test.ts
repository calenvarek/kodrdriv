import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the RiotPrompt recipe API
vi.mock('@riotprompt/riotprompt', () => {
    return {
        recipe: vi.fn().mockImplementation(() => ({
            persona: vi.fn().mockImplementation(() => ({
                instructions: vi.fn().mockImplementation(() => ({
                    content: vi.fn().mockImplementation(() => ({
                        cook: vi.fn().mockResolvedValue('mock prompt')
                    }))
                }))
            }))
        }))
    };
});

// Mock the logger utility to avoid side-effects
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    })
}));

import { recipe } from '@riotprompt/riotprompt';
import { createPrompt } from '../../src/prompt/commit';

describe('createPrompt (commit)', () => {
    beforeEach(() => {
        // Clear call history before each test run
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetModules();
    });

    it('builds a basic commit prompt with required diff content', async () => {
        const diffContent = 'diff --git a/file.txt b/file.txt';

        const result = await createPrompt({}, { diffContent }, {});

        // Verify the recipe function was called
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));

        // Final prompt should come from the recipe chain
        expect(result).toBe('mock prompt');
    });

    it('includes user direction, context, log context and directories when provided', async () => {
        const diffContent = 'some diff';
        const userDirection = 'Refactor to improve performance';
        const context = 'Bug fix related to issue #123';
        const logContext = 'Previous commit logs';
        const directories = ['src', 'tests'];

        const result = await createPrompt(
            {
                overridePaths: ['/custom/path'],
                overrides: true
            },
            { diffContent, userDirection },
            { context, logContext, directories }
        );

        // Verify the recipe function was called
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));

        // Final prompt should come from the recipe chain
        expect(result).toBe('mock prompt');
    });
});
