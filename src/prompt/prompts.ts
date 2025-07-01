import { Builder, Formatter, Model, Prompt, Request } from '@riotprompt/riotprompt';
import path from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_INSTRUCTIONS_COMMIT_FILE, DEFAULT_INSTRUCTIONS_RELEASE_FILE, DEFAULT_INSTRUCTIONS_AUDIO_REVIEW_FILE, DEFAULT_PERSONA_COMMITTER_FILE, DEFAULT_PERSONA_RELEASER_FILE, DEFAULT_PERSONA_REVIEWER_FILE } from '../constants';
import { getLogger } from '../logging';
import { Config as RunConfig } from '../types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Factory {
    createCommitPrompt: (content: string, logContent: string, context?: string) => Promise<Prompt>;
    createReleasePrompt: (content: string, diffContent: string, context?: string) => Promise<Prompt>;
    createAudioReviewPrompt: (transcription: string, context?: string) => Promise<Prompt>;
    format: (prompt: Prompt) => Request;
}

export const create = (model: Model, runConfig: RunConfig): Factory => {

    const logger = getLogger();

    const createCommitPrompt = async (content: string, logContent: string, context?: string): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_COMMITTER_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_COMMIT_FILE);
        if (context) {
            builder = await builder.addContent(`\n\n[User Context]\n${context}`);
        }
        builder = await builder.addContent(`\n\n[Diff]\n${content}`);
        builder = await builder.addContent(`\n\n[Log]\n${logContent}`);

        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories);
        }

        const prompt = await builder.build();
        return prompt;
    };

    const createReleasePrompt = async (content: string, diffContent: string, context?: string): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_RELEASER_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_RELEASE_FILE);
        if (context) {
            builder = await builder.addContent(`\n\n[User Context]\n${context}`);
        }
        builder = await builder.addContent(`\n\n[Log]\n${content}`);
        builder = await builder.addContent(`\n\n[Diff]\n${diffContent}`);
        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories);
        }

        const prompt = await builder.build();
        return prompt;
    }

    const createAudioReviewPrompt = async (transcription: string, context?: string): Promise<Prompt> => {
        let builder: Builder.Instance = Builder.create({ logger, basePath: __dirname, overridePath: runConfig?.configDirectory, overrides: runConfig?.overrides || false });
        builder = await builder.addPersonaPath(DEFAULT_PERSONA_REVIEWER_FILE);
        builder = await builder.addInstructionPath(DEFAULT_INSTRUCTIONS_AUDIO_REVIEW_FILE);
        if (context) {
            builder = await builder.addContent(`\n\n[Additional Context]\n${context}`);
        }
        builder = await builder.addContent(`\n\n[Audio Transcription]\n${transcription}`);

        if (runConfig.contextDirectories) {
            builder = await builder.loadContext(runConfig.contextDirectories);
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
        createAudioReviewPrompt,
        format,
    };
}

