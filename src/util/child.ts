#!/usr/bin/env node
import child_process, { exec } from 'child_process';
import util from 'util';
import { getLogger } from '../logging';

export async function run(command: string, options: child_process.ExecOptions = {}): Promise<{ stdout: string; stderr: string }> {
    const execPromise = util.promisify(exec);
    return execPromise(command, options);
}

export async function runWithDryRunSupport(
    command: string,
    isDryRun: boolean,
    options: child_process.ExecOptions = {}
): Promise<{ stdout: string; stderr: string }> {
    const logger = getLogger();

    if (isDryRun) {
        logger.info(`DRY RUN: Would execute command: ${command}`);
        return { stdout: '', stderr: '' };
    }

    return run(command, options);
}