import { Prompt, quick } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types for the release prompt
export type Config = {
    overridePaths?: string[];
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
 * Build a release prompt using RiotPrompt Recipes.
 */
export const createPrompt = async (
    { overrides, overridePaths }: Config,
    { logContent, diffContent }: Content,
    { releaseFocus, context, directories }: Context = {}
): Promise<Prompt> => {
    // Use the new quick.release recipe - much simpler!
    // Adjust basePath for single-file build
    const basePath = path.resolve(__dirname, 'src', 'prompt');
    return quick.release(logContent, diffContent, {
        basePath,
        overridePaths: overridePaths || [],
        overrides: overrides || false,
        releaseFocus,
        context,
        directories
    });
}; 