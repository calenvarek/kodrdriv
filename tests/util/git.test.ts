import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the child module
vi.mock('../../src/util/child', () => ({
    run: vi.fn()
}));

// Mock child_process
vi.mock('child_process', () => ({
    exec: vi.fn()
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
    default: {
        access: vi.fn(),
        readFile: vi.fn(),
        realpath: vi.fn(),
        lstat: vi.fn()
    },
    access: vi.fn(),
    readFile: vi.fn(),
    realpath: vi.fn(),
    lstat: vi.fn()
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
    safeSyncBranchWithRemote,
    getCurrentBranch,
    getGitStatusSummary,
    getGloballyLinkedPackages,
    getLinkedDependencies,
    isNpmLinked,
    getLinkCompatibilityProblems
} from '../../src/util/git';
import { run } from '../../src/util/child';
import { exec } from 'child_process';
import fs from 'fs/promises';

const mockRun = run as any;
const mockExec = exec as any;
const mockFs = fs as any;

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

            expect(mockRun).toHaveBeenCalledTimes(4); // All 4 candidates tested
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

        it('should handle fetch failures', async () => {
            mockRun.mockRejectedValueOnce(new Error('fetch failed')); // git fetch fails

            const result = await isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(false);
            expect(result.remoteExists).toBe(false);
            expect(result.error).toContain('Failed to check branch sync');
        });

        it('should handle SHA retrieval failures', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockRejectedValueOnce(new Error('failed to get SHA')); // local SHA fails

            const result = await isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.error).toContain('Failed to check branch sync');
        });

        it('should use custom remote name', async () => {
            const mockSha = 'abc123def456';
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch upstream
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists (upstream)
                .mockResolvedValueOnce({ stdout: mockSha, stderr: '' }) // local SHA
                .mockResolvedValueOnce({ stdout: mockSha, stderr: '' }); // remote SHA

            const result = await isBranchInSyncWithRemote('main', 'upstream');

            expect(result.inSync).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git fetch upstream --quiet');
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

        it('should handle non-fast-forward updates', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockRejectedValueOnce(new Error('fatal: non-fast-forward, aborting')); // git pull fails

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.conflictResolutionRequired).toBe(true);
            expect(result.error).toContain('diverged from');
        });

        it('should handle diverged branches', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockRejectedValueOnce(new Error('Your branch and \'origin/main\' have diverged')); // git pull fails

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.conflictResolutionRequired).toBe(true);
            expect(result.error).toContain('diverged from');
        });

        it('should switch back to original branch on pull failure', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'feature', stderr: '' }) // current branch (not target)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain (clean)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git checkout main
                .mockRejectedValueOnce(new Error('git pull failed')) // git pull fails
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git checkout feature (back to original)

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to sync branch \'main\'');
            expect(mockRun).toHaveBeenCalledWith('git checkout feature'); // Should switch back
        });

        it('should handle checkout failure when switching back', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'feature', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain (clean)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git checkout main
                .mockRejectedValueOnce(new Error('git pull failed')) // git pull fails
                .mockRejectedValueOnce(new Error('checkout failed')); // git checkout feature fails

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to sync branch \'main\'');
            // Should still return the sync error, not the checkout error
        });

        it('should handle general git command failures', async () => {
            mockRun.mockRejectedValue(new Error('git command failed'));

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to sync branch \'main\'');
        });

        it('should handle empty current branch name', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // empty current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain (clean)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git checkout main
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git pull

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(true);
            // Should not try to checkout back to original branch since it's empty
        });

        it('should successfully switch back after successful sync', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'feature', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain (clean)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git checkout main
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git pull (success)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git checkout feature (back)

            const result = await safeSyncBranchWithRemote('main');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git checkout feature'); // Should switch back
        });

        it('should handle custom remote name', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch upstream
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // local branch exists
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote branch exists (upstream)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // git pull upstream

            const result = await safeSyncBranchWithRemote('main', 'upstream');

            expect(result.success).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('git fetch upstream --quiet');
            expect(mockRun).toHaveBeenCalledWith('git pull upstream main --ff-only');
        });
    });

    describe('getCurrentBranch', () => {
        it('should return current branch name', async () => {
            mockRun.mockResolvedValue({ stdout: 'feature-branch\n', stderr: '' });

            const result = await getCurrentBranch();

            expect(result).toBe('feature-branch');
            expect(mockRun).toHaveBeenCalledWith('git branch --show-current');
        });

        it('should handle branch names with whitespace', async () => {
            mockRun.mockResolvedValue({ stdout: '  main  \n', stderr: '' });

            const result = await getCurrentBranch();

            expect(result).toBe('main');
            expect(mockRun).toHaveBeenCalledWith('git branch --show-current');
        });
    });

    describe('getGitStatusSummary', () => {
        it('should return clean status when repository is clean', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.branch).toBe('main');
            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unstagedCount).toBe(0);
            expect(result.uncommittedCount).toBe(0);
            expect(result.unpushedCount).toBe(0);
            expect(result.status).toBe('clean');
        });

        it('should detect unstaged files', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '?? file1.txt\n?? file2.txt', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.branch).toBe('main');
            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.unstagedCount).toBe(2); // Two untracked files
            expect(result.uncommittedCount).toBe(0);
            expect(result.status).toBe('2 unstaged');
        });

        it('should detect uncommitted (staged) changes', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'M  file1.txt\nA  file2.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.branch).toBe('main');
            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.unstagedCount).toBe(0);
            expect(result.uncommittedCount).toBe(2); // Modified staged + Added staged
            expect(result.status).toBe('2 uncommitted');
        });

        it('should detect unpushed commits', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '3\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.branch).toBe('main');
            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.hasUnpushedCommits).toBe(true);
            expect(result.unpushedCount).toBe(3);
            expect(result.status).toBe('3 unpushed');
        });

        it('should detect mixed status conditions', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'M  file1.txt\n M file2.txt\n?? file3.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '2\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.branch).toBe('feature');
            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.hasUnpushedCommits).toBe(true);
            expect(result.unstagedCount).toBe(2); // Modified unstaged + untracked
            expect(result.uncommittedCount).toBe(1); // Modified staged
            expect(result.unpushedCount).toBe(2);
            expect(result.status).toBe('2 unstaged, 1 uncommitted, 2 unpushed');
        });

        it('should handle git errors gracefully', async () => {
            mockRun.mockRejectedValue(new Error('Not a git repository'));

            const result = await getGitStatusSummary();

            expect(result.branch).toBe('unknown');
            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.status).toBe('error');
        });

        it('should change to working directory when specified', async () => {
            const changeDirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});
            const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/original/path');

            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            await getGitStatusSummary('/test/path');

            expect(changeDirSpy).toHaveBeenCalledTimes(2);
            expect(changeDirSpy).toHaveBeenNthCalledWith(1, '/test/path');
            expect(changeDirSpy).toHaveBeenNthCalledWith(2, '/original/path');

            changeDirSpy.mockRestore();
            cwdSpy.mockRestore();
        });

        it('should handle deleted files', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'D  deleted1.txt\n D deleted2.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.unstagedCount).toBe(1); // One unstaged deletion
            expect(result.uncommittedCount).toBe(1); // One staged deletion
            expect(result.status).toBe('1 unstaged, 1 uncommitted');
        });

        it('should handle renamed files', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'R  old.txt -> new.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.unstagedCount).toBe(0);
            expect(result.uncommittedCount).toBe(1); // One staged rename
            expect(result.status).toBe('1 uncommitted');
        });

        it('should handle copied files', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'C  original.txt -> copy.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.unstagedCount).toBe(0);
            expect(result.uncommittedCount).toBe(1); // One staged copy
            expect(result.status).toBe('1 uncommitted');
        });

        it('should handle both staged and unstaged changes for same file', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'MM file1.txt\nAM file2.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.unstagedCount).toBe(2); // Two files with unstaged changes
            expect(result.uncommittedCount).toBe(2); // Two files with staged changes
            expect(result.status).toBe('2 unstaged, 2 uncommitted');
        });

        it('should handle when remote branch does not exist for unpushed check', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockRejectedValueOnce(new Error('fatal: bad revision')); // remoteBranchExists check fails

            const result = await getGitStatusSummary();

            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unpushedCount).toBe(0);
            expect(result.status).toBe('clean');
        });

        it('should handle invalid rev-list count output', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: 'invalid\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unpushedCount).toBe(0);
            expect(result.status).toBe('clean');
        });

        it('should handle fetch errors gracefully', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git status --porcelain
                .mockRejectedValueOnce(new Error('fetch failed')); // git fetch fails

            const result = await getGitStatusSummary();

            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unpushedCount).toBe(0);
            expect(result.status).toBe('clean');
        });

        it('should handle empty status lines correctly', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: '\n\n?? file.txt\n\n', stderr: '' }) // git status --porcelain with empty lines
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.unstagedCount).toBe(1); // Only one file, empty lines ignored
            expect(result.status).toBe('1 unstaged');
        });

        it('should restore working directory even if error occurs during execution', async () => {
            const changeDirSpy = vi.spyOn(process, 'chdir').mockImplementation(() => {});
            const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue('/original/path');

            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockRejectedValueOnce(new Error('git status failed')); // git status fails

            await getGitStatusSummary('/test/path');

            // Should still restore the directory
            expect(changeDirSpy).toHaveBeenCalledTimes(2);
            expect(changeDirSpy).toHaveBeenNthCalledWith(1, '/test/path');
            expect(changeDirSpy).toHaveBeenNthCalledWith(2, '/original/path');

            changeDirSpy.mockRestore();
            cwdSpy.mockRestore();
        });

        it('should handle edge case status codes', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // getCurrentBranch
                .mockResolvedValueOnce({ stdout: 'T  type-change.txt\nU  unmerged.txt\n!  ignored.txt\n', stderr: '' }) // git status --porcelain
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // git fetch origin --quiet
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0\n', stderr: '' }); // git rev-list --count

            const result = await getGitStatusSummary();

            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.uncommittedCount).toBe(3); // T, U, ! are all first-character status codes
            expect(result.status).toBe('3 uncommitted');
        });
    });

    describe('getGloballyLinkedPackages', () => {
        it('should return set of globally linked packages', async () => {
            const jsonOutput = JSON.stringify({
                dependencies: {
                    '@fjell/logging': {
                        version: '4.4.41-dev.0',
                        resolved: 'file:../fjell-logging'
                    },
                    '@fjell/core': {
                        version: '4.4.35-dev.0',
                        resolved: 'file:../fjell-core'
                    }
                }
            });

            // Mock exec to call the callback with successful result
            mockExec.mockImplementation((command: string, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set(['@fjell/logging', '@fjell/core']));
            expect(mockExec).toHaveBeenCalledWith('npm ls --link -g --json', expect.any(Function));
        });

        it('should return empty set when no globally linked packages', async () => {
            const jsonOutput = JSON.stringify({
                dependencies: {}
            });

            // Mock exec to call the callback with successful result
            mockExec.mockImplementation((command: string, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should handle npm command failures gracefully', async () => {
            mockExec.mockImplementation((command: string, callback: Function) => {
                const error = new Error('npm command failed');
                callback(error);
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should handle npm command with invalid JSON in stdout', async () => {
            mockExec.mockImplementation((command: string, callback: Function) => {
                const error = new Error('npm command failed');
                (error as any).stdout = 'invalid json output';
                callback(error);
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should handle npm command with no dependencies field', async () => {
            const jsonOutput = JSON.stringify({
                name: 'global',
                // no dependencies field
            });

            mockExec.mockImplementation((command: string, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should handle npm command with null dependencies', async () => {
            const jsonOutput = JSON.stringify({
                dependencies: null
            });

            mockExec.mockImplementation((command: string, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should handle npm command with non-object dependencies', async () => {
            const jsonOutput = JSON.stringify({
                dependencies: 'not-an-object'
            });

            mockExec.mockImplementation((command: string, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should extract dependencies from error stdout when available', async () => {
            const jsonOutput = JSON.stringify({
                dependencies: {
                    '@test/package': {
                        version: '1.0.0',
                        resolved: 'file:../test-package'
                    }
                }
            });

            mockExec.mockImplementation((command: string, callback: Function) => {
                const error = new Error('npm command failed');
                (error as any).stdout = jsonOutput;
                callback(error);
            });

            const result = await getGloballyLinkedPackages();

            expect(result).toEqual(new Set(['@test/package']));
        });
    });

    describe('getLinkedDependencies', () => {
        it('should return set of linked dependencies', async () => {
            const jsonOutput = JSON.stringify({
                name: 'test-package',
                dependencies: {
                    '@fjell/logging': {
                        version: '1.0.0',
                        resolved: 'file:../fjell-logging'
                    },
                    'some-other-dep': {
                        version: '2.0.0',
                        resolved: 'file:../other-dep'
                    }
                }
            });

            // Mock exec to call the callback with successful result
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set(['@fjell/logging', 'some-other-dep']));
            expect(mockExec).toHaveBeenCalledWith('npm ls --link --json', { cwd: '/test/package' }, expect.any(Function));
        });

        it('should return empty set when package has no linked dependencies', async () => {
            const jsonOutput = JSON.stringify({
                name: 'test-package',
                dependencies: {}
            });

            // Mock exec to call the callback with successful result
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set());
            expect(mockExec).toHaveBeenCalledWith('npm ls --link --json', { cwd: '/test/package' }, expect.any(Function));
        });

        it('should return empty set when dependencies field is missing', async () => {
            const jsonOutput = JSON.stringify({
                name: 'test-package'
            });

            // Mock exec to call the callback with successful result
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                callback(null, { stdout: jsonOutput, stderr: 'some warning' });
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set());
        });

        it('should handle npm command failures and return from error stdout', async () => {
            const jsonOutput = JSON.stringify({
                name: 'test-package',
                dependencies: {
                    '@fjell/logging': {
                        version: '4.4.41-dev.0',
                        resolved: 'file:../../../fjell-logging'
                    }
                },
                error: {
                    code: 'ELSPROBLEMS',
                    summary: 'invalid dependencies'
                }
            });

            // Mock exec to call the callback with an error that has stdout
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                const error = new Error('npm command failed');
                (error as any).stdout = jsonOutput;
                (error as any).stderr = 'npm error messages';
                callback(error);
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set(['@fjell/logging']));
        });

        it('should return empty set when npm command fails with no usable output', async () => {
            // Mock exec to call the callback with an error that has no stdout
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                const error = new Error('npm command failed');
                callback(error);
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set());
        });

        it('should handle malformed JSON in error stdout', async () => {
            // Mock exec to call the callback with an error that has invalid JSON in stdout
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                const error = new Error('npm command failed');
                (error as any).stdout = 'invalid json{';
                callback(error);
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set());
        });

        it('should handle null dependencies in error stdout', async () => {
            const jsonOutput = JSON.stringify({
                name: 'test-package',
                dependencies: null
            });

            // Mock exec to call the callback with an error that has null dependencies
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                const error = new Error('npm command failed');
                (error as any).stdout = jsonOutput;
                callback(error);
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set());
        });

        it('should handle non-object dependencies in error stdout', async () => {
            const jsonOutput = JSON.stringify({
                name: 'test-package',
                dependencies: 'not-an-object'
            });

            // Mock exec to call the callback with an error that has invalid dependencies type
            mockExec.mockImplementation((command: string, options: any, callback: Function) => {
                const error = new Error('npm command failed');
                (error as any).stdout = jsonOutput;
                callback(error);
            });

            const result = await getLinkedDependencies('/test/package');

            expect(result).toEqual(new Set());
        });
    });

    describe('isNpmLinked', () => {
        it('should return true when package is globally linked via npm ls', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            const globalLsOutput = JSON.stringify({
                dependencies: {
                    '@test/package': {
                        version: '1.0.0',
                        resolved: 'file:/path/to/package'
                    }
                }
            });

            mockFs.access.mockResolvedValue(undefined); // package.json exists
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockFs.realpath
                .mockResolvedValueOnce('/real/package/path') // packageDir realpath
                .mockResolvedValueOnce('/real/package/path'); // linkedPath realpath
            mockRun.mockResolvedValue({ stdout: globalLsOutput, stderr: '' });

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(true);
            expect(mockFs.access).toHaveBeenCalledWith('/path/to/package/package.json');
            expect(mockFs.readFile).toHaveBeenCalledWith('/path/to/package/package.json', 'utf-8');
            expect(mockRun).toHaveBeenCalledWith('npm ls -g --depth=0 --json');
        });

        it('should return false when package.json does not exist', async () => {
            mockFs.access.mockRejectedValue(new Error('ENOENT: no such file or directory'));

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
            expect(mockFs.access).toHaveBeenCalledWith('/path/to/package/package.json');
        });

        it('should return false when package.json has no name field', async () => {
            const packageJsonContent = JSON.stringify({
                version: '1.0.0'
                // no name field
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should return false when package is not in global dependencies', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            const globalLsOutput = JSON.stringify({
                dependencies: {
                    '@other/package': {
                        version: '1.0.0',
                        resolved: 'file:/path/to/other'
                    }
                }
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun.mockResolvedValue({ stdout: globalLsOutput, stderr: '' });

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should return false when global package points to different path', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            const globalLsOutput = JSON.stringify({
                dependencies: {
                    '@test/package': {
                        version: '1.0.0',
                        resolved: 'file:/different/path'
                    }
                }
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockFs.realpath
                .mockResolvedValueOnce('/real/package/path') // packageDir realpath
                .mockResolvedValueOnce('/different/real/path'); // linkedPath realpath
            mockRun.mockResolvedValue({ stdout: globalLsOutput, stderr: '' });

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should fallback to symlink check when npm ls fails', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun
                .mockRejectedValueOnce(new Error('npm ls failed')) // npm ls -g fails
                .mockResolvedValueOnce({ stdout: '/usr/local/lib/node_modules\n', stderr: '' }); // npm prefix -g

            // Mock lstat to return a symlink
            const mockStat = { isSymbolicLink: vi.fn().mockReturnValue(true) };
            mockFs.lstat.mockResolvedValue(mockStat);
            mockFs.realpath
                .mockResolvedValueOnce('/real/package/path') // packageDir realpath
                .mockResolvedValueOnce('/real/package/path'); // global symlink realpath

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('npm prefix -g');
            expect(mockFs.lstat).toHaveBeenCalledWith('/usr/local/lib/node_modules/node_modules/@test/package');
        });

        it('should return false when symlink check fails', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun
                .mockRejectedValueOnce(new Error('npm ls failed'))
                .mockResolvedValueOnce({ stdout: '/usr/local/lib/node_modules\n', stderr: '' });

            // Mock lstat to return not a symlink
            const mockStat = { isSymbolicLink: vi.fn().mockReturnValue(false) };
            mockFs.lstat.mockResolvedValue(mockStat);

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should return false when symlink points to different directory', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun
                .mockRejectedValueOnce(new Error('npm ls failed'))
                .mockResolvedValueOnce({ stdout: '/usr/local/lib/node_modules\n', stderr: '' });

            const mockStat = { isSymbolicLink: vi.fn().mockReturnValue(true) };
            mockFs.lstat.mockResolvedValue(mockStat);
            mockFs.realpath
                .mockResolvedValueOnce('/real/package/path') // packageDir realpath
                .mockResolvedValueOnce('/different/real/path'); // global symlink realpath

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should return false when all checks fail', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun
                .mockRejectedValueOnce(new Error('npm ls failed'))
                .mockRejectedValueOnce(new Error('npm prefix failed'));

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should handle JSON parsing errors gracefully', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun
                .mockResolvedValueOnce({ stdout: 'invalid json', stderr: '' }) // npm ls -g fails with invalid JSON
                .mockRejectedValueOnce(new Error('npm prefix failed')); // alternative approach also fails

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should handle malformed package.json gracefully', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue('invalid json');

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false);
        });

        it('should handle resolved path without file: prefix', async () => {
            const packageJsonContent = JSON.stringify({
                name: '@test/package',
                version: '1.0.0'
            });

            const globalLsOutput = JSON.stringify({
                dependencies: {
                    '@test/package': {
                        version: '1.0.0',
                        resolved: '/path/to/package' // no file: prefix
                    }
                }
            });

            mockFs.access.mockResolvedValue(undefined);
            mockFs.readFile.mockResolvedValue(packageJsonContent);
            mockRun.mockResolvedValue({ stdout: globalLsOutput, stderr: '' });

            const result = await isNpmLinked('/path/to/package');

            expect(result).toBe(false); // Should return false because resolved doesn't start with 'file:'
        });
    });


});
