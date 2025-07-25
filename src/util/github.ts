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
            // Get PR details for the link
            const { owner, repo } = await getRepoDetails();
            const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;

            logger.error(`❌ PR #${prNumber} checks have failed!`);
            logger.error(`📋 View full details: ${prUrl}`);
            logger.error('');
            logger.error('💥 Failed checks:');

            for (const check of failingChecks) {
                logger.error(`   • ${check.name}: ${check.conclusion?.toUpperCase() || 'UNKNOWN'}`);

                // Show check details if available
                if (check.html_url) {
                    logger.error(`     🔗 Details: ${check.html_url}`);
                }

                // Show failure summary if available
                if (check.output?.summary && check.output.summary.trim()) {
                    logger.error(`     📝 Summary: ${check.output.summary.substring(0, 200)}${check.output.summary.length > 200 ? '...' : ''}`);
                }

                // Show specific error text if available
                if (check.output?.text && check.output.text.trim()) {
                    const errorText = check.output.text.substring(0, 300);
                    logger.error(`     ⚠️  Details: ${errorText}${check.output.text.length > 300 ? '...' : ''}`);
                }

                // Show details_url if different from html_url
                if (check.details_url && check.details_url !== check.html_url) {
                    logger.error(`     🔍 More info: ${check.details_url}`);
                }

                logger.error(''); // Empty line between checks
            }

            throw new Error(`PR #${prNumber} checks failed. See details above or visit: ${prUrl}`);
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

export const getWorkflowRunsTriggeredByRelease = async (tagName: string, workflowNames?: string[]): Promise<any[]> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    try {
        logger.debug(`Fetching workflow runs triggered by release ${tagName}...`);

        // Get all workflows
        const workflowsResponse = await octokit.actions.listRepoWorkflows({
            owner,
            repo,
        });

        const relevantWorkflows = workflowsResponse.data.workflows.filter(workflow => {
            // If specific workflow names are provided, only include those
            if (workflowNames && workflowNames.length > 0) {
                return workflowNames.includes(workflow.name);
            }
            // Otherwise, find workflows that trigger on releases
            return true; // We'll filter by event later when we get the runs
        });

        logger.debug(`Found ${relevantWorkflows.length} workflows to check`);

        const allRuns: any[] = [];

        // Get recent workflow runs for each workflow
        for (const workflow of relevantWorkflows) {
            try {
                const runsResponse = await octokit.actions.listWorkflowRuns({
                    owner,
                    repo,
                    workflow_id: workflow.id,
                    per_page: 10, // Check last 10 runs
                });

                // Filter runs that were triggered by our release
                const releaseRuns = runsResponse.data.workflow_runs.filter(run => {
                    // Check if the run was triggered by a release event and matches our tag
                    return run.event === 'release' && run.head_sha && run.created_at;
                });

                allRuns.push(...releaseRuns);
            } catch (error: any) {
                logger.warn(`Failed to get runs for workflow ${workflow.name}: ${error.message}`);
            }
        }

        // Sort by creation time (newest first) and take the most recent ones
        allRuns.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

        logger.debug(`Found ${allRuns.length} workflow runs triggered by release events`);
        return allRuns;
    } catch (error: any) {
        logger.warn(`Failed to fetch workflow runs: ${error.message}`);
        return [];
    }
};

export const waitForReleaseWorkflows = async (
    tagName: string,
    options: {
        timeout?: number;
        workflowNames?: string[];
        skipUserConfirmation?: boolean;
    } = {}
): Promise<void> => {
    const logger = getLogger();
    const timeout = options.timeout || 600000; // 10 minutes default
    const skipUserConfirmation = options.skipUserConfirmation || false;

    logger.info(`Waiting for workflows triggered by release ${tagName}...`);

    // Wait a bit for workflows to start (GitHub can take a moment to trigger them)
    logger.debug('Waiting 30 seconds for workflows to start...');
    await delay(30000);

    const startTime = Date.now();
    let workflowRuns: any[] = [];
    let consecutiveNoWorkflowsCount = 0;
    const maxConsecutiveNoWorkflows = 6; // 1 minute of checking before asking user

    while (true) {
        const elapsedTime = Date.now() - startTime;

        // Check for timeout
        if (elapsedTime > timeout) {
            logger.warn(`Timeout reached (${timeout / 1000}s) while waiting for release workflows.`);

            if (!skipUserConfirmation) {
                const proceedWithoutWorkflows = await promptConfirmation(
                    `⚠️  Timeout reached while waiting for release workflows for ${tagName}.\n` +
                    `This might indicate that no workflows are configured to trigger on releases.\n` +
                    `Do you want to proceed anyway?`
                );

                if (proceedWithoutWorkflows) {
                    logger.info('User chose to proceed without waiting for release workflows.');
                    return;
                } else {
                    throw new Error(`Timeout waiting for release workflows for ${tagName}. User chose not to proceed.`);
                }
            } else {
                throw new Error(`Timeout waiting for release workflows for ${tagName} (${timeout / 1000}s)`);
            }
        }

        // Get current workflow runs
        workflowRuns = await getWorkflowRunsTriggeredByRelease(tagName, options.workflowNames);

        if (workflowRuns.length === 0) {
            consecutiveNoWorkflowsCount++;
            logger.info(`No release workflows found (${consecutiveNoWorkflowsCount}/${maxConsecutiveNoWorkflows}). Waiting...`);

            // After several attempts with no workflows, ask user if they want to continue
            if (consecutiveNoWorkflowsCount >= maxConsecutiveNoWorkflows) {
                logger.warn(`No workflows triggered by release ${tagName} after ${maxConsecutiveNoWorkflows} attempts.`);

                if (!skipUserConfirmation) {
                    const proceedWithoutWorkflows = await promptConfirmation(
                        `⚠️  No GitHub Actions workflows appear to be triggered by the release ${tagName}.\n` +
                        `This might be expected if no workflows are configured for release events.\n` +
                        `Do you want to proceed without waiting for workflows?`
                    );

                    if (proceedWithoutWorkflows) {
                        logger.info('User chose to proceed without release workflows.');
                        return;
                    } else {
                        throw new Error(`No release workflows found for ${tagName}. User chose not to proceed.`);
                    }
                } else {
                    // In non-interactive mode, proceed if no workflows are found
                    logger.info('No release workflows found, proceeding.');
                    return;
                }
            }

            await delay(10000);
            continue;
        }

        // Reset counter since we found workflows
        consecutiveNoWorkflowsCount = 0;

        // Check status of all workflow runs
        const failingRuns = workflowRuns.filter(run =>
            run.conclusion && ['failure', 'timed_out', 'cancelled'].includes(run.conclusion)
        );

        if (failingRuns.length > 0) {
            logger.error(`Release workflows for ${tagName} have failures:`);
            for (const run of failingRuns) {
                logger.error(`- ${run.name}: ${run.conclusion} (${run.html_url})`);
            }
            throw new Error(`Release workflows for ${tagName} failed.`);
        }

        const allWorkflowsCompleted = workflowRuns.every(run => run.status === 'completed');

        if (allWorkflowsCompleted) {
            const successfulRuns = workflowRuns.filter(run => run.conclusion === 'success');
            logger.info(`All ${workflowRuns.length} release workflows for ${tagName} completed successfully.`);
            for (const run of successfulRuns) {
                logger.info(`✓ ${run.name}: ${run.conclusion}`);
            }
            return;
        }

        const completedCount = workflowRuns.filter(run => run.status === 'completed').length;
        const runningCount = workflowRuns.filter(run => run.status === 'in_progress').length;
        const queuedCount = workflowRuns.filter(run => run.status === 'queued').length;

        logger.info(
            `Release workflows for ${tagName}: ${completedCount} completed, ${runningCount} running, ${queuedCount} queued (${workflowRuns.length} total)`
        );

        await delay(15000); // wait 15 seconds
    }
};

export const getWorkflowsTriggeredByRelease = async (): Promise<string[]> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    try {
        logger.debug('Analyzing workflows to find those triggered by release events...');

        // Get all workflows
        const workflowsResponse = await octokit.actions.listRepoWorkflows({
            owner,
            repo,
        });

        const releaseWorkflows: string[] = [];

        // Check each workflow's configuration
        for (const workflow of workflowsResponse.data.workflows) {
            try {
                // Get the workflow file content
                const workflowPath = workflow.path;
                logger.debug(`Analyzing workflow: ${workflow.name} (${workflowPath})`);

                const contentResponse = await octokit.repos.getContent({
                    owner,
                    repo,
                    path: workflowPath,
                });

                // Handle the response - it could be a file or directory
                if ('content' in contentResponse.data && contentResponse.data.type === 'file') {
                    // Decode the base64 content
                    const content = Buffer.from(contentResponse.data.content, 'base64').toString('utf-8');

                    // Parse the YAML to check trigger conditions
                    if (isTriggeredByRelease(content, workflow.name)) {
                        logger.debug(`✓ Workflow "${workflow.name}" will be triggered by release events`);
                        releaseWorkflows.push(workflow.name);
                    } else {
                        logger.debug(`✗ Workflow "${workflow.name}" will not be triggered by release events`);
                    }
                } else {
                    logger.warn(`Could not read content for workflow ${workflow.name}`);
                }
            } catch (error: any) {
                logger.warn(`Failed to analyze workflow ${workflow.name}: ${error.message}`);
            }
        }

        logger.info(`Found ${releaseWorkflows.length} workflows that will be triggered by release events: ${releaseWorkflows.join(', ')}`);
        return releaseWorkflows;
    } catch (error: any) {
        logger.error(`Failed to analyze workflows: ${error.message}`);
        return [];
    }
};

const isTriggeredByRelease = (workflowContent: string, workflowName: string): boolean => {
    const logger = getLogger();

    try {
        // Simple regex-based parsing since we don't want to add a YAML dependency
        // Look for common release trigger patterns

        // Pattern 1: on.release (with or without types)
        // on:
        //   release:
        //     types: [published, created, ...]
        const releaseEventPattern = /(?:^|\n)\s*on\s*:\s*(?:\n|\r\n)(?:\s+.*(?:\n|\r\n))*?\s+release\s*:/m;

        // Pattern 2: on: [push, release] or on: release
        const onReleasePattern = /(?:^|\n)\s*on\s*:\s*(?:\[.*release.*\]|release)\s*(?:\n|$)/m;

        // Pattern 3: push with tag patterns that look like releases
        // on:
        //   push:
        //     tags:
        //       - 'v*'
        //       - 'release/*'
        const tagPushPattern = /(?:^|\n)\s*on\s*:\s*(?:\n|\r\n)(?:\s+.*(?:\n|\r\n))*?\s+push\s*:\s*(?:\n|\r\n)(?:\s+.*(?:\n|\r\n))*?\s+tags\s*:\s*(?:\n|\r\n|\[)(?:[^\n\]]*(?:v\*|release|tag)[^\n\]]*)/mi;

        const isTriggered = releaseEventPattern.test(workflowContent) ||
                           onReleasePattern.test(workflowContent) ||
                           tagPushPattern.test(workflowContent);

        if (isTriggered) {
            logger.debug(`Workflow "${workflowName}" trigger patterns detected in content`);
        }

        return isTriggered;
    } catch (error: any) {
        logger.warn(`Failed to parse workflow content for ${workflowName}: ${error.message}`);
        return false;
    }
};
