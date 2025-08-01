import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as Storage from './storage';
import { getLogger } from '../logging';
import { archiveAudio } from './general';
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';

export interface Transcription {
    text: string;
}

export class OpenAIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OpenAIError';
    }
}

export async function createCompletion(messages: ChatCompletionMessageParam[], options: { responseFormat?: any, model?: string, debug?: boolean, debugFile?: string, debugRequestFile?: string, debugResponseFile?: string, maxTokens?: number } = { model: "gpt-4o-mini" }): Promise<string | any> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    let openai: OpenAI | null = null;
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        // Create the client which we'll close in the finally block.
        openai = new OpenAI({
            apiKey: apiKey,
            timeout: 180000, // 180 seconds timeout
        });

        logger.debug('Sending prompt to OpenAI: %j', messages);

        // Use provided maxTokens or default to 10000
        const maxCompletionTokens = options.maxTokens || 10000;

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile)) {
            const requestData = {
                model: options.model || "gpt-4o-mini",
                messages,
                max_completion_tokens: maxCompletionTokens,
                response_format: options.responseFormat,
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await storage.writeFile(debugFile!, JSON.stringify(requestData, null, 2), 'utf8');
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        // Add timeout wrapper to the OpenAI API call
        const completionPromise = openai.chat.completions.create({
            model: options.model || "gpt-4o-mini",
            messages,
            max_completion_tokens: maxCompletionTokens,
            response_format: options.responseFormat,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new OpenAIError('OpenAI API call timed out after 180 seconds')), 180000);
        });

        const completion = await Promise.race([completionPromise, timeoutPromise]);

        // Save response debug file if enabled
        if (options.debug && (options.debugResponseFile || options.debugFile)) {
            const debugFile = options.debugResponseFile || options.debugFile;
            await storage.writeFile(debugFile!, JSON.stringify(completion, null, 2), 'utf8');
            logger.debug('Wrote response debug file to %s', debugFile);
        }

        const response = completion.choices[0]?.message?.content?.trim();
        if (!response) {
            throw new OpenAIError('No response received from OpenAI');
        }

        logger.debug('Received response from OpenAI: %s...', response.substring(0, 30));
        if (options.responseFormat) {
            return JSON.parse(response);
        } else {
            return response;
        }

    } catch (error: any) {
        logger.error('Error calling OpenAI API: %s %s', error.message, error.stack);
        throw new OpenAIError(`Failed to create completion: ${error.message}`);
    } finally {
        // OpenAI client cleanup is handled automatically by the library
        // No manual cleanup needed for newer versions
    }
}

export async function transcribeAudio(filePath: string, options: { model?: string, debug?: boolean, debugFile?: string, debugRequestFile?: string, debugResponseFile?: string, outputDirectory?: string } = { model: "whisper-1" }): Promise<Transcription> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    let openai: OpenAI | null = null;
    let audioStream: fs.ReadStream | null = null;
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        openai = new OpenAI({
            apiKey: apiKey,
        });

        logger.debug('Transcribing audio file: %s', filePath);

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile)) {
            const requestData = {
                model: options.model || "whisper-1",
                file: filePath, // Can't serialize the stream, so just save the file path
                response_format: "json",
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await storage.writeFile(debugFile!, JSON.stringify(requestData, null, 2), 'utf8');
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        audioStream = await storage.readStream(filePath);
        const transcription = await openai.audio.transcriptions.create({
            model: options.model || "whisper-1",
            file: audioStream,
            response_format: "json",
        });

        // Save response debug file if enabled
        if (options.debug && (options.debugResponseFile || options.debugFile)) {
            const debugFile = options.debugResponseFile || options.debugFile;
            await storage.writeFile(debugFile!, JSON.stringify(transcription, null, 2), 'utf8');
            logger.debug('Wrote response debug file to %s', debugFile);
        }

        const response = transcription;
        if (!response) {
            throw new OpenAIError('No transcription received from OpenAI');
        }

        logger.debug('Received transcription from OpenAI: %s', response);

        // Archive the audio file and transcription
        try {
            const outputDir = options.outputDirectory || 'output';
            await archiveAudio(filePath, response.text, outputDir);
        } catch (archiveError: any) {
            // Don't fail the transcription if archiving fails, just log the error
            logger.warn('Failed to archive audio file: %s', archiveError.message);
        }

        return response;

    } catch (error: any) {
        logger.error('Error transcribing audio file: %s %s', error.message, error.stack);
        throw new OpenAIError(`Failed to transcribe audio: ${error.message}`);
    } finally {
        // Ensure the audio stream is properly closed to release file handles
        try {
            if (audioStream) {
                audioStream.close();
            }
        } catch (streamErr) {
            logger.debug('Failed to close audio read stream: %s', (streamErr as Error).message);
        }
        // OpenAI client cleanup is handled automatically by the library
        // No manual cleanup needed for newer versions
    }
}
