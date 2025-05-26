#!/usr/bin/env node
import { ExitError } from '../error/ExitError';
import { getLogger } from '../logging';
import { run } from '../util/child';

export interface Instance {
    get(): Promise<string>;
}

export const create = async (options: { from?: string, to?: string, limit?: number, currentBranchOnly?: boolean }): Promise<Instance> => {
    const logger = getLogger();

    async function get(): Promise<string> {
        try {
            logger.verbose('Gathering change information from Git');

            try {
                logger.debug('Executing git log');
                // Build git log range
                let range = '';
                let extraArgs = '';
                // If currentBranchOnly, show only commits unique to HEAD vs. to-branch (or main/master if not provided)
                if (options.currentBranchOnly) {
                    const toBranch = options.to || 'main'; // Default to 'main' if not provided
                    range = `${toBranch}..HEAD`;
                } else if (options.from && options.to) {
                    range = `${options.from}..${options.to}`;
                } else if (options.from) {
                    range = `${options.from}`;
                } else if (options.to) {
                    range = `${options.to}`;
                } // else, no range: show all

                if (options.limit && options.limit > 0) {
                    extraArgs += ` -n ${options.limit}`;
                }
                const gitLogCmd = `git log${range ? ' ' + range : ''}${extraArgs}`;
                logger.debug('Git log command: %s', gitLogCmd);
                const { stdout, stderr } = await run(gitLogCmd);
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

