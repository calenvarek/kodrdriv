#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import { Config } from '../types';
import { transcribeAudio } from '../util/openai';
import { run } from '../util/child';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { create as createStorage } from '../util/storage';
import { execute as executeCommit } from './commit';

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    if (isDryRun) {
        logger.info('DRY RUN: Would start audio recording for commit context');
        logger.info('DRY RUN: Would transcribe audio and use as context for commit message generation');
        logger.info('DRY RUN: Would then delegate to regular commit command');

        // In dry run, just call the regular commit command with empty audio context
        return executeCommit({
            ...runConfig,
            commit: {
                ...runConfig.commit,
                context: runConfig.commit?.context || ''
            }
        });
    }

    // Start audio recording and transcription
    logger.info('Starting audio recording for commit context...');
    logger.info('This command will use your system\'s default audio recording tool');
    logger.info('Press Ctrl+C after you finish speaking to generate your commit message');

    const audioContext = await recordAndTranscribeAudio(runConfig);

    // Now delegate to the regular commit command with the audio context
    return executeCommit({
        ...runConfig,
        commit: {
            ...runConfig.commit,
            context: audioContext.trim() || runConfig.commit?.context || ''
        }
    });
};

const recordAndTranscribeAudio = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    const tempDir = await fs.mkdtemp(path.join(outputDirectory, '.temp-audio-'));
    const audioFilePath = path.join(tempDir, 'recording.wav');

    try {
        // Use system recording tool - cross-platform approach
        logger.info('🎤 Starting recording... Speak now!');
        logger.info('Recording will stop automatically after 30 seconds or when you press Ctrl+C');

        let recordingProcess: any;
        let recordingFinished = false;
        let countdownInterval: NodeJS.Timeout | null = null;
        let remainingSeconds = 30;

        // Start countdown display
        const startCountdown = () => {
            // Show initial countdown
            process.stdout.write(`\r⏱️  Recording: ${remainingSeconds}s remaining`);

            countdownInterval = setInterval(() => {
                remainingSeconds--;
                if (remainingSeconds > 0) {
                    process.stdout.write(`\r⏱️  Recording: ${remainingSeconds}s remaining`);
                } else {
                    process.stdout.write('\r⏱️  Recording: Time\'s up!          \n');
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                }
            }, 1000);
        };

        // Determine which recording command to use based on platform
        let recordCommand: string;
        if (process.platform === 'darwin') {
            // macOS - try ffmpeg first, then fall back to manual recording
            try {
                // Check if ffmpeg is available
                await run('which ffmpeg');
                recordCommand = `ffmpeg -f avfoundation -i ":0" -t 30 -y "${audioFilePath}"`;
            } catch {
                // ffmpeg not available, try sox/rec
                try {
                    await run('which rec');
                    recordCommand = `rec -r 44100 -c 1 -t wav "${audioFilePath}" trim 0 30`;
                } catch {
                    // Neither available, use manual fallback
                    throw new Error('MANUAL_RECORDING_NEEDED');
                }
            }
        } else if (process.platform === 'win32') {
            // Windows - use ffmpeg if available, otherwise fallback
            try {
                await run('where ffmpeg');
                recordCommand = `ffmpeg -f dshow -i audio="Microphone" -t 30 -y "${audioFilePath}"`;
            } catch {
                throw new Error('MANUAL_RECORDING_NEEDED');
            }
        } else {
            // Linux - use arecord (ALSA) or ffmpeg
            try {
                await run('which arecord');
                recordCommand = `arecord -f cd -t wav -d 30 "${audioFilePath}"`;
            } catch {
                try {
                    await run('which ffmpeg');
                    recordCommand = `ffmpeg -f alsa -i default -t 30 -y "${audioFilePath}"`;
                } catch {
                    throw new Error('MANUAL_RECORDING_NEEDED');
                }
            }
        }

        // Start recording as a background process
        try {
            recordingProcess = run(recordCommand);
        } catch (error: any) {
            if (error.message === 'MANUAL_RECORDING_NEEDED') {
                // Provide helpful instructions for manual recording
                logger.warn('⚠️  Automatic recording not available on this system.');
                logger.warn('📱 Please record audio manually using your system\'s built-in tools:');
                logger.warn('');
                if (process.platform === 'darwin') {
                    logger.warn('🍎 macOS options:');
                    logger.warn('   1. Use QuickTime Player: File → New Audio Recording');
                    logger.warn('   2. Use Voice Memos app');
                    logger.warn('   3. Install ffmpeg: brew install ffmpeg');
                    logger.warn('   4. Install sox: brew install sox');
                } else if (process.platform === 'win32') {
                    logger.warn('🪟 Windows options:');
                    logger.warn('   1. Use Voice Recorder app');
                    logger.warn('   2. Install ffmpeg: https://ffmpeg.org/download.html');
                } else {
                    logger.warn('🐧 Linux options:');
                    logger.warn('   1. Install alsa-utils: sudo apt install alsa-utils');
                    logger.warn('   2. Install ffmpeg: sudo apt install ffmpeg');
                }
                logger.warn('');
                logger.warn(`💾 Save your recording as: ${audioFilePath}`);
                logger.warn('🎵 Recommended format: WAV, 44.1kHz, mono or stereo');
                logger.warn('');
                logger.warn('⌨️  Press ENTER when you have saved the audio file...');

                // Wait for user input
                await new Promise(resolve => {
                    process.stdin.setRawMode(true);
                    process.stdin.resume();
                    process.stdin.on('data', (key) => {
                        if (key[0] === 13) { // Enter key
                            process.stdin.setRawMode(false);
                            process.stdin.pause();
                            resolve(void 0);
                        }
                    });
                });
            } else {
                throw error;
            }
        }

        // Set up graceful shutdown
        const stopRecording = async () => {
            if (!recordingFinished) {
                recordingFinished = true;

                // Clear countdown
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }

                // Clear the countdown line and show recording stopped
                process.stdout.write('\r⏱️  Recording stopped!                \n');

                if (recordingProcess && recordingProcess.kill) {
                    recordingProcess.kill();
                }
                logger.info('🛑 Recording stopped');
            }
        };

        // Listen for Ctrl+C
        process.on('SIGINT', stopRecording);

        // Start countdown if we have a recording process
        if (recordingProcess) {
            startCountdown();
        }

        // Wait for recording to finish (either timeout or manual stop)
        if (recordingProcess) {
            try {
                await recordingProcess;
                // Clear countdown on successful completion
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }
                process.stdout.write('\r⏱️  Recording completed!               \n');
                logger.info('✅ Recording completed automatically');
            } catch (error: any) {
                // Clear countdown on error
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }

                if (!recordingFinished && error.signal === 'SIGTERM') {
                    process.stdout.write('\r⏱️  Recording stopped by user!         \n');
                    logger.info('✅ Recording stopped by user');
                } else if (!recordingFinished) {
                    process.stdout.write('\r⏱️  Recording error!                   \n');
                    logger.warn('Recording process ended unexpectedly: %s', error.message);
                }
            }
        }

        // Ensure recording is stopped
        await stopRecording();

        // Check if audio file exists
        try {
            await fs.access(audioFilePath);
            const stats = await fs.stat(audioFilePath);
            if (stats.size === 0) {
                throw new Error('Audio file is empty');
            }
            logger.info('✅ Audio file created successfully (%d bytes)', stats.size);
        } catch (error: any) {
            throw new Error(`Failed to create audio file: ${error.message}`);
        }

        // Transcribe the audio
        logger.info('🎯 Transcribing audio...');
        const transcription = await transcribeAudio(audioFilePath);
        const audioContext = transcription.text;
        logger.info('✅ Audio transcribed successfully');
        logger.debug('Transcription: %s', audioContext);

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed. Proceeding without audio context.');
            return '';
        } else {
            logger.info('📝 Using transcribed audio as commit context');
            return audioContext;
        }

    } catch (error: any) {
        logger.error('Audio recording/transcription failed: %s', error.message);
        logger.info('Proceeding with commit generation without audio context...');
        return '';
    } finally {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error: any) {
            logger.debug('Failed to clean up temporary directory: %s', error.message);
        }
    }
}; 