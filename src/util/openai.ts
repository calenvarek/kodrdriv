import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as Storage from './storage';
import { getLogger } from '../logging';
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

export async function createCompletion(messages: ChatCompletionMessageParam[], options: { responseFormat?: any, model?: string, debug?: boolean, debugFile?: string, debugRequestFile?: string, debugResponseFile?: string } = { model: "gpt-4o-mini" }): Promise<string | any> {
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
        });

        logger.debug('Sending prompt to OpenAI: %j', messages);

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile)) {
            const requestData = {
                model: options.model || "gpt-4o-mini",
                messages,
                max_completion_tokens: 10000,
                response_format: options.responseFormat,
            };
            const debugFile = options.debugRequestFile || options.debugFile;
            await storage.writeFile(debugFile!, JSON.stringify(requestData, null, 2), 'utf8');
            logger.debug('Wrote request debug file to %s', debugFile);
        }

        const completion = await openai.chat.completions.create({
            model: options.model || "gpt-4o-mini",
            messages,
            max_completion_tokens: 10000,
            response_format: options.responseFormat,
        });

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
        // Ensure we close the OpenAI client to release underlying keep-alive sockets
        try {
            // openai.close() returns a promise; awaiting ensures proper cleanup
            // but if it throws we silently ignore as it's best-effort.

            if (openai && typeof (openai as any).close === 'function') {
                await (openai as any).close();
            }
        } catch (closeErr) {
            logger.debug('Failed to close OpenAI client: %s', (closeErr as Error).message);
        }
    }
}

export async function transcribeAudio(filePath: string, options: { model?: string, debug?: boolean, debugFile?: string, debugRequestFile?: string, debugResponseFile?: string } = { model: "whisper-1" }): Promise<Transcription> {
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
        try {
            if (openai && typeof (openai as any).close === 'function') {
                await (openai as any).close();
            }
        } catch (closeErr) {
            logger.debug('Failed to close OpenAI client: %s', (closeErr as Error).message);
        }
    }
}
