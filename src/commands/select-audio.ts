#!/usr/bin/env node
import path from 'path';
import os from 'os';
import { getLogger } from '../logging';
import { Config } from '../types';
import { selectAndConfigureAudioDevice } from '@theunwalked/unplayable';

const getUnplayableConfigPath = (): string => {
    return path.join(os.homedir(), '.unplayable', 'audio-device.json');
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    if (isDryRun) {
        logger.info('DRY RUN: Would start audio device selection process');
        logger.info('DRY RUN: Would save selected device to %s', getUnplayableConfigPath());
        return 'Audio device selection completed (dry run)';
    }

    try {
        const preferencesDir = path.join(os.homedir(), '.unplayable');
        const result = await selectAndConfigureAudioDevice(preferencesDir, logger, runConfig.debug);
        return result;
    } catch (error: any) {
        logger.error('❌ Audio device selection failed: %s', error.message);
        process.exit(1);
    }
}; 