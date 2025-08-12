import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as child from '../../src/util/child';
import * as git from '../../src/util/git';
import * as validation from '../../src/util/validation';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';

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
vi.mock('semver');

const mockRun = child.run as Mock;
const mockRunSecure = child.runSecure as Mock;
const mockValidateGitRef = child.validateGitRef as Mock;
const mockSafeJsonParse = validation.safeJsonParse as Mock;
const mockValidatePackageJson = validation.validatePackageJson as Mock;
const mockExec = exec as unknown as Mock;
const mockUtilPromisify = vi.mocked(util.promisify);
const mockFs = vi.mocked(fs);

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
    });
});
