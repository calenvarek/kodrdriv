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

    it('should create log instance and get content successfully', async () => {
        const mockLog = 'mock log content';
        run.run.mockResolvedValue({ stdout: mockLog, stderr: '' });

        const log = await Log.create({
            from: 'from',
            to: 'to'
        });
        const result = await log.get();

        expect(run.run).toHaveBeenCalledWith('git log from..to');
        expect(result).toBe(mockLog);
    });

    it('should handle stderr output', async () => {
        const mockLog = 'mock log content';
        const mockStderr = 'warning message';
        run.run.mockResolvedValue({ stdout: mockLog, stderr: mockStderr });

        const log = await Log.create({ from: 'from', to: 'to' });
        const result = await log.get();

        expect(run.run).toHaveBeenCalledWith('git log from..to');
        expect(result).toBe(mockLog);
        expect(getLogger.getLogger().warn).toHaveBeenCalledWith('Git log produced stderr: %s', mockStderr);
    });

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
});
