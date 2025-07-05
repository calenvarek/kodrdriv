#!/usr/bin/env node

import { getLogger } from '../logging';
import { Config } from '../types';
import { execute as executeReview } from './review';
import { processAudio } from '@theunwalked/unplayable';
import { transcribeAudio } from '../util/openai';
import { getTimestampedAudioFilename } from '../util/general';
import * as Storage from '../util/storage';
import path from 'path';

// Common audio file extensions
const AUDIO_EXTENSIONS = ['.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.wma'];

/**
 * Discover audio files in a directory
 */
const discoverAudioFiles = async (directory: string): Promise<string[]> => {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.debug });

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

        const transcription = await transcribeAudio(audioFilePath, {
            model: "whisper-1",
            debug: runConfig.debug,
            outputDirectory: path.join(runConfig.outputDirectory || 'output', 'kodrdriv')
        });

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
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Check if directory option is provided (we'll access it directly from audioReview config)
    const directory = (runConfig.audioReview as any)?.directory;

    if (directory) {
        // Directory batch processing mode
        logger.info('🎵 Starting directory batch audio review for: %s', directory);

        if (isDryRun) {
            logger.info('DRY RUN: Would discover and process all audio files in directory: %s', directory);
            logger.info('DRY RUN: Would transcribe each audio file and run review analysis');
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