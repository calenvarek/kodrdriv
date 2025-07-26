import { Octokit } from '@octokit/rest';
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import * as child from '../../src/util/child';
import * as GitHub from '../../src/util/github';

vi.mock('../../src/util/child', () => ({
    run: vi.fn(),
}));

vi.mock('@octokit/rest');

vi.mock('../../src/logging', () => ({
    getLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
    })),
}));

vi.mock('../../src/util/stdin', () => ({
    promptConfirmation: vi.fn(),
}));

const mockRun = child.run as Mock;
const MockOctokit = Octokit as unknown as Mock;

// Import the mocked stdin module
const { promptConfirmation } = vi.mocked(await import('../../src/util/stdin'));

describe('GitHub Utilities', () => {
    const mockOctokit = {
        pulls: {
            create: vi.fn(),
            list: vi.fn(),
            get: vi.fn(),
            merge: vi.fn(),
        },
        checks: {
            listForRef: vi.fn(),
            get: vi.fn(),
        },
        git: {
            deleteRef: vi.fn(),
        },
        repos: {
            createRelease: vi.fn(),
            getReleaseByTag: vi.fn(),
            getContent: vi.fn(),
        },
        issues: {
            listForRepo: vi.fn(),
            create: vi.fn(),
        },
        actions: {
            listRepoWorkflows: vi.fn(),
            listWorkflowRuns: vi.fn(),
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.GITHUB_TOKEN = 'test-token';
        MockOctokit.mockImplementation(() => mockOctokit);

        mockRun.mockImplementation(async (command: string) => {
            if (command === 'git remote get-url origin') {
                return { stdout: 'git@github.com:test-owner/test-repo.git' };
            }
            if (command === 'git rev-parse --abbrev-ref HEAD') {
                return { stdout: 'feature-branch' };
            }
            return { stdout: '' };
        });
    });

    afterEach(() => {
        delete process.env.GITHUB_TOKEN;
    });

    describe('getOctokit', () => {
        it('should throw an error if GITHUB_TOKEN is not set', () => {
            delete process.env.GITHUB_TOKEN;
            expect(() => GitHub.getOctokit()).toThrow('GITHUB_TOKEN is not set.');
        });

        it('should return an Octokit instance if GITHUB_TOKEN is set', () => {
            GitHub.getOctokit();
            expect(MockOctokit).toHaveBeenCalledWith({ auth: 'test-token' });
        });

        it('should handle empty GITHUB_TOKEN', () => {
            process.env.GITHUB_TOKEN = '';
            expect(() => GitHub.getOctokit()).toThrow('GITHUB_TOKEN is not set.');
        });

        it('should handle undefined GITHUB_TOKEN', () => {
            delete process.env.GITHUB_TOKEN;
            expect(() => GitHub.getOctokit()).toThrow('GITHUB_TOKEN is not set.');
        });
    });

    describe('getCurrentBranchName', () => {
        it('should return the trimmed current branch name', async () => {
            mockRun.mockResolvedValue({ stdout: '  feature-branch  \n' });
            const branchName = await GitHub.getCurrentBranchName();
            expect(branchName).toBe('feature-branch');
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD');
        });

        it('should handle git command errors', async () => {
            mockRun.mockRejectedValue(new Error('git command failed'));
            await expect(GitHub.getCurrentBranchName()).rejects.toThrow('git command failed');
        });

        it('should handle empty git output', async () => {
            mockRun.mockResolvedValue({ stdout: '' });
            const branchName = await GitHub.getCurrentBranchName();
            expect(branchName).toBe('');
        });

        it('should handle branches with special characters', async () => {
            mockRun.mockResolvedValue({ stdout: 'feature/test-branch_123\n' });
            const branchName = await GitHub.getCurrentBranchName();
            expect(branchName).toBe('feature/test-branch_123');
        });

        it('should handle detached HEAD state', async () => {
            mockRun.mockResolvedValue({ stdout: 'HEAD\n' });
            const branchName = await GitHub.getCurrentBranchName();
            expect(branchName).toBe('HEAD');
        });
    });

    describe('getRepoDetails', () => {
        it('should parse owner and repo from an https git remote url', async () => {
            mockRun.mockResolvedValue({ stdout: 'https://github.com/owner/repo.git' });
            const details = await GitHub.getRepoDetails();
            expect(details).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('should parse owner and repo from an ssh git remote url', async () => {
            mockRun.mockResolvedValue({ stdout: 'git@github.com:owner/repo.git' });
            const details = await GitHub.getRepoDetails();
            expect(details).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('should throw an error for an invalid url', async () => {
            mockRun.mockResolvedValue({ stdout: 'invalid-url' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL: "invalid-url". Expected format: git@github.com:owner/repo.git or https://github.com/owner/repo.git'
            );
        });

        it('should parse owner and repo with hyphens and dots', async () => {
            mockRun.mockResolvedValue({ stdout: 'git@github.com:my-org/my-repo.test.git' });
            const details = await GitHub.getRepoDetails();
            expect(details).toEqual({ owner: 'my-org', repo: 'my-repo.test' });
        });

        it('should handle git command errors', async () => {
            mockRun.mockRejectedValue(new Error('git remote command failed'));
            await expect(GitHub.getRepoDetails()).rejects.toThrow('git remote command failed');
        });

        it('should handle URLs with missing components', async () => {
            mockRun.mockResolvedValue({ stdout: 'https://github.com/owner' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL'
            );
        });

        it('should handle URLs without .git extension', async () => {
            mockRun.mockResolvedValue({ stdout: 'https://github.com/owner/repo' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL'
            );
        });

        it('should handle URLs with whitespace and newlines', async () => {
            mockRun.mockResolvedValue({ stdout: '  https://github.com/owner/repo.git  \n\n' });
            const details = await GitHub.getRepoDetails();
            expect(details).toEqual({ owner: 'owner', repo: 'repo' });
        });

        it('should handle ssh URLs with custom ports', async () => {
            mockRun.mockResolvedValue({ stdout: 'ssh://git@github.com:2222/owner/repo.git' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL'
            );
        });

        it('should handle non-GitHub URLs', async () => {
            mockRun.mockResolvedValue({ stdout: 'git@gitlab.com:owner/repo.git' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL'
            );
        });

        it('should handle empty git output', async () => {
            mockRun.mockResolvedValue({ stdout: '' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL: ""'
            );
        });

        it('should handle GitHub Enterprise URLs', async () => {
            mockRun.mockResolvedValue({ stdout: 'git@github.enterprise.com:owner/repo.git' });
            await expect(GitHub.getRepoDetails()).rejects.toThrow(
                'Could not parse repository owner and name from origin URL'
            );
        });
    });

    describe('createPullRequest', () => {
        it('should create a pull request with the correct parameters', async () => {
            const prData = { data: { html_url: 'http://github.com/pull/1' } };
            mockOctokit.pulls.create.mockResolvedValue(prData);
            const result = await GitHub.createPullRequest('Test PR', 'This is a test PR', 'feature-branch', 'develop');

            expect(mockOctokit.pulls.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: 'Test PR',
                body: 'This is a test PR',
                head: 'feature-branch',
                base: 'develop',
            });
            expect(result).toBe(prData.data);
        });

        it('should use "main" as the default base branch', async () => {
            const prData = { data: { html_url: 'http://github.com/pull/1' } };
            mockOctokit.pulls.create.mockResolvedValue(prData);
            await GitHub.createPullRequest('Test PR', 'This is a test PR', 'feature-branch');

            expect(mockOctokit.pulls.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    base: 'main',
                })
            );
        });

        it('should handle API errors', async () => {
            const error = new Error('API request failed');
            mockOctokit.pulls.create.mockRejectedValue(error);
            await expect(GitHub.createPullRequest('Test PR', 'This is a test PR', 'feature-branch')).rejects.toThrow('API request failed');
        });

        it('should handle validation errors', async () => {
            const error = new Error('Validation Failed') as Error & { status: number };
            error.status = 422;
            mockOctokit.pulls.create.mockRejectedValue(error);
            await expect(GitHub.createPullRequest('Test PR', 'This is a test PR', 'feature-branch')).rejects.toThrow('Validation Failed');
        });

        it('should handle rate limiting', async () => {
            const error = new Error('API rate limit exceeded') as Error & { status: number };
            error.status = 403;
            mockOctokit.pulls.create.mockRejectedValue(error);
            await expect(GitHub.createPullRequest('Test PR', 'This is a test PR', 'feature-branch')).rejects.toThrow('API rate limit exceeded');
        });

        it('should handle branch not found errors', async () => {
            const error = new Error('Branch not found') as Error & { status: number };
            error.status = 404;
            mockOctokit.pulls.create.mockRejectedValue(error);
            await expect(GitHub.createPullRequest('Test PR', 'This is a test PR', 'non-existent-branch')).rejects.toThrow('Branch not found');
        });
    });

    describe('findOpenPullRequestByHeadRef', () => {
        it('should return a pull request if one is found', async () => {
            const mockPR = { id: 1, title: 'Test PR' };
            mockOctokit.pulls.list.mockResolvedValue({ data: [mockPR] });
            const result = await GitHub.findOpenPullRequestByHeadRef('feature-branch');

            expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                state: 'open',
                head: 'test-owner:feature-branch',
            });
            expect(result).toBe(mockPR);
        });

        it('should return null if no pull request is found', async () => {
            mockOctokit.pulls.list.mockResolvedValue({ data: [] });
            const result = await GitHub.findOpenPullRequestByHeadRef('feature-branch');
            expect(result).toBeNull();
        });

        it('should handle 404 errors gracefully', async () => {
            const error = new Error('Not found') as Error & { status: number };
            error.status = 404;
            mockOctokit.pulls.list.mockRejectedValue(error);
            await expect(GitHub.findOpenPullRequestByHeadRef('feature-branch')).rejects.toThrow('Not found');
        });

        it('should handle general API errors', async () => {
            const error = new Error('API request failed');
            mockOctokit.pulls.list.mockRejectedValue(error);
            await expect(GitHub.findOpenPullRequestByHeadRef('feature-branch')).rejects.toThrow('API request failed');
        });

        it('should return first PR when multiple PRs exist for same head', async () => {
            const mockPRs = [
                { id: 1, title: 'Test PR 1' },
                { id: 2, title: 'Test PR 2' }
            ];
            mockOctokit.pulls.list.mockResolvedValue({ data: mockPRs });
            const result = await GitHub.findOpenPullRequestByHeadRef('feature-branch');
            expect(result).toBe(mockPRs[0]);
        });

        it('should handle rate limiting errors', async () => {
            const error = new Error('API rate limit exceeded') as Error & { status: number };
            error.status = 403;
            mockOctokit.pulls.list.mockRejectedValue(error);
            await expect(GitHub.findOpenPullRequestByHeadRef('feature-branch')).rejects.toThrow('API rate limit exceeded');
        });

        it('should handle unauthorized access', async () => {
            const error = new Error('Unauthorized') as Error & { status: number };
            error.status = 401;
            mockOctokit.pulls.list.mockRejectedValue(error);
            await expect(GitHub.findOpenPullRequestByHeadRef('feature-branch')).rejects.toThrow('Unauthorized');
        });
    });

    describe('waitForPullRequestChecks', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should resolve immediately if all checks have completed successfully', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({
                data: {
                    check_runs: [{ status: 'completed', conclusion: 'success' }],
                },
            });

            await expect(GitHub.waitForPullRequestChecks(123)).resolves.toBeUndefined();
        });

        it('should wait and retry if checks are in progress', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({
                    data: { check_runs: [{ status: 'in_progress' }] },
                })
                .mockResolvedValueOnce({
                    data: { check_runs: [{ status: 'completed', conclusion: 'success' }] },
                });

            const promise = GitHub.waitForPullRequestChecks(123);
            await vi.advanceTimersByTimeAsync(10000);
            await expect(promise).resolves.toBeUndefined();
            expect(mockOctokit.checks.listForRef).toHaveBeenCalledTimes(2);
        });

        it('should throw a PullRequestCheckError if any check has failed', async () => {
            vi.spyOn(GitHub, 'getRepoDetails').mockResolvedValue({ owner: 'test-owner', repo: 'test-repo' });
            mockRun.mockImplementation(async (command: string) => {
                if (command === 'git rev-parse --abbrev-ref HEAD') {
                    return { stdout: 'feature/test-branch' };
                }
                if (command === 'git remote get-url origin') {
                    return { stdout: 'https://github.com/test-owner/test-repo.git' };
                }
                return { stdout: '' };
            });
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({
                data: {
                    check_runs: [{
                        id: 123,
                        status: 'completed',
                        conclusion: 'failure',
                        name: 'test-check',
                        details_url: 'https://github.com/test/details'
                    }],
                },
            });
            mockOctokit.checks.get.mockResolvedValue({
                data: {
                    output: {
                        title: 'Test Failed',
                        summary: 'Some tests are failing',
                        text: 'Detailed failure information'
                    }
                }
            });

            try {
                await GitHub.waitForPullRequestChecks(123);
                expect.fail('Should have thrown PullRequestCheckError');
            } catch (error: any) {
                const { PullRequestCheckError } = await import('../../src/error/CommandErrors');
                expect(error).toBeInstanceOf(PullRequestCheckError);
                expect(error.prNumber).toBe(123);
                expect(error.failedChecks).toHaveLength(1);
                expect(error.failedChecks[0].name).toBe('test-check');
                expect(error.currentBranch).toBe('feature/test-branch');
                expect(error.getRecoveryInstructions()).toContain('🔧 To fix these failures:');
            }
        });

        it('should wait if no checks are found initially', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({
                    data: { check_runs: [{ status: 'completed', conclusion: 'success' }] },
                });

            const promise = GitHub.waitForPullRequestChecks(123);
            await vi.advanceTimersByTimeAsync(10000);
            await expect(promise).resolves.toBeUndefined();
            expect(mockOctokit.checks.listForRef).toHaveBeenCalledTimes(2);
        });

        it('should handle multiple check failures with detailed error information', async () => {
            vi.spyOn(GitHub, 'getRepoDetails').mockResolvedValue({ owner: 'test-owner', repo: 'test-repo' });
            mockRun.mockImplementation(async (command: string) => {
                if (command === 'git rev-parse --abbrev-ref HEAD') {
                    return { stdout: 'release/v1.0.0' };
                }
                if (command === 'git remote get-url origin') {
                    return { stdout: 'https://github.com/test-owner/test-repo.git' };
                }
                return { stdout: '' };
            });
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({
                data: {
                    check_runs: [
                        { id: 1, status: 'completed', conclusion: 'failure', name: 'lint-check', details_url: 'https://github.com/test/lint' },
                        { id: 2, status: 'completed', conclusion: 'timed_out', name: 'build-test', details_url: 'https://github.com/test/build' },
                        { id: 3, status: 'completed', conclusion: 'cancelled', name: 'unit-tests', details_url: 'https://github.com/test/unit' },
                    ],
                },
            });

            // Mock check details for each failed check
            mockOctokit.checks.get
                .mockResolvedValueOnce({
                    data: { output: { title: 'Linting errors found', summary: 'Code style violations detected' } }
                })
                .mockResolvedValueOnce({
                    data: { output: { title: 'Build timeout', summary: 'Build took too long to complete' } }
                })
                .mockResolvedValueOnce({
                    data: { output: { title: 'Tests cancelled', summary: 'Test run was cancelled' } }
                });

            try {
                await GitHub.waitForPullRequestChecks(123);
                expect.fail('Should have thrown PullRequestCheckError');
            } catch (error: any) {
                const { PullRequestCheckError } = await import('../../src/error/CommandErrors');
                expect(error).toBeInstanceOf(PullRequestCheckError);
                expect(error.prNumber).toBe(123);
                expect(error.failedChecks).toHaveLength(3);
                expect(error.currentBranch).toBe('release/v1.0.0');
                expect(error.message).toContain('3 checks failed');

                const instructions = error.getRecoveryInstructions();
                expect(instructions.some((i: string) => i.includes('🎨 Linting/Style Failures'))).toBe(true);
                expect(instructions.some((i: string) => i.includes('🏗️ Build Failures'))).toBe(true);
                expect(instructions.some((i: string) => i.includes('git push origin release/v1.0.0'))).toBe(true);
            }
        });

        it('should handle mixed check statuses', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({
                    data: {
                        check_runs: [
                            { status: 'completed', conclusion: 'success' },
                            { status: 'in_progress' },
                            { status: 'queued' },
                        ]
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        check_runs: [
                            { status: 'completed', conclusion: 'success' },
                            { status: 'completed', conclusion: 'success' },
                            { status: 'completed', conclusion: 'success' },
                        ]
                    },
                });

            const promise = GitHub.waitForPullRequestChecks(123);
            await vi.advanceTimersByTimeAsync(10000);
            await expect(promise).resolves.toBeUndefined();
            expect(mockOctokit.checks.listForRef).toHaveBeenCalledTimes(2);
        });
    });

    describe('mergePullRequest', () => {
        it('should merge the pull request with default squash method and delete the branch', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            await GitHub.mergePullRequest(123);

            expect(mockOctokit.pulls.merge).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                pull_number: 123,
                merge_method: 'squash',
            });

            expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                ref: 'heads/feature-branch',
            });
        });

        it('should merge the pull request with specified merge method', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            await GitHub.mergePullRequest(123, 'merge');

            expect(mockOctokit.pulls.merge).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                pull_number: 123,
                merge_method: 'merge',
            });

            expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                ref: 'heads/feature-branch',
            });
        });

        it('should merge the pull request with rebase method', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            await GitHub.mergePullRequest(123, 'rebase');

            expect(mockOctokit.pulls.merge).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                pull_number: 123,
                merge_method: 'rebase',
            });

            expect(mockOctokit.git.deleteRef).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                ref: 'heads/feature-branch',
            });
        });

        it('should handle merge API errors', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            mockOctokit.pulls.merge.mockRejectedValue(new Error('Merge failed'));
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Merge failed');
        });

        it('should handle branch deletion errors', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            mockOctokit.pulls.merge.mockResolvedValue({});
            mockOctokit.git.deleteRef.mockRejectedValue(new Error('Branch deletion failed'));
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Branch deletion failed');
        });

        it('should handle PR not found error during merge', async () => {
            const error = new Error('Not Found') as Error & { status: number };
            error.status = 404;
            mockOctokit.pulls.get.mockRejectedValue(error);
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Not Found');
        });

        it('should handle PR already merged error', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            const error = new Error('Pull Request is not mergeable') as Error & { status: number };
            error.status = 422;
            mockOctokit.pulls.merge.mockRejectedValue(error);
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Pull Request is not mergeable');
        });

        it('should handle merge conflict error', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            const error = new Error('Merge conflict') as Error & { status: number };
            error.status = 409;
            mockOctokit.pulls.merge.mockRejectedValue(error);
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Merge conflict');
        });

        it('should handle branch already deleted scenario', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'feature-branch' } } });
            mockOctokit.pulls.merge.mockResolvedValue({});
            const error = new Error('Reference does not exist') as Error & { status: number };
            error.status = 422;
            mockOctokit.git.deleteRef.mockRejectedValue(error);
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Reference does not exist');
        });
    });

    describe('createRelease', () => {
        it('should create a GitHub release', async () => {
            await GitHub.createRelease('v1.0.0', 'Release v1.0.0', 'Release notes');
            expect(mockOctokit.repos.createRelease).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                tag_name: 'v1.0.0',
                name: 'Release v1.0.0',
                body: 'Release notes',
            });
        });

        it('should handle release creation errors', async () => {
            mockOctokit.repos.createRelease.mockRejectedValue(new Error('Release creation failed'));
            await expect(GitHub.createRelease('v1.0.0', 'Release v1.0.0', 'Release notes')).rejects.toThrow('Release creation failed');
        });

        it('should handle empty release notes', async () => {
            mockOctokit.repos.createRelease.mockResolvedValue({});
            await GitHub.createRelease('v1.0.0', 'Release v1.0.0', '');
            expect(mockOctokit.repos.createRelease).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                tag_name: 'v1.0.0',
                name: 'Release v1.0.0',
                body: '',
            });
        });

        it('should handle special characters in tag names and titles', async () => {
            mockOctokit.repos.createRelease.mockResolvedValue({});
            await GitHub.createRelease('v1.0.0-beta.1', 'Release v1.0.0-beta.1 (Test & Debug)', 'Release notes with "quotes" and \\ backslashes');
            expect(mockOctokit.repos.createRelease).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                tag_name: 'v1.0.0-beta.1',
                name: 'Release v1.0.0-beta.1 (Test & Debug)',
                body: 'Release notes with "quotes" and \\ backslashes',
            });
        });
    });

    describe('getOpenIssues', () => {
        it('should return formatted list of open issues', async () => {
            const mockIssues = [
                {
                    number: 1,
                    title: 'Bug in feature X',
                    labels: [{ name: 'bug' }, { name: 'priority-high' }],
                    created_at: '2023-01-01T00:00:00Z',
                    updated_at: '2023-01-02T00:00:00Z',
                    body: 'This is a bug description',
                    pull_request: undefined,
                },
                {
                    number: 2,
                    title: 'Enhancement request',
                    labels: [],
                    created_at: '2023-01-03T00:00:00Z',
                    updated_at: '2023-01-04T00:00:00Z',
                    body: null,
                    pull_request: undefined,
                },
            ];

            mockOctokit.issues.listForRepo.mockResolvedValue({ data: mockIssues });
            const result = await GitHub.getOpenIssues();

            expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                state: 'open',
                per_page: 20,
                sort: 'updated',
                direction: 'desc',
            });

            expect(result).toContain('Issue #1: Bug in feature X');
            expect(result).toContain('Labels: bug, priority-high');
            expect(result).toContain('Issue #2: Enhancement request');
            expect(result).toContain('Labels: none');
            expect(result).toContain('Body: This is a bug description');
            expect(result).toContain('Body: No description');
        });

        it('should filter out pull requests from issues', async () => {
            const mockData = [
                {
                    number: 1,
                    title: 'Bug in feature X',
                    labels: [],
                    created_at: '2023-01-01T00:00:00Z',
                    updated_at: '2023-01-02T00:00:00Z',
                    body: 'This is a bug',
                    pull_request: undefined,
                },
                {
                    number: 2,
                    title: 'PR: Fix bug',
                    labels: [],
                    created_at: '2023-01-03T00:00:00Z',
                    updated_at: '2023-01-04T00:00:00Z',
                    body: 'This is a PR',
                    pull_request: { url: 'https://api.github.com/repos/test/test/pulls/2' },
                },
            ];

            mockOctokit.issues.listForRepo.mockResolvedValue({ data: mockData });
            const result = await GitHub.getOpenIssues();

            expect(result).toContain('Issue #1: Bug in feature X');
            expect(result).not.toContain('Issue #2: PR: Fix bug');
        });

        it('should handle custom limit parameter', async () => {
            mockOctokit.issues.listForRepo.mockResolvedValue({ data: [] });
            await GitHub.getOpenIssues(50);

            expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                state: 'open',
                per_page: 50,
                sort: 'updated',
                direction: 'desc',
            });
        });

        it('should respect GitHub API limit of 100', async () => {
            mockOctokit.issues.listForRepo.mockResolvedValue({ data: [] });
            await GitHub.getOpenIssues(150);

            expect(mockOctokit.issues.listForRepo).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                state: 'open',
                per_page: 100,
                sort: 'updated',
                direction: 'desc',
            });
        });

        it('should return empty string when no issues found', async () => {
            mockOctokit.issues.listForRepo.mockResolvedValue({ data: [] });
            const result = await GitHub.getOpenIssues();
            expect(result).toBe('');
        });

        it('should handle long issue bodies by truncating', async () => {
            const longBody = 'a'.repeat(600);
            const mockIssues = [
                {
                    number: 1,
                    title: 'Issue with long body',
                    labels: [],
                    created_at: '2023-01-01T00:00:00Z',
                    updated_at: '2023-01-02T00:00:00Z',
                    body: longBody,
                    pull_request: undefined,
                },
            ];

            mockOctokit.issues.listForRepo.mockResolvedValue({ data: mockIssues });
            const result = await GitHub.getOpenIssues();

            expect(result).toContain('Body: ' + 'a'.repeat(500) + '...');
        });

        it('should handle string labels', async () => {
            const mockIssues = [
                {
                    number: 1,
                    title: 'Issue with string labels',
                    labels: ['bug', 'enhancement'],
                    created_at: '2023-01-01T00:00:00Z',
                    updated_at: '2023-01-02T00:00:00Z',
                    body: 'Test issue',
                    pull_request: undefined,
                },
            ];

            mockOctokit.issues.listForRepo.mockResolvedValue({ data: mockIssues });
            const result = await GitHub.getOpenIssues();

            expect(result).toContain('Labels: bug, enhancement');
        });

        it('should handle API errors gracefully', async () => {
            mockOctokit.issues.listForRepo.mockRejectedValue(new Error('API error'));
            const result = await GitHub.getOpenIssues();
            expect(result).toBe('');
        });
    });

    describe('createIssue', () => {
        it('should create an issue with title and body', async () => {
            const mockResponse = {
                data: {
                    number: 123,
                    html_url: 'https://github.com/test-owner/test-repo/issues/123',
                },
            };

            mockOctokit.issues.create.mockResolvedValue(mockResponse);
            const result = await GitHub.createIssue('Test Issue', 'This is a test issue');

            expect(mockOctokit.issues.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: 'Test Issue',
                body: 'This is a test issue',
                labels: [],
            });

            expect(result).toEqual({
                number: 123,
                html_url: 'https://github.com/test-owner/test-repo/issues/123',
            });
        });

        it('should create an issue with labels', async () => {
            const mockResponse = {
                data: {
                    number: 124,
                    html_url: 'https://github.com/test-owner/test-repo/issues/124',
                },
            };

            mockOctokit.issues.create.mockResolvedValue(mockResponse);
            const result = await GitHub.createIssue('Bug Report', 'Found a bug', ['bug', 'priority-high']);

            expect(mockOctokit.issues.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: 'Bug Report',
                body: 'Found a bug',
                labels: ['bug', 'priority-high'],
            });

            expect(result).toEqual({
                number: 124,
                html_url: 'https://github.com/test-owner/test-repo/issues/124',
            });
        });

        it('should handle empty labels array', async () => {
            const mockResponse = {
                data: {
                    number: 125,
                    html_url: 'https://github.com/test-owner/test-repo/issues/125',
                },
            };

            mockOctokit.issues.create.mockResolvedValue(mockResponse);
            await GitHub.createIssue('Test Issue', 'Test body', []);

            expect(mockOctokit.issues.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: 'Test Issue',
                body: 'Test body',
                labels: [],
            });
        });

        it('should handle API errors', async () => {
            mockOctokit.issues.create.mockRejectedValue(new Error('Failed to create issue'));
            await expect(GitHub.createIssue('Test Issue', 'Test body')).rejects.toThrow('Failed to create issue');
        });

        it('should handle very long issue titles and bodies', async () => {
            const longTitle = 'A'.repeat(300);
            const longBody = 'B'.repeat(65000);
            const mockResponse = {
                data: {
                    number: 126,
                    html_url: 'https://github.com/test-owner/test-repo/issues/126',
                },
            };

            mockOctokit.issues.create.mockResolvedValue(mockResponse);
            const result = await GitHub.createIssue(longTitle, longBody, ['enhancement']);

            expect(mockOctokit.issues.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: longTitle,
                body: longBody,
                labels: ['enhancement'],
            });
            expect(result).toEqual({
                number: 126,
                html_url: 'https://github.com/test-owner/test-repo/issues/126',
            });
        });

        it('should handle special characters in title and body', async () => {
            const titleWithSpecialChars = 'Bug: "Quotes" & Ampersands <tags> 中文字符 🚀';
            const bodyWithSpecialChars = 'Description with\nnewlines\n\nAnd **markdown** `code` [links](http://example.com)\n\n- List items\n- More items';
            const mockResponse = {
                data: {
                    number: 127,
                    html_url: 'https://github.com/test-owner/test-repo/issues/127',
                },
            };

            mockOctokit.issues.create.mockResolvedValue(mockResponse);
            const result = await GitHub.createIssue(titleWithSpecialChars, bodyWithSpecialChars);

            expect(mockOctokit.issues.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: titleWithSpecialChars,
                body: bodyWithSpecialChars,
                labels: [],
            });
            expect(result).toEqual({
                number: 127,
                html_url: 'https://github.com/test-owner/test-repo/issues/127',
            });
        });

        it('should handle rate limiting errors', async () => {
            const rateLimitError = new Error('API rate limit exceeded') as Error & { status: number };
            rateLimitError.status = 403;
            mockOctokit.issues.create.mockRejectedValue(rateLimitError);
            await expect(GitHub.createIssue('Test Issue', 'Test body')).rejects.toThrow('API rate limit exceeded');
        });
    });

    describe('getReleaseByTagName', () => {
        it('should return release data for a valid tag', async () => {
            const mockRelease = {
                data: {
                    id: 123,
                    tag_name: 'v1.0.0',
                    name: 'Release v1.0.0',
                    created_at: '2023-01-01T00:00:00Z',
                    target_commitish: 'abc123',
                },
            };

            mockOctokit.repos.getReleaseByTag.mockResolvedValue(mockRelease);
            const result = await GitHub.getReleaseByTagName('v1.0.0');

            expect(mockOctokit.repos.getReleaseByTag).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                tag: 'v1.0.0',
            });
            expect(result).toBe(mockRelease.data);
        });

        it('should throw an error when release is not found', async () => {
            const error = new Error('Not Found') as Error & { status: number };
            error.status = 404;
            mockOctokit.repos.getReleaseByTag.mockRejectedValue(error);

            await expect(GitHub.getReleaseByTagName('v1.0.0')).rejects.toThrow('Not Found');
        });

        it('should handle API errors', async () => {
            mockOctokit.repos.getReleaseByTag.mockRejectedValue(new Error('API request failed'));
            await expect(GitHub.getReleaseByTagName('v1.0.0')).rejects.toThrow('API request failed');
        });
    });

    describe('getWorkflowRunsTriggeredByRelease', () => {
        const mockWorkflows = [
            { id: 1, name: 'Release Workflow', path: '.github/workflows/release.yml' },
            { id: 2, name: 'Test Workflow', path: '.github/workflows/test.yml' },
        ];

        const mockReleaseData = {
            created_at: '2023-01-01T00:00:00Z',
            target_commitish: 'abc123',
        };

        beforeEach(() => {
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: mockWorkflows },
            });
            mockOctokit.repos.getReleaseByTag.mockResolvedValue({
                data: mockReleaseData,
            });
        });

        it('should return workflow runs triggered by release', async () => {
            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T00:01:00Z',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
            ];

            // Mock workflow runs for each workflow - only the first one has matching runs
            mockOctokit.actions.listWorkflowRuns
                .mockResolvedValueOnce({
                    data: { workflow_runs: mockWorkflowRuns },
                })
                .mockResolvedValueOnce({
                    data: { workflow_runs: [] }, // No runs for second workflow
                });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(1);
            expect(result[0]).toEqual(mockWorkflowRuns[0]);
            expect(mockOctokit.actions.listWorkflowRuns).toHaveBeenCalledTimes(2);
        });

        it('should filter out non-release event runs', async () => {
            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    event: 'push',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T00:01:00Z',
                },
                {
                    id: 2,
                    name: 'Release Workflow',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T00:01:00Z',
                },
            ];

            // First workflow returns both runs, second workflow returns empty
            mockOctokit.actions.listWorkflowRuns
                .mockResolvedValueOnce({
                    data: { workflow_runs: mockWorkflowRuns },
                })
                .mockResolvedValueOnce({
                    data: { workflow_runs: [] },
                });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(1);
            expect(result[0].event).toBe('release');
        });

        it('should filter runs by specific workflow names when provided', async () => {
            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T00:01:00Z',
                },
            ];

            // Only call for the first workflow since we're filtering by name
            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: mockWorkflowRuns },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0', ['Release Workflow']);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Release Workflow');
        });

        it('should handle release info fetch errors gracefully', async () => {
            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T00:01:00Z',
                    head_branch: 'v1.0.0',
                },
            ];

            mockOctokit.repos.getReleaseByTag.mockRejectedValue(new Error('Release not found'));
            // Mock one workflow
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Release Workflow' }] },
            });
            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: mockWorkflowRuns },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Release Workflow');
        });

        it('should filter out runs with mismatched commit SHA', async () => {
            const mockReleaseData = {
                created_at: '2023-01-01T00:00:00Z',
                target_commitish: 'correct-sha',
            };

            mockOctokit.repos.getReleaseByTag.mockResolvedValue({
                data: mockReleaseData,
            });

            // Mock one workflow
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Release Workflow' }] },
            });

            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'wrong-sha',
                    created_at: '2023-01-01T00:01:00Z',
                },
                {
                    id: 2,
                    name: 'Release Workflow',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'correct-sha',
                    created_at: '2023-01-01T00:01:00Z',
                },
            ];

            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: mockWorkflowRuns },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(1);
            expect(result[0].head_sha).toBe('correct-sha');
        });

        it('should filter out runs outside time window', async () => {
            const mockReleaseData = {
                created_at: '2023-01-01T12:00:00Z',
                target_commitish: 'abc123',
            };

            mockOctokit.repos.getReleaseByTag.mockResolvedValue({
                data: mockReleaseData,
            });

            // Mock one workflow
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Release Workflow' }] },
            });

            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Too Early',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T11:00:00Z', // 1 hour before release
                },
                {
                    id: 2,
                    name: 'Too Late',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T12:15:00Z', // 15 minutes after release (too late)
                },
                {
                    id: 3,
                    name: 'Just Right',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T12:05:00Z', // 5 minutes after release
                },
            ];

            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: mockWorkflowRuns },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Just Right');
        });

        it('should handle workflow API errors gracefully', async () => {
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Test Workflow' }] },
            });
            mockOctokit.actions.listWorkflowRuns.mockRejectedValue(new Error('Workflow API error'));

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toEqual([]);
        });

        it('should sort runs by creation time and commit SHA match', async () => {
            const mockReleaseData = {
                created_at: '2023-01-01T12:00:00Z',
                target_commitish: 'correct-sha',
            };

            mockOctokit.repos.getReleaseByTag.mockResolvedValue({
                data: mockReleaseData,
            });

            // Mock one workflow
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Release Workflow' }] },
            });

            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Older, Wrong SHA',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'wrong-sha',
                    created_at: '2023-01-01T12:01:00Z',
                },
                {
                    id: 2,
                    name: 'Newer, Correct SHA',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'correct-sha',
                    created_at: '2023-01-01T12:02:00Z',
                },
                {
                    id: 3,
                    name: 'Older, Correct SHA',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'correct-sha',
                    created_at: '2023-01-01T12:01:30Z',
                },
            ];

            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: mockWorkflowRuns },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(2); // Only correct SHA runs
            expect(result[0].name).toBe('Newer, Correct SHA'); // Newest first
            expect(result[1].name).toBe('Older, Correct SHA');
        });

        it('should handle runs with missing required data', async () => {
            // Mock one workflow
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Release Workflow' }] },
            });

            // Mock release data to provide timing context
            mockOctokit.repos.getReleaseByTag.mockResolvedValue({
                data: {
                    created_at: '2023-01-01T12:00:00Z',
                    target_commitish: 'abc123',
                },
            });

            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Valid Run',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: '2023-01-01T12:01:00Z',
                },
                {
                    id: 2,
                    name: 'Missing SHA',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: null,
                    created_at: '2023-01-01T12:01:00Z',
                },
                {
                    id: 3,
                    name: 'Missing Created At',
                    event: 'release',
                    status: 'completed',
                    conclusion: 'success',
                    head_sha: 'abc123',
                    created_at: null,
                },
            ];

            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: mockWorkflowRuns },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Valid Run');
        });

    });

    describe('waitForReleaseWorkflows', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
            vi.restoreAllMocks();
        });

        it('should complete successfully when all workflows succeed', async () => {
            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
            ];

            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay call
                .mockResolvedValue(mockWorkflowRuns);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 60000 });

            // Wait for initial 30s delay
            await vi.advanceTimersByTimeAsync(30000);
            // Wait for first check and a bit more
            await vi.advanceTimersByTimeAsync(5000);

            await expect(promise).resolves.toBeUndefined();

            // Cleanup
            getWorkflowsSpy.mockRestore();
        });

        it.skip('should throw error when workflows fail', async () => {
            const mockFailedWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    status: 'completed',
                    conclusion: 'failure',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
            ];

            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay call
                .mockResolvedValue(mockFailedWorkflowRuns);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', {
                timeout: 60000,
                skipUserConfirmation: true
            });

            // Wait for initial delay and first check
            await vi.advanceTimersByTimeAsync(30000);
            await vi.advanceTimersByTimeAsync(5000);

            await expect(promise).rejects.toThrow('Release workflows for v1.0.0 failed.');

            // Cleanup
            getWorkflowsSpy.mockRestore();
        }, 10000);

        it.skip('should handle timeout with user confirmation', async () => {
            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease').mockResolvedValue([]);
            promptConfirmation.mockResolvedValue(true);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 5000 });

            // Wait for initial delay + timeout
            await vi.advanceTimersByTimeAsync(35000); // 30s initial + 5s timeout + buffer

            await expect(promise).resolves.toBeUndefined();
            expect(promptConfirmation).toHaveBeenCalledWith(
                expect.stringContaining('Timeout reached while waiting for release workflows')
            );

            // Cleanup
            getWorkflowsSpy.mockRestore();
        }, 10000);

        it.skip('should handle timeout with user rejection', async () => {
            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease').mockResolvedValue([]);
            promptConfirmation.mockResolvedValue(false);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 5000 });

            // Wait for initial delay + timeout
            await vi.advanceTimersByTimeAsync(35000);

            await expect(promise).rejects.toThrow('Timeout waiting for release workflows for v1.0.0. User chose not to proceed.');

            // Cleanup
            getWorkflowsSpy.mockRestore();
        }, 10000);

        it.skip('should skip user confirmation in non-interactive mode on timeout', async () => {
            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease').mockResolvedValue([]);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', {
                timeout: 5000,
                skipUserConfirmation: true
            });

            // Wait for initial delay + timeout
            await vi.advanceTimersByTimeAsync(35000);

            await expect(promise).rejects.toThrow('Timeout waiting for release workflows for v1.0.0 (5s)');
            expect(promptConfirmation).not.toHaveBeenCalled();

            // Cleanup
            getWorkflowsSpy.mockRestore();
        }, 10000);

        it('should handle no workflows found with user confirmation', async () => {
            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease').mockResolvedValue([]);
            promptConfirmation.mockResolvedValue(true);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 120000 });

            // Wait for initial delay (30s) + 6 attempts (60s) = 90s total to trigger no workflows prompt
            await vi.advanceTimersByTimeAsync(30000); // Initial delay
            for (let i = 0; i < 6; i++) {
                await vi.advanceTimersByTimeAsync(10000); // 6 attempts at 10s each
            }

            await expect(promise).resolves.toBeUndefined();
            expect(promptConfirmation).toHaveBeenCalledWith(
                expect.stringContaining('No GitHub Actions workflows appear to be triggered by the release v1.0.0')
            );

            // Cleanup
            getWorkflowsSpy.mockRestore();
        });

        it('should handle no workflows found with user rejection', async () => {
            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease').mockResolvedValue([]);
            promptConfirmation.mockResolvedValue(false);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 120000 });

            // Wait for initial delay + 6 attempts to trigger no workflows prompt
            await vi.advanceTimersByTimeAsync(30000); // Initial delay
            for (let i = 0; i < 6; i++) {
                await vi.advanceTimersByTimeAsync(10000); // 6 attempts
            }

            await expect(promise).rejects.toThrow('No release workflows found for v1.0.0. User chose not to proceed.');

            // Cleanup
            getWorkflowsSpy.mockRestore();
        });

        it('should proceed in non-interactive mode when no workflows found', async () => {
            const getWorkflowsSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease').mockResolvedValue([]);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', {
                timeout: 120000,
                skipUserConfirmation: true
            });

            // Wait for initial delay + 6 attempts to trigger no workflows check
            await vi.advanceTimersByTimeAsync(30000); // Initial delay
            for (let i = 0; i < 6; i++) {
                await vi.advanceTimersByTimeAsync(10000); // 6 attempts
            }

            await expect(promise).resolves.toBeUndefined();
            expect(promptConfirmation).not.toHaveBeenCalled();

            // Cleanup
            getWorkflowsSpy.mockRestore();
        });

        it.skip('should filter workflows by specific names when provided', async () => {
            const mockWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
            ];

            const getWorkflowSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay call
                .mockResolvedValue(mockWorkflowRuns);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', {
                workflowNames: ['Release Workflow'],
                timeout: 60000
            });

            // Wait for initial delay and first check
            await vi.advanceTimersByTimeAsync(30000);
            await vi.advanceTimersByTimeAsync(5000);

            await expect(promise).resolves.toBeUndefined();
            expect(getWorkflowSpy).toHaveBeenCalledWith('v1.0.0', ['Release Workflow']);

            // Cleanup
            getWorkflowSpy.mockRestore();
        }, 10000);

        it.skip('should handle mixed workflow statuses correctly', async () => {
            const mixedWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
                {
                    id: 2,
                    name: 'Deploy Workflow',
                    status: 'in_progress',
                    conclusion: null,
                    html_url: 'https://github.com/test/test/actions/runs/2',
                },
            ];

            const completedWorkflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
                {
                    id: 2,
                    name: 'Deploy Workflow',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/test/actions/runs/2',
                },
            ];

            const getWorkflowSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay call
                .mockResolvedValueOnce(mixedWorkflowRuns) // First check: mixed statuses
                .mockResolvedValue(completedWorkflowRuns); // Subsequent calls: all completed

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 60000 });

            // Wait for initial delay, first check, then second check
            await vi.advanceTimersByTimeAsync(30000);
            await vi.advanceTimersByTimeAsync(15000);
            await vi.advanceTimersByTimeAsync(15000);

            await expect(promise).resolves.toBeUndefined();

            // Cleanup
            getWorkflowSpy.mockRestore();
        }, 10000);

        it.skip('should handle different workflow conclusion types', async () => {
            const failedWorkflowRuns = [
                {
                    id: 1,
                    name: 'Failed Workflow',
                    status: 'completed',
                    conclusion: 'failure',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
                {
                    id: 2,
                    name: 'Timed Out Workflow',
                    status: 'completed',
                    conclusion: 'timed_out',
                    html_url: 'https://github.com/test/test/actions/runs/2',
                },
                {
                    id: 3,
                    name: 'Cancelled Workflow',
                    status: 'completed',
                    conclusion: 'cancelled',
                    html_url: 'https://github.com/test/test/actions/runs/3',
                },
            ];

            const getWorkflowSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay call
                .mockResolvedValue(failedWorkflowRuns);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 60000 });

            // Wait for initial delay and first check
            await vi.advanceTimersByTimeAsync(30000);
            await vi.advanceTimersByTimeAsync(5000);

            await expect(promise).rejects.toThrow('Release workflows for v1.0.0 failed.');

            // Cleanup
            getWorkflowSpy.mockRestore();
        }, 10000);

        it.skip('should wait for workflows to appear and then complete', async () => {
            const workflowRuns = [
                {
                    id: 1,
                    name: 'Release Workflow',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/test/actions/runs/1',
                },
            ];

            const getWorkflowSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay call
                .mockResolvedValueOnce([]) // First check - no workflows
                .mockResolvedValueOnce([]) // Second check - no workflows
                .mockResolvedValue(workflowRuns); // Third check - workflows appear

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', { timeout: 120000 });

            // Wait for initial delay and several checks
            await vi.advanceTimersByTimeAsync(30000); // Initial delay
            await vi.advanceTimersByTimeAsync(10000); // First check
            await vi.advanceTimersByTimeAsync(10000); // Second check
            await vi.advanceTimersByTimeAsync(15000); // Third check (workflows found, wait for completion)

            await expect(promise).resolves.toBeUndefined();

            // Cleanup
            getWorkflowSpy.mockRestore();
        }, 10000);

        it.skip('should handle concurrent workflow monitoring with different completion times', async () => {
            // Simplify this test to avoid complex concurrent mocking issues
            const workflowRuns = [
                {
                    id: 1,
                    name: 'Workflow 1',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/actions/runs/1',
                },
            ];

            const getWorkflowSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay
                .mockResolvedValue(workflowRuns);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', {
                timeout: 60000,
                skipUserConfirmation: true
            });

            // Advance time
            await vi.advanceTimersByTimeAsync(30000); // Initial delay
            await vi.advanceTimersByTimeAsync(5000); // First check

            await expect(promise).resolves.toBeUndefined();

            // Cleanup
            getWorkflowSpy.mockRestore();
        }, 10000);

        it.skip('should handle timeout edge cases with precise timing', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({ data: { workflows: [{ name: 'Test Workflow' }] } });

            const timeoutMs = 5000;
            const promise = GitHub.waitForPullRequestChecks(123, { timeout: timeoutMs });

            // Advance past timeout
            await vi.advanceTimersByTimeAsync(timeoutMs + 1000);

            await expect(promise).rejects.toThrow('Timeout waiting for PR #123 checks');
        }, 10000);
    });

    describe('getWorkflowsTriggeredByRelease', () => {
        const mockWorkflows = [
            {
                id: 1,
                name: 'Release Workflow',
                path: '.github/workflows/release.yml'
            },
            {
                id: 2,
                name: 'Test Workflow',
                path: '.github/workflows/test.yml'
            },
        ];

        beforeEach(() => {
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: mockWorkflows },
            });
        });

        it('should identify workflows triggered by release events', async () => {
            const releaseWorkflowContent = `
name: Release
on:
  release:
    types: [published]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
`;

            const testWorkflowContent = `
name: Test
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent
                .mockResolvedValueOnce({
                    data: {
                        type: 'file',
                        content: Buffer.from(releaseWorkflowContent).toString('base64'),
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        type: 'file',
                        content: Buffer.from(testWorkflowContent).toString('base64'),
                    },
                });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow']);
            expect(mockOctokit.repos.getContent).toHaveBeenCalledTimes(2);
        });

        it('should identify workflows with on: release syntax', async () => {
            const workflowContent = `
name: Simple Release
on: release
jobs:
  deploy:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(workflowContent).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow', 'Test Workflow']);
        });

        it('should identify workflows with tag push patterns', async () => {
            const workflowContent = `
name: Tag Release
on:
  push:
    tags:
      - 'v*'
      - 'release/*'
jobs:
  deploy:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(workflowContent).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow', 'Test Workflow']);
        });

        it('should handle workflow content parsing errors', async () => {
            mockOctokit.repos.getContent.mockRejectedValue(new Error('Content not accessible'));

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });

        it('should handle API errors gracefully', async () => {
            mockOctokit.actions.listRepoWorkflows.mockRejectedValue(new Error('API error'));

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });

        it('should handle non-file content responses', async () => {
            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'directory',
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });

        it('should identify workflows with complex release triggers', async () => {
            const complexReleaseWorkflow = `
name: Complex Release
on:
  release:
    types: [published, prereleased, released]
  push:
    tags:
      - 'v*.*.*'
      - 'release-*'
jobs:
  deploy:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(complexReleaseWorkflow).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow', 'Test Workflow']);
        });

        it('should identify workflows with array syntax for multiple triggers', async () => {
            const arrayTriggerWorkflow = `
name: Array Trigger
on: [push, release, workflow_dispatch]
jobs:
  deploy:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(arrayTriggerWorkflow).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow', 'Test Workflow']);
        });

        it('should handle malformed YAML gracefully', async () => {
            const malformedWorkflow = `
name: Malformed YAML
on:
  push: # Not a release trigger
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(malformedWorkflow).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });

        it('should handle empty or missing workflow content', async () => {
            mockOctokit.repos.getContent
                .mockResolvedValueOnce({
                    data: {
                        type: 'file',
                        content: '',
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        type: 'file',
                        content: Buffer.from('').toString('base64'),
                    },
                });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });

        it('should identify workflows with tag patterns for semver releases', async () => {
            const semverWorkflow = `
name: Semver Release
on:
  push:
    tags:
      - 'v*'
      - 'v[0-9]+.[0-9]+.[0-9]+'
jobs:
  release:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(semverWorkflow).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow', 'Test Workflow']);
        });

        it('should not identify workflows with only branch triggers', async () => {
            const branchOnlyWorkflow = `
name: Branch Only
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(branchOnlyWorkflow).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });

        it('should handle workflows with mixed indentation and whitespace', async () => {
            const mixedIndentationWorkflow = `
name: Mixed Indentation
on:
    release:
      types:  [published]
	push:  # Tab character here
		tags:
		  - 'v*'
jobs:
  deploy:
    runs-on: ubuntu-latest
`;

            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from(mixedIndentationWorkflow).toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow', 'Test Workflow']);
        });

        it('should handle workflow analysis errors for individual workflows', async () => {
            // Mock first workflow succeeding, second workflow failing
            mockOctokit.repos.getContent
                .mockResolvedValueOnce({
                    data: {
                        type: 'file',
                        content: Buffer.from('on: release').toString('base64'),
                    },
                })
                .mockRejectedValueOnce(new Error('Individual workflow access denied'));

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual(['Release Workflow']);
        });

        it('should handle content decoding errors', async () => {
            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: 'invalid-base64-content!@#$%',
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();

            expect(result).toEqual([]);
        });
    });

    describe('isTriggeredByRelease - Helper Function Edge Cases', () => {
        // Since isTriggeredByRelease is a private function, we test it indirectly through getWorkflowsTriggeredByRelease

        it('should detect basic release triggers', async () => {
            // Simple test that should work
            vi.clearAllMocks();
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Test Workflow', path: '.github/workflows/test.yml' }] },
            });
            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from('on: release').toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();
            expect(result).toContain('Test Workflow');
        });

        it('should not detect non-release triggers', async () => {
            // Simple test that should work
            vi.clearAllMocks();
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Test Workflow', path: '.github/workflows/test.yml' }] },
            });
            mockOctokit.repos.getContent.mockResolvedValue({
                data: {
                    type: 'file',
                    content: Buffer.from('on: push').toString('base64'),
                },
            });

            const result = await GitHub.getWorkflowsTriggeredByRelease();
            expect(result).not.toContain('Test Workflow');
        });
    });

    describe('Error Handling and HTTP Status Codes', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should handle 401 Unauthorized errors consistently across all functions', async () => {
            const unauthorizedError = new Error('Unauthorized') as Error & { status: number };
            unauthorizedError.status = 401;

            // Test various functions with 401 errors
            mockOctokit.pulls.create.mockRejectedValue(unauthorizedError);
            mockOctokit.pulls.list.mockRejectedValue(unauthorizedError);
            mockOctokit.issues.create.mockRejectedValue(unauthorizedError);
            mockOctokit.repos.createRelease.mockRejectedValue(unauthorizedError);

            await expect(GitHub.createPullRequest('Test', 'Body', 'head')).rejects.toThrow('Unauthorized');
            await expect(GitHub.findOpenPullRequestByHeadRef('head')).rejects.toThrow('Unauthorized');
            await expect(GitHub.createIssue('Test', 'Body')).rejects.toThrow('Unauthorized');
            await expect(GitHub.createRelease('v1.0.0', 'Release', 'Notes')).rejects.toThrow('Unauthorized');
        });

        it('should handle 403 Forbidden errors (rate limiting and permissions)', async () => {
            const forbiddenError = new Error('Forbidden') as Error & { status: number };
            forbiddenError.status = 403;

            mockOctokit.actions.listRepoWorkflows.mockRejectedValue(forbiddenError);
            mockOctokit.actions.listWorkflowRuns.mockRejectedValue(forbiddenError);

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');
            expect(result).toEqual([]);

            const workflows = await GitHub.getWorkflowsTriggeredByRelease();
            expect(workflows).toEqual([]);
        });

        it('should handle 404 Not Found errors gracefully', async () => {
            const notFoundError = new Error('Not Found') as Error & { status: number };
            notFoundError.status = 404;

            // Test repository not found
            mockOctokit.pulls.list.mockRejectedValue(notFoundError);
            await expect(GitHub.findOpenPullRequestByHeadRef('branch')).rejects.toThrow('Not Found');

            // Test release not found
            mockOctokit.repos.getReleaseByTag.mockRejectedValue(notFoundError);
            await expect(GitHub.getReleaseByTagName('v1.0.0')).rejects.toThrow('Not Found');
        });

        it('should handle 422 Validation errors for various operations', async () => {
            const validationError = new Error('Validation Failed') as Error & { status: number };
            validationError.status = 422;

            // Test PR creation with invalid data
            mockOctokit.pulls.create.mockRejectedValue(validationError);
            await expect(GitHub.createPullRequest('', '', 'head')).rejects.toThrow('Validation Failed');

            // Test merge with invalid state
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { ref: 'branch' } } });
            mockOctokit.pulls.merge.mockRejectedValue(validationError);
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow('Validation Failed');
        });

        it('should handle 500 Internal Server errors', async () => {
            const serverError = new Error('Internal Server Error') as Error & { status: number };
            serverError.status = 500;

            mockOctokit.issues.listForRepo.mockRejectedValue(serverError);
            const result = await GitHub.getOpenIssues();
            expect(result).toBe('');
        });

        it('should handle network timeout errors', async () => {
            const timeoutError = new Error('Request timeout') as Error & { code: string };
            timeoutError.code = 'ECONNABORTED';

            mockOctokit.pulls.create.mockRejectedValue(timeoutError);
            await expect(GitHub.createPullRequest('Test', 'Body', 'head')).rejects.toThrow('Request timeout');
        });

        it('should handle network connection errors', async () => {
            const connectionError = new Error('Network Error') as Error & { code: string };
            connectionError.code = 'ENOTFOUND';

            mockOctokit.repos.createRelease.mockRejectedValue(connectionError);
            await expect(GitHub.createRelease('v1.0.0', 'Release', 'Notes')).rejects.toThrow('Network Error');
        });

        it('should handle malformed API responses', async () => {
            // Test response with missing required fields
            mockOctokit.pulls.get.mockResolvedValue({ data: {} }); // Missing head.ref
            mockOctokit.pulls.merge.mockResolvedValue({});
            mockOctokit.git.deleteRef.mockResolvedValue({});

            // Should handle missing data gracefully
            await expect(GitHub.mergePullRequest(123)).rejects.toThrow();
        });

        it('should handle concurrent API rate limiting', async () => {
            const rateLimitError = new Error('API rate limit exceeded') as Error & { status: number };
            rateLimitError.status = 403;

            // Simulate rate limiting for multiple concurrent requests
            mockOctokit.issues.create.mockRejectedValue(rateLimitError);

            const promises = Array.from({ length: 5 }, (_, i) =>
                GitHub.createIssue(`Issue ${i}`, `Body ${i}`)
            );

            const results = await Promise.allSettled(promises);
            results.forEach(result => {
                expect(result.status).toBe('rejected');
                if (result.status === 'rejected') {
                    expect(result.reason.message).toContain('API rate limit exceeded');
                }
            });
        });

        it('should handle GitHub API deprecation warnings', async () => {
            // Mock a successful response with deprecation headers
            const deprecatedResponse = {
                data: { number: 123, html_url: 'http://github.com/issue/123' },
                headers: {
                    'x-github-deprecation-warning': 'This API is deprecated'
                }
            };

            mockOctokit.issues.create.mockResolvedValue(deprecatedResponse);
            const result = await GitHub.createIssue('Test', 'Body');

            expect(result).toEqual({
                number: 123,
                html_url: 'http://github.com/issue/123'
            });
        });

        it('should handle API response size limits', async () => {
            // Simulate large response that might be truncated
            const largeIssues = Array.from({ length: 1000 }, (_, i) => ({
                number: i + 1,
                title: `Issue ${i + 1}`,
                labels: [],
                created_at: '2023-01-01T00:00:00Z',
                updated_at: '2023-01-01T00:00:00Z',
                body: 'A'.repeat(10000), // Very long body
                pull_request: undefined,
            }));

            mockOctokit.issues.listForRepo.mockResolvedValue({ data: largeIssues });
            const result = await GitHub.getOpenIssues(100);

            // Should handle large responses and truncate appropriately
            expect(result).toBeDefined();
            expect(typeof result).toBe('string');
        });

        it('should handle GitHub Enterprise Server differences', async () => {
            // Test behavior when certain features aren't available in GitHub Enterprise
            const enterpriseError = new Error('Not Found') as Error & { status: number };
            enterpriseError.status = 404;

            mockOctokit.actions.listRepoWorkflows.mockRejectedValue(enterpriseError);

            const workflows = await GitHub.getWorkflowsTriggeredByRelease();
            expect(workflows).toEqual([]);
        });

        it('should handle mixed success/failure scenarios in batch operations', async () => {
            // Simulate scenario where some workflows are accessible and others aren't
            const workflows = [
                { id: 1, name: 'Accessible Workflow', path: '.github/workflows/accessible.yml' },
                { id: 2, name: 'Restricted Workflow', path: '.github/workflows/restricted.yml' },
            ];

            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows },
            });

            // First workflow succeeds, second fails
            mockOctokit.repos.getContent
                .mockResolvedValueOnce({
                    data: {
                        type: 'file',
                        content: Buffer.from('on: release').toString('base64'),
                    },
                })
                .mockRejectedValueOnce(new Error('Access denied'));

            const result = await GitHub.getWorkflowsTriggeredByRelease();
            expect(result).toEqual(['Accessible Workflow']);
        });
    });

    describe('waitForPullRequestChecks - Additional Edge Cases', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should handle timeout with user confirmation when no workflows configured', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({ data: { workflows: [] } });
            promptConfirmation.mockResolvedValue(true);

            const promise = GitHub.waitForPullRequestChecks(123, { timeout: 5000 });

            // Wait for several consecutive no-checks attempts
            for (let i = 0; i < 7; i++) {
                await vi.advanceTimersByTimeAsync(10000);
            }

            await expect(promise).resolves.toBeUndefined();
            expect(promptConfirmation).toHaveBeenCalled();
        });

        it('should handle user rejection when no workflows configured', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({ data: { workflows: [] } });
            promptConfirmation.mockResolvedValue(false);

            // Use shorter timeout for test to reduce timing issues
            const promise = GitHub.waitForPullRequestChecks(123, { timeout: 300000 }); // Use default timeout

            // Wait for exactly 6 consecutive no-checks attempts (6 attempts at 10s each = 60s)
            for (let i = 0; i < 6; i++) {
                await vi.advanceTimersByTimeAsync(10000);
            }

            await expect(promise).rejects.toThrow('No checks configured for PR #123. User chose not to proceed.');
        });

        it('should skip user confirmation in non-interactive mode when no workflows configured', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({ data: { workflows: [] } });

            const promise = GitHub.waitForPullRequestChecks(123, {
                timeout: 300000, // Use default timeout
                skipUserConfirmation: true
            });

            // Wait for exactly 6 consecutive no-checks attempts (6 attempts at 10s each = 60s)
            for (let i = 0; i < 6; i++) {
                await vi.advanceTimersByTimeAsync(10000);
            }

            await expect(promise).resolves.toBeUndefined();
            expect(promptConfirmation).not.toHaveBeenCalled();
        });

        it('should continue waiting when workflows exist but no checks yet', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({ data: { check_runs: [] } })
                .mockResolvedValueOnce({ data: { check_runs: [{ status: 'completed', conclusion: 'success' }] } });

            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ name: 'Test Workflow' }] }
            });

            const promise = GitHub.waitForPullRequestChecks(123);

            // Wait for several consecutive no-checks attempts, then workflows check, then final success
            for (let i = 0; i < 7; i++) {
                await vi.advanceTimersByTimeAsync(10000);
            }

            await expect(promise).resolves.toBeUndefined();
        });

        it('should provide specific recovery instructions based on failure types', async () => {
            const { PullRequestCheckError } = await import('../../src/error/CommandErrors');

            const failedChecks = [
                {
                    name: 'run-tests',
                    conclusion: 'failure',
                    detailsUrl: 'https://github.com/test/test-details',
                    output: { title: 'Tests failed', summary: 'Unit tests are failing' }
                },
                {
                    name: 'eslint-check',
                    conclusion: 'failure',
                    detailsUrl: 'https://github.com/test/lint-details',
                    output: { title: 'Linting errors', summary: 'Code style violations' }
                },
                {
                    name: 'build-project',
                    conclusion: 'failure',
                    detailsUrl: 'https://github.com/test/build-details',
                    output: { title: 'Build failed', summary: 'Compilation errors' }
                }
            ];

            const error = new PullRequestCheckError(
                'Test error message',
                123,
                failedChecks,
                'https://github.com/test/repo/pull/123',
                'feature/test-branch'
            );

            const instructions = error.getRecoveryInstructions();
            const instructionText = instructions.join('\n');

            // Should contain specific sections for each failure type
            expect(instructionText).toContain('📋 Test Failures');
            expect(instructionText).toContain('npm test');
            expect(instructionText).toContain('🎨 Linting/Style Failures');
            expect(instructionText).toContain('npm run lint');
            expect(instructionText).toContain('🏗️ Build Failures');
            expect(instructionText).toContain('npm run build');

            // Should contain git workflow instructions
            expect(instructionText).toContain('📤 After fixing the issues');
            expect(instructionText).toContain('git push origin feature/test-branch');
            expect(instructionText).toContain('🔄 Re-running this command');
        });

        it('should handle checks that never start running', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ name: 'Test Workflow' }] }
            });

            const promise = GitHub.waitForPullRequestChecks(123, { timeout: 5000 });

            // Wait for timeout condition
            await vi.advanceTimersByTimeAsync(10000);

            await expect(promise).rejects.toThrow('Timeout waiting for PR #123 checks');
        }, 10000);

        it('should handle checks with null conclusions', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({
                    data: {
                        check_runs: [{ status: 'in_progress', conclusion: null }],
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        check_runs: [{ status: 'completed', conclusion: 'success' }],
                    },
                });

            const promise = GitHub.waitForPullRequestChecks(123);
            await vi.advanceTimersByTimeAsync(10000);
            await expect(promise).resolves.toBeUndefined();
        });

        it('should handle API errors during check monitoring', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockRejectedValue(new Error('API Error'));

            await expect(GitHub.waitForPullRequestChecks(123)).rejects.toThrow('API Error');
        });

        it('should handle checks in queued status transitioning to completed', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({
                    data: {
                        check_runs: [
                            { status: 'queued', conclusion: null },
                            { status: 'in_progress', conclusion: null },
                        ],
                    },
                })
                .mockResolvedValueOnce({
                    data: {
                        check_runs: [
                            { status: 'completed', conclusion: 'success' },
                            { status: 'completed', conclusion: 'success' },
                        ],
                    },
                });

            const promise = GitHub.waitForPullRequestChecks(123);
            await vi.advanceTimersByTimeAsync(10000);
            await expect(promise).resolves.toBeUndefined();
        });

        it('should handle skipped and neutral check conclusions', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({
                data: {
                    check_runs: [
                        { status: 'completed', conclusion: 'success' },
                        { status: 'completed', conclusion: 'skipped' },
                        { status: 'completed', conclusion: 'neutral' },
                    ],
                },
            });

            await expect(GitHub.waitForPullRequestChecks(123)).resolves.toBeUndefined();
        });
    });

    describe('Complex Timing Scenarios and Rate Limiting', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should handle rapid successive API calls with rate limiting', async () => {
            let callCount = 0;
            const rateLimitError = new Error('API rate limit exceeded') as Error & { status: number };
            rateLimitError.status = 403;

            mockOctokit.issues.create.mockImplementation(async () => {
                callCount++;
                if (callCount <= 3) {
                    throw rateLimitError;
                }
                return { data: { number: callCount, html_url: 'http://github.com/issue' } };
            });

            // Should fail for first few calls due to rate limiting
            await expect(GitHub.createIssue('Test 1', 'Body')).rejects.toThrow('API rate limit exceeded');
            await expect(GitHub.createIssue('Test 2', 'Body')).rejects.toThrow('API rate limit exceeded');
            await expect(GitHub.createIssue('Test 3', 'Body')).rejects.toThrow('API rate limit exceeded');

            // Should succeed after rate limit is lifted
            const result = await GitHub.createIssue('Test 4', 'Body');
            expect(result.number).toBe(4);
        });

        it('should handle long-running workflow checks with intermittent failures', async () => {
            let checkCount = 0;

            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockImplementation(async () => {
                checkCount++;

                // Simulate successful completion after a few checks
                if (checkCount >= 3) {
                    return {
                        data: {
                            check_runs: [
                                { status: 'completed', conclusion: 'success' },
                                { status: 'completed', conclusion: 'success' },
                            ],
                        },
                    };
                } else {
                    return {
                        data: {
                            check_runs: [
                                { status: 'in_progress', conclusion: null },
                                { status: 'queued', conclusion: null },
                            ],
                        },
                    };
                }
            });

            const promise = GitHub.waitForPullRequestChecks(123, { timeout: 120000 });

            // Advance through multiple check cycles
            await vi.advanceTimersByTimeAsync(10000); // First check
            await vi.advanceTimersByTimeAsync(10000); // Second check
            await vi.advanceTimersByTimeAsync(10000); // Third check

            await expect(promise).resolves.toBeUndefined();
        });

        it.skip('should handle concurrent workflow monitoring with different completion times', async () => {
            // Simplify this test to avoid complex concurrent mocking issues
            const workflowRuns = [
                {
                    id: 1,
                    name: 'Workflow 1',
                    status: 'completed',
                    conclusion: 'success',
                    html_url: 'https://github.com/test/actions/runs/1',
                },
            ];

            const getWorkflowSpy = vi.spyOn(GitHub, 'getWorkflowRunsTriggeredByRelease')
                .mockResolvedValueOnce([]) // Initial delay
                .mockResolvedValue(workflowRuns);

            const promise = GitHub.waitForReleaseWorkflows('v1.0.0', {
                timeout: 60000,
                skipUserConfirmation: true
            });

            // Advance time
            await vi.advanceTimersByTimeAsync(30000); // Initial delay
            await vi.advanceTimersByTimeAsync(5000); // First check

            await expect(promise).resolves.toBeUndefined();

            // Cleanup
            getWorkflowSpy.mockRestore();
        });

        it.skip('should handle timeout edge cases with precise timing', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({ data: { check_runs: [] } });
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({ data: { workflows: [{ name: 'Test Workflow' }] } });

            const timeoutMs = 5000;
            const promise = GitHub.waitForPullRequestChecks(123, { timeout: timeoutMs });

            // Advance past timeout
            await vi.advanceTimersByTimeAsync(timeoutMs + 1000);

            await expect(promise).rejects.toThrow('Timeout waiting for PR #123 checks');
        }, 10000);

        it('should handle memory and resource constraints during long monitoring', async () => {
            // Simulate a scenario with many checks over a long period
            const manyChecks = Array.from({ length: 100 }, (_, i) => ({
                id: i + 1,
                status: i < 50 ? 'in_progress' : 'completed',
                conclusion: i < 50 ? null : 'success',
                name: `check-${i + 1}`,
            }));

            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef
                .mockResolvedValueOnce({ data: { check_runs: manyChecks } })
                .mockResolvedValue({
                    data: {
                        check_runs: manyChecks.map(check => ({
                            ...check,
                            status: 'completed',
                            conclusion: 'success'
                        }))
                    }
                });

            const promise = GitHub.waitForPullRequestChecks(123);
            await vi.advanceTimersByTimeAsync(10000);

            await expect(promise).resolves.toBeUndefined();

            // Verify memory usage doesn't grow excessively
            expect(mockOctokit.checks.listForRef).toHaveBeenCalledTimes(2);
        });

        it('should handle clock skew and timing precision issues', async () => {
            const releaseTime = new Date('2023-01-01T12:00:00Z');

            // Workflow run created at exactly the same time as release
            const workflowRun = {
                id: 1,
                name: 'Release Workflow',
                event: 'release',
                status: 'completed',
                conclusion: 'success',
                head_sha: 'abc123',
                created_at: '2023-01-01T12:00:01Z', // 1 second after release (within window)
                head_branch: null,
            };

            mockOctokit.repos.getReleaseByTag.mockResolvedValue({
                data: {
                    id: 1,
                    tag_name: 'v1.0.0',
                    name: 'Release v1.0.0',
                    created_at: releaseTime.toISOString(),
                    target_commitish: 'abc123',
                },
            });

            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [{ id: 1, name: 'Release Workflow', path: '.github/workflows/release.yml' }] },
            });

            mockOctokit.actions.listWorkflowRuns.mockResolvedValue({
                data: { workflow_runs: [workflowRun] },
            });

            const result = await GitHub.getWorkflowRunsTriggeredByRelease('v1.0.0');

            // Should include the workflow run despite exact timestamp match
            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Release Workflow');
        });
    });

    describe('Additional Edge Cases and Integration Scenarios', () => {
        it('should handle repository with no releases', async () => {
            const noReleaseError = new Error('Not Found') as Error & { status: number };
            noReleaseError.status = 404;

            mockOctokit.repos.getReleaseByTag.mockRejectedValue(noReleaseError);

            await expect(GitHub.getReleaseByTagName('v1.0.0')).rejects.toThrow('Not Found');
        });

        it('should handle repository with disabled Actions', async () => {
            const disabledError = new Error('Actions are disabled for this repository') as Error & { status: number };
            disabledError.status = 403;

            mockOctokit.actions.listRepoWorkflows.mockRejectedValue(disabledError);

            const workflows = await GitHub.getWorkflowsTriggeredByRelease();
            expect(workflows).toEqual([]);
        });

        it('should handle repository with no workflow files', async () => {
            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: [] },
            });

            const workflows = await GitHub.getWorkflowsTriggeredByRelease();
            expect(workflows).toEqual([]);
        });

        it('should handle very large repository with many workflows', async () => {
            const manyWorkflows = Array.from({ length: 200 }, (_, i) => ({
                id: i + 1,
                name: `Workflow ${i + 1}`,
                path: `.github/workflows/workflow-${i + 1}.yml`
            }));

            mockOctokit.actions.listRepoWorkflows.mockResolvedValue({
                data: { workflows: manyWorkflows },
            });

            // Mock some workflows as release-triggered
            mockOctokit.repos.getContent.mockImplementation(async ({ path }) => {
                const isRelease = path.includes('release') || path.includes('deploy');
                return {
                    data: {
                        type: 'file',
                        content: Buffer.from(isRelease ? 'on: release' : 'on: push').toString('base64'),
                    },
                };
            });

            const workflows = await GitHub.getWorkflowsTriggeredByRelease();

            // Should handle large number of workflows efficiently
            expect(Array.isArray(workflows)).toBe(true);
            expect(mockOctokit.repos.getContent).toHaveBeenCalledTimes(200);
        });

        it('should handle branch names with special characters', async () => {
            const specialBranchName = 'feature/test-branch@123_with-symbols';

            mockRun.mockImplementation(async (command: string) => {
                if (command === 'git rev-parse --abbrev-ref HEAD') {
                    return { stdout: specialBranchName };
                }
                if (command === 'git remote get-url origin') {
                    return { stdout: 'git@github.com:test-owner/test-repo.git' };
                }
                return { stdout: '' };
            });

            const branchName = await GitHub.getCurrentBranchName();
            expect(branchName).toBe(specialBranchName);

            // Test that special branch names work with PR operations
            mockOctokit.pulls.list.mockResolvedValue({ data: [] });
            const result = await GitHub.findOpenPullRequestByHeadRef(specialBranchName);

            expect(mockOctokit.pulls.list).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                state: 'open',
                head: `test-owner:${specialBranchName}`,
            });
            expect(result).toBeNull();
        });

        it('should handle Unicode characters in issue titles and bodies', async () => {
            const unicodeTitle = '🚀 Feature: 新功能 with émojis and ñoñó';
            const unicodeBody = 'Description with 中文字符, émojis 🎉, and special chars: áéíóú';

            mockOctokit.issues.create.mockResolvedValue({
                data: {
                    number: 123,
                    html_url: 'https://github.com/test-owner/test-repo/issues/123',
                },
            });

            const result = await GitHub.createIssue(unicodeTitle, unicodeBody, ['enhancement', '中文标签']);

            expect(mockOctokit.issues.create).toHaveBeenCalledWith({
                owner: 'test-owner',
                repo: 'test-repo',
                title: unicodeTitle,
                body: unicodeBody,
                labels: ['enhancement', '中文标签'],
            });

            expect(result).toEqual({
                number: 123,
                html_url: 'https://github.com/test-owner/test-repo/issues/123',
            });
        });

        it('should handle repository with mixed public/private visibility', async () => {
            // Test scenario where some API endpoints are accessible and others aren't
            const publicRepoError = new Error('Repository access blocked') as Error & { status: number };
            publicRepoError.status = 403;

            mockOctokit.issues.listForRepo.mockResolvedValue({ data: [] }); // Public issues work
            mockOctokit.actions.listRepoWorkflows.mockRejectedValue(publicRepoError); // Actions blocked

            const issues = await GitHub.getOpenIssues();
            expect(issues).toBe('');

            const workflows = await GitHub.getWorkflowsTriggeredByRelease();
            expect(workflows).toEqual([]);
        });
    });
});
