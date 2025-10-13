#!/usr/bin/env node
import child_process, { exec, spawn } from 'child_process';
import util from 'util';
import { getLogger } from '../logging';

/**
 * Escapes shell arguments to prevent command injection
 */
function escapeShellArg(arg: string): string {
    // For Windows, we need different escaping
    if (process.platform === 'win32') {
        // Escape double quotes and backslashes
        return `"${arg.replace(/[\\"]/g, '\\$&')}"`;
    } else {
        // For Unix-like systems, escape single quotes
        return `'${arg.replace(/'/g, "'\\''")}'`;
    }
}

/**
 * Validates git references to prevent injection
 */
function validateGitRef(ref: string): boolean {
    // Git refs can contain letters, numbers, hyphens, underscores, slashes, and dots
    // But cannot contain certain dangerous characters
    const validRefPattern = /^[a-zA-Z0-9._/-]+$/;
    const invalidPatterns = [
        /\.\./,      // No double dots (directory traversal)
        /^-/,        // Cannot start with dash (flag injection)
        /[\s;<>|&`$(){}[\]]/  // No shell metacharacters
    ];

    if (!validRefPattern.test(ref)) {
        return false;
    }

    return !invalidPatterns.some(pattern => pattern.test(ref));
}

/**
 * Validates file paths to prevent injection
 */
function validateFilePath(filePath: string): boolean {
    // Basic validation - no shell metacharacters
    const invalidChars = /[;<>|&`$(){}[\]]/;
    return !invalidChars.test(filePath);
}

/**
 * Securely executes a command with arguments array (no shell injection risk)
 */
export async function runSecure(
    command: string,
    args: string[] = [],
    options: child_process.SpawnOptions = {}
): Promise<{ stdout: string; stderr: string }> {
    const logger = getLogger();

    return new Promise((resolve, reject) => {
        logger.verbose(`Executing command securely: ${command} ${args.join(' ')}`);
        logger.verbose(`Working directory: ${options?.cwd || process.cwd()}`);

        const child = spawn(command, args, {
            ...options,
            shell: false, // CRITICAL: Never use shell for user input
            stdio: 'pipe'
        });

        let stdout = '';
        let stderr = '';

        if (child.stdout) {
            child.stdout.on('data', (data) => {
                stdout += data.toString();
            });
        }

        if (child.stderr) {
            child.stderr.on('data', (data) => {
                stderr += data.toString();
            });
        }

        child.on('close', (code) => {
            if (code === 0) {
                logger.verbose(`Command completed successfully`);
                logger.verbose(`stdout: ${stdout}`);
                if (stderr) {
                    logger.verbose(`stderr: ${stderr}`);
                }
                resolve({ stdout, stderr });
            } else {
                logger.error(`Command failed with exit code ${code}`);
                logger.error(`stdout: ${stdout}`);
                logger.error(`stderr: ${stderr}`);
                reject(new Error(`Command "${[command, ...args].join(' ')}" failed with exit code ${code}`));
            }
        });

        child.on('error', (error) => {
            logger.error(`Command failed to start: ${error.message}`);
            reject(error);
        });
    });
}

/**
 * Securely executes a command with inherited stdio (no shell injection risk)
 */
export async function runSecureWithInheritedStdio(
    command: string,
    args: string[] = [],
    options: child_process.SpawnOptions = {}
): Promise<void> {
    const logger = getLogger();

    return new Promise((resolve, reject) => {
        logger.verbose(`Executing command securely with inherited stdio: ${command} ${args.join(' ')}`);
        logger.verbose(`Working directory: ${options?.cwd || process.cwd()}`);

        const child = spawn(command, args, {
            ...options,
            shell: false, // CRITICAL: Never use shell for user input
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                logger.verbose(`Command completed successfully with code ${code}`);
                resolve();
            } else {
                logger.error(`Command failed with exit code ${code}`);
                reject(new Error(`Command "${[command, ...args].join(' ')}" failed with exit code ${code}`));
            }
        });

        child.on('error', (error) => {
            logger.error(`Command failed to start: ${error.message}`);
            reject(error);
        });
    });
}

export async function run(command: string, options: child_process.ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const logger = getLogger();
    const execPromise = util.promisify(exec);

    // Ensure encoding is set to 'utf8' to get string output instead of Buffer
    const execOptions = { encoding: 'utf8' as const, ...options };

    logger.verbose(`Executing command: ${command}`);
    logger.verbose(`Working directory: ${execOptions?.cwd || process.cwd()}`);
    logger.verbose(`Environment variables: ${Object.keys(execOptions?.env || process.env).length} variables`);

    try {
        const result = await execPromise(command, execOptions);
        logger.verbose(`Command completed successfully`);
        logger.verbose(`stdout: ${result.stdout}`);
        if (result.stderr) {
            logger.verbose(`stderr: ${result.stderr}`);
        }
        // Ensure result is properly typed as strings
        return {
            stdout: String(result.stdout),
            stderr: String(result.stderr)
        };
    } catch (error: any) {
        logger.error(`Command failed: ${command}`);
        logger.error(`Error: ${error.message}`);
        logger.error(`Exit code: ${error.code}`);
        logger.error(`Signal: ${error.signal}`);
        if (error.stdout) {
            logger.error(`stdout: ${error.stdout}`);
        }
        if (error.stderr) {
            logger.error(`stderr: ${error.stderr}`);
        }
        throw error;
    }
}

/**
 * @deprecated Use runSecureWithInheritedStdio instead for better security
 * Legacy function for backward compatibility - parses shell command string
 */
export async function runWithInheritedStdio(command: string, options: child_process.ExecOptions = {}): Promise<void> {

    // Parse command to extract command and arguments safely
    const parts = command.trim().split(/\s+/);
    if (parts.length === 0) {
        throw new Error('Empty command provided');
    }

    const cmd = parts[0];
    const args = parts.slice(1);

    // Use the secure version
    return runSecureWithInheritedStdio(cmd, args, options);
}

export async function runWithDryRunSupport(
    command: string,
    isDryRun: boolean,
    options: child_process.ExecOptions = {},
    useInheritedStdio: boolean = false
): Promise<{ stdout: string; stderr: string }> {
    const logger = getLogger();

    if (isDryRun) {
        logger.info(`DRY RUN: Would execute command: ${command}`);
        return { stdout: '', stderr: '' };
    }

    if (useInheritedStdio) {
        await runWithInheritedStdio(command, options);
        return { stdout: '', stderr: '' }; // No output captured when using inherited stdio
    }

    return run(command, options);
}

/**
 * Secure version of runWithDryRunSupport using argument arrays
 */
export async function runSecureWithDryRunSupport(
    command: string,
    args: string[] = [],
    isDryRun: boolean,
    options: child_process.SpawnOptions = {},
    useInheritedStdio: boolean = false
): Promise<{ stdout: string; stderr: string }> {
    const logger = getLogger();

    if (isDryRun) {
        logger.info(`DRY RUN: Would execute command: ${command} ${args.join(' ')}`);
        return { stdout: '', stderr: '' };
    }

    if (useInheritedStdio) {
        await runSecureWithInheritedStdio(command, args, options);
        return { stdout: '', stderr: '' }; // No output captured when using inherited stdio
    }

    return runSecure(command, args, options);
}

// Export validation functions for use in other modules
export { validateGitRef, validateFilePath, escapeShellArg };
