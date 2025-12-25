import path from 'path';
import { createStorage, deepMerge, stringifyJSON, incrementPatchVersion, incrementMinorVersion, incrementMajorVersion, validateVersionString, calculateTargetVersion, incrementPrereleaseVersion, convertToReleaseVersion } from '@eldrforge/shared';
import { getLogger } from '../logging';
// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs';

/**
 * Get version from a specific branch's package.json
 */
export const getVersionFromBranch = async (branchName: string): Promise<string | null> => {
    const { runSecure, validateGitRef, safeJsonParse, validatePackageJson } = await import('@eldrforge/git-tools');

    try {
        // Validate branch name to prevent injection
        if (!validateGitRef(branchName)) {
            throw new Error(`Invalid branch name: ${branchName}`);
        }
        // Cast to any to avoid type mismatch with node_modules version
        const { stdout } = await (runSecure as any)('git', ['show', `${branchName}:package.json`], { suppressErrorLogging: true });
        const packageJson = safeJsonParse(stdout, 'package.json');
        const validated = validatePackageJson(packageJson, 'package.json');
        return validated.version;
    } catch {
        // Return null if we can't get the version (branch may not exist or no package.json)
        return null;
    }
};

/**
 * Calculate target version based on branch configuration
 * SEMANTICS: The version config specifies what version should be ON the target branch
 */
export const calculateBranchDependentVersion = async (
    currentVersion: string,
    currentBranch: string,
    branchesConfig: any,
    targetBranch?: string
): Promise<{ version: string; targetBranch: string }> => {
    const { getLogger } = await import('../logging');
    const logger = getLogger();

    // Look up the source branch to find the target branch
    if (!branchesConfig || !branchesConfig[currentBranch]) {
        // Use default configuration from constants
        const { KODRDRIV_DEFAULTS } = await import('../constants');
        const defaultConfig = KODRDRIV_DEFAULTS.branches as any;

        if (defaultConfig && defaultConfig[currentBranch]) {
            const sourceConfig = defaultConfig[currentBranch];
            const finalTargetBranch = sourceConfig.targetBranch || targetBranch || 'main';

            // Look at target branch's version config to determine what version it should have
            const targetConfig = defaultConfig[finalTargetBranch];

            logger.info(`VERSION_BRANCH_DEFAULT: Using default branch configuration | Source Branch: ${currentBranch} | Target Branch: ${finalTargetBranch} | Source: default config`);

            if (!targetConfig?.version) {
                const defaultVersion = incrementPatchVersion(currentVersion);
                logger.debug(`No version config for target branch '${finalTargetBranch}', using default increment`);
                return { version: defaultVersion, targetBranch: finalTargetBranch };
            }

            return calculateVersionFromTargetConfig(currentVersion, finalTargetBranch, targetConfig.version, logger);
        }

        // No config at all, use traditional defaults
        const defaultTargetBranch = targetBranch || 'main';
        const defaultVersion = incrementPatchVersion(currentVersion);
        logger.debug(`No branch-specific config found for '${currentBranch}', using defaults`);
        return { version: defaultVersion, targetBranch: defaultTargetBranch };
    }

    const sourceConfig = branchesConfig[currentBranch];
    const finalTargetBranch = sourceConfig.targetBranch || targetBranch || 'main';

    // Look at target branch's version config to determine what version it should have
    const targetConfig = branchesConfig[finalTargetBranch];

    logger.info(`VERSION_BRANCH_DEPENDENT: Using branch-dependent targeting | Source Branch: ${currentBranch} | Target Branch: ${finalTargetBranch} | Source: branch config`);

    if (!targetConfig?.version) {
        // No version config for target, use default increment
        const defaultVersion = incrementPatchVersion(currentVersion);
        logger.debug(`No version config for target branch '${finalTargetBranch}', using default increment`);
        return { version: defaultVersion, targetBranch: finalTargetBranch };
    }

    return calculateVersionFromTargetConfig(currentVersion, finalTargetBranch, targetConfig.version, logger);
};

/**
 * Calculate version based on target branch configuration
 */
const calculateVersionFromTargetConfig = async (
    currentVersion: string,
    targetBranch: string,
    versionConfig: any,
    logger: any
): Promise<{ version: string; targetBranch: string }> => {
    if (versionConfig.type === 'release') {
        // Convert to release version (remove prerelease tags)
        const releaseVersion = convertToReleaseVersion(currentVersion);
        logger.info(`VERSION_RELEASE_CONVERSION: Converting prerelease to release version | Current: ${currentVersion} | Release: ${releaseVersion} | Action: Remove prerelease tag`);
        return { version: releaseVersion, targetBranch };
    } else if (versionConfig.type === 'prerelease') {
        if (!versionConfig.tag) {
            throw new Error(`Prerelease version type requires a tag in branch configuration`);
        }

        const tag = versionConfig.tag;

        if (versionConfig.increment) {
            // Check if there's already a version with this tag in the target branch
            const targetBranchVersion = await getVersionFromBranch(targetBranch);

            if (targetBranchVersion) {
                // Use the target branch version as the base and increment
                const newVersion = incrementPrereleaseVersion(targetBranchVersion, tag);
                logger.info(`VERSION_PRERELEASE_INCREMENT: Incrementing prerelease version | Current: ${targetBranchVersion} | New: ${newVersion} | Action: Increment prerelease number`);
                return { version: newVersion, targetBranch };
            } else {
                // No version in target branch, use current version as base
                const newVersion = incrementPrereleaseVersion(currentVersion, tag);
                logger.info(`VERSION_PRERELEASE_CREATE: Creating new prerelease version | Current: ${currentVersion} | New: ${newVersion} | Action: Add prerelease tag`);
                return { version: newVersion, targetBranch };
            }
        } else {
            // Just add/change the prerelease tag without incrementing
            const baseVersion = convertToReleaseVersion(currentVersion);
            const newVersion = `${baseVersion}-${tag}.0`;
            logger.info(`VERSION_PRERELEASE_TAG: Setting prerelease tag | Current: ${currentVersion} | New: ${newVersion} | Tag: ${versionConfig.tag}`);
            return { version: newVersion, targetBranch };
        }
    }

    throw new Error(`Invalid version type: ${versionConfig.type}`);
};


/**
 * Find the development branch from branches configuration
 * Returns the branch marked with developmentBranch: true
 */
export const findDevelopmentBranch = (branchesConfig: any): string | null => {
    if (!branchesConfig || typeof branchesConfig !== 'object') {
        return null;
    }

    for (const [branchName, branchConfig] of Object.entries(branchesConfig)) {
        if (branchConfig && typeof branchConfig === 'object' && (branchConfig as any).developmentBranch === true) {
            return branchName;
        }
    }

    return null;
};

/**
 * Check if two prerelease versions have the same tag
 * Examples:
 * - haveSamePrereleaseTag("1.2.3-dev.0", "1.2.3-dev.5") => true
 * - haveSamePrereleaseTag("1.2.3-dev.0", "1.2.3-test.0") => false
 * - haveSamePrereleaseTag("1.2.3", "1.2.3-dev.0") => false
 */
export const haveSamePrereleaseTag = (version1: string, version2: string): boolean => {
    const extractTag = (version: string): string | null => {
        const cleanVersion = version.startsWith('v') ? version.slice(1) : version;
        const parts = cleanVersion.split('.');
        if (parts.length < 3) return null;

        const patchAndPrerelease = parts.slice(2).join('.');
        const patchComponents = patchAndPrerelease.split('-');

        if (patchComponents.length > 1) {
            const prereleaseString = patchComponents.slice(1).join('-');
            const prereleaseComponents = prereleaseString.split('.');
            return prereleaseComponents[0] || null;
        }

        return null;
    };

    const tag1 = extractTag(version1);
    const tag2 = extractTag(version2);

    return tag1 !== null && tag2 !== null && tag1 === tag2;
};

export const checkIfTagExists = async (tagName: string): Promise<boolean> => {
    const { runSecure, validateGitRef } = await import('@eldrforge/git-tools');
    try {
        // Validate tag name to prevent injection
        if (!validateGitRef(tagName)) {
            throw new Error(`Invalid tag name: ${tagName}`);
        }
        const { stdout } = await runSecure('git', ['tag', '-l', tagName]);
        return stdout.trim() === tagName;
    } catch {
        // If git command fails, assume tag doesn't exist
        return false;
    }
};

export const confirmVersionInteractively = async (currentVersion: string, proposedVersion: string, targetVersionInput?: string): Promise<string> => {
    const { getUserChoice, getUserTextInput, requireTTY } = await import('./interactive');
    const { getLogger } = await import('../logging');

    requireTTY('Interactive version confirmation requires a terminal.');

    const logger = getLogger();
    logger.info(`\nVERSION_CONFIRMATION: Version confirmation required | Current: ${currentVersion} | Proposed: ${proposedVersion}`);
    logger.info(`VERSION_CURRENT: Current package version | Version: ${currentVersion}`);
    logger.info(`VERSION_PROPOSED: Proposed new version | Version: ${proposedVersion}`);
    if (targetVersionInput) {
        logger.info(`VERSION_TARGET_INPUT: Target version provided | Input: ${targetVersionInput}`);
    }

    const choices = [
        { key: 'c', label: `Confirm ${proposedVersion}` },
        { key: 'e', label: 'Enter custom version' },
        { key: 'a', label: 'Abort publish' }
    ];

    const choice = await getUserChoice('\n🤔 Confirm the version for this release:', choices);

    switch (choice) {
        case 'c':
            return proposedVersion;
        case 'e': {
            const customVersion = await getUserTextInput('\n📝 Enter the version number (e.g., "4.30.0"):');
            if (!validateVersionString(customVersion)) {
                throw new Error(`Invalid version format: ${customVersion}. Expected format: "x.y.z"`);
            }
            const cleanCustomVersion = customVersion.startsWith('v') ? customVersion.slice(1) : customVersion;
            logger.info(`VERSION_CUSTOM_SELECTED: Using custom version from user input | Version: ${cleanCustomVersion} | Source: interactive input`);
            return cleanCustomVersion;
        }
        case 'a':
            throw new Error('Release aborted by user');
        default:
            throw new Error(`Unexpected choice: ${choice}`);
    }
};

export const getOutputPath = (outputDirectory: string, filename: string): string => {
    return path.join(outputDirectory, filename);
};

export const getTimestampedFilename = (baseName: string, extension: string = '.json'): string => {
    const now = new Date();

    // Format as YYMMdd-HHmm (e.g., 250701-1030)
    const yy = now.getFullYear().toString().slice(-2);
    const mm = (now.getMonth() + 1).toString().padStart(2, '0');
    const dd = now.getDate().toString().padStart(2, '0');
    const hh = now.getHours().toString().padStart(2, '0');
    const min = now.getMinutes().toString().padStart(2, '0');

    const timestamp = `${yy}${mm}${dd}-${hh}${min}`;

    return `${timestamp}-${baseName}${extension}`;
};

export const getTimestampedRequestFilename = (baseName: string): string => {
    return getTimestampedFilename(baseName, '.request.json');
};

export const getTimestampedResponseFilename = (baseName: string): string => {
    return getTimestampedFilename(baseName, '.response.json');
};

export const getTimestampedCommitFilename = (): string => {
    return getTimestampedFilename('commit-message', '.md');
};

export const getTimestampedReleaseNotesFilename = (): string => {
    return getTimestampedFilename('release-notes', '.md');
};

export const getTimestampedAudioFilename = (): string => {
    return getTimestampedFilename('audio-recording', '.wav');
};

export const getTimestampedTranscriptFilename = (): string => {
    return getTimestampedFilename('audio-transcript', '.md');
};

export const getTimestampedReviewFilename = (): string => {
    return getTimestampedFilename('review-analysis', '.md');
};

export const getTimestampedReviewNotesFilename = (): string => {
    return getTimestampedFilename('review-notes', '.md');
};

export const getTimestampedArchivedAudioFilename = (originalExtension: string = '.wav'): string => {
    return getTimestampedFilename('review-audio', originalExtension);
};

export const getTimestampedArchivedTranscriptFilename = (): string => {
    return getTimestampedFilename('review-transcript', '.md');
};

/**
 * Archives an audio file and its transcription to the output/kodrdriv directory
 * @param originalAudioPath - Path to the original audio file
 * @param transcriptionText - The raw transcription text
 * @param outputDirectory - Base output directory (default: 'output')
 * @returns Object containing the paths where files were archived
 */
export const archiveAudio = async (
    originalAudioPath: string,
    transcriptionText: string,
    outputDirectory: string = 'output'
): Promise<{ audioPath: string; transcriptPath: string }> => {
    const logger = getLogger();
    const storage = createStorage();

    try {
        // Ensure the output directory exists (should already be output/kodrdriv)
        await storage.ensureDirectory(outputDirectory);

        // Get file extension from original audio file
        const originalExtension = path.extname(originalAudioPath);

        // Generate timestamped filenames
        const archivedAudioFilename = getTimestampedArchivedAudioFilename(originalExtension);
        const archivedTranscriptFilename = getTimestampedArchivedTranscriptFilename();

        // Full paths for archived files - directly in the output directory
        const archivedAudioPath = path.join(outputDirectory, archivedAudioFilename);
        const archivedTranscriptPath = path.join(outputDirectory, archivedTranscriptFilename);

        // Copy audio file if it exists
        if (await storage.isFileReadable(originalAudioPath)) {
            // Read original audio file as buffer using fs directly for binary files
            const audioBuffer = await fs.promises.readFile(originalAudioPath);
            await storage.writeFile(archivedAudioPath, audioBuffer, 'binary');
            logger.debug('Archived audio file to: %s', archivedAudioPath);
        } else {
            logger.warn('AUDIO_FILE_NOT_FOUND: Original audio file not accessible | Path: %s | Impact: Cannot archive original', originalAudioPath);
        }

        // Save transcription text
        const transcriptContent = `# Audio Transcription Archive\n\n**Original Audio File:** ${originalAudioPath}\n**Archived:** ${new Date().toISOString()}\n\n## Transcription\n\n${transcriptionText}`;
        await storage.writeFile(archivedTranscriptPath, transcriptContent, 'utf8');
        logger.debug('Archived transcription to: %s', archivedTranscriptPath);

        logger.info('AUDIO_ARCHIVED: Audio and transcript archived successfully | Audio: %s | Transcript: %s | Status: archived', archivedAudioFilename, archivedTranscriptFilename);

        return {
            audioPath: archivedAudioPath,
            transcriptPath: archivedTranscriptPath
        };

    } catch (error: any) {
        logger.error('AUDIO_ARCHIVE_FAILED: Failed to archive audio files | Error: %s | Impact: Audio not preserved', error.message);
        throw new Error(`Audio archiving failed: ${error.message}`);
    }
};

/**
 * Query npm registry for published version of a package
 * Returns null if package is not published or on error
 */
export const getNpmPublishedVersion = async (packageName: string): Promise<string | null> => {
    const logger = getLogger();
    try {
        const { runSecure } = await import('@eldrforge/git-tools');

        // Use npm view to get the latest published version
        // --json flag ensures parseable output
        const { stdout } = await runSecure('npm', ['view', packageName, 'version', '--json']);

        if (!stdout || stdout.trim() === '') {
            logger.verbose(`Package ${packageName} not found on npm registry`);
            return null;
        }

        // npm view returns just the version string for a single version
        const version = stdout.trim().replace(/^["']|["']$/g, ''); // Remove quotes if present
        logger.verbose(`Found ${packageName}@${version} on npm registry`);
        return version;
    } catch (error: any) {
        // Package not found or network error
        logger.verbose(`Could not query npm for ${packageName}: ${error.message}`);
        return null;
    }
};

/**
 * Check if a package version already exists on npm registry
 */
export const isVersionPublishedOnNpm = async (packageName: string, version: string): Promise<boolean> => {
    const logger = getLogger();
    try {
        const { runSecure } = await import('@eldrforge/git-tools');

        // Use npm view to check for specific version
        const { stdout } = await runSecure('npm', ['view', `${packageName}@${version}`, 'version', '--json']);

        if (!stdout || stdout.trim() === '') {
            logger.verbose(`Version ${packageName}@${version} not found on npm registry`);
            return false;
        }

        logger.verbose(`Version ${packageName}@${version} exists on npm registry`);
        return true;
    } catch (error: any) {
        // Version not found
        logger.verbose(`Version ${packageName}@${version} not published: ${error.message}`);
        return false;
    }
};

/**
 * Get detailed info about a tag including the version it points to
 */
export const getTagInfo = async (tagName: string): Promise<{ exists: boolean; commit?: string; version?: string } | null> => {
    try {
        const { runSecure, validateGitRef } = await import('@eldrforge/git-tools');

        if (!validateGitRef(tagName)) {
            throw new Error(`Invalid tag name: ${tagName}`);
        }

        // Check if tag exists
        const { stdout: tagList } = await runSecure('git', ['tag', '-l', tagName]);
        if (tagList.trim() !== tagName) {
            return { exists: false };
        }

        // Get the commit the tag points to
        const { stdout: commit } = await runSecure('git', ['rev-list', '-n', '1', tagName]);

        // Extract version from tag name (assumes format like v1.2.3 or working/v1.2.3)
        const versionMatch = tagName.match(/v?(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?)/);
        const version = versionMatch ? versionMatch[1] : undefined;

        return {
            exists: true,
            commit: commit.trim(),
            version
        };
    } catch {
        return null;
    }
};

/**
 * Check if a version is a development/prerelease version (has prerelease tag)
 */
export const isDevelopmentVersion = (version: string): boolean => {
    // Development versions have prerelease tags: 1.2.3-dev.0, 1.2.3-alpha.1, etc.
    return version.includes('-');
};

/**
 * Check if a version is a release version (no prerelease tag)
 */
export const isReleaseVersion = (version: string): boolean => {
    // Release versions are X.Y.Z without any suffix
    return /^\d+\.\d+\.\d+$/.test(version);
};

/**
 * Get expected version pattern for a branch
 */
export const getExpectedVersionPattern = (branchName: string): { pattern: RegExp; description: string; isDevelopment: boolean } => {
    // Development/working branches should have prerelease versions
    const devBranchPatterns = /^(working|development|dev|feature\/|wip\/)/i;

    if (devBranchPatterns.test(branchName)) {
        return {
            pattern: /^\d+\.\d+\.\d+-[a-zA-Z0-9.-]+$/,
            description: 'X.Y.Z-<tag> (e.g., 1.2.3-dev.0)',
            isDevelopment: true
        };
    }

    // Main/master/production branches should have release versions
    const releaseBranchPatterns = /^(main|master|production|release\/)/i;

    if (releaseBranchPatterns.test(branchName)) {
        return {
            pattern: /^\d+\.\d+\.\d+$/,
            description: 'X.Y.Z (e.g., 1.2.3)',
            isDevelopment: false
        };
    }

    // For other branches, allow both but prefer release versions
    return {
        pattern: /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/,
        description: 'X.Y.Z or X.Y.Z-<tag>',
        isDevelopment: false
    };
};

/**
 * Validate version against branch expectations
 */
export const validateVersionForBranch = (version: string, branchName: string): {
    valid: boolean;
    issue?: string;
    fix?: string;
} => {
    const expected = getExpectedVersionPattern(branchName);

    if (!expected.pattern.test(version)) {
        return {
            valid: false,
            issue: `Invalid version format for branch '${branchName}'`,
            fix: `Version should match ${expected.description}`
        };
    }

    const isDevVersion = isDevelopmentVersion(version);

    // Development branches should have development versions
    if (expected.isDevelopment && !isDevVersion) {
        return {
            valid: false,
            issue: `Release version on development branch '${branchName}'`,
            fix: 'Run kodrdriv development to update to development version'
        };
    }

    // Release branches should NOT have development versions
    if (!expected.isDevelopment && branchName.match(/^(main|master|production|release\/)/) && isDevVersion) {
        return {
            valid: false,
            issue: `Development version on release branch '${branchName}'`,
            fix: 'Do not commit development versions to release branches'
        };
    }

    return { valid: true };
};

// Re-export shared utilities for backwards compatibility
export { deepMerge, stringifyJSON, incrementPatchVersion, incrementMinorVersion, incrementMajorVersion, validateVersionString, calculateTargetVersion, incrementPrereleaseVersion, convertToReleaseVersion };
