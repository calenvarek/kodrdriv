import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

import { Builder } from '@riotprompt/riotprompt';

// Path helpers
// (unused)

// System under test
import { createPrompt } from '../../src/prompt/review';
import { DEFAULT_PERSONA_YOU_FILE, DEFAULT_INSTRUCTIONS_REVIEW_FILE } from '../../src/constants';

// We will capture the mock builder instance so that assertions can access the individual mocked methods.
var mockBuilder: any;

// Mock the `@riotprompt/riotprompt` module so we can intercept builder calls without relying on the real implementation
vi.mock('@riotprompt/riotprompt', () => {
    const localBuilder = {
        addPersonaPath: vi.fn(async () => localBuilder),
        addInstructionPath: vi.fn(async () => localBuilder),
        addContent: vi.fn(async () => localBuilder),
        loadContext: vi.fn(async () => localBuilder),
        addContext: vi.fn(async () => localBuilder),
        build: vi.fn().mockResolvedValue('MOCK_PROMPT'),
    } as any;

    mockBuilder = localBuilder;

    return {
        Builder: {
            // `create` should return our mock builder instance
            create: vi.fn(() => localBuilder),
        },
    };
});

// Silence logger output that could pollute test results
vi.mock('../../src/logging', () => {
    return {
        getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    };
});

// Utility function to reset all mocks between tests
const resetMocks = () => {
    Object.values(mockBuilder).forEach((fn) => {
        if (typeof fn === 'function' && 'mockClear' in fn) {
            // @ts-ignore – we know mockClear exists on vitest mocked functions
            fn.mockClear();
        }
    });
};

beforeEach(() => {
    resetMocks();
});

afterEach(() => {
    resetMocks();
});

describe('createPrompt (review)', () => {
    test('builds a prompt with all optional contexts', async () => {
        const config = { overridePath: undefined, overrides: false } as const;
        const content = { notes: 'These are the review notes' } as const;
        const context = {
            logContext: 'git log output',
            diffContext: 'diff output',
            releaseNotesContext: 'release notes',
            issuesContext: 'github issues',
            context: 'extra context',
            directories: ['src', 'docs'],
        };

        const result = await createPrompt(config, content, context);

        // Ensure the mocked prompt instance is returned
        expect(result).toBe('MOCK_PROMPT');

        // Builder.create should have been called once
        // (No need to assert on logger/basePath details – just check invocation)
        expect((Builder.create as any).mock.calls.length).toBe(1);

        // Persona & instruction paths
        expect(mockBuilder.addPersonaPath).toHaveBeenCalledWith(DEFAULT_PERSONA_YOU_FILE);
        expect(mockBuilder.addInstructionPath).toHaveBeenCalledWith(DEFAULT_INSTRUCTIONS_REVIEW_FILE);

        // Required notes content
        expect(mockBuilder.addContent).toHaveBeenCalledWith('These are the review notes', {
            title: 'Review Notes',
            weight: 1.0,
        });

        // Directories are loaded as context
        expect(mockBuilder.loadContext).toHaveBeenCalledWith(['src', 'docs'], { weight: 0.5 });

        // Contexts with weight 0.5
        expect(mockBuilder.addContext).toHaveBeenCalledWith('git log output', {
            title: 'Log Context',
            weight: 0.5,
        });
        expect(mockBuilder.addContext).toHaveBeenCalledWith('diff output', {
            title: 'Diff Context',
            weight: 0.5,
        });
        expect(mockBuilder.addContext).toHaveBeenCalledWith('release notes', {
            title: 'Release Notes Context',
            weight: 0.5,
        });
        expect(mockBuilder.addContext).toHaveBeenCalledWith('github issues', {
            title: 'Issues Context',
            weight: 0.5,
        });

        // High-weight user context (1.0)
        expect(mockBuilder.addContext).toHaveBeenCalledWith('extra context', {
            title: 'User Context',
            weight: 1.0,
        });

        // Finally, build should be invoked once
        expect(mockBuilder.build).toHaveBeenCalledTimes(1);
    });

    test('skips optional contexts when not provided', async () => {
        const config = {} as any;
        const content = { notes: 'Minimal review notes' } as const;

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');

        // addContent should still be called for notes
        expect(mockBuilder.addContent).toHaveBeenCalledWith('Minimal review notes', {
            title: 'Review Notes',
            weight: 1.0,
        });

        // Optional methods should NOT be called
        expect(mockBuilder.loadContext).not.toHaveBeenCalled();

        // addContext should not have been called because we provided no optional contexts
        // But addContext might still be a mock; ensure zero invocations
        expect(mockBuilder.addContext).not.toHaveBeenCalled();

        // build must still be called once
        expect(mockBuilder.build).toHaveBeenCalledTimes(1);
    });
});
