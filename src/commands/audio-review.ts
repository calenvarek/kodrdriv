#!/usr/bin/env node

import { getLogger, getDryRunLogger } from '../logging';
import { Config } from '../types';
import { execute as executeReview } from './review';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '@eldrforge/ai-service';
import { createStorageAdapter } from '../util/storageAdapter';
import { createLoggerAdapter } from '../util/loggerAdapter';
import { getTimestampedAudioFilename, archiveAudio } from '../util/general';
import { CancellationError } from '../error/CancellationError';
import { create as createStorage } from '../util/storage';
import { createAudioRecordingCountdown } from '../util/countdown';
import path from 'path';

// Common audio file extensions
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.wma'];

/**
 * Discover audio files in a directory
 */
const discoverAudioFiles = async (directory: string): Promise<string[]> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.debug });

    try {
        if (!(await storage.isDirectoryReadable(directory))) {
            throw new Error(`Directory not readable: ${directory}`);
        }

        const allFiles = await storage.listFiles(directory);
        const audioFiles = allFiles
            .filter(file => AUDIO_EXTENSIONS.includes(path.extname(file).toLowerCase()))
            .map(file => path.join(directory, file))
            .sort(); // Sort for consistent processing order

        logger.info(`Found ${audioFiles.length} audio files in directory: ${directory}`);
        logger.debug('Audio files found: %s', audioFiles.join(', '));

        return audioFiles;
    } catch (error: any) {
        logger.error('Failed to discover audio files in directory: %s', error.message);
        throw error;
    }
};

/**
 * Process a single audio file for review
 */
const processSingleAudioFile = async (audioFilePath: string, runConfig: Config): Promise<string> => {
    const logger = getLogger();

    try {
        logger.info('🎵 Processing audio file: %s', path.basename(audioFilePath));

        // Use kodrdriv's transcription functionality
        logger.info('🤖 Transcribing audio using OpenAI Whisper...');

        const aiStorageAdapter = createStorageAdapter();
        const aiLogger = createLoggerAdapter(runConfig.dryRun || false);

        const transcription = await transcribeAudio(audioFilePath, {
            model: "whisper-1",
            debug: runConfig.debug,
            storage: aiStorageAdapter,
            logger: aiLogger,
            onArchive: async (audioPath: string, transcriptionText: string) => {
                const outputDir = path.join(runConfig.outputDirectory || 'output', 'kodrdriv');
                await archiveAudio(audioPath, transcriptionText, outputDir);
            },
        });

        // Safely validate transcription result
        if (!transcription || typeof transcription !== 'object' || typeof transcription.text !== 'string') {
            throw new Error('Invalid transcription result: missing or invalid text property');
        }
        const audioContext = transcription.text;

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed from: %s', audioFilePath);
            return '';
        } else {
            logger.info('📝 Successfully transcribed audio from: %s', path.basename(audioFilePath));
            logger.debug('Transcribed text: %s', audioContext);
        }

        // Now delegate to the regular review command with the audio context
        logger.info('🤖 Analyzing review for: %s', path.basename(audioFilePath));
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
                // Use the transcribed audio as content with file context
                note: `Audio Review from ${path.basename(audioFilePath)}:\n\n${audioContext.trim()}`
            }
        });

        return result;

    } catch (error: any) {
        logger.error('Failed to process audio file %s: %s', audioFilePath, error.message);
        return `Failed to process ${path.basename(audioFilePath)}: ${error.message}`;
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    // Check if directory option is provided with safe access
    const audioReviewConfig = runConfig.audioReview;
    const directory = audioReviewConfig && typeof audioReviewConfig === 'object' && 'directory' in audioReviewConfig
        ? (audioReviewConfig as any).directory
        : undefined;

    if (directory) {
        // Directory batch processing mode
        logger.info('🎵 Starting directory batch audio review for: %s', directory);

        if (isDryRun) {
            logger.info('Would discover and process all audio files in directory: %s', directory);
            logger.info('Would transcribe each audio file and run review analysis');
            return 'DRY RUN: Directory batch processing would be performed';
        }

        try {
            // Discover audio files in the directory
            const audioFiles = await discoverAudioFiles(directory);

            if (audioFiles.length === 0) {
                logger.warn('No audio files found in directory: %s', directory);
                return 'No audio files found to process';
            }

            const results: string[] = [];

            // Process each audio file
            for (let i = 0; i < audioFiles.length; i++) {
                const audioFile = audioFiles[i];
                logger.info(`\n📁 Processing file ${i + 1} of ${audioFiles.length}: ${path.basename(audioFile)}`);

                const result = await processSingleAudioFile(audioFile, runConfig);
                results.push(`File: ${path.basename(audioFile)}\n${result}`);

                // Add a separator between files (except for the last one)
                if (i < audioFiles.length - 1) {
                    logger.info('✅ Completed processing: %s\n', path.basename(audioFile));
                }
            }

            logger.info('🎉 Completed batch processing of %d audio files', audioFiles.length);

            // Combine all results
            const combinedResults = `Batch Audio Review Results (${audioFiles.length} files):\n\n` +
                results.join('\n\n---\n\n');

            return combinedResults;

        } catch (error: any) {
            logger.error('Directory batch processing failed: %s', error.message);
            throw error;
        }
    }

    // Original single file/recording logic
    if (isDryRun) {
        if (runConfig.audioReview?.file) {
            logger.info('Would process audio file: %s', runConfig.audioReview.file);
            logger.info('Would transcribe audio and use as context for review analysis');
        } else {
            logger.info('Would start audio recording for review context');
            logger.info('Would transcribe audio and use as context for review analysis');
        }
        logger.info('Would then delegate to regular review command');

        // Return preview without calling real commands
        return 'DRY RUN: Would process audio, transcribe it, and perform review analysis with audio context';
    }

    let audioContext: string;

    try {
        // Step 1: Record audio using unplayable with new key handling
        logger.info('🎙️  Starting audio recording for review context...');

        if (!runConfig.audioReview?.file) {
            logger.info('Press ENTER to stop recording or C to cancel');
        }

        // Start countdown timer if recording (not processing a file) and maxRecordingTime is set
        const maxRecordingTime = runConfig.audioReview?.maxRecordingTime;
        const isRecording = !runConfig.audioReview?.file;
        let countdownTimer: ReturnType<typeof createAudioRecordingCountdown> | null = null;

        if (isRecording && maxRecordingTime && maxRecordingTime > 0) {
            countdownTimer = createAudioRecordingCountdown(maxRecordingTime);
            // Start countdown timer in parallel with recording
            countdownTimer.start().catch(() => {
                // Timer completed naturally, no action needed
            });
        }

        let audioResult: any;
        try {
            // Use processAudio with proper configuration
            audioResult = await processAudio({
                file: runConfig.audioReview?.file,
                maxRecordingTime: runConfig.audioReview?.maxRecordingTime,
                outputDirectory: runConfig.outputDirectory || 'output',
                debug: runConfig.debug
            });
        } finally {
            // Stop countdown timer if it was running
            if (countdownTimer) {
                countdownTimer.stop();
            }
        }

        // Check if recording was cancelled
        if (audioResult.cancelled) {
            logger.info('❌ Audio review cancelled by user');
            throw new CancellationError('Audio review cancelled by user');
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

        const aiStorageAdapter = createStorageAdapter();
        const aiLogger = createLoggerAdapter(isDryRun);

        const transcription = await transcribeAudio(audioFilePath, {
            model: "whisper-1",
            debug: runConfig.debug,
            storage: aiStorageAdapter,
            logger: aiLogger,
            onArchive: async (audioPath: string, transcriptionText: string) => {
                const outputDir = path.join(runConfig.outputDirectory || 'output', 'kodrdriv');
                await archiveAudio(audioPath, transcriptionText, outputDir);
            },
        });

        // Safely validate transcription result
        if (!transcription || typeof transcription !== 'object' || typeof transcription.text !== 'string') {
            throw new Error('Invalid transcription result: missing or invalid text property');
        }
        audioContext = transcription.text;

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed. Proceeding without audio context.');
            audioContext = '';
        } else {
            logger.info('📝 Successfully transcribed audio using kodrdriv');
            logger.debug('Transcribed text: %s', audioContext);
        }

    } catch (error: any) {
        // Re-throw CancellationError to properly handle cancellation
        if (error.name === 'CancellationError') {
            throw error;
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

    return result;
};
