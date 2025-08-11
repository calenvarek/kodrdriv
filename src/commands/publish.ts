/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import * as Commit from './commit';
import * as Diff from '../content/diff';
import * as Release from './release';

import { getLogger, getDryRunLogger } from '../logging';
import { Config, PullRequest } from '../types';
import { run, runWithDryRunSupport } from '../util/child';
import * as GitHub from '../util/github';
import { create as createStorage } from '../util/storage';
import { incrementPatchVersion, getOutputPath, calculateTargetVersion, checkIfTagExists, confirmVersionInteractively } from '../util/general';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { safeJsonParse, validatePackageJson } from '../util/validation';
import { isBranchInSyncWithRemote, safeSyncBranchWithRemote, localBranchExists } from '../util/git';

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

    } catch (error: any) {
        if (!isDryRun) {
            // Preserve the original error message to help with debugging
            const originalMessage = error.message || error.toString();
            throw new Error(`Not in a git repository or git command failed: ${originalMessage}. Please run this command from within a git repository.`);
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

    } catch (error: any) {
        if (!isDryRun) {
            // Preserve the original error message to help with debugging
            const originalMessage = error.message || error.toString();
            throw new Error(`Failed to check git status: ${originalMessage}. Please ensure you are in a valid git repository and try again.`);
        }
    }

    // Check that we're not running from the target branch
    logger.info('Checking current branch...');
    const targetBranch = runConfig.publish?.targetBranch || 'main';
    if (isDryRun) {
        logger.info(`Would verify current branch is not the target branch (${targetBranch})`);
    } else {
        const currentBranch = await GitHub.getCurrentBranchName();
        if (currentBranch === targetBranch) {
            throw new Error(`Cannot run publish from the target branch '${targetBranch}'. Please switch to a different branch before running publish.`);
        }
    }

    // Check target branch sync with remote
    logger.info(`Checking target branch '${targetBranch}' sync with remote...`);
    if (isDryRun) {
        logger.info(`Would verify target branch '${targetBranch}' is in sync with remote origin`);
    } else {
        // Only check if local target branch exists (it's okay if it doesn't exist locally)
        const targetBranchExists = await localBranchExists(targetBranch);
        if (targetBranchExists) {
            const syncStatus = await isBranchInSyncWithRemote(targetBranch);

            if (!syncStatus.inSync) {
                logger.error(`❌ Target branch '${targetBranch}' is not in sync with remote.`);
                logger.error('');

                if (syncStatus.error) {
                    logger.error(`   Error: ${syncStatus.error}`);
                } else if (syncStatus.localSha && syncStatus.remoteSha) {
                    logger.error(`   Local:  ${syncStatus.localSha.substring(0, 8)}`);
                    logger.error(`   Remote: ${syncStatus.remoteSha.substring(0, 8)}`);
                }

                logger.error('');
                logger.error('📋 To resolve this issue:');
                logger.error(`   1. Switch to the target branch: git checkout ${targetBranch}`);
                logger.error(`   2. Pull the latest changes: git pull origin ${targetBranch}`);
                logger.error('   3. Resolve any merge conflicts if they occur');
                logger.error('   4. Switch back to your feature branch and re-run publish');
                logger.error('');
                logger.error('💡 Alternatively, run "kodrdriv publish --sync-target" to attempt automatic sync.');

                throw new Error(`Target branch '${targetBranch}' is not in sync with remote. Please sync the branch before running publish.`);
            } else {
                logger.info(`✅ Target branch '${targetBranch}' is in sync with remote.`);
            }
        } else {
            logger.info(`ℹ️  Target branch '${targetBranch}' does not exist locally - will be created when needed.`);
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

const handleTargetBranchSyncRecovery = async (runConfig: Config): Promise<void> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const targetBranch = runConfig.publish?.targetBranch || 'main';

    logger.info(`🔄 Attempting to sync target branch '${targetBranch}' with remote...`);

    if (isDryRun) {
        logger.info(`Would attempt to sync '${targetBranch}' with remote`);
        return;
    }

    const syncResult = await safeSyncBranchWithRemote(targetBranch);

    if (syncResult.success) {
        logger.info(`✅ Successfully synced '${targetBranch}' with remote.`);
        logger.info('You can now re-run the publish command.');
    } else if (syncResult.conflictResolutionRequired) {
        logger.error(`❌ Failed to sync '${targetBranch}': conflicts detected.`);
        logger.error('');
        logger.error('📋 Manual conflict resolution required:');
        logger.error(`   1. Switch to the target branch: git checkout ${targetBranch}`);
        logger.error(`   2. Pull and resolve conflicts: git pull origin ${targetBranch}`);
        logger.error('   3. Commit the resolved changes');
        logger.error('   4. Switch back to your feature branch and re-run publish');
        logger.error('');
        throw new Error(`Target branch '${targetBranch}' has conflicts that require manual resolution.`);
    } else {
        logger.error(`❌ Failed to sync '${targetBranch}': ${syncResult.error}`);
        throw new Error(`Failed to sync target branch: ${syncResult.error}`);
    }
};

export const execute = async (runConfig: Config): Promise<void> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const storage = createStorage({ log: logger.info });
    const targetBranch = runConfig.publish?.targetBranch || 'main';

    // Handle --sync-target flag
    if (runConfig.publish?.syncTarget) {
        await handleTargetBranchSyncRecovery(runConfig);
        return; // Exit after sync operation
    }

    // Run prechecks before starting any work
    await runPrechecks(runConfig);

    logger.info('Starting release process...');


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

        // STEP 1: Determine and set target version FIRST (before any commits)
        logger.info('Determining target version...');
        let newVersion: string;

        if (isDryRun) {
            logger.info('Would determine target version and update package.json');
            newVersion = '1.0.0'; // Mock version for dry run
        } else {
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const parsed = safeJsonParse(packageJsonContents, 'package.json');
            const packageJson = validatePackageJson(parsed, 'package.json');
            const currentVersion = packageJson.version;

            // Determine target version based on --targetVersion option
            const targetVersionInput = runConfig.publish?.targetVersion || 'patch';
            const proposedVersion = calculateTargetVersion(currentVersion, targetVersionInput);

            // Check if target tag already exists
            const targetTagName = `v${proposedVersion}`;
            const tagExists = await checkIfTagExists(targetTagName);
            if (tagExists) {
                throw new Error(`Tag ${targetTagName} already exists. Please choose a different version or delete the existing tag.`);
            }

            // Interactive confirmation if --interactive flag is set
            if (runConfig.publish?.interactive) {
                newVersion = await confirmVersionInteractively(currentVersion, proposedVersion, targetVersionInput);

                // Re-check if the confirmed version's tag exists (in case user entered custom version)
                const confirmedTagName = `v${newVersion}`;
                const confirmedTagExists = await checkIfTagExists(confirmedTagName);
                if (confirmedTagExists) {
                    throw new Error(`Tag ${confirmedTagName} already exists. Please choose a different version or delete the existing tag.`);
                }
            } else {
                newVersion = proposedVersion;
            }

            logger.info(`Bumping version from ${currentVersion} to ${newVersion}`);

            // Update package.json with the new version BEFORE any other operations
            packageJson.version = newVersion;
            await storage.writeFile('package.json', JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
            logger.info(`Version updated in package.json: ${newVersion}`);
        }

        // STEP 2: Prepare for release (with correct version now in package.json)
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

        logger.info('Running prepublishOnly script...');
        await runWithDryRunSupport('npm run prepublishOnly', isDryRun, {}, true); // Use inherited stdio

        // STEP 3: Stage all changes (version bump + dependencies + any build artifacts)
        logger.verbose('Staging all changes for release commit');
        await runWithDryRunSupport('git add package.json package-lock.json', isDryRun);

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

        logger.info('Generating release notes...');
        // Create a modified config for release notes generation that includes the publish --from and --interactive options
        const releaseConfig = { ...runConfig };
        if (runConfig.publish?.from || runConfig.publish?.interactive) {
            // Pass the publish --from and --interactive options to the release config
            releaseConfig.release = {
                ...runConfig.release,
                ...(runConfig.publish.from && { from: runConfig.publish.from }),
                ...(runConfig.publish.interactive && { interactive: runConfig.publish.interactive })
            };
            if (runConfig.publish.from) {
                logger.verbose(`Using custom 'from' reference for release notes: ${runConfig.publish.from}`);
            }
            if (runConfig.publish.interactive) {
                logger.verbose('Interactive mode enabled for release notes generation');
            }
        }
        const releaseSummary = await Release.execute(releaseConfig);

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
            await GitHub.mergePullRequest(pr!.number, mergeMethod, false); // Don't delete branch
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

    // Switch to target branch and pull latest changes
    logger.info(`Checking out target branch: ${targetBranch}...`);

    try {
        await runWithDryRunSupport(`git checkout ${targetBranch}`, isDryRun);
        await runWithDryRunSupport(`git pull origin ${targetBranch}`, isDryRun);
    } catch (error: any) {
        // Check if this is a merge conflict or sync issue
        if (!isDryRun && (error.message.includes('conflict') ||
                         error.message.includes('CONFLICT') ||
                         error.message.includes('diverged') ||
                         error.message.includes('non-fast-forward'))) {

            logger.error(`❌ Failed to sync target branch '${targetBranch}' with remote.`);
            logger.error('');
            logger.error('📋 Recovery options:');
            logger.error(`   1. Run 'kodrdriv publish --sync-target' to attempt automatic resolution`);
            logger.error(`   2. Manually resolve conflicts:`);
            logger.error(`      - git checkout ${targetBranch}`);
            logger.error(`      - git pull origin ${targetBranch}`);
            logger.error(`      - Resolve any conflicts and commit`);
            logger.error(`      - Re-run your original publish command`);
            logger.error('');
            logger.error('💡 The publish process has been stopped to prevent data loss.');

            throw new Error(`Target branch '${targetBranch}' sync failed. Use recovery options above to resolve.`);
        } else {
            // Re-throw other errors
            throw error;
        }
    }

    // Now create and push the tag on the target branch
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

    // Switch to target branch
    logger.info(`Switching to target branch: ${targetBranch}`);
    await runWithDryRunSupport(`git checkout ${targetBranch}`, isDryRun);

    logger.info('Publish process complete.');
};
