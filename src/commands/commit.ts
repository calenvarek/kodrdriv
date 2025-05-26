#!/usr/bin/env node
import { Model, Request, Formatter } from '@riotprompt/riotprompt';
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
import { createCompletion } from '../util/openai';
import { stringifyJSON } from '../util/general';

export const execute = async (runConfig: Config) => {
    const logger = getLogger();
    const prompts = Prompts.create(runConfig.model as Model, runConfig);

    let diffContent = '';

    let cached = runConfig.commit?.cached;
    // If cached is undefined? We're going to look for a staged commit; otherwise, we'll use the supplied setting.
    if (runConfig.commit?.cached === undefined) {
        cached = await Diff.hasStagedChanges();
    }

    // Fix: Exit early if sendit is true but no changes are staged
    if (runConfig.commit?.sendit && !cached) {
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
        logger.debug('Formatted Prompt: %s', stringifyJSON(formattedPrompt));
    }

    const request: Request = prompts.format(prompt);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], { model: runConfig.model });

    if (runConfig.commit?.sendit) {
        if (!cached) {
            logger.error('SendIt mode enabled, but no changes to commit. Message: \n\n%s\n\n', summary);
            process.exit(1);
        }

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

    return summary;
}
