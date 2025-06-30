#!/usr/bin/env node
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import shellescape from 'shell-escape';
import { DEFAULT_EXCLUDED_PATTERNS } from '../constants';
import * as Diff from '../content/diff';
import * as Log from '../content/log';
import { getLogger } from '../logging';
import * as Prompts from '../prompt/prompts';
import { Config } from '../types';
import { run } from '../util/child';
import { stringifyJSON } from '../util/general';
import { createCompletion } from '../util/openai';

export const execute = async (runConfig: Config) => {
    const logger = getLogger();
    const prompts = Prompts.create(runConfig.model as Model, runConfig);
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
    const logContent = await log.get();

    const prompt = await prompts.createCommitPrompt(diffContent, logContent, runConfig.commit?.context);

    if (runConfig.debug) {
        const formattedPrompt = Formatter.create({ logger }).formatPrompt("gpt-4o-mini", prompt);
        logger.silly('Formatted Prompt: %s', stringifyJSON(formattedPrompt));
    }

    const request: Request = prompts.format(prompt);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], { model: runConfig.model });

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
