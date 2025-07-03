import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Hold the builder mock instance so tests can assert against it
var builderMock: any;

// Mock the external @riotprompt/riotprompt module
vi.mock('@riotprompt/riotprompt', () => {
    // Helper to create a fresh mocked builder instance
    const createBuilderMock = () => {
        const instance: any = {};
        instance.addPersonaPath = vi.fn().mockResolvedValue(instance);
        instance.addInstructionPath = vi.fn().mockResolvedValue(instance);
        instance.addContent = vi.fn().mockResolvedValue(instance);
        instance.loadContext = vi.fn().mockResolvedValue(instance);
        instance.addContext = vi.fn().mockResolvedValue(instance);
        instance.build = vi.fn().mockResolvedValue('mock prompt');
        return instance;
    };

    const localBuilder = createBuilderMock();
    builderMock = localBuilder;

    return {
        Builder: {
            create: vi.fn(() => localBuilder)
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

import { Builder } from '@riotprompt/riotprompt';
import { createPrompt } from '../../src/prompt/commit';
import { DEFAULT_INSTRUCTIONS_COMMIT_FILE, DEFAULT_PERSONA_YOU_FILE } from '../../src/constants';

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

        // Ensure Builder.create was invoked
        expect(Builder.create).toHaveBeenCalledTimes(1);

        // Verify mandatory builder interactions
        expect(builderMock.addPersonaPath).toHaveBeenCalledWith(DEFAULT_PERSONA_YOU_FILE);
        expect(builderMock.addInstructionPath).toHaveBeenCalledWith(DEFAULT_INSTRUCTIONS_COMMIT_FILE);
        expect(builderMock.addContent).toHaveBeenCalledWith(diffContent, { title: 'Diff', weight: 0.5 });

        // Optional methods should not be invoked when inputs are absent
        expect(builderMock.loadContext).not.toHaveBeenCalled();
        expect(builderMock.addContext).not.toHaveBeenCalled();

        // Final prompt should come from builder.build()
        expect(builderMock.build).toHaveBeenCalled();
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
                overridePath: '/custom/path',
                overrides: true
            },
            { diffContent, userDirection },
            { context, logContext, directories }
        );

        // User-supplied direction comes first with highest weight
        expect(builderMock.addContent).toHaveBeenCalledWith(userDirection, {
            title: 'User Direction',
            weight: 1.0
        });

        // Diff should always be included
        expect(builderMock.addContent).toHaveBeenCalledWith(diffContent, {
            title: 'Diff',
            weight: 0.5
        });

        // Directories trigger loadContext
        expect(builderMock.loadContext).toHaveBeenCalledWith(directories, { weight: 0.5 });

        // Free-form context and log context should be appended
        expect(builderMock.addContext).toHaveBeenCalledWith(context, {
            title: 'User Context',
            weight: 1.0
        });
        expect(builderMock.addContext).toHaveBeenCalledWith(logContext, {
            title: 'Log Context',
            weight: 0.5
        });
    });
});
