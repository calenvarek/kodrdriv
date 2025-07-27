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
            const { owner, repo } = await getRepoDetails();
            const prUrl = `https://github.com/${owner}/${repo}/pull/${prNumber}`;

            // Get current branch name for better guidance
            let currentBranch: string | undefined;
            try {
                currentBranch = await getCurrentBranchName();
            } catch {
                // Fallback to generic branch reference if we can't get the current branch
                currentBranch = undefined;
            }

            // Collect detailed information about each failed check
            const detailedFailedChecks = await Promise.all(
                failingChecks.map(async (check) => {
                    try {
                        // Get additional details from the check run
                        const checkDetails = await octokit.checks.get({
                            owner,
                            repo,
                            check_run_id: check.id,
                        });

                        return {
                            name: check.name,
                            conclusion: check.conclusion || 'unknown',
                            detailsUrl: check.details_url || undefined,
                            summary: checkDetails.data.output?.summary || undefined,
                            output: {
                                title: checkDetails.data.output?.title || undefined,
                                summary: checkDetails.data.output?.summary || undefined,
                                text: checkDetails.data.output?.text || undefined,
                            },
                        };
                    } catch {
                        // Fallback to basic information if we can't get details
                        return {
                            name: check.name,
                            conclusion: check.conclusion || 'unknown',
                            detailsUrl: check.details_url || undefined,
                        };
                    }
                })
            );

            logger.error(`❌ PR #${prNumber} has ${failingChecks.length} failing check${failingChecks.length > 1 ? 's' : ''}:`);
            logger.error('');

            for (const check of detailedFailedChecks) {
                const statusIcon = check.conclusion === 'failure' ? '❌' :
                    check.conclusion === 'timed_out' ? '⏰' : '🚫';
                logger.error(`${statusIcon} ${check.name}: ${check.conclusion}`);

                // Show more detailed error information if available
                if (check.output?.title && check.output.title !== check.name) {
                    logger.error(`   Issue: ${check.output.title}`);
                }

                if (check.output?.summary) {
                    // Truncate very long summaries
                    const summary = check.output.summary.length > 200
                        ? check.output.summary.substring(0, 200) + '...'
                        : check.output.summary;
                    logger.error(`   Summary: ${summary}`);
                }

                // Include direct link to check details
                if (check.detailsUrl) {
                    logger.error(`   Details: ${check.detailsUrl}`);
                }
                logger.error('');
            }

            // Import the new error class
            const { PullRequestCheckError } = await import('../error/CommandErrors');

            // Create and throw the enhanced error with detailed recovery instructions
            const prError = new PullRequestCheckError(
                `PR #${prNumber} checks failed. ${failingChecks.length} check${failingChecks.length > 1 ? 's' : ''} failed.`,
                prNumber,
                detailedFailedChecks,
                prUrl,
                currentBranch
            );

            // Display recovery instructions
            const instructions = prError.getRecoveryInstructions();
            for (const instruction of instructions) {
                logger.error(instruction);
            }
            logger.error('');

            throw prError;
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

export const getReleaseByTagName = async (tagName: string): Promise<any> => {
    const octokit = getOctokit();
    const { owner, repo } = await getRepoDetails();
    const logger = getLogger();

    try {
        const response = await octokit.repos.getReleaseByTag({
            owner,
            repo,
            tag: tagName,
        });

        logger.debug(`Found release for tag ${tagName}: created at ${response.data.created_at}`);
        return response.data;
    } catch (error: any) {
        logger.debug(`Failed to get release for tag ${tagName}: ${error.message}`);
        throw error;
    }
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

        // Get release information to filter by creation time and commit SHA
        let releaseInfo: any;
        let releaseCreatedAt: string | undefined;
        let releaseCommitSha: string | undefined;

        try {
            releaseInfo = await getReleaseByTagName(tagName);
            releaseCreatedAt = releaseInfo?.created_at;
            releaseCommitSha = releaseInfo?.target_commitish;
        } catch (error: any) {
            logger.debug(`Could not get release info for ${tagName}: ${error.message}. Using more permissive filtering.`);
        }

        if (releaseCreatedAt) {
            logger.debug(`Release ${tagName} was created at ${releaseCreatedAt}, filtering workflows created after this time`);
        } else {
            logger.debug(`No release creation time available for ${tagName}, using more permissive time filtering`);
        }

        if (releaseCommitSha) {
            logger.debug(`Release ${tagName} targets commit ${releaseCommitSha}`);
        }

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
                    per_page: 30, // Check more runs to account for filtering
                });

                logger.debug(`Checking ${runsResponse.data.workflow_runs.length} recent runs for workflow "${workflow.name}"`);

                // Filter runs that were triggered by our specific release
                const releaseRuns = runsResponse.data.workflow_runs.filter(run => {
                    logger.debug(`Evaluating run ${run.id} for workflow "${workflow.name}": event=${run.event}, head_branch=${run.head_branch}, created_at=${run.created_at}, head_sha=${run.head_sha?.substring(0, 7)}`);

                    // Must be a release or push event (tag pushes trigger workflows with event=push)
                    if (run.event !== 'release' && run.event !== 'push') {
                        logger.debug(`Excluding workflow run ${run.id}: not a release or push event (${run.event})`);
                        return false;
                    }

                    // Must have required data
                    if (!run.head_sha || !run.created_at) {
                        logger.debug(`Excluding workflow run ${run.id}: missing required data (head_sha: ${run.head_sha}, created_at: ${run.created_at})`);
                        return false;
                    }

                    // If we have release info, filter by creation time and commit SHA
                    if (releaseCreatedAt) {
                        const runCreatedAt = new Date(run.created_at).getTime();
                        const releaseCreatedAtTime = new Date(releaseCreatedAt).getTime();

                        // Allow runs created up to 2 minutes before release (for races) and up to 20 minutes after
                        // This is more permissive than before to account for various timing scenarios
                        const timeDiff = runCreatedAt - releaseCreatedAtTime;
                        if (timeDiff < -120000 || timeDiff > 1200000) { // 2 minutes before to 20 minutes after
                            logger.debug(`Excluding workflow run ${run.id}: outside time window (run: ${run.created_at}, release: ${releaseCreatedAt}, diff: ${timeDiff}ms)`);
                            return false;
                        }

                        // For release events, require exact commit SHA match if available
                        if (run.event === 'release' && releaseCommitSha && run.head_sha !== releaseCommitSha) {
                            logger.debug(`Excluding release event workflow run ${run.id}: commit SHA mismatch (run: ${run.head_sha}, release: ${releaseCommitSha})`);
                            return false;
                        }

                        // For push events, be more permissive - don't require exact SHA match as the tag push might be slightly different
                        if (run.event === 'push') {
                            // Check if this looks like a tag push:
                            // 1. head_branch is null (most common for tag pushes)
                            // 2. OR head_branch matches the tag pattern
                            // 3. OR commit SHA matches (in case head_branch behavior is inconsistent)
                            const looksLikeTagPush = run.head_branch === null ||
                                                   (run.head_branch && run.head_branch.includes(tagName.replace('v', ''))) ||
                                                   (releaseCommitSha && run.head_sha === releaseCommitSha);

                            if (!looksLikeTagPush) {
                                logger.debug(`Excluding push event workflow run ${run.id}: doesn't look like tag push (head_branch: ${run.head_branch})`);
                                return false;
                            }
                        }
                    } else {
                        // No release info available - use more permissive fallback filtering
                        logger.debug(`Using permissive filtering for run ${run.id} due to missing release info`);

                        // For release events without release info, look for recent runs only
                        if (run.event === 'release') {
                            const runAge = Date.now() - new Date(run.created_at).getTime();
                            if (runAge > 1800000) { // 30 minutes
                                logger.debug(`Excluding old release event workflow run ${run.id}: created ${run.created_at}`);
                                return false;
                            }
                        }

                        // For push events without release info, be more permissive but still look for tag-like patterns
                        if (run.event === 'push') {
                            const runAge = Date.now() - new Date(run.created_at).getTime();
                            if (runAge > 1800000) { // 30 minutes
                                logger.debug(`Excluding old push event workflow run ${run.id}: created ${run.created_at}`);
                                return false;
                            }

                            // Accept if head_branch is null (likely tag push) or if it's a recent run
                            // This is more permissive than the original logic
                            if (run.head_branch !== null && !run.head_branch.includes(tagName.replace('v', ''))) {
                                logger.debug(`Push event run ${run.id} has head_branch '${run.head_branch}' which doesn't look like tag '${tagName}', but including due to permissive filtering`);
                            }
                        }
                    }

                    logger.debug(`Including workflow run ${run.id}: ${workflow.name} (${run.status}/${run.conclusion || 'pending'}) created ${run.created_at}`);
                    return true;
                });

                allRuns.push(...releaseRuns);

                if (releaseRuns.length > 0) {
                    logger.debug(`Found ${releaseRuns.length} relevant workflow runs for ${workflow.name}`);
                } else {
                    logger.debug(`No relevant workflow runs found for ${workflow.name}`);
                }
            } catch (error: any) {
                logger.warn(`Failed to get runs for workflow ${workflow.name}: ${error.message}`);
            }
        }

        // Sort by creation time (newest first) and prioritize runs with matching commit SHA
        allRuns.sort((a, b) => {
            // First, prioritize runs with matching commit SHA if we have release info
            if (releaseCommitSha) {
                const aMatches = a.head_sha === releaseCommitSha;
                const bMatches = b.head_sha === releaseCommitSha;
                if (aMatches && !bMatches) return -1;
                if (!aMatches && bMatches) return 1;
            }

            // Then sort by creation time (newest first)
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });

        logger.debug(`Found ${allRuns.length} workflow runs triggered by release ${tagName}`);
        return allRuns;
    } catch (error: any) {
        logger.error(`Failed to get workflow runs for release ${tagName}: ${error.message}`);
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

    // Wait longer for workflows to start (GitHub can take time to process the release and trigger workflows)
    logger.debug('Waiting 60 seconds for workflows to start...');
    await delay(60000);

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

            // Add debug info about what we're looking for
            if (consecutiveNoWorkflowsCount === 1) {
                logger.debug(`Looking for workflows triggered by release ${tagName}`);
                if (options.workflowNames && options.workflowNames.length > 0) {
                    logger.debug(`Specific workflows to monitor: ${options.workflowNames.join(', ')}`);
                } else {
                    logger.debug('Monitoring all workflows that might be triggered by releases');
                }
            }

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

        // Log detailed information about each workflow run being tracked
        if (workflowRuns.length > 0) {
            logger.debug(`Tracking ${workflowRuns.length} workflow runs for release ${tagName}:`);
            workflowRuns.forEach(run => {
                const statusIcon = run.status === 'completed' ?
                    (run.conclusion === 'success' ? '✅' : run.conclusion === 'failure' ? '❌' : '⚠️') :
                    run.status === 'in_progress' ? '🔄' : '⏳';
                logger.debug(`  ${statusIcon} ${run.name} (${run.status}${run.conclusion ? `/${run.conclusion}` : ''}) - created ${run.created_at}`);
            });
        }

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
        const releaseEventPattern = /(?:^|\n)\s*on\s*:\s*(?:\n|\r\n)(?:\s+[^\S\r\n]+)*(?:\s+release\s*:)/m;

        // Pattern 2: on: [push, release] or on: release
        const onReleasePattern = /(?:^|\n)\s*on\s*:\s*(?:\[.*release.*\]|release)\s*(?:\n|$)/m;

        // Pattern 3: push with tag patterns that look like releases
        // on:
        //   push:
        //     tags:
        //       - 'v*'
        //       - 'release/*'
        const tagPushPattern = /(?:^|\r?\n)[^\S\r\n]*on\s*:\s*\r?\n(?:[^\S\r\n]*[^\r\n]+(?:\r?\n))*?[^\S\r\n]*push\s*:\s*\r?\n(?:[^\S\r\n]*tags\s*:\s*(?:\r?\n|\[)[^\]\r\n]*(?:v\*|release|tag)[^\]\r\n]*)/mi;

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
