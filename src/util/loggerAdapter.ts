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
    };
}

