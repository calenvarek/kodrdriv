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
    // Use the new cook recipe with template
    // Use __dirname directly since it already points to the correct location after build
    const basePath = __dirname;
    return quick.commit(diffContent, {
        basePath,
        overridePaths: overridePaths || [],
        overrides: overrides || false,
        userDirection,
        context,
        directories
    });
}; 