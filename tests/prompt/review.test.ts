import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the `@riotprompt/riotprompt` module so we can intercept calls
vi.mock('@riotprompt/riotprompt', () => {
    return {
        cook: vi.fn().mockResolvedValue('MOCK_PROMPT'),
        recipe: vi.fn().mockImplementation(() => ({
            persona: vi.fn().mockImplementation(() => ({
                instructions: vi.fn().mockImplementation(() => ({
                    overridePaths: vi.fn().mockImplementation(() => ({
                        overrides: vi.fn().mockImplementation(() => ({
                            content: vi.fn().mockImplementation(() => ({
                                context: vi.fn().mockImplementation(() => ({
                                    cook: vi.fn().mockResolvedValue('MOCK_PROMPT')
                                }))
                            }))
                        }))
                    }))
                }))
            }))
        }))
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
import { recipe } from '@riotprompt/riotprompt';

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

        // recipe should have been called once
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });

    test('skips optional contexts when not provided', async () => {
        const config = {} as any;
        const content = { notes: 'Minimal review notes' } as const;

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');

        // recipe should have been called with minimal context
        expect(recipe).toHaveBeenCalledTimes(1);
        expect(recipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });
});
