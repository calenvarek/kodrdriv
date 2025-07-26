/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import * as Commit from './commit';
import * as Diff from '../content/diff';
import * as Release from './release';
import * as Link from './link';
import * as Unlink from './unlink';
import { getLogger, getDryRunLogger } from '../logging';
import { Config, PullRequest } from '../types';
import { run, runWithDryRunSupport } from '../util/child';
import * as GitHub from '../util/github';
import { create as createStorage } from '../util/storage';
import { incrementPatchVersion, getOutputPath } from '../util/general';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { safeJsonParse, validatePackageJson } from '../util/validation';

const scanNpmrcForEnvVars = async (storage: any): Promise<string[]> => {
    const logger = getLogger();
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

        } catch (error: any) {
            logger.warn(`Failed to read .npmrc file at ${npmrcPath}: ${error.message}`);
            logger.verbose('This may affect environment variable detection for publishing');
        }
    } else {
        logger.debug('.npmrc file not found, skipping environment variable scan');
    }

    return envVars;
};

const validateEnvironmentVariables = (requiredEnvVars: string[], isDryRun: boolean): void => {
    const logger = getDryRunLogger(isDryRun);
    const missingEnvVars: string[] = [];

    for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
            missingEnvVars.push(envVar);
        }
    }

    if (missingEnvVars.length > 0) {
        if (isDryRun) {
            logger.warn(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
        } else {
            logger.error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
            throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}. Please set these environment variables before running publish.`);
        }
    }
};

const runPrechecks = async (runConfig: Config): Promise<void> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const storage = createStorage({ log: logger.info });

    logger.info('Running prechecks...');

    // Check if we're in a git repository
    try {
        if (isDryRun) {
            logger.info('Would check git repository with: git rev-parse --git-dir');
        } else {
            await run('git rev-parse --git-dir');
        }

    } catch (error) {
        if (!isDryRun) {
            throw new Error('Not in a git repository. Please run this command from within a git repository.');
        }
    }

    // Check for uncommitted changes
    logger.info('Checking for uncommitted changes...');
    try {
        if (isDryRun) {
            logger.info('Would check git status with: git status --porcelain');
        } else {
            const { stdout } = await run('git status --porcelain');
            if (stdout.trim()) {
                throw new Error('Working directory has uncommitted changes. Please commit or stash your changes before running publish.');
            }
        }

    } catch (error) {
        if (!isDryRun) {
            throw new Error('Failed to check git status. Please ensure you are in a valid git repository.');
        }
    }

    // Check if we're on a release branch
    logger.info('Checking current branch...');
    if (isDryRun) {
        logger.info('Would verify current branch is a release branch (starts with "release/")');
    } else {
        const currentBranch = await GitHub.getCurrentBranchName();
        if (!currentBranch.startsWith('release/')) {
            throw new Error(`Current branch '${currentBranch}' is not a release branch. Please switch to a release branch (e.g., release/1.0.0) before running publish.`);
        }
    }

    // Check if prepublishOnly script exists in package.json
    logger.info('Checking for prepublishOnly script...');
    const packageJsonPath = path.join(process.cwd(), 'package.json');

    if (!await storage.exists(packageJsonPath)) {
        if (!isDryRun) {
            throw new Error('package.json not found in current directory.');
        } else {
            logger.warn('package.json not found in current directory.');
        }
    } else {
        let packageJson;
        try {
            const packageJsonContents = await storage.readFile(packageJsonPath, 'utf-8');
            const parsed = safeJsonParse(packageJsonContents, packageJsonPath);
            packageJson = validatePackageJson(parsed, packageJsonPath);

        } catch (error) {
            if (!isDryRun) {
                throw new Error('Failed to parse package.json. Please ensure it contains valid JSON.');
            } else {
                logger.warn('Failed to parse package.json. Please ensure it contains valid JSON.');
            }
        }

        if (packageJson && !packageJson.scripts?.prepublishOnly) {
            if (!isDryRun) {
                throw new Error('prepublishOnly script is required in package.json but was not found. Please add a prepublishOnly script that runs your pre-flight checks (e.g., clean, lint, build, test).');
            } else {
                logger.warn('prepublishOnly script is required in package.json but was not found.');
            }
        }
    }

    // Check required environment variables
    logger.verbose('Checking required environment variables...');
    const coreRequiredEnvVars = runConfig.publish?.requiredEnvVars || [];
    const npmrcEnvVars = isDryRun ? [] : await scanNpmrcForEnvVars(storage); // Skip .npmrc scan in dry run
    const allRequiredEnvVars = [...new Set([...coreRequiredEnvVars, ...npmrcEnvVars])];

    if (allRequiredEnvVars.length > 0) {
        logger.verbose(`Required environment variables: ${allRequiredEnvVars.join(', ')}`);
        validateEnvironmentVariables(allRequiredEnvVars, isDryRun);
    } else {
        logger.verbose('No required environment variables specified.');
    }

    logger.info('All prechecks passed.');
};

export const execute = async (runConfig: Config): Promise<void> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const storage = createStorage({ log: logger.info });

    // Track whether the publish process completed successfully
    let publishCompleted = false;
    // Track whether we've unlinked packages (and thus need to restore them)
    let packagesUnlinked = false;

    // Run prechecks before starting any work
    await runPrechecks(runConfig);

    logger.info('Starting release process...');

    try {
        // Unlink all workspace packages before starting (if enabled)
        const shouldUnlink = runConfig.publish?.unlinkWorkspacePackages !== false; // default to true
        if (shouldUnlink) {
            logger.verbose('Unlinking workspace packages...');
            await Unlink.execute(runConfig);
            packagesUnlinked = true;
        } else {
            logger.verbose('Skipping unlink workspace packages (disabled in config).');
        }

        let pr: PullRequest | null = null;

        if (isDryRun) {
            logger.info('Would check for existing pull request');
            logger.info('Assuming no existing PR found for demo purposes');
        } else {
            const branchName = await GitHub.getCurrentBranchName();
            pr = await GitHub.findOpenPullRequestByHeadRef(branchName);
        }

        if (pr) {
            logger.info(`Found existing pull request for branch: ${pr.html_url}`);
        } else {
            logger.info('No open pull request found, starting new release publishing process...');
            // 1. Prepare for release
            logger.verbose('Preparing for release: switching from workspace to remote dependencies.');

            logger.verbose('Updating dependencies to latest versions from registry');
            const updatePatterns = runConfig.publish?.dependencyUpdatePatterns;
            if (updatePatterns && updatePatterns.length > 0) {
                logger.verbose(`Updating dependencies matching patterns: ${updatePatterns.join(', ')}`);
                const patternsArg = updatePatterns.join(' ');
                await runWithDryRunSupport(`npm update ${patternsArg}`, isDryRun);
            } else {
                logger.verbose('No dependency update patterns specified, updating all dependencies');
                await runWithDryRunSupport('npm update', isDryRun);
            }

            logger.verbose('Staging changes for release commit');
            await runWithDryRunSupport('git add package.json package-lock.json', isDryRun);

            logger.info('Running prepublishOnly script...');
            await runWithDryRunSupport('npm run prepublishOnly', isDryRun);

            logger.verbose('Checking for staged changes...');
            if (isDryRun) {
                logger.verbose('Assuming staged changes exist for demo purposes');
                logger.verbose('Would create commit...');
                await Commit.execute(runConfig);
            } else {
                if (await Diff.hasStagedChanges()) {
                    logger.verbose('Staged changes found, creating commit...');
                    await Commit.execute(runConfig);
                } else {
                    logger.verbose('No changes to commit, skipping commit.');
                }
            }

            logger.info('Bumping version...');
            // Manually increment version without creating a tag
            if (isDryRun) {
                logger.info('Would manually increment patch version in package.json and commit');
            } else {
                const packageJsonContents = await storage.readFile('package.json', 'utf-8');
                const parsed = safeJsonParse(packageJsonContents, 'package.json');
                const packageJson = validatePackageJson(parsed, 'package.json');
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

            logger.info('Generating release notes...');
            const releaseSummary = await Release.execute(runConfig);

            if (isDryRun) {
                logger.info('Would write release notes to RELEASE_NOTES.md and RELEASE_TITLE.md in output directory');
            } else {
                const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
                await storage.ensureDirectory(outputDirectory);

                const releaseNotesPath = getOutputPath(outputDirectory, 'RELEASE_NOTES.md');
                const releaseTitlePath = getOutputPath(outputDirectory, 'RELEASE_TITLE.md');

                await storage.writeFile(releaseNotesPath, releaseSummary.body, 'utf-8');
                await storage.writeFile(releaseTitlePath, releaseSummary.title, 'utf-8');
                logger.info(`Release notes and title generated and saved to ${releaseNotesPath} and ${releaseTitlePath}.`);
            }

            logger.info('Pushing to origin...');
            // Get current branch name and push explicitly to avoid pushing to wrong remote/branch
            const currentBranch = await GitHub.getCurrentBranchName();
            await runWithDryRunSupport(`git push origin ${currentBranch}`, isDryRun);

            logger.info('Creating pull request...');
            if (isDryRun) {
                logger.info('Would get commit title and create PR with GitHub API');
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

        logger.info(`Waiting for PR #${pr!.number} checks to complete...`);
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
            logger.info(`Would merge PR #${pr!.number} using ${mergeMethod} method`);
        } else {
            try {
                await GitHub.mergePullRequest(pr!.number, mergeMethod);
            } catch (error: any) {
                // Check if this is a merge conflict error
                if (error.message && (
                    error.message.includes('not mergeable') ||
                    error.message.includes('Pull Request is not mergeable') ||
                    error.message.includes('merge conflict')
                )) {
                    logger.error(`❌ Pull Request #${pr!.number} has merge conflicts that need to be resolved.`);
                    logger.error('');
                    logger.error('📋 To resolve this issue:');
                    logger.error(`   1. Visit the Pull Request: ${pr!.html_url}`);
                    logger.error('   2. Resolve the merge conflicts through GitHub\'s web interface or locally');
                    logger.error('   3. Once conflicts are resolved, re-run the publish command');
                    logger.error('');
                    logger.error('💡 The command will automatically detect the existing PR and continue from where it left off.');
                    throw new Error(`Merge conflicts detected in PR #${pr!.number}. Please resolve conflicts and re-run the command.`);
                } else {
                    // Re-throw other merge errors
                    throw error;
                }
            }
        }

        logger.info('Checking out main branch...');
        await runWithDryRunSupport('git checkout main', isDryRun);
        await runWithDryRunSupport('git pull origin main', isDryRun);

        // Now create and push the tag on the main branch
        logger.info('Creating release tag...');
        let tagName: string;
        if (isDryRun) {
            logger.info('Would read package.json version and create git tag');
            tagName = 'v1.0.0'; // Mock version for dry run
        } else {
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const { version } = JSON.parse(packageJsonContents);
            tagName = `v${version}`;

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
            let tagWasPushed = false;
            try {
                const { stdout } = await run(`git ls-remote origin refs/tags/${tagName}`);
                if (stdout.trim()) {
                    logger.info(`Tag ${tagName} already exists on remote, skipping push`);
                } else {
                    await run(`git push origin ${tagName}`);
                    logger.info(`Pushed tag to remote: ${tagName}`);
                    tagWasPushed = true;
                }
            } catch (error) {
                // If ls-remote fails, try to push anyway (might be a new remote)
                try {
                    await run(`git push origin ${tagName}`);
                    logger.info(`Pushed tag to remote: ${tagName}`);
                    tagWasPushed = true;
                } catch (pushError: any) {
                    if (pushError.message && pushError.message.includes('already exists')) {
                        logger.info(`Tag ${tagName} already exists on remote, continuing...`);
                    } else {
                        throw pushError;
                    }
                }
            }

            // If we just pushed a new tag, wait for GitHub to process it
            if (tagWasPushed) {
                logger.verbose('Waiting for GitHub to process the pushed tag...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
            }
        }

        logger.info('Creating GitHub release...');
        if (isDryRun) {
            logger.info('Would read package.json version and create GitHub release with retry logic');
        } else {
            const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
            const releaseNotesPath = getOutputPath(outputDirectory, 'RELEASE_NOTES.md');
            const releaseTitlePath = getOutputPath(outputDirectory, 'RELEASE_TITLE.md');

            const releaseNotesContent = await storage.readFile(releaseNotesPath, 'utf-8');
            const releaseTitle = await storage.readFile(releaseTitlePath, 'utf-8');

            // Create release with retry logic to handle GitHub tag processing delays
            let retries = 3;
            while (retries > 0) {
                try {
                    await GitHub.createRelease(tagName, releaseTitle, releaseNotesContent);
                    logger.info(`GitHub release created successfully for tag: ${tagName}`);
                    break; // Success - exit retry loop
                } catch (error: any) {
                    // Check if this is a tag-not-found error that we can retry
                    const isTagNotFoundError = error.message && (
                        error.message.includes('not found') ||
                        error.message.includes('does not exist') ||
                        error.message.includes('Reference does not exist')
                    );

                    if (isTagNotFoundError && retries > 1) {
                        logger.verbose(`Tag ${tagName} not yet available on GitHub, retrying in 3 seconds... (${retries - 1} retries left)`);
                        await new Promise(resolve => setTimeout(resolve, 3000));
                        retries--;
                    } else if (isTagNotFoundError) {
                        // Tag not found error and we're out of retries
                        throw new Error(`Tag ${tagName} was not found on GitHub after ${3 - retries + 1} attempts. This may indicate a problem with tag creation or GitHub synchronization.`);
                    } else {
                        // Not a tag-not-found error - re-throw the original error
                        throw error;
                    }
                }
            }
        }

        // Wait for release workflows to complete (if enabled)
        const waitForWorkflows = runConfig.publish?.waitForReleaseWorkflows !== false; // default to true
        if (waitForWorkflows) {
            logger.info('Waiting for release workflows...');
            if (isDryRun) {
                logger.info('Would monitor GitHub Actions workflows triggered by release');
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
            logger.verbose('Skipping waiting for release workflows (disabled in config).');
        }

        logger.info('Creating new release branch...');
        if (isDryRun) {
            logger.info('Would create next release branch (e.g., release/1.0.1) and push to origin');
        } else {
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const { version } = JSON.parse(packageJsonContents);
            const nextVersion = incrementPatchVersion(version);
            const newBranchName = `release/${nextVersion}`;

            // Check if branch already exists locally
            let branchExists = false;
            try {
                await run(`git show-ref --verify --quiet refs/heads/${newBranchName}`);
                branchExists = true;
            } catch {
                // Branch doesn't exist locally
                branchExists = false;
            }

            if (branchExists) {
                // Branch exists, switch to it
                await run(`git checkout ${newBranchName}`);
                logger.info(`Switched to existing branch ${newBranchName}`);
            } else {
                // Branch doesn't exist, create it
                await run(`git checkout -b ${newBranchName}`);
                logger.info(`Created new branch ${newBranchName}`);
            }

            // Check if branch exists on remote before pushing
            let remoteExists = false;
            try {
                const { stdout } = await run(`git ls-remote origin refs/heads/${newBranchName}`);
                remoteExists = stdout.trim() !== '';
            } catch {
                // Assume remote doesn't exist if ls-remote fails
                remoteExists = false;
            }

            if (remoteExists) {
                logger.info(`Branch ${newBranchName} already exists on remote, skipping push`);
            } else {
                await run(`git push -u origin ${newBranchName}`);
                logger.info(`Branch ${newBranchName} pushed to origin.`);
            }
        }

        logger.info('Preparation complete.');
        publishCompleted = true; // Mark as completed only if we reach this point
    } finally {
        // Restore linked packages intelligently based on what happened
        const shouldLink = runConfig.publish?.linkWorkspacePackages !== false; // default to true
        if (shouldLink && packagesUnlinked) {
            if (publishCompleted) {
                logger.verbose('Restoring linked packages after successful publish...');
                await Link.execute(runConfig);
            } else {
                // We unlinked packages but didn't complete successfully
                // We need to check if this was a merge failure or an earlier failure
                // If it was a merge failure, we don't want to introduce new local changes
                logger.verbose('Publish failed after unlinking packages.');
                logger.verbose('To avoid introducing local changes, packages will remain unlinked.');
                logger.verbose('You can run "kodrdriv link" manually after resolving any issues.');
            }
        } else if (shouldLink && !packagesUnlinked) {
            logger.verbose('No packages were unlinked, skipping restore.');
        } else {
            logger.verbose('Skipping restore linked packages (disabled in config).');
        }
    }
};
