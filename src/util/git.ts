import { getLogger } from '../logging';
import { run } from './child';

/**
 * Tests if a git reference exists and is valid
 */
export const isValidGitRef = async (ref: string): Promise<boolean> => {
    const logger = getLogger();
    try {
        await run(`git rev-parse --verify ${ref} >/dev/null 2>&1`);
        logger.debug(`Git reference '${ref}' is valid`);
        return true;
    } catch (error) {
        logger.debug(`Git reference '${ref}' is not valid: ${error}`);
        return false;
    }
};

/**
  * Gets a reliable default for the --from parameter by trying multiple fallbacks
 *
 * Tries in order:
 * 1. main (local main branch - typical release comparison base)
 * 2. master (local master branch - legacy default)
 * 3. origin/main (remote main branch fallback)
 * 4. origin/master (remote master branch fallback)
 * 5. origin/HEAD (remote HEAD fallback)
 *
 * @returns A valid git reference to use as the default from parameter
 * @throws Error if no valid reference can be found
 */
export const getDefaultFromRef = async (): Promise<string> => {
    const logger = getLogger();
    const candidates = [
        'main',
        'master',
        'origin/main',
        'origin/master',
        'origin/HEAD'
    ];

    for (const candidate of candidates) {
        logger.debug(`Testing git reference candidate: ${candidate}`);
        if (await isValidGitRef(candidate)) {
            logger.info(`Using '${candidate}' as default --from reference`);
            return candidate;
        }
    }

    // If we get here, something is seriously wrong with the git repository
    throw new Error(
        'Could not find a valid default git reference for --from parameter. ' +
        'Please specify --from explicitly or check your git repository configuration. ' +
        `Tried: ${candidates.join(', ')}`
    );
};

/**
 * Gets the default branch name from the remote repository
 */
export const getRemoteDefaultBranch = async (): Promise<string | null> => {
    const logger = getLogger();
    try {
        // Try to get the symbolic reference for origin/HEAD
        const { stdout } = await run('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""');
        if (stdout.trim()) {
            // Extract branch name from refs/remotes/origin/branch-name
            const match = stdout.trim().match(/refs\/remotes\/origin\/(.+)$/);
            if (match) {
                const branchName = match[1];
                logger.debug(`Remote default branch is: ${branchName}`);
                return branchName;
            }
        }

        // Fallback: try to get it from ls-remote
        const { stdout: lsRemoteOutput } = await run('git ls-remote --symref origin HEAD');
        const symrefMatch = lsRemoteOutput.match(/ref: refs\/heads\/(.+)\s+HEAD/);
        if (symrefMatch) {
            const branchName = symrefMatch[1];
            logger.debug(`Remote default branch from ls-remote: ${branchName}`);
            return branchName;
        }

        logger.debug('Could not determine remote default branch');
        return null;
    } catch (error) {
        logger.debug(`Failed to get remote default branch: ${error}`);
        return null;
    }
};

/**
 * Checks if a local branch exists
 */
export const localBranchExists = async (branchName: string): Promise<boolean> => {
    const logger = getLogger();
    try {
        await run(`git rev-parse --verify refs/heads/${branchName} >/dev/null 2>&1`);
        logger.debug(`Local branch '${branchName}' exists`);
        return true;
    } catch {
        logger.debug(`Local branch '${branchName}' does not exist`);
        return false;
    }
};

/**
 * Checks if a remote branch exists
 */
export const remoteBranchExists = async (branchName: string, remote: string = 'origin'): Promise<boolean> => {
    const logger = getLogger();
    try {
        await run(`git rev-parse --verify refs/remotes/${remote}/${branchName} >/dev/null 2>&1`);
        logger.debug(`Remote branch '${remote}/${branchName}' exists`);
        return true;
    } catch {
        logger.debug(`Remote branch '${remote}/${branchName}' does not exist`);
        return false;
    }
};

/**
 * Gets the commit SHA for a given branch (local or remote)
 */
export const getBranchCommitSha = async (branchRef: string): Promise<string> => {
    const { stdout } = await run(`git rev-parse ${branchRef}`);
    return stdout.trim();
};

/**
 * Checks if a local branch is in sync with its remote counterpart
 */
export const isBranchInSyncWithRemote = async (branchName: string, remote: string = 'origin'): Promise<{
    inSync: boolean;
    localSha?: string;
    remoteSha?: string;
    localExists: boolean;
    remoteExists: boolean;
    error?: string;
}> => {
    const logger = getLogger();

    try {
        // First, fetch latest remote refs without affecting working directory
        await run(`git fetch ${remote} --quiet`);

        const localExists = await localBranchExists(branchName);
        const remoteExists = await remoteBranchExists(branchName, remote);

        if (!localExists) {
            return {
                inSync: false,
                localExists: false,
                remoteExists,
                error: `Local branch '${branchName}' does not exist`
            };
        }

        if (!remoteExists) {
            return {
                inSync: false,
                localExists: true,
                remoteExists: false,
                error: `Remote branch '${remote}/${branchName}' does not exist`
            };
        }

        // Both branches exist, compare their SHAs
        const localSha = await getBranchCommitSha(`refs/heads/${branchName}`);
        const remoteSha = await getBranchCommitSha(`refs/remotes/${remote}/${branchName}`);

        const inSync = localSha === remoteSha;

        logger.debug(`Branch sync check for '${branchName}': local=${localSha.substring(0, 8)}, remote=${remoteSha.substring(0, 8)}, inSync=${inSync}`);

        return {
            inSync,
            localSha,
            remoteSha,
            localExists: true,
            remoteExists: true
        };

    } catch (error: any) {
        logger.debug(`Failed to check branch sync for '${branchName}': ${error.message}`);
        return {
            inSync: false,
            localExists: false,
            remoteExists: false,
            error: `Failed to check branch sync: ${error.message}`
        };
    }
};

/**
 * Attempts to safely sync a local branch with its remote counterpart
 * Returns true if successful, false if conflicts exist that require manual resolution
 */
export const safeSyncBranchWithRemote = async (branchName: string, remote: string = 'origin'): Promise<{
    success: boolean;
    error?: string;
    conflictResolutionRequired?: boolean;
}> => {
    const logger = getLogger();

    try {
        // Check current branch to restore later if needed
        const { stdout: currentBranch } = await run('git branch --show-current');
        const originalBranch = currentBranch.trim();

        // Fetch latest remote refs
        await run(`git fetch ${remote} --quiet`);

        // Check if local branch exists
        const localExists = await localBranchExists(branchName);
        const remoteExists = await remoteBranchExists(branchName, remote);

        if (!remoteExists) {
            return {
                success: false,
                error: `Remote branch '${remote}/${branchName}' does not exist`
            };
        }

        if (!localExists) {
            // Create local branch tracking the remote
            await run(`git branch ${branchName} ${remote}/${branchName}`);
            logger.debug(`Created local branch '${branchName}' tracking '${remote}/${branchName}'`);
            return { success: true };
        }

        // Check if we need to switch to the target branch
        const needToSwitch = originalBranch !== branchName;

        if (needToSwitch) {
            // Check for uncommitted changes before switching
            const { stdout: statusOutput } = await run('git status --porcelain');
            if (statusOutput.trim()) {
                return {
                    success: false,
                    error: `Cannot switch to branch '${branchName}' because you have uncommitted changes. Please commit or stash your changes first.`
                };
            }

            // Switch to target branch
            await run(`git checkout ${branchName}`);
        }

        try {
            // Try to pull with fast-forward only
            await run(`git pull ${remote} ${branchName} --ff-only`);
            logger.debug(`Successfully synced '${branchName}' with '${remote}/${branchName}'`);

            // Switch back to original branch if we switched
            if (needToSwitch && originalBranch) {
                await run(`git checkout ${originalBranch}`);
            }

            return { success: true };

        } catch (pullError: any) {
            // Switch back to original branch if we switched
            if (needToSwitch && originalBranch) {
                try {
                    await run(`git checkout ${originalBranch}`);
                } catch (checkoutError) {
                    logger.warn(`Failed to switch back to original branch '${originalBranch}': ${checkoutError}`);
                }
            }

            // Check if this is a merge conflict or diverged branches
            if (pullError.message.includes('diverged') ||
                pullError.message.includes('non-fast-forward') ||
                pullError.message.includes('conflict') ||
                pullError.message.includes('CONFLICT')) {
                return {
                    success: false,
                    conflictResolutionRequired: true,
                    error: `Branch '${branchName}' has diverged from '${remote}/${branchName}' and requires manual conflict resolution`
                };
            }

            return {
                success: false,
                error: `Failed to sync branch '${branchName}': ${pullError.message}`
            };
        }

    } catch (error: any) {
        return {
            success: false,
            error: `Failed to sync branch '${branchName}': ${error.message}`
        };
    }
};
