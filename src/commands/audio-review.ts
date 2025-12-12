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

        logger.info(`AUDIO_REVIEW_FILES_FOUND: Found audio files in directory | Count: ${audioFiles.length} | Directory: ${directory} | Status: ready-for-processing`);
        logger.debug('Audio files found: %s', audioFiles.join(', '));

        return audioFiles;
    } catch (error: any) {
        logger.error('AUDIO_REVIEW_DISCOVERY_FAILED: Failed to discover audio files | Directory: %s | Error: %s | Impact: Cannot process batch', directory, error.message);
        throw error;
    }
};

/**
 * Process a single audio file for review
 */
const processSingleAudioFile = async (audioFilePath: string, runConfig: Config): Promise<string> => {
    const logger = getLogger();

    try {
        logger.info('AUDIO_REVIEW_PROCESSING: Processing audio file | File: %s | Action: Transcribe and analyze', path.basename(audioFilePath));

        // Use kodrdriv's transcription functionality
        logger.info('AUDIO_REVIEW_TRANSCRIBING: Transcribing audio using OpenAI Whisper | Service: OpenAI Whisper | Purpose: Convert speech to text');

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
            logger.warn('AUDIO_REVIEW_NO_TRANSCRIPT: No audio content transcribed | File: %s | Reason: Empty or invalid audio | Action: Skipping', audioFilePath);
            return '';
        } else {
            logger.info('AUDIO_REVIEW_TRANSCRIBED: Successfully transcribed audio | File: %s | Length: %d characters | Status: ready', path.basename(audioFilePath), audioContext.length);
            logger.debug('Transcribed text: %s', audioContext);
        }

        // Now delegate to the regular review command with the audio context
        logger.info('AUDIO_REVIEW_ANALYZING: Analyzing review from transcript | File: %s | Action: AI analysis | Purpose: Extract issues', path.basename(audioFilePath));
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
        logger.error('AUDIO_REVIEW_FILE_FAILED: Failed to process audio file | File: %s | Error: %s | Impact: File not analyzed', audioFilePath, error.message);
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
        logger.info('AUDIO_REVIEW_BATCH_STARTING: Starting directory batch audio review | Directory: %s | Mode: batch | Purpose: Process all audio files', directory);

        if (isDryRun) {
            logger.info('AUDIO_REVIEW_BATCH_DRY_RUN: Would discover and process audio files | Mode: dry-run | Directory: %s | Action: Discover + transcribe + analyze', directory);
            logger.info('AUDIO_REVIEW_BATCH_WORKFLOW: Would transcribe and analyze each file | Mode: dry-run | Purpose: Review analysis from audio');
            return 'DRY RUN: Directory batch processing would be performed';
        }

        try {
            // Discover audio files in the directory
            const audioFiles = await discoverAudioFiles(directory);

            if (audioFiles.length === 0) {
                logger.warn('AUDIO_REVIEW_NO_FILES: No audio files found in directory | Directory: %s | Extensions: .mp3, .wav, .m4a, .ogg | Action: Nothing to process', directory);
                return 'No audio files found to process';
            }

            const results: string[] = [];

            // Process each audio file
            for (let i = 0; i < audioFiles.length; i++) {
                const audioFile = audioFiles[i];
                logger.info(`\nAUDIO_REVIEW_BATCH_FILE: Processing batch file | Progress: ${i + 1}/${audioFiles.length} | File: ${path.basename(audioFile)}`);

                const result = await processSingleAudioFile(audioFile, runConfig);
                results.push(`File: ${path.basename(audioFile)}\n${result}`);

                // Add a separator between files (except for the last one)
                if (i < audioFiles.length - 1) {
                    logger.info('AUDIO_REVIEW_FILE_COMPLETE: Completed file processing | File: %s | Status: completed\n', path.basename(audioFile));
                }
            }

            logger.info('AUDIO_REVIEW_BATCH_COMPLETE: Completed batch processing | Files Processed: %d | Status: all-completed', audioFiles.length);

            // Combine all results
            const combinedResults = `Batch Audio Review Results (${audioFiles.length} files):\n\n` +
                results.join('\n\n---\n\n');

            return combinedResults;

        } catch (error: any) {
            logger.error('AUDIO_REVIEW_BATCH_FAILED: Directory batch processing failed | Error: %s | Impact: Batch incomplete', error.message);
            throw error;
        }
    }

    // Original single file/recording logic
    if (isDryRun) {
        if (runConfig.audioReview?.file) {
            logger.info('AUDIO_REVIEW_FILE_DRY_RUN: Would process audio file | Mode: dry-run | File: %s | Action: Transcribe + analyze', runConfig.audioReview.file);
            logger.info('AUDIO_REVIEW_WORKFLOW_DRY_RUN: Would transcribe and analyze | Mode: dry-run | Purpose: Review context from audio');
        } else {
            logger.info('AUDIO_REVIEW_RECORD_DRY_RUN: Would start audio recording | Mode: dry-run | Purpose: Review context');
            logger.info('AUDIO_REVIEW_TRANSCRIPT_DRY_RUN: Would transcribe and analyze | Mode: dry-run | Purpose: Extract review content');
        }
        logger.info('AUDIO_REVIEW_DELEGATE_DRY_RUN: Would delegate to regular review command | Mode: dry-run | Next: Standard review flow');

        // Return preview without calling real commands
        return 'DRY RUN: Would process audio, transcribe it, and perform review analysis with audio context';
    }

    let audioContext: string;

    try {
        // Step 1: Record audio using unplayable with new key handling
        logger.info('AUDIO_REVIEW_RECORDING_STARTING: Starting audio recording | Purpose: Capture review context | Tool: unplayable');

        if (!runConfig.audioReview?.file) {
            logger.info('AUDIO_REVIEW_RECORDING_ACTIVE: Recording in progress | Action: Press ENTER to stop | Alternative: Press C to cancel');
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
            logger.info('AUDIO_REVIEW_CANCELLED: Audio review cancelled by user | Reason: User choice | Status: aborted');
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
            logger.warn('AUDIO_REVIEW_FILENAME_GENERATED: Using generated filename for audio | Filename: %s | Warning: May not match actual file from unplayable', audioFilePath);
            logger.warn('AUDIO_REVIEW_FILENAME_NOTE: Filename mismatch possible | Tool: unplayable | Impact: May need manual file lookup');
        }

        // Step 3: Use kodrdriv's transcription functionality
        logger.info('AUDIO_REVIEW_TRANSCRIBING_LOCAL: Transcribing audio locally | Service: OpenAI Whisper | Mode: local | Purpose: Convert speech to text');

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
            logger.warn('AUDIO_REVIEW_NO_CONTENT: No audio content transcribed | Reason: Empty or invalid | Action: Proceeding without audio context');
            audioContext = '';
        } else {
            logger.info('AUDIO_REVIEW_TRANSCRIPT_SUCCESS: Successfully transcribed audio | Tool: kodrdriv | Length: ' + audioContext.length + ' characters | Status: ready');
            logger.debug('Transcribed text: %s', audioContext);
        }

    } catch (error: any) {
        // Re-throw CancellationError to properly handle cancellation
        if (error.name === 'CancellationError') {
            throw error;
        }

        logger.error('AUDIO_REVIEW_PROCESSING_FAILED: Audio processing failed | Error: %s | Impact: No audio context available', error.message);
        logger.info('AUDIO_REVIEW_FALLBACK: Proceeding without audio context | Mode: fallback | Next: Standard review analysis');
        audioContext = '';
    }

    // Now delegate to the regular review command with the audio context
    logger.info('AUDIO_REVIEW_ANALYSIS_STARTING: Analyzing review with audio context | Source: transcript | Purpose: Extract actionable issues');
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
