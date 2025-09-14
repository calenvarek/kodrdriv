import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';
import { ExitError } from '../../src/error/ExitError';
import { DEFAULT_GIT_COMMAND_MAX_BUFFER } from '../../src/constants';

// Mock ESM modules
vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
    runSecure: vi.fn(),
    runSecureWithInheritedStdio: vi.fn(),
    runWithInheritedStdio: vi.fn(),
    runWithDryRunSupport: vi.fn(),
    runSecureWithDryRunSupport: vi.fn(),
    validateGitRef: vi.fn(),
    validateFilePath: vi.fn(),
    escapeShellArg: vi.fn(),
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

describe('log', () => {
    let Log: any;
    let run: any;
    let getLogger: any;

    beforeEach(async () => {
        // Import modules after mocking
        run = await import('../../src/util/child');
        getLogger = await import('../../src/logging');
        Log = await import('../../src/content/log');
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('basic functionality', () => {
        it('should create log instance and get content successfully', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'from',
                to: 'to'
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log from..to', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should handle stderr output', async () => {
            const mockLog = 'mock log content';
            const mockStderr = 'warning message';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: mockStderr });

            const log = await Log.create({ from: 'from', to: 'to' });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log from..to', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
            expect(getLogger.getLogger().warn).toHaveBeenCalledWith('Git log produced stderr: %s', mockStderr);
        });
    });

    describe('range options', () => {
        it('should handle only from option', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({ from: 'abc123' });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log abc123', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should handle only to option', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({ to: 'develop' });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log develop', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should handle no range options (show all)', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({});
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });
    });

    describe('currentBranchOnly option', () => {
        it('should use currentBranchOnly with default main branch', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({ currentBranchOnly: true });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log main..HEAD', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should use currentBranchOnly with custom to branch', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                currentBranchOnly: true,
                to: 'develop'
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log develop..HEAD', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should prioritize currentBranchOnly over from/to combination', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                currentBranchOnly: true,
                from: 'feature-branch',
                to: 'develop'
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log develop..HEAD', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });
    });

    describe('limit option', () => {
        it('should apply limit when limit is positive', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'from',
                to: 'to',
                limit: 10
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log from..to -n 10', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should not apply limit when limit is zero', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'from',
                to: 'to',
                limit: 0
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log from..to', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should not apply limit when limit is negative', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'from',
                to: 'to',
                limit: -5
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log from..to', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should apply limit with currentBranchOnly', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                currentBranchOnly: true,
                to: 'develop',
                limit: 5
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log develop..HEAD -n 5', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should apply limit with no range', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({ limit: 3 });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log -n 3', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });
    });

    describe('logging behavior', () => {
        it('should call logger methods correctly', async () => {
            const mockLog = 'mock log content';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({ from: 'from', to: 'to' });
            await log.get();

            const logger = getLogger.getLogger();
            expect(logger.verbose).toHaveBeenCalledWith('Gathering change information from Git');
            expect(logger.debug).toHaveBeenCalledWith('Executing git log');
            expect(logger.debug).toHaveBeenCalledWith('Git log command: %s', 'git log from..to');
            expect(logger.debug).toHaveBeenCalledWith('Git log output: %s', mockLog);
        });
    });

    describe('error handling', () => {
        it('should handle git log execution error', async () => {
            const mockError = new Error('git log failed');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'from', to: 'to' });

            await expect(log.get()).rejects.toThrow(ExitError);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Failed to execute git log: %s', mockError.message);
        });

        it('should handle general error during gather change phase', async () => {
            const mockError = new Error('general error');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({
                from: 'from',
                to: 'to'
            });

            await expect(log.get()).rejects.toThrow(ExitError);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith(
                'Error occurred during gather change phase: %s %s',
                mockError.message,
                mockError.stack
            );
        });

        it('should throw ExitError with correct message', async () => {
            const mockError = new Error('git log failed');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'from', to: 'to' });

            await expect(log.get()).rejects.toThrow('Error occurred during gather change phase');
        });
    });

    describe('empty repository handling', () => {
        it('should return empty string for "does not have any commits yet" error', async () => {
            const mockError = new Error('fatal: your current branch \'main\' does not have any commits yet');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'main', to: 'HEAD' });
            const result = await log.get();

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('No git history available, returning empty log context');
        });

        it('should return empty string for "bad default revision" error', async () => {
            const mockError = new Error('fatal: bad default revision \'HEAD\'');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ currentBranchOnly: true });
            const result = await log.get();

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('No git history available, returning empty log context');
        });

        it('should return empty string for "unknown revision or path" error', async () => {
            const mockError = new Error('fatal: unknown revision or path not in the working tree');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'nonexistent-branch' });
            const result = await log.get();

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('No git history available, returning empty log context');
        });

        it('should return empty string for "ambiguous argument HEAD" error', async () => {
            const mockError = new Error('fatal: ambiguous argument \'HEAD\': unknown revision or path not in the working tree');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ to: 'HEAD' });
            const result = await log.get();

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('No git history available, returning empty log context');
        });

        it('should have consistent empty repo detection logic in both catch blocks', async () => {
            // This test verifies that the empty repository detection logic is implemented
            // consistently between the inner and outer try-catch blocks
            const mockError = new Error('fatal: your current branch \'main\' does not have any commits yet');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'main' });
            const result = await log.get();

            expect(result).toBe('');
            // Verify the empty repo detection works (this tests the inner catch primarily)
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
            expect(getLogger.getLogger().verbose).toHaveBeenCalledWith('No git history available, returning empty log context');
        });

        it('should handle multiple empty repo error patterns in a single message', async () => {
            const mockError = new Error('fatal: bad default revision \'HEAD\': unknown revision or path not in the working tree');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({});
            const result = await log.get();

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
        });

        it('should handle empty repo errors with different options combinations', async () => {
            const mockError = new Error('fatal: your current branch \'develop\' does not have any commits yet');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({
                currentBranchOnly: true,
                to: 'develop',
                limit: 5
            });
            const result = await log.get();

            expect(result).toBe('');
            expect(getLogger.getLogger().debug).toHaveBeenCalledWith(
                'Empty repository detected (no commits): %s',
                mockError.message
            );
            // Verify the correct git command was attempted before the error
            expect(run.run).toHaveBeenCalledWith('git log develop..HEAD -n 5', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
        });

        it('should not treat regular git errors as empty repo', async () => {
            const mockError = new Error('fatal: not a git repository');
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'main' });

            await expect(log.get()).rejects.toThrow(ExitError);
            // Should not call the empty repo debug messages
            expect(getLogger.getLogger().debug).not.toHaveBeenCalledWith(
                expect.stringContaining('Empty repository detected')
            );
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Failed to execute git log: %s', mockError.message);
        });

        it('should handle error with undefined message', async () => {
            const mockError = new Error();
            mockError.message = undefined as any;
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'main' });

            await expect(log.get()).rejects.toThrow(ExitError);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Failed to execute git log: %s', undefined);
        });

        it('should handle error with null message', async () => {
            const mockError = new Error();
            (mockError as any).message = null;
            run.run.mockRejectedValue(mockError);

            const log = await Log.create({ from: 'main' });

            await expect(log.get()).rejects.toThrow(ExitError);
            expect(getLogger.getLogger().error).toHaveBeenCalledWith('Failed to execute git log: %s', null);
        });
    });

    describe('comprehensive option combinations', () => {
        it('should handle all options together (non-currentBranchOnly)', async () => {
            const mockLog = 'comprehensive log output';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'feature-branch',
                to: 'main',
                limit: 25,
                currentBranchOnly: false
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log feature-branch..main -n 25', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should handle edge case with limit of 1', async () => {
            const mockLog = 'single commit log';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({ limit: 1 });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log -n 1', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should handle very large limit', async () => {
            const mockLog = 'large log output';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'start',
                to: 'end',
                limit: 9999
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log start..end -n 9999', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });

        it('should handle special characters in branch names', async () => {
            const mockLog = 'special branch log';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

            const log = await Log.create({
                from: 'feature/special-chars_123',
                to: 'release/v1.0.0'
            });
            const result = await log.get();

            expect(run.run).toHaveBeenCalledWith('git log feature/special-chars_123..release/v1.0.0', { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
            expect(result).toBe(mockLog);
        });
    });

    describe('return value validation', () => {
        it('should return exact stdout content including whitespace', async () => {
            const mockLogWithWhitespace = '  commit abc123  \n\n  Author: Test User  \n';
            run.run.mockResolvedValue({ stdout: mockLogWithWhitespace, stderr: '' });

            const log = await Log.create({});
            const result = await log.get();

            expect(result).toBe(mockLogWithWhitespace);
            expect(result).toEqual(expect.stringContaining('  commit abc123  \n\n  Author: Test User  \n'));
        });

        it('should return empty string when git log returns empty stdout', async () => {
            run.run.mockResolvedValue({ stdout: '', stderr: '' });

            const log = await Log.create({ from: 'branch1', to: 'branch2' });
            const result = await log.get();

            expect(result).toBe('');
        });

        it('should handle multiline stderr while returning stdout', async () => {
            const mockLog = 'log content';
            const mockStderr = 'warning line 1\nwarning line 2\ninfo line 3';
            run.run.mockResolvedValue({ stdout: mockLog, stderr: mockStderr });

            const log = await Log.create({ from: 'main' });
            const result = await log.get();

            expect(result).toBe(mockLog);
            expect(getLogger.getLogger().warn).toHaveBeenCalledWith('Git log produced stderr: %s', mockStderr);
        });
    });
});
