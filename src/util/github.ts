import { Octokit } from '@octokit/rest';
import { getLogger } from '../logging';
import { PullRequest, MergeMethod } from '../types';
import { run } from './child';
import { promptConfirmation } from './stdin';

export const getOctokit = (): Octokit => {
    const logger = getLogger();
    const token = process.env.GITHUB_TOKEN;

    if (!token) {
        logger.error('GITHUB_TOKEN environment variable is not set.');
        throw new Error('GITHUB_TOKEN is not set.');
    }

    return new Octokit({
        auth: token,
    });
};

export const getCurrentBranchName = async (): Promise<string> => {
    const { stdout } = await run('git rev-parse --abbrev-ref HEAD');
    return stdout.trim();
};

export const getRepoDetails = async (): Promise<{ owner: string; repo: string }> => {
    const { stdout } = await run('git remote get-url origin');
    const url = stdout.trim();
    // git@github.com:owner/repo.git or https://github.com/owner/repo.git
    const match = url.match(/github\.com[/:]([\w-]+)\/([\w.-]+)\.git/);
    if (!match) {
        throw new Error(`Could not parse repository owner and name from origin URL: "${url}". Expected format: git@github.com:owner/repo.git or https://github.com/owner/repo.git`);
    }
    return { owner: match[1], repo: match[2] };
};

export const createPullRequest = async (
    title: string,
    body: string,
    head: string,
    base: string = 'main'
): Promise<PullRequest> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();

    const response = await octokit.pulls.create({
        owner,
        repo,
        title,
        body,
        head,
        base,
    });

    return response.data;
};

export const findOpenPullRequestByHeadRef = async (head: string): Promise<PullRequest | null> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    try {
        logger.debug(`Searching for open pull requests with head: ${owner}:${head} in ${owner}/${repo}`);

        const response = await octokit.pulls.list({
            owner,
            repo,
            state: 'open',
            head: `${owner}:${head}`,
        });

        logger.debug(`Found ${response.data.length} open pull requests`);
        return response.data[0] ?? null;
    } catch (error: any) {
        logger.error(`Failed to find open pull requests: ${error.message}`);
        if (error.status === 404) {
            logger.error(`Repository ${owner}/${repo} not found or access denied. Please check your GITHUB_TOKEN permissions.`);
        }
        throw error;
    }
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Check if repository has GitHub Actions workflows configured
const hasWorkflowsConfigured = async (): Promise<boolean> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();

    try {
        const response = await octokit.actions.listRepoWorkflows({
            owner,
            repo,
        });

        return response.data.workflows.length > 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: any) {
        // If we can't check workflows (e.g., no Actions permission), assume they might exist
        return true;
    }
};

export const waitForPullRequestChecks = async (prNumber: number, options: { timeout?: number; skipUserConfirmation?: boolean } = {}): Promise<void> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();
    const timeout = options.timeout || 300000; // 5 minutes default timeout
    const skipUserConfirmation = options.skipUserConfirmation || false;

    const startTime = Date.now();
    let consecutiveNoChecksCount = 0;
    const maxConsecutiveNoChecks = 6; // 6 consecutive checks (1 minute) with no checks before asking user

    while (true) {
        const elapsedTime = Date.now() - startTime;

        // Check for timeout
        if (elapsedTime > timeout) {
            logger.warn(`Timeout reached (${timeout / 1000}s) while waiting for PR #${prNumber} checks.`);

            if (!skipUserConfirmation) {
                const proceedWithoutChecks = await promptConfirmation(
                    `⚠️  Timeout reached while waiting for PR #${prNumber} checks.\n` +
                    `This might indicate that no checks are configured for this repository.\n` +
                    `Do you want to proceed with merging the PR without waiting for checks?`
                );

                if (proceedWithoutChecks) {
                    logger.info('User chose to proceed without waiting for checks.');
                    return;
                } else {
                    throw new Error(`Timeout waiting for PR #${prNumber} checks. User chose not to proceed.`);
                }
            } else {
                throw new Error(`Timeout waiting for PR #${prNumber} checks (${timeout / 1000}s)`);
            }
        }

        const pr = await octokit.pulls.get({
            owner,
            repo,
            pull_number: prNumber,
        });

        const checkRunsResponse = await octokit.checks.listForRef({
            owner,
            repo,
            ref: pr.data.head.sha,
        });

        const checkRuns = checkRunsResponse.data.check_runs;

        if (checkRuns.length === 0) {
            consecutiveNoChecksCount++;
            logger.info(`PR #${prNumber}: No checks found (${consecutiveNoChecksCount}/${maxConsecutiveNoChecks}). Waiting...`);

            // After several consecutive "no checks" responses, check if workflows are configured
            if (consecutiveNoChecksCount >= maxConsecutiveNoChecks) {
                logger.info(`No checks detected for ${maxConsecutiveNoChecks} consecutive attempts. Checking repository configuration...`);

                const hasWorkflows = await hasWorkflowsConfigured();

                if (!hasWorkflows) {
                    logger.warn(`No GitHub Actions workflows found in repository ${owner}/${repo}.`);

                    if (!skipUserConfirmation) {
                        const proceedWithoutChecks = await promptConfirmation(
                            `⚠️  No GitHub Actions workflows or checks are configured for this repository.\n` +
                            `PR #${prNumber} will never have status checks to wait for.\n` +
                            `Do you want to proceed with merging the PR without checks?`
                        );

                        if (proceedWithoutChecks) {
                            logger.info('User chose to proceed without checks (no workflows configured).');
                            return;
                        } else {
                            throw new Error(`No checks configured for PR #${prNumber}. User chose not to proceed.`);
                        }
                    } else {
                        // In non-interactive mode, proceed if no workflows are configured
                        logger.info('No workflows configured, proceeding without checks.');
                        return;
                    }
                } else {
                    logger.info('GitHub Actions workflows are configured. Continuing to wait for checks...');
                    consecutiveNoChecksCount = 0; // Reset counter since workflows exist
                }
            }

            await delay(10000);
            continue;
        }

        // Reset the no-checks counter since we found some checks
        consecutiveNoChecksCount = 0;

        const failingChecks = checkRuns.filter(
            (cr) => cr.conclusion && ['failure', 'timed_out', 'cancelled'].includes(cr.conclusion)
        );

        if (failingChecks.length > 0) {
            logger.error(`PR #${prNumber} has failing checks:`);
            for (const check of failingChecks) {
                logger.error(`- ${check.name}: ${check.conclusion}`);
            }
            throw new Error(`PR #${prNumber} checks failed.`);
        }

        const allChecksCompleted = checkRuns.every((cr) => cr.status === 'completed');

        if (allChecksCompleted) {
            logger.info(`All checks for PR #${prNumber} have completed successfully.`);
            return;
        }

        const completedCount = checkRuns.filter(cr => cr.status === 'completed').length;
        logger.info(`PR #${prNumber} checks: ${completedCount}/${checkRuns.length} completed. Waiting...`);

        await delay(10000); // wait 10 seconds
    }
};

export const mergePullRequest = async (prNumber: number, mergeMethod: MergeMethod = 'squash'): Promise<void> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    logger.info(`Merging PR #${prNumber} using ${mergeMethod} method...`);
    const pr = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
    });
    const headBranch = pr.data.head.ref;

    await octokit.pulls.merge({
        owner,
        repo,
        pull_number: prNumber,
        merge_method: mergeMethod,
    });
    logger.info(`PR #${prNumber} merged using ${mergeMethod} method.`);

    logger.info(`Deleting branch ${headBranch}...`);
    await octokit.git.deleteRef({
        owner,
        repo,
        ref: `heads/${headBranch}`,
    });
    logger.info(`Branch ${headBranch} deleted.`);
};

export const createRelease = async (tagName: string, title: string, notes: string): Promise<void> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    logger.info(`Creating release for tag ${tagName}...`);
    await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        name: title,
        body: notes,
    });
    logger.info(`Release ${tagName} created.`);
};

export const getOpenIssues = async (limit: number = 20): Promise<string> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    try {
        logger.debug(`Fetching up to ${limit} open GitHub issues...`);

        const response = await octokit.issues.listForRepo({
            owner,
            repo,
            state: 'open',
            per_page: Math.min(limit, 100), // GitHub API limit
            sort: 'updated',
            direction: 'desc',
        });

        const issues = response.data.filter(issue => !issue.pull_request); // Filter out PRs

        if (issues.length === 0) {
            logger.debug('No open issues found');
            return '';
        }

        const issueStrings = issues.slice(0, limit).map(issue => {
            const labels = issue.labels.map(label =>
                typeof label === 'string' ? label : label.name
            ).join(', ');

            return [
                `Issue #${issue.number}: ${issue.title}`,
                `Labels: ${labels || 'none'}`,
                `Created: ${issue.created_at}`,
                `Updated: ${issue.updated_at}`,
                `Body: ${issue.body?.substring(0, 500) || 'No description'}${issue.body && issue.body.length > 500 ? '...' : ''}`,
                '---'
            ].join('\n');
        });

        logger.debug(`Fetched ${issues.length} open issues`);
        return issueStrings.join('\n\n');
    } catch (error: any) {
        logger.warn('Failed to fetch GitHub issues: %s', error.message);
        return '';
    }
};

export const createIssue = async (
    title: string,
    body: string,
    labels?: string[]
): Promise<{ number: number; html_url: string }> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();

    const response = await octokit.issues.create({
        owner,
        repo,
        title,
        body,
        labels: labels || [],
    });

    return {
        number: response.data.number,
        html_url: response.data.html_url,
    };
}; 