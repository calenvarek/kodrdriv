#!/usr/bin/env node
import path from 'path';
import { processAudio } from '@theunwalked/unplayable';
import { CancellationError, UserCancellationError } from '@eldrforge/shared';
import { getDryRunLogger, getLogger } from '../logging';
import { Config } from '../types';
import { getTimestampedAudioFilename } from '../util/general';
import { transcribeAudio } from '@eldrforge/ai-service';
import { execute as executeCommit } from './commit';
import { createAudioRecordingCountdown, archiveAudio } from '@eldrforge/audio-tools';
import { createStorageAdapter } from '../util/storageAdapter';
import { createLoggerAdapter } from '../util/loggerAdapter';

const executeInternal = async (runConfig: Config): Promise<string> => {
    const isDryRun = runConfig.dryRun || false;
    const logger = getDryRunLogger(isDryRun);

    if (isDryRun) {
        if (runConfig.audioCommit?.file) {
            logger.info('AUDIO_COMMIT_FILE_DRY_RUN: Would process audio file | Mode: dry-run | File: %s | Action: Transcribe + generate commit', runConfig.audioCommit.file);
            logger.info('AUDIO_COMMIT_WORKFLOW_DRY_RUN: Would transcribe and generate message | Mode: dry-run | Purpose: Commit message from audio');
        } else {
            logger.info('AUDIO_COMMIT_RECORD_DRY_RUN: Would start audio recording | Mode: dry-run | Purpose: Commit context');
            logger.info('AUDIO_COMMIT_TRANSCRIPT_DRY_RUN: Would transcribe and generate | Mode: dry-run | Purpose: Extract commit message');
        }
        logger.info('AUDIO_COMMIT_DELEGATE_DRY_RUN: Would delegate to regular commit command | Mode: dry-run | Next: Standard commit flow');

        // Return preview without calling real commands
        return 'DRY RUN: Would process audio, transcribe it, and generate commit message with audio context';
    }

    let audioContext: string;

    try {
        // Step 1: Record audio using unplayable with new key handling
        logger.info('AUDIO_COMMIT_RECORDING_STARTING: Starting audio recording | Purpose: Capture commit context | Tool: unplayable');

        if (!runConfig.audioCommit?.file) {
            logger.info('AUDIO_COMMIT_RECORDING_ACTIVE: Recording in progress | Action: Press ENTER to stop | Alternative: Press C to cancel');
        }

        // Start countdown timer if recording (not processing a file) and maxRecordingTime is set
        const maxRecordingTime = runConfig.audioCommit?.maxRecordingTime;
        const isRecording = !runConfig.audioCommit?.file;
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
                file: runConfig.audioCommit?.file,
                maxRecordingTime: runConfig.audioCommit?.maxRecordingTime,
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
            logger.info('AUDIO_COMMIT_CANCELLED: Audio commit cancelled by user | Reason: User choice | Status: aborted');
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
            logger.warn('AUDIO_COMMIT_FILENAME_GENERATED: Using generated filename for audio | Filename: %s | Warning: May not match actual file from unplayable', audioFilePath);
            logger.warn('AUDIO_COMMIT_FILENAME_NOTE: Filename mismatch possible | Tool: unplayable | Impact: May need manual file lookup');
        }

        // Step 3: Use ai-service transcription functionality
        logger.info('AUDIO_COMMIT_TRANSCRIBING: Transcribing audio locally | Service: OpenAI Whisper | Mode: local | Purpose: Convert speech to text');

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

        audioContext = transcription.text;

        if (!audioContext.trim()) {
            logger.warn('AUDIO_COMMIT_NO_CONTENT: No audio content transcribed | Reason: Empty or invalid | Action: Proceeding without audio context');
            audioContext = '';
        } else {
            logger.info('AUDIO_COMMIT_TRANSCRIPT_SUCCESS: Successfully transcribed audio | Tool: kodrdriv | Length: ' + audioContext.length + ' characters | Status: ready');
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

        logger.error('AUDIO_COMMIT_PROCESSING_FAILED: Audio processing failed | Error: %s | Impact: No audio context available', error.message);
        logger.info('AUDIO_COMMIT_FALLBACK: Proceeding without audio context | Mode: fallback | Next: Standard commit generation');
        audioContext = '';
    }

    // Now delegate to the regular commit command with the audio context
    logger.info('AUDIO_COMMIT_GENERATING: Generating commit message with audio context | Source: transcript | Purpose: AI-generated commit message');
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

        // Handle user cancellation gracefully - don't exit process
        if (error instanceof UserCancellationError) {
            logger.info('AUDIO_COMMIT_ERROR: Error during audio commit | Error: ' + error.message);
            throw error; // Let calling code handle this
        }

        // Handle other errors - don't exit process
        logger.error(`AUDIO_COMMIT_FAILED: Audio commit command failed | Error: ${error.message} | Impact: Commit not generated`);
        if (error.cause) {
            logger.debug(`Caused by: ${error.cause.message}`);
        }
        throw error; // Let calling code handle this
    }
};
