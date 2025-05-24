#!/usr/bin/env node
import { Model, Request } from '@riotprompt/riotprompt';
import 'dotenv/config';
import { ChatCompletionMessageParam } from 'openai/resources';
import { DEFAULT_FROM_COMMIT_ALIAS, DEFAULT_TO_COMMIT_ALIAS } from '../constants';
import * as Log from '../content/log';
import * as Prompts from '../prompt/prompts';
import { Config } from '../types';
import { createCompletion } from '../util/openai';

export const execute = async (runConfig: Config) => {
    const prompts = await Prompts.create(runConfig.model as Model, runConfig);

    const log = await Log.create({ from: runConfig.release?.from ?? DEFAULT_FROM_COMMIT_ALIAS, to: runConfig.release?.to ?? DEFAULT_TO_COMMIT_ALIAS });
    let logContent = '';

    logContent = await log.get();

    const prompt = await prompts.createReleasePrompt(logContent);

    const request: Request = prompts.format(prompt);

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], { model: runConfig.model });

    return summary;
}
