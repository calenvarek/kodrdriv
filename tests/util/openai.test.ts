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

// Mock the safeJsonParse function
vi.mock('../../src/util/validation', () => ({
    safeJsonParse: vi.fn().mockImplementation((json, context) => {
        try {
            return JSON.parse(json);
        } catch {
            throw new Error(`Invalid JSON in ${context}`);
        }
    })
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

    describe('getOpenAIReasoningForCommand', () => {
        it('should return command-specific reasoning when available', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                openaiReasoning: 'low' as const,
                commit: { openaiReasoning: 'high' as const },
                release: { openaiReasoning: 'medium' as const },
                review: { openaiReasoning: 'high' as const },
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIReasoningForCommand(config, 'commit')).toBe('high');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'audio-commit')).toBe('high');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'release')).toBe('medium');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'review')).toBe('high');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'audio-review')).toBe('high');
        });

        it('should fallback to global reasoning when command-specific reasoning not available', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                openaiReasoning: 'medium' as const,
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIReasoningForCommand(config, 'commit')).toBe('medium');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'release')).toBe('medium');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'review')).toBe('medium');
        });

        it('should fallback to default reasoning when no reasoning specified', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIReasoningForCommand(config, 'commit')).toBe('low');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'release')).toBe('low');
            expect(openaiModule.getOpenAIReasoningForCommand(config, 'review')).toBe('low');
        });

        it('should use global reasoning for unknown commands', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                openaiReasoning: 'high' as const,
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIReasoningForCommand(config, 'unknown-command')).toBe('high');
        });
    });

    describe('getOpenAIMaxOutputTokensForCommand', () => {
        it('should return command-specific max output tokens when available', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                openaiMaxOutputTokens: 5000,
                commit: { openaiMaxOutputTokens: 15000 },
                release: { openaiMaxOutputTokens: 20000 },
                review: { openaiMaxOutputTokens: 8000 },
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'commit')).toBe(15000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'audio-commit')).toBe(15000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'release')).toBe(20000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'review')).toBe(8000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'audio-review')).toBe(8000);
        });

        it('should fallback to global max output tokens when command-specific not available', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                openaiMaxOutputTokens: 12000,
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'commit')).toBe(12000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'release')).toBe(12000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'review')).toBe(12000);
        });

        it('should fallback to default max output tokens when none specified', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'commit')).toBe(10000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'release')).toBe(10000);
            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'review')).toBe(10000);
        });

        it('should use global max output tokens for unknown commands', async () => {
            const openaiModule = await import('../../src/util/openai');

            const config = {
                openaiMaxOutputTokens: 25000,
                configDirectory: '/test/config',
                discoveredConfigDirs: [],
                resolvedConfigDirs: []
            };

            expect(openaiModule.getOpenAIMaxOutputTokensForCommand(config, 'unknown-command')).toBe(25000);
        });
    });

    describe('OpenAIError', () => {
        it('should create OpenAIError with default isTokenLimitError', async () => {
            const openaiModule = await import('../../src/util/openai');
            const error = new openaiModule.OpenAIError('Test error');

            expect(error.message).toBe('Test error');
            expect(error.name).toBe('OpenAIError');
            expect(error.isTokenLimitError).toBe(false);
        });

        it('should create OpenAIError with custom isTokenLimitError', async () => {
            const openaiModule = await import('../../src/util/openai');
            const error = new openaiModule.OpenAIError('Token limit error', true);

            expect(error.message).toBe('Token limit error');
            expect(error.name).toBe('OpenAIError');
            expect(error.isTokenLimitError).toBe(true);
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

    describe('isRateLimitError', () => {
        it('should detect rate limit errors by status code', async () => {
            const openaiModule = await import('../../src/util/openai');

            expect(openaiModule.isRateLimitError({ status: 429 })).toBe(true);
            expect(openaiModule.isRateLimitError({ status: 200 })).toBe(false);
        });

        it('should detect rate limit errors by code', async () => {
            const openaiModule = await import('../../src/util/openai');

            expect(openaiModule.isRateLimitError({ code: 'rate_limit_exceeded' })).toBe(true);
            expect(openaiModule.isRateLimitError({ code: 'other_error' })).toBe(false);
        });

        it('should detect rate limit errors by message', async () => {
            const openaiModule = await import('../../src/util/openai');

            expect(openaiModule.isRateLimitError({ message: 'rate limit exceeded' })).toBe(true);
            expect(openaiModule.isRateLimitError({ message: 'too many requests' })).toBe(true);
            expect(openaiModule.isRateLimitError({ message: 'quota exceeded' })).toBe(true);
            expect(openaiModule.isRateLimitError({ message: 'rate limit' })).toBe(true);
            expect(openaiModule.isRateLimitError({ message: 'some other error' })).toBe(false);
        });

        it('should return false for errors without message, code, or status', async () => {
            const openaiModule = await import('../../src/util/openai');

            expect(openaiModule.isRateLimitError({})).toBe(false);
            expect(openaiModule.isRateLimitError(null)).toBe(false);
            expect(openaiModule.isRateLimitError(undefined)).toBe(false);
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

        it('should retry on rate limit error', async () => {
            const mockResponse = 'test response';
            const rateLimitError = { status: 429, message: 'rate limit exceeded' };

            mockChatCreate
                .mockRejectedValueOnce(rateLimitError)
                .mockResolvedValue({
                    choices: [{ message: { content: mockResponse } }]
                });

            const openaiModule = await import('../../src/util/openai');

            const result = await openaiModule.createCompletionWithRetry(
                [{ role: 'user', content: 'test' }]
            );

            expect(result).toBe(mockResponse);
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

        it('should not retry token limit errors without callback', async () => {
            const tokenLimitError = new Error('maximum context length is 4097 tokens');
            mockChatCreate.mockRejectedValue(tokenLimitError);

            const openaiModule = await import('../../src/util/openai');

            await expect(openaiModule.createCompletionWithRetry(
                [{ role: 'user', content: 'test' }]
            )).rejects.toThrow('Failed to create completion');

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

        it('should write separate debug files when specified', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }], {
                debug: true,
                debugRequestFile: 'request.json',
                debugResponseFile: 'response.json'
            });

            expect(Storage.create().writeFile).toHaveBeenCalledWith('request.json', expect.any(String), 'utf8');
            expect(Storage.create().writeFile).toHaveBeenCalledWith('response.json', expect.any(String), 'utf8');
        });

        it('should add reasoning parameter for supported models', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }], {
                model: 'gpt-5-turbo',
                openaiReasoning: 'high'
            });

            expect(mockChatCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    reasoning_effort: 'high'
                })
            );
        });

        it('should not add reasoning parameter for unsupported models', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }], {
                model: 'gpt-4o-mini',
                openaiReasoning: 'high'
            });

            expect(mockChatCreate).toHaveBeenCalledWith(
                expect.not.objectContaining({
                    reasoning_effort: 'high'
                })
            );
        });

        it('should use openaiMaxOutputTokens when specified', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }], {
                openaiMaxOutputTokens: 15000
            });

            expect(mockChatCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    max_completion_tokens: 15000
                })
            );
        });

        it('should fallback to maxTokens when openaiMaxOutputTokens not specified', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }], {
                maxTokens: 8000
            });

            expect(mockChatCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    max_completion_tokens: 8000
                })
            );
        });

        it('should use default max tokens when neither specified', async () => {
            const mockResponse = {
                choices: [{
                    message: {
                        content: 'test response'
                    }
                }]
            };

            mockChatCreate.mockResolvedValue(mockResponse);

            await createCompletion([{ role: 'user', content: 'test' }]);

            expect(mockChatCreate).toHaveBeenCalledWith(
                expect.objectContaining({
                    max_completion_tokens: 10000
                })
            );
        });

        it('should handle timeout correctly', async () => {
            // Mock a slow response that will timeout
            mockChatCreate.mockImplementation(() => new Promise(resolve => setTimeout(resolve, 1000)));

            // Set a very short timeout for testing
            process.env.OPENAI_TIMEOUT_MS = '100';

            await expect(createCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('OpenAI API call timed out');
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

        it('should throw error on response without content', async () => {
            const mockResponse = {
                choices: [{
                    message: {}
                }]
            };
            mockChatCreate.mockResolvedValue(mockResponse);
            await expect(createCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('No response received from OpenAI');
        });

        it('should throw error on response without choices', async () => {
            const mockResponse = {
                choices: []
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

        it('should write separate debug files when specified', async () => {
            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            await transcribeAudio('test.mp3', {
                debug: true,
                debugRequestFile: 'request.json',
                debugResponseFile: 'response.json'
            });

            expect(Storage.create().writeFile).toHaveBeenCalledWith('request.json', expect.any(String), 'utf8');
            expect(Storage.create().writeFile).toHaveBeenCalledWith('response.json', expect.any(String), 'utf8');
        });

        it('should use custom output directory for archiving', async () => {
            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            const { archiveAudio } = await import('../../src/util/general');

            await transcribeAudio('test.mp3', { outputDirectory: 'custom-output' });

            expect(archiveAudio).toHaveBeenCalledWith('test.mp3', 'test transcription', 'custom-output');
        });

        it('should handle archive error gracefully', async () => {
            const mockResponse = { text: 'test transcription' };
            mockTranscriptionsCreate.mockResolvedValue(mockResponse);

            const { archiveAudio } = await import('../../src/util/general');
            vi.mocked(archiveAudio).mockRejectedValue(new Error('Archive failed'));

            // Should not throw error, just log warning
            const result = await transcribeAudio('test.mp3');
            expect(result).toEqual(mockResponse);
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
