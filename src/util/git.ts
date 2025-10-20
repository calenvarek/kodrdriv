import { getLogger } from '../logging';
import { run, runSecure, validateGitRef } from './child';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import * as semver from 'semver';
import { safeJsonParse, validatePackageJson } from './validation';

/**
 * Tests if a git reference exists and is valid (silent version that doesn't log errors)
 */
const isValidGitRefSilent = async (ref: string): Promise<boolean> => {
    try {
        // Validate the ref first to prevent injection
        if (!validateGitRef(ref)) {
            return false;
        }
        await runSecure('git', ['rev-parse', '--verify', ref], { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
};

/**
 * Tests if a git reference exists and is valid
 */
export const isValidGitRef = async (ref: string): Promise<boolean> => {
    const logger = getLogger();
    try {
        // Validate the ref first to prevent injection
        if (!validateGitRef(ref)) {
            logger.debug(`Git reference '${ref}' contains invalid characters`);
            return false;
        }
        await runSecure('git', ['rev-parse', '--verify', ref], { stdio: 'ignore' });
        logger.debug(`Git reference '${ref}' is valid`);
        return true;
    } catch (error) {
        logger.debug(`Git reference '${ref}' is not valid: ${error}`);
        return false;
    }
};

/**
 * Finds the previous release tag based on the current version using semantic versioning.
 * Returns the highest version tag that is less than the current version.
 *
 * @param currentVersion The current version (e.g., "1.2.3", "2.0.0")
 * @param tagPattern The pattern to match tags (e.g., "v*", "working/v*")
 * @returns The previous release tag or null if none found
 */
export const findPreviousReleaseTag = async (
    currentVersion: string,
    tagPattern: string = 'v*'
): Promise<string | null> => {
    const logger = getLogger();

    try {
        // Parse current version first to validate it
        const currentSemver = semver.parse(currentVersion);
        if (!currentSemver) {
            logger.debug(`Invalid version format: ${currentVersion}`);
            return null;
        }

        logger.debug(`Looking for previous release tag matching ${tagPattern} for version ${currentVersion}`);

        // Get all tags - try sorted first, fallback to unsorted
        let tags: string[];
        try {
            const { stdout } = await runSecure('git', ['tag', '-l', tagPattern, '--sort=-version:refname']);
            tags = stdout.trim().split('\n').filter(tag => tag.length > 0);
            logger.debug(`Found ${tags.length} tags matching ${tagPattern}`);
        } catch {
            // Fallback for older git versions that don't support --sort
            logger.debug('Git tag --sort failed, falling back to manual sorting');
            const { stdout } = await runSecure('git', ['tag', '-l', tagPattern]);
            tags = stdout.trim().split('\n').filter(tag => tag.length > 0);

            // Manual semantic version sorting
            tags.sort((a, b) => {
                const aMatch = a.match(/v?(\d+\.\d+\.\d+.*?)$/);
                const bMatch = b.match(/v?(\d+\.\d+\.\d+.*?)$/);
                if (!aMatch || !bMatch) return 0;

                const aSemver = semver.parse(aMatch[1]);
                const bSemver = semver.parse(bMatch[1]);
                if (!aSemver || !bSemver) return 0;

                return semver.rcompare(aSemver, bSemver);
            });
        }

        if (tags.length === 0) {
            logger.debug('No tags found in repository');
            return null;
        }

        logger.debug(`Found ${tags.length} tags in repository`);

        // Find the highest version that is less than the current version
        let previousTag: string | null = null;
        let previousVersion: semver.SemVer | null = null;
        let validTags = 0;
        let skippedTags = 0;

        for (const tag of tags) {
            // Extract version from tag - handle "v1.2.13", "1.2.13", and "working/v1.2.13"
            const versionMatch = tag.match(/v?(\d+\.\d+\.\d+.*?)$/);
            if (!versionMatch) {
                logger.debug(`Tag ${tag} doesn't match version pattern, skipping`);
                continue;
            }

            const versionString = versionMatch[1];
            const tagSemver = semver.parse(versionString);

            if (tagSemver) {
                validTags++;
                logger.debug(`Comparing tag ${tag} (${versionString}) with current ${currentVersion}`);

                // Check if this tag version is less than current version
                if (semver.lt(tagSemver, currentSemver)) {
                    // If we don't have a previous version yet, or this one is higher than our current previous
                    if (!previousVersion || semver.gt(tagSemver, previousVersion)) {
                        previousVersion = tagSemver;
                        previousTag = tag; // Keep the original tag format
                        logger.debug(`Found candidate previous tag: ${tag} (${versionString})`);
                    }
                } else {
                    skippedTags++;
                }
            }
        }

        logger.debug(`Processed ${validTags} valid semantic version tags, skipped ${skippedTags} tags >= current version`);

        if (previousTag) {
            logger.debug(`Found previous tag: ${previousTag} (${previousVersion?.version} < ${currentVersion})`);
            return previousTag;
        }

        logger.debug(`No previous tag found for ${currentVersion} matching ${tagPattern}`);
        return null;
    } catch (error: any) {
        logger.debug(`Error finding previous release tag: ${error.message}`);
        return null;
    }
};

/**
 * Gets the current version from package.json
 *
 * @returns The current version string or null if not found
 */
export const getCurrentVersion = async (): Promise<string | null> => {
    const logger = getLogger();

    try {
        // First try to get from committed version in HEAD
        const { stdout } = await runSecure('git', ['show', 'HEAD:package.json']);
        const packageJson = safeJsonParse(stdout, 'package.json');
        const validated = validatePackageJson(packageJson, 'package.json');

        if (validated.version) {
            logger.debug(`Current version from HEAD:package.json: ${validated.version}`);
            return validated.version;
        }

        return null;
    } catch (error: any) {
        logger.debug(`Could not read version from HEAD:package.json: ${error.message}`);

        // Fallback to reading from working directory
        try {
            const packageJsonPath = path.join(process.cwd(), 'package.json');
            const content = await fs.readFile(packageJsonPath, 'utf-8');
            const packageJson = safeJsonParse(content, 'package.json');
            const validated = validatePackageJson(packageJson, 'package.json');

            if (validated.version) {
                logger.debug(`Current version from working directory package.json: ${validated.version}`);
                return validated.version;
            }

            return null;
        } catch (fallbackError: any) {
            logger.debug(`Error reading current version from filesystem: ${fallbackError.message}`);
            return null;
        }
    }
};

/**
 * Gets a reliable default for the --from parameter by trying multiple fallbacks
 *
 * Tries in order:
 * 1. Previous working branch tag (if on working branch)
 * 2. Previous release tag (if current version can be determined)
 * 3. main (local main branch - typical release comparison base)
 * 4. master (local master branch - legacy default)
 * 5. origin/main (remote main branch fallback)
 * 6. origin/master (remote master branch fallback)
 *
 * @param forceMainBranch If true, skip tag detection and use main branch
 * @param currentBranch Current branch name for branch-aware tag detection
 * @returns A valid git reference to use as the default from parameter
 * @throws Error if no valid reference can be found
 */
export const getDefaultFromRef = async (
    forceMainBranch: boolean = false,
    currentBranch?: string
): Promise<string> => {
    const logger = getLogger();

    // If forced to use main branch, skip tag detection
    if (forceMainBranch) {
        logger.debug('Forced to use main branch, skipping tag detection');
    } else {
        // If on working branch, look for working branch tags first
        if (currentBranch && currentBranch === 'working') {
            try {
                const currentVersion = await getCurrentVersion();
                if (currentVersion) {
                    logger.debug(`Looking for previous working branch tag (current version: ${currentVersion})`);
                    const previousTag = await findPreviousReleaseTag(
                        currentVersion,
                        'working/v*'
                    );
                    if (previousTag && await isValidGitRef(previousTag)) {
                        logger.info(`Using previous working branch tag '${previousTag}' as default --from reference`);
                        logger.info(`   This shows commits added since the last release`);
                        return previousTag;
                    } else {
                        logger.debug('No valid previous working tag found, will try regular tags');
                    }
                }
            } catch (error: any) {
                logger.debug(`Could not determine previous working tag: ${error.message}`);
            }
        }

        // First, try to find the previous release tag
        try {
            const currentVersion = await getCurrentVersion();
            if (currentVersion) {
                const previousTag = await findPreviousReleaseTag(currentVersion);
                if (previousTag && await isValidGitRef(previousTag)) {
                    logger.info(`Using previous release tag '${previousTag}' as default --from reference`);
                    return previousTag;
                }
            }
        } catch (error: any) {
            logger.debug(`Could not determine previous release tag: ${error.message}`);
        }
    }

    // Fallback to branch-based references
    const candidates = [
        'main',
        'master',
        'origin/main',
        'origin/master'
    ];

    for (const candidate of candidates) {
        logger.debug(`Testing git reference candidate: ${candidate}`);
        if (await isValidGitRef(candidate)) {
            if (forceMainBranch) {
                logger.info(`Using '${candidate}' as forced main branch reference`);
            } else {
                logger.info(`Using '${candidate}' as fallback --from reference (no previous release tag found)`);
            }
            return candidate;
        }
    }

    // If we get here, something is seriously wrong with the git repository
    throw new Error(
        'Could not find a valid default git reference for --from parameter. ' +
        'Please specify --from explicitly or check your git repository configuration. ' +
        `Tried: ${forceMainBranch ? 'main branch only' : 'previous release tag'}, ${candidates.join(', ')}`
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
    const result = await isValidGitRefSilent(`refs/heads/${branchName}`);
    if (result) {
        logger.debug(`Local branch '${branchName}' exists`);
    } else {
        logger.debug(`Local branch '${branchName}' does not exist`);
    }
    return result;
};

/**
 * Checks if a remote branch exists
 */
export const remoteBranchExists = async (branchName: string, remote: string = 'origin'): Promise<boolean> => {
    const logger = getLogger();
    const result = await isValidGitRefSilent(`refs/remotes/${remote}/${branchName}`);
    if (result) {
        logger.debug(`Remote branch '${remote}/${branchName}' exists`);
    } else {
        logger.debug(`Remote branch '${remote}/${branchName}' does not exist`);
    }
    return result;
};

/**
 * Gets the commit SHA for a given branch (local or remote)
 */
export const getBranchCommitSha = async (branchRef: string): Promise<string> => {
    // Validate the ref first to prevent injection
    if (!validateGitRef(branchRef)) {
        throw new Error(`Invalid git reference: ${branchRef}`);
    }
    const { stdout } = await runSecure('git', ['rev-parse', branchRef]);
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
        // Validate inputs first to prevent injection
        if (!validateGitRef(branchName)) {
            throw new Error(`Invalid branch name: ${branchName}`);
        }
        if (!validateGitRef(remote)) {
            throw new Error(`Invalid remote name: ${remote}`);
        }

        // First, fetch latest remote refs without affecting working directory
        await runSecure('git', ['fetch', remote, '--quiet']);

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
        // Validate inputs first to prevent injection
        if (!validateGitRef(branchName)) {
            throw new Error(`Invalid branch name: ${branchName}`);
        }
        if (!validateGitRef(remote)) {
            throw new Error(`Invalid remote name: ${remote}`);
        }

        // Check current branch to restore later if needed
        const { stdout: currentBranch } = await runSecure('git', ['branch', '--show-current']);
        const originalBranch = currentBranch.trim();

        // Fetch latest remote refs
        await runSecure('git', ['fetch', remote, '--quiet']);

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
            await runSecure('git', ['branch', branchName, `${remote}/${branchName}`]);
            logger.debug(`Created local branch '${branchName}' tracking '${remote}/${branchName}'`);
            return { success: true };
        }

        // Check if we need to switch to the target branch
        const needToSwitch = originalBranch !== branchName;

        if (needToSwitch) {
            // Check for uncommitted changes before switching
            const { stdout: statusOutput } = await runSecure('git', ['status', '--porcelain']);
            if (statusOutput.trim()) {
                return {
                    success: false,
                    error: `Cannot switch to branch '${branchName}' because you have uncommitted changes. Please commit or stash your changes first.`
                };
            }

            // Switch to target branch
            await runSecure('git', ['checkout', branchName]);
        }

        try {
            // Try to pull with fast-forward only
            await runSecure('git', ['pull', remote, branchName, '--ff-only']);
            logger.debug(`Successfully synced '${branchName}' with '${remote}/${branchName}'`);

            // Switch back to original branch if we switched
            if (needToSwitch && originalBranch) {
                await runSecure('git', ['checkout', originalBranch]);
            }

            return { success: true };

        } catch (pullError: any) {
            // Switch back to original branch if we switched
            if (needToSwitch && originalBranch) {
                try {
                    await runSecure('git', ['checkout', originalBranch]);
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

/**
 * Gets the current branch name
 */
export const getCurrentBranch = async (): Promise<string> => {
    const { stdout } = await runSecure('git', ['branch', '--show-current']);
    return stdout.trim();
};

/**
 * Gets git status summary including unstaged files, uncommitted changes, and unpushed commits
 */
export const getGitStatusSummary = async (workingDir?: string): Promise<{
    branch: string;
    hasUnstagedFiles: boolean;
    hasUncommittedChanges: boolean;
    hasUnpushedCommits: boolean;
    unstagedCount: number;
    uncommittedCount: number;
    unpushedCount: number;
    status: string; // summary status string
}> => {
    const logger = getLogger();

    try {
        const originalCwd = process.cwd();
        if (workingDir) {
            process.chdir(workingDir);
        }

        try {
            // Get current branch
            const branch = await getCurrentBranch();

            // Get git status for unstaged and uncommitted changes
            const { stdout: statusOutput } = await runSecure('git', ['status', '--porcelain']);
            const statusLines = statusOutput.trim().split('\n').filter(line => line.trim());

            // Count different types of changes
            let unstagedCount = 0;
            let uncommittedCount = 0;

            for (const line of statusLines) {
                const statusCode = line.substring(0, 2);

                // For untracked files (??) count as unstaged only once
                if (statusCode === '??') {
                    unstagedCount++;
                    continue;
                }

                // Check for unstaged changes (working directory changes)
                // Second character represents working tree status
                if (statusCode[1] !== ' ' && statusCode[1] !== '') {
                    unstagedCount++;
                }

                // Check for uncommitted changes (staged changes)
                // First character represents index status
                if (statusCode[0] !== ' ' && statusCode[0] !== '') {
                    uncommittedCount++;
                }
            }

            // Check for unpushed commits by comparing with remote
            let unpushedCount = 0;
            let hasUnpushedCommits = false;

            try {
                // First fetch to get latest remote refs
                await runSecure('git', ['fetch', 'origin', '--quiet']);

                // Check if remote branch exists
                const remoteExists = await remoteBranchExists(branch);

                if (remoteExists) {
                    // Get count of commits ahead of remote (branch already validated in calling function)
                    const { stdout: aheadOutput } = await runSecure('git', ['rev-list', '--count', `origin/${branch}..HEAD`]);
                    unpushedCount = parseInt(aheadOutput.trim()) || 0;
                    hasUnpushedCommits = unpushedCount > 0;
                }
            } catch (error) {
                logger.debug(`Could not check for unpushed commits: ${error}`);
                // Remote might not exist or other issues - not critical for status
            }

            const hasUnstagedFiles = unstagedCount > 0;
            const hasUncommittedChanges = uncommittedCount > 0;

            // Build status summary
            const statusParts: string[] = [];

            if (hasUnstagedFiles) {
                statusParts.push(`${unstagedCount} unstaged`);
            }
            if (hasUncommittedChanges) {
                statusParts.push(`${uncommittedCount} uncommitted`);
            }
            if (hasUnpushedCommits) {
                statusParts.push(`${unpushedCount} unpushed`);
            }

            const status = statusParts.length > 0 ? statusParts.join(', ') : 'clean';

            return {
                branch,
                hasUnstagedFiles,
                hasUncommittedChanges,
                hasUnpushedCommits,
                unstagedCount,
                uncommittedCount,
                unpushedCount,
                status
            };

        } finally {
            if (workingDir) {
                process.chdir(originalCwd);
            }
        }

    } catch (error: any) {
        logger.debug(`Failed to get git status summary: ${error.message}`);
        return {
            branch: 'unknown',
            hasUnstagedFiles: false,
            hasUncommittedChanges: false,
            hasUnpushedCommits: false,
            unstagedCount: 0,
            uncommittedCount: 0,
            unpushedCount: 0,
            status: 'error'
        };
    }
};

/**
 * Gets the list of globally linked packages (packages available to be linked to)
 */
export const getGloballyLinkedPackages = async (): Promise<Set<string>> => {
    const execPromise = util.promisify(exec);

    try {
        const { stdout } = await execPromise('npm ls --link -g --json');
        const result = safeJsonParse(stdout, 'npm ls global output');

        if (result.dependencies && typeof result.dependencies === 'object') {
            return new Set(Object.keys(result.dependencies));
        }

        return new Set();
    } catch (error: any) {
        // Try to parse from error stdout if available
        if (error.stdout) {
            try {
                const result = safeJsonParse(error.stdout, 'npm ls global error output');
                if (result.dependencies && typeof result.dependencies === 'object') {
                    return new Set(Object.keys(result.dependencies));
                }
            } catch {
                // If JSON parsing fails, return empty set
            }
        }

        return new Set();
    }
};

/**
 * Gets the list of packages that this package is actively linking to (consuming linked packages)
 */
export const getLinkedDependencies = async (packageDir: string): Promise<Set<string>> => {
    const execPromise = util.promisify(exec);

    try {
        const { stdout } = await execPromise('npm ls --link --json', { cwd: packageDir });
        const result = safeJsonParse(stdout, 'npm ls local output');

        if (result.dependencies && typeof result.dependencies === 'object') {
            return new Set(Object.keys(result.dependencies));
        }

        return new Set();
    } catch (error: any) {
        // npm ls --link often exits with non-zero code but still provides valid JSON in stdout
        if (error.stdout) {
            try {
                const result = safeJsonParse(error.stdout, 'npm ls local error output');
                if (result.dependencies && typeof result.dependencies === 'object') {
                    return new Set(Object.keys(result.dependencies));
                }
            } catch {
                // If JSON parsing fails, return empty set
            }
        }

        return new Set();
    }
};

/**
 * Checks for actual semantic version compatibility issues between linked packages and their consumers
 * Returns a set of dependency names that have real compatibility problems
 *
 * This function ignores npm's strict prerelease handling and focuses on actual compatibility:
 * - "^4.4" is compatible with "4.4.53-dev.0" (prerelease of compatible minor version)
 * - "^4.4" is incompatible with "4.5.3" (different minor version)
 */
export const getLinkCompatibilityProblems = async (
    packageDir: string,
    allPackagesInfo?: Map<string, { name: string; version: string; path: string }>
): Promise<Set<string>> => {
    try {
        // Read the consumer package.json
        const packageJsonPath = path.join(packageDir, 'package.json');
        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const parsed = safeJsonParse(packageJsonContent, packageJsonPath);
        const packageJson = validatePackageJson(parsed, packageJsonPath);

        const problemDependencies = new Set<string>();

        // Get linked dependencies
        const linkedDeps = await getLinkedDependencies(packageDir);

        // Check each dependency type
        const dependencyTypes = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

        for (const depType of dependencyTypes) {
            const deps = packageJson[depType];
            if (!deps || typeof deps !== 'object') continue;

            for (const [depName, versionRange] of Object.entries(deps)) {
                // Only check dependencies that are currently linked
                if (!linkedDeps.has(depName)) continue;

                // Skip if version range is not a string or is invalid
                if (typeof versionRange !== 'string') continue;

                try {
                    let linkedVersion: string | undefined;

                    // If we have package info provided, use it
                    if (allPackagesInfo) {
                        const packageInfo = allPackagesInfo.get(depName);
                        if (packageInfo) {
                            linkedVersion = packageInfo.version;
                        }
                    }

                    // If we don't have version from package info, try to read it from the linked package
                    if (!linkedVersion) {
                        try {
                            // Get the linked package path and read its version
                            const nodeModulesPath = path.join(packageDir, 'node_modules', depName, 'package.json');
                            const linkedPackageJson = await fs.readFile(nodeModulesPath, 'utf-8');
                            const linkedParsed = safeJsonParse(linkedPackageJson, nodeModulesPath);
                            const linkedValidated = validatePackageJson(linkedParsed, nodeModulesPath);
                            linkedVersion = linkedValidated.version;
                        } catch {
                            // Could not read linked package version, skip this dependency
                            continue;
                        }
                    }

                    if (!linkedVersion) continue;

                    // Check compatibility with custom logic for prerelease versions
                    if (!isVersionCompatibleWithRange(linkedVersion, versionRange)) {
                        problemDependencies.add(depName);
                    }
                } catch {
                    // Skip dependencies we can't process
                    continue;
                }
            }
        }

        return problemDependencies;
    } catch {
        // If we can't read the package.json or process it, return empty set
        return new Set();
    }
};

/**
 * Custom semver compatibility check that handles prerelease versions more intelligently
 * than npm's strict checking, with stricter caret range handling
 *
 * Examples:
 * - isVersionCompatibleWithRange("4.4.53-dev.0", "^4.4") => true
 * - isVersionCompatibleWithRange("4.5.3", "^4.4") => false
 * - isVersionCompatibleWithRange("4.4.1", "^4.4") => true
 */
const isVersionCompatibleWithRange = (version: string, range: string): boolean => {
    try {
        const parsedVersion = semver.parse(version);
        if (!parsedVersion) return false;

        // Parse the range to understand what we're comparing against
        const rangeObj = semver.validRange(range);
        if (!rangeObj) return false;

        // For caret ranges like "^4.4", we want more strict checking than semver's default
        if (range.startsWith('^')) {
            const rangeVersion = range.substring(1); // Remove the ^

            // Try to parse as a complete version first
            let parsedRange = semver.parse(rangeVersion);

            // If that fails, try to coerce it (handles cases like "4.4" -> "4.4.0")
            if (!parsedRange) {
                const coercedRange = semver.coerce(rangeVersion);
                if (coercedRange) {
                    parsedRange = coercedRange;
                } else {
                    return false;
                }
            }

            // For prerelease versions, check if the base version (without prerelease)
            // matches the major.minor from the range
            if (parsedVersion.prerelease.length > 0) {
                return parsedVersion.major === parsedRange.major &&
                       parsedVersion.minor === parsedRange.minor;
            }

            // For regular versions with caret ranges, be strict about minor version
            // ^4.4 should only accept 4.4.x, not 4.5.x
            return parsedVersion.major === parsedRange.major &&
                   parsedVersion.minor === parsedRange.minor;
        }

        // For other range types (exact, tilde, etc.), use standard semver checking
        if (parsedVersion.prerelease.length > 0) {
            const baseVersion = `${parsedVersion.major}.${parsedVersion.minor}.${parsedVersion.patch}`;
            return semver.satisfies(baseVersion, range);
        }

        return semver.satisfies(version, range);
    } catch {
        // If semver parsing fails, assume incompatible
        return false;
    }
};

/**
 * Checks for npm link problems (version mismatches) in a package directory
 * Returns a set of dependency names that have link problems
 *
 * @deprecated Use getLinkCompatibilityProblems instead for better prerelease version handling
 */
export const getLinkProblems = async (packageDir: string): Promise<Set<string>> => {
    const execPromise = util.promisify(exec);

    try {
        const { stdout } = await execPromise('npm ls --link --json', { cwd: packageDir });
        const result = safeJsonParse(stdout, 'npm ls troubleshoot output');

        const problemDependencies = new Set<string>();

        // Check if there are any problems reported
        if (result.problems && Array.isArray(result.problems)) {
            // Parse problems array to extract dependency names
            for (const problem of result.problems) {
                if (typeof problem === 'string' && problem.includes('invalid:')) {
                    // Extract package name from problem string like "invalid: @fjell/eslint-config@1.1.20-dev.0 ..."
                    // Handle both scoped (@scope/name) and unscoped (name) packages
                    const match = problem.match(/invalid:\s+(@[^/]+\/[^@\s]+|[^@\s]+)@/);
                    if (match) {
                        problemDependencies.add(match[1]);
                    }
                }
            }
        }

        // Also check individual dependencies for problems
        if (result.dependencies && typeof result.dependencies === 'object') {
            for (const [depName, depInfo] of Object.entries(result.dependencies)) {
                if (depInfo && typeof depInfo === 'object') {
                    const dep = depInfo as any;
                    // Check if this dependency has problems or is marked as invalid
                    if ((dep.problems && Array.isArray(dep.problems) && dep.problems.length > 0) ||
                        dep.invalid) {
                        problemDependencies.add(depName);
                    }
                }
            }
        }

        return problemDependencies;
    } catch (error: any) {
        // npm ls --link often exits with non-zero code when there are problems
        // but still provides valid JSON in stdout
        if (error.stdout) {
            try {
                const result = safeJsonParse(error.stdout, 'npm ls troubleshoot error output');
                const problemDependencies = new Set<string>();

                // Check if there are any problems reported
                if (result.problems && Array.isArray(result.problems)) {
                    for (const problem of result.problems) {
                        if (typeof problem === 'string' && problem.includes('invalid:')) {
                            const match = problem.match(/invalid:\s+(@[^/]+\/[^@\s]+|[^@\s]+)@/);
                            if (match) {
                                problemDependencies.add(match[1]);
                            }
                        }
                    }
                }

                // Also check individual dependencies for problems
                if (result.dependencies && typeof result.dependencies === 'object') {
                    for (const [depName, depInfo] of Object.entries(result.dependencies)) {
                        if (depInfo && typeof depInfo === 'object') {
                            const dep = depInfo as any;
                            if ((dep.problems && Array.isArray(dep.problems) && dep.problems.length > 0) ||
                                dep.invalid) {
                                problemDependencies.add(depName);
                            }
                        }
                    }
                }

                return problemDependencies;
            } catch {
                // If JSON parsing fails, return empty set
                return new Set();
            }
        }

        return new Set();
    }
};

/**
 * Checks if a package directory is npm linked (has a global symlink)
 */
export const isNpmLinked = async (packageDir: string): Promise<boolean> => {
    const logger = getLogger();

    try {
        // Read package.json to get the package name
        const packageJsonPath = path.join(packageDir, 'package.json');

        try {
            await fs.access(packageJsonPath);
        } catch {
            // No package.json found
            return false;
        }

        const packageJsonContent = await fs.readFile(packageJsonPath, 'utf-8');
        const packageJson = safeJsonParse(packageJsonContent, packageJsonPath);
        const packageName = packageJson.name;

        if (!packageName) {
            return false;
        }

        // Check if the package is globally linked by running npm ls -g --depth=0
        try {
            const { stdout } = await runSecure('npm', ['ls', '-g', '--depth=0', '--json']);
            const globalPackages = safeJsonParse(stdout, 'npm ls global depth check output');

            // Check if our package is in the global dependencies
            if (globalPackages.dependencies && globalPackages.dependencies[packageName]) {
                // Verify the symlink actually points to our directory
                const globalPath = globalPackages.dependencies[packageName].resolved;
                if (globalPath && globalPath.startsWith('file:')) {
                    const linkedPath = globalPath.replace('file:', '');
                    const realPackageDir = await fs.realpath(packageDir);
                    const realLinkedPath = await fs.realpath(linkedPath);
                    return realPackageDir === realLinkedPath;
                }
            }
        } catch (error) {
            // If npm ls fails, try alternative approach
            logger.debug(`npm ls failed for ${packageName}, trying alternative check: ${error}`);

            // Alternative: check if there's a symlink in npm's global node_modules
            try {
                const { stdout: npmPrefix } = await run('npm prefix -g');
                const globalNodeModules = path.join(npmPrefix.trim(), 'node_modules', packageName);

                const stat = await fs.lstat(globalNodeModules);
                if (stat.isSymbolicLink()) {
                    const realGlobalPath = await fs.realpath(globalNodeModules);
                    const realPackageDir = await fs.realpath(packageDir);
                    return realGlobalPath === realPackageDir;
                }
            } catch {
                // If all else fails, assume not linked
                return false;
            }
        }

        return false;
    } catch (error) {
        logger.debug(`Error checking npm link status for ${packageDir}: ${error}`);
        return false;
    }
};
