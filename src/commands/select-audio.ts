#!/usr/bin/env node
import path from 'path';
import os from 'os';
import { getDryRunLogger } from '../logging';
import { Config } from '../types';
import { selectAndConfigureAudioDevice } from '@theunwalked/unplayable';

const getUnplayableConfigPath = (): string => {
    try {
        return path.join(os.homedir(), '.unplayable', 'audio-device.json');
    } catch (error: any) {
        throw new Error(`Failed to determine home directory: ${error.message}`);
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    if (isDryRun) {
        try {
            const configPath = getUnplayableConfigPath();
            logger.info('Would start audio device selection process');
            logger.info('Would save selected device to %s', configPath);
            return 'Audio device selection completed (dry run)';
        } catch (error: any) {
            logger.warn('Error determining config path: %s', error.message);
            return 'Audio device selection completed (dry run)';
        }
    }

    try {
        const preferencesDir = path.join(os.homedir(), '.unplayable');
        const result = await selectAndConfigureAudioDevice(preferencesDir, logger, runConfig.debug);
        return result;
    } catch (error: any) {
        // Check if this is a home directory error
        if (error.message && error.message.includes('Failed to determine home directory')) {
            logger.error('❌ %s', error.message);
            throw new Error(`Failed to determine home directory: ${error.message}`);
        } else {
            const errorMessage = error.message || error.toString();
            logger.error('❌ Audio device selection failed: %s', errorMessage);
            throw new Error(`Audio device selection failed: ${errorMessage}`);
        }
    }
};
