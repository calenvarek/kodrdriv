import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
// Mock external dependencies
vi.mock('@riotprompt/riotprompt', () => ({
    Builder: {
        create: vi.fn(),
    },
    Formatter: {
        create: vi.fn(),
    },
}));

vi.mock(import("path"), async (importOriginal) => {
    const actual = await importOriginal()
    return {
        ...actual,
        dirname: vi.fn().mockReturnValue('/mock/dir'),
    }
});

vi.mock('url', () => ({
    fileURLToPath: vi.fn().mockReturnValue('/mock/file'),
}));
vi.mock('../../src/constants', () => ({
    DEFAULT_PERSONA_COMMITTER_FILE: '/personas/committer.md',
    DEFAULT_PERSONA_RELEASER_FILE: '/personas/releaser.md',
    DEFAULT_INSTRUCTIONS_COMMIT_FILE: '/instructions/commit.md',
    DEFAULT_INSTRUCTIONS_RELEASE_FILE: '/instructions/release.md',
}));
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn() })),
}));

import { create } from '../../src/prompt/prompts';
import type { Model, Prompt, Request } from '@riotprompt/riotprompt';
import { truncate } from 'fs';

describe('prompts Factory', () => {
    let mockBuilder: any;
    let mockFormatter: any;
    let model: Model;
    let runConfig: any;
    let riotprompt: any;

    beforeEach(async () => {
        riotprompt = await import('@riotprompt/riotprompt');

        // Chainable async methods: return Promise.resolve(this)
        function chainable() { return Promise.resolve(mockBuilder); }
        mockBuilder = {
            addPersonaPath: vi.fn(chainable),
            addInstructionPath: vi.fn(chainable),
            addContent: vi.fn(chainable),
            loadContext: vi.fn(chainable),
            build: vi.fn().mockResolvedValue({ prompt: 'mockPrompt' }),
        };
        mockFormatter = {
            formatPrompt: vi.fn().mockReturnValue({ messages: ['msg'], model: 'gpt-4o-mini' }),
        };
        riotprompt.Builder.create.mockReturnValue(mockBuilder);
        riotprompt.Formatter.create.mockReturnValue(mockFormatter);
        model = 'gpt-4o-mini';
        runConfig = { configDirectory: '/mock/config', overrides: false };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('createCommitPrompt builds prompt with context and contextDirectories', async () => {
        runConfig.contextDirectories = ['/ctx1', '/ctx2'];
        const factory = create(model, runConfig);
        const result = await factory.createCommitPrompt('diff', 'log', 'user context');
        expect(mockBuilder.addPersonaPath).toHaveBeenCalledWith('/personas/committer.md');
        expect(mockBuilder.addInstructionPath).toHaveBeenCalledWith('/instructions/commit.md');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[User Context]\nuser context');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Diff]\ndiff');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Log]\nlog');
        expect(mockBuilder.loadContext).toHaveBeenCalledWith(['/ctx1', '/ctx2']);
        expect(mockBuilder.build).toHaveBeenCalled();
        expect(result).toEqual({ prompt: 'mockPrompt' });
    });

    it('createCommitPrompt builds prompt without context or contextDirectories', async () => {
        const factory = create(model, runConfig);
        const result = await factory.createCommitPrompt('diff', 'log');
        expect(mockBuilder.addPersonaPath).toHaveBeenCalledWith('/personas/committer.md');
        expect(mockBuilder.addInstructionPath).toHaveBeenCalledWith('/instructions/commit.md');
        // Check that no call to addContent contains '[User Context]'
        expect(mockBuilder.addContent.mock.calls.some(
            (args: any[]) => typeof args[0] === 'string' && args[0].includes('[User Context]')
        )).toBe(false);
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Diff]\ndiff');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Log]\nlog');
        expect(mockBuilder.loadContext).not.toHaveBeenCalled();
        expect(mockBuilder.build).toHaveBeenCalled();
        expect(result).toEqual({ prompt: 'mockPrompt' });
    });

    it('createReleasePrompt builds prompt with context and contextDirectories', async () => {
        runConfig.contextDirectories = ['/ctx1'];
        const factory = create(model, runConfig);
        const result = await factory.createReleasePrompt('release content', 'diff content', 'release context');
        expect(mockBuilder.addPersonaPath).toHaveBeenCalledWith('/personas/releaser.md');
        expect(mockBuilder.addInstructionPath).toHaveBeenCalledWith('/instructions/release.md');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[User Context]\nrelease context');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Log]\nrelease content');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Diff]\ndiff content');
        expect(mockBuilder.loadContext).toHaveBeenCalledWith(['/ctx1']);
        expect(mockBuilder.build).toHaveBeenCalled();
        expect(result).toEqual({ prompt: 'mockPrompt' });
    });

    it('createReleasePrompt builds prompt without context or contextDirectories', async () => {
        const factory = create(model, runConfig);
        const result = await factory.createReleasePrompt('log content', 'diff content', 'release context');
        expect(mockBuilder.addPersonaPath).toHaveBeenCalledWith('/personas/releaser.md');
        expect(mockBuilder.addInstructionPath).toHaveBeenCalledWith('/instructions/release.md');
        // Check that no call to addContent contains '[User Context]'
        expect(mockBuilder.addContent.mock.calls.some(
            (args: any[]) => typeof args[0] === 'string' && args[0].includes('[User Context]')
        )).toBe(true);
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Log]\nlog content');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[Diff]\ndiff content');
        expect(mockBuilder.addContent).toHaveBeenCalledWith('\n\n[User Context]\nrelease context');
        expect(mockBuilder.loadContext).not.toHaveBeenCalled();
        expect(mockBuilder.build).toHaveBeenCalled();
        expect(result).toEqual({ prompt: 'mockPrompt' });
    });

    it('format calls Formatter.create and formatPrompt', () => {
        const factory = create(model, runConfig);
        const prompt: Prompt = { instructions: {} as any };
        const result = factory.format(prompt);
        expect(mockFormatter.formatPrompt).toHaveBeenCalledWith(model, prompt);
        expect(result).toEqual({ messages: ['msg'], model: 'gpt-4o-mini' });
    });
});
