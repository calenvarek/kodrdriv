#!/usr/bin/env node
import { ExitError } from '../error/ExitError';
import { getLogger } from '../logging';
import { run } from '../util/child';

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

export const create = async (options: { from?: string, to?: string, cached?: boolean, excludedPatterns: string[] }): Promise<Instance> => {
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
                const { stdout, stderr } = await run(command);
                if (stderr) {
                    logger.warn('Git log produced stderr: %s', stderr);
                }
                logger.debug('Git log output: %s', stdout);
                return stdout;
            } catch (error: any) {
                logger.error('Failed to execute git log: %s', error.message);
                throw error;
            }
        } catch (error: any) {
            logger.error('Error occurred during gather change phase: %s %s', error.message, error.stack);
            throw new ExitError('Error occurred during gather change phase');
        }
    }

    return { get };
}

export const hasStagedChanges = async (): Promise<boolean> => {
    const logger = getLogger();
    try {
        logger.debug('Checking for staged changes');
        const { stderr } = await run('git diff --cached --quiet');
        if (stderr) {
            logger.warn('Git diff produced stderr: %s', stderr);
        }
        // If there are staged changes, git diff --cached --quiet will return non-zero
        // So if we get here without an error, there are no staged changes
        return false;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: any) {
        // If we get an error, it means there are staged changes
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
