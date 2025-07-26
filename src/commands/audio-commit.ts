#!/usr/bin/env node
import path from 'path';
import { processAudio } from '@theunwalked/unplayable';
import { CancellationError } from '../error/CancellationError';
import { UserCancellationError } from '../error/CommandErrors';
import { getDryRunLogger, getLogger } from '../logging';
import { Config } from '../types';
import { getTimestampedAudioFilename } from '../util/general';
import { transcribeAudio } from '../util/openai';
import { execute as executeCommit } from './commit';

const executeInternal = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    if (isDryRun) {
        if (runConfig.audioCommit?.file) {
            logger.info('Would process audio file: %s', runConfig.audioCommit.file);
            logger.info('Would transcribe audio and use as context for commit message generation');
        } else {
            logger.info('Would start audio recording for commit context');
            logger.info('Would transcribe audio and use as context for commit message generation');
        }
        logger.info('Would then delegate to regular commit command');

        // Return preview without calling real commands
        return 'DRY RUN: Would process audio, transcribe it, and generate commit message with audio context';
    }

    let audioContext: string;

    try {
        // Step 1: Record audio using unplayable with new key handling
        logger.info('🎙️  Starting audio recording for commit context...');

        if (!runConfig.audioCommit?.file) {
            logger.info('Press ENTER to stop recording or C to cancel');
        }

        // Use processAudio with proper configuration
        const audioResult = await processAudio({
            file: runConfig.audioCommit?.file,
            maxRecordingTime: runConfig.audioCommit?.maxRecordingTime,
            outputDirectory: runConfig.outputDirectory || 'output',
            debug: runConfig.debug
        });

        // Check if recording was cancelled
        if (audioResult.cancelled) {
            logger.info('❌ Audio commit cancelled by user');
            throw new UserCancellationError('Audio commit cancelled by user');
        }

        // Step 2: Get the audio file path from the result
        let audioFilePath: string;

        if (runConfig.audioCommit?.file) {
            // Use the provided file path
            audioFilePath = runConfig.audioCommit.file;
        } else if (audioResult.audioFilePath) {
            // Use the file path returned by processAudio
            audioFilePath = audioResult.audioFilePath;
        } else {
            // Fallback to generated filename (this should rarely happen now)
            const outputDir = runConfig.outputDirectory || 'output';
            audioFilePath = path.join(outputDir, getTimestampedAudioFilename());
            logger.warn('Using generated filename for recorded audio: %s', audioFilePath);
            logger.warn('Note: This may not match the actual file created by unplayable');
        }

        // Step 3: Use kodrdriv's transcription functionality
        logger.info('🤖 Transcribing audio locally using OpenAI Whisper...');

        const transcription = await transcribeAudio(audioFilePath, {
            model: "whisper-1",
            debug: runConfig.debug,
            outputDirectory: path.join(runConfig.outputDirectory || 'output', 'kodrdriv')
        });

        audioContext = transcription.text;

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed. Proceeding without audio context.');
            audioContext = '';
        } else {
            logger.info('📝 Successfully transcribed audio using kodrdriv');
            logger.debug('Transcribed text: %s', audioContext);
        }

    } catch (error: any) {
        // Re-throw cancellation errors properly
        if (error instanceof UserCancellationError) {
            throw error;
        }

        // Convert old CancellationError to new UserCancellationError
        if (error.name === 'CancellationError' || error instanceof CancellationError) {
            throw new UserCancellationError(error.message);
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

    return result;
};

export const execute = async (runConfig: Config): Promise<string> => {
    try {
        return await executeInternal(runConfig);
    } catch (error: any) {
        const logger = getLogger();

        // Handle user cancellation gracefully - exit with code 0
        if (error instanceof UserCancellationError) {
            logger.info(error.message);
            process.exit(0);
        }

        // Handle other errors - exit with code 1
        logger.error(`audio-commit failed: ${error.message}`);
        if (error.cause) {
            logger.debug(`Caused by: ${error.cause.message}`);
        }
        process.exit(1);
    }
};
