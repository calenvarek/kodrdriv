#!/usr/bin/env node
import { getLogger } from '../logging';
import { Config } from '../types';
import { execute as executeCommit } from './commit';
import { processAudio } from '../audio';

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    if (isDryRun) {
        if (runConfig.audioCommit?.file) {
            logger.info('DRY RUN: Would process audio file: %s', runConfig.audioCommit.file);
            logger.info('DRY RUN: Would transcribe audio and use as context for commit message generation');
        } else {
            logger.info('DRY RUN: Would start audio recording for commit context');
            logger.info('DRY RUN: Would transcribe audio and use as context for commit message generation');
        }
        logger.info('DRY RUN: Would then delegate to regular commit command');

        // In dry run, just call the regular commit command with empty audio context
        return executeCommit({
            ...runConfig,
            commit: {
                ...runConfig.commit,
                direction: runConfig.commit?.direction || ''
            }
        });
    }

    let audioContext: string;

    try {
        // Process audio using the audio subsystem
        logger.info('🎙️  Starting audio processing for commit context...');

        if (!runConfig.audioCommit?.file) {
            logger.info('This command will use your system\'s default audio recording tool');
            logger.info('💡 Tip: Run "kodrdriv select-audio" to choose a specific microphone');
            logger.info('Press Ctrl+C after you finish speaking to generate your commit message');
        }

        const result = await processAudio({
            file: runConfig.audioCommit?.file,
            audioDevice: runConfig.audioCommit?.audioDevice,
            maxRecordingTime: runConfig.audioCommit?.maxRecordingTime,
            outputDirectory: runConfig.outputDirectory,
            preferencesDirectory: runConfig.preferencesDirectory,
            debug: runConfig.debug,
            dryRun: isDryRun,
            keepTemp: runConfig.audioCommit?.keepTemp
        });

        // If the recording was cancelled, exit
        if (result.cancelled) {
            logger.info('❌ Audio commit cancelled by user');
            process.exit(0);
        }

        audioContext = result.transcript;

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed. Proceeding without audio context.');
            audioContext = '';
        } else {
            logger.info('📝 Using transcribed audio as commit context');
        }

    } catch (error: any) {
        if (error.message.includes('No audio device configured')) {
            logger.error('❌ No audio device configured. Please run "kodrdriv select-audio" first to configure your audio device.');
            logger.info('💡 This will create %s/audio-device.yaml with your preferred audio device.', runConfig.preferencesDirectory);
            process.exit(1);
        }

        // If audio recording failed, exit instead of continuing
        if (error.message.includes('Audio recording failed')) {
            logger.error('❌ Audio recording failed. Cannot proceed with audio-commit command.');
            logger.info('💡 Try running "kodrdriv select-audio" to choose a different audio device');
            process.exit(1);
        }

        logger.error('Audio processing failed: %s', error.message);
        logger.info('Proceeding with commit generation without audio context...');
        audioContext = '';
    }

    // Now delegate to the regular commit command with the audio context
    logger.info('🤖 Generating commit message using audio context...');
    const result = await executeCommit({
        ...runConfig,
        commit: {
            ...runConfig.commit,
            direction: audioContext.trim() || runConfig.commit?.direction || ''
        }
    });

    // Cleanup is handled by the audio processor

    return result;
};