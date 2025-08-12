import { OpenAI } from 'openai';
import { ChatCompletionMessageParam } from 'openai/resources';
import * as Storage from './storage';
import { getLogger } from '../logging';
import { archiveAudio } from './general';
import { Config } from '../types';
import { safeJsonParse } from './validation';
// eslint-disable-next-line no-restricted-imports
import fs from 'fs';

export interface Transcription {
    text: string;
}

/**
 * Get the appropriate model to use based on command-specific configuration
 * Command-specific model overrides the global model setting
 */
export function getModelForCommand(config: Config, commandName: string): string {
    let commandModel: string | undefined;

    switch (commandName) {
        case 'commit':
        case 'audio-commit':
            commandModel = config.commit?.model;
            break;
        case 'release':
            commandModel = config.release?.model;
            break;
        case 'review':
        case 'audio-review':
            commandModel = config.review?.model;
            break;
        default:
            // For other commands, just use global model
            break;
    }

    // Return command-specific model if available, otherwise global model
    return commandModel || config.model || 'gpt-4o-mini';
}

export class OpenAIError extends Error {
    constructor(message: string, public readonly isTokenLimitError: boolean = false) {
        super(message);
        this.name = 'OpenAIError';
    }
}

// Check if an error is a token limit exceeded error
export function isTokenLimitError(error: any): boolean {
    if (!error?.message) return false;

    const message = error.message.toLowerCase();
    return message.includes('maximum context length') ||
           message.includes('context_length_exceeded') ||
           message.includes('token limit') ||
           message.includes('too many tokens') ||
           message.includes('reduce the length');
}

// Check if an error is a rate limit error
export function isRateLimitError(error: any): boolean {
    if (!error?.message && !error?.code && !error?.status) return false;

    // Check for OpenAI specific rate limit indicators
    if (error.status === 429 || error.code === 'rate_limit_exceeded') {
        return true;
    }

    const message = error.message.toLowerCase();
    return message.includes('rate limit exceeded') ||
           message.includes('too many requests') ||
           message.includes('quota exceeded') ||
           (message.includes('rate') && message.includes('limit'));
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
        const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '300000'); // Default to 5 minutes
        openai = new OpenAI({
            apiKey: apiKey,
            timeout: timeoutMs,
        });

        const modelToUse = options.model || "gpt-4o-mini";
        logger.info('🤖 Making request to OpenAI using model: %s', modelToUse);
        logger.debug('Sending prompt to OpenAI: %j', messages);

        // Use provided maxTokens or default to 10000
        const maxCompletionTokens = options.maxTokens || 10000;

        // Save request debug file if enabled
        if (options.debug && (options.debugRequestFile || options.debugFile)) {
            const requestData = {
                model: modelToUse,
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
            model: modelToUse,
            messages,
            max_completion_tokens: maxCompletionTokens,
            response_format: options.responseFormat,
        });

        // Create timeout promise with proper cleanup to prevent memory leaks
        let timeoutId: NodeJS.Timeout | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
            const timeoutMs = parseInt(process.env.OPENAI_TIMEOUT_MS || '300000'); // Default to 5 minutes
            timeoutId = setTimeout(() => reject(new OpenAIError(`OpenAI API call timed out after ${timeoutMs/1000} seconds`)), timeoutMs);
        });

        let completion;
        try {
            completion = await Promise.race([completionPromise, timeoutPromise]);
        } finally {
            // Clear the timeout to prevent memory leaks
            if (timeoutId !== null) {
                clearTimeout(timeoutId);
            }
        }

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
            return safeJsonParse(response, 'OpenAI API response');
        } else {
            return response;
        }

    } catch (error: any) {
        logger.error('Error calling OpenAI API: %s %s', error.message, error.stack);
        const isTokenError = isTokenLimitError(error);
        throw new OpenAIError(`Failed to create completion: ${error.message}`, isTokenError);
    } finally {
        // OpenAI client cleanup is handled automatically by the library
        // No manual cleanup needed for newer versions
    }
}

// Create completion with automatic retry on token limit errors
export async function createCompletionWithRetry(
    messages: ChatCompletionMessageParam[],
    options: { responseFormat?: any, model?: string, debug?: boolean, debugFile?: string, debugRequestFile?: string, debugResponseFile?: string, maxTokens?: number } = { model: "gpt-4o-mini" },
    retryCallback?: (attempt: number) => Promise<ChatCompletionMessageParam[]>
): Promise<string | any> {
    const logger = getLogger();
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const messagesToSend = attempt === 1 ? messages : (retryCallback ? await retryCallback(attempt) : messages);
            return await createCompletion(messagesToSend, options);
        } catch (error: any) {
            if (error instanceof OpenAIError && error.isTokenLimitError && attempt < maxRetries && retryCallback) {
                logger.warn('Token limit exceeded on attempt %d/%d, retrying with reduced content...', attempt, maxRetries);
                // Add exponential backoff for token limit errors
                const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            } else if (isRateLimitError(error) && attempt < maxRetries) {
                // Handle rate limiting with exponential backoff
                const backoffMs = Math.min(2000 * Math.pow(2, attempt - 1), 15000); // More reasonable backoff: 2s, 4s, 8s, max 15s
                logger.warn(`Rate limit hit on attempt ${attempt}/${maxRetries}, waiting ${backoffMs}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                continue;
            }
            throw error;
        }
    }

    // This should never be reached, but TypeScript requires it
    throw new OpenAIError('Max retries exceeded');
}

export async function transcribeAudio(filePath: string, options: { model?: string, debug?: boolean, debugFile?: string, debugRequestFile?: string, debugResponseFile?: string, outputDirectory?: string } = { model: "whisper-1" }): Promise<Transcription> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });
    let openai: OpenAI | null = null;
    let audioStream: fs.ReadStream | null = null;
    let streamClosed = false;

    // Helper function to safely close the stream
    const closeAudioStream = () => {
        if (audioStream && !streamClosed) {
            try {
                // Only call destroy if it exists and the stream isn't already destroyed
                if (typeof audioStream.destroy === 'function' && !audioStream.destroyed) {
                    audioStream.destroy();
                }
                streamClosed = true;
                logger.debug('Audio stream closed successfully');
            } catch (streamErr) {
                logger.debug('Failed to destroy audio read stream: %s', (streamErr as Error).message);
                streamClosed = true; // Mark as closed even if destroy failed
            }
        }
    };

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

        // Set up error handler for the stream to ensure cleanup on stream errors
        // Only add handler if the stream has the 'on' method (real streams)
        if (audioStream && typeof audioStream.on === 'function') {
            audioStream.on('error', (streamError) => {
                logger.error('Audio stream error: %s', streamError.message);
                closeAudioStream();
            });
        }

        let transcription;
        try {
            transcription = await openai.audio.transcriptions.create({
                model: options.model || "whisper-1",
                file: audioStream,
                response_format: "json",
            });
            // Close the stream immediately after successful API call to prevent race conditions
            closeAudioStream();
        } catch (apiError) {
            // Close the stream immediately if the API call fails
            closeAudioStream();
            throw apiError;
        }

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
        closeAudioStream();
        // OpenAI client cleanup is handled automatically by the library
        // No manual cleanup needed for newer versions
    }
}
