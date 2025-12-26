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
    runAgenticRelease,
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

// Helper function to generate self-reflection output for release notes
async function generateSelfReflection(
    agenticResult: any,
    outputDirectory: string,
    storage: any,
    logger: any
): Promise<void> {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('.')[0];
        const reflectionPath = getOutputPath(outputDirectory, `agentic-reflection-release-${timestamp}.md`);

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

        sections.push('# Agentic Release Notes - Self-Reflection Report');
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
            sections.push('*No tools were called during execution.*');
            sections.push('');
        } else {
            sections.push('| Tool | Calls | Success Rate | Avg Duration | Total Time |');
            sections.push('|------|-------|--------------|--------------|------------|');

            const sortedTools = Array.from(toolStats.entries()).sort((a, b) => b[1].total - a[1].total);

            for (const [toolName, stats] of sortedTools) {
                const successRate = ((stats.success / stats.total) * 100).toFixed(1);
                const avgDuration = (stats.totalDuration / stats.total).toFixed(0);
                const totalTime = stats.totalDuration.toFixed(0);

                sections.push(`| ${toolName} | ${stats.total} | ${successRate}% | ${avgDuration}ms | ${totalTime}ms |`);
            }
            sections.push('');
        }

        // Tool usage insights
        sections.push('## Tool Usage Insights');
        sections.push('');

        if (toolStats.size > 0) {
            const mostUsedTool = Array.from(toolStats.entries()).sort((a, b) => b[1].total - a[1].total)[0];
            sections.push(`- **Most Used Tool**: \`${mostUsedTool[0]}\` (${mostUsedTool[1].total} calls)`);

            const slowestTool = Array.from(toolStats.entries()).sort((a, b) =>
                (b[1].totalDuration / b[1].total) - (a[1].totalDuration / a[1].total)
            )[0];
            const slowestAvg = (slowestTool[1].totalDuration / slowestTool[1].total).toFixed(0);
            sections.push(`- **Slowest Tool**: \`${slowestTool[0]}\` (${slowestAvg}ms average)`);

            const failedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.failures > 0);
            if (failedTools.length > 0) {
                sections.push(`- **Tools with Failures**: ${failedTools.length} tool(s) had at least one failure`);
                for (const [toolName, stats] of failedTools) {
                    sections.push(`  - \`${toolName}\`: ${stats.failures}/${stats.total} calls failed`);
                }
            } else {
                sections.push('- **Reliability**: All tool calls succeeded ✓');
            }
        }
        sections.push('');

        // Execution patterns
        sections.push('## Execution Patterns');
        sections.push('');

        const iterationsPerToolCall = agenticResult.toolCallsExecuted > 0
            ? (agenticResult.iterations / agenticResult.toolCallsExecuted).toFixed(2)
            : 'N/A';
        sections.push(`- **Iterations per Tool Call**: ${iterationsPerToolCall}`);

        const totalExecutionTime = Array.from(toolStats.values())
            .reduce((sum, stats) => sum + stats.totalDuration, 0);
        sections.push(`- **Total Tool Execution Time**: ${totalExecutionTime.toFixed(0)}ms`);

        if (agenticResult.toolCallsExecuted > 0) {
            const avgTimePerCall = (totalExecutionTime / agenticResult.toolCallsExecuted).toFixed(0);
            sections.push(`- **Average Time per Tool Call**: ${avgTimePerCall}ms`);
        }
        sections.push('');

        // Recommendations
        sections.push('## Recommendations');
        sections.push('');

        const recommendations: string[] = [];

        const failedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.failures > 0);
        if (failedTools.length > 0) {
            recommendations.push('- **Tool Reliability**: Some tools failed during execution. Review error messages and consider improving error handling or tool implementation.');
        }

        const slowTools = Array.from(toolStats.entries())
            .filter(([_, stats]) => stats.totalDuration / stats.total > 1000);
        if (slowTools.length > 0) {
            recommendations.push('- **Performance**: Consider optimizing slow tools or caching results to improve execution speed.');
        }

        if (agenticResult.iterations >= (agenticResult.maxIterations || 30)) {
            recommendations.push('- **Max Iterations Reached**: The agent reached maximum iterations. Consider increasing the limit or improving tool efficiency to allow the agent to complete naturally.');
        }

        const underutilizedTools = Array.from(toolStats.entries()).filter(([_, stats]) => stats.total === 1);
        if (underutilizedTools.length > 3) {
            recommendations.push('- **Underutilized Tools**: Many tools were called only once. Consider whether all tools are necessary or if the agent needs better guidance on when to use them.');
        }

        if (agenticResult.toolCallsExecuted === 0) {
            recommendations.push('- **No Tools Used**: The agent completed without calling any tools. This might indicate the initial prompt provided sufficient information, or the agent may benefit from more explicit guidance to use tools.');
        }

        if (recommendations.length === 0) {
            sections.push('*No specific recommendations at this time. Execution appears optimal.*');
        } else {
            for (const rec of recommendations) {
                sections.push(rec);
            }
        }
        sections.push('');

        // Add detailed execution timeline
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

        // Add conversation history
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

        // Add generated release notes
        sections.push('## Generated Release Notes');
        sections.push('');
        sections.push('### Title');
        sections.push('```');
        sections.push(agenticResult.releaseNotes.title);
        sections.push('```');
        sections.push('');
        sections.push('### Body');
        sections.push('```markdown');
        sections.push(agenticResult.releaseNotes.body);
        sections.push('```');
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
        logger.info('   • Optimize tool selection and usage patterns');
        logger.info('   • Improve agentic release notes generation');
        logger.info('');
        logger.info('═'.repeat(80));
    } catch (error: any) {
        logger.warn('Failed to generate self-reflection report: %s', error.message);
    }
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

    // Always ensure output directory exists for request/response files
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage();
    await storage.ensureDirectory(outputDirectory);

    // Check if agentic mode is enabled
    if (runConfig.release?.agentic) {
        logger.info('🤖 Using agentic mode for release notes generation');

        // Run agentic release notes generation
        const agenticResult = await runAgenticRelease({
            fromRef,
            toRef,
            logContent,
            diffContent,
            milestoneIssues: milestoneIssuesContent,
            releaseFocus: runConfig.release?.focus,
            userContext: runConfig.release?.context,
            model: aiConfig.commands?.release?.model || aiConfig.model || 'gpt-4o',
            maxIterations: runConfig.release?.maxAgenticIterations || 30,
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('release-agentic')),
            debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('release-agentic')),
            storage: aiStorageAdapter,
            logger: aiLogger,
            openaiReasoning: aiConfig.commands?.release?.reasoning || aiConfig.reasoning,
        });

        logger.info('🔍 Agentic analysis complete: %d iterations, %d tool calls',
            agenticResult.iterations, agenticResult.toolCallsExecuted);

        // Generate self-reflection output if enabled
        if (runConfig.release?.selfReflection) {
            await generateSelfReflection(agenticResult, outputDirectory, storage, logger);
        }

        // Apply stop-context filtering to release notes
        const titleFilterResult = filterContent(agenticResult.releaseNotes.title, runConfig.stopContext);
        const bodyFilterResult = filterContent(agenticResult.releaseNotes.body, runConfig.stopContext);
        let releaseSummary: ReleaseSummary = {
            title: titleFilterResult.filtered,
            body: bodyFilterResult.filtered,
        };

        // Handle interactive mode
        if (runConfig.release?.interactive && !isDryRun) {
            requireTTY('Interactive mode requires a terminal. Use --dry-run instead.');

            const interactivePromptContext: ReleaseContext = {
                context: runConfig.release?.context,
                directories: runConfig.contextDirectories,
            };

            const interactiveResult = await handleInteractiveReleaseFeedback(
                releaseSummary,
                runConfig,
                promptConfig,
                interactivePromptContext,
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

    // Non-agentic mode: use traditional prompt-based approach
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
