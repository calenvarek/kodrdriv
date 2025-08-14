import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the `@riotprompt/riotprompt` module so we can intercept calls
vi.mock('@riotprompt/riotprompt', () => {
    const mockCook = vi.fn().mockResolvedValue('MOCK_PROMPT');
    const mockContext = vi.fn().mockImplementation(() => ({
        cook: mockCook
    }));
    const mockContent = vi.fn().mockImplementation(() => ({
        context: mockContext
    }));
    const mockOverrides = vi.fn().mockImplementation(() => ({
        content: mockContent
    }));
    const mockOverridePaths = vi.fn().mockImplementation(() => ({
        overrides: mockOverrides
    }));
    const mockInstructions = vi.fn().mockImplementation(() => ({
        overridePaths: mockOverridePaths
    }));
    const mockPersona = vi.fn().mockImplementation(() => ({
        instructions: mockInstructions
    }));
    const mockRecipe = vi.fn().mockImplementation(() => ({
        persona: mockPersona
    }));

    return {
        cook: mockCook,
        recipe: mockRecipe
    };
});

// Silence logger output that could pollute test results
vi.mock('../../src/logging', () => {
    return {
        getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
    };
});

// System under test
import { createPrompt, type Config, type Content, type Context } from '../../src/prompt/review';
import { recipe } from '@riotprompt/riotprompt';

// Get references to the mocked functions for testing
const mockRecipe = vi.mocked(recipe);

beforeEach(() => {
    vi.clearAllMocks();
});

afterEach(() => {
    vi.clearAllMocks();
});

describe('createPrompt (review)', () => {
    test('builds a prompt with all optional contexts', async () => {
        const config: Config = { overridePaths: ['/custom/path'], overrides: true };
        const content: Content = { notes: 'These are the review notes' };
        const context: Context = {
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

        // Verify the recipe chain was called correctly
        expect(mockRecipe).toHaveBeenCalledTimes(1);
        expect(mockRecipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });

    test('skips optional contexts when not provided', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Minimal review notes' };

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');

        // Verify the recipe chain was called with minimal context
        expect(mockRecipe).toHaveBeenCalledTimes(1);
        expect(mockRecipe).toHaveBeenCalledWith(expect.stringContaining('/prompt'));
    });

    test('handles empty notes content', async () => {
        const config: Config = {};
        const content: Content = { notes: '' };

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles partial context with only some optional fields', async () => {
        const config: Config = { overridePaths: ['/path1', '/path2'], overrides: false };
        const content: Content = { notes: 'Partial context test' };
        const context: Context = {
            logContext: 'only log context',
            diffContext: 'only diff context',
            // Other fields intentionally omitted
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles empty directories array', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with empty directories' };
        const context: Context = {
            directories: [],
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles single directory in array', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with single directory' };
        const context: Context = {
            directories: ['src'],
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles multiple directories in array', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with multiple directories' };
        const context: Context = {
            directories: ['src', 'docs', 'tests'],
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles undefined config properties', async () => {
        const config = { overridePaths: undefined, overrides: undefined } as Config;
        const content: Content = { notes: 'Test with undefined config' };

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles null config properties', async () => {
        const config = { overridePaths: null as any, overrides: null as any } as Config;
        const content: Content = { notes: 'Test with null config' };

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with only user context field', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with only user context' };
        const context: Context = {
            context: 'user provided context only',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with only issues context field', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with only issues context' };
        const context: Context = {
            issuesContext: 'github issues only',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with only release notes context field', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with only release notes context' };
        const context: Context = {
            releaseNotesContext: 'release notes only',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with only diff context field', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with only diff context' };
        const context: Context = {
            diffContext: 'diff only',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with only log context field', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with only log context' };
        const context: Context = {
            logContext: 'log only',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles empty string context values', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with empty context values' };
        const context: Context = {
            logContext: '',
            diffContext: '',
            releaseNotesContext: '',
            issuesContext: '',
            context: '',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles whitespace-only context values', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with whitespace context values' };
        const context: Context = {
            logContext: '   ',
            diffContext: '\t\n',
            context: '  \n  ',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles very long context values', async () => {
        const longString = 'a'.repeat(10000);
        const config: Config = {};
        const content: Content = { notes: 'Test with long context values' };
        const context: Context = {
            logContext: longString,
            diffContext: longString,
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles special characters in context values', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with special characters' };
        const context: Context = {
            logContext: 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?',
            diffContext: 'Unicode: 🚀🌟💻📝',
            context: 'Newlines:\nTabs:\tQuotes:"\'',
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles missing context parameter (uses default empty object)', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with no context parameter' };

        const result = await createPrompt(config, content);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with mixed truthy and falsy values', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with mixed context values' };
        const context: Context = {
            logContext: 'valid log',
            diffContext: '', // empty string
            releaseNotesContext: 'valid release notes',
            issuesContext: undefined as any, // undefined
            context: null as any, // null
            directories: ['src'], // valid array
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles context with only directories and no other fields', async () => {
        const config: Config = {};
        const content: Content = { notes: 'Test with only directories' };
        const context: Context = {
            directories: ['src', 'docs', 'tests'],
        };

        const result = await createPrompt(config, content, context);
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles config with empty overridePaths array', async () => {
        const config: Config = { overridePaths: [], overrides: true };
        const content: Content = { notes: 'Test with empty overridePaths' };

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');
    });

    test('handles config with multiple overridePaths', async () => {
        const config: Config = {
            overridePaths: ['/path1', '/path2', '/path3'],
            overrides: false
        };
        const content: Content = { notes: 'Test with multiple overridePaths' };

        const result = await createPrompt(config, content, {});
        expect(result).toBe('MOCK_PROMPT');
    });
});
