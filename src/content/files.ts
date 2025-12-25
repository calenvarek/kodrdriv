#!/usr/bin/env node
import { getLogger } from '../logging';
import { createStorage } from '@eldrforge/shared';
import { glob } from 'glob';
import path from 'path';


export interface Instance {
    get(): Promise<string>;
}

// Convert excluded patterns to glob patterns for file filtering
const convertToGlobPatterns = (excludedPatterns: string[]): string[] => {
    return excludedPatterns.map(pattern => {
        // Convert simple patterns to glob patterns
        if (!pattern.includes('*') && !pattern.includes('/')) {
            // Simple name like 'node_modules' -> '**/node_modules/**'
            return `**/${pattern}/**`;
        }
        if (pattern.includes('*')) {
            // Already a glob pattern, ensure it starts with **/ for recursive matching
            return pattern.startsWith('**/') ? pattern : `**/${pattern}`;
        }
        if (pattern.endsWith('/')) {
            // Directory pattern like 'dist/' -> '**/dist/**'
            return `**/${pattern}**`;
        }
        // File pattern like '.env' -> '**/.env'
        return `**/${pattern}`;
    });
};

// Check if a file path matches any excluded pattern
const isFileExcluded = (filePath: string, excludedPatterns: string[]): boolean => {
    const normalizedPath = filePath.replace(/\\/g, '/');

    for (const pattern of excludedPatterns) {
        if (pattern.includes('*')) {
            // Use minimatch-style matching for glob patterns
            const regex = new RegExp(
                pattern
                    .replace(/\*\*/g, '.*')
                    .replace(/\*/g, '[^/]*')
                    .replace(/\?/g, '[^/]')
            );
            if (regex.test(normalizedPath)) {
                return true;
            }
        } else {
            // Simple string matching
            if (normalizedPath.includes(pattern) ||
                normalizedPath.endsWith(pattern) ||
                normalizedPath.split('/').includes(pattern)) {
                return true;
            }
        }
    }
    return false;
};

// Get file content with size limit
const getFileContent = async (filePath: string, storage: any, maxSize: number = 10240): Promise<string | null> => {
    const logger = getLogger();

    try {
        if (!await storage.isFileReadable(filePath)) {
            return null;
        }

        // Read file content
        const content = await storage.readFile(filePath, 'utf-8');
        const sizeBytes = Buffer.byteLength(content, 'utf-8');

        if (sizeBytes > maxSize) {
            // Truncate large files
            const truncatedContent = content.substring(0, Math.floor(maxSize * 0.8));
            return `${truncatedContent}\n\n... [TRUNCATED: File was ${sizeBytes} bytes, showing first ${truncatedContent.length} characters] ...`;
        }

        return content;
    } catch (error: any) {
        logger.debug('Failed to read file %s: %s', filePath, error.message);
        return null;
    }
};

export const create = async (options: {
    excludedPatterns: string[],
    maxTotalBytes?: number,
    workingDirectory?: string
}): Promise<Instance> => {
    const logger = getLogger();
    const storage = createStorage();
    const maxTotalBytes = options.maxTotalBytes || 100 * 1024; // 100KB default
    const workingDir = options.workingDirectory || process.cwd();

    async function get(): Promise<string> {
        try {
            logger.verbose('Collecting file content from working directory for commit analysis');

            // Find all files in the working directory, excluding common patterns
            const globPatterns = [
                '**/*',
                '!**/node_modules/**',
                '!**/.git/**',
                '!**/dist/**',
                '!**/build/**',
                '!**/coverage/**',
                '!**/*.log',
                '!**/tmp/**',
                '!**/.cache/**'
            ];

            // Add user-specified exclusions
            const additionalExclusions = convertToGlobPatterns(options.excludedPatterns);
            for (const exclusion of additionalExclusions) {
                if (!exclusion.startsWith('!')) {
                    globPatterns.push(`!${exclusion}`);
                }
            }

            logger.debug('Using glob patterns: %s', globPatterns.join(', '));

            const files = await glob(globPatterns, {
                cwd: workingDir,
                nodir: true,
                dot: false // Exclude hidden files by default
            });

            logger.debug('Found %d files to analyze', files.length);

            const fileContents: string[] = [];
            let totalBytes = 0;
            let filesProcessed = 0;
            let filesSkipped = 0;

            // Sort files by likely importance (source files first)
            const sortedFiles = files.sort((a, b) => {
                const getFileImportance = (file: string): number => {
                    const ext = path.extname(file).toLowerCase();
                    const name = path.basename(file).toLowerCase();

                    // High importance: main source files
                    if (['package.json', 'tsconfig.json', 'webpack.config.js', 'vite.config.ts'].includes(name)) return 1;
                    if (['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.java', '.cpp', '.c', '.h'].includes(ext)) return 2;
                    if (['.md', '.txt', '.yml', '.yaml', '.json'].includes(ext)) return 3;
                    if (['.css', '.scss', '.sass', '.less', '.html'].includes(ext)) return 4;

                    return 5; // Lower importance
                };

                return getFileImportance(a) - getFileImportance(b);
            });

            for (const file of sortedFiles) {
                const fullPath = path.join(workingDir, file);

                // Double-check exclusions
                if (isFileExcluded(file, options.excludedPatterns)) {
                    filesSkipped++;
                    continue;
                }

                const content = await getFileContent(fullPath, storage);
                if (content === null) {
                    filesSkipped++;
                    continue;
                }

                const contentSize = Buffer.byteLength(content, 'utf-8');

                // Check if adding this file would exceed our total limit
                if (totalBytes + contentSize > maxTotalBytes && filesProcessed > 0) {
                    logger.debug('Reached size limit (%d bytes), stopping at %d files', maxTotalBytes, filesProcessed);
                    break;
                }

                fileContents.push(`=== ${file} ===\n${content}\n`);
                totalBytes += contentSize;
                filesProcessed++;

                logger.debug('Added file %s (%d bytes, total: %d bytes)', file, contentSize, totalBytes);
            }

            logger.info('FILES_COLLECTED: Collected file content successfully | Files Collected: %d | Total Bytes: %d | Files Skipped: %d | Status: completed',
                filesProcessed, totalBytes, filesSkipped);

            if (fileContents.length === 0) {
                return 'No readable files found in working directory.';
            }

            const result = fileContents.join('\n');

            // Add summary header
            const summary = `File Content Analysis (${filesProcessed} files, ${totalBytes} bytes)\n` +
                           `Working Directory: ${workingDir}\n` +
                           `Files Processed: ${filesProcessed}, Files Skipped: ${filesSkipped}\n\n` +
                           result;

            return summary;

        } catch (error: any) {
            logger.error('FILES_COLLECTION_ERROR: Error during file content collection | Error: %s | Stack: %s | Impact: Cannot collect file content', error.message, error.stack);
            throw new Error('Error occurred during file content collection');
        }
    }

    return { get };
};
