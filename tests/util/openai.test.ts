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

    beforeEach(async () => {
        // Import modules after mocking
        openai = await import('openai');
        Storage = await import('../../src/util/storage');
        const openaiModule = await import('../../src/util/openai');
        createCompletion = openaiModule.createCompletion;
        transcribeAudio = openaiModule.transcribeAudio;

        // Set up environment
        process.env.OPENAI_API_KEY = 'test-api-key';
    });

    afterEach(() => {
        delete process.env.OPENAI_API_KEY;
        vi.clearAllMocks();
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
            delete process.env.OPENAI_API_KEY;
            await expect(createCompletion([{ role: 'user', content: 'test' }])).rejects.toThrow('OPENAI_API_KEY environment variable is not set');
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
            delete process.env.OPENAI_API_KEY;
            await expect(transcribeAudio('test.mp3')).rejects.toThrow('OPENAI_API_KEY environment variable is not set');
        });

        it('should throw error on API failure', async () => {
            mockTranscriptionsCreate.mockRejectedValue(new Error('API Error'));
            await expect(transcribeAudio('test.mp3')).rejects.toThrow('Failed to transcribe audio: API Error');
        });

        it('should throw error on empty response', async () => {
            mockTranscriptionsCreate.mockResolvedValue(null);
            await expect(transcribeAudio('test.mp3')).rejects.toThrow('No transcription received from OpenAI');
        });
    });
});
