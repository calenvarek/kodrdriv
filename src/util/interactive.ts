#!/usr/bin/env node
/**
 * Kodrdriv-specific interactive utilities
 *
 * This module contains application-specific interactive workflows that build on
 * top of the generic interactive functions from @eldrforge/ai-service.
 *
 * Re-exports from ai-service for convenience, plus kodrdriv-specific functions.
 */

import { getDryRunLogger } from '../logging';

// Re-export everything from ai-service for backwards compatibility
export {
    getUserChoice,
    getUserTextInput,
    editContentInEditor,
    getLLMFeedbackInEditor,
    requireTTY,
    SecureTempFile,
    createSecureTempFile,
    cleanupTempFile,
    STANDARD_CHOICES,
    type Choice,
    type InteractiveOptions,
    type EditorResult,
} from '@eldrforge/ai-service';

// Kodrdriv-specific types and functions below

export interface LLMImprovementConfig {
    /** The type of content being improved (for filenames and logging) */
    contentType: string;
    /** Function that creates a prompt for improvement */
    createImprovedPrompt: (
        promptConfig: any,
        improvementContent: any,
        promptContext: any
    ) => Promise<any>;
    /** Function that calls LLM with the improved prompt */
    callLLM: (
        request: any,
        runConfig: any,
        outputDirectory: string
    ) => Promise<any>;
    /** Function that validates/processes the LLM response */
    processResponse?: (response: any) => any;
}

/**
 * Generic LLM improvement function that can be configured for different content types
 *
 * This is kodrdriv-specific orchestration logic that combines multiple ai-service
 * primitives into a higher-level workflow.
 *
 * @param currentContent The current content to improve
 * @param runConfig Runtime configuration
 * @param promptConfig Prompt configuration
 * @param promptContext Prompt context
 * @param outputDirectory Output directory for debug files
 * @param improvementConfig Configuration for this specific improvement type
 * @returns Promise resolving to the improved content
 */
export async function improveContentWithLLM<T>(
    currentContent: T,
    runConfig: any,
    promptConfig: any,
    promptContext: any,
    outputDirectory: string,
    improvementConfig: LLMImprovementConfig
): Promise<T> {
    const logger = getDryRunLogger(false);

    logger.info(`INTERACTIVE_LLM_IMPROVING: Requesting LLM to improve content | Content Type: ${improvementConfig.contentType} | Service: AI | Purpose: Enhance quality`);

    // Create the improved prompt using the provided function
    const improvedPromptResult = await improvementConfig.createImprovedPrompt(
        promptConfig,
        currentContent,
        promptContext
    );

    // Call the LLM with the improved prompt
    const improvedResponse = await improvementConfig.callLLM(improvedPromptResult, runConfig, outputDirectory);

    // Process the response if a processor is provided
    const finalResult = improvementConfig.processResponse
        ? improvementConfig.processResponse(improvedResponse)
        : improvedResponse;

    logger.info(`INTERACTIVE_LLM_IMPROVED: LLM provided improved content | Content Type: ${improvementConfig.contentType} | Status: enhanced`);
    return finalResult;
}
