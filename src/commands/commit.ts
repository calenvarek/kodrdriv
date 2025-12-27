#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import type { ChatCompletionMessageParam } from 'openai/resources';
import shellescape from 'shell-escape';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Diff from '../content/diff';
import * as Log from '../content/log';
import * as Files from '../content/files';
import { CommandError, ValidationError, ExternalDependencyError } from '@eldrforge/shared';
import { getDryRunLogger } from '../logging';
import { Config } from '../types';
import { run, validateString } from '@eldrforge/git-tools';
import { sanitizeDirection } from '../util/validation';
import { filterContent } from '../util/stopContext';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedCommitFilename } from '../util/general';
import { DEFAULT_MAX_DIFF_BYTES } from '../constants';
import { stringifyJSON, checkForFileDependencies, logFileDependencyWarning, logFileDependencySuggestions, createStorage } from '@eldrforge/shared';
import { getRecentClosedIssuesForCommit } from '@eldrforge/github-tools';
import { safeJsonParse, validatePackageJson } from '@eldrforge/git-tools';
import {
    createCompletionWithRetry,
    getUserChoice,
    editContentInEditor,
    getLLMFeedbackInEditor,
    requireTTY,
    STANDARD_CHOICES,
    createCommitPrompt,
    CommitContent,
    CommitContext,
    runAgenticCommit,
} from '@eldrforge/ai-service';
import { improveContentWithLLM, type LLMImprovementConfig } from '../util/interactive';
import { toAIConfig } from '../util/aiAdapter';
import { createStorageAdapter } from '../util/storageAdapter';
import { createLoggerAdapter } from '../util/loggerAdapter';

// Helper function to generate self-reflection output
async function generateSelfReflection(
    agenticResult: any,
    outputDirectory: string,
    storage: any,
    logger: any
): Promise<void> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
        const reflectionPath = getOutputPath(outputDirectory, `agentic-reflection-commit-${timestamp}.md`);

        // Calculate tool effectiveness metrics
        const toolMetrics = agenticResult.toolMetrics || [];
        const toolStats = new Map<string, { total: number; success: number; failures: number; totalDuration: number }>();

        for (const metric of toolMetrics) {
            if (!toolStats.has(metric.name)) {
                toolStats.set(metric.name, { total: 0, success: 0, failures: 0, totalDuration: 0 });
            }
            const stats = toolStats.get(metric.name)!;
            stats.total++;
            stats.totalDuration += metric.duration;
            if (metric.success) {
                stats.success++;
            } else {
                stats.failures++;
            }
        }

        // Build reflection document
        const sections: string[] = [];

        sections.push('# Agentic Commit - Self-Reflection Report');
        sections.push('');
        sections.push(`Generated: ${new Date().toISOString()}`);
        sections.push('');

        sections.push('## Execution Summary');
        sections.push('');
        sections.push(`- **Iterations**: ${agenticResult.iterations}`);
        sections.push(`- **Tool Calls**: ${agenticResult.toolCallsExecuted}`);
        sections.push(`- **Unique Tools Used**: ${toolStats.size}`);
        sections.push('');

        sections.push('## Tool Effectiveness Analysis');
        sections.push('');

        if (toolStats.size === 0) {
            sections.push('*No tools were executed during this run.*');
        } else {
            sections.push('| Tool | Calls | Success | Failures | Success Rate | Avg Duration |');
            sections.push('|------|-------|---------|----------|--------------|--------------|');

            for (const [toolName, stats] of Array.from(toolStats.entries()).sort((a, b) => b[1].total - a[1].total)) {
                const successRate = ((stats.success / stats.total) * 100).toFixed(1);
                const avgDuration = (stats.totalDuration / stats.total).toFixed(0);
                sections.push(`| ${toolName} | ${stats.total} | ${stats.success} | ${stats.failures} | ${successRate}% | ${avgDuration}ms |`);
            }

            sections.push('');
            sections.push('### Tool Performance Insights');
            sections.push('');

            // Identify problematic tools
            const failedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.failures > 0);
            if (failedTools.length > 0) {
                sections.push('**Tools with Failures:**');
                for (const [toolName, stats] of failedTools) {
                    const failureRate = ((stats.failures / stats.total) * 100).toFixed(1);
                    sections.push(`- ${toolName}: ${stats.failures}/${stats.total} failures (${failureRate}%)`);
                }
                sections.push('');
            }

            // Identify slow tools
            const slowTools = Array.from(toolStats.entries())
                .filter(([_, stats]) => stats.totalDuration / stats.total > 1000)
                .sort((a, b) => (b[1].totalDuration / b[1].total) - (a[1].totalDuration / a[1].total));

            if (slowTools.length > 0) {
                sections.push('**Slow Tools (>1s average):**');
                for (const [toolName, stats] of slowTools) {
                    const avgDuration = (stats.totalDuration / stats.total / 1000).toFixed(2);
                    sections.push(`- ${toolName}: ${avgDuration}s average`);
                }
                sections.push('');
            }

            // Identify most useful tools
            sections.push('**Most Frequently Used:**');
            const topTools = Array.from(toolStats.entries()).slice(0, 3);
            for (const [toolName, stats] of topTools) {
                sections.push(`- ${toolName}: ${stats.total} calls`);
            }
            sections.push('');
        }

        sections.push('## Detailed Execution Timeline');
        sections.push('');

        if (toolMetrics.length === 0) {
            sections.push('*No tool execution timeline available.*');
        } else {
            sections.push('| Time | Iteration | Tool | Result | Duration |');
            sections.push('|------|-----------|------|--------|----------|');

            for (const metric of toolMetrics) {
                const time = new Date(metric.timestamp).toLocaleTimeString();
                const result = metric.success ? '✅ Success' : `❌ ${metric.error || 'Failed'}`;
                sections.push(`| ${time} | ${metric.iteration} | ${metric.name} | ${result} | ${metric.duration}ms |`);
            }
            sections.push('');
        }

        sections.push('## Conversation History');
        sections.push('');
        sections.push('<details>');
        sections.push('<summary>Click to expand full agentic interaction</summary>');
        sections.push('');
        sections.push('```json');
        sections.push(JSON.stringify(agenticResult.conversationHistory, null, 2));
        sections.push('```');
        sections.push('');
        sections.push('</details>');
        sections.push('');

        sections.push('## Generated Commit Message');
        sections.push('');
        sections.push('```');
        sections.push(agenticResult.commitMessage);
        sections.push('```');
        sections.push('');

        if (agenticResult.suggestedSplits && agenticResult.suggestedSplits.length > 1) {
            sections.push('## Suggested Commit Splits');
            sections.push('');
            for (let i = 0; i < agenticResult.suggestedSplits.length; i++) {
                const split = agenticResult.suggestedSplits[i];
                sections.push(`### Split ${i + 1}`);
                sections.push('');
                sections.push(`**Files**: ${split.files.join(', ')}`);
                sections.push('');
                sections.push(`**Rationale**: ${split.rationale}`);
                sections.push('');
                sections.push(`**Message**:`);
                sections.push('```');
                sections.push(split.message);
                sections.push('```');
                sections.push('');
            }
        }

        sections.push('## Recommendations for Improvement');
        sections.push('');

        // Generate recommendations based on metrics
        const recommendations: string[] = [];

        // Recalculate failed tools for recommendations
        const toolsWithFailures = Array.from(toolStats.entries()).filter(([_, stats]) => stats.failures > 0);
        if (toolsWithFailures.length > 0) {
            recommendations.push('- **Tool Failures**: Investigate and fix tools that are failing. This may indicate issues with error handling or tool implementation.');
        }

        // Recalculate slow tools for recommendations
        const slowToolsForRecs = Array.from(toolStats.entries())
            .filter(([_, stats]) => stats.totalDuration / stats.total > 1000);
        if (slowToolsForRecs.length > 0) {
            recommendations.push('- **Performance**: Consider optimizing slow tools or caching results to improve execution speed.');
        }

        if (agenticResult.iterations >= (agenticResult.maxIterations || 10)) {
            recommendations.push('- **Max Iterations Reached**: The agent reached maximum iterations. Consider increasing the limit or improving tool efficiency to allow the agent to complete naturally.');
        }

        const underutilizedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.total === 1);
        if (underutilizedTools.length > 3) {
            recommendations.push('- **Underutilized Tools**: Many tools were called only once. Consider whether all tools are necessary or if the agent needs better guidance on when to use them.');
        }

        if (recommendations.length === 0) {
            sections.push('*No specific recommendations at this time. Execution appears optimal.*');
        } else {
            for (const rec of recommendations) {
                sections.push(rec);
            }
        }
        sections.push('');

        // Write the reflection file
        const reflectionContent = sections.join('\n');
        await storage.writeFile(reflectionPath, reflectionContent, 'utf-8');

        logger.info('');
        logger.info('═'.repeat(80));
        logger.info('📊 SELF-REFLECTION REPORT GENERATED');
        logger.info('═'.repeat(80));
        logger.info('');
        logger.info('📁 Location: %s', reflectionPath);
        logger.info('');
        logger.info('📈 Report Summary:');
        logger.info('   • %d iterations completed', agenticResult.iterations);
        logger.info('   • %d tool calls executed', agenticResult.toolCallsExecuted);
        logger.info('   • %d unique tools used', toolStats.size);
        logger.info('');
        logger.info('💡 Use this report to:');
        logger.info('   • Understand which tools were most effective');
        logger.info('   • Identify performance bottlenecks');
        logger.info('   • Review the complete agentic conversation');
        logger.info('   • Improve tool implementation based on metrics');
        logger.info('');
        logger.info('═'.repeat(80));

    } catch (error: any) {
        logger.warn('Failed to generate self-reflection output: %s', error.message);
        logger.debug('Self-reflection error details:', error);
    }
}

// Helper function to get current version from package.json
async function getCurrentVersion(storage: any): Promise<string | undefined> {
    try {
        const packageJsonContents = await storage.readFile('package.json', 'utf-8');
        const packageJson = safeJsonParse(packageJsonContents, 'package.json');
        const validated = validatePackageJson(packageJson, 'package.json');
        return validated.version;
    } catch {
        // Return undefined if we can't read the version (not a critical failure)
        return undefined;
    }
}

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

    // Create AI config from kodrdriv config
    const aiConfig = toAIConfig(runConfig);
    const aiStorageAdapter = createStorageAdapter();
    const aiLogger = createLoggerAdapter(false);

    const improvementConfig: LLMImprovementConfig = {
        contentType: 'commit message',
        createImprovedPrompt: async (promptConfig, currentMessage, promptContext) => {
            const improvementPromptContent: CommitContent = {
                diffContent: diffContent, // Include the original diff for context
                userDirection: `Please improve this commit message based on the user's feedback: "${userFeedback}".

Current commit message: "${currentMessage}"

Please revise the commit message according to the user's feedback while maintaining accuracy and following conventional commit standards if appropriate.`,
            };
            const prompt = await createCommitPrompt(promptConfig, improvementPromptContent, promptContext);
            // Format the prompt into a proper request with messages
            const modelToUse = aiConfig.commands?.commit?.model || aiConfig.model || 'gpt-4o-mini';
            return Formatter.create({ logger: getDryRunLogger(false) }).formatPrompt(modelToUse as Model, prompt);
        },
        callLLM: async (request, runConfig, outputDirectory) => {
            return await createCompletionWithRetry(
                request.messages as ChatCompletionMessageParam[],
                {
                    model: aiConfig.commands?.commit?.model || aiConfig.model,
                    openaiReasoning: aiConfig.commands?.commit?.reasoning || aiConfig.reasoning,
                    debug: runConfig.debug,
                    debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('commit-improve')),
                    debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('commit-improve')),
                    storage: aiStorageAdapter,
                    logger: aiLogger,
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
                logger.info('\nSENDIT_MODE_ACTIVE: SendIt mode enabled | Action: Commit choice will execute git commit automatically | Staged Changes: Available');
            } else {
                logger.info('\nSENDIT_MODE_NO_CHANGES: SendIt mode configured but no staged changes | Action: Only message save available | Staged Changes: None');
            }
        } else {
            logger.info('\nSENDIT_MODE_INACTIVE: SendIt mode not active | Action: Accept choice will only save message | Commit: Manual');
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

// Helper function to push the commit
const pushCommit = async (pushConfig: boolean | string | undefined, logger: any, isDryRun: boolean): Promise<void> => {
    if (!pushConfig) {
        return; // No push requested
    }

    // Determine the remote to push to
    let remote = 'origin';
    if (typeof pushConfig === 'string') {
        remote = pushConfig;
    }

    const pushCommand = `git push ${remote}`;

    if (isDryRun) {
        logger.info('Would push to %s with: %s', remote, pushCommand);
    } else {
        logger.info('🚀 Pushing to %s...', remote);
        try {
            await run(pushCommand);
            logger.info('✅ Push successful!');
        } catch (error: any) {
            logger.error('Failed to push to %s: %s', remote, error.message);
            throw new ExternalDependencyError(`Failed to push to ${remote}`, 'git', error);
        }
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
            logger.info('COMMIT_MESSAGE_SAVED_FALLBACK: Saved commit message to fallback location | Path: %s | Purpose: Preserve message for later use', outputRootPath);
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
            logger.info('GIT_ADD_DRY_RUN: Would stage all changes | Mode: dry-run | Command: git add -A');
        } else {
            logger.info('GIT_ADD_STAGING: Adding all changes to index | Command: git add -A | Scope: all files | Purpose: Stage for commit');
            await run('git add -A');
            logger.info('GIT_ADD_SUCCESS: Successfully staged all changes | Command: git add -A | Status: completed');
        }
    }

    // Determine cached state with single, clear logic
    const cached = await determineCachedState(runConfig);

    // Validate sendit state early - now returns boolean instead of throwing
    validateSenditState(runConfig, cached, isDryRun, logger);

    let diffContent = '';
    let isUsingFileContent = false;
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
            logger.info('CRITICAL_FILES_DETECTED: No changes with exclusion patterns, but critical files modified | Files: %s | Action: May need to include critical files',
                criticalChanges.files.join(', '));

            if (runConfig.commit?.sendit && !isDryRun) {
                // In sendit mode, automatically include critical files
                logger.info('SENDIT_INCLUDING_CRITICAL: SendIt mode including critical files in diff | Purpose: Ensure all important changes are captured');
                const minimalPatterns = Diff.getMinimalExcludedPatterns(runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS);
                const updatedOptions = { ...options, excludedPatterns: minimalPatterns };
                const updatedDiff = await Diff.create(updatedOptions);
                diffContent = await updatedDiff.get();

                if (diffContent.trim().length > 0) {
                    logger.info('CRITICAL_FILES_INCLUDED: Successfully added critical files to diff | Status: ready for commit message generation');
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
            // No changes at all - try fallback to file content for new repositories
            logger.info('NO_CHANGES_DETECTED: No changes found in working directory | Status: clean | Action: Nothing to commit');

            if (runConfig.commit?.sendit && !isDryRun) {
                logger.warn('No changes detected to commit. Skipping commit operation.');
                return 'No changes to commit.';
            } else {
                logger.info('NO_DIFF_FALLBACK: No diff content available | Action: Attempting to generate commit message from file content | Strategy: fallback');

                // Create file content collector as fallback
                const fileOptions = {
                    excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS,
                    maxTotalBytes: maxDiffBytes * 5, // Allow more content since we're not looking at diffs
                    workingDirectory: process.cwd()
                };
                const files = await Files.create(fileOptions);
                const fileContent = await files.get();

                if (fileContent && fileContent.trim().length > 0) {
                    logger.info('FILE_CONTENT_USING: Using file content for commit message generation | Content Length: %d characters | Source: file content', fileContent.length);
                    diffContent = fileContent;
                    isUsingFileContent = true;
                    hasActualChanges = true; // We have content to work with
                } else {
                    if (runConfig.commit?.sendit) {
                        logger.info('COMMIT_SKIPPED: Skipping commit operation | Reason: No changes detected | Action: None');
                        return 'No changes to commit.';
                    } else {
                        logger.info('COMMIT_TEMPLATE_GENERATING: Creating commit message template for future use | Reason: No changes | Purpose: Provide template');
                    }
                }
            }
        }
    }

    const logOptions = {
        limit: runConfig.commit?.messageLimit,
    };
    const log = await Log.create(logOptions);
    const logContext = await log.get();

    // Always ensure output directory exists for request/response files and GitHub issues lookup
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage();
    await storage.ensureDirectory(outputDirectory);

    // Get GitHub issues context for large commits [[memory:5887795]]
    let githubIssuesContext = '';
    try {
        const currentVersion = await getCurrentVersion(storage);
        if (currentVersion) {
            logger.debug(`Found current version: ${currentVersion}, fetching related GitHub issues...`);
            githubIssuesContext = await getRecentClosedIssuesForCommit(currentVersion, 10);
            if (githubIssuesContext) {
                logger.debug(`Fetched GitHub issues context (${githubIssuesContext.length} characters)`);
            } else {
                logger.debug('No relevant GitHub issues found for commit context');
            }
        } else {
            logger.debug('Could not determine current version, fetching recent issues without milestone filtering...');
            githubIssuesContext = await getRecentClosedIssuesForCommit(undefined, 10);
            if (githubIssuesContext) {
                logger.debug(`Fetched general GitHub issues context (${githubIssuesContext.length} characters)`);
            }
        }
    } catch (error: any) {
        logger.debug(`Failed to fetch GitHub issues for commit context: ${error.message}`);
        // Continue without GitHub context - this shouldn't block commit generation
    }

    const promptConfig = {
        overridePaths: runConfig.discoveredConfigDirs || [],
        overrides: runConfig.overrides || false,
    };
    const userDirection = sanitizeDirection(runConfig.commit?.direction);
    if (userDirection) {
        logger.debug('Using user direction: %s', userDirection);
    }

    // Create adapters for ai-service
    const aiConfig = toAIConfig(runConfig);
    const aiStorageAdapter = createStorageAdapter();
    const aiLogger = createLoggerAdapter(isDryRun);

    // Define promptContext for use in both agentic and traditional modes
    const promptContent: CommitContent = {
        diffContent,
        userDirection,
        isFileContent: isUsingFileContent,
        githubIssuesContext,
    };
    const promptContext: CommitContext = {
        logContext,
        context: runConfig.commit?.context,
        directories: runConfig.contextDirectories,
    };

    let rawSummary: string;

    // Check if agentic mode is enabled
    if (runConfig.commit?.agentic) {
        logger.info('🤖 Using agentic mode for commit message generation');

        // Announce self-reflection if enabled
        if (runConfig.commit?.selfReflection) {
            logger.info('📊 Self-reflection enabled - detailed analysis will be generated');
        }

        // Get list of changed files
        const changedFilesResult = await run(`git diff --name-only ${cached ? '--cached' : ''}`);
        const changedFilesOutput = typeof changedFilesResult === 'string' ? changedFilesResult : changedFilesResult.stdout;
        const changedFiles = changedFilesOutput.split('\n').filter((f: string) => f.trim().length > 0);

        logger.debug('Changed files for agentic analysis: %d files', changedFiles.length);

        // Run agentic commit generation
        const agenticResult = await runAgenticCommit({
            changedFiles,
            diffContent,
            userDirection,
            logContext,
            model: aiConfig.commands?.commit?.model || aiConfig.model,
            maxIterations: runConfig.commit?.maxAgenticIterations || 10,
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('commit-agentic')),
            debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('commit-agentic')),
            storage: aiStorageAdapter,
            logger: aiLogger,
            openaiReasoning: aiConfig.commands?.commit?.reasoning || aiConfig.reasoning,
        });

        logger.info('🔍 Agentic analysis complete: %d iterations, %d tool calls',
            agenticResult.iterations, agenticResult.toolCallsExecuted);

        // Generate self-reflection output if enabled
        if (runConfig.commit?.selfReflection) {
            await generateSelfReflection(agenticResult, outputDirectory, storage, logger);
        }

        // Check for suggested splits
        if (agenticResult.suggestedSplits.length > 1 && runConfig.commit?.allowCommitSplitting) {
            logger.info('\n📋 Agent suggests splitting this into %d commits:', agenticResult.suggestedSplits.length);

            for (let i = 0; i < agenticResult.suggestedSplits.length; i++) {
                const split = agenticResult.suggestedSplits[i];
                logger.info('\nCommit %d (%d files):', i + 1, split.files.length);
                logger.info('  Files: %s', split.files.join(', '));
                logger.info('  Rationale: %s', split.rationale);
                logger.info('  Message: %s', split.message);
            }

            logger.info('\n⚠️  Commit splitting is not yet automated. Please stage and commit files separately.');
            logger.info('Using combined message for now...\n');
        } else if (agenticResult.suggestedSplits.length > 1) {
            logger.debug('Agent suggested %d splits but commit splitting is not enabled', agenticResult.suggestedSplits.length);
        }

        rawSummary = agenticResult.commitMessage;
    } else {
        // Traditional single-shot approach
        const prompt = await createCommitPrompt(promptConfig, promptContent, promptContext);

        // Get the appropriate model for the commit command
        const modelToUse = aiConfig.commands?.commit?.model || aiConfig.model || 'gpt-4o-mini';

        // Use consistent model for debug (fix hardcoded model)
        if (runConfig.debug) {
            const formattedPrompt = Formatter.create({ logger }).formatPrompt(modelToUse as Model, prompt);
            logger.silly('Formatted Prompt: %s', stringifyJSON(formattedPrompt));
        }

        const request: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, prompt);

        // Create retry callback that reduces diff size on token limit errors
        const createRetryCallback = (originalDiffContent: string) => async (attempt: number): Promise<ChatCompletionMessageParam[]> => {
            logger.info('COMMIT_RETRY: Retrying with reduced diff size | Attempt: %d | Strategy: Truncate diff | Reason: Previous attempt failed', attempt);

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
                userDirection,
            };
            const reducedPromptContext = {
                logContext,
                context: runConfig.commit?.context,
                directories: runConfig.contextDirectories,
            };

            const retryPrompt = await createCommitPrompt(promptConfig, reducedPromptContent, reducedPromptContext);
            const retryRequest: Request = Formatter.create({ logger }).formatPrompt(modelToUse as Model, retryPrompt);

            return retryRequest.messages as ChatCompletionMessageParam[];
        };

        rawSummary = await createCompletionWithRetry(
            request.messages as ChatCompletionMessageParam[],
            {
                model: modelToUse,
                openaiReasoning: aiConfig.commands?.commit?.reasoning || aiConfig.reasoning,
                debug: runConfig.debug,
                debugRequestFile: getOutputPath(runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY, getTimestampedRequestFilename('commit')),
                debugResponseFile: getOutputPath(runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY, getTimestampedResponseFilename('commit')),
                storage: aiStorageAdapter,
                logger: aiLogger,
            },
            createRetryCallback(diffContent)
        );
    }

    // Apply stop-context filtering to commit message
    const filterResult = filterContent(rawSummary, runConfig.stopContext);
    const summary = filterResult.filtered;

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
            logger.info('COMMIT_ABORTED: User aborted commit operation | Reason: User choice | Action: No commit performed');
            logger.info('COMMIT_NO_ACTION: No commit will be performed | Status: aborted | Next: User can retry or modify changes');
            userSkippedCommit = true;
            return interactiveResult.finalMessage;
        }

        // User chose to commit - check if sendit is enabled to determine what action to take
        const senditEnabled = runConfig.commit?.sendit;
        const willActuallyCommit = senditEnabled && hasActualChanges && cached;

        if (willActuallyCommit) {
            const commitAction = runConfig.commit?.amend ? 'amending last commit' : 'committing';
            logger.info('SENDIT_EXECUTING: SendIt enabled, executing commit action | Action: %s | Message Length: %d | Final Message: \n\n%s\n\n', commitAction.charAt(0).toUpperCase() + commitAction.slice(1), interactiveResult.finalMessage.length, interactiveResult.finalMessage);
            try {
                const validatedSummary = validateString(interactiveResult.finalMessage, 'commit summary');
                const escapedSummary = shellescape([validatedSummary]);
                const commitCommand = runConfig.commit?.amend ?
                    `git commit --amend -m ${escapedSummary}` :
                    `git commit -m ${escapedSummary}`;
                await run(commitCommand);
                logger.info('COMMIT_SUCCESS: Commit operation completed successfully | Status: committed | Action: Changes saved to repository');

                // Push if requested
                await pushCommit(runConfig.commit?.push, logger, isDryRun);
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

            // Show push command in dry run if requested
            if (runConfig.commit?.push) {
                const remote = typeof runConfig.commit.push === 'string' ? runConfig.commit.push : 'origin';
                logger.info('Would push to %s with: git push %s', remote, remote);
            }
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

                // Push if requested
                await pushCommit(runConfig.commit?.push, logger, isDryRun);
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
            if (error.cause && typeof error.cause === 'object' && 'message' in error.cause) {
                standardLogger.debug(`Caused by: ${(error.cause as Error).message}`);
            } else if (error.cause) {
                standardLogger.debug(`Caused by: ${error.cause}`);
            }
            throw error;
        }

        // Unexpected errors
        standardLogger.error(`commit encountered unexpected error: ${error.message}`);
        throw error;
    }
};
