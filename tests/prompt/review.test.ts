import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the `@riotprompt/riotprompt` module so we can intercept calls
vi.mock('@riotprompt/riotprompt', () => {
    return {
        cook: vi.fn().mockResolvedValue('MOCK_PROMPT'),
    };
});

// Silence logger output that could pollute test results
vi.mock('../../src/logging', () => {
    return {
        getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    };
});

// System under test
import { createPrompt } from '../../src/prompt/review';
import { cook } from '@riotprompt/riotprompt';

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('createPrompt (review)', () => {
    test('builds a prompt with all optional contexts', async () => {
        const config = { overridePaths: ['/custom/path'], overrides: true };
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

        // cook should have been called once with the expected parameters
        expect(cook).toHaveBeenCalledTimes(1);
        expect(cook).toHaveBeenCalledWith({
            basePath: expect.stringContaining('/prompt'),
            overridePaths: ['/custom/path'],
            overrides: true,
            template: 'review',
            content: [
                { content: 'These are the review notes', title: 'Review Notes', weight: 1.0 }
            ],
            context: [
                { content: 'git log output', title: 'Log Context', weight: 0.5 },
                { content: 'diff output', title: 'Diff Context', weight: 0.5 },
                { content: 'release notes', title: 'Release Notes Context', weight: 0.5 },
                { content: 'github issues', title: 'Issues Context', weight: 0.5 },
                { content: 'extra context', title: 'User Context', weight: 1.0 },
                { directories: ['src', 'docs'], weight: 0.5 }
            ]
        });
    });

    test('skips optional contexts when not provided', async () => {
        const config = {} as any;
        const content = { notes: 'Minimal review notes' } as const;

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');

        // cook should have been called with minimal context
        expect(cook).toHaveBeenCalledTimes(1);
        expect(cook).toHaveBeenCalledWith({
            basePath: expect.stringContaining('/prompt'),
            overridePaths: [],
            overrides: false,
            template: 'review',
            content: [
                { content: 'Minimal review notes', title: 'Review Notes', weight: 1.0 }
            ],
            context: []
        });
    });
});
