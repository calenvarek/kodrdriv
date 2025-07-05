import { cook, Prompt } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export type Config = {
    overridePaths?: string[];
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
    { overridePaths, overrides }: Config,
    { notes }: Content,
    { logContext, diffContext, releaseNotesContext, issuesContext, context, directories }: Context = {}
): Promise<Prompt> => {
    // Prepare content array for the recipe
    const content = [
        { content: notes, title: 'Review Notes', weight: 1.0 }
    ];

    // Prepare context array for the recipe
    const contextArray = [];

    if (logContext) {
        contextArray.push({ content: logContext, title: 'Log Context', weight: 0.5 });
    }
    if (diffContext) {
        contextArray.push({ content: diffContext, title: 'Diff Context', weight: 0.5 });
    }
    if (releaseNotesContext) {
        contextArray.push({ content: releaseNotesContext, title: 'Release Notes Context', weight: 0.5 });
    }
    if (issuesContext) {
        contextArray.push({ content: issuesContext, title: 'Issues Context', weight: 0.5 });
    }
    if (context) {
        contextArray.push({ content: context, title: 'User Context', weight: 1.0 });
    }
    if (directories?.length) {
        contextArray.push({ directories, weight: 0.5 });
    }

    // Use the new cook recipe with template
    // Use __dirname directly since it already points to the correct location after build
    const basePath = __dirname;
    return cook({
        basePath,
        overridePaths: overridePaths || [],
        overrides: overrides || false,
        template: 'review',
        content,
        context: contextArray
    });
}; 