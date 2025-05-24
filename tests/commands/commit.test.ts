import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock ESM modules
vi.mock('../../src/logging', () => ({
    // @ts-ignore
    getLogger: vi.fn().mockReturnValue({
        debug: vi.fn(),
        info: vi.fn(),
        error: vi.fn()
    })
}));

vi.mock('../../src/prompt/prompts', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        createCommitPrompt: vi.fn(),
        format: vi.fn()
    })
}));

vi.mock('../../src/content/diff', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        get: vi.fn()
    }),
    hasStagedChanges: vi.fn()
}));

vi.mock('../../src/util/child', () => ({
    // @ts-ignore
    run: vi.fn()
}));

vi.mock('../../src/util/openai', () => ({
    // @ts-ignore
    createCompletion: vi.fn()
}));

vi.mock('@riotprompt/riotprompt', () => ({
    // @ts-ignore
    createSection: vi.fn().mockReturnValue({
        add: vi.fn()
    })
}));

describe('commit', () => {
    let Commit: any;
    let Logging: any;
    let Prompts: any;
    let Diff: any;
    let Child: any;
    let OpenAI: any;
    let MinorPrompt: any;

    beforeEach(async () => {
        // Import modules after mocking
        Logging = await import('../../src/logging');
        Prompts = await import('../../src/prompt/prompts');
        Diff = await import('../../src/content/diff');
        Child = await import('../../src/util/child');
        OpenAI = await import('../../src/util/openai');
        MinorPrompt = await import('@riotprompt/riotprompt');
        Commit = await import('../../src/commands/commit');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should execute commit with cached changes', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                sendit: false
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockPrompt = 'mock prompt';
        const mockRequest = { messages: [] };
        const mockSummary = 'test: add new feature';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        // @ts-ignore
        Prompts.create.mockReturnValue({
            // @ts-ignore
            createCommitPrompt: vi.fn().mockResolvedValue(mockPrompt),
            // @ts-ignore
            format: vi.fn().mockReturnValue(mockRequest)
        });
        // @ts-ignore
        OpenAI.createCompletion.mockResolvedValue(mockSummary);

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(result).toBe(mockSummary);
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'] });
        expect(OpenAI.createCompletion).toHaveBeenCalled();
    });

    it('should check for staged changes when cached is undefined', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: undefined,
                sendit: false
            }
        };
        const mockDiffContent = 'mock diff content';

        Diff.hasStagedChanges.mockResolvedValue(true);
        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletion.mockResolvedValue('test commit');

        // Act
        await Commit.execute(mockConfig);

        // Assert
        expect(Diff.hasStagedChanges).toHaveBeenCalled();
        expect(Diff.create).toHaveBeenCalledWith({ cached: true, excludedPatterns: ['node_modules', 'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'bun.lockb', 'composer.lock', 'Cargo.lock', 'Gemfile.lock', 'dist', 'build', 'out', '.next', '.nuxt', 'coverage', '.vscode', '.idea', '.DS_Store', '.git', '.gitignore', 'logs', 'tmp', '.cache', '*.log', '.env', '.env.*', '*.pem', '*.crt', '*.key', '*.sqlite', '*.db', '*.zip', '*.tar', '*.gz', '*.exe', '*.bin'] });
    });

    it('should commit changes when sendit is true and changes are staged', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: true,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test: add new feature';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletion.mockResolvedValue(mockSummary);
        Child.run.mockResolvedValue({ stdout: 'Commit successful' });

        // Act
        const result = await Commit.execute(mockConfig);

        // Assert
        expect(result).toBe(mockSummary);
        expect(Child.run).toHaveBeenCalled();
        expect(Logging.getLogger().info).toHaveBeenCalled();
    });

    it('should exit with error when sendit is true but no changes staged', async () => {
        // Arrange
        const mockConfig = {
            model: 'gpt-3.5-turbo',
            commit: {
                cached: false,
                sendit: true
            }
        };
        const mockDiffContent = 'mock diff content';
        const mockSummary = 'test: add new feature';

        // @ts-ignore
        Diff.create.mockReturnValue({ get: vi.fn().mockResolvedValue(mockDiffContent) });
        OpenAI.createCompletion.mockResolvedValue(mockSummary);

        // Mock process.exit
        const mockExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
            throw new Error(`Process.exit called with code ${code}`);
        });

        // Act & Assert
        await expect(Commit.execute(mockConfig)).rejects.toThrow('Process.exit called with code 1');
        expect(Logging.getLogger().error).toHaveBeenCalled();

        // Cleanup
        mockExit.mockRestore();
    });
});
