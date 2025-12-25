#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import type { ChatCompletionMessageParam } from 'openai/resources';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_TO_COMMIT_ALIAS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getDefaultFromRef, getCurrentBranch } from '@eldrforge/git-tools';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import { Config } from '../types';
import {
    createCompletionWithRetry,
    getUserChoice,
    editContentInEditor,
    getLLMFeedbackInEditor,
    requireTTY,
    STANDARD_CHOICES,
    createReleasePrompt,
    ReleaseContent,
    ReleaseContext,
} from '@eldrforge/ai-service';
import { improveContentWithLLM, type LLMImprovementConfig } from '../util/interactive';
import { toAIConfig } from '../util/aiAdapter';
import { createStorageAdapter } from '../util/storageAdapter';
import { createLoggerAdapter } from '../util/loggerAdapter';
import { DEFAULT_MAX_DIFF_BYTES } from '../constants';
import { getDryRunLogger } from '../logging';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedReleaseNotesFilename } from '../util/general';
import { createStorage } from '@eldrforge/shared';
import { validateReleaseSummary, type ReleaseSummary } from '../util/validation';
import { safeJsonParse } from '@eldrforge/git-tools';
import * as GitHub from '@eldrforge/github-tools';
import { filterContent } from '../util/stopContext';

// Helper function to edit release notes using editor
async function editReleaseNotesInteractively(releaseSummary: ReleaseSummary): Promise<ReleaseSummary> {
    const templateLines = [
        '# Edit your release notes below. Lines starting with "#" will be ignored.',
        '# The first line is the title, everything else is the body.',
        '# Save and close the editor when you are done.'
    ];

    const content = `${releaseSummary.title}\n\n${releaseSummary.body}`;
    const result = await editContentInEditor(content, templateLines, '.md');

    const lines = result.content.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    return { title, body };
}

// Helper function to improve release notes using LLM
async function improveReleaseNotesWithLLM(
    releaseSummary: ReleaseSummary,
    runConfig: Config,
    promptConfig: any,
    promptContext: any,
    outputDirectory: string,
    logContent: string,
    diffContent: string
): Promise<ReleaseSummary> {
    // Get user feedback on what to improve using the editor
    const releaseNotesContent = `${releaseSummary.title}\n\n${releaseSummary.body}`;
    const userFeedback = await getLLMFeedbackInEditor('release notes', releaseNotesContent);

    const improvementConfig: LLMImprovementConfig = {
        contentType: 'release notes',
        createImprovedPrompt: async (promptConfig, currentSummary, promptContext) => {
            const improvementPromptContent = {
                logContent: logContent,
                diffContent: diffContent,
                releaseFocus: `Please improve these release notes based on the user's feedback: "${userFeedback}".

Current release notes:
Title: "${currentSummary.title}"
Body: "${currentSummary.body}"

Please revise the release notes according to the user's feedback while maintaining accuracy and following good release note practices.`,
            };
            const promptResult = await createReleasePrompt(promptConfig, improvementPromptContent, promptContext);
            // Format the prompt into a proper request with messages
            const aiConfig = toAIConfig(runConfig);
            const modelToUse = aiConfig.commands?.release?.model || aiConfig.model || 'gpt-4o-mini';
            return Formatter.create({ logger: getDryRunLogger(false) }).formatPrompt(modelToUse as Model, promptResult.prompt);
        },
        callLLM: async (request, runConfig, outputDirectory) => {
            const aiConfig = toAIConfig(runConfig);
            const aiStorageAdapter = createStorageAdapter();
            const aiLogger = createLoggerAdapter(false);
            const modelToUse = aiConfig.commands?.release?.model || aiConfig.model || 'gpt-4o-mini';
            const openaiReasoning = aiConfig.commands?.release?.reasoning || aiConfig.reasoning;
            return await createCompletionWithRetry(
                request.messages as ChatCompletionMessageParam[],
                {
                    model: modelToUse,
                    openaiReasoning,
                    responseFormat: { type: 'json_object' },
                    debug: runConfig.debug,
                    debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('release-improve')),
                    debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('release-improve')),
                    storage: aiStorageAdapter,
                    logger: aiLogger,
                }
            );
        },
        processResponse: (response: any) => {
            return validateReleaseSummary(response);
        }
    };

    return await improveContentWithLLM(
        releaseSummary,
        runConfig,
        promptConfig,
        promptContext,
        outputDirectory,
        improvementConfig
    );
}

// Interactive feedback loop for release notes
async function handleInteractiveReleaseFeedback(
    releaseSummary: ReleaseSummary,
    runConfig: Config,
    promptConfig: any,
    promptContext: any,
    outputDirectory: string,
    storage: any,
    logContent: string,
    diffContent: string
): Promise<{ action: 'confirm' | 'skip', finalSummary: ReleaseSummary }> {
    const logger = getDryRunLogger(false);
    let currentSummary = releaseSummary;

    while (true) {
        // Display the current release notes
        logger.info('\nRELEASE_NOTES_GENERATED: Generated release notes from AI | Title Length: ' + currentSummary.title.length + ' | Body Length: ' + currentSummary.body.length);
        logger.info('─'.repeat(50));
        logger.info('RELEASE_NOTES_TITLE: %s', currentSummary.title);
        logger.info('');
        logger.info('RELEASE_NOTES_BODY: Release notes content:');
        logger.info(currentSummary.body);
        logger.info('─'.repeat(50));

        // Get user choice
        const userChoice = await getUserChoice(
            '\nWhat would you like to do with these release notes?',
            [
                STANDARD_CHOICES.CONFIRM,
                STANDARD_CHOICES.EDIT,
                STANDARD_CHOICES.SKIP,
                STANDARD_CHOICES.IMPROVE
            ],
            {
                nonTtyErrorSuggestions: ['Use --dry-run to see the generated content without interaction']
            }
        );

        switch (userChoice) {
            case 'c':
                return { action: 'confirm', finalSummary: currentSummary };

            case 'e':
                try {
                    currentSummary = await editReleaseNotesInteractively(currentSummary);
                } catch (error: any) {
                    logger.error(`RELEASE_NOTES_EDIT_FAILED: Unable to edit release notes | Error: ${error.message} | Impact: Using original notes`);
                    // Continue the loop to show options again
                }
                break;

            case 's':
                return { action: 'skip', finalSummary: currentSummary };

            case 'i':
                try {
                    currentSummary = await improveReleaseNotesWithLLM(
                        currentSummary,
                        runConfig,
                        promptConfig,
                        promptContext,
                        outputDirectory,
                        logContent,
                        diffContent
                    );
                } catch (error: any) {
                    logger.error(`RELEASE_NOTES_IMPROVE_FAILED: Unable to improve release notes | Error: ${error.message} | Impact: Using current version`);
                    // Continue the loop to show options again
                }
                break;

            default:
                // This shouldn't happen, but continue the loop
                break;
        }
    }
}

export const execute = async (runConfig: Config): Promise<ReleaseSummary> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    // Get current branch to help determine best tag comparison
    const currentBranch = runConfig.release?.currentBranch || await getCurrentBranch();

    // Resolve the from reference with fallback logic if not explicitly provided
    const fromRef = runConfig.release?.from ?? await getDefaultFromRef(
        runConfig.release?.fromMain || false,
        currentBranch
    );
    const toRef = runConfig.release?.to ?? DEFAULT_TO_COMMIT_ALIAS;

    logger.debug(`Using git references: from=${fromRef}, to=${toRef}`);

    const log = await Log.create({
        from: fromRef,
        to: toRef,
        limit: runConfig.release?.messageLimit
    });
    let logContent = '';

    const maxDiffBytes = runConfig.release?.maxDiffBytes ?? DEFAULT_MAX_DIFF_BYTES;
    const diff = await Diff.create({
        from: fromRef,
        to: toRef,
        excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS,
        maxDiffBytes
    });
    let diffContent = '';

    diffContent = await diff.get();
    logContent = await log.get();

    const promptConfig = {
        overridePaths: runConfig.discoveredConfigDirs || [],
        overrides: runConfig.overrides || false,
    };
    // Helper function to determine versions for milestone lookup
    const determineVersionsForMilestones = async (): Promise<string[]> => {
        const versions: string[] = [];

        // Get current package.json version to determine likely release version
        try {
            const storage = createStorage();
            const packageJsonContents = await storage.readFile('package.json', 'utf-8');
            const packageJson = safeJsonParse(packageJsonContents, 'package.json');
            const currentVersion = packageJson.version;

            if (currentVersion) {
                // If it's a dev version (e.g., "0.1.1-dev.0"), extract base version
                if (currentVersion.includes('-dev.')) {
                    const baseVersion = currentVersion.split('-')[0];
                    versions.push(baseVersion);
                    logger.debug(`Detected dev version ${currentVersion}, will check milestone for ${baseVersion}`);
                } else {
                    // Use current version as-is
                    versions.push(currentVersion);
                    logger.debug(`Using current version ${currentVersion} for milestone lookup`);
                }
            }
        } catch (error: any) {
            logger.debug(`Failed to read package.json version: ${error.message}`);
        }

        // Handle edge case: if publish targetVersion is different from current version
        if (runConfig.publish?.targetVersion &&
            runConfig.publish.targetVersion !== 'patch' &&
            runConfig.publish.targetVersion !== 'minor' &&
            runConfig.publish.targetVersion !== 'major') {

            const targetVersion = runConfig.publish.targetVersion;
            if (!versions.includes(targetVersion)) {
                versions.push(targetVersion);
                logger.debug(`Added target version ${targetVersion} for milestone lookup`);
            }
        }

        return versions;
    };

    // Get milestone issues if enabled
    let milestoneIssuesContent = '';
    const milestonesEnabled = !runConfig.release?.noMilestones;

    if (milestonesEnabled) {
        logger.info('RELEASE_MILESTONE_CHECK: Checking for milestone issues | Purpose: Include in release notes | Source: GitHub milestones');
        const versions = await determineVersionsForMilestones();

        if (versions.length > 0) {
            milestoneIssuesContent = await GitHub.getMilestoneIssuesForRelease(versions, 50000);
            if (milestoneIssuesContent) {
                logger.info('RELEASE_MILESTONE_INCLUDED: Incorporated milestone issues into context | Count: ' + (milestoneIssuesContent?.length || 0) + ' | Purpose: Enrich release notes');
            } else {
                logger.debug('No milestone issues found to incorporate');
            }
        } else {
            logger.debug('No versions determined for milestone lookup');
        }
    } else {
        logger.debug('Milestone integration disabled via --no-milestones');
    }

    // Create adapters for ai-service
    const aiConfig = toAIConfig(runConfig);
    const aiStorageAdapter = createStorageAdapter();
    const aiLogger = createLoggerAdapter(isDryRun);

    const promptContent: ReleaseContent = {
        logContent,
        diffContent,
        releaseFocus: runConfig.release?.focus,
        milestoneIssues: milestoneIssuesContent,
    };
    const promptContext: ReleaseContext = {
        context: runConfig.release?.context,
        directories: runConfig.contextDirectories,
    };

    const promptResult = await createReleasePrompt(promptConfig, promptContent, promptContext);

    const modelToUse = aiConfig.commands?.release?.model || aiConfig.model || 'gpt-4o-mini';
    const request: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, promptResult.prompt);

    // Always ensure output directory exists for request/response files
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage();
    await storage.ensureDirectory(outputDirectory);

    logger.debug('Release analysis: isLargeRelease=%s, maxTokens=%d', promptResult.isLargeRelease, promptResult.maxTokens);

    // Create retry callback that reduces diff size on token limit errors
    const createRetryCallback = (originalDiffContent: string, originalLogContent: string) => async (attempt: number): Promise<ChatCompletionMessageParam[]> => {
        logger.info('RELEASE_RETRY: Retrying with reduced diff size | Attempt: %d | Strategy: Truncate diff | Reason: Previous attempt failed', attempt);

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
            logContent: originalLogContent,
            diffContent: reducedDiffContent,
            releaseFocus: runConfig.release?.focus,
            milestoneIssues: milestoneIssuesContent,
        };
        const reducedPromptContext = {
            context: runConfig.release?.context,
            directories: runConfig.contextDirectories,
        };

        const retryPromptResult = await createReleasePrompt(promptConfig, reducedPromptContent, reducedPromptContext);
        const retryRequest: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, retryPromptResult.prompt);

        return retryRequest.messages as ChatCompletionMessageParam[];
    };

    const summary = await createCompletionWithRetry(
        request.messages as ChatCompletionMessageParam[],
        {
            model: modelToUse,
            openaiReasoning: aiConfig.commands?.release?.reasoning || aiConfig.reasoning,
            maxTokens: promptResult.maxTokens, // Use calculated maxTokens for large release detection
            responseFormat: { type: 'json_object' },
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('release')),
            debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('release')),
            storage: aiStorageAdapter,
            logger: aiLogger,
        },
        createRetryCallback(diffContent, logContent)
    );

    // Validate and safely cast the response
    const rawReleaseSummary = validateReleaseSummary(summary);

    // Apply stop-context filtering to release notes
    const titleFilterResult = filterContent(rawReleaseSummary.title, runConfig.stopContext);
    const bodyFilterResult = filterContent(rawReleaseSummary.body, runConfig.stopContext);
    let releaseSummary: ReleaseSummary = {
        title: titleFilterResult.filtered,
        body: bodyFilterResult.filtered,
    };

    // Handle interactive mode
    if (runConfig.release?.interactive && !isDryRun) {
        requireTTY('Interactive mode requires a terminal. Use --dry-run instead.');

        const interactiveResult = await handleInteractiveReleaseFeedback(
            releaseSummary,
            runConfig,
            promptConfig,
            promptContext,
            outputDirectory,
            storage,
            logContent,
            diffContent
        );

        if (interactiveResult.action === 'skip') {
            logger.info('RELEASE_ABORTED: Release notes generation aborted by user | Reason: User choice | Status: cancelled');
        } else {
            logger.info('RELEASE_FINALIZED: Release notes finalized and accepted | Status: ready | Next: Create release or save');
        }

        releaseSummary = interactiveResult.finalSummary;
    }

    // Save timestamped copy of release notes to output directory
    try {
        const timestampedFilename = getTimestampedReleaseNotesFilename();
        const outputPath = getOutputPath(outputDirectory, timestampedFilename);

        // Format the release notes as markdown
        const releaseNotesContent = `# ${releaseSummary.title}\n\n${releaseSummary.body}`;

        await storage.writeFile(outputPath, releaseNotesContent, 'utf-8');
        logger.debug('Saved timestamped release notes: %s', outputPath);
    } catch (error: any) {
        logger.warn('RELEASE_SAVE_FAILED: Failed to save timestamped release notes | Error: %s | Impact: Notes not persisted to file', error.message);
    }

    if (isDryRun) {
        logger.info('RELEASE_SUMMARY_COMPLETE: Generated release summary successfully | Status: completed');
        logger.info('RELEASE_SUMMARY_TITLE: %s', releaseSummary.title);
        logger.info('RELEASE_SUMMARY_BODY: %s', releaseSummary.body);
    }

    return releaseSummary;
}
