import { Prompt, quick } from '@riotprompt/riotprompt';
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
    { overridePaths, overrides }: Config,
    { diffContent, userDirection }: Content,
    { logContext, context, directories }: Context = {}
): Promise<Prompt> => {
    // Use the new quick.commit recipe - much simpler!
    return quick.commit(diffContent, {
        basePath: __dirname,
        overridePaths: overridePaths || [],
        overrides: overrides || false,
        userDirection,
        context,
        directories
    });
}; 