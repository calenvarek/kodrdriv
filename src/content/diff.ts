#!/usr/bin/env node
import { ExitError } from '../error/ExitError';
import { getLogger } from '../logging';
import { run } from '../util/child';

export interface Instance {
    get(): Promise<string>;
}

export const create = async (options: { cached?: boolean, excludedPatterns: string[] }): Promise<Instance> => {
    const logger = getLogger();

    async function get(): Promise<string> {
        try {
            logger.verbose('Gathering change information from Git');

            try {
                logger.debug('Executing git diff');
                const excludeString = options.excludedPatterns.map(p => `':(exclude)${p}'`).join(' ');
                const command = options.cached ? `git diff --cached -- . ${excludeString}` : `git diff -- . ${excludeString}`;
                const { stdout, stderr } = await run(command);
                if (stderr) {
                    logger.warn('Git log produced stderr: %s', stderr);
                }
                logger.debug('Git log output: %s', stdout);
                return stdout;
            } catch (error: any) {
                logger.error('Failed to execute git log: %s', error.message);
                throw error;
            }
        } catch (error: any) {
            logger.error('Error occurred during gather change phase: %s %s', error.message, error.stack);
            throw new ExitError('Error occurred during gather change phase');
        }
    }

    return { get };
}

export const hasStagedChanges = async (): Promise<boolean> => {
    const logger = getLogger();
    try {
        logger.debug('Checking for staged changes');
        const { stderr } = await run('git diff --cached --quiet');
        if (stderr) {
            logger.warn('Git diff produced stderr: %s', stderr);
        }
        // If there are staged changes, git diff --cached --quiet will return non-zero
        // So if we get here without an error, there are no staged changes
        return false;

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: any) {
        // If we get an error, it means there are staged changes
        return true;
    }
}
