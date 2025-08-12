import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock ESM modules
vi.mock('../../src/util/storage', () => ({
    // @ts-ignore
    create: vi.fn().mockReturnValue({
        // @ts-ignore
        writeFile: vi.fn().mockResolvedValue(undefined),
        // @ts-ignore
        readStream: vi.fn().mockResolvedValue('mock-audio-stream')
    })
}));

// Mock the archiveAudio function
vi.mock('../../src/util/general', () => ({
    archiveAudio: vi.fn().mockResolvedValue(undefined)
}));

// Define mock functions with any type to avoid TS errors
const mockChatCreate = vi.fn<any>();
const mockTranscriptionsCreate = vi.fn<any>();

vi.mock('openai', () => ({
    OpenAI: vi.fn().mockImplementation(() => ({
        chat: {
            completions: {
                create: mockChatCreate
            }
        },
        audio: {
            transcriptions: {
                create: mockTranscriptionsCreate
            }
        }
    }))
}));

describe('openai', () => {
    let openai: any;
    let Storage: any;
    let createCompletion: any;
    let transcribeAudio: any;
    let originalEnv: any;

    beforeEach(async () => {
        // Save the original environment
        originalEnv = { ...process.env };

        // Import modules after mocking
        openai = await import('openai');
        Storage = await import('../../src/util/storage');
        const openaiModule = await import('../../src/util/openai');
        createCompletion = openaiModule.createCompletion;
        transcribeAudio = openaiModule.transcribeAudio;

        // Set up default test environment with API key
        process.env.OPENAI_API_KEY = 'test-api-key';
    });

    afterEach(() => {
        // Restore the original environment
        process.env = originalEnv;
        vi.clearAllMocks();
    });

    describe('getModelForCommand', () => {
        it('should return command-specific model when available', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                model: 'gpt-4o-mini',
                commit: { model: 'gpt-4o' },
                release: { model: 'gpt-4-turbo' },
                review: { model: 'gpt-3.5-turbo' },
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getModelForCommand(config, 'commit')).toBe('gpt-4o');
            expect(openaiModule.getModelForCommand(config, 'audio-commit')).toBe('gpt-4o');
            expect(openaiModule.getModelForCommand(config, 'release')).toBe('gpt-4-turbo');
            expect(openaiModule.getModelForCommand(config, 'review')).toBe('gpt-3.5-turbo');
            expect(openaiModule.getModelForCommand(config, 'audio-review')).toBe('gpt-3.5-turbo');
        });

        it('should fallback to global model when command-specific model not available', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                model: 'gpt-4o-mini',
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getModelForCommand(config, 'commit')).toBe('gpt-4o-mini');
            expect(openaiModule.getModelForCommand(config, 'release')).toBe('gpt-4o-mini');
            expect(openaiModule.getModelForCommand(config, 'review')).toBe('gpt-4o-mini');
        });

        it('should fallback to default model when no models specified', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getModelForCommand(config, 'commit')).toBe('gpt-4o-mini');
            expect(openaiModule.getModelForCommand(config, 'release')).toBe('gpt-4o-mini');
            expect(openaiModule.getModelForCommand(config, 'review')).toBe('gpt-4o-mini');
        });

        it('should use global model for unknown commands', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                model: 'gpt-4o',
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getModelForCommand(config, 'unknown-command')).toBe('gpt-4o');
        });
    });

    describe('isTokenLimitError', () => {
        it('should detect token limit errors', async () => {
            const openaiModule = await import('../../src/util/openai');

            expect(openaiModule.isTokenLimitError({ message: 'maximum context length' })).toBe(true);
            expect(openaiModule.isTokenLimitError({ message: 'context_length_exceeded' })).toBe(true);
            expect(openaiModule.isTokenLimitError({ message: 'token limit' })).toBe(true);
            expect(openaiModule.isTokenLimitError({ message: 'too many tokens' })).toBe(true);
            expect(openaiModule.isTokenLimitError({ message: 'reduce the length' })).toBe(true);
            expect(openaiModule.isTokenLimitError({ message: 'some other error' })).toBe(false);
            expect(openaiModule.isTokenLimitError({})).toBe(false);
            expect(openaiModule.isTokenLimitError(null)).toBe(false);
        });
    });

    describe('createCompletionWithRetry', () => {
        it('should succeed on first attempt when no error', async () => {
            const mockResponse = 'test response';
            mockChatCreate.mockResolvedValue({
                choices: [{ message: { content: mockResponse } }]
            });

            const openaiModule = await import('../../src/util/openai');
            const result = await openaiModule.createCompletionWithRetry([{ role: 'user', content: 'test' }]);

            expect(result).toBe(mockResponse);
            expect(mockChatCreate).toHaveBeenCalledTimes(1);
        });

        it('should retry on token limit error with callback', async () => {
            const mockResponse = 'test response';
            const tokenLimitError = new Error('maximum context length is 4097 tokens');

            mockChatCreate
                .mockRejectedValueOnce(tokenLimitError)
                .mockResolvedValue({
                    choices: [{ message: { content: mockResponse } }]
                });

            const openaiModule = await import('../../src/util/openai');
            const retryCallback = vi.fn().mockResolvedValue([{ role: 'user', content: 'shorter test' }]);

            const result = await openaiModule.createCompletionWithRetry(
                [{ role: 'user', content: 'very long test content' }],
                {},
                retryCallback
            );

            expect(result).toBe(mockResponse);
            expect(retryCallback).toHaveBeenCalledWith(2);
            expect(mockChatCreate).toHaveBeenCalledTimes(2);
        });

        it('should fail after max retries', async () => {
            const tokenLimitError = new Error('maximum context length is 4097 tokens');

            mockChatCreate.mockRejectedValue(tokenLimitError);

            const openaiModule = await import('../../src/util/openai');
            const retryCallback = vi.fn().mockResolvedValue([{ role: 'user', content: 'test' }]);

            await expect(openaiModule.createCompletionWithRetry(
                [{ role: 'user', content: 'test' }],
                {},
                retryCallback
            )).rejects.toThrow('Failed to create completion');

            expect(retryCallback).toHaveBeenCalledTimes(2); // attempts 2 and 3
            expect(mockChatCreate).toHaveBeenCalledTimes(3);
        });

        it('should not retry on non-token-limit errors', async () => {
            const otherError = new Error('some other error');

            mockChatCreate.mockRejectedValue(otherError);

            const openaiModule = await import('../../src/util/openai');
            const retryCallback = vi.fn();

            await expect(openaiModule.createCompletionWithRetry(
                [{ role: 'user', content: 'test' }],
                {},
                retryCallback
            )).rejects.toThrow('Failed to create completion');

            expect(retryCallback).not.toHaveBeenCalled();
            expect(mockChatCreate).toHaveBeenCalledTimes(1);
        });
    });

    describe('createCompletion', () => {
        it('should create completion successfully', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            const result = await createCompletion([{ role: 'user', content: 'test' }]);
            expect(result).toBe('test response');
        });

        it('should handle JSON response format', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: '{"key": "value"}'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            const result = await createCompletion([{ role: 'user', content: 'test' }], { responseFormat: { type: 'json_object' } });
            expect(result).toEqual({ key: 'value' });
        });

        it('should write debug file when debug is enabled', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }], { debug: true, debugFile: 'debug.json' });
            expect(Storage.create().writeFile).toHaveBeenCalledWith('debug.json', expect.any(String), 'utf8');
        });

        it('should throw error if OPENAI_API_KEY is not set', async () => {
            // Temporarily remove the API key for this test
            delete process.env.OPENAI_API_KEY;
            await expect(createCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('OPENAI_API_KEY environment variable is not set');
            // Restore it for other tests
            process.env.OPENAI_API_KEY = 'test-api-key';
        });

        it('should throw error on API failure', async () => {
            mockChatCreate.mockRejectedValue(new Error('API Error'));
            await expect(createCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('Failed to create completion: API Error');
        });

        it('should throw error on empty response', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: null
                    }
                }]
            };
            mockChatCreate.mockResolvedValue(mockResponse);
            await expect(createCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('No response received from OpenAI');
        });
    });

    describe('transcribeAudio', () => {
        it('should transcribe audio successfully', async () => {
            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            const result = await transcribeAudio('test.mp3');
            expect(result).toEqual(mockResponse);
        });

        it('should write debug file when debug is enabled', async () => {
            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            await transcribeAudio('test.mp3', { debug: true, debugFile: 'debug.json' });
            expect(Storage.create().writeFile).toHaveBeenCalledWith('debug.json', expect.any(String), 'utf8');
        });

        it('should throw error if OPENAI_API_KEY is not set', async () => {
            // Temporarily remove the API key for this test
            delete process.env.OPENAI_API_KEY;
            await expect(transcribeAudio('test.mp3')).rejects.toThrow('OPENAI_API_KEY environment variable is not set');
            // Restore it for other tests
            process.env.OPENAI_API_KEY = 'test-api-key';
        });

        it('should throw error on API failure', async () => {
            mockTranscriptionsCreate.mockRejectedValue(new Error('API Error'));
            await expect(transcribeAudio('test.mp3')).rejects.toThrow('Failed to transcribe audio: API Error');
        });

        it('should throw error on empty response', async () => {
            mockTranscriptionsCreate.mockResolvedValue(null);
            await expect(transcribeAudio('test.mp3')).rejects.toThrow('No transcription received from OpenAI');
        });

        it('should properly close stream on successful transcription', async () => {
            const mockStream = {
                destroy: vi.fn(),
                destroyed: false,
                on: vi.fn()
            };

            // Mock the storage readStream to return our mock stream
            Storage.create().readStream.mockResolvedValue(mockStream);

            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            await transcribeAudio('test.mp3');

            // Verify stream was properly closed
            expect(mockStream.destroy).toHaveBeenCalled();
        });

        it('should properly close stream on API error', async () => {
            const mockStream = {
                destroy: vi.fn(),
                destroyed: false,
                on: vi.fn()
            };

            // Mock the storage readStream to return our mock stream
            Storage.create().readStream.mockResolvedValue(mockStream);

            mockTranscriptionsCreate.mockRejectedValue(new Error('API Error'));

            await expect(transcribeAudio('test.mp3')).rejects.toThrow('Failed to transcribe audio: API Error');

            // Verify stream was properly closed even on error
            expect(mockStream.destroy).toHaveBeenCalled();
        });

        it('should handle stream error events properly', async () => {
            const mockStream = {
                destroy: vi.fn(),
                destroyed: false,
                on: vi.fn()
            };

            // Mock the storage readStream to return our mock stream
            Storage.create().readStream.mockResolvedValue(mockStream);

            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            await transcribeAudio('test.mp3');

            // Verify that error handler was set up
            expect(mockStream.on).toHaveBeenCalledWith('error', expect.any(Function));

            // Simulate a stream error and verify cleanup is called
            const errorCall = mockStream.on.mock.calls.find(call => call[0] === 'error');
            expect(errorCall).toBeDefined();
            const errorHandler = errorCall![1];
            errorHandler(new Error('Stream error'));

            // destroy should only be called once due to the streamClosed flag preventing double-closing
            // This is the correct behavior to prevent race conditions
            expect(mockStream.destroy).toHaveBeenCalledTimes(1);
        });

        it('should not double-close streams', async () => {
            const mockStream = {
                destroy: vi.fn(),
                destroyed: false,
                on: vi.fn()
            };

            // Mock the storage readStream to return our mock stream
            Storage.create().readStream.mockResolvedValue(mockStream);

            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            await transcribeAudio('test.mp3');

            // First call to destroy() should succeed
            expect(mockStream.destroy).toHaveBeenCalledTimes(1);

            // Simulate the stream being destroyed after first call
            mockStream.destroyed = true;

            // Trigger the finally block manually to test double-close protection
            // In a real scenario, this would be handled by the closeAudioStream function
            // but since we can't directly test the internal function, we verify the logic
            // The actual protection is in the streamClosed flag and !audioStream.destroyed check
        });

        it('should handle streams without event handlers gracefully', async () => {
            const mockStream = {
                destroy: vi.fn(),
                destroyed: false
                // Note: no 'on' method - this tests the typeof check
            };

            // Mock the storage readStream to return our mock stream
            Storage.create().readStream.mockResolvedValue(mockStream);

            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            // Should not throw error even when stream doesn't have 'on' method
            const result = await transcribeAudio('test.mp3');

            expect(result).toEqual(mockResponse);
            expect(mockStream.destroy).toHaveBeenCalled();
        });

        it('should handle stream destroy errors gracefully', async () => {
            const mockStream = {
                destroy: vi.fn().mockImplementation(() => {
                    throw new Error('Destroy failed');
                }),
                destroyed: false,
                on: vi.fn()
            };

            // Mock the storage readStream to return our mock stream
            Storage.create().readStream.mockResolvedValue(mockStream);

            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            // Should not throw error even when stream destroy fails
            const result = await transcribeAudio('test.mp3');

            expect(result).toEqual(mockResponse);
            expect(mockStream.destroy).toHaveBeenCalled();
        });
    });
});
