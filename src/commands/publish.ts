import path from 'path';
import * as Commit from './commit';
import * as Diff from '../content/diff';
import * as Release from './release';
import * as Link from './link';
import * as Unlink from './unlink';
import { getLogger } from '../logging';
import { Config, PullRequest } from '../types';
import { run, runWithDryRunSupport } from '../util/child';
import * as GitHub from '../util/github';
import { create as createStorage } from '../util/storage';
import { incrementPatchVersion, getOutputPath } from '../util/general';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';

const scanNpmrcForEnvVars = async (storage: any): Promise<string[]> => {
    const npmrcPath = path.join(process.cwd(), '.npmrc');
    const envVars: string[] = [];

    if (await storage.exists(npmrcPath)) {
        try {
            const npmrcContent = await storage.readFile(npmrcPath, 'utf-8');
            // Match environment variable patterns like ${VAR_NAME} or $VAR_NAME
            const envVarMatches = npmrcContent.match(/\$\{([^}]+)\}|\$([A-Z_][A-Z0-9_]*)/g);

            if (envVarMatches) {
                for (const match of envVarMatches) {
                    // Extract variable name from ${VAR_NAME} or $VAR_NAME format
                    const varName = match.replace(/\$\{|\}|\$/g, '');
                    if (varName && !envVars.includes(varName)) {
                        envVars.push(varName);
                    }
                }
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            // If we can't read .npmrc, that's okay - just continue
        }
    }

    return envVars;
};

const validateEnvironmentVariables = (requiredEnvVars: string[], isDryRun: boolean): void => {
    const logger = getLogger();
    const missingEnvVars: string[] = [];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingEnvVars.push(envVar);
        }
    }

    if (missingEnvVars.length > 0) {
        if (isDryRun) {
            logger.warn(`DRY RUN: Missing required environment variables: ${missingEnvVars.join(', ')}`);
        } else {
            logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
            throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}. Please set these environment variables before running publish.`);
        }
    }
};

const runPrechecks = async (runConfig: Config): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });
    const isDryRun = runConfig.dryRun || false;

    logger.info(isDryRun ? 'DRY RUN: Running prechecks...' : 'Running prechecks...');

    // Check if we're in a git repository
    try {
        if (isDryRun) {
            logger.info('DRY RUN: Would check git repository with: git rev-parse --git-dir');
        } else {
            await run('git rev-parse --git-dir');
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        if (!isDryRun) {
            throw new Error('Not in a git repository. Please run this command from within a git repository.');
        }
    }

    // Check for uncommitted changes
    logger.info(isDryRun ? 'DRY RUN: Would check for uncommitted changes...' : 'Checking for uncommitted changes...');
    try {
        if (isDryRun) {
            logger.info('DRY RUN: Would check git status with: git status --porcelain');
        } else {
            const { stdout } = await run('git status --porcelain');
            if (stdout.trim()) {
                throw new Error('Working directory has uncommitted changes. Please commit or stash your changes before running publish.');
            }
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
        if (!isDryRun) {
            throw new Error('Failed to check git status. Please ensure you are in a valid git repository.');
        }
    }

    // Check if we're on a release branch
    logger.info(isDryRun ? 'DRY RUN: Would check current branch...' : 'Checking current branch...');
    if (isDryRun) {
        logger.info('DRY RUN: Would verify current branch is a release branch (starts with "release/")');
    } else {
        const currentBranch = await GitHub.getCurrentBranchName();
        if (!currentBranch.startsWith('release/')) {
            throw new Error(`Current branch '${currentBranch}' is not a release branch. Please switch to a release branch (e.g., release/1.0.0) before running publish.`);
        }
    }

    // Check if prepublishOnly script exists in package.json
    logger.info(isDryRun ? 'DRY RUN: Would check for prepublishOnly script...' : 'Checking for prepublishOnly script...');
    const packageJsonPath = path.join(process.cwd(), 'package.json');

    if (!await storage.exists(packageJsonPath)) {
        if (!isDryRun) {
            throw new Error('package.json not found in current directory.');
        } else {
            logger.warn('DRY RUN: package.json not found in current directory.');
        }
    } else {
        let packageJson;
        try {
            const packageJsonContents = await storage.readFile(packageJsonPath, 'utf-8');
            packageJson = JSON.parse(packageJsonContents);
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
            if (!isDryRun) {
                throw new Error('Failed to parse package.json. Please ensure it contains valid JSON.');
            } else {
                logger.warn('DRY RUN: Failed to parse package.json. Please ensure it contains valid JSON.');
            }
        }

        if (packageJson && !packageJson.scripts?.prepublishOnly) {
            if (!isDryRun) {
                throw new Error('prepublishOnly script is required in package.json but was not found. Please add a prepublishOnly script that runs your pre-flight checks (e.g., clean, lint, build, test).');
            } else {
                logger.warn('DRY RUN: prepublishOnly script is required in package.json but was not found.');
            }
        }
    }

    // Check required environment variables
    logger.verbose(isDryRun ? 'DRY RUN: Would check required environment variables...' : 'Checking required environment variables...');
    const coreRequiredEnvVars = runConfig.publish?.requiredEnvVars || [];
    const npmrcEnvVars = isDryRun ? [] : await scanNpmrcForEnvVars(storage); // Skip .npmrc scan in dry run
    const allRequiredEnvVars = [...new Set([...coreRequiredEnvVars, ...npmrcEnvVars])];

    if (allRequiredEnvVars.length > 0) {
        logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Required environment variables: ${allRequiredEnvVars.join(', ')}`);
        validateEnvironmentVariables(allRequiredEnvVars, isDryRun);
    } else {
        logger.verbose(isDryRun ? 'DRY RUN: No required environment variables specified.' : 'No required environment variables specified.');
    }

    logger.info(isDryRun ? 'DRY RUN: All prechecks would pass.' : 'All prechecks passed.');
};

export const execute = async (runConfig: Config): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });
    const isDryRun = runConfig.dryRun || false;

    // Run prechecks before starting any work
    await runPrechecks(runConfig);

    logger.info(isDryRun ? 'DRY RUN: Would start release process...' : 'Starting release process...');

    try {
        // Unlink all workspace packages before starting (if enabled)
        const shouldUnlink = runConfig.publish?.unlinkWorkspacePackages !== false; // default to true
        if (shouldUnlink) {
            logger.verbose(isDryRun ? 'DRY RUN: Would unlink workspace packages...' : 'Unlinking workspace packages...');
            await Unlink.execute(runConfig);
        } else {
            logger.verbose(isDryRun ? 'DRY RUN: Would skip unlink workspace packages (disabled in config).' : 'Skipping unlink workspace packages (disabled in config).');
        }

        let pr: PullRequest | null = null;

        if (isDryRun) {
            logger.info('DRY RUN: Would check for existing pull request');
            logger.info('DRY RUN: Assuming no existing PR found for demo purposes');
        } else {
            const branchName = await GitHub.getCurrentBranchName();
            pr = await GitHub.findOpenPullRequestByHeadRef(branchName);
        }

        if (pr) {
            logger.info(`${isDryRun ? 'DRY RUN: ' : ''}Found existing pull request for branch: ${pr.html_url}`);
        } else {
            logger.info(isDryRun ? 'DRY RUN: No open pull request found, would start new release publishing process...' : 'No open pull request found, starting new release publishing process...');
            // 1. Prepare for release
            logger.verbose(isDryRun ? 'DRY RUN: Would prepare for release: switching from workspace to remote dependencies.' : 'Preparing for release: switching from workspace to remote dependencies.');

            logger.verbose(isDryRun ? 'DRY RUN: Would update dependencies to latest versions from registry' : 'Updating dependencies to latest versions from registry');
            const updatePatterns = runConfig.publish?.dependencyUpdatePatterns;
            if (updatePatterns && updatePatterns.length > 0) {
                logger.verbose(`${isDryRun ? 'DRY RUN: ' : ''}Updating dependencies matching patterns: ${updatePatterns.join(', ')}`);
                const patternsArg = updatePatterns.join(' ');
                await runWithDryRunSupport(`npm update ${patternsArg}`, isDryRun);
            } else {
                logger.verbose(isDryRun ? 'DRY RUN: No dependency update patterns specified, would update all dependencies' : 'No dependency update patterns specified, updating all dependencies');
                await runWithDryRunSupport('npm update', isDryRun);
            }

            logger.verbose(isDryRun ? 'DRY RUN: Would stage changes for release commit' : 'Staging changes for release commit');
            await runWithDryRunSupport('git add package.json package-lock.json', isDryRun);

            logger.info(isDryRun ? 'DRY RUN: Would run prepublishOnly script...' : 'Running prepublishOnly script...');
            await runWithDryRunSupport('npm run prepublishOnly', isDryRun);

            logger.verbose(isDryRun ? 'DRY RUN: Would check for staged changes...' : 'Checking for staged changes...');
            if (isDryRun) {
                logger.verbose('DRY RUN: Assuming staged changes exist for demo purposes');
                logger.verbose('DRY RUN: Would create commit...');
                await Commit.execute(runConfig);
            } else {
                if (await Diff.hasStagedChanges()) {
                    logger.verbose('Staged changes found, creating commit...');
                    await Commit.execute(runConfig);
                } else {
                    logger.verbose('No changes to commit, skipping commit.');
                }
            }

            logger.info(isDryRun ? 'DRY RUN: Would bump version...' : 'Bumping version...');
            // Manually increment version without creating a tag
            if (isDryRun) {
                logger.info('DRY RUN: Would manually increment patch version in package.json and commit');
            } else {
                const packageJsonContents = await storage.readFile('package.json', 'utf-8');
                const packageJson = JSON.parse(packageJsonContents);
                const currentVersion = packageJson.version;
                const newVersion = incrementPatchVersion(currentVersion);
                packageJson.version = newVersion;
                await storage.writeFile('package.json', JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
                logger.info(`Version bumped from ${currentVersion} to ${newVersion}`);

                // Stage and commit the version change
                await run('git add package.json');
                await run(`git commit -m "chore: bump version to ${newVersion}"`);
                logger.info(`Version change committed: ${newVersion}`);
            }

            logger.info(isDryRun ? 'DRY RUN: Would generate release notes...' : 'Generating release notes...');
            const releaseSummary = await Release.execute(runConfig);

            if (isDryRun) {
                logger.info('DRY RUN: Would write release notes to RELEASE_NOTES.md and RELEASE_TITLE.md in output directory');
            } else {
                const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
                await storage.ensureDirectory(outputDirectory);

                const releaseNotesPath = getOutputPath(outputDirectory, 'RELEASE_NOTES.md');
                const releaseTitlePath = getOutputPath(outputDirectory, 'RELEASE_TITLE.md');

                await storage.writeFile(releaseNotesPath, releaseSummary.body, 'utf-8');
                await storage.writeFile(releaseTitlePath, releaseSummary.title, 'utf-8');
                logger.info(`Release notes and title generated and saved to ${releaseNotesPath} and ${releaseTitlePath}.`);
            }

            logger.info(isDryRun ? 'DRY RUN: Would push to origin...' : 'Pushing to origin...');
            await runWithDryRunSupport('git push', isDryRun);

            logger.info(isDryRun ? 'DRY RUN: Would create pull request...' : 'Creating pull request...');
            if (isDryRun) {
                logger.info('DRY RUN: Would get commit title and create PR with GitHub API');
                pr = { number: 123, html_url: 'https://github.com/mock/repo/pull/123', labels: [] } as PullRequest;
            } else {
                const { stdout: commitTitle } = await run('git log -1 --pretty=%B');
                pr = await GitHub.createPullRequest(commitTitle, 'Automated release PR.', await GitHub.getCurrentBranchName());
                if (!pr) {
                    throw new Error('Failed to create pull request.');
                }
                logger.info(`Pull request created: ${pr.html_url}`);
            }
        }

        logger.info(`${isDryRun ? 'DRY RUN: Would wait for' : 'Waiting for'} PR #${pr!.number} checks to complete...`);
        if (!isDryRun) {
            // Configure timeout and user confirmation behavior
            const timeout = runConfig.publish?.checksTimeout || 300000; // 5 minutes default
            const senditMode = runConfig.publish?.sendit || false;
            // sendit flag overrides skipUserConfirmation - if sendit is true, skip confirmation
            const skipUserConfirmation = senditMode || runConfig.publish?.skipUserConfirmation || false;

            await GitHub.waitForPullRequestChecks(pr!.number, {
                timeout,
                skipUserConfirmation
            });
        }

        const mergeMethod = runConfig.publish?.mergeMethod || 'squash';
        if (isDryRun) {
            logger.info(`DRY RUN: Would merge PR #${pr!.number} using ${mergeMethod} method`);
        } else {
            await GitHub.mergePullRequest(pr!.number, mergeMethod);
        }

        logger.info(isDryRun ? 'DRY RUN: Would checkout main branch...' : 'Checking out main branch...');
        await runWithDryRunSupport('git checkout main', isDryRun);
        await runWithDryRunSupport('git pull origin main', isDryRun);

        // Now create and push the tag on the main branch
        logger.info(isDryRun ? 'DRY RUN: Would create release tag...' : 'Creating release tag...');
        if (isDryRun) {
            logger.info('DRY RUN: Would read package.json version and create git tag');
        } else {
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const { version } = JSON.parse(packageJsonContents);
            const tagName = `v${version}`;

            // Check if tag already exists locally
            try {
                const { stdout } = await run(`git tag -l ${tagName}`);
                if (stdout.trim() === tagName) {
                    logger.info(`Tag ${tagName} already exists locally, skipping tag creation`);
                } else {
                    await run(`git tag ${tagName}`);
                    logger.info(`Created local tag: ${tagName}`);
                }
            } catch (error) {
                // If git tag -l fails, create the tag anyway
                await run(`git tag ${tagName}`);
                logger.info(`Created local tag: ${tagName}`);
            }

            // Check if tag exists on remote before pushing
            try {
                const { stdout } = await run(`git ls-remote origin refs/tags/${tagName}`);
                if (stdout.trim()) {
                    logger.info(`Tag ${tagName} already exists on remote, skipping push`);
                } else {
                    await run(`git push origin ${tagName}`);
                    logger.info(`Pushed tag to remote: ${tagName}`);
                }
            } catch (error) {
                // If ls-remote fails, try to push anyway (might be a new remote)
                try {
                    await run(`git push origin ${tagName}`);
                    logger.info(`Pushed tag to remote: ${tagName}`);
                } catch (pushError: any) {
                    if (pushError.message && pushError.message.includes('already exists')) {
                        logger.info(`Tag ${tagName} already exists on remote, continuing...`);
                    } else {
                        throw pushError;
                    }
                }
            }
        }

        logger.info(isDryRun ? 'DRY RUN: Would create GitHub release...' : 'Creating GitHub release...');
        let tagName: string;
        if (isDryRun) {
            logger.info('DRY RUN: Would read package.json version and create GitHub release');
            tagName = 'v1.0.0'; // Mock version for dry run
        } else {
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const { version } = JSON.parse(packageJsonContents);
            tagName = `v${version}`;

            const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
            const releaseNotesPath = getOutputPath(outputDirectory, 'RELEASE_NOTES.md');
            const releaseTitlePath = getOutputPath(outputDirectory, 'RELEASE_TITLE.md');

            const releaseNotesContent = await storage.readFile(releaseNotesPath, 'utf-8');
            const releaseTitle = await storage.readFile(releaseTitlePath, 'utf-8');
            await GitHub.createRelease(tagName, releaseTitle, releaseNotesContent);
        }

        // Wait for release workflows to complete (if enabled)
        const waitForWorkflows = runConfig.publish?.waitForReleaseWorkflows !== false; // default to true
        if (waitForWorkflows) {
            logger.info(isDryRun ? 'DRY RUN: Would wait for release workflows...' : 'Waiting for release workflows...');
            if (isDryRun) {
                logger.info('DRY RUN: Would monitor GitHub Actions workflows triggered by release');
            } else {
                const workflowTimeout = runConfig.publish?.releaseWorkflowsTimeout || 600000; // 10 minutes default
                const senditMode = runConfig.publish?.sendit || false;
                const skipUserConfirmation = senditMode || runConfig.publish?.skipUserConfirmation || false;

                // Get workflow names - either from config or auto-detect
                let workflowNames = runConfig.publish?.releaseWorkflowNames;

                if (!workflowNames || workflowNames.length === 0) {
                    logger.info('No specific workflow names configured, auto-detecting workflows triggered by release events...');
                    try {
                        workflowNames = await GitHub.getWorkflowsTriggeredByRelease();
                        if (workflowNames.length === 0) {
                            logger.info('No workflows found that are triggered by release events.');
                        } else {
                            logger.info(`Auto-detected release workflows: ${workflowNames.join(', ')}`);
                        }
                    } catch (error: any) {
                        logger.warn(`Failed to auto-detect release workflows: ${error.message}`);
                        workflowNames = undefined; // Fall back to monitoring all workflows
                    }
                }

                await GitHub.waitForReleaseWorkflows(tagName, {
                    timeout: workflowTimeout,
                    workflowNames,
                    skipUserConfirmation
                });
            }
        } else {
            logger.verbose(isDryRun ? 'DRY RUN: Would skip waiting for release workflows (disabled in config).' : 'Skipping waiting for release workflows (disabled in config).');
        }

        logger.info(isDryRun ? 'DRY RUN: Would create new release branch...' : 'Creating new release branch...');
        if (isDryRun) {
            logger.info('DRY RUN: Would create next release branch (e.g., release/1.0.1) and push to origin');
        } else {
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const { version } = JSON.parse(packageJsonContents);
            const nextVersion = incrementPatchVersion(version);
            const newBranchName = `release/${nextVersion}`;
            await run(`git checkout -b ${newBranchName}`);
            await run(`git push -u origin ${newBranchName}`);
            logger.info(`Branch ${newBranchName} created and pushed to origin.`);
        }

        logger.info(isDryRun ? 'DRY RUN: Preparation would be complete.' : 'Preparation complete.');
    } finally {
        // Restore linked packages (if enabled)
        const shouldLink = runConfig.publish?.linkWorkspacePackages !== false; // default to true
        if (shouldLink) {
            logger.verbose(isDryRun ? 'DRY RUN: Would restore linked packages...' : 'Restoring linked packages...');
            await Link.execute(runConfig);
        } else {
            logger.verbose(isDryRun ? 'DRY RUN: Would skip restore linked packages (disabled in config).' : 'Skipping restore linked packages (disabled in config).');
        }
    }
};
