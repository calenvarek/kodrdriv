import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { ExitError } from '../../src/error/ExitError';
import { DEFAULT_GIT_COMMAND_MAX_BUFFER } from '../../src/constants';

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

            expect(run.run).toHaveBeenCalledWith('git diff --cached -- . \':(exclude)whatever\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockDiff);
        });

        it('should create diff instance and get content successfully without cached option', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({ cached: false, excludedPatterns: ['whatever'] });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff -- . \':(exclude)whatever\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
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

            expect(run.run).toHaveBeenCalledWith('git diff abc123..def456 -- . \':(exclude)test\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
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

            expect(run.run).toHaveBeenCalledWith('git diff abc123 -- . \':(exclude)test\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
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

            expect(run.run).toHaveBeenCalledWith('git diff def456 -- . \':(exclude)test\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
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

            expect(run.run).toHaveBeenCalledWith('git diff --cached abc123..def456 -- . \':(exclude)test\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
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

            expect(run.run).toHaveBeenCalledWith('git diff -- . \':(exclude)*.log\' \':(exclude)*.tmp\' \':(exclude)node_modules/*\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
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

            expect(run.run).toHaveBeenCalledWith('git diff -- . ', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockDiff);
        });

        it('should handle stderr output', async () => {
            const mockDiff = 'mock diff content';
            const mockStderr = 'warning message';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: mockStderr });

            const diff = await Diff.create({ cached: true, excludedPatterns: ['whatever'] });
            const result = await diff.get();

            expect(run.run).toHaveBeenCalledWith('git diff --cached -- . \':(exclude)whatever\'', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockDiff);
            expect(getLogger.getLogger().warn).toHaveBeenCalledWith('Git diff produced stderr: %s', mockStderr);
        });

        it('should handle git diff execution error', async () => {
            const mockError = new Error('git diff failed');
            run.run.mockRejectedValue(mockError);

            const diff = await Diff.create({ cached: false, excludedPatterns: ['whatever'] });

            await expect(diff.get()).rejects.toThrow(ExitError);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Failed to execute git diff: %s', 'git diff failed');
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Error occurred during gather change phase: %s %s', 'git diff failed', expect.any(String));
        });

        it('should call verbose and debug logging methods', async () => {
            const mockDiff = 'mock diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            const diff = await Diff.create({ cached: false, excludedPatterns: ['test'] });
            await diff.get();

            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('Gathering change information from Git');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith('Executing git diff');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith('Git diff output: %s', mockDiff);
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

    describe('getReviewExcludedPatterns', () => {
        it('should combine base patterns with review specific exclusions', () => {
            const basePatterns = ['*.test.js', 'temp/*'];
            const result = Diff.getReviewExcludedPatterns(basePatterns);

            expect(result).toContain('*.test.js');
            expect(result).toContain('temp/*');
            expect(result).toContain('*lock*');
            expect(result).toContain('*.png');
            expect(result).toContain('*.mp4');
            expect(result).toContain('*.zip');
            expect(result).toContain('*.exe');
            expect(result).toContain('*.db');
            expect(result).toContain('*.map');
            expect(result).toContain('*.pdf');
            expect(result).toContain('.DS_Store');
            expect(result).toContain('*.pem');
            expect(result).toContain('tsconfig.tsbuildinfo');
        });

        it('should remove duplicate patterns', () => {
            const basePatterns = ['*.png', '*.lock', '.DS_Store'];
            const result = Diff.getReviewExcludedPatterns(basePatterns);

            const pngCount = result.filter((pattern: string) => pattern === '*.png').length;
            const lockCount = result.filter((pattern: string) => pattern === '*.lock').length;
            const dsStoreCount = result.filter((pattern: string) => pattern === '.DS_Store').length;

            expect(pngCount).toBe(1);
            expect(lockCount).toBe(1);
            expect(dsStoreCount).toBe(1);
        });

        it('should handle empty base patterns', () => {
            const basePatterns: string[] = [];
            const result = Diff.getReviewExcludedPatterns(basePatterns);

            expect(result.length).toBeGreaterThan(0);
            expect(result).toContain('*lock*');
            expect(result).toContain('*.png');
            expect(result).toContain('*.mp4');
        });

        it('should include all expected review exclusion categories', () => {
            const basePatterns: string[] = [];
            const result = Diff.getReviewExcludedPatterns(basePatterns);

            // Lock files
            expect(result).not.toContain('pnpm-lock.yaml');
            expect(result).toContain('package-lock.json');
            expect(result).toContain('yarn.lock');

            // Image files
            expect(result).toContain('*.jpg');
            expect(result).toContain('*.gif');
            expect(result).toContain('*.svg');

            // Video/audio files
            expect(result).toContain('*.mp4');
            expect(result).toContain('*.mp3');

            // Archives
            expect(result).toContain('*.zip');
            expect(result).toContain('*.tar.gz');

            // Binaries
            expect(result).toContain('*.exe');
            expect(result).toContain('*.dll');

            // Database files
            expect(result).toContain('*.sqlite');

            // Generated files
            expect(result).toContain('*.min.js');
            expect(result).toContain('bundle.*');

            // Documents
            expect(result).toContain('*.pdf');
            expect(result).toContain('*.doc');

            // System files
            expect(result).toContain('Thumbs.db');
            expect(result).toContain('*.tmp');

            // Security files
            expect(result).toContain('*.crt');
            expect(result).toContain('*.key');

            // Cache files
            expect(result).toContain('.eslintcache');
            expect(result).toContain('*.cache');
        });
    });

    describe('truncateLargeDiff', () => {
        it('should return original content when under max length', () => {
            const shortContent = 'This is a short diff\n+ added line\n- removed line';
            const result = Diff.truncateLargeDiff(shortContent, 1000);

            expect(result).toBe(shortContent);
        });

        it('should truncate content when over max length', () => {
            const longContent = 'line1\n'.repeat(1000);
            const result = Diff.truncateLargeDiff(longContent, 100);

            expect(result.length).toBeLessThan(longContent.length);
            expect(result).toContain('... [TRUNCATED:');
            expect(result).toContain(`Original diff was ${longContent.length} characters`);
        });

        it('should preserve line structure when truncating', () => {
            const content = 'line1\nline2\nline3\nline4\nline5';
            const result = Diff.truncateLargeDiff(content, 15);

            const lines = result.split('\n');
            expect(lines[0]).toBe('line1');
            expect(lines[1]).toBe('line2');
            expect(lines[lines.length - 1]).toContain('... [TRUNCATED:');
        });

        it('should use default max length when not specified', () => {
            const longContent = 'x'.repeat(6000);
            const result = Diff.truncateLargeDiff(longContent);

            expect(result.length).toBeLessThan(longContent.length);
            expect(result).toContain('... [TRUNCATED:');
        });

        it('should handle empty content', () => {
            const result = Diff.truncateLargeDiff('');

            expect(result).toBe('');
        });

        it('should handle single line content', () => {
            const singleLine = 'x'.repeat(100);
            const result = Diff.truncateLargeDiff(singleLine, 50);

            expect(result).toContain('... [TRUNCATED:');
            expect(result.split('\n').length).toBeGreaterThan(1);
        });

        it('should show correct character counts in truncation message', () => {
            const content = 'x'.repeat(200);
            const result = Diff.truncateLargeDiff(content, 100);

            expect(result).toContain(`Original diff was ${content.length} characters`);
            expect(result).toContain('showing first');
        });
    });

    describe('getRecentDiffsForReview', () => {
        it('should return empty string when no diffs are available', async () => {
            run.run.mockRejectedValue(new Error('no commits'));

            const result = await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(result).toBe('');
        });

        it('should return formatted diffs for recent commits', async () => {
            const mockDiff1 = 'diff --git a/file1.js b/file1.js\n+ added line 1';
            const mockDiff2 = 'diff --git a/file2.js b/file2.js\n+ added line 2';

            run.run
                .mockResolvedValueOnce({ stdout: mockDiff1, stderr: '' })
                .mockResolvedValueOnce({ stdout: mockDiff2, stderr: '' })
                .mockRejectedValueOnce(new Error('no more commits'));

            const result = await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(result).toContain('[Recent Diff 1 (HEAD~1)]');
            expect(result).toContain(mockDiff1);
            expect(result).toContain('[Recent Diff 2 (HEAD~2..HEAD~1)]');
            expect(result).toContain(mockDiff2);
        });

        it('should use custom limit for number of diffs', async () => {
            const mockDiff = 'diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            await Diff.getRecentDiffsForReview({
                limit: 2,
                baseExcludedPatterns: ['*.test.js']
            });

            expect(run.run).toHaveBeenCalledTimes(2);
        });

        it('should use default limit when not specified', async () => {
            const mockDiff = 'diff content';
            run.run.mockResolvedValue({ stdout: mockDiff, stderr: '' });

            await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(run.run).toHaveBeenCalledTimes(5); // default limit
        });

        it('should skip empty diffs', async () => {
            run.run
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: 'actual diff content', stderr: '' })
                .mockRejectedValueOnce(new Error('no more commits'));

            const result = await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(result).toContain('[Recent Diff 2');
            expect(result).toContain('actual diff content');
            expect(result).not.toContain('[Recent Diff 1');
        });

        it('should truncate large diffs', async () => {
            const largeDiff = 'x'.repeat(10000);
            run.run
                .mockResolvedValueOnce({ stdout: largeDiff, stderr: '' })
                .mockRejectedValueOnce(new Error('no more commits'));

            const result = await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(result).toContain('... [TRUNCATED:');
            expect(result.length).toBeLessThan(largeDiff.length);
        });

        it('should use enhanced exclusion patterns', async () => {
            const mockDiff = 'diff content';
            run.run
                .mockResolvedValueOnce({ stdout: mockDiff, stderr: '' })
                .mockRejectedValueOnce(new Error('no more commits'));

            await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            const createCall = run.run.mock.calls[0][0];
            expect(createCall).toContain(':(exclude)*.test.js');
            expect(createCall).toContain(':(exclude)*lock*');
            expect(createCall).toContain(':(exclude)*.png');
        });

        it('should log debug information about exclusions and diffs', async () => {
            const mockDiff = 'diff content';
            run.run
                .mockResolvedValueOnce({ stdout: mockDiff, stderr: '' })
                .mockRejectedValueOnce(new Error('no more commits'));

            await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Using %d exclusion patterns for diff context (including %d review specific)',
                expect.any(Number),
                expect.any(Number)
            );
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Sample exclusions: %s',
                expect.any(String)
            );
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Added diff %d to context (%d characters)',
                expect.any(Number),
                expect.any(Number)
            );
        });

        it('should handle whitespace-only diffs', async () => {
            run.run
                .mockResolvedValueOnce({ stdout: '   \n\n   ', stderr: '' })
                .mockRejectedValueOnce(new Error('no more commits'));

            const result = await Diff.getRecentDiffsForReview({
                baseExcludedPatterns: ['*.test.js']
            });

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Diff %d was empty after exclusions',
                1
            );
        });
    });
});
