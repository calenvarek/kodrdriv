import { Builder, Prompt } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_INSTRUCTIONS_RELEASE_FILE, DEFAULT_PERSONA_RELEASER_FILE } from '../constants';
import { getLogger } from '../logging';
import { Config as RunConfig } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for the release prompt
export type Config = {
    overridePath?: string;
    overrides?: boolean;
}

export type Content = {
    logContent: string;
    diffContent: string;
};

export type Context = {
    releaseFocus?: string;
    context?: string;
    directories?: string[];
};

/**
 * Build a release prompt using RiotPrompt Builder.
 */
export const createPrompt = async (
    { overridePath, overrides }: Config,
    { logContent, diffContent }: Content,
    { releaseFocus, context, directories }: Context = {}
): Promise<Prompt> => {
    const logger = getLogger();

    let builder: Builder.Instance = Builder.create({
        logger,
        basePath: __dirname,
        overridePath,
        overrides: overrides || false,
    });

    // Persona & instructions specific to releases
    builder = await builder.addPersonaPath(DEFAULT_PERSONA_RELEASER_FILE);
    builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_RELEASE_FILE);

    if (releaseFocus) {
        builder = await builder.addContent(releaseFocus, { title: 'Release Focus', weight: 1.0 });
    }

    builder = await builder.addContent(logContent, { title: 'Log', weight: 0.5 });
    builder = await builder.addContent(diffContent, { title: 'Diff', weight: 0.5 });

    // Load additional context directories configured by the user
    if (directories?.length) {
        builder = await builder.loadContext(directories, { weight: 0.5 });
    }

    if (context) {
        builder = await builder.addContext(context, { title: 'User Context', weight: 1.0 });
    }

    return await builder.build();
}; 