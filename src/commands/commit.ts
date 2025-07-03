#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import shellescape from 'shell-escape';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import * as Diff from '../content/diff';
import * as Log from '../content/log';
import { getLogger } from '../logging';
import * as CommitPrompt from '../prompt/commit';
import { Config } from '../types';
import { run } from '../util/child';
import { stringifyJSON, getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, getTimestampedCommitFilename } from '../util/general';
import { createCompletion } from '../util/openai';
import { create as createStorage } from '../util/storage';

export const execute = async (runConfig: Config) => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    if (runConfig.commit?.add) {
        if (isDryRun) {
            logger.info('DRY RUN: Would add all changes to the index with: git add -A');
        } else {
            logger.verbose('Adding all changes to the index...');
            await run('git add -A');
        }
    }

    let diffContent = '';

    let cached = runConfig.commit?.cached;
    // If `add` is used, we should always look at staged changes.
    if (runConfig.commit?.add) {
        cached = true;
    } else if (cached === undefined) {
        // If cached is undefined? We're going to look for a staged commit; otherwise, we'll use the supplied setting.
        cached = await Diff.hasStagedChanges();
    }

    // Fix: Exit early if sendit is true but no changes are staged
    if (runConfig.commit?.sendit && !cached && !isDryRun) {
        logger.warn('SendIt mode enabled, but no changes to commit.');
        process.exit(1);
    }

    const options = { cached, excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS };
    const diff = await Diff.create(options);
    diffContent = await diff.get();

    const logOptions = {
        limit: runConfig.commit?.messageLimit,
    };
    const log = await Log.create(logOptions);
    const logContext = await log.get();

    const promptConfig = {
        overridePath: runConfig.configDirectory,
        overrides: runConfig.overrides || false,
        overrideDirs: runConfig.discoveredConfigDirs || [],
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

    if (runConfig.debug) {
        const formattedPrompt = Formatter.create({ logger }).formatPrompt("gpt-4o-mini", prompt);
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

    // Save timestamped copy of commit message to output directory
    try {
        const timestampedFilename = getTimestampedCommitFilename();
        const outputPath = getOutputPath(outputDirectory, timestampedFilename);

        await storage.writeFile(outputPath, summary, 'utf-8');
        logger.debug('Saved timestamped commit message: %s', outputPath);
    } catch (error: any) {
        logger.warn('Failed to save timestamped commit message: %s', error.message);
    }

    if (runConfig.commit?.sendit) {
        if (!cached && !isDryRun) {
            logger.error('SendIt mode enabled, but no changes to commit. Message: \n\n%s\n\n', summary);
            process.exit(1);
        }

        if (isDryRun) {
            logger.info('DRY RUN: Would commit with message: \n\n%s\n\n', summary);
            logger.info('DRY RUN: Would execute: git commit -m <generated-message>');
        } else {
            logger.info('SendIt mode enabled. Committing with message: \n\n%s\n\n', summary);
            try {
                const escapedSummary = shellescape([summary]);
                await run(`git commit -m ${escapedSummary}`);
                logger.info('Commit successful!');
            } catch (error) {
                logger.error('Failed to commit:', error);
                process.exit(1);
            }
        }
    } else if (isDryRun) {
        logger.info('DRY RUN: Generated commit message: \n\n%s\n\n', summary);
    }

    return summary;
}
