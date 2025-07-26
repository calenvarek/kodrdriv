import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from 'winston';
import {
    handleCommandError,
    executeWithErrorHandling,
    createSuccessResult,
    createErrorResult,
    ErrorHandlerOptions,
    CommandResult,
    Command
} from '../../src/util/errorHandler';
import {
    CommandError,
    UserCancellationError,
    PullRequestCheckError,
    ConfigurationError,
    ValidationError
} from '../../src/error/CommandErrors';

// Mock logger
const createMockLogger = (): Logger => {
    const logger = {
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        isDebugEnabled: vi.fn().mockReturnValue(false),
    };
    return logger as any as Logger;
};

// Mock process.exit
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
    throw new Error('process.exit called');
});

describe('errorHandler', () => {
    let mockLogger: Logger;

    beforeEach(() => {
        mockLogger = createMockLogger();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('handleCommandError', () => {
        const getDefaultOptions = (): ErrorHandlerOptions => ({
            logger: mockLogger,
            command: 'test-command'
        });

                describe('UserCancellationError handling', () => {
            test('should log info message and not exit by default', async () => {
                const error = new UserCancellationError('Test cancellation');

                await handleCommandError(error, getDefaultOptions());

                expect(mockLogger.info).toHaveBeenCalledWith('Test cancellation');
                expect(mockExit).not.toHaveBeenCalled();
            });

            test('should exit with code 0 when exitOnError is true', async () => {
                const error = new UserCancellationError('Test cancellation');

                await expect(
                    handleCommandError(error, { ...getDefaultOptions(), exitOnError: true })
                ).rejects.toThrow('process.exit called');

                expect(mockLogger.info).toHaveBeenCalledWith('Test cancellation');
                expect(mockExit).toHaveBeenCalledWith(0);
            });

            test('should use default message when none provided', async () => {
                const error = new UserCancellationError();

                await handleCommandError(error, getDefaultOptions());

                expect(mockLogger.info).toHaveBeenCalledWith('Operation cancelled by user');
            });
        });

        describe('PullRequestCheckError handling', () => {
            test('should handle PullRequestCheckError with detailed error info', async () => {
                const failedChecks = [
                    {
                        name: 'test-check',
                        conclusion: 'failure',
                        detailsUrl: 'https://example.com/details',
                        summary: 'Test failed'
                    }
                ];
                const error = new PullRequestCheckError(
                    'PR checks failed',
                    123,
                    failedChecks,
                    'https://github.com/test/repo/pull/123',
                    'feature-branch'
                );

                await expect(
                    handleCommandError(error, getDefaultOptions())
                ).rejects.toThrow(error);

                expect(mockLogger.error).toHaveBeenCalledWith('test-command failed: PR checks failed');
                expect(mockLogger.info).toHaveBeenCalledWith('Detailed recovery instructions were provided above.');
                expect(mockExit).not.toHaveBeenCalled();
            });

            test('should exit with code 1 when exitOnError is true', async () => {
                const failedChecks = [
                    {
                        name: 'test-check',
                        conclusion: 'failure'
                    }
                ];
                const error = new PullRequestCheckError(
                    'PR checks failed',
                    123,
                    failedChecks,
                    'https://github.com/test/repo/pull/123'
                );

                await expect(
                    handleCommandError(error, { ...getDefaultOptions(), exitOnError: true })
                ).rejects.toThrow('process.exit called');

                expect(mockExit).toHaveBeenCalledWith(1);
            });
        });

        describe('CommandError handling', () => {
            test('should handle basic CommandError', async () => {
                const error = new CommandError('Test error', 'TEST_ERROR', false);

                await expect(
                    handleCommandError(error, getDefaultOptions())
                ).rejects.toThrow(error);

                expect(mockLogger.error).toHaveBeenCalledWith('test-command failed: Test error');
                expect(mockExit).not.toHaveBeenCalled();
            });

            test('should handle CommandError with cause', async () => {
                const cause = new Error('Root cause');
                const error = new CommandError('Test error', 'TEST_ERROR', false, cause);

                await expect(
                    handleCommandError(error, getDefaultOptions())
                ).rejects.toThrow(error);

                expect(mockLogger.error).toHaveBeenCalledWith('test-command failed: Test error');
                expect(mockLogger.debug).toHaveBeenCalledWith('Caused by: Root cause');
            });

            test('should log stack trace when debug is enabled', async () => {
                const debugLogger = {
                    ...mockLogger,
                    isDebugEnabled: vi.fn().mockReturnValue(true)
                } as any;

                const cause = new Error('Root cause');
                cause.stack = 'Test stack trace';
                const error = new CommandError('Test error', 'TEST_ERROR', false, cause);

                await expect(
                    handleCommandError(error, { ...getDefaultOptions(), logger: debugLogger })
                ).rejects.toThrow(error);

                expect(debugLogger.debug).toHaveBeenCalledWith('Stack trace:', 'Test stack trace');
            });

            test('should show recovery message for recoverable errors', async () => {
                const error = new CommandError('Test error', 'TEST_ERROR', true);

                await expect(
                    handleCommandError(error, getDefaultOptions())
                ).rejects.toThrow(error);

                expect(mockLogger.info).toHaveBeenCalledWith(
                    'This error is recoverable. You may try again or adjust your configuration.'
                );
            });

            test('should exit with code 1 when exitOnError is true', async () => {
                const error = new CommandError('Test error', 'TEST_ERROR', false);

                await expect(
                    handleCommandError(error, { ...getDefaultOptions(), exitOnError: true })
                ).rejects.toThrow('process.exit called');

                expect(mockExit).toHaveBeenCalledWith(1);
            });
        });

        describe('unexpected error handling', () => {
            test('should handle unexpected errors', async () => {
                const error = new Error('Unexpected error');

                await expect(
                    handleCommandError(error, getDefaultOptions())
                ).rejects.toThrow(error);

                expect(mockLogger.error).toHaveBeenCalledWith(
                    'test-command encountered unexpected error: Unexpected error'
                );
                expect(mockExit).not.toHaveBeenCalled();
            });

            test('should log stack trace for unexpected errors when debug enabled', async () => {
                const debugLogger = {
                    ...mockLogger,
                    isDebugEnabled: vi.fn().mockReturnValue(true)
                } as any;

                const error = new Error('Unexpected error');
                error.stack = 'Test stack trace';

                await expect(
                    handleCommandError(error, { ...getDefaultOptions(), logger: debugLogger })
                ).rejects.toThrow(error);

                expect(debugLogger.debug).toHaveBeenCalledWith('Stack trace:', 'Test stack trace');
            });

            test('should exit with code 1 when exitOnError is true', async () => {
                const error = new Error('Unexpected error');

                await expect(
                    handleCommandError(error, { ...getDefaultOptions(), exitOnError: true })
                ).rejects.toThrow('process.exit called');

                expect(mockExit).toHaveBeenCalledWith(1);
            });
        });
    });

    describe('executeWithErrorHandling', () => {
        test('should return result on successful execution', async () => {
            const mockExecution = vi.fn().mockResolvedValue('success result');

            const result = await executeWithErrorHandling(
                'test-command',
                mockLogger,
                mockExecution,
                false // exitOnError = false to avoid process.exit in tests
            );

            expect(result).toBe('success result');
            expect(mockExecution).toHaveBeenCalledOnce();
        });

        test('should handle errors and exit by default', async () => {
            const error = new Error('Test error');
            const mockExecution = vi.fn().mockRejectedValue(error);

            await expect(
                executeWithErrorHandling('test-command', mockLogger, mockExecution)
            ).rejects.toThrow('process.exit called');

            expect(mockExit).toHaveBeenCalledWith(1);
        });

        test('should handle errors without exiting when exitOnError is false', async () => {
            const error = new CommandError('Test error', 'TEST_ERROR');
            const mockExecution = vi.fn().mockRejectedValue(error);

            await expect(
                executeWithErrorHandling('test-command', mockLogger, mockExecution, false)
            ).rejects.toThrow(error);

            expect(mockExit).not.toHaveBeenCalled();
        });

        test('should handle UserCancellationError without exiting', async () => {
            const error = new UserCancellationError('User cancelled');
            const mockExecution = vi.fn().mockRejectedValue(error);

            await expect(
                executeWithErrorHandling('test-command', mockLogger, mockExecution, false)
            ).rejects.toThrow(error);

            expect(mockLogger.info).toHaveBeenCalledWith('User cancelled');
            expect(mockExit).not.toHaveBeenCalled();
        });
    });

    describe('createSuccessResult', () => {
        test('should create success result with data only', () => {
            const result = createSuccessResult('test data');

            expect(result).toEqual({
                success: true,
                data: 'test data'
            });
        });

        test('should create success result with data and warnings', () => {
            const warnings = ['Warning 1', 'Warning 2'];
            const result = createSuccessResult('test data', warnings);

            expect(result).toEqual({
                success: true,
                data: 'test data',
                warnings
            });
        });

        test('should handle complex data types', () => {
            const complexData = {
                items: [1, 2, 3],
                metadata: { count: 3 }
            };
            const result = createSuccessResult(complexData);

            expect(result).toEqual({
                success: true,
                data: complexData
            });
        });
    });

    describe('createErrorResult', () => {
        test('should create error result with error only', () => {
            const error = new CommandError('Test error', 'TEST_ERROR');
            const result = createErrorResult(error);

            expect(result).toEqual({
                success: false,
                error
            });
        });

        test('should create error result with error and warnings', () => {
            const error = new CommandError('Test error', 'TEST_ERROR');
            const warnings = ['Warning 1', 'Warning 2'];
            const result = createErrorResult(error, warnings);

            expect(result).toEqual({
                success: false,
                error,
                warnings
            });
        });

        test('should handle different error types', () => {
            const configError = new ConfigurationError('Config missing');
            const result = createErrorResult(configError);

            expect(result).toEqual({
                success: false,
                error: configError
            });
            expect(result.error?.name).toBe('ConfigurationError');
        });
    });

    describe('integration tests', () => {
        test('should handle command execution lifecycle', async () => {
            // Mock command that succeeds
            const mockCommand: Command = {
                execute: vi.fn().mockResolvedValue(createSuccessResult('Command completed')),
                validate: vi.fn().mockResolvedValue(undefined)
            };

            const result = await executeWithErrorHandling(
                'test-command',
                mockLogger,
                async () => {
                    await mockCommand.validate?.({});
                    return await mockCommand.execute({});
                },
                false
            );

            expect(result.success).toBe(true);
            expect(result.data).toBe('Command completed');
        });

        test('should handle command execution with validation error', async () => {
            const validationError = new ValidationError('Invalid input');
            const mockCommand: Command = {
                execute: vi.fn(),
                validate: vi.fn().mockRejectedValue(validationError)
            };

            await expect(
                executeWithErrorHandling(
                    'test-command',
                    mockLogger,
                    async () => {
                        await mockCommand.validate?.({});
                        return await mockCommand.execute({});
                    },
                    false
                )
            ).rejects.toThrow(validationError);

            expect(mockCommand.execute).not.toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith('test-command failed: Invalid input');
        });
    });
});
