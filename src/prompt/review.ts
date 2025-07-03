import { Builder, Prompt } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_INSTRUCTIONS_REVIEW_FILE, DEFAULT_PERSONA_YOU_FILE } from '../constants';
import { getLogger } from '../logging';
import { Config as RunConfig } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Config = {
    overridePath?: string;
    overrides?: boolean;
}

export type Content = {
    notes: string;
};

export type Context = {
    logContext?: string;
    diffContext?: string;
    releaseNotesContext?: string;
    issuesContext?: string;
    context?: string;
    directories?: string[];
};

export const createPrompt = async (
    { overridePath, overrides }: Config,
    { notes }: Content,
    { logContext, diffContext, releaseNotesContext, issuesContext, context, directories }: Context = {}
): Promise<Prompt> => {
    const logger = getLogger();

    let builder: Builder.Instance = Builder.create({
        logger,
        basePath: __dirname,
        overridePath,
        overrides: overrides || false,
    });

    builder = await builder.addPersonaPath(DEFAULT_PERSONA_YOU_FILE);
    builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_REVIEW_FILE);

    // Primary review notes supplied by the user
    builder = await builder.addContent(notes, { title: 'Review Notes', weight: 1.0 });

    // Additional context directories
    if (directories?.length) {
        builder = await builder.loadContext(directories, { weight: 0.5 });
    }

    if (logContext) {
        builder = await builder.addContext(logContext, { title: 'Log Context', weight: 0.5 });
    }
    if (diffContext) {
        builder = await builder.addContext(diffContext, { title: 'Diff Context', weight: 0.5 });
    }
    if (releaseNotesContext) {
        builder = await builder.addContext(releaseNotesContext, { title: 'Release Notes Context', weight: 0.5 });
    }
    if (issuesContext) {
        builder = await builder.addContext(issuesContext, { title: 'Issues Context', weight: 0.5 });
    }
    if (context) {
        builder = await builder.addContext(context, { title: 'User Context', weight: 1.0 });
    }

    return await builder.build();
}; 