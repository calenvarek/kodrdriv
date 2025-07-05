import { Prompt, recipe } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';

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
    overridePaths?: string[];
    overrides?: boolean;
}

/**
 * Build a commit prompt using RiotPrompt Recipes.
 *
 * @param runConfig   The runtime configuration provided by the CLI
 * @param content     Mandatory content inputs (e.g. diff)
 * @param ctx         Optional contextual inputs configured by the user
 */
export const createPrompt = async (
    { overridePaths: _overridePaths, overrides: _overrides }: Config,
    { diffContent, userDirection }: Content,
    { logContext, context, directories }: Context = {}
): Promise<Prompt> => {
    const basePath = __dirname;

    // Build content items for the prompt
    const contentItems = [];
    const contextItems = [];

    if (userDirection) {
        contentItems.push({ content: userDirection, title: 'User Direction' });
    }
    if (diffContent) {
        contentItems.push({ content: diffContent, title: 'Diff' });
    }

    if (logContext) {
        contextItems.push({ content: logContext, title: 'Log Context' });
    }
    if (context) {
        contextItems.push({ content: context, title: 'User Context' });
    }
    if (directories && directories.length > 0) {
        contextItems.push({ content: directories.join('\n'), title: 'Directories' });
    }

    return recipe(basePath)
        .persona({ path: 'personas/you.md' })
        .instructions({ path: 'instructions/commit.md' })
        .content(...contentItems)
        .context(...contextItems)
        .cook();
}; 