#!/usr/bin/env node
import { Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_FROM_COMMIT_ALIAS, DEFAULT_TO_COMMIT_ALIAS } from '../constants';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import * as Prompts from '../prompt/prompts';
import { Config, ReleaseSummary } from '../types';
import { createCompletion } from '../util/openai';
import { getLogger } from '../logging';

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

    const prompt = await prompts.createReleasePrompt(logContent, diffContent, runConfig.release?.context);

    const request: Request = prompts.format(prompt);

    const summary = await createCompletion(
        request.messages as ChatCompletionMessageParam[],
        {
            model: runConfig.model,
            responseFormat: { type: 'json_object' }
        }
    );

    if (isDryRun) {
        logger.info('DRY RUN: Generated release summary:');
        logger.info('Title: %s', (summary as ReleaseSummary).title);
        logger.info('Body: %s', (summary as ReleaseSummary).body);
    }

    return summary as ReleaseSummary;
}
