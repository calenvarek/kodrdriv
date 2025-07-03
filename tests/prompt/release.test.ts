import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Create a shared mock builder instance that we can inspect in our tests
const builderMock: any = {};

// Mock the RiotPrompt Builder factory & instance methods
vi.mock('@riotprompt/riotprompt', () => {
    return {
        // Mocked Builder namespace with a create factory
        Builder: {
            // The factory returns our shared builderMock instance each time
            create: vi.fn(() => builderMock),
        }
    };
});

// Mock the project logger so the real implementation is not invoked
vi.mock('../../src/logging', () => ({
    // @ts-ignore – we purposefully loosen the shape for testing
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn(),
    }))
}));

// Import constants so we can assert correct paths are forwarded
import * as Constants from '../../src/constants';

// Import the module under test AFTER mocks are in place
import * as ReleasePrompt from '../../src/prompt/release';

describe('prompt/release.createPrompt', () => {
    // Re-initialise builder method mocks before every test so we start clean
    beforeEach(() => {
        builderMock.addPersonaPath = vi.fn().mockResolvedValue(builderMock);
        builderMock.addInstructionPath = vi.fn().mockResolvedValue(builderMock);
        builderMock.addContent = vi.fn().mockResolvedValue(builderMock);
        builderMock.loadContext = vi.fn().mockResolvedValue(builderMock);
        builderMock.addContext = vi.fn().mockResolvedValue(builderMock);
        builderMock.build = vi.fn().mockResolvedValue('mock-prompt');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('builds a prompt with release focus, context and directories when provided', async () => {
        const config = { overridePath: '/custom', overrides: true };
        const content = { logContent: 'log', diffContent: 'diff' };
        const ctx = { releaseFocus: 'focus', context: 'additional', directories: ['src'] };

        const prompt = await ReleasePrompt.createPrompt(config, content, ctx);

        // Ensure we got the value returned from builder.build()
        expect(prompt).toBe('mock-prompt');

        // Builder factory should have been invoked with override info
        const { Builder } = await import('@riotprompt/riotprompt');
        expect(Builder.create).toHaveBeenCalledWith(expect.objectContaining({
            overridePath: '/custom',
            overrides: true,
        }));

        // Persona & instruction paths should come from constants
        expect(builderMock.addPersonaPath).toHaveBeenCalledWith(Constants.DEFAULT_PERSONA_RELEASER_FILE);
        expect(builderMock.addInstructionPath).toHaveBeenCalledWith(Constants.DEFAULT_INSTRUCTIONS_RELEASE_FILE);

        // Release focus should be included with highest weight
        expect(builderMock.addContent).toHaveBeenCalledWith('focus', { title: 'Release Focus', weight: 1.0 });
        // Log and diff are always included
        expect(builderMock.addContent).toHaveBeenCalledWith('log', { title: 'Log', weight: 0.5 });
        expect(builderMock.addContent).toHaveBeenCalledWith('diff', { title: 'Diff', weight: 0.5 });

        // Directories and user context should be forwarded correctly
        expect(builderMock.loadContext).toHaveBeenCalledWith(['src'], { weight: 0.5 });
        expect(builderMock.addContext).toHaveBeenCalledWith('additional', { title: 'User Context', weight: 1.0 });

        // Finally, build must be executed
        expect(builderMock.build).toHaveBeenCalled();
    });

    it('builds a prompt with only mandatory content when optional params are omitted', async () => {
        const config = {} as any;
        const content = { logContent: 'log', diffContent: 'diff' };

        const prompt = await ReleasePrompt.createPrompt(config, content);

        expect(prompt).toBe('mock-prompt');

        // addContent should have been called exactly twice (log + diff)
        expect(builderMock.addContent).toHaveBeenCalledTimes(2);
        expect(builderMock.addContent).toHaveBeenCalledWith('log', { title: 'Log', weight: 0.5 });
        expect(builderMock.addContent).toHaveBeenCalledWith('diff', { title: 'Diff', weight: 0.5 });

        // No release focus, directories or user context provided
        expect(builderMock.loadContext).not.toHaveBeenCalled();
        expect(builderMock.addContext).not.toHaveBeenCalled();

        // Persona & instruction paths still required
        expect(builderMock.addPersonaPath).toHaveBeenCalledWith(Constants.DEFAULT_PERSONA_RELEASER_FILE);
        expect(builderMock.addInstructionPath).toHaveBeenCalledWith(Constants.DEFAULT_INSTRUCTIONS_RELEASE_FILE);
    });
});
