#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_FROM_COMMIT_ALIAS, DEFAULT_TO_COMMIT_ALIAS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import * as ReleasePrompt from '../prompt/release';
import { Config } from '../types';
import { createCompletion } from '../util/openai';
import { getDryRunLogger } from '../logging';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedReleaseNotesFilename } from '../util/general';
import { create as createStorage } from '../util/storage';
import { validateReleaseSummary, type ReleaseSummary } from '../util/validation';

export const execute = async (runConfig: Config): Promise<ReleaseSummary> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    const log = await Log.create({
        from: runConfig.release?.from ?? DEFAULT_FROM_COMMIT_ALIAS,
        to: runConfig.release?.to ?? DEFAULT_TO_COMMIT_ALIAS,
        limit: runConfig.release?.messageLimit
    });
    let logContent = '';

    const diff = await Diff.create({ from: runConfig.release?.from ?? DEFAULT_FROM_COMMIT_ALIAS, to: runConfig.release?.to ?? DEFAULT_TO_COMMIT_ALIAS, excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS });
    let diffContent = '';

    diffContent = await diff.get();
    logContent = await log.get();

    const promptConfig = {
        overridePaths: runConfig.discoveredConfigDirs || [],
        overrides: runConfig.overrides || false,
    };
    const promptContent = {
        logContent,
        diffContent,
        releaseFocus: runConfig.release?.focus,
    };
    const promptContext = {
        context: runConfig.release?.context,
        directories: runConfig.contextDirectories,
    };

    const promptResult = await ReleasePrompt.createPrompt(promptConfig, promptContent, promptContext);

    const request: Request = Formatter.create({ logger }).formatPrompt(runConfig.model as Model, promptResult.prompt);

    // Always ensure output directory exists for request/response files
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    logger.debug('Release analysis: isLargeRelease=%s, maxTokens=%d', promptResult.isLargeRelease, promptResult.maxTokens);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], {
        model: runConfig.model,
        responseFormat: { type: 'json_object' },
        debug: runConfig.debug,
        debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('release')),
        debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('release')),
        maxTokens: promptResult.maxTokens,
    });

    // Validate and safely cast the response
    const releaseSummary = validateReleaseSummary(summary);

    // Save timestamped copy of release notes to output directory
    try {
        const timestampedFilename = getTimestampedReleaseNotesFilename();
        const outputPath = getOutputPath(outputDirectory, timestampedFilename);

        // Format the release notes as markdown
        const releaseNotesContent = `# ${releaseSummary.title}\n\n${releaseSummary.body}`;

        await storage.writeFile(outputPath, releaseNotesContent, 'utf-8');
        logger.debug('Saved timestamped release notes: %s', outputPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped release notes: %s', error.message);
    }

    if (isDryRun) {
        logger.info('Generated release summary:');
        logger.info('Title: %s', releaseSummary.title);
        logger.info('Body: %s', releaseSummary.body);
    }

    return releaseSummary;
}
