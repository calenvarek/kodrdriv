#!/usr/bin/env node
import { ExitError } from '../error/ExitError';
import { getLogger } from '../logging';
import { run } from '../util/child';

export interface Instance {
    get(): Promise<string>;
}

export const create = async (options: { from: string, to: string }): Promise<Instance> => {
    const logger = getLogger();

    async function get(): Promise<string> {
        try {
            logger.verbose('Gathering change information from Git');

            try {
                logger.debug('Executing git log');
                const { stdout, stderr } = await run(`git log ${options.from}..${options.to}`);
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

