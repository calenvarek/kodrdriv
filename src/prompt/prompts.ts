import { Builder, Formatter, Model, Prompt, Request } from '@riotprompt/riotprompt';
import { DEFAULT_INSTRUCTIONS_COMMIT_FILE, DEFAULT_INSTRUCTIONS_RELEASE_FILE, DEFAULT_PERSONA_YOU_FILE } from '../constants';
import { Config as RunConfig } from '../types';
import { getLogger } from '../logging';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Factory {
    createCommitPrompt: (content: string) => Promise<Prompt>;
    createReleasePrompt: (content: string) => Promise<Prompt>;
    format: (prompt: Prompt) => Request;
}

export const create = (model: Model, runConfig: RunConfig): Factory => {

    const logger = getLogger();

    const createCommitPrompt = async (content: string): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_YOU_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_COMMIT_FILE);
        builder = await builder.addContent(content);
        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories);
        }

        const prompt = await builder.build();
        return prompt;
    };

    const createReleasePrompt = async (content: string): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_YOU_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_RELEASE_FILE);
        builder = await builder.addContent(content);
        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories);
        }

        const prompt = await builder.build();
        return prompt;
    }

    const format = (prompt: Prompt): Request => {
        const formatter = Formatter.create();
        return formatter.formatPrompt(model, prompt);
    };

    return {
        createCommitPrompt,
        createReleasePrompt,
        format,
    };
}

