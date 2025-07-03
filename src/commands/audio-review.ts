#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-unused-vars */
import { getLogger } from '../logging';
import { Config } from '../types';
import { execute as executeReview } from './review';
import { processAudio } from '@theunwalked/unplayable';

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
        // Process audio using the audio subsystem
        logger.info('🎙️  Starting audio processing for review context...');

        if (!runConfig.audioReview?.file) {
            logger.info('This command will use your configured audio device');
            logger.info('💡 Tip: Run "kodrdriv select-audio" to choose a different microphone');
            logger.info('Press Ctrl+C after you finish speaking to generate your review analysis');
        }

        const result = await processAudio({
            file: runConfig.audioReview?.file,
            maxRecordingTime: runConfig.audioReview?.maxRecordingTime,
            outputDirectory: runConfig.outputDirectory,
            debug: runConfig.debug,
            dryRun: isDryRun,
            keepTemp: runConfig.audioReview?.keepTemp
        });

        // If the recording was cancelled, exit
        if (result.cancelled) {
            logger.info('❌ Audio review cancelled by user');
            process.exit(0);
        }

        audioContext = result.transcript;

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed. Proceeding without audio context.');
            audioContext = '';
        } else {
            logger.info('📝 Using transcribed audio as review note');
        }

    } catch (error: any) {
        if (error.message.includes('No audio device configured')) {
            logger.error('❌ No audio device configured. Please run "kodrdriv select-audio" first to configure your audio device.');
            logger.info('💡 This will create ~/.unplayable/config.json with your preferred audio device.');
            process.exit(1);
        }

        // If audio recording failed, exit instead of continuing
        if (error.message.includes('Audio recording failed')) {
            logger.error('❌ Audio recording failed. Cannot proceed with audio-review command.');
            logger.info('💡 Try running "kodrdriv select-audio" to choose a different audio device');
            process.exit(1);
        }

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

    // Final cleanup to ensure process can exit
    try {
        if (process.stdin.setRawMode) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
            process.stdin.removeAllListeners();
        }
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
    } catch (error) {
        // Ignore cleanup errors
    }

    return result;
}; 