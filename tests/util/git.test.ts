import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as child from '../../src/util/child';
import * as git from '../../src/util/git';
import * as validation from '../../src/util/validation';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import * as semver from 'semver';

// Mock dependencies
vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
    runSecure: vi.fn(),
    validateGitRef: vi.fn(),
}));

vi.mock('../../src/util/validation', () => ({
    safeJsonParse: vi.fn(),
    validatePackageJson: vi.fn(),
}));

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    })),
}));

vi.mock('fs/promises');
vi.mock('child_process');
vi.mock('util');
vi.mock('semver', () => ({
    parse: vi.fn(),
    validRange: vi.fn(),
    satisfies: vi.fn(),
    coerce: vi.fn(),
}));

const mockRun = child.run as Mock;
const mockRunSecure = child.runSecure as Mock;
const mockValidateGitRef = child.validateGitRef as Mock;
const mockSafeJsonParse = validation.safeJsonParse as Mock;
const mockValidatePackageJson = validation.validatePackageJson as Mock;
const mockExec = exec as unknown as Mock;
const mockUtilPromisify = vi.mocked(util.promisify);
const mockFs = vi.mocked(fs);
const mockSemver = vi.mocked(semver);

describe('Git Utilities', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockValidateGitRef.mockReturnValue(true);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('isValidGitRef', () => {
        it('should return true for valid git reference', async () => {
            mockRunSecure.mockResolvedValue({ stdout: 'abc123' });

            const result = await git.isValidGitRef('main');

            expect(result).toBe(true);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'main'], { stdio: 'ignore' });
        });

        it('should return false for invalid git reference', async () => {
            mockRunSecure.mockRejectedValue(new Error('Invalid ref'));

            const result = await git.isValidGitRef('invalid-ref');

            expect(result).toBe(false);
        });

        it('should return false when validation fails', async () => {
            mockValidateGitRef.mockReturnValue(false);

            const result = await git.isValidGitRef('invalid-ref');

            expect(result).toBe(false);
            expect(mockRunSecure).not.toHaveBeenCalled();
        });
    });

    describe('getDefaultFromRef', () => {
        it('should return main when it exists', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'abc123' }) // main
                .mockRejectedValue(new Error('Not found')); // master, origin/main, origin/master

            const result = await git.getDefaultFromRef();

            expect(result).toBe('main');
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'main'], { stdio: 'ignore' });
        });

        it('should return master when main does not exist but master does', async () => {
            mockRunSecure
                .mockRejectedValueOnce(new Error('Not found')) // main
                .mockResolvedValueOnce({ stdout: 'abc123' }) // master
                .mockRejectedValue(new Error('Not found')); // origin/main, origin/master

            const result = await git.getDefaultFromRef();

            expect(result).toBe('master');
        });

        it('should return origin/main when local branches do not exist', async () => {
            mockRunSecure
                .mockRejectedValueOnce(new Error('Not found')) // main
                .mockRejectedValueOnce(new Error('Not found')) // master
                .mockResolvedValueOnce({ stdout: 'abc123' }) // origin/main
                .mockRejectedValue(new Error('Not found')); // origin/master

            const result = await git.getDefaultFromRef();

            expect(result).toBe('origin/main');
        });

        it('should throw error when no valid reference found', async () => {
            mockRunSecure.mockRejectedValue(new Error('Not found'));

            await expect(git.getDefaultFromRef()).rejects.toThrow(
                'Could not find a valid default git reference for --from parameter'
            );
        });
    });

    describe('getRemoteDefaultBranch', () => {
        it('should return branch name from symbolic ref', async () => {
            mockRun.mockResolvedValue({ stdout: 'refs/remotes/origin/main' });

            const result = await git.getRemoteDefaultBranch();

            expect(result).toBe('main');
            expect(mockRun).toHaveBeenCalledWith('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""');
        });

        it('should return branch name from ls-remote when symbolic ref fails', async () => {
            mockRun
                .mockResolvedValueOnce({ stdout: '' }) // symbolic-ref fails
                .mockResolvedValueOnce({ stdout: 'ref: refs/heads/main\tHEAD\nabc123\tHEAD' }); // ls-remote

            const result = await git.getRemoteDefaultBranch();

            expect(result).toBe('main');
            expect(mockRun).toHaveBeenCalledWith('git ls-remote --symref origin HEAD');
        });

        it('should return null when both methods fail', async () => {
            mockRun.mockRejectedValue(new Error('Command failed'));

            const result = await git.getRemoteDefaultBranch();

            expect(result).toBeNull();
        });

        it('should handle malformed symbolic ref output', async () => {
            mockRun.mockResolvedValue({ stdout: 'invalid-ref-format' });

            const result = await git.getRemoteDefaultBranch();

            expect(result).toBeNull();
        });
    });

    describe('localBranchExists', () => {
        it('should return true when local branch exists', async () => {
            mockRunSecure.mockResolvedValue({ stdout: 'abc123' });

            const result = await git.localBranchExists('feature-branch');

            expect(result).toBe(true);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'refs/heads/feature-branch'], { stdio: 'ignore' });
        });

        it('should return false when local branch does not exist', async () => {
            mockRunSecure.mockRejectedValue(new Error('Not found'));

            const result = await git.localBranchExists('nonexistent-branch');

            expect(result).toBe(false);
        });
    });

    describe('remoteBranchExists', () => {
        it('should return true when remote branch exists', async () => {
            mockRunSecure.mockResolvedValue({ stdout: 'abc123' });

            const result = await git.remoteBranchExists('feature-branch', 'origin');

            expect(result).toBe(true);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'refs/remotes/origin/feature-branch'], { stdio: 'ignore' });
        });

        it('should return false when remote branch does not exist', async () => {
            mockRunSecure.mockRejectedValue(new Error('Not found'));

            const result = await git.remoteBranchExists('nonexistent-branch', 'origin');

            expect(result).toBe(false);
        });

        it('should use origin as default remote', async () => {
            mockRunSecure.mockResolvedValue({ stdout: 'abc123' });

            await git.remoteBranchExists('feature-branch');

            expect(mockRunSecure).toHaveBeenCalledWith('git', ['rev-parse', '--verify', 'refs/remotes/origin/feature-branch'], { stdio: 'ignore' });
        });
    });

    describe('getBranchCommitSha', () => {
        it('should return commit SHA for valid branch reference', async () => {
            mockRunSecure.mockResolvedValue({ stdout: 'abc123def456' });

            const result = await git.getBranchCommitSha('main');

            expect(result).toBe('abc123def456');
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['rev-parse', 'main']);
        });

        it('should throw error for invalid git reference', async () => {
            mockValidateGitRef.mockReturnValue(false);

            await expect(git.getBranchCommitSha('invalid-ref')).rejects.toThrow('Invalid git reference: invalid-ref');
        });

        it('should throw error when git command fails', async () => {
            mockRunSecure.mockRejectedValue(new Error('Git command failed'));

            await expect(git.getBranchCommitSha('main')).rejects.toThrow('Git command failed');
        });
    });

    describe('isBranchInSyncWithRemote', () => {
        it('should return error object for invalid branch name', async () => {
            mockValidateGitRef.mockReturnValue(false);

            const result = await git.isBranchInSyncWithRemote('invalid-branch');

            expect(result.inSync).toBe(false);
            expect(result.error).toContain('Invalid branch name: invalid-branch');
        });

        it('should return error object for invalid remote name', async () => {
            mockValidateGitRef
                .mockReturnValueOnce(true) // branch name valid
                .mockReturnValueOnce(false); // remote name invalid

            const result = await git.isBranchInSyncWithRemote('main', 'invalid-remote');

            expect(result.inSync).toBe(false);
            expect(result.error).toContain('Invalid remote name: invalid-remote');
        });

        it('should return error when local branch does not exist', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({}) // fetch
                .mockRejectedValueOnce(new Error('Not found')); // localBranchExists check

            const result = await git.isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(false);
            expect(result.error).toContain("Local branch 'main' does not exist");
        });

        it('should return error when remote branch does not exist', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockRejectedValueOnce(new Error('Not found')); // remoteBranchExists check

            const result = await git.isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(true);
            expect(result.remoteExists).toBe(false);
            expect(result.error).toContain("Remote branch 'origin/main' does not exist");
        });

        it('should return in sync when both branches exist and have same SHA', async () => {
            const sameSha = 'abc123def456';
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: sameSha }) // local SHA
                .mockResolvedValueOnce({ stdout: sameSha }); // remote SHA

            const result = await git.isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(true);
            expect(result.localExists).toBe(true);
            expect(result.remoteExists).toBe(true);
            expect(result.localSha).toBe(sameSha);
            expect(result.remoteSha).toBe(sameSha);
            expect(result.error).toBeUndefined();
        });

        it('should return not in sync when branches have different SHAs', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123def456' }) // local SHA
                .mockResolvedValueOnce({ stdout: 'def456abc789' }); // remote SHA

            const result = await git.isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(true);
            expect(result.remoteExists).toBe(true);
            expect(result.localSha).toBe('abc123def456');
            expect(result.remoteSha).toBe('def456abc789');
            expect(result.error).toBeUndefined();
        });

        it('should handle fetch errors gracefully', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure.mockRejectedValue(new Error('Fetch failed'));

            const result = await git.isBranchInSyncWithRemote('main');

            expect(result.inSync).toBe(false);
            expect(result.localExists).toBe(false);
            expect(result.remoteExists).toBe(false);
            expect(result.error).toContain('Failed to check branch sync: Fetch failed');
        });
    });

    describe('safeSyncBranchWithRemote', () => {
        it('should return error object for invalid branch name', async () => {
            mockValidateGitRef.mockReturnValue(false);

            const result = await git.safeSyncBranchWithRemote('invalid-branch');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid branch name: invalid-branch');
        });

        it('should return error object for invalid remote name', async () => {
            mockValidateGitRef
                .mockReturnValueOnce(true) // branch name valid
                .mockReturnValueOnce(false); // remote name invalid

            const result = await git.safeSyncBranchWithRemote('main', 'invalid-remote');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Invalid remote name: invalid-remote');
        });

        it('should return error when remote branch does not exist', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockRejectedValueOnce(new Error('Not found')); // remoteBranchExists check

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(false);
            expect(result.error).toContain("Remote branch 'origin/feature-branch' does not exist");
        });

        it('should create local branch when it does not exist', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockRejectedValueOnce(new Error('Not found')) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({}); // branch creation

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(true);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['branch', 'feature-branch', 'origin/feature-branch']);
        });

        it('should sync successfully when on same branch', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'feature-branch' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({}); // pull

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(true);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['pull', 'origin', 'feature-branch', '--ff-only']);
        });

        it('should switch branches and sync when on different branch', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '' }) // status (no uncommitted changes)
                .mockResolvedValueOnce({}) // checkout
                .mockResolvedValueOnce({}) // pull
                .mockResolvedValueOnce({}); // checkout back to main

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(true);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['checkout', 'feature-branch']);
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['checkout', 'main']);
        });

        it('should return error when uncommitted changes prevent switching', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: 'M  modified.txt' }); // status (has uncommitted changes)

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot switch to branch');
            expect(result.error).toContain('uncommitted changes');
        });

        it('should handle merge conflicts', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'feature-branch' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockRejectedValueOnce(new Error('CONFLICT (content): Merge conflict in file.txt')); // pull with conflict

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(false);
            expect(result.conflictResolutionRequired).toBe(true);
            expect(result.error).toContain('diverged from');
            expect(result.error).toContain('requires manual conflict resolution');
        });

        it('should handle checkout back errors gracefully', async () => {
            mockValidateGitRef.mockReturnValue(true);
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // localBranchExists check
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '' }) // status
                .mockResolvedValueOnce({}) // checkout
                .mockRejectedValueOnce(new Error('Pull failed')) // pull fails
                .mockRejectedValueOnce(new Error('Checkout failed')); // checkout back fails

            const result = await git.safeSyncBranchWithRemote('feature-branch');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to sync branch');
        });
    });

    describe('getCurrentBranch', () => {
        it('should return current branch name', async () => {
            mockRunSecure.mockResolvedValue({ stdout: 'feature-branch' });

            const result = await git.getCurrentBranch();

            expect(result).toBe('feature-branch');
            expect(mockRunSecure).toHaveBeenCalledWith('git', ['branch', '--show-current']);
        });

        it('should handle git command errors', async () => {
            mockRunSecure.mockRejectedValue(new Error('Git command failed'));

            await expect(git.getCurrentBranch()).rejects.toThrow('Git command failed');
        });
    });

    describe('getGitStatusSummary', () => {
        it('should handle remote branch not existing', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({ stdout: 'M  modified.txt' }) // status
                .mockResolvedValueOnce({}) // fetch
                .mockRejectedValueOnce(new Error('Remote branch not found')); // remote branch check

            const result = await git.getGitStatusSummary();

            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unpushedCount).toBe(0);
        });

        it('should handle working directory parameter', async () => {
            const originalCwd = process.cwd;
            process.cwd = vi.fn().mockReturnValue('/original/dir');

            try {
                await git.getGitStatusSummary('/test/dir');

                expect(process.cwd).toHaveBeenCalled();
            } finally {
                process.cwd = originalCwd;
            }
        });

        it('should return clean status when no changes', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({ stdout: '' }) // status (clean)
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0' }); // unpushed count

            const result = await git.getGitStatusSummary();

            expect(result.branch).toBe('main');
            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unstagedCount).toBe(0);
            expect(result.uncommittedCount).toBe(0);
            expect(result.unpushedCount).toBe(0);
            expect(result.status).toBe('clean');
        });

        it('should detect unstaged files correctly', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({ stdout: '?? newfile.txt\n M modified.txt' }) // status with unstaged
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0' }); // unpushed count

            const result = await git.getGitStatusSummary();

            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.unstagedCount).toBe(2); // ?? and M (second char)
            expect(result.status).toContain('2 unstaged');
        });

        it('should detect uncommitted changes correctly', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({ stdout: 'M  staged.txt\nA  newfile.txt' }) // status with staged
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '0' }); // unpushed count

            const result = await git.getGitStatusSummary();

            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.uncommittedCount).toBe(2); // M and A (first char)
            expect(result.status).toContain('2 uncommitted');
        });

        it('should detect unpushed commits correctly', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({ stdout: '' }) // status (clean)
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '3' }); // unpushed count

            const result = await git.getGitStatusSummary();

            expect(result.hasUnpushedCommits).toBe(true);
            expect(result.unpushedCount).toBe(3);
            expect(result.status).toContain('3 unpushed');
        });

        it('should handle complex status combinations', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'feature' }) // current branch
                .mockResolvedValueOnce({ stdout: 'M  staged.txt\n M modified.txt\n?? newfile.txt' }) // mixed status
                .mockResolvedValueOnce({}) // fetch
                .mockResolvedValueOnce({ stdout: 'abc123' }) // remoteBranchExists check
                .mockResolvedValueOnce({ stdout: '2' }); // unpushed count

            const result = await git.getGitStatusSummary();

            expect(result.branch).toBe('feature');
            expect(result.hasUnstagedFiles).toBe(true);
            expect(result.hasUncommittedChanges).toBe(true);
            expect(result.hasUnpushedCommits).toBe(true);
            expect(result.unstagedCount).toBe(2); // M (second char) and ??
            expect(result.uncommittedCount).toBe(1); // M (first char)
            expect(result.unpushedCount).toBe(2);
            expect(result.status).toContain('2 unstaged');
            expect(result.status).toContain('1 uncommitted');
            expect(result.status).toContain('2 unpushed');
        });

        it('should handle fetch errors gracefully', async () => {
            mockRunSecure
                .mockResolvedValueOnce({ stdout: 'main' }) // current branch
                .mockResolvedValueOnce({ stdout: '' }) // status
                .mockRejectedValueOnce(new Error('Fetch failed')); // fetch fails

            const result = await git.getGitStatusSummary();

            expect(result.hasUnpushedCommits).toBe(false);
            expect(result.unpushedCount).toBe(0);
        });

        it('should handle git command errors by returning error status', async () => {
            mockRunSecure.mockRejectedValue(new Error('Git command failed'));

            const result = await git.getGitStatusSummary();

            expect(result.branch).toBe('unknown');
            expect(result.status).toBe('error');
            expect(result.hasUnstagedFiles).toBe(false);
            expect(result.hasUncommittedChanges).toBe(false);
            expect(result.hasUnpushedCommits).toBe(false);
        });
    });

    describe('getGloballyLinkedPackages', () => {
        it('should return set of globally linked packages', async () => {
            const mockExecPromise = vi.fn().mockResolvedValue({ stdout: '{"dependencies":{"package1":"1.0.0","package2":"2.0.0"}}' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({ dependencies: { package1: '1.0.0', package2: '2.0.0' } });

            const result = await git.getGloballyLinkedPackages();

            expect(result).toEqual(new Set(['package1', 'package2']));
            expect(mockExecPromise).toHaveBeenCalledWith('npm ls --link -g --json');
        });

        it('should return empty set when no dependencies', async () => {
            const mockExecPromise = vi.fn().mockResolvedValue({ stdout: '{"dependencies":{}}' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({ dependencies: {} });

            const result = await git.getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });

        it('should handle exec errors by trying to parse stdout', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({ stdout: '{"dependencies":{"package1":"1.0.0"}}' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({ dependencies: { package1: '1.0.0' } });

            const result = await git.getGloballyLinkedPackages();

            expect(result).toEqual(new Set(['package1']));
        });

        it('should return empty set when JSON parsing fails', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({ stdout: 'invalid-json' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockImplementation(() => { throw new Error('Invalid JSON'); });

            const result = await git.getGloballyLinkedPackages();

            expect(result).toEqual(new Set());
        });
    });

    describe('getLinkedDependencies', () => {
        it('should return set of linked dependencies', async () => {
            const mockExecPromise = vi.fn().mockResolvedValue({ stdout: '{"dependencies":{"dep1":"1.0.0","dep2":"2.0.0"}}' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({ dependencies: { dep1: '1.0.0', dep2: '2.0.0' } });

            const result = await git.getLinkedDependencies('/test/dir');

            expect(result).toEqual(new Set(['dep1', 'dep2']));
            expect(mockExecPromise).toHaveBeenCalledWith('npm ls --link --json', { cwd: '/test/dir' });
        });

        it('should handle exec errors by trying to parse stdout', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({ stdout: '{"dependencies":{"dep1":"1.0.0"}}' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({ dependencies: { dep1: '1.0.0' } });

            const result = await git.getLinkedDependencies('/test/dir');

            expect(result).toEqual(new Set(['dep1']));
        });

        it('should return empty set when JSON parsing fails', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({ stdout: 'invalid-json' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockImplementation(() => { throw new Error('Invalid JSON'); });

            const result = await git.getLinkedDependencies('/test/dir');

            expect(result).toEqual(new Set());
        });
    });

    describe('getLinkCompatibilityProblems', () => {
        beforeEach(() => {
            mockValidatePackageJson.mockReturnValue({
                name: 'test-package',
                version: '1.0.0',
                dependencies: {},
                devDependencies: {},
                peerDependencies: {},
                optionalDependencies: {}
            });
        });

        it('should handle file read errors gracefully', async () => {
            mockFs.readFile.mockRejectedValue(new Error('File not found'));

            const result = await git.getLinkCompatibilityProblems('/test/dir');

            expect(result).toEqual(new Set());
        });

        it('should handle package.json parsing errors gracefully', async () => {
            mockSafeJsonParse.mockImplementation(() => { throw new Error('Invalid JSON'); });

            const result = await git.getLinkCompatibilityProblems('/test/dir');

            expect(result).toEqual(new Set());
        });

        it('should return empty set when no linked dependencies', async () => {
            mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{}}');
            mockSafeJsonParse.mockReturnValue({ name: 'test', dependencies: {} });
            mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{}}' });
            mockSafeJsonParse.mockReturnValue({ dependencies: {} });

            const result = await git.getLinkCompatibilityProblems('/test/dir');

            expect(result).toEqual(new Set());
        });

        it('should check compatibility for linked dependencies', async () => {
            // Mock package.json with linked dependency
            mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{"linked-dep":"^1.0.0"}}');
            mockSafeJsonParse.mockReturnValue({
                name: 'test',
                dependencies: { 'linked-dep': '^1.0.0' }
            });

            // Mock linked dependencies
            mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{"linked-dep":{"version":"1.0.0"}}}' });
            mockSafeJsonParse.mockReturnValue({ dependencies: { 'linked-dep': { version: '1.0.0' } } });

            // Mock linked package version reading
            mockFs.readFile
                .mockResolvedValueOnce('{"name":"test","dependencies":{"linked-dep":"^1.0.0"}}') // package.json
                .mockResolvedValueOnce('{"name":"linked-dep","version":"1.0.0"}'); // linked package.json

            mockSafeJsonParse
                .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^1.0.0' } }) // package.json
                .mockReturnValueOnce({ name: 'linked-dep', version: '1.0.0' }); // linked package.json

            mockValidatePackageJson
                .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^1.0.0' } }) // package.json
                .mockReturnValueOnce({ name: 'linked-dep', version: '1.0.0' }); // linked package.json

            // Mock semver compatibility check
            const mockSemVer = { major: 1, minor: 0, patch: 0, prerelease: [] } as any;
            mockSemver.parse.mockReturnValue(mockSemVer);
            mockSemver.validRange.mockReturnValue('^1.0.0');
            mockSemver.satisfies.mockReturnValue(true);

            const result = await git.getLinkCompatibilityProblems('/test/dir');

            expect(result).toEqual(new Set());
        });

        // TODO: Fix semver mocking for version compatibility tests
        // it('should detect incompatible versions', async () => {
        //     // Mock package.json with linked dependency
        //     mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{"linked-dep":"^1.0.0"}}');
        //     mockSafeJsonParse.mockReturnValue({
        //         name: 'test',
        //         dependencies: { 'linked-dep': '^1.0.0' }
        //     });

        //     // Mock linked dependencies
        //     mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{"linked-dep":{"version":"2.0.0"}}}' });
        //     mockSafeJsonParse.mockReturnValue({ dependencies: { 'linked-dep': { version: '2.0.0' } } });

        //     // Mock linked package version reading
        //     mockFs.readFile
        //         .mockResolvedValueOnce('{"name":"test","dependencies":{"linked-dep":"^1.0.0"}}') // package.json
        //         .mockResolvedValueOnce('{"name":"linked-dep","version":"2.0.0"}'); // linked package.json

        //     mockSafeJsonParse
        //         .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^1.0.0' } }) // package.json
        //         .mockReturnValueOnce({ name: 'linked-dep', version: '2.0.0' }); // linked package.json

        //     mockValidatePackageJson
        //         .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^1.0.0' } }) // package.json
        //         .mockReturnValueOnce({ name: 'linked-dep', version: '2.0.0' }); // linked package.json

        //     // Mock semver to simulate incompatibility
        //     mockSemver.parse.mockReturnValue(null); // Invalid version to trigger incompatibility

        //     const result = await git.getLinkCompatibilityProblems('/test/dir');

        //     expect(result).toEqual(new Set(['linked-dep']));
        // });

        it('should use provided package info when available', async () => {
            const allPackagesInfo = new Map([
                ['linked-dep', { name: 'linked-dep', version: '1.0.0', path: '/path/to/dep' }]
            ]);

            mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{"linked-dep":"^1.0.0"}}');
            mockSafeJsonParse.mockReturnValue({
                name: 'test',
                dependencies: { 'linked-dep': '^1.0.0' }
            });

            // Mock linked dependencies
            mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{"linked-dep":{"version":"1.0.0"}}}' });
            mockSafeJsonParse.mockReturnValue({ dependencies: { 'linked-dep': { version: '1.0.0' } } });

            // Mock semver compatibility check
            const mockSemVer = { major: 1, minor: 0, patch: 0, prerelease: [] } as any;
            mockSemver.parse.mockReturnValue(mockSemVer);
            mockSemver.validRange.mockReturnValue('^1.0.0');
            mockSemver.satisfies.mockReturnValue(true);

            const result = await git.getLinkCompatibilityProblems('/test/dir', allPackagesInfo);

            expect(result).toEqual(new Set());
            // Should not try to read linked package.json since we have package info
            expect(mockFs.readFile).toHaveBeenCalledTimes(1); // Only package.json
        });

        it('should check all dependency types', async () => {
            mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{"dep1":"^1.0.0"},"devDependencies":{"dep2":"^2.0.0"},"peerDependencies":{"dep3":"^3.0.0"},"optionalDependencies":{"dep4":"^4.0.0"}}');
            mockSafeJsonParse.mockReturnValue({
                name: 'test',
                dependencies: { 'dep1': '^1.0.0' },
                devDependencies: { 'dep2': '^2.0.0' },
                peerDependencies: { 'dep3': '^3.0.0' },
                optionalDependencies: { 'dep4': '^4.0.0' }
            });

            // Mock linked dependencies
            mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{"dep1":{"version":"1.0.0"},"dep2":{"version":"2.0.0"},"dep3":{"version":"3.0.0"},"dep4":{"version":"4.0.0"}}}' });
            mockSafeJsonParse.mockReturnValue({
                dependencies: {
                    'dep1': { version: '1.0.0' },
                    'dep2': { version: '2.0.0' },
                    'dep3': { version: '3.0.0' },
                    'dep4': { version: '4.0.0' }
                }
            });

            // Mock semver compatibility checks
            const mockSemVer = { major: 1, minor: 0, patch: 0, prerelease: [] } as any;
            mockSemver.parse.mockReturnValue(mockSemVer);
            mockSemver.validRange.mockReturnValue('^1.0.0');
            mockSemver.satisfies.mockReturnValue(true);

            const result = await git.getLinkCompatibilityProblems('/test/dir');

            expect(result).toEqual(new Set());
        });

        it('should handle caret ranges with prerelease versions correctly', async () => {
            mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{"linked-dep":"^4.4"}}');
            mockSafeJsonParse.mockReturnValue({
                name: 'test',
                dependencies: { 'linked-dep': '^4.4' }
            });

            mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{"linked-dep":{"version":"4.4.53-dev.0"}}}' });
            mockSafeJsonParse.mockReturnValue({ dependencies: { 'linked-dep': { version: '4.4.53-dev.0' } } });

            mockFs.readFile
                .mockResolvedValueOnce('{"name":"test","dependencies":{"linked-dep":"^4.4"}}')
                .mockResolvedValueOnce('{"name":"linked-dep","version":"4.4.53-dev.0"}');

            mockSafeJsonParse
                .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^4.4' } })
                .mockReturnValueOnce({ name: 'linked-dep', version: '4.4.53-dev.0' });

            mockValidatePackageJson
                .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^4.4' } })
                .mockReturnValueOnce({ name: 'linked-dep', version: '4.4.53-dev.0' });

            // Mock semver for caret range with prerelease
            const mockSemVer = { major: 4, minor: 4, patch: 53, prerelease: ['dev', 0] } as any;
            mockSemver.parse.mockReturnValue(mockSemVer);
            mockSemver.validRange.mockReturnValue('^4.4');
            mockSemver.coerce.mockReturnValue({ major: 4, minor: 4, patch: 0 } as any);
            mockSemver.satisfies.mockReturnValue(false); // Standard semver would fail

            const result = await git.getLinkCompatibilityProblems('/test/dir');

            // Should be compatible because 4.4.53-dev.0 matches ^4.4 (same major.minor)
            expect(result).toEqual(new Set());
        });

        // TODO: Fix semver mocking for version compatibility tests
        // it('should reject incompatible minor versions with caret ranges', async () => {
        //     mockFs.readFile.mockResolvedValue('{"name":"test","dependencies":{"linked-dep":"^4.4"}}');
        //     mockSafeJsonParse.mockReturnValue({
        //         name: 'test',
        //         dependencies: { 'linked-dep': '^4.4' }
        //     });

        //     mockRunSecure.mockRejectedValue({ stdout: '{"dependencies":{"linked-dep":{"version":"4.5.3"}}}' });
        //     mockSafeJsonParse.mockReturnValue({ dependencies: { 'linked-dep': { version: '4.5.3' } } });

        //     mockFs.readFile
        //         .mockResolvedValueOnce('{"name":"test","dependencies":{"linked-dep":"^4.4"}}')
        //         .mockResolvedValueOnce('{"name":"linked-dep","version":"4.5.3"}');

        //     mockSafeJsonParse
        //         .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^4.4' } })
        //         .mockReturnValueOnce({ name: 'linked-dep', version: '4.5.3' });

        //     mockValidatePackageJson
        //         .mockReturnValueOnce({ name: 'test', dependencies: { 'linked-dep': '^4.4' } })
        //         .mockReturnValueOnce({ name: 'linked-dep', version: '4.5.3' });

        //     // Mock semver to simulate incompatibility
        //     mockSemver.parse.mockReturnValue(null); // Invalid version to trigger incompatibility

        //     const result = await git.getLinkCompatibilityProblems('/test/dir');

        //     // Should be incompatible because semver parsing fails
        //     expect(result).toEqual(new Set(['linked-dep']));
        // });
    });

    describe('getLinkProblems', () => {
        it('should return set of problematic dependencies from npm output', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({
                stdout: '{"problems":["invalid: linked-dep@2.0.0 ..."],"dependencies":{"linked-dep":{"invalid":true}}}'
            });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({
                problems: ['invalid: linked-dep@2.0.0 ...'],
                dependencies: { 'linked-dep': { invalid: true } }
            });

            const result = await git.getLinkProblems('/test/dir');

            expect(result).toEqual(new Set(['linked-dep']));
        });

        it('should handle scoped package names in problems', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({
                stdout: '{"problems":["invalid: @scope/package@1.0.0 ..."]}'
            });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({
                problems: ['invalid: @scope/package@1.0.0 ...']
            });

            const result = await git.getLinkProblems('/test/dir');

            expect(result).toEqual(new Set(['@scope/package']));
        });

        it('should return empty set when no problems', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({
                stdout: '{"dependencies":{"linked-dep":{"invalid":false}}}'
            });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockReturnValue({
                dependencies: { 'linked-dep': { invalid: false } }
            });

            const result = await git.getLinkProblems('/test/dir');

            expect(result).toEqual(new Set());
        });

        it('should handle JSON parsing errors gracefully', async () => {
            const mockExecPromise = vi.fn().mockRejectedValue({ stdout: 'invalid-json' });
            mockUtilPromisify.mockReturnValue(mockExecPromise);
            mockSafeJsonParse.mockImplementation(() => { throw new Error('Invalid JSON'); });

            const result = await git.getLinkProblems('/test/dir');

            expect(result).toEqual(new Set());
        });
    });

    describe('isNpmLinked', () => {
        beforeEach(() => {
            mockSafeJsonParse.mockReturnValue({ name: 'test-package' });
            mockValidatePackageJson.mockReturnValue({ name: 'test-package', version: '1.0.0' });
        });

        it('should return false when package is not globally linked', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockResolvedValue({ stdout: '{"dependencies":{}}' });
            mockSafeJsonParse.mockReturnValue({ dependencies: {} });

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false when package.json does not exist', async () => {
            mockFs.access.mockRejectedValue(new Error('File not found'));

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false when package has no name', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockSafeJsonParse.mockReturnValue({});

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should try alternative check when npm ls fails', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockRejectedValue(new Error('npm ls failed'));
            mockRun.mockResolvedValue({ stdout: '/global/npm' });
            mockFs.lstat.mockResolvedValue({ isSymbolicLink: () => true } as any);
            mockFs.realpath
                .mockResolvedValueOnce('/real/test/dir') // package dir
                .mockResolvedValueOnce('/real/test/dir'); // global symlink

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(true);
        });

        it('should return false when all checks fail', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockRejectedValue(new Error('npm ls failed'));
            mockRun.mockRejectedValue(new Error('npm prefix failed'));

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should handle realpath errors gracefully', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockResolvedValue({ stdout: '{"dependencies":{"test-package":{"resolved":"file:/test/dir"}}}' });
            mockSafeJsonParse.mockReturnValue({
                dependencies: { 'test-package': { resolved: 'file:/test/dir' } }
            });
            mockFs.realpath.mockRejectedValue(new Error('Realpath failed'));

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should return true when package is globally linked via npm ls', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockSafeJsonParse
                .mockReturnValueOnce({ name: 'test-package' }) // package.json
                .mockReturnValueOnce({ dependencies: { 'test-package': { resolved: 'file:/test/dir' } } }); // npm ls output
            mockRunSecure.mockResolvedValue({ stdout: '{"dependencies":{"test-package":{"resolved":"file:/test/dir"}}}' });
            mockFs.realpath
                .mockResolvedValueOnce('/real/test/dir') // package dir
                .mockResolvedValueOnce('/real/test/dir'); // global symlink

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(true);
        });

        it('should return false when package is not in global dependencies', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockResolvedValue({ stdout: '{"dependencies":{"other-package":{"resolved":"file:/other/dir"}}}' });
            mockSafeJsonParse.mockReturnValue({
                dependencies: { 'other-package': { resolved: 'file:/other/dir' } }
            });

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false when resolved path does not start with file:', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockResolvedValue({ stdout: '{"dependencies":{"test-package":{"resolved":"https://registry.npmjs.org/test-package"}}}' });
            mockSafeJsonParse.mockReturnValue({
                dependencies: { 'test-package': { resolved: 'https://registry.npmjs.org/test-package' } }
            });

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should return false when realpaths do not match', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockResolvedValue({ stdout: '{"dependencies":{"test-package":{"resolved":"file:/test/dir"}}}' });
            mockSafeJsonParse.mockReturnValue({
                dependencies: { 'test-package': { resolved: 'file:/test/dir' } }
            });
            mockFs.realpath
                .mockResolvedValueOnce('/real/test/dir') // package dir
                .mockResolvedValueOnce('/different/path'); // global symlink

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should return true when package is linked via alternative check', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockRejectedValue(new Error('npm ls failed'));
            mockRun.mockResolvedValue({ stdout: '/global/npm' });
            mockFs.lstat.mockResolvedValue({ isSymbolicLink: () => true } as any);
            mockFs.realpath
                .mockResolvedValueOnce('/real/test/dir') // package dir
                .mockResolvedValueOnce('/real/test/dir'); // global symlink

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(true);
            expect(mockRun).toHaveBeenCalledWith('npm prefix -g');
        });

        it('should return false when global node_modules is not a symlink', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockRejectedValue(new Error('npm ls failed'));
            mockRun.mockResolvedValue({ stdout: '/global/npm' });
            mockFs.lstat.mockResolvedValue({ isSymbolicLink: () => false } as any);

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should handle npm prefix errors gracefully', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockRejectedValue(new Error('npm ls failed'));
            mockRun.mockRejectedValue(new Error('npm prefix failed'));

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });

        it('should handle lstat errors gracefully', async () => {
            mockFs.access.mockResolvedValue(undefined);
            mockRunSecure.mockRejectedValue(new Error('npm ls failed'));
            mockRun.mockResolvedValue({ stdout: '/global/npm' });
            mockFs.lstat.mockRejectedValue(new Error('Lstat failed'));

            const result = await git.isNpmLinked('/test/dir');

            expect(result).toBe(false);
        });
    });
});
