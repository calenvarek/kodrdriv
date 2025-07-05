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
        issues: {
            listForRepo: vi.fn(),
            create: vi.fn(),
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

        it('should handle git command errors', async () => {
            mockRun.mockRejectedValue(new Error('git command failed'));
            await expect(GitHub.getCurrentBranchName()).rejects.toThrow('git command failed');
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

        it('should handle multiple check failures', async () => {
            mockOctokit.pulls.get.mockResolvedValue({ data: { head: { sha: 'test-sha' } } });
            mockOctokit.checks.listForRef.mockResolvedValue({
                data: {
                    check_runs: [
                        { status: 'completed', conclusion: 'failure', name: 'test-1' },
                        { status: 'completed', conclusion: 'timed_out', name: 'test-2' },
                        { status: 'completed', conclusion: 'cancelled', name: 'test-3' },
                    ],
                },
            });

            await expect(GitHub.waitForPullRequestChecks(123)).rejects.toThrow('PR #123 checks failed.');
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
    });
}); 