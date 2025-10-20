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
 * Create retroactive working branch tags for past releases
 * Scans git history for X.X.X-dev.0 commits and tags them
 */
async function createRetroactiveTags(
    workingBranch: string,
    isDryRun: boolean,
    logger: any,
    tagPrefix: string = 'working/'
): Promise<void> {
    logger.info('');
    logger.info('🔍 Scanning git history for past release points to tag...');
    logger.info('   (Looking for X.X.X-dev.0 version bump commits)');
    logger.info('');

    try {
        // Get all commits on working branch with oneline format
        const { stdout } = await run(`git log ${workingBranch} --oneline --all`);
        const commits = stdout.trim().split('\n');

        // Find commits that are version bumps to -dev.0 (these mark release points)
        const devCommits = commits.filter(line => {
            // Match patterns like: "4.4.52-dev.0" or "chore: bump version to 4.4.52-dev.0"
            return /\b\d+\.\d+\.\d+-dev\.0\b/.test(line);
        });

        logger.info(`📊 Found ${devCommits.length} potential dev version commits`);

        const tagsCreated: string[] = [];
        const tagsSkipped: string[] = [];

        for (const commitLine of devCommits) {
            const [sha, ...messageParts] = commitLine.split(' ');
            const message = messageParts.join(' ');

            // Extract version from message (e.g., "4.4.52-dev.0" → "4.4.52")
            const versionMatch = message.match(/(\d+\.\d+\.\d+)-dev\.0/);
            if (!versionMatch) continue;

            const releaseVersion = versionMatch[1]; // e.g., "4.4.52"
            const workingTagName = `${tagPrefix}v${releaseVersion}`;

            // Check if tag already exists
            const tagExistsResult = await run(`git tag -l "${workingTagName}"`);
            const tagExists = tagExistsResult.stdout.trim() !== '';

            if (tagExists) {
                tagsSkipped.push(workingTagName);
                logger.verbose(`   Skip: ${workingTagName} (already exists)`);
                continue;
            }

            if (!isDryRun) {
                // Tag the commit that represents the dev version bump
                // This is the commit AFTER the release, which marks the starting point
                logger.verbose(`   Create: ${workingTagName} at ${sha.substring(0, 7)}`);
                await run(`git tag ${workingTagName} ${sha}`);
                tagsCreated.push(workingTagName);
            } else {
                logger.info(`   Would create: ${workingTagName} at ${sha.substring(0, 7)}`);
                tagsCreated.push(workingTagName);
            }
        }

        logger.info('');

        if (tagsCreated.length > 0 && !isDryRun) {
            logger.info(`📤 Pushing ${tagsCreated.length} new retroactive tags to origin...`);
            await run('git push origin --tags');
            logger.info('');
            logger.info(`✅ Created and pushed ${tagsCreated.length} retroactive tags:`);
            tagsCreated.forEach(tag => logger.info(`   - ${tag}`));
        } else if (tagsCreated.length > 0 && isDryRun) {
            logger.info(`Would create and push ${tagsCreated.length} retroactive tags:`);
            tagsCreated.forEach(tag => logger.info(`   - ${tag}`));
        }

        if (tagsSkipped.length > 0) {
            logger.verbose('');
            logger.verbose(`Skipped ${tagsSkipped.length} existing tags:`);
            tagsSkipped.forEach(tag => logger.verbose(`   - ${tag}`));
        }

        if (tagsCreated.length === 0 && tagsSkipped.length === 0) {
            logger.info('ℹ️  No dev version commits found in history');
        }

        logger.info('');

    } catch (error: any) {
        logger.warn(`⚠️  Could not create retroactive tags: ${error.message}`);
        logger.warn('   You can tag past releases manually if needed');
        // Don't throw - retroactive tagging is optional
    }
}

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

        // Step 2.5: Sync with target branch (main) if it exists
        // This is a safety net for when publish fails or user ends up on target branch
        if (!isDryRun) {
            // Determine target branch from config
            const targetBranch = allBranchConfig && (allBranchConfig as any)[workingBranch]?.targetBranch || 'main';
            const targetBranchExists = await localBranchExists(targetBranch);
            
            if (targetBranchExists) {
                logger.info(`🔄 Syncing ${workingBranch} with target branch '${targetBranch}'...`);
                try {
                    await run(`git merge ${targetBranch} --ff-only`);
                    logger.info(`✅ Fast-forward merged ${targetBranch} into ${workingBranch}`);
                } catch (error: any) {
                    // Fast-forward failed, might need regular merge
                    if (error.message && error.message.includes('Not possible to fast-forward')) {
                        logger.warn(`⚠️  Cannot fast-forward ${targetBranch} into ${workingBranch}`);
                        logger.info(`   Attempting regular merge...`);
                        try {
                            await run(`git merge ${targetBranch} --no-ff -m "Merge ${targetBranch} into ${workingBranch} for sync"`);
                            logger.info(`✅ Merged ${targetBranch} into ${workingBranch}`);
                            
                            // Run npm install after merge
                            logger.info('📦 Running npm install after merge...');
                            await run('npm install');
                            
                            // Check if npm install created changes
                            const gitStatus = await run('git status --porcelain');
                            if (gitStatus.stdout.trim()) {
                                logger.info('📝 Committing changes from npm install...');
                                await run('git add -A');
                                await run('git commit -m "chore: update package-lock.json after merge"');
                            }
                        } catch (mergeError: any) {
                            if (mergeError.message && mergeError.message.includes('CONFLICT')) {
                                logger.error(`❌ Merge conflicts detected when merging ${targetBranch} into ${workingBranch}`);
                                logger.error(`   Please resolve the conflicts manually and then run:`);
                                logger.error(`   1. Resolve conflicts in the files`);
                                logger.error(`   2. git add <resolved-files>`);
                                logger.error(`   3. git commit`);
                                logger.error(`   4. npm install`);
                                logger.error(`   5. kodrdriv development (to continue)`);
                                throw new Error(`Merge conflicts detected when merging ${targetBranch} into ${workingBranch}. Please resolve conflicts manually.`);
                            } else {
                                throw mergeError;
                            }
                        }
                    } else {
                        logger.warn(`⚠️  Could not merge ${targetBranch} into ${workingBranch}: ${error.message}`);
                    }
                }
            } else {
                logger.info(`ℹ️ Target branch '${targetBranch}' does not exist, skipping target sync`);
            }
        } else {
            logger.info('Would sync working branch with target branch (main) if it exists');
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

        // Step 4.5: Create retroactive tags if requested (one-time operation)
        if (runConfig.development?.createRetroactiveTags) {
            const tagPrefix = runConfig.development?.workingTagPrefix || 'working/';
            await createRetroactiveTags(workingBranch, isDryRun, logger, tagPrefix);
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
            } catch {
                logger.debug('Could not check current version, proceeding with version bump');
            }
        }

        // Step 5.5: Tag working branch with current release version BEFORE bumping
        if (runConfig.development?.tagWorkingBranch !== false) {
            try {
                const fs = await import('fs/promises');
                const packageJson = JSON.parse(await fs.readFile('package.json', 'utf-8'));
                const currentVersion = packageJson.version;

                // Only tag if current version is a release version (not already a dev version)
                const isReleaseVersion = currentVersion &&
                                        !currentVersion.includes('-dev.') &&
                                        !currentVersion.includes('-alpha.') &&
                                        !currentVersion.includes('-beta.') &&
                                        !currentVersion.includes('-rc.');

                if (isReleaseVersion) {
                    const tagPrefix = runConfig.development?.workingTagPrefix || 'working/';
                    const workingTagName = `${tagPrefix}v${currentVersion}`;

                    if (!isDryRun) {
                        logger.info(`🏷️  Current version is ${currentVersion} (release version)`);
                        logger.verbose(`Checking if tag ${workingTagName} exists...`);

                        // Check if tag already exists
                        const tagExistsResult = await run(`git tag -l "${workingTagName}"`);
                        const tagExists = tagExistsResult.stdout.trim() !== '';

                        if (tagExists) {
                            logger.info(`ℹ️  Tag ${workingTagName} already exists, skipping tag creation`);
                        } else {
                            // Create tag on current commit (working branch at release version)
                            logger.verbose(`Creating tag ${workingTagName} at current HEAD...`);
                            await run(`git tag ${workingTagName}`);

                            // Push tag to remote
                            logger.verbose(`Pushing tag ${workingTagName} to origin...`);
                            await run(`git push origin ${workingTagName}`);

                            logger.info(`✅ Tagged working branch: ${workingTagName}`);
                            logger.info(`   📝 Release notes for v${currentVersion} can be generated from:`);
                            logger.info(`      kodrdriv release --from {previous-tag} --to ${workingTagName}`);
                        }
                    } else {
                        logger.info(`Would tag working branch with ${workingTagName} (current version: ${currentVersion})`);
                    }
                } else if (currentVersion) {
                    logger.verbose(`Current version is ${currentVersion} (prerelease), skipping tag creation`);
                } else {
                    logger.debug('Could not determine current version, skipping tag creation');
                }
            } catch (error: any) {
                if (!isDryRun) {
                    logger.warn(`⚠️  Could not tag working branch: ${error.message}`);
                    logger.warn('   This is not critical - you can tag manually later');
                } else {
                    logger.info('Would tag working branch with current release version if applicable');
                }
                // Don't throw - tagging is optional, continue with version bump
            }
        } else if (isDryRun) {
            logger.info('Tagging disabled (--no-tag-working-branch)');
        }

        // Step 6: Run npm version to bump version with increment level
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
