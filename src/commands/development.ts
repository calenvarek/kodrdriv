#!/usr/bin/env node
/**
 * Development command - Manages transition to working branch for active development
 *
 * This command handles the workflow of moving to the working branch from any other branch:
 *
 * Behavior based on current branch:
 * - If on "main" or "test": Simply checkout working branch
 * - If on "development": Sync working version with development if needed, then checkout working
 * - If on "working": Already there, do nothing
 * - If on other branches: Treat as main (simple checkout to working)
 *
 * This is designed for reverse flow - taking you back to working for active development.
 */

import { getDryRunLogger } from '../logging';
import { Config } from '../types';
import { run } from '../util/child';
import { localBranchExists, getCurrentBranch } from '../util/git';
import { findDevelopmentBranch } from '../util/general';

/**
 * Execute the development command
 */
export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    logger.info('🔄 Navigating to development branch...');

    try {
        // Get current branch
        const currentBranch = isDryRun ? 'mock-branch' : await getCurrentBranch();
        logger.info(`📍 Currently on branch: ${currentBranch}`);

        // Find the development branch from targets configuration
        let developmentBranch = 'working'; // Default fallback
        if (runConfig.targets) {
            const configuredDevBranch = findDevelopmentBranch(runConfig.targets);
            if (configuredDevBranch) {
                developmentBranch = configuredDevBranch;
                logger.info(`🎯 Found configured development branch: ${developmentBranch}`);
            } else {
                logger.info(`🎯 No development branch configured, using default: ${developmentBranch}`);
            }
        } else {
            logger.info(`🎯 No targets configuration found, using default development branch: ${developmentBranch}`);
        }

        // Case 1: Already on the development branch
        if (currentBranch === developmentBranch) {
            logger.info(`✅ Already on development branch: ${developmentBranch}`);
            return `Already on development branch: ${developmentBranch}`;
        }

        // Case 2: On main, test, or other non-development branches
        if (currentBranch === 'main' || currentBranch === 'test' || currentBranch !== 'development') {
            logger.info(`🔄 Switching from ${currentBranch} to ${developmentBranch}...`);

            if (!isDryRun) {
                // Check if development branch exists
                const devBranchExists = await localBranchExists(developmentBranch);
                if (!devBranchExists) {
                    logger.info(`🌟 Development branch '${developmentBranch}' doesn't exist, creating it...`);
                    await run(`git checkout -b ${developmentBranch}`);
                    logger.info(`✅ Created and switched to ${developmentBranch}`);
                } else {
                    await run(`git checkout ${developmentBranch}`);
                    logger.info(`✅ Switched to existing ${developmentBranch} branch`);
                }
            } else {
                logger.info(`Would switch to ${developmentBranch} branch (creating if needed)`);
            }

            return `Switched to development branch: ${developmentBranch}`;
        }

        // Case 3: On development branch - merge development into working
        if (currentBranch === 'development') {
            logger.info(`🔄 On development branch, merging into ${developmentBranch}...`);

            if (!isDryRun) {
                // Check if working branch exists
                const workingBranchExists = await localBranchExists(developmentBranch);
                if (!workingBranchExists) {
                    logger.info(`🌟 ${developmentBranch} branch doesn't exist, creating it from development...`);
                    await run(`git checkout -b ${developmentBranch}`);
                    logger.info(`✅ Created ${developmentBranch} branch from development`);
                    return `Created development branch: ${developmentBranch}`;
                }

                // Switch to working branch and merge development
                logger.info(`🔄 Switching to ${developmentBranch} and merging development...`);
                await run(`git checkout ${developmentBranch}`);

                try {
                    // Attempt to merge development into working
                    await run(`git merge development --no-ff -m "Merge development into ${developmentBranch} for continued development"`);
                    logger.info(`✅ Successfully merged development into ${developmentBranch}`);

                    // Run npm install after merge to update dependencies
                    logger.info('Running npm install after merge...');
                    await run('npm install');

                } catch (error: any) {
                    // Check if this is a merge conflict
                    if (error.message && error.message.includes('CONFLICT')) {
                        logger.error(`❌ Merge conflicts detected when merging development into ${developmentBranch}`);
                        logger.error(`   Please resolve the conflicts manually and then run:`);
                        logger.error(`   1. Resolve conflicts in the files`);
                        logger.error(`   2. git add <resolved-files>`);
                        logger.error(`   3. git commit`);
                        logger.error(`   4. npm install`);
                        throw new Error(`Merge conflicts detected when merging development into ${developmentBranch}. Please resolve conflicts manually.`);
                    } else {
                        logger.error(`❌ Failed to merge development into ${developmentBranch}: ${error.message}`);
                        throw error;
                    }
                }
            } else {
                logger.info(`Would switch to ${developmentBranch} and merge development`);
                logger.info(`Would run npm install after merge`);
            }

            return `Merged development into ${developmentBranch} and switched to development branch`;
        }

        // Fallback case (shouldn't happen with current logic)
        logger.info(`🔄 Switching to development branch: ${developmentBranch}`);
        if (!isDryRun) {
            await run(`git checkout ${developmentBranch}`);
        }
        return `Switched to development branch: ${developmentBranch}`;

    } catch (error: any) {
        logger.error('Failed to navigate to development branch:', error.message);
        throw error;
    }
};
