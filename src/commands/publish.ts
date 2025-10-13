/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';
import * as Commit from './commit';
import * as Diff from '../content/diff';
import * as Release from './release';

import { getLogger, getDryRunLogger } from '../logging';
import { Config, PullRequest } from '../types';
import { run, runWithDryRunSupport, runSecure, validateGitRef } from '../util/child';
import * as GitHub from '../util/github';
import { create as createStorage } from '../util/storage';
import { incrementPatchVersion, getOutputPath, calculateTargetVersion, checkIfTagExists, confirmVersionInteractively, calculateBranchDependentVersion } from '../util/general';
import { DEFAULT_OUTPUT_DIRECTORY, KODRDRIV_DEFAULTS } from '../constants';
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

const runPrechecks = async (runConfig: Config, targetBranch?: string): Promise<void> => {
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

    // Use the passed target branch or fallback to config/default
    const effectiveTargetBranch = targetBranch || runConfig.publish?.targetBranch || 'main';

    // Check that we're not running from the target branch
    logger.info('Checking current branch...');
    if (isDryRun) {
        logger.info(`Would verify current branch is not the target branch (${effectiveTargetBranch})`);
    } else {
        const currentBranch = await GitHub.getCurrentBranchName();
        if (currentBranch === effectiveTargetBranch) {
            throw new Error(`Cannot run publish from the target branch '${effectiveTargetBranch}'. Please switch to a different branch before running publish.`);
        }
    }

    // Check target branch sync with remote
    logger.info(`Checking target branch '${effectiveTargetBranch}' sync with remote...`);
    if (isDryRun) {
        logger.info(`Would verify target branch '${effectiveTargetBranch}' is in sync with remote origin`);
    } else {
        // Only check if local target branch exists (it's okay if it doesn't exist locally)
        const targetBranchExists = await localBranchExists(effectiveTargetBranch);
        if (targetBranchExists) {
            const syncStatus = await isBranchInSyncWithRemote(effectiveTargetBranch);

            if (!syncStatus.inSync) {
                logger.error(`❌ Target branch '${effectiveTargetBranch}' is not in sync with remote.`);
                logger.error('');

                if (syncStatus.error) {
                    logger.error(`   Error: ${syncStatus.error}`);
                } else if (syncStatus.localSha && syncStatus.remoteSha) {
                    logger.error(`   Local:  ${syncStatus.localSha.substring(0, 8)}`);
                    logger.error(`   Remote: ${syncStatus.remoteSha.substring(0, 8)}`);
                }

                logger.error('');
                logger.error('📋 To resolve this issue:');
                logger.error(`   1. Switch to the target branch: git checkout ${effectiveTargetBranch}`);
                logger.error(`   2. Pull the latest changes: git pull origin ${effectiveTargetBranch}`);
                logger.error('   3. Resolve any merge conflicts if they occur');
                logger.error('   4. Switch back to your feature branch and re-run publish');
                logger.error('');
                logger.error('💡 Alternatively, run "kodrdriv publish --sync-target" to attempt automatic sync.');

                throw new Error(`Target branch '${effectiveTargetBranch}' is not in sync with remote. Please sync the branch before running publish.`);
            } else {
                logger.info(`✅ Target branch '${effectiveTargetBranch}' is in sync with remote.`);
            }
        } else {
            logger.info(`ℹ️  Target branch '${effectiveTargetBranch}' does not exist locally - will be created when needed.`);
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

// Helper: deep-sort object keys for stable comparison
const sortObjectKeys = (value: any): any => {
    if (Array.isArray(value)) {
        return value.map(sortObjectKeys);
    }
    if (value && typeof value === 'object') {
        const sorted: any = {};
        Object.keys(value).sort().forEach((key) => {
            sorted[key] = sortObjectKeys(value[key]);
        });
        return sorted;
    }
    return value;
};

// Determine if there are substantive changes compared to the target branch (beyond just version bump)
const isReleaseNecessaryComparedToTarget = async (targetBranch: string, isDryRun: boolean): Promise<{ necessary: boolean; reason: string }> => {
    const logger = getDryRunLogger(isDryRun);

    // We compare current HEAD branch to the provided target branch
    const currentBranch = await GitHub.getCurrentBranchName();

    // Check if target branch exists before trying to compare
    try {
        // Validate target branch exists and is accessible
        await runSecure('git', ['rev-parse', '--verify', targetBranch]);
    } catch (error: any) {
        // Target branch doesn't exist or isn't accessible
        logger.verbose(`Target branch '${targetBranch}' does not exist or is not accessible. Proceeding with publish.`);
        return { necessary: true, reason: `Target branch '${targetBranch}' does not exist; first release to this branch` };
    }

    // If branches are identical, nothing to release
    const { stdout: namesStdout } = await runSecure('git', ['diff', '--name-only', `${targetBranch}..${currentBranch}`]);
    const changedFiles = namesStdout.split('\n').map(s => s.trim()).filter(Boolean);

    if (changedFiles.length === 0) {
        // No definitive signal; proceed with publish rather than skipping
        return { necessary: true, reason: 'No detectable changes via diff; proceeding conservatively' };
    }

    // If any files changed other than package.json or package-lock.json, a release is necessary
    const nonVersionFiles = changedFiles.filter(f => f !== 'package.json' && f !== 'package-lock.json');
    if (nonVersionFiles.length > 0) {
        return { necessary: true, reason: `Changed files beyond version bump: ${nonVersionFiles.join(', ')}` };
    }

    // Only package.json and/or package-lock.json changed. Verify package.json change is only the version field
    try {
        // Read package.json content from both branches
        const { stdout: basePkgStdout } = await runSecure('git', ['show', `${targetBranch}:package.json`]);
        const { stdout: headPkgStdout } = await runSecure('git', ['show', `${currentBranch}:package.json`]);

        const basePkg = validatePackageJson(safeJsonParse(basePkgStdout, `${targetBranch}:package.json`), `${targetBranch}:package.json`);
        const headPkg = validatePackageJson(safeJsonParse(headPkgStdout, `${currentBranch}:package.json`), `${currentBranch}:package.json`);

        const { version: _baseVersion, ...baseWithoutVersion } = basePkg;
        const { version: _headVersion, ...headWithoutVersion } = headPkg;

        const baseSorted = sortObjectKeys(baseWithoutVersion);
        const headSorted = sortObjectKeys(headWithoutVersion);

        const equalExceptVersion = JSON.stringify(baseSorted) === JSON.stringify(headSorted);
        if (equalExceptVersion) {
            return { necessary: false, reason: 'Only version changed in package.json (plus lockfile)' };
        }

        // Other fields changed inside package.json
        return { necessary: true, reason: 'package.json changes beyond version field' };
    } catch (error: any) {
        // Conservative: if we cannot prove it is only a version change, proceed with release
        logger.verbose(`Could not conclusively compare package.json changes: ${error.message}`);
        return { necessary: true, reason: 'Could not compare package.json safely' };
    }
};

const handleTargetBranchSyncRecovery = async (runConfig: Config, targetBranch: string): Promise<void> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

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

    // Get current branch for branch-dependent targeting
    let currentBranch: string;
    if (isDryRun) {
        currentBranch = 'mock-branch';
    } else {
        currentBranch = await GitHub.getCurrentBranchName();

        // Fetch latest remote information to avoid conflicts
        logger.info('📡 Fetching latest remote information to avoid conflicts...');
        try {
            await run('git fetch origin');
            logger.info('✅ Fetched latest remote information');
        } catch (error: any) {
            logger.warn(`⚠️ Could not fetch from remote: ${error.message}`);
        }

        // Sync current branch with remote to avoid conflicts
        logger.info(`🔄 Syncing ${currentBranch} with remote to avoid conflicts...`);
        try {
            const remoteExists = await run(`git ls-remote --exit-code --heads origin ${currentBranch}`).then(() => true).catch(() => false);

            if (remoteExists) {
                await run(`git pull origin ${currentBranch} --no-edit`);
                logger.info(`✅ Synced ${currentBranch} with remote`);
            } else {
                logger.info(`ℹ️ No remote ${currentBranch} branch found, will be created on first push`);
            }
        } catch (error: any) {
            if (error.message && error.message.includes('CONFLICT')) {
                logger.error(`❌ Merge conflicts detected when syncing ${currentBranch} with remote`);
                logger.error(`   Please resolve the conflicts manually and then run:`);
                logger.error(`   1. Resolve conflicts in the files`);
                logger.error(`   2. git add <resolved-files>`);
                logger.error(`   3. git commit`);
                logger.error(`   4. kodrdriv publish (to continue)`);
                throw new Error(`Merge conflicts detected when syncing ${currentBranch} with remote. Please resolve conflicts manually.`);
            } else {
                logger.warn(`⚠️ Could not sync with remote ${currentBranch}: ${error.message}`);
            }
        }
    }

    // Determine target branch and version strategy based on branch configuration
    let targetBranch = runConfig.publish?.targetBranch || 'main';
    let branchDependentVersioning = false;

    // Check for branches configuration
    if (runConfig.branches && runConfig.branches[currentBranch]) {
        branchDependentVersioning = true;

        const branchConfig = runConfig.branches[currentBranch];

        if (branchConfig.targetBranch) {
            targetBranch = branchConfig.targetBranch;
        }

        logger.info(`🎯 Branch-dependent targeting enabled:`);
        logger.info(`   Source branch: ${currentBranch}`);
        logger.info(`   Target branch: ${targetBranch}`);

        // Look at target branch config to show version strategy
        const targetBranchConfig = runConfig.branches[targetBranch];
        if (targetBranchConfig?.version) {
            const versionType = targetBranchConfig.version.type;
            const versionTag = targetBranchConfig.version.tag;
            const versionIncrement = targetBranchConfig.version.increment;

            logger.info(`   Target branch version strategy: ${versionType}${versionTag ? ` (tag: ${versionTag})` : ''}${versionIncrement ? ' with increment' : ''}`);
        }
    } else {
        logger.debug(`No branch-specific targeting configured for '${currentBranch}', using default target: ${targetBranch}`);
    }

    // Handle --sync-target flag
    if (runConfig.publish?.syncTarget) {
        await handleTargetBranchSyncRecovery(runConfig, targetBranch);
        return; // Exit after sync operation
    }

    // Check if target branch exists and create it if needed
    logger.info(`Checking if target branch '${targetBranch}' exists...`);
    if (isDryRun) {
        logger.info(`Would check if target branch '${targetBranch}' exists and create if needed`);
    } else {
        const targetBranchExists = await localBranchExists(targetBranch);
        if (!targetBranchExists) {
            logger.info(`🌟 Target branch '${targetBranch}' does not exist, creating it from current branch...`);
            try {
                // Create the target branch from the current HEAD
                await runSecure('git', ['branch', targetBranch, 'HEAD']);
                logger.info(`✅ Created target branch: ${targetBranch}`);

                // Push the new branch to origin
                await runSecure('git', ['push', 'origin', targetBranch]);
                logger.info(`✅ Pushed new target branch to origin: ${targetBranch}`);
            } catch (error: any) {
                throw new Error(`Failed to create target branch '${targetBranch}': ${error.message}`);
            }
        } else {
            logger.info(`✅ Target branch '${targetBranch}' already exists`);
        }
    }

    // Run prechecks before starting any work
    await runPrechecks(runConfig, targetBranch);

    // Early check: determine if a release is necessary compared to target branch
    logger.info('Evaluating if a release is necessary compared to target branch...');
    try {
        const necessity = await isReleaseNecessaryComparedToTarget(targetBranch, isDryRun);
        if (!necessity.necessary) {
            logger.info(`Skipping publish: ${necessity.reason}.`);
            // Emit a machine-readable marker so tree mode can detect skip and avoid propagating versions
            logger.info('KODRDRIV_PUBLISH_SKIPPED');
            return;
        } else {
            logger.verbose(`Proceeding with publish: ${necessity.reason}.`);
        }
    } catch (error: any) {
        // On unexpected errors, proceed with publish to avoid false negatives blocking releases
        logger.verbose(`Release necessity check encountered an issue (${error.message}). Proceeding with publish.`);
    }

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

        // STEP 1: Prepare for release (update dependencies and run prepublish checks) with NO version bump yet
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

        // STEP 2: Commit dependency updates if any (still no version bump)
        logger.verbose('Staging dependency updates for commit');
        await runWithDryRunSupport('git add package.json package-lock.json', isDryRun);

        logger.verbose('Checking for staged dependency updates...');
        if (isDryRun) {
            logger.verbose('Would create dependency update commit if changes are staged');
        } else {
            if (await Diff.hasStagedChanges()) {
                logger.verbose('Staged dependency changes found, creating commit...');
                await Commit.execute(runConfig);
            } else {
                logger.verbose('No dependency changes to commit, skipping commit.');
            }
        }

        // STEP 3: Merge target branch into working branch to avoid conflicts
        logger.info(`Merging target branch '${targetBranch}' into current branch to avoid version conflicts...`);
        if (isDryRun) {
            logger.info(`Would merge ${targetBranch} into current branch`);
        } else {
            // Fetch the latest target branch
            try {
                await run(`git fetch origin ${targetBranch}:${targetBranch}`);
                logger.info(`✅ Fetched latest ${targetBranch}`);
            } catch (fetchError: any) {
                logger.warn(`⚠️ Could not fetch ${targetBranch}: ${fetchError.message}`);
                logger.warn('Continuing without merge - PR may have conflicts...');
            }

            // Check if merge is needed (avoid unnecessary merge commits)
            try {
                const { stdout: mergeBase } = await run(`git merge-base HEAD ${targetBranch}`);
                const { stdout: targetCommit } = await run(`git rev-parse ${targetBranch}`);

                if (mergeBase.trim() === targetCommit.trim()) {
                    logger.info(`ℹ️  Already up-to-date with ${targetBranch}, no merge needed`);
                } else {
                    // Try to merge target branch into current branch
                    let mergeSucceeded = false;
                    try {
                        await run(`git merge ${targetBranch} --no-edit -m "Merge ${targetBranch} to sync before version bump"`);
                        logger.info(`✅ Merged ${targetBranch} into current branch`);
                        mergeSucceeded = true;
                    } catch (mergeError: any) {
                        // If merge conflicts occur, check if they're only in version-related files
                        const errorText = [mergeError.message || '', mergeError.stdout || '', mergeError.stderr || ''].join(' ');
                        if (errorText.includes('CONFLICT')) {
                            logger.warn(`⚠️  Merge conflicts detected, attempting automatic resolution...`);

                            // Get list of conflicted files
                            const { stdout: conflictedFiles } = await run('git diff --name-only --diff-filter=U');
                            const conflicts = conflictedFiles.trim().split('\n').filter(Boolean);

                            logger.verbose(`Conflicted files: ${conflicts.join(', ')}`);

                            // Check if conflicts are only in package.json and package-lock.json
                            const versionFiles = ['package.json', 'package-lock.json'];
                            const nonVersionConflicts = conflicts.filter(f => !versionFiles.includes(f));

                            if (nonVersionConflicts.length > 0) {
                                logger.error(`❌ Cannot auto-resolve: conflicts in non-version files: ${nonVersionConflicts.join(', ')}`);
                                logger.error('');
                                logger.error('Please resolve conflicts manually:');
                                logger.error('   1. Resolve conflicts in the files listed above');
                                logger.error('   2. git add <resolved-files>');
                                logger.error('   3. git commit');
                                logger.error('   4. kodrdriv publish (to continue)');
                                logger.error('');
                                throw new Error(`Merge conflicts in non-version files. Please resolve manually.`);
                            }

                            // Auto-resolve version conflicts by accepting current branch versions
                            // (keep our working branch's version, which is likely already updated)
                            logger.info(`Auto-resolving version conflicts by keeping current branch versions...`);
                            for (const file of conflicts) {
                                if (versionFiles.includes(file)) {
                                    await run(`git checkout --ours ${file}`);
                                    await run(`git add ${file}`);
                                    logger.verbose(`Resolved ${file} using current branch version`);
                                }
                            }

                            // Complete the merge
                            await run(`git commit --no-edit -m "Merge ${targetBranch} to sync before version bump (auto-resolved version conflicts)"`);
                            logger.info(`✅ Auto-resolved version conflicts and completed merge`);
                            mergeSucceeded = true;
                        } else {
                            // Not a conflict error, re-throw
                            throw mergeError;
                        }
                    }

                    // Only run npm install if merge actually happened
                    if (mergeSucceeded) {
                        // Run npm install to update package-lock.json based on merged package.json
                        logger.info('Running npm install after merge...');
                        await run('npm install');
                        logger.info('✅ npm install completed');

                        // Commit any changes from npm install (e.g., package-lock.json updates)
                        const { stdout: mergeChangesStatus } = await run('git status --porcelain');
                        if (mergeChangesStatus.trim()) {
                            logger.verbose('Staging post-merge changes for commit');
                            await run('git add package.json package-lock.json');

                            if (await Diff.hasStagedChanges()) {
                                logger.verbose('Committing post-merge changes...');
                                await Commit.execute(runConfig);
                            }
                        }
                    }
                }
            } catch (error: any) {
                // Only catch truly unexpected errors here
                logger.error(`❌ Unexpected error during merge: ${error.message}`);
                throw error;
            }
        }

        // STEP 4: Determine and set target version AFTER checks, dependency commit, and target branch merge
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

            let proposedVersion: string;
            let finalTargetBranch = targetBranch;

            if (branchDependentVersioning && runConfig.branches) {
                // Use branch-dependent versioning logic
                const branchDependentResult = await calculateBranchDependentVersion(
                    currentVersion,
                    currentBranch,
                    runConfig.branches,
                    targetBranch
                );
                proposedVersion = branchDependentResult.version;
                finalTargetBranch = branchDependentResult.targetBranch;

                logger.info(`🎯 Branch-dependent version calculated: ${currentVersion} → ${proposedVersion}`);
                logger.info(`🎯 Final target branch: ${finalTargetBranch}`);

                // Update targetBranch for the rest of the function
                targetBranch = finalTargetBranch;
            } else {
                // Use existing logic for backward compatibility
                const targetVersionInput = runConfig.publish?.targetVersion || 'patch';
                proposedVersion = calculateTargetVersion(currentVersion, targetVersionInput);
            }

            const targetTagName = `v${proposedVersion}`;
            const tagExists = await checkIfTagExists(targetTagName);
            if (tagExists) {
                throw new Error(`Tag ${targetTagName} already exists. Please choose a different version or delete the existing tag.`);
            }

            if (runConfig.publish?.interactive) {
                newVersion = await confirmVersionInteractively(currentVersion, proposedVersion, runConfig.publish?.targetVersion);
                const confirmedTagName = `v${newVersion}`;
                const confirmedTagExists = await checkIfTagExists(confirmedTagName);
                if (confirmedTagExists) {
                    throw new Error(`Tag ${confirmedTagName} already exists. Please choose a different version or delete the existing tag.`);
                }
            } else {
                newVersion = proposedVersion;
            }

            logger.info(`Bumping version from ${currentVersion} to ${newVersion}`);
            packageJson.version = newVersion;
            await storage.writeFile('package.json', JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
            logger.info(`Version updated in package.json: ${newVersion}`);
        }

        // STEP 5: Commit version bump as a separate commit
        logger.verbose('Staging version bump for commit');
        await runWithDryRunSupport('git add package.json package-lock.json', isDryRun);

        if (isDryRun) {
            logger.verbose('Would create version bump commit');
        } else {
            if (await Diff.hasStagedChanges()) {
                logger.verbose('Creating version bump commit...');
                await Commit.execute(runConfig);
            } else {
                logger.verbose('No version changes to commit.');
            }
        }

        logger.info('Generating release notes...');
        // Create a modified config for release notes generation that includes the publish --from, --interactive, and --from-main options
        const releaseConfig = { ...runConfig };
        if (runConfig.publish?.from || runConfig.publish?.interactive || runConfig.publish?.fromMain) {
            // Pass the publish options to the release config
            releaseConfig.release = {
                ...runConfig.release,
                ...(runConfig.publish.from && { from: runConfig.publish.from }),
                ...(runConfig.publish.interactive && { interactive: runConfig.publish.interactive }),
                ...(runConfig.publish.fromMain && { fromMain: runConfig.publish.fromMain })
            };
            if (runConfig.publish.from) {
                logger.verbose(`Using custom 'from' reference for release notes: ${runConfig.publish.from}`);
            }
            if (runConfig.publish.interactive) {
                logger.verbose('Interactive mode enabled for release notes generation');
            }
            if (runConfig.publish.fromMain) {
                logger.verbose('Forcing comparison against main branch for release notes');
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
        const branchName = await GitHub.getCurrentBranchName();
        await runWithDryRunSupport(`git push origin ${branchName}`, isDryRun);

        logger.info('Creating pull request...');
        if (isDryRun) {
            logger.info('Would get commit title and create PR with GitHub API');
            pr = { number: 123, html_url: 'https://github.com/mock/repo/pull/123', labels: [] } as PullRequest;
        } else {
            const { stdout: commitTitle } = await run('git log -1 --pretty=%B');
            pr = await GitHub.createPullRequest(commitTitle, 'Automated release PR.', branchName, targetBranch);
            if (!pr) {
                throw new Error('Failed to create pull request.');
            }
            logger.info(`Pull request created: ${pr.html_url} (${branchName} → ${targetBranch})`);
        }
    }

    logger.info(`Waiting for PR #${pr!.number} checks to complete...`);
    if (!isDryRun) {
        // Configure timeout and user confirmation behavior
        const timeout = runConfig.publish?.checksTimeout || KODRDRIV_DEFAULTS.publish.checksTimeout;
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

    // Check for uncommitted changes and stash them if necessary
    let hasStashedChanges = false;
    if (!isDryRun) {
        const { stdout: statusOutput } = await runSecure('git', ['status', '--porcelain']);
        if (statusOutput.trim()) {
            logger.info('📦 Stashing uncommitted changes before checkout...');
            await runSecure('git', ['stash', 'push', '-m', 'kodrdriv: stash before checkout target branch']);
            hasStashedChanges = true;
            logger.info('✅ Successfully stashed uncommitted changes');
        }
    }

    try {
        await runWithDryRunSupport(`git checkout ${targetBranch}`, isDryRun);

        // Sync target branch with remote to avoid conflicts during PR creation
        if (!isDryRun) {
            logger.info(`🔄 Syncing ${targetBranch} with remote to avoid PR conflicts...`);
            try {
                const remoteExists = await run(`git ls-remote --exit-code --heads origin ${targetBranch}`).then(() => true).catch(() => false);

                if (remoteExists) {
                    await run(`git pull origin ${targetBranch} --no-edit`);
                    logger.info(`✅ Synced ${targetBranch} with remote`);
                } else {
                    logger.info(`ℹ️ No remote ${targetBranch} branch found, will be created on first push`);
                }
            } catch (syncError: any) {
                if (syncError.message && syncError.message.includes('CONFLICT')) {
                    logger.error(`❌ Merge conflicts detected when syncing ${targetBranch} with remote`);
                    logger.error(`   Please resolve the conflicts manually:`);
                    logger.error(`   1. git checkout ${targetBranch}`);
                    logger.error(`   2. git pull origin ${targetBranch}`);
                    logger.error(`   3. Resolve conflicts in the files`);
                    logger.error(`   4. git add <resolved-files>`);
                    logger.error(`   5. git commit`);
                    logger.error(`   6. git checkout ${currentBranch}`);
                    logger.error(`   7. kodrdriv publish (to continue)`);
                    throw syncError;
                } else {
                    logger.warn(`⚠️ Could not sync ${targetBranch} with remote: ${syncError.message}`);
                    // Continue with publish process, but log the warning
                }
            }
        } else {
            logger.info(`Would sync ${targetBranch} with remote to avoid PR conflicts`);
        }
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

    // Restore stashed changes if we stashed them
    if (hasStashedChanges) {
        logger.info('📦 Restoring previously stashed changes...');
        try {
            await runSecure('git', ['stash', 'pop']);
            logger.info('✅ Successfully restored stashed changes');
        } catch (stashError: any) {
            logger.warn(`⚠️  Warning: Could not restore stashed changes: ${stashError.message}`);
            logger.warn('   Your changes are still available in the git stash. Run "git stash list" to see them.');
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
        const { version } = safeJsonParse(packageJsonContents, 'package.json');
        tagName = `v${version}`;

        // Check if tag already exists locally
        try {
            // Validate tag name to prevent injection
            if (!validateGitRef(tagName)) {
                throw new Error(`Invalid tag name: ${tagName}`);
            }
            const { stdout } = await runSecure('git', ['tag', '-l', tagName]);
            if (stdout.trim() === tagName) {
                logger.info(`Tag ${tagName} already exists locally, skipping tag creation`);
            } else {
                await runSecure('git', ['tag', tagName]);
                logger.info(`Created local tag: ${tagName}`);
            }
        } catch (error) {
            // If git tag -l fails, create the tag anyway
            await runSecure('git', ['tag', tagName]);
            logger.info(`Created local tag: ${tagName}`);
        }

        // Check if tag exists on remote before pushing
        let tagWasPushed = false;
        try {
            const { stdout } = await runSecure('git', ['ls-remote', 'origin', `refs/tags/${tagName}`]);
            if (stdout.trim()) {
                logger.info(`Tag ${tagName} already exists on remote, skipping push`);
            } else {
                await runSecure('git', ['push', 'origin', tagName]);
                logger.info(`Pushed tag to remote: ${tagName}`);
                tagWasPushed = true;
            }
        } catch (error) {
            // If ls-remote fails, try to push anyway (might be a new remote)
            try {
                await runSecure('git', ['push', 'origin', tagName]);
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
        const milestonesEnabled = !runConfig.publish?.noMilestones;
        if (milestonesEnabled) {
            logger.info('Would close milestone for released version');
        } else {
            logger.info('Would skip milestone closure (--no-milestones)');
        }
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

                // Close milestone for this version if enabled
                const milestonesEnabled = !runConfig.publish?.noMilestones;
                if (milestonesEnabled) {
                    logger.info('🏁 Closing milestone for released version...');
                    const version = tagName.replace(/^v/, ''); // Remove 'v' prefix if present
                    await GitHub.closeMilestoneForVersion(version);
                } else {
                    logger.debug('Milestone integration disabled via --no-milestones');
                }

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
            const workflowTimeout = runConfig.publish?.releaseWorkflowsTimeout || KODRDRIV_DEFAULTS.publish.releaseWorkflowsTimeout;
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
