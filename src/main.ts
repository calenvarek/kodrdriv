#!/usr/bin/env node
import { runApplication } from './application';
import { getLogger } from './logging';

/**
 * Main entry point - minimal wrapper around the application logic
 */
async function main(): Promise<void> {
    try {
        await runApplication();
    } catch (error: any) {
        const logger = getLogger();
        logger.error('MAIN_ERROR_EXIT: Exiting due to error | Error: %s | Stack: %s | Status: terminating', error.message, error.stack);
        process.exit(1);
    }
}

// Properly handle the main function with error handling and explicit process exit
main().then(() => {
    process.exit(0);
}).catch((error) => {
    const logger = getLogger();
    logger.error('MAIN_UNHANDLED_ERROR: Unhandled error in main process | Error: %s | Type: unhandled', error.message || error);
    process.exit(1);
});
