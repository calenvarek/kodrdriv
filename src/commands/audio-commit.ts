#!/usr/bin/env node
import { getLogger } from '../logging';
import { Config } from '../types';
import { execute as executeCommit } from './commit';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '../util/openai';
import { getTimestampedAudioFilename } from '../util/general';
import path from 'path';

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
            process.exit(0);
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