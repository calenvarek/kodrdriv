import { ContentItem, Prompt, recipe } from '@riotprompt/riotprompt';
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
    releaseFocus?: string;
    logContent: string;
    diffContent: string;
};

export type Context = {
    context?: string;
    directories?: string[];
};

/**
 * Build a release prompt using RiotPrompt Recipes.
 */
export const createPrompt = async (
    { overrides: _overrides, overridePaths: _overridePaths }: Config,
    { releaseFocus, logContent, diffContent }: Content,
    { context, directories }: Context = {}
): Promise<Prompt> => {
    const basePath = __dirname;

    // Build content items for the prompt
    const contentItems: ContentItem[] = [];
    const contextItems: ContentItem[] = [];

    if (diffContent) {
        contentItems.push({ content: diffContent, title: 'Diff' });
    }
    if (logContent) {
        contentItems.push({ content: logContent, title: 'Log Context' });
    }
    if (releaseFocus) {
        contentItems.push({ content: releaseFocus, title: 'Release Focus' });
    }

    if (context) {
        contextItems.push({ content: context, title: 'User Context' });
    }
    if (directories && directories.length > 0) {
        contextItems.push({ directories, title: 'Directories' });
    }




    return recipe(basePath)
        .persona({ path: 'personas/releaser.md' })
        .instructions({ path: 'instructions/release.md' })
        .overridePaths(_overridePaths ?? [])
        .overrides(_overrides ?? true)
        .content(...contentItems)
        .context(...contextItems)
        .cook();
}; 