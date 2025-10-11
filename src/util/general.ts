import path from 'path';
import * as Storage from './storage';
import { getLogger } from '../logging';
// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs';

// Utility function for deep merging two objects.
export function deepMerge(target: any, source: any): any {
    for (const key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) {
            if (key === "__proto__" || key === "constructor") {
                continue; // Skip prototype-polluting keys
            }
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                if (!target[key]) {
                    target[key] = {};
                }
                deepMerge(target[key], source[key]);
            } else {
                target[key] = source[key];
            }
        }
    }
    return target;
}

//Recursive implementation of jSON.stringify;
export const stringifyJSON = function (obj: any, options: { depth: number } = { depth: 0 }): string {

    if (options.depth > 10) {
        return '{"error": "Maximum depth reached"}';
    }

    const arrOfKeyVals: string[] = [];
    const arrVals: string[] = [];
    let objKeys: string[] = [];

    /*********CHECK FOR PRIMITIVE TYPES**********/
    if (typeof obj === 'number' || typeof obj === 'boolean' || obj === null)
        return '' + obj;
    else if (typeof obj === 'string')
        return '"' + obj + '"';

    /*********CHECK FOR ARRAY**********/
    else if (Array.isArray(obj)) {
        //check for empty array
        if (obj[0] === undefined)
            return '[]';
        else {
            obj.forEach(function (el) {
                arrVals.push(stringifyJSON(el, { depth: options.depth + 1 }));
            });
            return '[' + arrVals + ']';
        }
    }
    /*********CHECK FOR OBJECT**********/
    else if (obj instanceof Object) {
        //get object keys
        objKeys = Object.keys(obj);
        //set key output;
        objKeys.forEach(function (key) {
            const keyOut = '"' + key + '":';
            const keyValOut = obj[key];
            //skip functions and undefined properties
            if (keyValOut instanceof Function || keyValOut === undefined)
                arrOfKeyVals.push('');
            else if (typeof keyValOut === 'string')
                arrOfKeyVals.push(keyOut + '"' + keyValOut + '"');
            else if (typeof keyValOut === 'boolean' || typeof keyValOut === 'number' || keyValOut === null)
                arrOfKeyVals.push(keyOut + keyValOut);
            //check for nested objects, call recursively until no more objects
            else if (keyValOut instanceof Object) {
                arrOfKeyVals.push(keyOut + stringifyJSON(keyValOut, { depth: options.depth + 1 }));
            }
        });
        return '{' + arrOfKeyVals + '}';
    }
    return '';
};

export const incrementPatchVersion = (version: string): string => {
    // Remove 'v' prefix if present
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Split into major.minor.patch and handle pre-release identifiers
    const parts = cleanVersion.split('.');
    if (parts.length < 3) {
        throw new Error(`Invalid version string: ${version}`);
    }

    // Handle pre-release versions like "4.6.24-dev.0"
    // Split the patch part on '-' to separate patch number from pre-release
    const patchPart = parts[2];
    let patchNumber: number;
    let originalPatchString: string;
    let hasPrerelease = false;

    if (patchPart.startsWith('-')) {
        // Handle negative patch numbers like "-1" or "-5" or "-1-dev.0"
        const negativeComponents = patchPart.split('-');
        // For "-1-dev.0", negativeComponents will be ['', '1', 'dev.0']
        if (negativeComponents.length > 2) {
            // This is a negative number with pre-release like "-1-dev.0"
            originalPatchString = `-${negativeComponents[1]}`;
            patchNumber = parseInt(`-${negativeComponents[1]}`, 10);
            hasPrerelease = true;
        } else {
            // This is just a negative number like "-1"
            patchNumber = parseInt(patchPart, 10);
            originalPatchString = patchPart;
        }
    } else {
        // Handle normal patch numbers with possible pre-release like "24-dev.0"
        const patchComponents = patchPart.split('-');
        originalPatchString = patchComponents[0];
        patchNumber = parseInt(patchComponents[0], 10);
        hasPrerelease = patchComponents.length > 1;
    }

    if (isNaN(patchNumber)) {
        throw new Error(`Invalid patch version: ${patchPart}`);
    }

    // For pre-release versions, graduate to the base version (drop pre-release identifier)
    // For stable versions, increment the patch number
    const newPatchNumber = hasPrerelease ? originalPatchString : (patchNumber + 1).toString();

    // Create clean release version
    const newVersion = `${parts[0]}.${parts[1]}.${newPatchNumber}`;

    return newVersion;
};

export const incrementMinorVersion = (version: string): string => {
    // Remove 'v' prefix if present
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Split into major.minor.patch and handle pre-release identifiers
    const parts = cleanVersion.split('.');
    if (parts.length < 3) {
        throw new Error(`Invalid version string: ${version}`);
    }

    const majorNumber = parseInt(parts[0], 10);
    const minorPart = parts[1];

    // Handle pre-release versions on minor like "23-dev.0"
    const minorComponents = minorPart.split('-');
    const minorNumber = parseInt(minorComponents[0], 10);

    if (isNaN(majorNumber) || isNaN(minorNumber)) {
        throw new Error(`Invalid version numbers in: ${version}`);
    }

    // Increment the minor number and reset patch to 0
    const newMinorNumber = minorNumber + 1;
    const newVersion = `${majorNumber}.${newMinorNumber}.0`;

    return newVersion;
};

export const incrementMajorVersion = (version: string): string => {
    // Remove 'v' prefix if present
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Split into major.minor.patch and handle pre-release identifiers
    const parts = cleanVersion.split('.');
    if (parts.length < 3) {
        throw new Error(`Invalid version string: ${version}`);
    }

    const majorPart = parts[0];

    // Handle pre-release versions on major like "4-dev.0"
    const majorComponents = majorPart.split('-');
    const majorNumber = parseInt(majorComponents[0], 10);

    if (isNaN(majorNumber)) {
        throw new Error(`Invalid major version number in: ${version}`);
    }

    // Increment the major number and reset minor and patch to 0
    const newMajorNumber = majorNumber + 1;
    const newVersion = `${newMajorNumber}.0.0`;

    return newVersion;
};

export const validateVersionString = (version: string): boolean => {
    // Remove 'v' prefix if present
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Basic semver regex pattern
    const semverPattern = /^\d+\.\d+\.\d+$/;
    return semverPattern.test(cleanVersion);
};

export const calculateTargetVersion = (currentVersion: string, targetVersion: string): string => {
    switch (targetVersion.toLowerCase()) {
        case 'patch':
            return incrementPatchVersion(currentVersion);
        case 'minor':
            return incrementMinorVersion(currentVersion);
        case 'major':
            return incrementMajorVersion(currentVersion);
        default:
            // Explicit version provided
            if (!validateVersionString(targetVersion)) {
                throw new Error(`Invalid version format: ${targetVersion}. Expected format: "x.y.z" or one of: "patch", "minor", "major"`);
            }
            return targetVersion.startsWith('v') ? targetVersion.slice(1) : targetVersion;
    }
};

/**
 * Increment prerelease version with a specific tag
 * Examples:
 * - incrementPrereleaseVersion("1.2.3-dev.0", "dev") => "1.2.3-dev.1"
 * - incrementPrereleaseVersion("1.2.3", "dev") => "1.2.3-dev.0"
 * - incrementPrereleaseVersion("1.2.3-dev.5", "test") => "1.2.3-test.0"
 */
export const incrementPrereleaseVersion = (version: string, tag: string): string => {
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Split on dots but only use first 3 parts for major.minor.patch
    // This handles cases like "1.2.3-dev.5" correctly
    const dotParts = cleanVersion.split('.');
    if (dotParts.length < 3) {
        throw new Error(`Invalid version string: ${version}`);
    }

    const major = dotParts[0];
    const minor = dotParts[1];

    // Reconstruct the patch part - everything after the second dot
    const patchAndPrerelease = dotParts.slice(2).join('.');
    const patchComponents = patchAndPrerelease.split('-');
    const patchNumber = patchComponents[0];

    if (patchComponents.length > 1) {
        // Already has prerelease (e.g., "3-dev.0" or "3-test.2")
        const prereleaseString = patchComponents.slice(1).join('-'); // Handle multiple dashes
        const prereleaseComponents = prereleaseString.split('.');
        const existingTag = prereleaseComponents[0];
        const existingPrereleaseVersion = prereleaseComponents[1];

        if (existingTag === tag) {
            // Same tag, increment the prerelease version
            const prereleaseNumber = parseInt(existingPrereleaseVersion) || 0;
            return `${major}.${minor}.${patchNumber}-${tag}.${prereleaseNumber + 1}`;
        } else {
            // Different tag, start at 0
            return `${major}.${minor}.${patchNumber}-${tag}.0`;
        }
    } else {
        // No prerelease yet, add it
        return `${major}.${minor}.${patchNumber}-${tag}.0`;
    }
};

/**
 * Convert prerelease version to release version
 * Examples:
 * - convertToReleaseVersion("1.2.3-dev.5") => "1.2.3"
 * - convertToReleaseVersion("1.2.3-test.2") => "1.2.3"
 * - convertToReleaseVersion("1.2.3") => "1.2.3"
 */
export const convertToReleaseVersion = (version: string): string => {
    const cleanVersion = version.startsWith('v') ? version.slice(1) : version;

    // Split on dots but only use first 3 parts for major.minor.patch
    const dotParts = cleanVersion.split('.');
    if (dotParts.length < 3) {
        throw new Error(`Invalid version string: ${version}`);
    }

    const major = dotParts[0];
    const minor = dotParts[1];

    // Reconstruct the patch part - everything after the second dot
    const patchAndPrerelease = dotParts.slice(2).join('.');
    const patchComponents = patchAndPrerelease.split('-');
    const patchNumber = patchComponents[0];

    return `${major}.${minor}.${patchNumber}`;
};

/**
 * Get version from a specific branch's package.json
 */
export const getVersionFromBranch = async (branchName: string): Promise<string | null> => {
    const { runSecure, validateGitRef } = await import('./child');
    const { safeJsonParse, validatePackageJson } = await import('./validation');

    try {
        // Validate branch name to prevent injection
        if (!validateGitRef(branchName)) {
            throw new Error(`Invalid branch name: ${branchName}`);
        }
        const { stdout } = await runSecure('git', ['show', `${branchName}:package.json`]);
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
 * This is the core logic for branch-dependent versioning
 */
export const calculateBranchDependentVersion = async (
    currentVersion: string,
    currentBranch: string,
    targetsConfig: any,
    targetBranch?: string
): Promise<{ version: string; targetBranch: string }> => {
    const { getLogger } = await import('../logging');
    const logger = getLogger();

    // Check if we have branch-specific configuration
    if (!targetsConfig || !targetsConfig[currentBranch]) {
        // No branch-specific config, use default behavior
        const defaultTargetBranch = targetBranch || 'main';
        const defaultVersion = incrementPatchVersion(currentVersion);
        logger.debug(`No branch-specific config found for '${currentBranch}', using defaults`);
        return { version: defaultVersion, targetBranch: defaultTargetBranch };
    }

    const branchConfig = targetsConfig[currentBranch];
    const configuredTargetBranch = branchConfig.targetBranch;

    logger.info(`🎯 Using branch-dependent targeting: ${currentBranch} → ${configuredTargetBranch}`);

    if (!branchConfig.version) {
        // No version config, use default increment
        const defaultVersion = incrementPatchVersion(currentVersion);
        return { version: defaultVersion, targetBranch: configuredTargetBranch };
    }

    const versionConfig = branchConfig.version;

    if (versionConfig.type === 'release') {
        // Convert to release version (remove prerelease tags)
        const releaseVersion = convertToReleaseVersion(currentVersion);
        logger.info(`📦 Converting to release version: ${currentVersion} → ${releaseVersion}`);
        return { version: releaseVersion, targetBranch: configuredTargetBranch };
    } else if (versionConfig.type === 'prerelease') {
        if (!versionConfig.tag) {
            throw new Error(`Prerelease version type requires a tag in targets configuration`);
        }

        const tag = versionConfig.tag;

        if (versionConfig.increment) {
            // Check if there's already a version with this tag in the target branch
            const targetBranchVersion = await getVersionFromBranch(configuredTargetBranch);

            if (targetBranchVersion) {
                // Use the target branch version as the base and increment
                const newVersion = incrementPrereleaseVersion(targetBranchVersion, tag);
                logger.info(`📦 Incrementing prerelease in target branch: ${targetBranchVersion} → ${newVersion}`);
                return { version: newVersion, targetBranch: configuredTargetBranch };
            } else {
                // No version in target branch, use current version as base
                const newVersion = incrementPrereleaseVersion(currentVersion, tag);
                logger.info(`📦 Creating new prerelease version: ${currentVersion} → ${newVersion}`);
                return { version: newVersion, targetBranch: configuredTargetBranch };
            }
        } else {
            // Just add/change the prerelease tag without incrementing
            const baseVersion = convertToReleaseVersion(currentVersion);
            const newVersion = `${baseVersion}-${tag}.0`;
            logger.info(`📦 Setting prerelease tag: ${currentVersion} → ${newVersion}`);
            return { version: newVersion, targetBranch: configuredTargetBranch };
        }
    }

    throw new Error(`Invalid version type: ${versionConfig.type}`);
};

/**
 * Find the development branch from targets configuration
 * Returns the branch marked with developmentBranch: true
 */
export const findDevelopmentBranch = (targetsConfig: any): string | null => {
    if (!targetsConfig || typeof targetsConfig !== 'object') {
        return null;
    }

    for (const [branchName, branchConfig] of Object.entries(targetsConfig)) {
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
    const { runSecure, validateGitRef } = await import('./child');
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
    logger.info(`\n📦 Version Confirmation:`);
    logger.info(`   Current version: ${currentVersion}`);
    logger.info(`   Proposed version: ${proposedVersion}`);
    if (targetVersionInput) {
        logger.info(`   Target input: ${targetVersionInput}`);
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
            logger.info(`✅ Using custom version: ${cleanCustomVersion}`);
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
    const storage = Storage.create({ log: logger.debug });

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
            logger.warn('Original audio file not found or not readable: %s', originalAudioPath);
        }

        // Save transcription text
        const transcriptContent = `# Audio Transcription Archive\n\n**Original Audio File:** ${originalAudioPath}\n**Archived:** ${new Date().toISOString()}\n\n## Transcription\n\n${transcriptionText}`;
        await storage.writeFile(archivedTranscriptPath, transcriptContent, 'utf8');
        logger.debug('Archived transcription to: %s', archivedTranscriptPath);

        logger.info('📁 Audio archived successfully - Audio: %s, Transcript: %s', archivedAudioFilename, archivedTranscriptFilename);

        return {
            audioPath: archivedAudioPath,
            transcriptPath: archivedTranscriptPath
        };

    } catch (error: any) {
        logger.error('Failed to archive audio: %s', error.message);
        throw new Error(`Audio archiving failed: ${error.message}`);
    }
};
