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

import {
    isValidGitRef,
    getDefaultFromRef,
    getRemoteDefaultBranch,
    localBranchExists,
    remoteBranchExists,
    getBranchCommitSha,
    isBranchInSyncWithRemote,
    safeSyncBranchWithRemote
} from '../../src/util/git';
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

    describe('localBranchExists', () => {
        it('should return true when local branch exists', async () => {
            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await localBranchExists('feature-branch');

            expect(result).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify refs/heads/feature-branch >/dev/null 2>&1');
        });

        it('should return false when local branch does not exist', async () => {
            mockRun.mockRejectedValue(new Error('fatal: bad revision'));

            const result = await localBranchExists('nonexistent-branch');

            expect(result).toBe(false);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify refs/heads/nonexistent-branch >/dev/null 2>&1');
        });
    });

    describe('remoteBranchExists', () => {
        it('should return true when remote branch exists', async () => {
            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await remoteBranchExists('feature-branch');

            expect(result).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify refs/remotes/origin/feature-branch >/dev/null 2>&1');
        });

        it('should return false when remote branch does not exist', async () => {
            mockRun.mockRejectedValue(new Error('fatal: bad revision'));

            const result = await remoteBranchExists('nonexistent-branch');

            expect(result).toBe(false);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify refs/remotes/origin/nonexistent-branch >/dev/null 2>&1');
        });

        it('should use custom remote name', async () => {
            mockRun.mockResolvedValue({ stdout: '', stderr: '' });

            const result = await remoteBranchExists('feature-branch', 'upstream');

            expect(result).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --verify refs/remotes/upstream/feature-branch >/dev/null 2>&1');
        });
    });

    describe('getBranchCommitSha', () => {
        it('should return commit SHA for branch reference', async () => {
            const mockSha = 'abc123def456';
            mockRun.mockResolvedValue({ stdout: mockSha + '\n', stderr: '' });

            const result = await getBranchCommitSha('refs/heads/main');

            expect(result).toBe(mockSha);
            expect(mockRun).toHaveBeenCalledWith('git rev-parse refs/heads/main');
        });

        it('should trim whitespace from SHA', async () => {
            const mockSha = 'abc123def456';
            mockRun.mockResolvedValue({ stdout: `  ${mockSha}  \n\n`, stderr: '' });

            const result = await getBranchCommitSha('refs/heads/main');

            expect(result).toBe(mockSha);
        });
    });

    describe('isBranchInSyncWithRemote', () => {
        it('should return inSync true when SHAs match', async () => {
            const mockSha = 'abc123def456';
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: mockSha, stderr: '' }) // local SHA
                .mockResolvedValueOnce({ stdout: mockSha, stderr: '' }); // remote SHA

            const result = await isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(true);
            expect(result.localSha).toBe(mockSha);
            expect(result.remoteSha).toBe(mockSha);
            expect(result.localExists).toBe(true);
            expect(result.remoteExists).toBe(true);
        });

        it('should return inSync false when SHAs differ', async () => {
            const localSha = 'abc123def456';
            const remoteSha = 'def456abc123';
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: localSha, stderr: '' }) // local SHA
                .mockResolvedValueOnce({ stdout: remoteSha, stderr: '' }); // remote SHA

            const result = await isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localSha).toBe(localSha);
            expect(result.remoteSha).toBe(remoteSha);
        });

        it('should handle missing local branch', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockRejectedValueOnce(new Error('fatal: bad revision')) // local branch missing
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // remote branch exists

            const result = await isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(false);
            expect(result.remoteExists).toBe(true);
            expect(result.error).toContain('Local branch \'main\' does not exist');
        });

        it('should handle missing remote branch', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockRejectedValueOnce(new Error('fatal: bad revision')); // remote branch missing

            const result = await isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(true);
            expect(result.remoteExists).toBe(false);
            expect(result.error).toContain('Remote branch \'origin/main\' does not exist');
        });
    });

    describe('safeSyncBranchWithRemote', () => {
        it('should successfully sync existing branch', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git pull
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // checkout back (if needed)

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should create local branch when it does not exist', async () => {
            // Mock implementation that handles specific commands
            mockRun.mockImplementation((command: string) => {
                if (command === 'git branch --show-current') {
                    return Promise.resolve({ stdout: 'feature', stderr: '' });
                }
                if (command === 'git fetch origin --quiet') {
                    return Promise.resolve({ stdout: '', stderr: '' });
                }
                if (command === 'git rev-parse --verify refs/heads/main >/dev/null 2>&1') {
                    return Promise.reject(new Error('fatal: bad revision')); // Local branch doesn't exist
                }
                if (command === 'git rev-parse --verify refs/remotes/origin/main >/dev/null 2>&1') {
                    return Promise.resolve({ stdout: '', stderr: '' }); // Remote branch exists
                }
                if (command === 'git branch main origin/main') {
                    return Promise.resolve({ stdout: '', stderr: '' });
                }
                return Promise.reject(new Error(`Unexpected command: ${command}`));
            });

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git branch main origin/main');
        });

        it('should handle merge conflicts', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockRejectedValueOnce(new Error('CONFLICT: Merge conflict in file.txt')); // git pull fails

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.conflictResolutionRequired).toBe(true);
            expect(result.error).toContain('diverged from');
        });

        it('should handle uncommitted changes when switching branches', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'feature', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: 'M file.txt', stderr: '' }); // uncommitted changes

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.error).toContain('uncommitted changes');
        });

        it('should handle missing remote branch', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockRejectedValueOnce(new Error('fatal: bad revision')); // remote branch missing

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Remote branch \'origin/main\' does not exist');
        });
    });
});
