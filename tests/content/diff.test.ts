import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { ExitError } from '../../src/error/ExitError';

// Mock ESM modules
vi.mock('../../src/util/child', () => ({
    // @ts-ignore
    run: vi.fn()
}));

vi.mock('../../src/logging', () => ({
    // @ts-ignore
    getLogger: vi.fn().mockReturnValue({
        verbose: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
    })
}));

describe('diff', () => {
    let Diff: any;
    let run: any;
    let getLogger: any;

    beforeEach(async () => {
        // Import modules after mocking
        run = await import('../../src/util/child');
        getLogger = await import('../../src/logging');
        Diff = await import('../../src/content/diff');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('create', () => {
        it('should create diff instance and get content successfully with cached option', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({ cached: true, excludedPatterns: ['whatever'] });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff --cached -- . \':(exclude)whatever\'');
            expect(result).toBe(mockDiff);
        });

        it('should create diff instance and get content successfully without cached option', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({ cached: false, excludedPatterns: ['whatever'] });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff -- . \':(exclude)whatever\'');
            expect(result).toBe(mockDiff);
        });

        it('should handle from and to parameters together', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({
                from: 'abc123',
                to: 'def456',
                cached: false,
                excludedPatterns: ['test']
            });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff abc123..def456 -- . \':(exclude)test\'');
            expect(result).toBe(mockDiff);
        });

        it('should handle from parameter only', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({
                from: 'abc123',
                cached: false,
                excludedPatterns: ['test']
            });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff abc123 -- . \':(exclude)test\'');
            expect(result).toBe(mockDiff);
        });

        it('should handle to parameter only', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({
                to: 'def456',
                cached: false,
                excludedPatterns: ['test']
            });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff def456 -- . \':(exclude)test\'');
            expect(result).toBe(mockDiff);
        });

        it('should handle cached option with from and to parameters', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({
                from: 'abc123',
                to: 'def456',
                cached: true,
                excludedPatterns: ['test']
            });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff --cached abc123..def456 -- . \':(exclude)test\'');
            expect(result).toBe(mockDiff);
        });

        it('should handle multiple excluded patterns', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({
                cached: false,
                excludedPatterns: ['*.log', '*.tmp', 'node_modules/*']
            });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff -- . \':(exclude)*.log\' \':(exclude)*.tmp\' \':(exclude)node_modules/*\'');
            expect(result).toBe(mockDiff);
        });

        it('should handle empty excluded patterns', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({
                cached: false,
                excludedPatterns: []
            });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff -- . ');
            expect(result).toBe(mockDiff);
        });

        it('should handle stderr output', async () => {
            const mockDiff = 'mock diff content';
            const mockStderr = 'warning message';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: mockStderr });

            const diff = await Diff.create({ cached: true, excludedPatterns: ['whatever'] });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff --cached -- . \':(exclude)whatever\'');
            expect(result).toBe(mockDiff);
            expect(getLogger.getLogger().warn).toHaveBeenCalledWith('Git log produced stderr: %s', mockStderr);
        });

        it('should handle git diff execution error', async () => {
            const mockError = new Error('git diff failed');
            run.run.mockRejectedValue(mockError);

            const diff = await Diff.create({ cached: false, excludedPatterns: ['whatever'] });

            await expect(diff.get()).rejects.toThrow(ExitError);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Failed to execute git log: %s', mockError.message);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Error occurred during gather change phase: %s %s', mockError.message, expect.any(String));
        });

        it('should call verbose and debug logging methods', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({ cached: false, excludedPatterns: ['test'] });
            await diff.get();

            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('Gathering change information from Git');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith('Executing git diff');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith('Git log output: %s', mockDiff);
        });
    });

    describe('hasStagedChanges', () => {
        it('should return false when there are no staged changes', async () => {
            run.run.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await Diff.hasStagedChanges();

            expect(run.run).toHaveBeenCalledWith('git diff --cached --quiet');
            expect(result).toBe(false);
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith('Checking for staged changes');
        });

        it('should return true when there are staged changes', async () => {
            const mockError = new Error('git diff command failed (non-zero exit)');
            run.run.mockRejectedValue(mockError);

            const result = await Diff.hasStagedChanges();

            expect(run.run).toHaveBeenCalledWith('git diff --cached --quiet');
            expect(result).toBe(true);
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith('Checking for staged changes');
        });

        it('should handle stderr output when checking staged changes', async () => {
            const mockStderr = 'warning message';
            run.run.mockResolvedValue({ stdout: '', stderr: mockStderr });

            const result = await Diff.hasStagedChanges();

            expect(run.run).toHaveBeenCalledWith('git diff --cached --quiet');
            expect(result).toBe(false);
            expect(getLogger.getLogger().warn).toHaveBeenCalledWith('Git diff produced stderr: %s', mockStderr);
        });
    });
});
