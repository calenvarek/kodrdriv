import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock ESM modules
vi.mock('@riotprompt/riotprompt', () => ({
    // @ts-ignore
    createSection: vi.fn().mockReturnValue({
        add: vi.fn()
    }),
    Model: {
        GPT_4: 'gpt-4'
    }
}));

vi.mock('../../src/prompt/prompts', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        // @ts-ignores
        createReleasePrompt: vi.fn().mockResolvedValue({}),
        format: vi.fn().mockReturnValue({ messages: [] })
    })
}));

vi.mock('../../src/content/log', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        // @ts-ignore
        get: vi.fn().mockResolvedValue('mock log content')
    })
}));

vi.mock('../../src/content/diff', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        get: vi.fn()
    }),
    hasStagedChanges: vi.fn()
}));

vi.mock('../../src/util/openai', () => ({
    // @ts-ignore
    createCompletion: vi.fn().mockResolvedValue({
        title: 'mock title',
        body: 'mock body'
    })
}));

describe('release command', () => {
    let Release: any;
    let MinorPrompt: any;
    let Prompts: any;
    let Log: any;
    let OpenAI: any;

    beforeEach(async () => {
        // Import modules after mocking
        MinorPrompt = await import('@riotprompt/riotprompt');
        Prompts = await import('../../src/prompt/prompts');
        Log = await import('../../src/content/log');
        OpenAI = await import('../../src/util/openai');
        Release = await import('../../src/commands/release');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should execute release command with default parameters', async () => {
        const runConfig = {
            model: 'gpt-4'
        };

        const result = await Release.execute(runConfig);

        expect(Log.create).toHaveBeenCalledWith({
            from: 'origin/HEAD',
            to: 'HEAD'
        });
        expect(Prompts.create).toHaveBeenCalledWith('gpt-4', runConfig);
        expect(OpenAI.createCompletion).toHaveBeenCalled();
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });

    it('should execute release command with custom parameters', async () => {
        const runConfig = {
            model: 'gpt-4',
            release: {
                from: 'v1.0.0',
                to: 'main'
            }
        };

        const result = await Release.execute(runConfig);

        expect(Log.create).toHaveBeenCalledWith({
            from: 'v1.0.0',
            to: 'main'
        });
        expect(Prompts.create).toHaveBeenCalledWith('gpt-4', runConfig);
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });
});
