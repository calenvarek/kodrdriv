/**
 * Adapter for ai-service Logger using kodrdriv logging
 */

import type { Logger } from '@eldrforge/ai-service';
import { getDryRunLogger } from '../logging';

/**
 * Create a Logger implementation using kodrdriv logging
 */
export function createLoggerAdapter(dryRun: boolean): Logger {
    const logger = getDryRunLogger(dryRun);

    return {
        info(message: string, ...meta: unknown[]): void {
            logger.info(message, ...meta);
        },

        error(message: string, ...meta: unknown[]): void {
            logger.error(message, ...meta);
        },

        warn(message: string, ...meta: unknown[]): void {
            logger.warn(message, ...meta);
        },

        debug(message: string, ...meta: unknown[]): void {
            logger.debug(message, ...meta);
        },

        // Additional methods required by riotprompt
        verbose(message: string, ...meta: unknown[]): void {
            // Use debug for verbose if available, otherwise info
            if ('verbose' in logger && typeof logger.verbose === 'function') {
                (logger as any).verbose(message, ...meta);
            } else {
                logger.debug(message, ...meta);
            }
        },

        silly(message: string, ...meta: unknown[]): void {
            // Use debug for silly if available, otherwise skip
            if ('silly' in logger && typeof logger.silly === 'function') {
                (logger as any).silly(message, ...meta);
            } else {
                logger.debug(message, ...meta);
            }
        },
    } as Logger;
}

