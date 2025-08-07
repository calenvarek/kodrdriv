#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import { ChatCompletionMessageParam } from 'openai/resources';
import { ValidationError, FileOperationError, CommandError } from '../error/CommandErrors';
import { getLogger } from '../logging';
import { Config } from '../types';
import { createCompletion, getModelForCommand } from '../util/openai';
import * as ReviewPrompt from '../prompt/review';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import * as ReleaseNotes from '../content/releaseNotes';
import * as Issues from '../content/issues';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedReviewFilename, getTimestampedReviewNotesFilename } from '../util/general';
import { create as createStorage } from '../util/storage';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import fs from 'fs/promises';

// Safe temp file handling with proper permissions and validation
const createSecureTempFile = async (): Promise<string> => {
    const logger = getLogger();
    const tmpDir = os.tmpdir();

    // Ensure temp directory exists and is writable
    try {
        // Use constant value directly to avoid import restrictions
        const W_OK = 2; // fs.constants.W_OK value
        await fs.access(tmpDir, W_OK);
    } catch (error: any) {
        logger.error(`Temp directory not writable: ${tmpDir}`);
        throw new FileOperationError(`Temp directory not writable: ${error.message}`, tmpDir, error);
    }

    const tmpFilePath = path.join(tmpDir, `kodrdriv_review_${Date.now()}_${Math.random().toString(36).substring(7)}.md`);

    // Create file with restrictive permissions (owner read/write only)
    try {
        const fd = await fs.open(tmpFilePath, 'w', 0o600);
        await fd.close();
        logger.debug(`Created secure temp file: ${tmpFilePath}`);
        return tmpFilePath;
    } catch (error: any) {
        logger.error(`Failed to create temp file: ${error.message}`);
        throw new FileOperationError(`Failed to create temp file: ${error.message}`, 'temporary file', error);
    }
};

// Safe file cleanup with proper error handling
const cleanupTempFile = async (filePath: string): Promise<void> => {
    const logger = getLogger();
    try {
        await fs.unlink(filePath);
        logger.debug(`Cleaned up temp file: ${filePath}`);
    } catch (error: any) {
        // Only ignore ENOENT (file not found) errors, log others
        if (error.code !== 'ENOENT') {
            logger.warn(`Failed to cleanup temp file ${filePath}: ${error.message}`);
            // Don't throw here to avoid masking the main operation
        }
    }
};

// Editor with optional timeout and proper error handling
const openEditorWithTimeout = async (editorCmd: string, filePath: string, timeoutMs?: number): Promise<void> => {
    const logger = getLogger();

    return new Promise((resolve, reject) => {
        if (timeoutMs) {
            logger.debug(`Opening editor: ${editorCmd} ${filePath} (timeout: ${timeoutMs}ms)`);
        } else {
            logger.debug(`Opening editor: ${editorCmd} ${filePath} (no timeout)`);
        }

        const child = spawn(editorCmd, [filePath], {
            stdio: 'inherit',
            shell: false // Prevent shell injection
        });

        let timeout: NodeJS.Timeout | undefined;
        if (timeoutMs) {
            timeout = setTimeout(() => {
                logger.warn(`Editor timed out after ${timeoutMs}ms, terminating...`);
                child.kill('SIGTERM');

                // Give it a moment to terminate gracefully, then force kill
                setTimeout(() => {
                    if (!child.killed) {
                        logger.warn('Editor did not terminate gracefully, force killing...');
                        child.kill('SIGKILL');
                    }
                }, 5000);

                reject(new Error(`Editor '${editorCmd}' timed out after ${timeoutMs}ms. Consider using a different editor or increasing the timeout.`));
            }, timeoutMs);
        }

        child.on('exit', (code, signal) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            logger.debug(`Editor exited with code ${code}, signal ${signal}`);

            if (signal === 'SIGTERM' || signal === 'SIGKILL') {
                reject(new Error(`Editor was terminated (${signal})`));
            } else if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Editor exited with non-zero code: ${code}`));
            }
        });

        child.on('error', (error) => {
            if (timeout) {
                clearTimeout(timeout);
            }
            logger.error(`Editor error: ${error.message}`);
            reject(new Error(`Failed to launch editor '${editorCmd}': ${error.message}`));
        });
    });
};

// Validate API response format before use
const validateReviewResult = (data: any): Issues.ReviewResult => {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid API response: expected object, got ' + typeof data);
    }

    if (typeof data.summary !== 'string') {
        throw new Error('Invalid API response: missing or invalid summary field');
    }

    if (typeof data.totalIssues !== 'number' || data.totalIssues < 0) {
        throw new Error('Invalid API response: missing or invalid totalIssues field');
    }

    if (data.issues && !Array.isArray(data.issues)) {
        throw new Error('Invalid API response: issues field must be an array');
    }

    // Validate each issue if present
    if (data.issues) {
        for (let i = 0; i < data.issues.length; i++) {
            const issue = data.issues[i];
            if (!issue || typeof issue !== 'object') {
                throw new Error(`Invalid API response: issue ${i} is not an object`);
            }
            if (typeof issue.title !== 'string') {
                throw new Error(`Invalid API response: issue ${i} missing title`);
            }
            if (typeof issue.priority !== 'string') {
                throw new Error(`Invalid API response: issue ${i} missing priority`);
            }
        }
    }

    return data as Issues.ReviewResult;
};

// Enhanced TTY detection with fallback handling
const isTTYSafe = (): boolean => {
    try {
        // Primary check
        if (process.stdin.isTTY === false) {
            return false;
        }

        // Additional checks for edge cases
        if (process.stdin.isTTY === true) {
            return true;
        }

        // Handle undefined case (some environments)
        if (process.stdin.isTTY === undefined) {
            // Check if we can reasonably assume interactive mode
            return process.stdout.isTTY === true && process.stderr.isTTY === true;
        }

        return false;
    } catch (error) {
        // If TTY detection fails entirely, assume non-interactive
        getLogger().debug(`TTY detection failed: ${error}, assuming non-interactive`);
        return false;
    }
};

// Safe file write with disk space and permission validation
const safeWriteFile = async (filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): Promise<void> => {
    const logger = getLogger();

    try {
        // Check if parent directory exists and is writable
        const parentDir = path.dirname(filePath);
        const W_OK = 2; // fs.constants.W_OK value
        await fs.access(parentDir, W_OK);

        // Check available disk space (basic check by writing a small test)
        const testFile = `${filePath}.test`;
        try {
            await fs.writeFile(testFile, 'test', encoding);
            await fs.unlink(testFile);
        } catch (error: any) {
            if (error.code === 'ENOSPC') {
                throw new Error(`Insufficient disk space to write file: ${filePath}`);
            }
            throw error;
        }

        // Write the actual file
        await fs.writeFile(filePath, content, encoding);
        logger.debug(`Successfully wrote file: ${filePath} (${content.length} characters)`);

    } catch (error: any) {
        logger.error(`Failed to write file ${filePath}: ${error.message}`);
        throw new Error(`Failed to write file ${filePath}: ${error.message}`);
    }
};

const executeInternal = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Show configuration even in dry-run mode
    logger.debug('Review context configuration:');
    logger.debug('  Include commit history: %s', runConfig.review?.includeCommitHistory);
    logger.debug('  Include recent diffs: %s', runConfig.review?.includeRecentDiffs);
    logger.debug('  Include release notes: %s', runConfig.review?.includeReleaseNotes);
    logger.debug('  Include GitHub issues: %s', runConfig.review?.includeGithubIssues);
    logger.debug('  Commit history limit: %d', runConfig.review?.commitHistoryLimit);
    logger.debug('  Diff history limit: %d', runConfig.review?.diffHistoryLimit);
    logger.debug('  Release notes limit: %d', runConfig.review?.releaseNotesLimit);
    logger.debug('  GitHub issues limit: %d', runConfig.review?.githubIssuesLimit);
    logger.debug('  Sendit mode (auto-create issues): %s', runConfig.review?.sendit);

    if (isDryRun) {
        logger.info('DRY RUN: Would analyze provided note for review');
        logger.info('DRY RUN: Would gather additional context based on configuration above');
        logger.info('DRY RUN: Would analyze note and identify issues');

        if (runConfig.review?.sendit) {
            logger.info('DRY RUN: Would automatically create GitHub issues (sendit mode enabled)');
        } else {
            logger.info('DRY RUN: Would prompt for confirmation before creating GitHub issues');
        }

        // Show what exclusion patterns would be used in dry-run mode
        if (runConfig.review?.includeRecentDiffs) {
            const basePatterns = runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS;
            const reviewExcluded = Diff.getReviewExcludedPatterns(basePatterns);
            logger.info('DRY RUN: Would use %d exclusion patterns for diff context', reviewExcluded.length);
            logger.debug('DRY RUN: Sample exclusions: %s', reviewExcluded.slice(0, 15).join(', ') +
                (reviewExcluded.length > 15 ? '...' : ''));
        }

        return 'DRY RUN: Review command would analyze note, gather context, and create GitHub issues';
    }

    // Enhanced TTY check with proper error handling
    const isInteractive = isTTYSafe();
    if (!isInteractive && !runConfig.review?.sendit) {
        logger.error('❌ STDIN is piped but --sendit flag is not enabled');
        logger.error('   Interactive prompts cannot be used when input is piped');
        logger.error('   Solutions:');
        logger.error('   • Add --sendit flag to auto-create all issues');
        logger.error('   • Use terminal input instead of piping');
        logger.error('   • Example: echo "note" | kodrdriv review --sendit');
        throw new ValidationError('Piped input requires --sendit flag for non-interactive operation');
    }

    // Get the review note from configuration
    let reviewNote = runConfig.review?.note;

    // If no review note was provided via CLI arg or STDIN, open the user's editor to capture it.
    if (!reviewNote || !reviewNote.trim()) {
        const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

        let tmpFilePath: string | null = null;
        try {
            // Create secure temporary file
            tmpFilePath = await createSecureTempFile();

            // Pre-populate the file with a helpful header so users know what to do.
            const templateContent = [
                '# Kodrdriv Review Note',
                '',
                '# Please enter your review note below. Lines starting with "#" will be ignored.',
                '# Save and close the editor when you are done.',
                '',
                '',
            ].join('\n');

            await safeWriteFile(tmpFilePath, templateContent);

            logger.info(`No review note provided – opening ${editor} to capture input...`);

            // Open the editor with optional timeout protection
            const editorTimeout = runConfig.review?.editorTimeout; // No default timeout - let user take their time
            await openEditorWithTimeout(editor, tmpFilePath, editorTimeout);

            // Read the file back in, stripping comment lines and whitespace.
            const fileContent = (await fs.readFile(tmpFilePath, 'utf8'))
                .split('\n')
                .filter(line => !line.trim().startsWith('#'))
                .join('\n')
                .trim();

            if (!fileContent) {
                throw new ValidationError('Review note is empty – aborting. Provide a note as an argument, via STDIN, or through the editor.');
            }

            reviewNote = fileContent;

            // If the original runConfig.review object exists, update it so downstream code has the note.
            if (runConfig.review) {
                runConfig.review.note = reviewNote;
            }

        } catch (error: any) {
            logger.error(`Failed to capture review note via editor: ${error.message}`);
            throw error;
        } finally {
            // Always clean up the temp file
            if (tmpFilePath) {
                await cleanupTempFile(tmpFilePath);
            }
        }
    }

    logger.info('📝 Starting review analysis...');
    logger.debug('Review note: %s', reviewNote);
    logger.debug('Review note length: %d characters', reviewNote.length);

    // Gather additional context based on configuration with improved error handling
    let logContext = '';
    let diffContext = '';
    let releaseNotesContext = '';
    let issuesContext = '';
    const contextErrors: string[] = [];

    // Fetch commit history if enabled
    if (runConfig.review?.includeCommitHistory) {
        try {
            logger.debug('Fetching recent commit history...');
            const log = await Log.create({
                limit: runConfig.review.commitHistoryLimit
            });
            const logContent = await log.get();
            if (logContent.trim()) {
                logContext += `\n\n[Recent Commit History]\n${logContent}`;
                logger.debug('Added commit history to context (%d characters)', logContent.length);
            }
        } catch (error: any) {
            const errorMsg = `Failed to fetch commit history: ${error.message}`;
            logger.warn(errorMsg);
            contextErrors.push(errorMsg);
        }
    }

    // Fetch recent diffs if enabled
    if (runConfig.review?.includeRecentDiffs) {
        try {
            logger.debug('Fetching recent commit diffs...');
            const basePatterns = runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS;
            const recentDiffs = await Diff.getRecentDiffsForReview({
                limit: runConfig.review.diffHistoryLimit,
                baseExcludedPatterns: basePatterns
            });
            diffContext += recentDiffs;
            if (recentDiffs.trim()) {
                logger.debug('Added recent diffs to context (%d characters)', recentDiffs.length);
            }
        } catch (error: any) {
            const errorMsg = `Failed to fetch recent diffs: ${error.message}`;
            logger.warn(errorMsg);
            contextErrors.push(errorMsg);
        }
    }

    // Fetch release notes if enabled
    if (runConfig.review?.includeReleaseNotes) {
        try {
            logger.debug('Fetching recent release notes from GitHub...');
            const releaseNotesContent = await ReleaseNotes.get({
                limit: runConfig.review.releaseNotesLimit || 3
            });
            if (releaseNotesContent.trim()) {
                releaseNotesContext += `\n\n[Recent Release Notes]\n${releaseNotesContent}`;
                logger.debug('Added release notes to context (%d characters)', releaseNotesContent.length);
            }
        } catch (error: any) {
            const errorMsg = `Failed to fetch release notes: ${error.message}`;
            logger.warn(errorMsg);
            contextErrors.push(errorMsg);
        }
    }

    // Fetch GitHub issues if enabled
    if (runConfig.review?.includeGithubIssues) {
        try {
            logger.debug('Fetching open GitHub issues...');
            issuesContext = await Issues.get({
                limit: runConfig.review.githubIssuesLimit || 20
            });
            if (issuesContext.trim()) {
                logger.debug('Added GitHub issues to context (%d characters)', issuesContext.length);
            }
        } catch (error: any) {
            const errorMsg = `Failed to fetch GitHub issues: ${error.message}`;
            logger.warn(errorMsg);
            contextErrors.push(errorMsg);
        }
    }

    // Report context gathering results
    if (contextErrors.length > 0) {
        logger.warn(`Context gathering completed with ${contextErrors.length} error(s):`);
        contextErrors.forEach(error => logger.warn(`  - ${error}`));

        // For critical operations, consider failing if too many context sources fail
        const maxContextErrors = runConfig.review?.maxContextErrors || contextErrors.length; // Default: allow all errors
        if (contextErrors.length > maxContextErrors) {
            throw new Error(`Too many context gathering errors (${contextErrors.length}), aborting review. Consider checking your configuration and network connectivity.`);
        }
    }

    // Analyze review note for issues using OpenAI
    logger.info('🤖 Analyzing review note for project issues...');
    logger.debug('Context summary:');
    logger.debug('  - Review note: %d chars', reviewNote.length);
    logger.debug('  - Log context: %d chars', logContext.length);
    logger.debug('  - Diff context: %d chars', diffContext.length);
    logger.debug('  - Release notes context: %d chars', releaseNotesContext.length);
    logger.debug('  - Issues context: %d chars', issuesContext.length);
    logger.debug('  - User context: %d chars', runConfig.review?.context?.length || 0);

    const promptConfig = {
        overridePaths: runConfig.discoveredConfigDirs || [],
        overrides: runConfig.overrides || false,
    };
    const promptContent = {
        notes: reviewNote,
    };
    const promptContext = {
        context: runConfig.review?.context,
        logContext,
        diffContext,
        releaseNotesContext,
        issuesContext,
    };
    const prompt = await ReviewPrompt.createPrompt(promptConfig, promptContent, promptContext);

    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    // Save timestamped copy of review notes and context to output directory
    try {
        // Save the original review note
        const reviewNotesFilename = getTimestampedReviewNotesFilename();
        const reviewNotesPath = getOutputPath(outputDirectory, reviewNotesFilename);

        let reviewNotesContent = `# Review Notes\n\n${reviewNote}\n\n`;

        // Add all context sections if they exist
        if (logContext.trim()) {
            reviewNotesContent += `# Commit History Context\n\n${logContext}\n\n`;
        }
        if (diffContext.trim()) {
            reviewNotesContent += `# Recent Diffs Context\n\n${diffContext}\n\n`;
        }
        if (releaseNotesContext.trim()) {
            reviewNotesContent += `# Release Notes Context\n\n${releaseNotesContext}\n\n`;
        }
        if (issuesContext.trim()) {
            reviewNotesContent += `# GitHub Issues Context\n\n${issuesContext}\n\n`;
        }
        if (runConfig.review?.context?.trim()) {
            reviewNotesContent += `# User Context\n\n${runConfig.review.context}\n\n`;
        }

        await safeWriteFile(reviewNotesPath, reviewNotesContent);
        logger.debug('Saved timestamped review notes and context: %s', reviewNotesPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped review notes: %s', error.message);
        // Don't fail the entire operation for this
    }

    const modelToUse = getModelForCommand(runConfig, 'review');
    const request: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, prompt);

    let analysisResult: Issues.ReviewResult;
    try {
        const rawResult = await createCompletion(request.messages as ChatCompletionMessageParam[], {
            model: modelToUse,
            responseFormat: { type: 'json_object' },
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('review-analysis')),
            debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('review-analysis')),
        });

        // Validate the API response before using it
        analysisResult = validateReviewResult(rawResult);

    } catch (error: any) {
        logger.error(`Failed to analyze review note: ${error.message}`);
        throw new Error(`Review analysis failed: ${error.message}`);
    }

    logger.info('✅ Analysis completed');
    logger.debug('Analysis result summary: %s', analysisResult.summary);
    logger.debug('Total issues found: %d', analysisResult.totalIssues);
    logger.debug('Issues array length: %d', analysisResult.issues?.length || 0);
    if (analysisResult.issues && analysisResult.issues.length > 0) {
        analysisResult.issues.forEach((issue, index) => {
            logger.debug('  Issue %d: [%s] %s', index + 1, issue.priority, issue.title);
        });
    }

    // Save timestamped copy of analysis result to output directory
    try {
        const reviewFilename = getTimestampedReviewFilename();
        const reviewPath = getOutputPath(outputDirectory, reviewFilename);

        // Format the analysis result as markdown
        const reviewContent = `# Review Analysis Result\n\n` +
            `## Summary\n${analysisResult.summary}\n\n` +
            `## Total Issues Found\n${analysisResult.totalIssues}\n\n` +
            `## Issues\n\n${JSON.stringify(analysisResult.issues, null, 2)}\n\n` +
            `---\n\n*Analysis completed at ${new Date().toISOString()}*`;

        await safeWriteFile(reviewPath, reviewContent);
        logger.debug('Saved timestamped review analysis: %s', reviewPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped review analysis: %s', error.message);
        // Don't fail the entire operation for this
    }

    // Handle GitHub issue creation using the issues module
    const senditMode = runConfig.review?.sendit || false;
    return await Issues.handleIssueCreation(analysisResult, senditMode);
};

export const execute = async (runConfig: Config): Promise<string> => {
    try {
        return await executeInternal(runConfig);
    } catch (error: any) {
        const logger = getLogger();

        if (error instanceof ValidationError) {
            logger.error(`review failed: ${error.message}`);
            throw error;
        }

        if (error instanceof FileOperationError) {
            logger.error(`review failed: ${error.message}`);
            if (error.cause) {
                logger.debug(`Caused by: ${error.cause.message}`);
            }
            throw error;
        }

        if (error instanceof CommandError) {
            logger.error(`review failed: ${error.message}`);
            if (error.cause) {
                logger.debug(`Caused by: ${error.cause.message}`);
            }
            throw error;
        }

        // Unexpected errors
        logger.error(`review encountered unexpected error: ${error.message}`);
        throw error;
    }
};
