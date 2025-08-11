import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the child module
vi.mock('../../src/util/child', () => ({
    run: vi.fn()
}));

// Mock the logging module
vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        verbose: vi.fn()
    }))
}));

import { isValidGitRef, getDefaultFromRef, getRemoteDefaultBranch } from '../../src/util/git';
import { run } from '../../src/util/child';

const mockRun = run as any;

describe('git utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('isValidGitRef', () => {
        it('should return true for valid git reference', async () => {
            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await isValidGitRef('origin/main');

            expect(result).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify origin/main >/dev/null 2>&1');
        });

        it('should return false for invalid git reference', async () => {
            mockRun.mockRejectedValue(new Error('fatal: bad revision'));

            const result = await isValidGitRef('invalid-ref');

            expect(result).toBe(false);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify invalid-ref >/dev/null 2>&1');
        });
    });

    describe('getDefaultFromRef', () => {
                it('should return main when it exists', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // main exists
                ;

            const result = await getDefaultFromRef();

            expect(result).toBe('main');
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify main >/dev/null 2>&1');
        });

                it('should fallback to master when main does not exist', async () => {
            mockRun
                .mockRejectedValueOnce(new Error('fatal: bad revision')) // main fails
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // master exists
                ;

            const result = await getDefaultFromRef();

            expect(result).toBe('master');
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify main >/dev/null 2>&1');
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify master >/dev/null 2>&1');
        });

                it('should fallback through all candidates until finding a valid one', async () => {
            mockRun
                .mockRejectedValueOnce(new Error('fatal: bad revision')) // main fails
                .mockRejectedValueOnce(new Error('fatal: bad revision')) // master fails
                .mockRejectedValueOnce(new Error('fatal: bad revision')) // origin/main fails
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // origin/master exists
                ;

            const result = await getDefaultFromRef();

            expect(result).toBe('origin/master');
            expect(mockRun).toHaveBeenCalledTimes(4);
            expect(mockRun).toHaveBeenNthCalledWith(1, 'git rev-parse --verify main >/dev/null 2>&1');
            expect(mockRun).toHaveBeenNthCalledWith(2, 'git rev-parse --verify master >/dev/null 2>&1');
            expect(mockRun).toHaveBeenNthCalledWith(3, 'git rev-parse --verify origin/main >/dev/null 2>&1');
            expect(mockRun).toHaveBeenNthCalledWith(4, 'git rev-parse --verify origin/master >/dev/null 2>&1');
        });

        it('should throw error when no valid reference is found', async () => {
            mockRun.mockRejectedValue(new Error('fatal: bad revision')); // All refs fail

            await expect(getDefaultFromRef()).rejects.toThrow(
                'Could not find a valid default git reference for --from parameter'
            );

            expect(mockRun).toHaveBeenCalledTimes(5); // All 5 candidates tested
        });
    });

    describe('getRemoteDefaultBranch', () => {
        it('should return branch name from symbolic-ref', async () => {
            mockRun.mockResolvedValueOnce({
                stdout: 'refs/remotes/origin/main\n',
                stderr: ''
            });

            const result = await getRemoteDefaultBranch();

            expect(result).toBe('main');
            expect(mockRun).toHaveBeenCalledWith('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""');
        });

        it('should fallback to ls-remote when symbolic-ref fails', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // symbolic-ref returns empty
                .mockResolvedValueOnce({
                    stdout: 'ref: refs/heads/main\tHEAD\n29abad98df7416a59ede756069659e218a13bf70\tHEAD\n',
                    stderr: ''
                });

            const result = await getRemoteDefaultBranch();

            expect(result).toBe('main');
            expect(mockRun).toHaveBeenCalledWith('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""');
            expect(mockRun).toHaveBeenCalledWith('git ls-remote --symref origin HEAD');
        });

        it('should return null when both methods fail', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // symbolic-ref returns empty
                .mockResolvedValueOnce({ stdout: 'no symref info', stderr: '' }); // ls-remote has no symref

            const result = await getRemoteDefaultBranch();

            expect(result).toBe(null);
        });

        it('should return null on errors', async () => {
            mockRun.mockRejectedValue(new Error('git command failed'));

            const result = await getRemoteDefaultBranch();

            expect(result).toBe(null);
        });
    });
});
