import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock the external @riotprompt/riotprompt module
vi.mock('@riotprompt/riotprompt', () => {
    return {
        quick: {
            commit: vi.fn().mockResolvedValue('mock prompt')
        }
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

import { quick } from '@riotprompt/riotprompt';
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

        // Ensure quick.commit was invoked with the expected parameters
        expect(quick.commit).toHaveBeenCalledTimes(1);
        expect(quick.commit).toHaveBeenCalledWith(diffContent, {
            basePath: expect.stringContaining('/prompt'),
            overridePaths: [],
            overrides: false,
            userDirection: undefined,
            context: undefined,
            directories: undefined
        });

        // Final prompt should come from quick.commit
        expect(result).toBe('mock prompt');
    });

    it('includes user direction, context, log context and directories when provided', async () => {
        const diffContent = 'some diff';
        const userDirection = 'Refactor to improve performance';
        const context = 'Bug fix related to issue #123';
        const logContext = 'Previous commit logs';
        const directories = ['src', 'tests'];

        await createPrompt(
            {
                overridePaths: ['/custom/path'],
                overrides: true
            },
            { diffContent, userDirection },
            { context, logContext, directories }
        );

        // Verify quick.commit was called with all the parameters
        expect(quick.commit).toHaveBeenCalledTimes(1);
        expect(quick.commit).toHaveBeenCalledWith(diffContent, {
            basePath: expect.stringContaining('/prompt'),
            overridePaths: ['/custom/path'],
            overrides: true,
            userDirection,
            context,
            directories
        });
    });
});
