import { Builder, Formatter, Model, Prompt, Request } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_INSTRUCTIONS_COMMIT_FILE, DEFAULT_INSTRUCTIONS_RELEASE_FILE, DEFAULT_INSTRUCTIONS_AUDIO_REVIEW_FILE, DEFAULT_PERSONA_COMMITTER_FILE, DEFAULT_PERSONA_RELEASER_FILE, DEFAULT_PERSONA_REVIEWER_FILE } from '../constants';
import { getLogger } from '../logging';
import { Config as RunConfig } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Factory {
    createCommitPrompt: ({ diffContent, logContent }: { diffContent: string, logContent: string }, { userDirection, context }: { userDirection?: string, context?: string }) => Promise<Prompt>;
    createReleasePrompt: ({ logContent, diffContent }: { logContent: string, diffContent: string }, { releaseFocus, context }: { releaseFocus?: string, context?: string }) => Promise<Prompt>;
    createReviewPrompt: ({ notes }: { notes: string }, { logContext, diffContext, releaseNotesContext, issuesContext, context }: { logContext?: string, diffContext?: string, releaseNotesContext?: string, issuesContext?: string, context?: string }) => Promise<Prompt>;
    format: (prompt: Prompt) => Request;
}

export const create = (model: Model, runConfig: RunConfig): Factory => {

    const logger = getLogger();

    const createCommitPrompt = async ({ diffContent, logContent }: { diffContent: string, logContent: string }, { userDirection, context }: { userDirection?: string, context?: string }): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_COMMITTER_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_COMMIT_FILE);
        if (userDirection) {
            builder = await builder.addContent(userDirection, { title: 'User Direction', weight: 1.0 });
        }
        builder = await builder.addContent(diffContent, { title: 'Diff', weight: 0.5 });
        builder = await builder.addContent(logContent, { title: 'Log', weight: 0.5 });

        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories, { weight: 0.5 });
        }
        if (context) {
            builder = await builder.addContext(context, { title: 'User Context', weight: 1.0 });
        }

        const prompt = await builder.build();
        return prompt;
    };

    const createReleasePrompt = async ({ logContent, diffContent }: { logContent: string, diffContent: string }, { releaseFocus, context }: { releaseFocus?: string, context?: string }): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_RELEASER_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_RELEASE_FILE);
        if (releaseFocus) {
            builder = await builder.addContent(releaseFocus, { title: 'Release Focus', weight: 1.0 });
        }
        builder = await builder.addContent(logContent, { title: 'Log', weight: 0.5 });
        builder = await builder.addContent(diffContent, { title: 'Diff', weight: 0.5 });
        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories, { weight: 0.5 });
        }
        if (context) {
            builder = await builder.addContext(context, { title: 'User Context', weight: 1.0 });
        }

        const prompt = await builder.build();
        return prompt;
    }

    const createReviewPrompt = async ({ notes }: { notes: string }, { logContext, diffContext, releaseNotesContext, issuesContext, context }: { logContext?: string, diffContext?: string, releaseNotesContext?: string, issuesContext?: string, context?: string }): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_REVIEWER_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_AUDIO_REVIEW_FILE);

        builder = await builder.addContent(notes, { title: 'Review Notes', weight: 1.0 });

        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories, { weight: 0.5 });
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

        const prompt = await builder.build();
        return prompt;
    };

    const format = (prompt: Prompt): Request => {
        const formatter = Formatter.create();
        const request = formatter.formatPrompt(model, prompt);

        // Debug log the final formatted prompt
        if (runConfig.debug) {
            logger.debug('Final formatted prompt for AI:');
            logger.debug('Messages count: %d', request.messages.length);
            request.messages.forEach((message, index) => {
                logger.debug('Message %d (%s): %s',
                    index + 1,
                    (message as any).role || 'unknown',
                    typeof (message as any).content === 'string'
                        ? (message as any).content.substring(0, 500) + (((message as any).content.length > 500) ? '...' : '')
                        : JSON.stringify((message as any).content).substring(0, 500)
                );
            });
        }

        return request;
    };

    return {
        createCommitPrompt,
        createReleasePrompt,
        createReviewPrompt,
        format,
    };
}

