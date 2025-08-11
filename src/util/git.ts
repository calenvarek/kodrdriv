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
