import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as branchState from '../../src/utils/branchState';
import * as gitTools from '@eldrforge/git-tools';

vi.mock('@eldrforge/git-tools');

describe('branchState utilities', () => {
    const originalCwd = process.cwd();

    beforeEach(() => {
        vi.clearAllMocks();
        // Mock chdir to prevent actual directory changes
        vi.spyOn(process, 'chdir').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.chdir(originalCwd);
    });

    describe('checkBranchStatus', () => {
        it('should return correct status for synced branch', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' }) // current branch
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // remote exists
                .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '' }); // ahead/behind

            const status = await branchState.checkBranchStatus('/path/to/pkg', 'main');

            expect(status.name).toBe('main');
            expect(status.isOnExpectedBranch).toBe(true);
            expect(status.ahead).toBe(0);
            expect(status.behind).toBe(0);
            expect(status.hasUnpushedCommits).toBe(false);
            expect(status.needsSync).toBe(false);
            expect(status.remoteExists).toBe(true);
        });

        it('should return correct status for branch ahead of remote', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: 'working\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: '0\t3\n', stderr: '' });

            const status = await branchState.checkBranchStatus('/path/to/pkg', 'working');

            expect(status.ahead).toBe(3);
            expect(status.hasUnpushedCommits).toBe(true);
        });

        it('should return correct status for branch behind remote', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: '5\t0\n', stderr: '' });

            const status = await branchState.checkBranchStatus('/path/to/pkg', 'main');

            expect(status.behind).toBe(5);
            expect(status.needsSync).toBe(true);
        });

        it('should handle wrong branch', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '' });

            const status = await branchState.checkBranchStatus('/path/to/pkg', 'working');

            expect(status.isOnExpectedBranch).toBe(false);
            expect(status.expectedBranch).toBe('working');
        });

        it('should handle remote not existing', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: 'feature\n', stderr: '' })
                .mockRejectedValueOnce(new Error('Remote not found'));

            const status = await branchState.checkBranchStatus('/path/to/pkg');

            expect(status.remoteExists).toBe(false);
            expect(status.ahead).toBe(0);
            expect(status.behind).toBe(0);
        });
    });

    describe('auditBranchState', () => {
        it('should audit multiple packages', async () => {
            vi.mocked(gitTools.run)
                // Package 1: all good
                .mockResolvedValueOnce({ stdout: 'main\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: '0\t0\n', stderr: '' })
                // Package 2: ahead of remote
                .mockResolvedValueOnce({ stdout: 'working\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: '0\t2\n', stderr: '' });

            const packages = [
                { name: '@pkg/good', path: '/path/to/good' },
                { name: '@pkg/ahead', path: '/path/to/ahead' },
            ];

            const result = await branchState.auditBranchState(packages, 'main');

            expect(result.totalPackages).toBe(2);
            expect(result.goodPackages).toBe(1);
            expect(result.issuesFound).toBe(1);

            const goodPkg = result.audits.find(a => a.packageName === '@pkg/good');
            expect(goodPkg?.issues).toHaveLength(0);

            const aheadPkg = result.audits.find(a => a.packageName === '@pkg/ahead');
            expect(aheadPkg?.issues.length).toBeGreaterThan(0);
            expect(aheadPkg?.fixes.length).toBeGreaterThan(0);
        });

        it('should identify all types of issues', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: 'wrong-branch\n', stderr: '' })
                .mockResolvedValueOnce({ stdout: '', stderr: '' })
                .mockResolvedValueOnce({ stdout: '2\t3\n', stderr: '' });

            const packages = [{ name: '@pkg/issues', path: '/path' }];
            const result = await branchState.auditBranchState(packages, 'main');

            const audit = result.audits[0];
            expect(audit.issues.some(i => i.includes('wrong branch'))).toBe(true);
            expect(audit.issues.some(i => i.includes('Ahead of remote'))).toBe(true);
            expect(audit.issues.some(i => i.includes('Behind remote'))).toBe(true);
        });
    });

    describe('formatAuditResults', () => {
        it('should format results with good packages', () => {
            const result: branchState.BranchAuditResult = {
                totalPackages: 2,
                goodPackages: 2,
                issuesFound: 0,
                audits: [
                    {
                        packageName: '@pkg/one',
                        path: '/path/one',
                        status: {
                            name: 'main',
                            isOnExpectedBranch: true,
                            ahead: 0,
                            behind: 0,
                            hasUnpushedCommits: false,
                            needsSync: false,
                            remoteExists: true,
                        },
                        issues: [],
                        fixes: [],
                    },
                    {
                        packageName: '@pkg/two',
                        path: '/path/two',
                        status: {
                            name: 'main',
                            isOnExpectedBranch: true,
                            ahead: 0,
                            behind: 0,
                            hasUnpushedCommits: false,
                            needsSync: false,
                            remoteExists: true,
                        },
                        issues: [],
                        fixes: [],
                    },
                ],
            };

            const formatted = branchState.formatAuditResults(result);

            expect(formatted).toContain('Branch State Audit');
            expect(formatted).toContain('Good State (2 packages)');
            expect(formatted).toContain('@pkg/one');
            expect(formatted).toContain('@pkg/two');
        });

        it('should format results with issues', () => {
            const result: branchState.BranchAuditResult = {
                totalPackages: 1,
                goodPackages: 0,
                issuesFound: 1,
                audits: [
                    {
                        packageName: '@pkg/bad',
                        path: '/path/bad',
                        status: {
                            name: 'wrong',
                            isOnExpectedBranch: false,
                            expectedBranch: 'main',
                            ahead: 0,
                            behind: 0,
                            hasUnpushedCommits: false,
                            needsSync: false,
                            remoteExists: true,
                        },
                        issues: ['On wrong branch: wrong (expected: main)'],
                        fixes: ['cd /path/bad && git checkout main'],
                    },
                ],
            };

            const formatted = branchState.formatAuditResults(result);

            expect(formatted).toContain('Issues Found (1 package)');
            expect(formatted).toContain('@pkg/bad');
            expect(formatted).toContain('wrong branch');
            expect(formatted).toContain('Fix:');
        });
    });

    describe('autoSyncBranch', () => {
        it('should checkout, pull, and push successfully', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkout
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // pull
                .mockResolvedValueOnce({ stdout: '', stderr: '' }); // push

            const result = await branchState.autoSyncBranch('/path', {
                checkout: 'main',
                pull: true,
                push: true,
            });

            expect(result.success).toBe(true);
            expect(result.actions).toContain('Checked out main');
            expect(result.actions).toContain('Pulled from remote');
            expect(result.actions).toContain('Pushed to remote');
        });

        it('should fail on non-fast-forward', async () => {
            vi.mocked(gitTools.run)
                .mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkout
                .mockRejectedValueOnce(new Error('not possible to fast-forward'));

            const result = await branchState.autoSyncBranch('/path', {
                checkout: 'main',
                pull: true,
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Fast-forward not possible');
        });

        it('should restore cwd on error', async () => {
            const cwdSpy = vi.spyOn(process, 'chdir');
            vi.mocked(gitTools.run).mockRejectedValue(new Error('fail'));

            await branchState.autoSyncBranch('/path', { checkout: 'main' });

            // Should have called chdir twice: into /path and back to originalCwd
            expect(cwdSpy).toHaveBeenCalledTimes(2);
        });
    });
});

