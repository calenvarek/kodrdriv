import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock ESM modules
vi.mock('@riotprompt/riotprompt', () => {
    const localBuilder: any = {
        addPersonaPath: vi.fn(async () => localBuilder),
        addInstructionPath: vi.fn(async () => localBuilder),
        addContent: vi.fn(async () => localBuilder),
        loadContext: vi.fn(async () => localBuilder),
        addContext: vi.fn(async () => localBuilder),
        build: vi.fn().mockResolvedValue('mock prompt')
    };

    return {
        // @ts-ignore
        createSection: vi.fn().mockReturnValue({
            add: vi.fn()
        }),
        Model: {
            GPT_4: 'gpt-4'
        },
        Formatter: {
            create: vi.fn().mockReturnValue({
                formatPrompt: vi.fn().mockReturnValue({ messages: [] })
            })
        },
        Builder: {
            create: vi.fn(() => localBuilder)
        }
    };
});

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
        Release = await import('../../src/prompt/release');
        Log = await import('../../src/content/log');
        OpenAI = await import('../../src/util/openai');
        // Import mocked prompts module for compatibility
        // @ts-ignore – module is mocked above, actual file is not required
        Prompts = await import('../../src/prompt/prompts');
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
        expect(OpenAI.createCompletion).toHaveBeenCalled();
        expect(result).toEqual({
            title: 'mock title',
            body: 'mock body'
        });
    });
});
