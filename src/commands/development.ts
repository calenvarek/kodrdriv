#!/usr/bin/env node
/**
 * Development command - Manages transition to working branch for active development
 *
 * This command handles the workflow of moving to the working branch from any other branch:
 *
 * New behavior:
 * 1. Fetch latest remote information
 * 2. Switch to the "working" branch (create if needed) and sync with remote
 * 3. Merge latest changes from "development" branch if it exists
 * 4. Run npm install and commit any changes (e.g., package-lock.json)
 * 5. Run `npm version pre<incrementLevel> --preid=<tag>` to bump version
 *
 * This is designed for reverse flow - taking you back to working for active development.
 */

import { getDryRunLogger } from '../logging';
import { Config } from '../types';
import { run } from '../util/child';
import { localBranchExists, getCurrentBranch } from '../util/git';
import { findDevelopmentBranch } from '../util/general';
import { KODRDRIV_DEFAULTS } from '../constants';

/**
 * Execute the development command
 */
export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    logger.info('🔄 Navigating to working branch for active development...');

    try {
        // Get current branch
        const currentBranch = isDryRun ? 'mock-branch' : await getCurrentBranch();
        logger.info(`📍 Currently on branch: ${currentBranch}`);

        // Find the working/development branch from configuration
        let workingBranch = 'working'; // Default fallback

        if (runConfig.branches) {
            const configuredDevBranch = findDevelopmentBranch(runConfig.branches);
            if (configuredDevBranch) {
                workingBranch = configuredDevBranch;
                logger.info(`🎯 Found configured working branch: ${workingBranch}`);
            } else {
                logger.info(`🎯 No working branch configured, using default: ${workingBranch}`);
            }
        } else {
            logger.info(`🎯 No branch configuration found, using default working branch: ${workingBranch}`);
        }

        // Track what actions are taken to determine the appropriate return message
        let branchCreated = false;
        let branchUpdated = false;
        let alreadyOnBranch = false;
        let mergedDevelopmentIntoWorking = false;

        // Determine prerelease tag and increment level from configuration
        const allBranchConfig = runConfig.branches || KODRDRIV_DEFAULTS.branches;
        let prereleaseTag = 'dev'; // Default
        let incrementLevel = 'patch'; // Default

        // Check for development command specific targetVersion override
        if (runConfig.development?.targetVersion) {
            const targetVersion = runConfig.development.targetVersion;

            // Validate targetVersion
            if (!['patch', 'minor', 'major'].includes(targetVersion) && !/^\d+\.\d+\.\d+$/.test(targetVersion.replace(/^v/, ''))) {
                throw new Error(`Invalid target version: ${targetVersion}. Expected "patch", "minor", "major", or a valid version string like "2.1.0"`);
            }

            incrementLevel = targetVersion;
        } else if (allBranchConfig && (allBranchConfig as any)[workingBranch]) {
            const workingBranchConfig = (allBranchConfig as any)[workingBranch];
            if (workingBranchConfig.version) {
                if (workingBranchConfig.version.tag) {
                    prereleaseTag = workingBranchConfig.version.tag;
                }
                if (workingBranchConfig.version.incrementLevel) {
                    incrementLevel = workingBranchConfig.version.incrementLevel;
                }
            }
        }

        logger.info(`🏷️ Using prerelease tag: ${prereleaseTag}`);
        logger.info(`📈 Using increment level: ${incrementLevel}`);

        // Step 1: Fetch latest remote information
        if (!isDryRun) {
            logger.info('📡 Fetching latest remote information...');
            try {
                await run('git fetch origin');
                logger.info('✅ Fetched latest remote information');
            } catch (error: any) {
                logger.warn(`⚠️ Could not fetch from remote: ${error.message}`);
            }
        } else {
            logger.info('Would fetch latest remote information');
        }

        // Special case: If currently on development branch, merge development into working
        if (currentBranch === 'development') {
            if (!isDryRun) {
                logger.info('🔄 Currently on development branch, merging into working...');
                await run(`git checkout ${workingBranch}`);
                await run(`git merge development --no-ff -m "Merge development into working for continued development"`);
                await run('npm install');

                // Check if npm install created any changes and commit them
                const gitStatus = await run('git status --porcelain');
                if (gitStatus.stdout.trim()) {
                    await run('git add -A');
                    await run('git commit -m "chore: update package-lock.json after merge"');
                }

                // Stay on working branch for development (removed checkout development)
                mergedDevelopmentIntoWorking = true;
            } else {
                logger.info('Would merge development into working and stay on working branch');
                mergedDevelopmentIntoWorking = true;
            }
        }

        // Step 2: Switch to working branch (create if needed) - skip if we handled development branch case
        if (!isDryRun && !mergedDevelopmentIntoWorking) {
            const workingBranchExists = await localBranchExists(workingBranch);
            if (!workingBranchExists) {
                logger.info(`🌟 Working branch '${workingBranch}' doesn't exist, creating it...`);
                await run(`git checkout -b ${workingBranch}`);
                logger.info(`✅ Created and switched to ${workingBranch}`);
                branchCreated = true;
            } else if (currentBranch !== workingBranch) {
                logger.info(`🔄 Switching to ${workingBranch}...`);
                await run(`git checkout ${workingBranch}`);
                logger.info(`✅ Switched to ${workingBranch}`);
                branchUpdated = true;
            } else {
                logger.info(`✅ Already on working branch: ${workingBranch}`);
                alreadyOnBranch = true;
            }
        } else if (!mergedDevelopmentIntoWorking) {
            // For dry run, we need to mock the logic
            const workingBranchExists = await localBranchExists(workingBranch);
            if (!workingBranchExists) {
                branchCreated = true;
            } else if (currentBranch !== workingBranch) {
                branchUpdated = true;
            } else {
                alreadyOnBranch = true;
            }
            logger.info(`Would switch to ${workingBranch} branch (creating if needed)`);
            logger.info(`Would sync ${workingBranch} with remote to avoid conflicts`);
        }

        // Step 2.1: Sync with remote working branch to avoid conflicts
        if (!isDryRun) {
            try {
                logger.info(`🔄 Syncing ${workingBranch} with remote to avoid conflicts...`);
                const remoteExists = await run(`git ls-remote --exit-code --heads origin ${workingBranch}`).then(() => true).catch(() => false);

                if (remoteExists) {
                    await run(`git pull origin ${workingBranch} --no-edit`);
                    logger.info(`✅ Synced ${workingBranch} with remote`);
                } else {
                    logger.info(`ℹ️ No remote ${workingBranch} branch found, will be created on first push`);
                }
            } catch (error: any) {
                if (error.message && error.message.includes('CONFLICT')) {
                    logger.error(`❌ Merge conflicts detected when syncing ${workingBranch} with remote`);
                    logger.error(`   Please resolve the conflicts manually and then run:`);
                    logger.error(`   1. Resolve conflicts in the files`);
                    logger.error(`   2. git add <resolved-files>`);
                    logger.error(`   3. git commit`);
                    logger.error(`   4. kodrdriv development (to continue)`);
                    throw new Error(`Merge conflicts detected when syncing ${workingBranch} with remote. Please resolve conflicts manually.`);
                } else {
                    logger.warn(`⚠️ Could not sync with remote ${workingBranch}: ${error.message}`);
                }
            }
        }

        // Step 3: Merge latest changes from development branch if it exists
        if (!isDryRun) {
            const developmentBranchExists = await localBranchExists('development');
            if (developmentBranchExists) {
                logger.info('🔄 Merging latest changes from development branch...');

                try {
                    await run(`git merge development --no-ff -m "Merge latest development changes into ${workingBranch}"`);
                    logger.info('✅ Successfully merged development changes');

                    // Run npm install after merge to update dependencies
                    logger.info('📦 Running npm install after merge...');
                    await run('npm install');

                    // Check if npm install created any changes (e.g., package-lock.json)
                    const gitStatus = await run('git status --porcelain');
                    if (gitStatus.stdout.trim()) {
                        logger.info('📝 Committing changes from npm install...');
                        await run('git add -A');
                        await run(`git commit -m "chore: update package-lock.json after merge"`);
                        logger.info('✅ Changes committed');
                    }

                } catch (error: any) {
                    if (error.message && error.message.includes('CONFLICT')) {
                        logger.error(`❌ Merge conflicts detected when merging development into ${workingBranch}`);
                        logger.error(`   Please resolve the conflicts manually and then run:`);
                        logger.error(`   1. Resolve conflicts in the files`);
                        logger.error(`   2. git add <resolved-files>`);
                        logger.error(`   3. git commit`);
                        logger.error(`   4. npm install`);
                        logger.error(`   5. npm version pre${incrementLevel} --preid=${prereleaseTag}`);
                        throw new Error(`Merge conflicts detected when merging development into ${workingBranch}. Please resolve conflicts manually.`);
                    } else {
                        logger.error(`❌ Failed to merge development into ${workingBranch}: ${error.message}`);
                        throw error;
                    }
                }
            } else if (!developmentBranchExists) {
                logger.info('ℹ️ Development branch does not exist, skipping merge step');
            } else {
                logger.info('ℹ️ Already merged from development (was on development branch)');
            }
        } else {
            logger.info('Would merge latest changes from development branch if it exists');
            logger.info('Would run npm install after merge');
            logger.info('Would commit any changes from npm install (e.g., package-lock.json)');
        }

        // Step 5: Check if we already have a proper development version
        if (alreadyOnBranch && !mergedDevelopmentIntoWorking) {
            // Check if current version is already a development version with the right tag
            const fs = await import('fs/promises');
            try {
                const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
                const currentVersion = packageJson.version;

                // If current version already has the dev tag, we're done
                if (currentVersion.includes(`-${prereleaseTag}.`)) {
                    logger.info(`✅ Already on working branch with development version ${currentVersion}`);
                    return 'Already on working branch with development version';
                }
            } catch (error) {
                logger.debug('Could not check current version, proceeding with version bump');
            }
        }

        // Step 5: Run npm version to bump version with increment level
        let versionCommand: string;
        if (['patch', 'minor', 'major'].includes(incrementLevel)) {
            versionCommand = `pre${incrementLevel}`;
            logger.info(`🚀 Bumping ${incrementLevel} version with prerelease tag '${prereleaseTag}'...`);
        } else {
            // Explicit version like "3.5.0"
            const cleanVersion = incrementLevel.replace(/^v/, '');
            versionCommand = `${cleanVersion}-${prereleaseTag}.0`;
            logger.info(`🚀 Setting explicit version ${versionCommand}...`);
        }

        if (!isDryRun) {
            try {
                const versionResult = ['patch', 'minor', 'major'].includes(incrementLevel)
                    ? await run(`npm version ${versionCommand} --preid=${prereleaseTag}`)
                    : await run(`npm version ${versionCommand}`);
                const newVersion = versionResult.stdout.trim();
                logger.info(`✅ Version bumped to: ${newVersion}`);

                // Return appropriate message based on what actions were taken
                if (mergedDevelopmentIntoWorking) {
                    return 'Merged development into working and ready for development';
                } else if (branchCreated) {
                    return 'Created working branch with development version';
                } else if (branchUpdated) {
                    return 'Updated working branch with development version';
                } else if (alreadyOnBranch) {
                    return 'Already on working branch with development version';
                } else {
                    return `Ready for development on ${workingBranch} with version ${newVersion}`;
                }
            } catch (error: any) {
                logger.error(`❌ Failed to bump version: ${error.message}`);
                throw new Error(`Failed to bump ${incrementLevel} version: ${error.message}`);
            }
        } else {
            if (['patch', 'minor', 'major'].includes(incrementLevel)) {
                logger.info(`Would run: npm version ${versionCommand} --preid=${prereleaseTag}`);
            } else {
                logger.info(`Would run: npm version ${versionCommand}`);
            }

            // Return appropriate message based on what actions were taken
            if (mergedDevelopmentIntoWorking) {
                return 'Merged development into working and ready for development';
            } else if (branchCreated) {
                return 'Created working branch with development version';
            } else if (branchUpdated) {
                return 'Updated working branch with development version';
            } else if (alreadyOnBranch) {
                return 'Already on working branch with development version';
            } else {
                return `Ready for development on ${workingBranch} (dry run)`;
            }
        }

    } catch (error: any) {
        logger.error('Failed to prepare working branch for development:', error.message);
        throw error;
    }
};
