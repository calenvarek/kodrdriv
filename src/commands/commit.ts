#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import shellescape from 'shell-escape';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Diff from '../content/diff';
import * as Log from '../content/log';
import { CommandError, ValidationError, ExternalDependencyError } from '../error/CommandErrors';
import { getDryRunLogger } from '../logging';
import * as CommitPrompt from '../prompt/commit';
import { Config } from '../types';
import { run } from '../util/child';
import { validateString } from '../util/validation';
import { stringifyJSON, getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedCommitFilename } from '../util/general';
import { createCompletion } from '../util/openai';
import { checkForFileDependencies, logFileDependencyWarning, logFileDependencySuggestions } from '../util/safety';
import { create as createStorage } from '../util/storage';

// Simplified cached determination with single check
const determineCachedState = async (config: Config): Promise<boolean> => {
    // If add is used, we always look at staged changes after add
    if (config.commit?.add) {
        return true;
    }

    // If explicitly set, use that value
    if (config.commit?.cached !== undefined) {
        return config.commit.cached;
    }

    // Otherwise, check if there are staged changes
    return await Diff.hasStagedChanges();
};

// Single validation of sendit + cached state
const validateSenditState = (config: Config, cached: boolean, isDryRun: boolean, logger: any): boolean => {
    if (config.commit?.sendit && !cached && !isDryRun) {
        const message = 'SendIt mode enabled, but no changes to commit.';
        logger.warn(message);
        return false; // Return false to indicate no changes to commit
    }
    return true; // Return true to indicate we can proceed
};

// Better file save handling with fallbacks
const saveCommitMessage = async (outputDirectory: string, summary: string, storage: any, logger: any): Promise<void> => {
    const timestampedFilename = getTimestampedCommitFilename();
    const primaryPath = getOutputPath(outputDirectory, timestampedFilename);

    try {
        await storage.writeFile(primaryPath, summary, 'utf-8');
        logger.debug('Saved timestamped commit message: %s', primaryPath);
        return; // Success, no fallback needed
    } catch (error: any) {
        logger.warn('Failed to save commit message to primary location (%s): %s', primaryPath, error.message);
        logger.debug('Primary save error details:', error);

        // First fallback: try output directory root (in case subdirectory has issues)
        try {
            const outputRootPath = getOutputPath('output', timestampedFilename);
            await storage.writeFile(outputRootPath, summary, 'utf-8');
            logger.info('Saved commit message to output directory fallback: %s', outputRootPath);
            return;
        } catch (outputError: any) {
            logger.warn('Failed to save to output directory fallback: %s', outputError.message);
        }

        // Last resort fallback: save to current directory (this creates the clutter!)
        try {
            const fallbackPath = `commit-message-${Date.now()}.txt`;
            await storage.writeFile(fallbackPath, summary, 'utf-8');
            logger.warn('⚠️  Saved commit message to current directory as last resort: %s', fallbackPath);
            logger.warn('⚠️  This file should be moved to the output directory and may clutter your workspace');
        } catch (fallbackError: any) {
            logger.error('Failed to save commit message anywhere: %s', fallbackError.message);
            logger.error('Commit message will only be available in console output');
            // Continue execution - commit message is still returned
        }
    }
};

const executeInternal = async (runConfig: Config) => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    if (runConfig.commit?.add) {
        if (isDryRun) {
            logger.info('Would add all changes to the index with: git add -A');
        } else {
            logger.verbose('Adding all changes to the index...');
            await run('git add -A');
        }
    }

    // Determine cached state with single, clear logic
    const cached = await determineCachedState(runConfig);

    // Validate sendit state early - now returns boolean instead of throwing
    validateSenditState(runConfig, cached, isDryRun, logger);

    let diffContent = '';
    const options = { cached, excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS };
    const diff = await Diff.create(options);
    diffContent = await diff.get();

    // Check if there are actually any changes in the diff
    const hasActualChanges = diffContent.trim().length > 0;

    // If there are no changes and sendit is enabled, log warning and return early
    if (!hasActualChanges && runConfig.commit?.sendit && !isDryRun) {
        logger.warn('No changes detected to commit. Skipping commit operation.');
        return 'No changes to commit.';
    }

    // If there are no changes but we're not in sendit mode, we might still want to generate a message
    // This allows for dry-run scenarios or testing commit message generation
    if (!hasActualChanges) {
        logger.info('No changes detected in the working directory.');
        if (runConfig.commit?.sendit) {
            logger.info('Skipping commit operation due to no changes.');
            return 'No changes to commit.';
        } else {
            logger.info('Generating commit message template for future use...');
        }
    }

    const logOptions = {
        limit: runConfig.commit?.messageLimit,
    };
    const log = await Log.create(logOptions);
    const logContext = await log.get();

    const promptConfig = {
        overridePaths: runConfig.discoveredConfigDirs || [],
        overrides: runConfig.overrides || false,
    };
    const promptContent = {
        diffContent,
        userDirection: runConfig.commit?.direction,
    };
    const promptContext = {
        logContext,
        context: runConfig.commit?.context,
        directories: runConfig.contextDirectories,
    };
    const prompt = await CommitPrompt.createPrompt(promptConfig, promptContent, promptContext);

    // Use consistent model for debug (fix hardcoded model)
    if (runConfig.debug) {
        const formattedPrompt = Formatter.create({ logger }).formatPrompt(runConfig.model as Model, prompt);
        logger.silly('Formatted Prompt: %s', stringifyJSON(formattedPrompt));
    }

    const request: Request = Formatter.create({ logger }).formatPrompt(runConfig.model as Model, prompt);

    // Always ensure output directory exists for request/response files
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], {
        model: runConfig.model,
        debug: runConfig.debug,
        debugRequestFile: getOutputPath(runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY, getTimestampedRequestFilename('commit')),
        debugResponseFile: getOutputPath(runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY, getTimestampedResponseFilename('commit')),
    });

    // Save timestamped copy of commit message with better error handling
    await saveCommitMessage(outputDirectory, summary, storage, logger);

    // 🛡️ Universal Safety Check: Run before ANY commit operation
    // This protects both direct commits (--sendit) and automated commits (publish, etc.)
    const willCreateCommit = runConfig.commit?.sendit && hasActualChanges && cached;
    if (willCreateCommit && !runConfig.commit?.skipFileCheck && !isDryRun) {
        logger.debug('Checking for file: dependencies before commit operation...');

        try {
            const fileDependencyIssues = await checkForFileDependencies(storage, process.cwd());

            if (fileDependencyIssues.length > 0) {
                logger.error('🚫 COMMIT BLOCKED: Found file: dependencies that should not be committed!');
                logger.error('');

                logFileDependencyWarning(fileDependencyIssues, 'commit');
                logFileDependencySuggestions(true);

                logger.error('Generated commit message was:');
                logger.error('%s', summary);
                logger.error('');

                if (runConfig.commit?.sendit) {
                    logger.error('To bypass this check, use: kodrdriv commit --skip-file-check --sendit');
                } else {
                    logger.error('To bypass this check, add skipFileCheck: true to your commit configuration');
                }

                throw new ValidationError('Found file: dependencies that should not be committed. Use --skip-file-check to bypass.');
            }

            logger.debug('✅ No file: dependencies found, proceeding with commit');
        } catch (error: any) {
            logger.warn('Warning: Could not check for file: dependencies: %s', error.message);
            logger.warn('Proceeding with commit...');
        }
    } else if (runConfig.commit?.skipFileCheck && willCreateCommit) {
        logger.warn('⚠️  Skipping file: dependency check as requested');
    }

    if (runConfig.commit?.sendit) {
        if (isDryRun) {
            logger.info('Would commit with message: \n\n%s\n\n', summary);
            logger.info('Would execute: git commit -m <generated-message>');
        } else if (hasActualChanges && cached) {
            logger.info('SendIt mode enabled. Committing with message: \n\n%s\n\n', summary);
            try {
                const validatedSummary = validateString(summary, 'commit summary');
                const escapedSummary = shellescape([validatedSummary]);
                await run(`git commit -m ${escapedSummary}`);
                logger.info('Commit successful!');
            } catch (error: any) {
                logger.error('Failed to commit:', error);
                throw new ExternalDependencyError('Failed to create commit', 'git', error);
            }
        } else {
            logger.info('SendIt mode enabled, but no changes to commit. Generated message: \n\n%s\n\n', summary);
        }
    } else if (isDryRun) {
        logger.info('Generated commit message: \n\n%s\n\n', summary);
    }

    return summary;
}

export const execute = async (runConfig: Config): Promise<string> => {
    try {
        return await executeInternal(runConfig);
    } catch (error: any) {
        // Import getLogger for error handling
        const { getLogger } = await import('../logging');
        const standardLogger = getLogger();

        // For CLI usage, exit on error. For programmatic usage, throw.
        const exitOnError = true; // Always exit for CLI usage

        if (error instanceof ValidationError || error instanceof ExternalDependencyError || error instanceof CommandError) {
            standardLogger.error(`commit failed: ${error.message}`);
            if (error.cause) {
                standardLogger.debug(`Caused by: ${error.cause.message}`);
            }
            if (exitOnError) process.exit(1);
            throw error;
        }

        // Unexpected errors
        standardLogger.error(`commit encountered unexpected error: ${error.message}`);
        if (exitOnError) process.exit(1);
        throw error;
    }
};
