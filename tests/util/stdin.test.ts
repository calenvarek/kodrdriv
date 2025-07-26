import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readStdin, promptConfirmation } from '../../src/util/stdin';
import { EventEmitter } from 'events';

// Mock process.stdin
const mockStdin = new EventEmitter();

// Add stream methods and properties
(mockStdin as any).isTTY = false;
(mockStdin as any).setEncoding = vi.fn();
(mockStdin as any).resume = vi.fn();
(mockStdin as any).pause = vi.fn();
(mockStdin as any).removeListener = vi.fn();

// Mock process.stdout
const mockStdout = {
    write: vi.fn(),
};

// Mock process
const originalProcess = process;
const mockProcess = {
    ...originalProcess,
    stdin: mockStdin,
    stdout: mockStdout,
    env: { ...originalProcess.env },
};

// Replace global process
vi.stubGlobal('process', mockProcess);

describe('readStdin', () => {
    let originalNodeEnv: string | undefined;
    let originalVitest: string | undefined;

    beforeEach(() => {
        originalNodeEnv = process.env.NODE_ENV;
        originalVitest = process.env.VITEST;

        // Reset mocks
        vi.clearAllMocks();

        // Reset stdin TTY status
        (mockStdin as any).isTTY = false;

        // Reset event listeners
        mockStdin.removeAllListeners();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.VITEST = originalVitest;

        // Clean up any remaining listeners
        mockStdin.removeAllListeners();
    });

    describe('in test environment', () => {
        it('should return null when no data is available within timeout (NODE_ENV=test)', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 15));

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should return null when no data is available within timeout (VITEST=true)', async () => {
            process.env.VITEST = 'true';
            delete process.env.NODE_ENV;

            const promise = readStdin();

            // Wait for timeout
            await new Promise(resolve => setTimeout(resolve, 15));

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should return trimmed input when data is available', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            // Simulate data
            setTimeout(() => {
                mockStdin.emit('data', 'hello world\n');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBe('hello world');
        });

        it('should accumulate multiple data chunks', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            // Simulate multiple data chunks
            setTimeout(() => {
                mockStdin.emit('data', 'hello ');
                mockStdin.emit('data', 'world');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBe('hello world');
        });

        it('should return null when input is empty or only whitespace', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            // Simulate empty data
            setTimeout(() => {
                mockStdin.emit('data', '   \n  \t  ');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should handle error events gracefully', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            // Simulate error
            setTimeout(() => {
                mockStdin.emit('error', new Error('Test error'));
            }, 5);

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should cleanup listeners properly', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            // Simulate data to trigger cleanup
            setTimeout(() => {
                mockStdin.emit('data', 'test');
                mockStdin.emit('end');
            }, 5);

            await promise;

            // Verify cleanup methods were called
            expect((mockStdin as any).removeListener).toHaveBeenCalledWith('data', expect.any(Function));
            expect((mockStdin as any).removeListener).toHaveBeenCalledWith('end', expect.any(Function));
            expect((mockStdin as any).removeListener).toHaveBeenCalledWith('error', expect.any(Function));
            expect((mockStdin as any).pause).toHaveBeenCalled();
        });
    });

    describe('in production environment', () => {
        beforeEach(() => {
            delete process.env.NODE_ENV;
            delete process.env.VITEST;
        });

        it('should return null when stdin is TTY', async () => {
            (mockStdin as any).isTTY = true;

            const result = await readStdin();
            expect(result).toBeNull();
        });

        it('should return null when no data is available within timeout', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            // Wait for timeout (100ms + buffer)
            await new Promise(resolve => setTimeout(resolve, 120));

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should return trimmed input when data is available', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            // Simulate data before timeout
            setTimeout(() => {
                mockStdin.emit('data', '  test input  \n');
                mockStdin.emit('end');
            }, 50);

            const result = await promise;
            expect(result).toBe('test input');
        });

        it('should handle large input data', async () => {
            (mockStdin as any).isTTY = false;

            const largeInput = 'x'.repeat(10000);
            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', largeInput);
                mockStdin.emit('end');
            }, 50);

            const result = await promise;
            expect(result).toBe(largeInput);
        });

        it('should handle multiple data chunks in production', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', 'chunk1 ');
                mockStdin.emit('data', 'chunk2 ');
                mockStdin.emit('data', 'chunk3');
                mockStdin.emit('end');
            }, 50);

            const result = await promise;
            expect(result).toBe('chunk1 chunk2 chunk3');
        });

        it('should handle error events in production', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('error', new Error('Production error'));
            }, 50);

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should setup stdin correctly', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', 'test');
                mockStdin.emit('end');
            }, 50);

            await promise;

            // Verify stdin was configured correctly
            expect((mockStdin as any).setEncoding).toHaveBeenCalledWith('utf8');
            expect((mockStdin as any).resume).toHaveBeenCalled();
        });

        it('should not resolve multiple times', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', 'first');
                mockStdin.emit('end');
                // Try to emit more events after end
                mockStdin.emit('data', 'second');
                mockStdin.emit('error', new Error('Should not affect result'));
            }, 50);

            const result = await promise;
            expect(result).toBe('first');
        });

        it('should handle onEnd event after already resolved via timeout', async () => {
            (mockStdin as any).isTTY = false;

            const promise = readStdin();

            // Wait for timeout to trigger resolution
            await new Promise(resolve => setTimeout(resolve, 120));

            // Now emit end event after timeout resolution
            mockStdin.emit('end');

            const result = await promise;
            expect(result).toBeNull();
        });
    });

    describe('edge cases', () => {
        it('should handle newline-only input', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', '\n');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should handle mixed whitespace input', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', ' \t\n\r ');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBeNull();
        });

        it('should preserve internal whitespace', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', '  hello   world  \n');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBe('hello   world');
        });

        it('should handle Unicode characters', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', 'Hello 世界 🌍\n');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBe('Hello 世界 🌍');
        });

        it('should handle simultaneous data and end events', async () => {
            process.env.NODE_ENV = 'test';

            const promise = readStdin();

            setTimeout(() => {
                mockStdin.emit('data', 'simultaneous');
                mockStdin.emit('end');
            }, 5);

            const result = await promise;
            expect(result).toBe('simultaneous');
        });
    });
});

describe('promptConfirmation', () => {
    let originalNodeEnv: string | undefined;
    let originalVitest: string | undefined;

    beforeEach(() => {
        originalNodeEnv = process.env.NODE_ENV;
        originalVitest = process.env.VITEST;

        // Reset mocks
        vi.clearAllMocks();

        // Reset stdin TTY status
        (mockStdin as any).isTTY = false;

        // Reset event listeners
        mockStdin.removeAllListeners();
    });

    afterEach(() => {
        process.env.NODE_ENV = originalNodeEnv;
        process.env.VITEST = originalVitest;

        // Clean up any remaining listeners
        mockStdin.removeAllListeners();
    });

    describe('in test environment', () => {
        it('should return true immediately when NODE_ENV=test', async () => {
            process.env.NODE_ENV = 'test';

            const result = await promptConfirmation('Test message');
            expect(result).toBe(true);

            // Should not interact with stdin/stdout in test mode
            expect(mockStdout.write).not.toHaveBeenCalled();
            expect((mockStdin as any).setEncoding).not.toHaveBeenCalled();
        });

        it('should return true immediately when VITEST=true', async () => {
            process.env.VITEST = 'true';
            delete process.env.NODE_ENV;

            const result = await promptConfirmation('Test message');
            expect(result).toBe(true);

            // Should not interact with stdin/stdout in test mode
            expect(mockStdout.write).not.toHaveBeenCalled();
            expect((mockStdin as any).setEncoding).not.toHaveBeenCalled();
        });
    });

    describe('in production environment', () => {
        beforeEach(() => {
            delete process.env.NODE_ENV;
            delete process.env.VITEST;
        });

        it('should write message and prompt to stdout', async () => {
            const promise = promptConfirmation('Are you sure?');

            // Give it a moment to setup
            await new Promise(resolve => setTimeout(resolve, 5));

            expect(mockStdout.write).toHaveBeenCalledWith('Are you sure?\n');
            expect(mockStdout.write).toHaveBeenCalledWith('Please enter "y" for yes or "n" for no: ');

            // Resolve with 'y' to clean up
            mockStdin.emit('data', 'y\n');
            await promise;
        });

        it('should return true for "y" input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'y\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should return true for "yes" input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'yes\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should return false for "n" input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'n\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(false);
        });

        it('should return false for "no" input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'no\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(false);
        });

        it('should handle case-insensitive input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'YES\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should handle input with extra whitespace', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', '  y  \n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);
        });

        it('should re-prompt for invalid input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                // First invalid input
                mockStdin.emit('data', 'maybe\n');
            }, 5);

            setTimeout(() => {
                // Second invalid input
                mockStdin.emit('data', 'sure\n');
            }, 10);

            setTimeout(() => {
                // Valid input
                mockStdin.emit('data', 'y\n');
            }, 15);

            const result = await promise;
            expect(result).toBe(true);

            // Should have prompted 3 times (initial + 2 re-prompts)
            expect(mockStdout.write).toHaveBeenCalledWith('Please enter "y" for yes or "n" for no: ');
            expect(mockStdout.write).toHaveBeenCalledTimes(4); // message + 3 prompts
        });

        it('should setup stdin correctly', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'y\n');
            }, 5);

            await promise;

            expect((mockStdin as any).setEncoding).toHaveBeenCalledWith('utf8');
            expect((mockStdin as any).resume).toHaveBeenCalled();
        });

        it('should cleanup listeners after valid input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'n\n');
            }, 5);

            await promise;

            expect((mockStdin as any).removeListener).toHaveBeenCalledWith('data', expect.any(Function));
            expect((mockStdin as any).pause).toHaveBeenCalled();
        });

        it('should handle multiple rapid invalid inputs', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'invalid1\n');
                mockStdin.emit('data', 'invalid2\n');
                mockStdin.emit('data', 'invalid3\n');
                mockStdin.emit('data', 'yes\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            // Should have re-prompted for each invalid input
            expect(mockStdout.write).toHaveBeenCalledTimes(5); // message + 4 prompts
        });

        it('should handle empty input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', '\n');
                mockStdin.emit('data', 'y\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            // Should have re-prompted for empty input
            expect(mockStdout.write).toHaveBeenCalledTimes(3); // message + 2 prompts
        });

        it('should handle numeric input as invalid', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', '1\n');
                mockStdin.emit('data', '0\n');
                mockStdin.emit('data', 'no\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(false);

            // Should have re-prompted for numeric inputs
            expect(mockStdout.write).toHaveBeenCalledTimes(4); // message + 3 prompts
        });

        it('should handle special characters as invalid', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', '@#$\n');
                mockStdin.emit('data', 'y\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            expect(mockStdout.write).toHaveBeenCalledTimes(3); // message + 2 prompts
        });

        it('should not resolve multiple times', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'y\n');
                // Try to emit more data after resolution
                mockStdin.emit('data', 'n\n');
                mockStdin.emit('data', 'no\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            // Should have cleaned up after first valid input
            expect((mockStdin as any).removeListener).toHaveBeenCalled();
            expect((mockStdin as any).pause).toHaveBeenCalled();
        });
    });

    describe('edge cases', () => {
        beforeEach(() => {
            delete process.env.NODE_ENV;
            delete process.env.VITEST;
        });

        it('should handle Unicode characters as invalid input', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', '是\n'); // Chinese character
                mockStdin.emit('data', '🎉\n'); // Emoji
                mockStdin.emit('data', 'y\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            expect(mockStdout.write).toHaveBeenCalledTimes(4); // message + 3 prompts
        });

        it('should handle very long invalid input', async () => {
            const promise = promptConfirmation('Confirm?');

            const longInput = 'a'.repeat(1000);
            setTimeout(() => {
                mockStdin.emit('data', longInput + '\n');
                mockStdin.emit('data', 'y\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            expect(mockStdout.write).toHaveBeenCalledTimes(3); // message + 2 prompts
        });

        it('should handle input that contains valid answers as substring', async () => {
            const promise = promptConfirmation('Confirm?');

            setTimeout(() => {
                mockStdin.emit('data', 'maybe yes\n'); // Contains 'yes' but not exact match
                mockStdin.emit('data', 'nope\n'); // Contains 'no' but not exact match
                mockStdin.emit('data', 'yes\n');
            }, 5);

            const result = await promise;
            expect(result).toBe(true);

            expect(mockStdout.write).toHaveBeenCalledTimes(4); // message + 3 prompts
        });
    });
});
