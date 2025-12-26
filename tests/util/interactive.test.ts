import { describe, it, expect, beforeEach, vi } from 'vitest';
import { improveContentWithLLM } from '../../src/util/interactive';

vi.mock('../../src/logging', () => ({
    getDryRunLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn()
    })
}));

describe('interactive utilities', () => {
    describe('improveContentWithLLM', () => {
        it('should improve content using LLM', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({
                messages: [{ role: 'user', content: 'improve this' }]
            });

            const mockCallLLM = vi.fn().mockResolvedValue('improved content');

            const config = {
                contentType: 'commit message',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM,
                processResponse: (response: any) => response.toUpperCase()
            };

            const result = await improveContentWithLLM(
                'original content',
                { dryRun: false },
                { template: 'test' },
                {},
                '/tmp/output',
                config
            );

            expect(result).toBe('IMPROVED CONTENT');
            expect(mockCreatePrompt).toHaveBeenCalled();
            expect(mockCallLLM).toHaveBeenCalled();
        });

        it('should call createImprovedPrompt with correct parameters', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({});
            const mockCallLLM = vi.fn().mockResolvedValue('result');

            const config = {
                contentType: 'release notes',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM
            };

            await improveContentWithLLM(
                'test content',
                { debug: true },
                { template: 'release' },
                { repo: 'test-repo' },
                '/tmp/out',
                config
            );

            expect(mockCreatePrompt).toHaveBeenCalledWith(
                { template: 'release' },
                'test content',
                { repo: 'test-repo' }
            );
        });

        it('should pass improved prompt result to LLM', async () => {
            const promptResult = { messages: [{ role: 'system', content: 'You are an expert' }] };
            const mockCreatePrompt = vi.fn().mockResolvedValue(promptResult);
            const mockCallLLM = vi.fn().mockResolvedValue('llm output');

            const config = {
                contentType: 'test',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM
            };

            await improveContentWithLLM('content', {}, {}, {}, '/tmp', config);

            expect(mockCallLLM).toHaveBeenCalledWith(
                promptResult,
                {},
                '/tmp'
            );
        });

        it('should use processResponse if provided', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({});
            const mockCallLLM = vi.fn().mockResolvedValue({ raw: 'response' });
            const mockProcess = vi.fn().mockReturnValue('processed');

            const config = {
                contentType: 'test',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM,
                processResponse: mockProcess
            };

            const result = await improveContentWithLLM('content', {}, {}, {}, '/tmp', config);

            expect(mockProcess).toHaveBeenCalledWith({ raw: 'response' });
            expect(result).toBe('processed');
        });

        it('should return LLM response directly without processResponse', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({});
            const mockCallLLM = vi.fn().mockResolvedValue('direct response');

            const config = {
                contentType: 'test',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM
            };

            const result = await improveContentWithLLM('content', {}, {}, {}, '/tmp', config);

            expect(result).toBe('direct response');
        });

        it('should handle different content types', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({});
            const mockCallLLM = vi.fn().mockResolvedValue('improved');

            const config = {
                contentType: 'pull request description',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM
            };

            const result = await improveContentWithLLM('content', {}, {}, {}, '/tmp', config);

            expect(result).toBe('improved');
        });

        it('should propagate errors from createImprovedPrompt', async () => {
            const mockCreatePrompt = vi.fn().mockRejectedValue(new Error('Prompt creation failed'));
            const mockCallLLM = vi.fn();

            const config = {
                contentType: 'test',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM
            };

            await expect(
                improveContentWithLLM('content', {}, {}, {}, '/tmp', config)
            ).rejects.toThrow('Prompt creation failed');
        });

        it('should propagate errors from callLLM', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({});
            const mockCallLLM = vi.fn().mockRejectedValue(new Error('LLM call failed'));

            const config = {
                contentType: 'test',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM
            };

            await expect(
                improveContentWithLLM('content', {}, {}, {}, '/tmp', config)
            ).rejects.toThrow('LLM call failed');
        });

        it('should handle complex content types', async () => {
            const mockCreatePrompt = vi.fn().mockResolvedValue({});
            const mockCallLLM = vi.fn().mockResolvedValue({ nested: { data: 'value' } });

            const config = {
                contentType: 'complex type',
                createImprovedPrompt: mockCreatePrompt,
                callLLM: mockCallLLM,
                processResponse: (resp: any) => resp.nested.data
            };

            const result = await improveContentWithLLM(
                { complex: 'input' },
                { verbose: true },
                {},
                {},
                '/tmp',
                config
            );

            expect(result).toBe('value');
        });
    });
});

