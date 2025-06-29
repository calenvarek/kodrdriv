import { Octokit } from '@octokit/rest';
import { getLogger } from '../logging';
import { PullRequest, MergeMethod } from '../types';
import { run } from './child';

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
    const match = url.match(/github\.com[/:]([\w-]+)\/([\w-]+)\.git/);
    if (!match) {
        throw new Error('Could not parse repository owner and name from origin URL.');
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

    const response = await octokit.pulls.list({
        owner,
        repo,
        state: 'open',
        head: `${owner}:${head}`,
    });

    return response.data[0] ?? null;
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const waitForPullRequestChecks = async (prNumber: number): Promise<void> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    while (true) {
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
            logger.info(`PR #${prNumber}: No checks found. Waiting...`);
            await delay(10000);
            continue;
        }

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

export const createRelease = async (tagName: string, notes: string): Promise<void> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    logger.info(`Creating release for tag ${tagName}...`);
    await octokit.repos.createRelease({
        owner,
        repo,
        tag_name: tagName,
        name: tagName,
        body: notes,
    });
    logger.info(`Release ${tagName} created.`);
}; 