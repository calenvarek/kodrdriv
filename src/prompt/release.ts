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
    milestoneIssues?: string;
};

export type Context = {
    context?: string;
    directories?: string[];
};

export type ReleasePromptResult = {
    prompt: Prompt;
    maxTokens: number;
    isLargeRelease: boolean;
};

/**
 * Analyzes release content to determine if it's a large release
 * and calculates appropriate token limits
 */
const analyzeReleaseSize = (logContent: string, diffContent?: string, milestoneIssues?: string): { isLarge: boolean; maxTokens: number } => {
    const logLines = logContent.split('\n').length;
    const diffLines = diffContent ? diffContent.split('\n').length : 0;
    const milestoneLines = milestoneIssues ? milestoneIssues.split('\n').length : 0;
    const totalContentLength = logContent.length + (diffContent?.length || 0) + (milestoneIssues?.length || 0);

    // Consider it a large release if:
    // - More than 20 commits (log lines typically ~3-5 per commit)
    // - More than 500 diff lines
    // - Milestone issues present (indicates significant work)
    // - Total content length > 50KB
    const isLarge = logLines > 60 || diffLines > 500 || milestoneLines > 50 || totalContentLength > 50000;

    if (isLarge) {
        // For large releases, significantly increase token limit
        return { isLarge: true, maxTokens: 25000 };
    } else {
        // Standard token limit for normal releases
        return { isLarge: false, maxTokens: 10000 };
    }
};

/**
 * Build a release prompt using RiotPrompt Recipes.
 */
export const createPrompt = async (
    { overrides: _overrides, overridePaths: _overridePaths }: Config,
    { releaseFocus, logContent, diffContent, milestoneIssues }: Content,
    { context, directories }: Context = {}
): Promise<ReleasePromptResult> => {
    const basePath = __dirname;

    // Analyze release size to determine token requirements
    const { isLarge: isLargeRelease, maxTokens } = analyzeReleaseSize(logContent, diffContent, milestoneIssues);

    // Build content items for the prompt
    const contentItems: ContentItem[] = [];
    const contextItems: ContentItem[] = [];

    if (diffContent) {
        contentItems.push({ content: diffContent, title: 'Diff' });
    }
    if (logContent) {
        contentItems.push({ content: logContent, title: 'Log Context' });
    }
    if (milestoneIssues) {
        contentItems.push({ content: milestoneIssues, title: 'Resolved Issues from Milestone' });
    }
    if (releaseFocus) {
        contentItems.push({ content: releaseFocus, title: 'Release Focus' });
    }

    // Add release size context to help guide the AI
    if (isLargeRelease) {
        contextItems.push({
            content: `This appears to be a LARGE RELEASE with significant changes. Please provide comprehensive, detailed release notes that thoroughly document all major changes, improvements, and fixes. Don't summarize - dive deep into the details.`,
            title: 'Release Size Context'
        });
    }

    if (context) {
        contextItems.push({ content: context, title: 'User Context' });
    }
    if (directories && directories.length > 0) {
        contextItems.push({ directories, title: 'Directories' });
    }

    const prompt = await recipe(basePath)
        .persona({ path: 'personas/releaser.md' })
        .instructions({ path: 'instructions/release.md' })
        .overridePaths(_overridePaths ?? [])
        .overrides(_overrides ?? true)
        .content(...contentItems)
        .context(...contextItems)
        .cook();

    return {
        prompt,
        maxTokens,
        isLargeRelease
    };
};
