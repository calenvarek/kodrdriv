#!/usr/bin/env node
/**
 * Development command - Manages transition from main to working branch with development version bumping
 *
 * This command handles the workflow of moving from main branch to working branch while:
 * 1. Checking current branch and package.json version state
 * 2. Merging main to working if needed
 * 3. Bumping version to next development prerelease version
 * 4. Running npm install to update lock files
 * 5. Running kodrdriv commit to commit the changes
 *
 * Behavior based on current state:
 * - If on main: merges main to working, bumps version, switches to working
 * - If on working: checks if working is ahead of main, does nothing if already setup
 * - If working branch doesn't exist: creates it from main and sets up development version
 * - If working already has higher version than main: just switches to working and ensures up to date
 */

import { getDryRunLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { safeJsonParse, validatePackageJson } from '../util/validation';
import { run } from '../util/child';
import { localBranchExists, safeSyncBranchWithRemote } from '../util/git';
import { incrementMinorVersion, incrementPatchVersion, incrementMajorVersion, validateVersionString } from '../util/general';
import * as GitHub from '../util/github';
import * as Commit from './commit';

interface VersionComparison {
    currentVersion: string;
    mainVersion: string;
    workingVersion?: string;
    needsVersionBump: boolean;
    isOnMain: boolean;
    isOnWorking: boolean;
    workingBranchExists: boolean;
}

/**
 * Parse version string to get numeric components for comparison
 */
function parseVersion(version: string): { major: number; minor: number; patch: number; prerelease?: string } {
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;
    const parts = cleanVersion.split('.');
    if (parts.length < 3) {
        throw new Error(`Invalid version format: ${version}`);
    }

    const major = parseInt(parts[0], 10);
    const minor = parseInt(parts[1], 10);

    // Handle patch with potential prerelease
    const patchPart = parts[2];
    const patchComponents = patchPart.split('-');
    const patch = parseInt(patchComponents[0], 10);
    const prerelease = patchComponents.length > 1 ? patchComponents.slice(1).join('-') : undefined;

    if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
        throw new Error(`Invalid version numbers in: ${version}`);
    }

    return { major, minor, patch, prerelease };
}

/**
 * Compare two versions to determine if first is greater than second
 */
function isVersionGreater(version1: string, version2: string): boolean {
    const v1 = parseVersion(version1);
    const v2 = parseVersion(version2);

    if (v1.major !== v2.major) return v1.major > v2.major;
    if (v1.minor !== v2.minor) return v1.minor > v2.minor;
    if (v1.patch !== v2.patch) return v1.patch > v2.patch;

    // If versions are equal up to patch, check prerelease
    // No prerelease is considered greater than prerelease
    if (!v1.prerelease && v2.prerelease) return true;
    if (v1.prerelease && !v2.prerelease) return false;

    // Both have prerelease or both don't - consider equal for our purposes
    return false;
}

/**
 * Create a development version from a release version
 */
function createDevelopmentVersion(version: string, targetVersion: string = 'patch'): string {
    let baseVersion: string;

    const targetLower = targetVersion.toLowerCase();

    if (targetLower === 'patch') {
        baseVersion = incrementPatchVersion(version);
    } else if (targetLower === 'minor') {
        baseVersion = incrementMinorVersion(version);
    } else if (targetLower === 'major') {
        baseVersion = incrementMajorVersion(version);
    } else {
        // Assume it's an explicit version string
        if (validateVersionString(targetVersion)) {
            baseVersion = targetVersion.startsWith('v') ? targetVersion.slice(1) : targetVersion;
        } else {
            throw new Error(`Invalid target version: ${targetVersion}. Expected "patch", "minor", "major", or a valid version string like "2.1.0"`);
        }
    }

    return `${baseVersion}-dev.0`;
}

/**
 * Get current branch name
 */
async function getCurrentBranch(): Promise<string> {
    const { stdout } = await run('git branch --show-current');
    return stdout.trim();
}

/**
 * Get package.json version from a specific branch
 */
async function getVersionFromBranch(branchName: string): Promise<string> {
    try {
        const { stdout } = await run(`git show ${branchName}:package.json`);
        const packageJson = safeJsonParse(stdout, 'package.json');
        const validated = validatePackageJson(packageJson, 'package.json');
        return validated.version;
    } catch (error: any) {
        throw new Error(`Failed to get version from branch ${branchName}: ${error}`);
    }
}

/**
 * Analyze current state and determine what actions need to be taken
 */
async function analyzeVersionState(): Promise<VersionComparison> {
    const currentBranch = await getCurrentBranch();
    const workingBranchExists = await localBranchExists('working');

    // Get current version from working directory
    const storage = createStorage({ log: () => {} });
    const packageJsonContents = await storage.readFile('package.json', 'utf-8');
    const packageJson = safeJsonParse(packageJsonContents, 'package.json');
    const validated = validatePackageJson(packageJson, 'package.json');
    const currentVersion = validated.version;

    // Get version from main branch
    const mainVersion = await getVersionFromBranch('main');

    // Get version from working branch if it exists
    let workingVersion: string | undefined;
    if (workingBranchExists) {
        try {
            workingVersion = await getVersionFromBranch('working');
        } catch {
            // Working branch exists but doesn't have package.json or it's malformed
            workingVersion = undefined;
        }
    }

    const needsVersionBump = workingBranchExists && workingVersion ?
        !isVersionGreater(workingVersion, mainVersion) :
        !isVersionGreater(currentVersion, mainVersion);

    return {
        currentVersion,
        mainVersion,
        workingVersion,
        needsVersionBump,
        isOnMain: currentBranch === 'main',
        isOnWorking: currentBranch === 'working',
        workingBranchExists
    };
}

/**
 * Execute the development command
 */
export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const storage = createStorage({ log: logger.debug });

    logger.info('🔄 Setting up development environment...');

    try {
        // Analyze current state
        const state = await analyzeVersionState();
        logger.debug('Version state analysis:', state);

        // If we're already on working and everything is set up correctly, do nothing
        if (state.isOnWorking && !state.needsVersionBump) {
            logger.info('✅ Already on working branch with proper development version');
            logger.info(`Current version: ${state.currentVersion}`);
            return 'Already on working branch with development version';
        }

        // If we're on working but need version bump (shouldn't happen in normal workflow)
        if (state.isOnWorking && state.needsVersionBump) {
            logger.warn('⚠️  On working branch but version needs update. This suggests an unusual state.');
            logger.info('Proceeding with version bump...');
        }

        // Ensure we're on main if not on working, or switch to main to start process
        if (!state.isOnWorking) {
            if (!isDryRun) {
                logger.info('Switching to main branch...');
                await run('git checkout main');

                // Sync main with remote to ensure we're up to date
                logger.info('Syncing main branch with remote...');
                const syncResult = await safeSyncBranchWithRemote('main');
                if (!syncResult.success) {
                    if (syncResult.conflictResolutionRequired) {
                        throw new Error(`Main branch has diverged from remote and requires manual conflict resolution: ${syncResult.error}`);
                    }
                    logger.warn(`Warning: Could not sync main with remote: ${syncResult.error}`);
                }
            } else {
                logger.info('Would switch to main branch and sync with remote');
            }
        }

        // Create working branch if it doesn't exist
        if (!state.workingBranchExists) {
            if (!isDryRun) {
                logger.info('Creating working branch from main...');
                await run('git checkout -b working');
            } else {
                logger.info('Would create working branch from main');
            }
        } else {
            // Working branch exists, merge main to working
            if (!isDryRun) {
                logger.info('Switching to working branch...');
                await run('git checkout working');

                logger.info('Merging main into working branch...');
                try {
                    await run('git merge main --no-ff -m "Merge main into working for development"');
                } catch (error) {
                    throw new Error(`Failed to merge main into working. Please resolve conflicts manually: ${error}`);
                }
            } else {
                logger.info('Would switch to working branch and merge main into working');
            }
        }

        // Bump version to development version if needed
        if (state.needsVersionBump || !state.workingBranchExists) {
            const targetVersion = runConfig.development?.targetVersion || 'patch';
            const newDevVersion = createDevelopmentVersion(state.mainVersion, targetVersion);

            logger.info(`Bumping version from ${state.mainVersion} to ${newDevVersion}`);

            // Extract the base version for milestone management (e.g., "1.3.2" from "1.3.2-dev.0")
            const baseVersion = newDevVersion.split('-')[0];
            const milestonesEnabled = !runConfig.development?.noMilestones;

            if (!isDryRun) {
                // Update package.json
                const packageJsonContents = await storage.readFile('package.json', 'utf-8');
                const packageJson = safeJsonParse(packageJsonContents, 'package.json');
                const validated = validatePackageJson(packageJson, 'package.json');

                validated.version = newDevVersion;

                await storage.writeFile('package.json', JSON.stringify(validated, null, 2), 'utf-8');

                // Run npm install to update lock files
                logger.info('Running npm install to update lock files...');
                await run('npm install');

                // Handle GitHub milestones if enabled
                if (milestonesEnabled) {
                    logger.info('🏁 Managing GitHub milestones...');
                    try {
                        await GitHub.ensureMilestoneForVersion(baseVersion, state.mainVersion);
                    } catch (error: any) {
                        logger.warn(`⚠️ Milestone management failed (continuing): ${error.message}`);
                    }
                } else {
                    logger.debug('Milestone integration disabled via --no-milestones');
                }

                // Commit the changes using kodrdriv commit
                logger.info('Committing development version changes...');
                const commitSummary = await Commit.execute({
                    ...runConfig,
                    commit: {
                        ...runConfig.commit,
                        add: true, // Auto-add changes
                        sendit: true, // Auto-commit without prompts
                    }
                });

                logger.debug('Commit result:', commitSummary);
            } else {
                logger.info(`Would update package.json version to ${newDevVersion}`);
                logger.info('Would run npm install');
                if (milestonesEnabled) {
                    logger.info(`Would manage GitHub milestones for version ${baseVersion}`);
                    logger.info(`Would ensure milestone: release/${baseVersion}`);
                    logger.info(`Would move open issues from release/${state.mainVersion} if it exists and is closed`);
                } else {
                    logger.info('Would skip milestone management (--no-milestones)');
                }
                logger.info('Would commit changes with kodrdriv commit');
            }
        }

        const finalMessage = state.workingBranchExists ?
            'Updated working branch with development version' :
            'Created working branch with development version';

        logger.info(`✅ ${finalMessage}`);
        logger.info(`Development version: ${state.needsVersionBump || !state.workingBranchExists ?
            createDevelopmentVersion(state.mainVersion, runConfig.development?.targetVersion || 'patch') :
            state.currentVersion}`);

        return finalMessage;

    } catch (error: any) {
        logger.error('Failed to set up development environment:', error.message);
        throw error;
    }
};
