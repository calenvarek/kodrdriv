import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as Storage from './storage';
import { getLogger } from '../logging';
export interface Transcription {
    text: string;
}

export class OpenAIError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'OpenAIError';
    }
}

export async function createCompletion(messages: ChatCompletionMessageParam[], options: { responseFormat?: any, model?: string, debug?: boolean, debugRequestFile?: string, debugResponseFile?: string } = { model: "gpt-4o-mini" }): Promise<string | any> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        const openai = new OpenAI({
            apiKey: apiKey,
        });

        logger.debug('Sending prompt to OpenAI: %j', messages);

        // Save request debug file if enabled
        if (options.debug && options.debugRequestFile) {
            const requestData = {
                model: options.model || "gpt-4o-mini",
                messages,
                max_completion_tokens: 10000,
                response_format: options.responseFormat,
            };
            await storage.writeFile(options.debugRequestFile, JSON.stringify(requestData, null, 2), 'utf8');
            logger.debug('Wrote request debug file to %s', options.debugRequestFile);
        }

        const completion = await openai.chat.completions.create({
            model: options.model || "gpt-4o-mini",
            messages,
            max_completion_tokens: 10000,
            response_format: options.responseFormat,
        });

        // Save response debug file if enabled
        if (options.debug && options.debugResponseFile) {
            await storage.writeFile(options.debugResponseFile, JSON.stringify(completion, null, 2), 'utf8');
            logger.debug('Wrote response debug file to %s', options.debugResponseFile);
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
    }
}

export async function transcribeAudio(filePath: string, options: { model?: string, debug?: boolean, debugRequestFile?: string, debugResponseFile?: string } = { model: "whisper-1" }): Promise<Transcription> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    try {
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new OpenAIError('OPENAI_API_KEY environment variable is not set');
        }

        const openai = new OpenAI({
            apiKey: apiKey,
        });

        logger.debug('Transcribing audio file: %s', filePath);

        // Save request debug file if enabled
        if (options.debug && options.debugRequestFile) {
            const requestData = {
                model: options.model || "whisper-1",
                file: filePath, // Can't serialize the stream, so just save the file path
                response_format: "json",
            };
            await storage.writeFile(options.debugRequestFile, JSON.stringify(requestData, null, 2), 'utf8');
            logger.debug('Wrote request debug file to %s', options.debugRequestFile);
        }

        const audioStream = await storage.readStream(filePath);
        const transcription = await openai.audio.transcriptions.create({
            model: options.model || "whisper-1",
            file: audioStream,
            response_format: "json",
        });

        // Save response debug file if enabled
        if (options.debug && options.debugResponseFile) {
            await storage.writeFile(options.debugResponseFile, JSON.stringify(transcription, null, 2), 'utf8');
            logger.debug('Wrote response debug file to %s', options.debugResponseFile);
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
    }
}
