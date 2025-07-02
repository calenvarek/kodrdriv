#!/usr/bin/env node
import { Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_FROM_COMMIT_ALIAS, DEFAULT_TO_COMMIT_ALIAS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import * as Prompts from '../prompt/prompts';
import { Config, ReleaseSummary } from '../types';
import { createCompletion } from '../util/openai';
import { getLogger } from '../logging';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedReleaseNotesFilename } from '../util/general';
import { create as createStorage } from '../util/storage';

export const execute = async (runConfig: Config): Promise<ReleaseSummary> => {
    const logger = getLogger();
    const prompts = await Prompts.create(runConfig.model as Model, runConfig);
    const isDryRun = runConfig.dryRun || false;

    const log = await Log.create({ from: runConfig.release?.from ?? DEFAULT_FROM_COMMIT_ALIAS, to: runConfig.release?.to ?? DEFAULT_TO_COMMIT_ALIAS });
    let logContent = '';

    const diff = await Diff.create({ from: runConfig.release?.from ?? DEFAULT_FROM_COMMIT_ALIAS, to: runConfig.release?.to ?? DEFAULT_TO_COMMIT_ALIAS, excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS });
    let diffContent = '';

    diffContent = await diff.get();
    logContent = await log.get();

    const prompt = await prompts.createReleasePrompt({ logContent, diffContent }, { context: runConfig.release?.context });

    const request: Request = prompts.format(prompt);

    // Always ensure output directory exists for request/response files
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], {
        model: runConfig.model,
        responseFormat: { type: 'json_object' },
        debug: runConfig.debug,
        debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('release')),
        debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('release')),
    });

    // Save timestamped copy of release notes to output directory
    try {
        const timestampedFilename = getTimestampedReleaseNotesFilename();
        const outputPath = getOutputPath(outputDirectory, timestampedFilename);

        // Format the release notes as markdown
        const releaseSummary = summary as ReleaseSummary;
        const releaseNotesContent = `# ${releaseSummary.title}\n\n${releaseSummary.body}`;

        await storage.writeFile(outputPath, releaseNotesContent, 'utf-8');
        logger.debug('Saved timestamped release notes: %s', outputPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped release notes: %s', error.message);
    }

    if (isDryRun) {
        logger.info('DRY RUN: Generated release summary:');
        logger.info('Title: %s', (summary as ReleaseSummary).title);
        logger.info('Body: %s', (summary as ReleaseSummary).body);
    }

    return summary as ReleaseSummary;
}
