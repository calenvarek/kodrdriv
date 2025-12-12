#!/usr/bin/env node
import { ExitError } from '../error/ExitError';
import { getLogger } from '../logging';
import { run } from '@eldrforge/git-tools';
import { DEFAULT_GIT_COMMAND_MAX_BUFFER } from '../constants';

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
                const { stdout, stderr } = await run(gitLogCmd, { maxBuffer: DEFAULT_GIT_COMMAND_MAX_BUFFER });
                if (stderr) {
                    logger.warn('GIT_LOG_STDERR: Git log produced stderr output | Stderr: %s | Impact: May indicate warnings', stderr);
                }
                logger.debug('Git log output: %s', stdout);
                return stdout;
            } catch (error: any) {
                // Check if this is an empty repository (no commits) scenario
                const errorMessage = error.message || '';
                const isEmptyRepo = errorMessage.includes('does not have any commits yet') ||
                                  errorMessage.includes('bad default revision') ||
                                  errorMessage.includes('unknown revision or path not in the working tree') ||
                                  errorMessage.includes('ambiguous argument \'HEAD\'');

                if (isEmptyRepo) {
                    logger.debug('Empty repository detected (no commits): %s', errorMessage);
                    logger.verbose('No git history available, returning empty log context');
                    return ''; // Return empty string for empty repositories
                }

                logger.error('GIT_LOG_FAILED: Failed to execute git log command | Error: %s | Impact: Cannot gather commit history', error.message);
                throw error;
            }
        } catch (error: any) {
            // Check again at the outer level in case the error wasn't caught by the inner try-catch
            const errorMessage = error.message || '';
            const isEmptyRepo = errorMessage.includes('does not have any commits yet') ||
                              errorMessage.includes('bad default revision') ||
                              errorMessage.includes('unknown revision or path not in the working tree') ||
                              errorMessage.includes('ambiguous argument \'HEAD\'');

            if (isEmptyRepo) {
                logger.debug('Empty repository detected at outer level: %s', errorMessage);
                logger.verbose('No git history available, returning empty log context');
                return ''; // Return empty string for empty repositories
            }

            logger.error('LOG_GATHER_ERROR: Error during change gathering phase | Error: %s | Stack: %s | Impact: Cannot collect log', error.message, error.stack);
            throw new ExitError('Error occurred during gather change phase');
        }
    }

    return { get };
}

