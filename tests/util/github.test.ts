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

const mockRun = child.run as Mock;
const MockOctokit = Octokit as unknown as Mock;

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
        },
        git: {
            deleteRef: vi.fn(),
        },
        repos: {
            createRelease: vi.fn(),
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
    });

    describe('getCurrentBranchName', () => {
        it('should return the trimmed current branch name', async () => {
            mockRun.mockResolvedValue({ stdout: '  feature-branch  \n' });
            const branchName = await GitHub.getCurrentBranchName();
            expect(branchName).toBe('feature-branch');
            expect(mockRun).toHaveBeenCalledWith('git rev-parse --abbrev-ref HEAD');
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

        it('should throw an error if any check has failed', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({
                data: {
                    check_runs: [{ status: 'completed', conclusion: 'failure' }],
                },
            });

            await expect(GitHub.waitForPullRequestChecks(123)).rejects.toThrow('PR #123 checks failed.');
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
    });
}); 