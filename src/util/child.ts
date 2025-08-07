#!/usr/bin/env node
import child_process, { exec } from 'child_process';
import util from 'util';
import { getLogger } from '../logging';

export async function run(command: string, options: child_process.ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const logger = getLogger();
    const execPromise = util.promisify(exec);

    logger.verbose(`Executing command: ${command}`);
    logger.verbose(`Working directory: ${options?.cwd || process.cwd()}`);
    logger.verbose(`Environment variables: ${Object.keys(options?.env || process.env).length} variables`);

    try {
        const result = await execPromise(command, options);
        logger.verbose(`Command completed successfully`);
        logger.verbose(`stdout: ${result.stdout}`);
        if (result.stderr) {
            logger.verbose(`stderr: ${result.stderr}`);
        }
        return result;
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

export async function runWithInheritedStdio(command: string, options: child_process.ExecOptions = {}): Promise<void> {
    const logger = getLogger();

    return new Promise((resolve, reject) => {
        logger.verbose(`Executing command with inherited stdio: ${command}`);
        logger.verbose(`Working directory: ${options?.cwd || process.cwd()}`);

        const child = child_process.spawn(command, [], {
            ...options,
            shell: true,
            stdio: 'inherit'
        });

        child.on('close', (code) => {
            if (code === 0) {
                logger.verbose(`Command completed successfully with code ${code}`);
                resolve();
            } else {
                logger.error(`Command failed with exit code ${code}`);
                reject(new Error(`Command "${command}" failed with exit code ${code}`));
            }
        });

        child.on('error', (error) => {
            logger.error(`Command failed to start: ${error.message}`);
            reject(error);
        });
    });
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
