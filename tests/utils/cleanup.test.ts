import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import * as cleanup from '../../src/utils/cleanup';
import * as gitTools from '@eldrforge/git-tools';

vi.mock('fs/promises', async () => {
    const actual = await vi.importActual<typeof import('fs/promises')>('fs/promises');
    return {
        ...actual,
        default: {
            rm: vi.fn(),
            rename: vi.fn(),
        },
        rm: vi.fn(),
        rename: vi.fn(),
    };
});

vi.mock('@eldrforge/git-tools');

describe('cleanup utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('cleanDirectory', () => {
        it('should successfully delete directory on first try', async () => {
            vi.mocked(fs.rm).mockResolvedValue(undefined);

            const result = await cleanup.cleanDirectory('dist');

            expect(result.success).toBe(true);
            expect(result.movedToBackup).toBeUndefined();
            expect(fs.rm).toHaveBeenCalledWith('dist', expect.objectContaining({
                recursive: true,
                force: true,
            }));
        });

        it('should return success if directory does not exist', async () => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            vi.mocked(fs.rm).mockRejectedValue(error);

            const result = await cleanup.cleanDirectory('dist');

            expect(result.success).toBe(true);
        });

        it('should retry on failure', async () => {
            vi.mocked(fs.rm)
                .mockRejectedValueOnce(new Error('EBUSY'))
                .mockRejectedValueOnce(new Error('EBUSY'))
                .mockResolvedValueOnce(undefined);

            const result = await cleanup.cleanDirectory('dist', { retryDelay: 10 });

            expect(result.success).toBe(true);
            expect(fs.rm).toHaveBeenCalledTimes(3);
        });

        it('should move to backup if deletion fails after retries', async () => {
            vi.mocked(fs.rm).mockRejectedValue(new Error('EBUSY'));
            vi.mocked(fs.rename).mockResolvedValue(undefined);

            const result = await cleanup.cleanDirectory('dist', {
                maxRetries: 2,
                retryDelay: 10,
                moveToBackup: true,
            });

            expect(result.success).toBe(true);
            expect(result.movedToBackup).toMatch(/^dist\.backup\.\d+$/);
            expect(fs.rename).toHaveBeenCalled();
        });

        it('should fail if both deletion and move fail', async () => {
            vi.mocked(fs.rm).mockRejectedValue(new Error('EBUSY'));
            vi.mocked(fs.rename).mockRejectedValue(new Error('EPERM'));

            const result = await cleanup.cleanDirectory('dist', {
                maxRetries: 1,
                retryDelay: 10,
                moveToBackup: true,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        it('should not move to backup if moveToBackup is false', async () => {
            vi.mocked(fs.rm).mockRejectedValue(new Error('EBUSY'));

            const result = await cleanup.cleanDirectory('dist', {
                maxRetries: 1,
                retryDelay: 10,
                moveToBackup: false,
            });

            expect(result.success).toBe(false);
            expect(fs.rename).not.toHaveBeenCalled();
        });
    });

    describe('checkProcessesUsingDirectory', () => {
        it('should return empty array on Windows', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'win32' });

            const result = await cleanup.checkProcessesUsingDirectory('dist');

            expect(result).toEqual([]);

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should return process list on Unix', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            vi.mocked(gitTools.run).mockResolvedValue({
                stdout: 'COMMAND    PID\nnode    1234\nnode    5678\n',
                stderr: '',
            });

            const result = await cleanup.checkProcessesUsingDirectory('dist');

            expect(result).toHaveLength(2);
            expect(result[0]).toBe('node    1234');
            expect(result[1]).toBe('node    5678');

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should return empty array if lsof fails', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            vi.mocked(gitTools.run).mockResolvedValue({
                stdout: '',
                stderr: '',
            });

            const result = await cleanup.checkProcessesUsingDirectory('dist');

            expect(result).toEqual([]);

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });
    });

    describe('cleanDist', () => {
        it('should clean dist directory successfully', async () => {
            vi.mocked(gitTools.run).mockResolvedValue({ stdout: '', stderr: '' });
            vi.mocked(fs.rm).mockResolvedValue(undefined);

            await expect(cleanup.cleanDist()).resolves.not.toThrow();

            expect(fs.rm).toHaveBeenCalledWith('dist', expect.anything());
        });

        it('should throw if cleanup fails', async () => {
            vi.mocked(gitTools.run).mockResolvedValue({ stdout: '', stderr: '' });
            vi.mocked(fs.rm).mockRejectedValue(new Error('EBUSY'));
            vi.mocked(fs.rename).mockRejectedValue(new Error('EPERM'));

            await expect(cleanup.cleanDist({ maxRetries: 1, moveToBackup: true }))
                .rejects.toThrow('Failed to clean dist');
        });

        it('should report processes using directory', async () => {
            const originalPlatform = process.platform;
            Object.defineProperty(process, 'platform', { value: 'darwin' });

            vi.mocked(gitTools.run).mockResolvedValue({
                stdout: 'COMMAND    PID\nnode    1234\n',
                stderr: '',
            });
            vi.mocked(fs.rm).mockResolvedValue(undefined);

            await cleanup.cleanDist();

            expect(gitTools.run).toHaveBeenCalledWith(expect.stringContaining('lsof'));

            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });
    });
});

