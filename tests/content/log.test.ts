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
});
