import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { run } from '../../src/util/child';
import { exec } from 'child_process';
import { promisify } from 'util';

// Mock the dependencies
vi.mock('child_process');
vi.mock('util');

describe('child.ts - run function', () => {
    const mockExec = vi.mocked(exec);
    const mockPromisify = vi.mocked(promisify);
    const mockExecPromise = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        mockPromisify.mockReturnValue(mockExecPromise);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    test('should execute command successfully and return stdout and stderr', async () => {
        const expectedResult = {
            stdout: 'Command executed successfully',
            stderr: ''
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('echo "hello world"');

        expect(mockPromisify).toHaveBeenCalledWith(mockExec);
        expect(mockExecPromise).toHaveBeenCalledWith('echo "hello world"', {});
        expect(result).toEqual(expectedResult);
    });

    test('should execute command with custom options', async () => {
        const expectedResult = {
            stdout: 'Command output',
            stderr: ''
        };
        const options = {
            cwd: '/custom/directory',
            env: { NODE_ENV: 'test' },
            timeout: 5000
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('npm --version', options);

        expect(mockExecPromise).toHaveBeenCalledWith('npm --version', options);
        expect(result).toEqual(expectedResult);
    });

    test('should handle commands that produce stderr output', async () => {
        const expectedResult = {
            stdout: '',
            stderr: 'Warning: deprecated feature used'
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('some-command-with-warnings');

        expect(result).toEqual(expectedResult);
        expect(result.stderr).toBe('Warning: deprecated feature used');
    });

    test('should handle commands that produce both stdout and stderr', async () => {
        const expectedResult = {
            stdout: 'Success message',
            stderr: 'Warning message'
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('command-with-mixed-output');

        expect(result).toEqual(expectedResult);
        expect(result.stdout).toBe('Success message');
        expect(result.stderr).toBe('Warning message');
    });

    test('should reject when command execution fails', async () => {
        const error = new Error('Command failed');
        mockExecPromise.mockRejectedValue(error);

        await expect(run('invalid-command')).rejects.toThrow('Command failed');
        expect(mockExecPromise).toHaveBeenCalledWith('invalid-command', {});
    });

    test('should handle command with exit code error', async () => {
        const error = Object.assign(new Error('Command failed with exit code 1'), {
            code: 1,
            killed: false,
            signal: null,
            cmd: 'failing-command'
        });

        mockExecPromise.mockRejectedValue(error);

        await expect(run('failing-command')).rejects.toMatchObject({
            message: 'Command failed with exit code 1',
            code: 1,
            killed: false,
            signal: null,
            cmd: 'failing-command'
        });
    });

    test('should handle timeout errors', async () => {
        const timeoutError = Object.assign(new Error('Command timed out'), {
            killed: true,
            signal: 'SIGTERM',
            code: null
        });

        mockExecPromise.mockRejectedValue(timeoutError);

        await expect(run('long-running-command', { timeout: 1000 })).rejects.toMatchObject({
            message: 'Command timed out',
            killed: true,
            signal: 'SIGTERM'
        });
    });

    test('should handle empty command string', async () => {
        const expectedResult = {
            stdout: '',
            stderr: ''
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('');

        expect(mockExecPromise).toHaveBeenCalledWith('', {});
        expect(result).toEqual(expectedResult);
    });

    test('should handle commands with special characters', async () => {
        const command = 'echo "Hello & goodbye; echo $HOME | grep user"';
        const expectedResult = {
            stdout: 'Hello & goodbye; echo $HOME | grep user',
            stderr: ''
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run(command);

        expect(mockExecPromise).toHaveBeenCalledWith(command, {});
        expect(result).toEqual(expectedResult);
    });

    test('should handle large output', async () => {
        const largeOutput = 'x'.repeat(10000);
        const expectedResult = {
            stdout: largeOutput,
            stderr: ''
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('command-with-large-output');

        expect(result.stdout).toBe(largeOutput);
        expect(result.stdout.length).toBe(10000);
    });

    test('should handle unicode characters in output', async () => {
        const unicodeOutput = '🚀 Deployment successful! 中文测试 émojis 🎉';
        const expectedResult = {
            stdout: unicodeOutput,
            stderr: ''
        };

        mockExecPromise.mockResolvedValue(expectedResult);

        const result = await run('echo "unicode test"');

        expect(result.stdout).toBe(unicodeOutput);
    });

    test('should handle multiple consecutive calls', async () => {
        const results = [
            { stdout: 'First command', stderr: '' },
            { stdout: 'Second command', stderr: '' },
            { stdout: 'Third command', stderr: '' }
        ];

        mockExecPromise
            .mockResolvedValueOnce(results[0])
            .mockResolvedValueOnce(results[1])
            .mockResolvedValueOnce(results[2]);

        const [result1, result2, result3] = await Promise.all([
            run('command1'),
            run('command2'),
            run('command3')
        ]);

        expect(result1).toEqual(results[0]);
        expect(result2).toEqual(results[1]);
        expect(result3).toEqual(results[2]);
        expect(mockExecPromise).toHaveBeenCalledTimes(3);
    });

    test('should preserve options object immutability', async () => {
        const options = {
            cwd: '/test',
            env: { TEST: 'value' }
        };
        const originalOptions = { ...options };

        mockExecPromise.mockResolvedValue({ stdout: 'test', stderr: '' });

        await run('test-command', options);

        expect(options).toEqual(originalOptions);
        expect(mockExecPromise).toHaveBeenCalledWith('test-command', options);
    });

    test('should handle maxBuffer option', async () => {
        const options = {
            maxBuffer: 1024 * 1024 // 1MB
        };

        mockExecPromise.mockResolvedValue({ stdout: 'test', stderr: '' });

        await run('command-with-large-buffer', options);

        expect(mockExecPromise).toHaveBeenCalledWith('command-with-large-buffer', options);
    });

    test('should handle shell option', async () => {
        const options = {
            shell: '/bin/bash'
        };

        mockExecPromise.mockResolvedValue({ stdout: 'test', stderr: '' });

        await run('command-with-shell', options);

        expect(mockExecPromise).toHaveBeenCalledWith('command-with-shell', options);
    });

    test('should handle process signals', async () => {
        const signalError = Object.assign(new Error('Process terminated'), {
            killed: true,
            signal: 'SIGINT',
            code: null
        });

        mockExecPromise.mockRejectedValue(signalError);

        await expect(run('interruptible-command')).rejects.toMatchObject({
            message: 'Process terminated',
            killed: true,
            signal: 'SIGINT'
        });
    });

    test('should handle commands with environment variables', async () => {
        const options = {
            env: {
                ...process.env,
                NODE_ENV: 'test',
                DEBUG: 'true'
            }
        };

        mockExecPromise.mockResolvedValue({ stdout: 'env test', stderr: '' });

        await run('env-command', options);

        expect(mockExecPromise).toHaveBeenCalledWith('env-command', options);
    });

    test('should handle cwd option', async () => {
        const options = {
            cwd: '/custom/working/directory'
        };

        mockExecPromise.mockResolvedValue({ stdout: 'pwd output', stderr: '' });

        await run('pwd', options);

        expect(mockExecPromise).toHaveBeenCalledWith('pwd', options);
    });

    test('should handle windowsHide option', async () => {
        const options = {
            windowsHide: true
        };

        mockExecPromise.mockResolvedValue({ stdout: 'hidden window', stderr: '' });

        await run('windows-command', options);

        expect(mockExecPromise).toHaveBeenCalledWith('windows-command', options);
    });
}); 