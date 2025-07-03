import { Builder, Prompt } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_INSTRUCTIONS_COMMIT_FILE, DEFAULT_PERSONA_YOU_FILE } from '../constants';
import { getLogger } from '../logging';
import { Config as RunConfig } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for the commit prompt
export type Content = {
    diffContent: string;
    userDirection?: string;
};

export type Context = {
    logContext?: string;
    context?: string;
    directories?: string[];
};

export type Config = {
    overridePath?: string;
    overrides?: boolean;
}

/**
 * Build a commit prompt using RiotPrompt Builder.
 *
 * @param model       OpenAI / RiotPrompt model identifier
 * @param runConfig   The runtime configuration provided by the CLI
 * @param content     Mandatory content inputs (e.g. diff)
 * @param ctx         Optional contextual inputs configured by the user
 */
export const createPrompt = async (
    { overridePath, overrides }: Config,
    { diffContent, userDirection }: Content,
    { logContext, context, directories }: Context = {}
): Promise<Prompt> => {
    const logger = getLogger();

    let builder: Builder.Instance = Builder.create({
        logger,
        basePath: __dirname,
        overridePath,
        overrides: overrides || false,
    });

    // Persona & core instructions
    builder = await builder.addPersonaPath(DEFAULT_PERSONA_YOU_FILE);
    builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_COMMIT_FILE);

    // User-supplied direction overrides highest priority
    if (userDirection) {
        builder = await builder.addContent(userDirection, { title: 'User Direction', weight: 1.0 });
    }

    // Always include the diff produced by git
    builder = await builder.addContent(diffContent, { title: 'Diff', weight: 0.5 });

    // Auto-load additional context directories specified via CLI/RC file
    if (directories?.length) {
        builder = await builder.loadContext(directories, { weight: 0.5 });
    }

    // Explicit user context (free-form text) – highest weight
    if (context) {
        builder = await builder.addContext(context, { title: 'User Context', weight: 1.0 });
    }

    // Git log context (previous commits)
    if (logContext) {
        builder = await builder.addContext(logContext, { title: 'Log Context', weight: 0.5 });
    }

    // Build and return the prompt
    return await builder.build();
}; 