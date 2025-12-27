#!/usr/bin/env node
import { ExitError } from '@eldrforge/shared';
import { getLogger } from '../logging';
import { run } from '@eldrforge/git-tools';
import { DEFAULT_GIT_COMMAND_MAX_BUFFER } from '../constants';

export interface Instance {
    get(): Promise<string>;
}



// Enhanced exclusion patterns specifically for review context
// These focus on excluding large files, binaries, and content that doesn't help with issue analysis
export const getReviewExcludedPatterns = (basePatterns: string[]): string[] => {
    const reviewSpecificExclusions = [
        // Lock files and dependency files (often massive)
        "*lock*",
        "*.lock",
        "package-lock.json",
        "yarn.lock",
        "bun.lockb",
        "composer.lock",
        "Cargo.lock",
        "Gemfile.lock",
        "Pipfile.lock",
        "poetry.lock",

        // Image files (binary and large)
        "*.png",
        "*.jpg",
        "*.jpeg",
        "*.gif",
        "*.bmp",
        "*.tiff",
        "*.webp",
        "*.svg",
        "*.ico",
        "*.icns",

        // Video and audio files
        "*.mp4",
        "*.avi",
        "*.mov",
        "*.wmv",
        "*.flv",
        "*.mp3",
        "*.wav",
        "*.flac",

        // Archives and compressed files
        "*.zip",
        "*.tar",
        "*.tar.gz",
        "*.tgz",
        "*.rar",
        "*.7z",
        "*.bz2",
        "*.xz",

        // Binary executables and libraries
        "*.exe",
        "*.dll",
        "*.so",
        "*.dylib",
        "*.bin",
        "*.app",

        // Database files
        "*.db",
        "*.sqlite",
        "*.sqlite3",
        "*.mdb",

        // Large generated files
        "*.map",
        "*.min.js",
        "*.min.css",
        "bundle.*",
        "vendor.*",

        // Documentation that's often large
        "*.pdf",
        "*.doc",
        "*.docx",
        "*.ppt",
        "*.pptx",

        // IDE and OS generated files
        ".DS_Store",
        "Thumbs.db",
        "*.swp",
        "*.tmp",

        // Certificate and key files
        "*.pem",
        "*.crt",
        "*.key",
        "*.p12",
        "*.pfx",

        // Large config/data files that are often auto-generated
        "tsconfig.tsbuildinfo",
        "*.cache",
        ".eslintcache",
    ];

    // Combine base patterns with review specific exclusions, removing duplicates
    const combinedPatterns = [...new Set([...basePatterns, ...reviewSpecificExclusions])];
    return combinedPatterns;
};

// Check if there are changes to critical files that are normally excluded
export const hasCriticalExcludedChanges = async (): Promise<{ hasChanges: boolean, files: string[] }> => {
    const logger = getLogger();
    const criticalPatterns = [
        'package-lock.json',
        'yarn.lock',
        'bun.lockb',
        '.gitignore',
        '.env.example'
    ];

    try {
        // Check for unstaged changes to critical files
        const { stdout } = await run('git status --porcelain');
        const changedFiles = stdout.split('\n')
            .filter(line => line.trim())
            .map(line => line.substring(3).trim()); // Remove status prefix

        const criticalFiles = changedFiles.filter(file =>
            criticalPatterns.some(pattern =>
                file === pattern || file.endsWith(`/${pattern}`)
            )
        );

        logger.debug('Found %d critical excluded files with changes: %s',
            criticalFiles.length, criticalFiles.join(', '));

        return { hasChanges: criticalFiles.length > 0, files: criticalFiles };
    } catch (error: any) {
        logger.debug('Error checking for critical excluded changes: %s', error.message);
        return { hasChanges: false, files: [] };
    }
};

// Get minimal excluded patterns that still includes critical files
export const getMinimalExcludedPatterns = (basePatterns: string[]): string[] => {
    const criticalPatterns = [
        'package-lock.json',
        'yarn.lock',
        'bun.lockb',
        '.gitignore',
        '.env.example'
    ];

    // Filter out critical patterns from base patterns
    return basePatterns.filter(pattern =>
        !criticalPatterns.some(critical =>
            pattern === critical ||
            pattern.includes(critical)
        )
    );
};

// Function to truncate overly large diff content while preserving structure
export const truncateLargeDiff = (diffContent: string, maxLength: number = 5000): string => {
    if (diffContent.length <= maxLength) {
        return diffContent;
    }

    const lines = diffContent.split('\n');
    const truncatedLines: string[] = [];
    let currentLength = 0;
    let truncated = false;

    for (const line of lines) {
        if (currentLength + line.length + 1 > maxLength) {
            truncated = true;
            break;
        }
        truncatedLines.push(line);
        currentLength += line.length + 1; // +1 for newline
    }

    if (truncated) {
        truncatedLines.push('');
        truncatedLines.push(`... [TRUNCATED: Original diff was ${diffContent.length} characters, showing first ${currentLength}] ...`);
    }

    return truncatedLines.join('\n');
};

// Smart diff truncation that identifies and handles large files individually
export const truncateDiffByFiles = (diffContent: string, maxDiffBytes: number): string => {
    if (diffContent.length <= maxDiffBytes) {
        return diffContent;
    }

    const lines = diffContent.split('\n');
    const result: string[] = [];
    let currentFile: string[] = [];
    let currentFileHeader = '';
    let totalSize = 0;
    let filesOmitted = 0;

    for (const line of lines) {
        // Check if this is a file header (starts with diff --git)
        if (line.startsWith('diff --git ')) {
            // Process the previous file if it exists
            if (currentFile.length > 0) {
                const fileContent = currentFile.join('\n');
                const fileSizeBytes = Buffer.byteLength(fileContent, 'utf8');

                if (fileSizeBytes > maxDiffBytes) {
                    // This single file is too large, replace with a summary
                    result.push(currentFileHeader);
                    result.push(`... [CHANGE OMITTED: File too large (${fileSizeBytes} bytes > ${maxDiffBytes} limit)] ...`);
                    result.push('');
                    filesOmitted++;
                } else if (totalSize + fileSizeBytes > maxDiffBytes * 10) { // Allow total to be up to 10x limit before dropping files
                    // Adding this file would make total too large
                    result.push(currentFileHeader);
                    result.push(`... [CHANGE OMITTED: Would exceed total size limit] ...`);
                    result.push('');
                    filesOmitted++;
                } else {
                    // File is acceptable size
                    result.push(...currentFile);
                    totalSize += fileSizeBytes;
                }
            }

            // Start new file
            currentFileHeader = line;
            currentFile = [line];
        } else {
            // Add line to current file
            currentFile.push(line);
        }
    }

    // Handle the last file
    if (currentFile.length > 0) {
        const fileContent = currentFile.join('\n');
        const fileSizeBytes = Buffer.byteLength(fileContent, 'utf8');

        if (fileSizeBytes > maxDiffBytes) {
            result.push(currentFileHeader);
            result.push(`... [CHANGE OMITTED: File too large (${fileSizeBytes} bytes > ${maxDiffBytes} limit)] ...`);
            result.push('');
            filesOmitted++;
        } else if (totalSize + fileSizeBytes > maxDiffBytes * 10) {
            result.push(currentFileHeader);
            result.push(`... [CHANGE OMITTED: Would exceed total size limit] ...`);
            result.push('');
            filesOmitted++;
        } else {
            result.push(...currentFile);
            totalSize += fileSizeBytes;
        }
    }

    const finalResult = result.join('\n');

    if (filesOmitted > 0) {
        return finalResult + `\n\n[SUMMARY: ${filesOmitted} files omitted due to size limits. Original diff: ${diffContent.length} bytes, processed diff: ${finalResult.length} bytes]`;
    }

    return finalResult;
};

export const create = async (options: { from?: string, to?: string, cached?: boolean, excludedPatterns: string[], maxDiffBytes?: number }): Promise<Instance> => {
    const logger = getLogger();

    async function get(): Promise<string> {
        try {
            logger.verbose('Gathering change information from Git');

            try {
                logger.debug('Executing git diff');
                const excludeString = options.excludedPatterns.map(p => `':(exclude)${p}'`).join(' ');
                let range = '';
                if (options.from && options.to) {
                    range = `${options.from}..${options.to}`;
                } else if (options.from) {
                    range = `${options.from}`;
                } else if (options.to) {
                    range = `${options.to}`;
                }
                let command = '';
                if (options.cached) {
                    command = `git diff --cached${range ? ' ' + range : ''} -- . ${excludeString}`;
                } else {
                    command = `git diff${range ? ' ' + range : ''} -- . ${excludeString}`;
                }
                const { stdout, stderr } = await run(command, { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
                if (stderr) {
                    logger.warn('GIT_DIFF_STDERR: Git diff produced stderr output | Stderr: %s | Impact: May indicate warnings', stderr);
                }
                logger.debug('Git diff output: %s', stdout);

                // Apply intelligent diff truncation if maxDiffBytes is specified
                if (options.maxDiffBytes && stdout.length > 0) {
                    const originalSize = Buffer.byteLength(stdout, 'utf8');
                    const truncatedDiff = truncateDiffByFiles(stdout, options.maxDiffBytes);
                    const newSize = Buffer.byteLength(truncatedDiff, 'utf8');

                    if (originalSize !== newSize) {
                        logger.info('DIFF_TRUNCATED: Applied diff size truncation | Original: %d bytes | Truncated: %d bytes | Limit: %d bytes | Reason: Size exceeds limit',
                            originalSize, newSize, options.maxDiffBytes);
                    }

                    return truncatedDiff;
                }

                return stdout;
            } catch (error: any) {
                logger.error('GIT_DIFF_FAILED: Failed to execute git diff command | Error: %s | Impact: Cannot gather change information', error.message);
                throw error;
            }
        } catch (error: any) {
            logger.error('DIFF_GATHER_ERROR: Error during change gathering phase | Error: %s | Stack: %s | Impact: Cannot collect diff', error.message, error.stack);
            throw new ExitError('Error occurred during gather change phase');
        }
    }

    return { get };
}

export const hasStagedChanges = async (): Promise<boolean> => {
    const logger = getLogger();
    try {
        logger.debug('Checking for staged changes');
        // Suppress error logging since exit code 1 is expected when there are staged changes
        const { stderr } = await run('git diff --cached --quiet', { suppressErrorLogging: true });
        if (stderr) {
            logger.warn('GIT_DIFF_STDERR: Git diff produced stderr output | Stderr: %s | Impact: May indicate warnings', stderr);
        }
        // If there are staged changes, git diff --cached --quiet will return non-zero
        // So if we get here without an error, there are no staged changes
        return false;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: any) {
        // If we get an error, it means there are staged changes (exit code 1 is expected behavior)
        return true;
    }
}

// High-level function to get recent diffs formatted for review context
export const getRecentDiffsForReview = async (options: {
    limit?: number;
    baseExcludedPatterns: string[];
}): Promise<string> => {
    const logger = getLogger();
    const diffLimit = options.limit || 5;

    // Get enhanced exclusion patterns for review context
    const reviewExcluded = getReviewExcludedPatterns(options.baseExcludedPatterns);
    logger.debug('Using %d exclusion patterns for diff context (including %d review specific)',
        reviewExcluded.length, reviewExcluded.length - options.baseExcludedPatterns.length);
    logger.debug('Sample exclusions: %s', reviewExcluded.slice(0, 10).join(', ') +
        (reviewExcluded.length > 10 ? '...' : ''));

    const diffSections: string[] = [];

    // Get recent commits and their diffs
    for (let i = 0; i < diffLimit; i++) {
        try {
            const diffRange = i === 0 ? 'HEAD~1' : `HEAD~${i + 1}..HEAD~${i}`;
            const diff = await create({
                from: `HEAD~${i + 1}`,
                to: `HEAD~${i}`,
                excludedPatterns: reviewExcluded
            });
            const diffContent = await diff.get();
            if (diffContent.trim()) {
                const truncatedDiff = truncateLargeDiff(diffContent);
                diffSections.push(`[Recent Diff ${i + 1} (${diffRange})]\n${truncatedDiff}`);

                if (truncatedDiff.length < diffContent.length) {
                    logger.debug('Added diff %d to context (%d characters, truncated from %d)',
                        i + 1, truncatedDiff.length, diffContent.length);
                } else {
                    logger.debug('Added diff %d to context (%d characters)', i + 1, diffContent.length);
                }
            } else {
                logger.debug('Diff %d was empty after exclusions', i + 1);
            }
        } catch (error: any) {
            logger.debug('Could not fetch diff %d: %s', i + 1, error.message);
            break; // Stop if we can't fetch more diffs
        }
    }

    return diffSections.length > 0 ? '\n\n' + diffSections.join('\n\n') : '';
};
