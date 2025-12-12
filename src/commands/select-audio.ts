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
            logger.info('AUDIO_SELECT_DRY_RUN: Would start audio device selection | Mode: dry-run | Purpose: Choose input device');
            logger.info('AUDIO_SELECT_SAVE_DRY_RUN: Would save device to config | Mode: dry-run | Path: %s', configPath);
            return 'Audio device selection completed (dry run)';
        } catch (error: any) {
            logger.warn('AUDIO_SELECT_CONFIG_PATH_ERROR: Error determining config path | Error: %s | Impact: Cannot show save location', error.message);
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
            logger.error('AUDIO_SELECT_FAILED: Audio device selection failed | Error: %s', error.message);
            throw new Error(`Failed to determine home directory: ${error.message}`);
        } else {
            const errorMessage = error.message || error.toString();
            logger.error('AUDIO_SELECT_COMMAND_FAILED: Audio device selection command failed | Error: %s | Status: failed', errorMessage);
            throw new Error(`Audio device selection failed: ${errorMessage}`);
        }
    }
};
