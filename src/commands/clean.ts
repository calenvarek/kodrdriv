#!/usr/bin/env node
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { FileOperationError } from '../error/CommandErrors';
import { getDryRunLogger, getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';

const executeInternal = async (runConfig: Config): Promise<void> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);
    const storage = createStorage({ log: logger.info });

    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;

    if (isDryRun) {
        logger.info(`Would remove output directory: ${outputDirectory}`);
        logger.info(`Would check if output directory exists: ${outputDirectory}`);
        logger.info('Would remove directory if it exists');
        return;
    }

    logger.info(`Removing output directory: ${outputDirectory}`);

    try {
        if (await storage.exists(outputDirectory)) {
            await storage.removeDirectory(outputDirectory);
            logger.info(`Successfully removed output directory: ${outputDirectory}`);
        } else {
            logger.info(`Output directory does not exist: ${outputDirectory}`);
        }
    } catch (error: any) {
        logger.error(`Failed to clean output directory: ${error.message}`);
        throw new FileOperationError('Failed to remove output directory', outputDirectory, error);
    }
};

export const execute = async (runConfig: Config): Promise<void> => {
    try {
        await executeInternal(runConfig);
    } catch (error: any) {
        const logger = getLogger();

        if (error instanceof FileOperationError) {
            logger.error(`clean failed: ${error.message}`);
            if (error.cause) {
                logger.debug(`Caused by: ${error.cause.message}`);
            }
            throw error;
        }

        // Unexpected errors
        logger.error(`clean encountered unexpected error: ${error.message}`);
        throw error;
    }
};
