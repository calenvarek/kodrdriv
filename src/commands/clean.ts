#!/usr/bin/env node
import { getLogger } from '../logging';
import { Config } from '../types';
import { create as createStorage } from '../util/storage';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';

export const execute = async (runConfig: Config): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });
    const isDryRun = runConfig.dryRun || false;

    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;

    logger.info(isDryRun ? `DRY RUN: Would remove output directory: ${outputDirectory}` : `Removing output directory: ${outputDirectory}`);

    if (isDryRun) {
        if (await storage.exists(outputDirectory)) {
            logger.info('DRY RUN: Output directory exists and would be removed');
        } else {
            logger.info('DRY RUN: Output directory does not exist, nothing to clean');
        }
        return;
    }

    try {
        if (await storage.exists(outputDirectory)) {
            await storage.removeDirectory(outputDirectory);
            logger.info(`Successfully removed output directory: ${outputDirectory}`);
        } else {
            logger.info(`Output directory does not exist: ${outputDirectory}`);
        }
    } catch (error: any) {
        logger.error(`Failed to clean output directory: ${error.message}`);
        throw error;
    }
}; 