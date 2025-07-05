#!/usr/bin/env node

import { getLogger } from '../logging';
import { Config } from '../types';
import { execute as executeReview } from './review';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '../util/openai';
import { getTimestampedAudioFilename } from '../util/general';
import path from 'path';

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    if (isDryRun) {
        if (runConfig.audioReview?.file) {
            logger.info('DRY RUN: Would process audio file: %s', runConfig.audioReview.file);
            logger.info('DRY RUN: Would transcribe audio and use as context for review analysis');
        } else {
            logger.info('DRY RUN: Would start audio recording for review context');
            logger.info('DRY RUN: Would transcribe audio and use as context for review analysis');
        }
        logger.info('DRY RUN: Would then delegate to regular review command');

        // In dry run, just call the regular review command with empty note
        return executeReview({
            ...runConfig,
            review: {
                ...runConfig.review,
                note: runConfig.review?.note || ''
            }
        });
    }

    let audioContext: string;

    try {
        // Step 1: Record audio using unplayable with new key handling
        logger.info('🎙️  Starting audio recording for review context...');

        if (!runConfig.audioReview?.file) {
            logger.info('Press ENTER to stop recording or C to cancel');
        }

        // Use processAudio with proper configuration
        const audioResult = await processAudio({
            file: runConfig.audioReview?.file,
            maxRecordingTime: runConfig.audioReview?.maxRecordingTime,
            outputDirectory: runConfig.outputDirectory || 'output',
            debug: runConfig.debug
        });

        // Check if recording was cancelled
        if (audioResult.cancelled) {
            logger.info('❌ Audio review cancelled by user');
            process.exit(0);
        }

        // Step 2: Get the audio file path from the result
        let audioFilePath: string;

        if (runConfig.audioReview?.file) {
            // Use the provided file path
            audioFilePath = runConfig.audioReview.file;
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
            debug: runConfig.debug
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
        logger.info('Proceeding with review analysis without audio context...');
        audioContext = '';
    }

    // Now delegate to the regular review command with the audio context
    logger.info('🤖 Analyzing review using audio context...');
    const result = await executeReview({
        ...runConfig,
        review: {
            // Map audioReview configuration to review configuration
            includeCommitHistory: runConfig.audioReview?.includeCommitHistory,
            includeRecentDiffs: runConfig.audioReview?.includeRecentDiffs,
            includeReleaseNotes: runConfig.audioReview?.includeReleaseNotes,
            includeGithubIssues: runConfig.audioReview?.includeGithubIssues,
            commitHistoryLimit: runConfig.audioReview?.commitHistoryLimit,
            diffHistoryLimit: runConfig.audioReview?.diffHistoryLimit,
            releaseNotesLimit: runConfig.audioReview?.releaseNotesLimit,
            githubIssuesLimit: runConfig.audioReview?.githubIssuesLimit,
            sendit: runConfig.audioReview?.sendit,
            context: runConfig.audioReview?.context,
            // Use the transcribed audio as content
            note: audioContext.trim() || runConfig.review?.note || ''
        }
    });

    return result;
}; 