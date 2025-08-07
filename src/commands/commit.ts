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
import { createCompletionWithRetry, getModelForCommand } from '../util/openai';
import { DEFAULT_MAX_DIFF_BYTES } from '../constants';
import { checkForFileDependencies, logFileDependencyWarning, logFileDependencySuggestions } from '../util/safety';
import { create as createStorage } from '../util/storage';
import {
    getUserChoice,
    editContentInEditor,
    improveContentWithLLM,
    getLLMFeedbackInEditor,
    requireTTY,
    STANDARD_CHOICES,
    LLMImprovementConfig
} from '../util/interactive';



// Helper function to edit commit message using editor
async function editCommitMessageInteractively(commitMessage: string): Promise<string> {
    const templateLines = [
        '# Edit your commit message below. Lines starting with "#" will be ignored.',
        '# Save and close the editor when you are done.'
    ];

    const result = await editContentInEditor(commitMessage, templateLines, '.txt');
    return result.content;
}

// Helper function to improve commit message using LLM
async function improveCommitMessageWithLLM(
    commitMessage: string,
    runConfig: Config,
    promptConfig: any,
    promptContext: any,
    outputDirectory: string,
    diffContent: string
): Promise<string> {
    // Get user feedback on what to improve using the editor
    const userFeedback = await getLLMFeedbackInEditor('commit message', commitMessage);

    const improvementConfig: LLMImprovementConfig = {
        contentType: 'commit message',
        createImprovedPrompt: async (promptConfig, currentMessage, promptContext) => {
            const improvementPromptContent = {
                diffContent: diffContent, // Include the original diff for context
                userDirection: `Please improve this commit message based on the user's feedback: "${userFeedback}".

Current commit message: "${currentMessage}"

Please revise the commit message according to the user's feedback while maintaining accuracy and following conventional commit standards if appropriate.`,
            };
            const prompt = await CommitPrompt.createPrompt(promptConfig, improvementPromptContent, promptContext);
            // Format the prompt into a proper request with messages
            const modelToUse = getModelForCommand(runConfig, 'commit');
            return Formatter.create({ logger: getDryRunLogger(false) }).formatPrompt(modelToUse as Model, prompt);
        },
        callLLM: async (request, runConfig, outputDirectory) => {
            const modelToUse = getModelForCommand(runConfig, 'commit');
            return await createCompletionWithRetry(
                request.messages as ChatCompletionMessageParam[],
                {
                    model: modelToUse,
                    debug: runConfig.debug,
                    debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('commit-improve')),
                    debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('commit-improve')),
                }
            );
        }
    };

    return await improveContentWithLLM(
        commitMessage,
        runConfig,
        promptConfig,
        promptContext,
        outputDirectory,
        improvementConfig
    );
}

// Interactive feedback loop for commit message
async function handleInteractiveCommitFeedback(
    commitMessage: string,
    runConfig: Config,
    promptConfig: any,
    promptContext: any,
    outputDirectory: string,
    storage: any,
    diffContent: string,
    hasActualChanges: boolean,
    cached: boolean
): Promise<{ action: 'commit' | 'skip', finalMessage: string }> {
    const logger = getDryRunLogger(false);
    let currentMessage = commitMessage;

    // Determine what the confirm action will do based on configuration
    const senditEnabled = runConfig.commit?.sendit;
    const willActuallyCommit = senditEnabled && hasActualChanges && cached;

    // Create dynamic confirm choice based on configuration
    const isAmendMode = runConfig.commit?.amend;
    const confirmChoice = willActuallyCommit
        ? { key: 'c', label: isAmendMode ? 'Amend last commit with this message (sendit enabled)' : 'Commit changes with this message (sendit enabled)' }
        : { key: 'c', label: 'Accept message (you will need to commit manually)' };

    while (true) {
        // Display the current commit message
        logger.info('\n📝 Generated Commit Message:');
        logger.info('─'.repeat(50));
        logger.info(currentMessage);
        logger.info('─'.repeat(50));

        // Show configuration status
        if (senditEnabled) {
            if (willActuallyCommit) {
                logger.info('\n⚙️  SendIt mode is ACTIVE - choosing "Commit" will run git commit automatically');
            } else {
                logger.info('\n⚙️  SendIt mode is configured but no staged changes available for commit');
            }
        } else {
            logger.info('\n⚙️  SendIt mode is NOT active - choosing "Accept" will only save the message');
        }

        // Get user choice
        const userChoice = await getUserChoice(
            '\nWhat would you like to do with this commit message?',
            [
                confirmChoice,
                STANDARD_CHOICES.EDIT,
                STANDARD_CHOICES.SKIP,
                STANDARD_CHOICES.IMPROVE
            ],
            {
                nonTtyErrorSuggestions: ['Use --sendit flag to auto-commit without review']
            }
        );

        switch (userChoice) {
            case 'c':
                return { action: 'commit', finalMessage: currentMessage };

            case 'e':
                try {
                    currentMessage = await editCommitMessageInteractively(currentMessage);
                } catch (error: any) {
                    logger.error(`Failed to edit commit message: ${error.message}`);
                    // Continue the loop to show options again
                }
                break;

            case 's':
                return { action: 'skip', finalMessage: currentMessage };

            case 'i':
                try {
                    currentMessage = await improveCommitMessageWithLLM(
                        currentMessage,
                        runConfig,
                        promptConfig,
                        promptContext,
                        outputDirectory,
                        diffContent
                    );
                } catch (error: any) {
                    logger.error(`Failed to improve commit message: ${error.message}`);
                    // Continue the loop to show options again
                }
                break;

            default:
                // This shouldn't happen, but continue the loop
                break;
        }
    }
}

// Helper function to check if there are any commits in the repository
const hasCommits = async (): Promise<boolean> => {
    try {
        await run('git rev-parse HEAD');
        return true;
    } catch {
        // No commits found or not a git repository
        return false;
    }
};

// Simplified cached determination with single check
const determineCachedState = async (config: Config): Promise<boolean> => {
    // If amend is used, we use staged changes (since we're amending the last commit)
    if (config.commit?.amend) {
        // For amend mode, check that there's a previous commit to amend
        const hasAnyCommits = await hasCommits();
        if (!hasAnyCommits) {
            throw new ValidationError('Cannot use --amend: no commits found in repository. Create an initial commit first.');
        }
        return true;
    }

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

    // Track if user explicitly chose to skip in interactive mode
    let userSkippedCommit = false;

    if (runConfig.commit?.add) {
        if (isDryRun) {
            logger.info('Would add all changes to the index with: git add -A');
        } else {
            logger.info('📁 Adding all changes to the index (git add -A)...');
            await run('git add -A');
            logger.info('✅ Successfully staged all changes');
        }
    }

    // Determine cached state with single, clear logic
    const cached = await determineCachedState(runConfig);

    // Validate sendit state early - now returns boolean instead of throwing
    validateSenditState(runConfig, cached, isDryRun, logger);

    let diffContent = '';
    const maxDiffBytes = runConfig.commit?.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
    const options = {
        cached,
        excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS,
        maxDiffBytes
    };
    const diff = await Diff.create(options);
    diffContent = await diff.get();

    // Check if there are actually any changes in the diff
    let hasActualChanges = diffContent.trim().length > 0;

    // If no changes found with current patterns, check for critical excluded files
    if (!hasActualChanges) {
        const criticalChanges = await Diff.hasCriticalExcludedChanges();

        if (criticalChanges.hasChanges) {
            logger.info('No changes found with current exclusion patterns, but detected changes to critical files: %s',
                criticalChanges.files.join(', '));

            if (runConfig.commit?.sendit && !isDryRun) {
                // In sendit mode, automatically include critical files
                logger.info('SendIt mode: Including critical files in diff...');
                const minimalPatterns = Diff.getMinimalExcludedPatterns(runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS);
                const updatedOptions = { ...options, excludedPatterns: minimalPatterns };
                const updatedDiff = await Diff.create(updatedOptions);
                diffContent = await updatedDiff.get();

                if (diffContent.trim().length > 0) {
                    logger.info('Successfully included critical files in diff.');
                    // Update hasActualChanges since we now have content after including critical files
                    hasActualChanges = true;
                } else {
                    logger.warn('No changes detected even after including critical files.');
                    return 'No changes to commit.';
                }
            } else {
                // In non-sendit mode, suggest including the files
                logger.warn('Consider including these files by using:');
                logger.warn('  kodrdriv commit --excluded-paths %s',
                    (runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS)
                        .filter(p => !criticalChanges.files.some(f => p.includes(f.split('/').pop() || '')))
                        .map(p => `"${p}"`)
                        .join(' '));
                logger.warn('Or run with --sendit to automatically include critical files.');

                if (!isDryRun) {
                    return 'No changes to commit. Use suggestions above to include critical files.';
                } else {
                    logger.info('Generating commit message template for future use...');
                }
            }
        } else {
            // No changes at all
            if (runConfig.commit?.sendit && !isDryRun) {
                logger.warn('No changes detected to commit. Skipping commit operation.');
                return 'No changes to commit.';
            } else {
                logger.info('No changes detected in the working directory.');
                if (runConfig.commit?.sendit) {
                    logger.info('Skipping commit operation due to no changes.');
                    return 'No changes to commit.';
                } else {
                    logger.info('Generating commit message template for future use...');
                }
            }
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

    // Get the appropriate model for the commit command
    const modelToUse = getModelForCommand(runConfig, 'commit');

    // Use consistent model for debug (fix hardcoded model)
    if (runConfig.debug) {
        const formattedPrompt = Formatter.create({ logger }).formatPrompt(modelToUse as Model, prompt);
        logger.silly('Formatted Prompt: %s', stringifyJSON(formattedPrompt));
    }

    const request: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, prompt);

    // Always ensure output directory exists for request/response files
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    // Create retry callback that reduces diff size on token limit errors
    const createRetryCallback = (originalDiffContent: string) => async (attempt: number): Promise<ChatCompletionMessageParam[]> => {
        logger.info('Retrying with reduced diff size (attempt %d)', attempt);

        // Progressively reduce the diff size on retries
        const reductionFactor = Math.pow(0.5, attempt - 1); // 50% reduction per retry
        const reducedMaxDiffBytes = Math.max(512, Math.floor(maxDiffBytes * reductionFactor));

        logger.debug('Reducing maxDiffBytes from %d to %d for retry', maxDiffBytes, reducedMaxDiffBytes);

        // Re-truncate the diff with smaller limits
        const reducedDiffContent = originalDiffContent.length > reducedMaxDiffBytes
            ? Diff.truncateDiffByFiles(originalDiffContent, reducedMaxDiffBytes)
            : originalDiffContent;

        // Rebuild the prompt with the reduced diff
        const reducedPromptContent = {
            diffContent: reducedDiffContent,
            userDirection: runConfig.commit?.direction,
        };
        const reducedPromptContext = {
            logContext,
            context: runConfig.commit?.context,
            directories: runConfig.contextDirectories,
        };

        const retryPrompt = await CommitPrompt.createPrompt(promptConfig, reducedPromptContent, reducedPromptContext);
        const retryRequest: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, retryPrompt);

        return retryRequest.messages as ChatCompletionMessageParam[];
    };

    const summary = await createCompletionWithRetry(
        request.messages as ChatCompletionMessageParam[],
        {
            model: modelToUse,
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY, getTimestampedRequestFilename('commit')),
            debugResponseFile: getOutputPath(runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY, getTimestampedResponseFilename('commit')),
        },
        createRetryCallback(diffContent)
    );

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

    // Handle interactive mode
    if (runConfig.commit?.interactive && !isDryRun) {
        requireTTY('Interactive mode requires a terminal. Use --sendit or --dry-run instead.');

        const interactiveResult = await handleInteractiveCommitFeedback(
            summary,
            runConfig,
            promptConfig,
            promptContext,
            outputDirectory,
            storage,
            diffContent,
            hasActualChanges,
            cached
        );

        if (interactiveResult.action === 'skip') {
            logger.info('❌ Commit aborted by user');
            logger.info('💡 No commit will be performed');
            userSkippedCommit = true;
            return interactiveResult.finalMessage;
        }

        // User chose to commit - check if sendit is enabled to determine what action to take
        const senditEnabled = runConfig.commit?.sendit;
        const willActuallyCommit = senditEnabled && hasActualChanges && cached;

        if (willActuallyCommit) {
            const commitAction = runConfig.commit?.amend ? 'amending last commit' : 'committing';
            logger.info('🚀 SendIt enabled: %s with final message: \n\n%s\n\n', commitAction.charAt(0).toUpperCase() + commitAction.slice(1), interactiveResult.finalMessage);
            try {
                const validatedSummary = validateString(interactiveResult.finalMessage, 'commit summary');
                const escapedSummary = shellescape([validatedSummary]);
                const commitCommand = runConfig.commit?.amend ?
                    `git commit --amend -m ${escapedSummary}` :
                    `git commit -m ${escapedSummary}`;
                await run(commitCommand);
                logger.info('✅ Commit successful!');
            } catch (error: any) {
                logger.error('Failed to commit:', error);
                throw new ExternalDependencyError('Failed to create commit', 'git', error);
            }
        } else if (senditEnabled && (!hasActualChanges || !cached)) {
            logger.info('📝 SendIt enabled but no staged changes available. Final message saved: \n\n%s\n\n', interactiveResult.finalMessage);
            if (!hasActualChanges) {
                logger.info('💡 No changes detected to commit');
            } else if (!cached) {
                logger.info('💡 No staged changes found. Use "git add" to stage changes or configure add: true in commit settings');
            }
        } else {
            logger.info('📝 Message accepted (SendIt not enabled). Use this commit message manually: \n\n%s\n\n', interactiveResult.finalMessage);
            logger.info('💡 To automatically commit, add sendit: true to your commit configuration');
        }

        return interactiveResult.finalMessage;
    }

    // Safety check: Never commit if user explicitly skipped in interactive mode
    if (userSkippedCommit) {
        logger.debug('Skipping sendit logic because user chose to skip in interactive mode');
        return summary;
    }

    if (runConfig.commit?.sendit) {
        if (isDryRun) {
            logger.info('Would commit with message: \n\n%s\n\n', summary);
            const commitAction = runConfig.commit?.amend ? 'git commit --amend -m <generated-message>' : 'git commit -m <generated-message>';
            logger.info('Would execute: %s', commitAction);
        } else if (hasActualChanges && cached) {
            const commitAction = runConfig.commit?.amend ? 'amending commit' : 'committing';
            logger.info('SendIt mode enabled. %s with message: \n\n%s\n\n', commitAction.charAt(0).toUpperCase() + commitAction.slice(1), summary);
            try {
                const validatedSummary = validateString(summary, 'commit summary');
                const escapedSummary = shellescape([validatedSummary]);
                const commitCommand = runConfig.commit?.amend ?
                    `git commit --amend -m ${escapedSummary}` :
                    `git commit -m ${escapedSummary}`;
                await run(commitCommand);
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
    } else {
        // Default behavior when neither --interactive nor --sendit is specified
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

        if (error instanceof ValidationError || error instanceof ExternalDependencyError || error instanceof CommandError) {
            standardLogger.error(`commit failed: ${error.message}`);
            if (error.cause) {
                standardLogger.debug(`Caused by: ${error.cause.message}`);
            }
            throw error;
        }

        // Unexpected errors
        standardLogger.error(`commit encountered unexpected error: ${error.message}`);
        throw error;
    }
};
