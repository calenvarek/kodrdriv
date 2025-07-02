#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../logging';
import { Config } from '../types';
import { transcribeAudio } from '../util/openai';
import { run } from '../util/child';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getOutputPath, getTimestampedAudioFilename, getTimestampedTranscriptFilename } from '../util/general';
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
        logger.info('📋 Controls: ENTER=done, E=extend+30s, C/Ctrl+C=cancel');

        let recordingProcess: any;
        let recordingFinished = false;
        let recordingCancelled = false;
        let countdownInterval: NodeJS.Timeout | null = null;
        let remainingSeconds = 30;
        let intendedRecordingTime = 30;
        const maxRecordingTime = runConfig.audioCommit?.maxRecordingTime || 300; // 5 minutes default
        const extensionTime = 30; // 30 seconds per extension

        // Start countdown display
        const startCountdown = () => {
            // Show initial countdown
            updateCountdownDisplay();

            countdownInterval = setInterval(() => {
                remainingSeconds--;
                if (remainingSeconds > 0) {
                    updateCountdownDisplay();
                } else {
                    process.stdout.write('\r⏱️  Recording: Time\'s up!                                        \n');
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                    // Auto-stop when intended time is reached
                    stopRecording();
                }
            }, 1000);
        };

        const updateCountdownDisplay = () => {
            const maxMinutes = Math.floor(maxRecordingTime / 60);
            const intendedMinutes = Math.floor(intendedRecordingTime / 60);
            const intendedSeconds = intendedRecordingTime % 60;
            process.stdout.write(`\r⏱️  Recording: ${remainingSeconds}s left (${intendedMinutes}:${intendedSeconds.toString().padStart(2, '0')}/${maxMinutes}:00 max) [ENTER=done, E=+30s, C=cancel]`);
        };

        const extendRecording = () => {
            const newTotal = intendedRecordingTime + extensionTime;
            if (newTotal <= maxRecordingTime) {
                intendedRecordingTime = newTotal;
                remainingSeconds += extensionTime;
                logger.info(`🔄 Extended recording by ${extensionTime}s (total: ${Math.floor(intendedRecordingTime / 60)}:${(intendedRecordingTime % 60).toString().padStart(2, '0')})`);
                updateCountdownDisplay();
            } else {
                const canExtend = maxRecordingTime - intendedRecordingTime;
                if (canExtend > 0) {
                    intendedRecordingTime = maxRecordingTime;
                    remainingSeconds += canExtend;
                    logger.info(`🔄 Extended recording by ${canExtend}s (maximum reached: ${Math.floor(maxRecordingTime / 60)}:${(maxRecordingTime % 60).toString().padStart(2, '0')})`);
                    updateCountdownDisplay();
                } else {
                    logger.warn(`⚠️  Cannot extend: maximum recording time (${Math.floor(maxRecordingTime / 60)}:${(maxRecordingTime % 60).toString().padStart(2, '0')}) reached`);
                }
            }
        };

        // Set up keyboard input handling
        const setupKeyboardHandling = () => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.setEncoding('utf8');

            const keyHandler = (key: string) => {
                const keyCode = key.charCodeAt(0);

                if (keyCode === 13) { // ENTER key
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', keyHandler);
                    stopRecording();
                } else if (key.toLowerCase() === 'e') { // 'e' or 'E' key
                    extendRecording();
                } else if (key.toLowerCase() === 'c' || keyCode === 3) { // 'c', 'C', or Ctrl+C
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', keyHandler);
                    cancelRecording();
                }
            };

            process.stdin.on('data', keyHandler);
        };

        // Determine which recording command to use based on platform (using max time)
        let recordCommand: string;
        if (process.platform === 'darwin') {
            // macOS - try ffmpeg first, then fall back to manual recording
            try {
                // Check if ffmpeg is available
                await run('which ffmpeg');
                recordCommand = `ffmpeg -f avfoundation -i ":0" -t ${maxRecordingTime} -y "${audioFilePath}"`;
            } catch {
                // ffmpeg not available, try sox/rec
                try {
                    await run('which rec');
                    recordCommand = `rec -r 44100 -c 1 -t wav "${audioFilePath}" trim 0 ${maxRecordingTime}`;
                } catch {
                    // Neither available, use manual fallback
                    throw new Error('MANUAL_RECORDING_NEEDED');
                }
            }
        } else if (process.platform === 'win32') {
            // Windows - use ffmpeg if available, otherwise fallback
            try {
                await run('where ffmpeg');
                recordCommand = `ffmpeg -f dshow -i audio="Microphone" -t ${maxRecordingTime} -y "${audioFilePath}"`;
            } catch {
                throw new Error('MANUAL_RECORDING_NEEDED');
            }
        } else {
            // Linux - use arecord (ALSA) or ffmpeg
            try {
                await run('which arecord');
                recordCommand = `arecord -f cd -t wav -d ${maxRecordingTime} "${audioFilePath}"`;
            } catch {
                try {
                    await run('which ffmpeg');
                    recordCommand = `ffmpeg -f alsa -i default -t ${maxRecordingTime} -y "${audioFilePath}"`;
                } catch {
                    throw new Error('MANUAL_RECORDING_NEEDED');
                }
            }
        }

        // Start recording as a background process (with max time, we'll stop it early if needed)
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

                // Wait for user input (disable our keyboard handling for this)
                await new Promise(resolve => {
                    const originalRawMode = process.stdin.setRawMode;
                    process.stdin.setRawMode(true);
                    process.stdin.resume();
                    const enterHandler = (key: Buffer) => {
                        if (key[0] === 13) { // Enter key
                            process.stdin.setRawMode(false);
                            process.stdin.pause();
                            process.stdin.removeListener('data', enterHandler);
                            resolve(void 0);
                        }
                    };
                    process.stdin.on('data', enterHandler);
                });

                // Skip the automatic recording and keyboard handling for manual recording
                recordingProcess = null;
            } else {
                throw error;
            }
        }

        // Set up graceful shutdown
        const stopRecording = async () => {
            if (!recordingFinished && !recordingCancelled) {
                recordingFinished = true;

                // Clear countdown
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }

                // Clear the countdown line and show recording stopped
                process.stdout.write('\r⏱️  Recording finished!                                  \n');

                if (recordingProcess && recordingProcess.kill) {
                    recordingProcess.kill();
                }
                logger.info('🛑 Recording stopped - proceeding with commit');
            }
        };

        // Set up cancellation
        const cancelRecording = async () => {
            if (!recordingFinished && !recordingCancelled) {
                recordingCancelled = true;

                // Clear countdown
                if (countdownInterval) {
                    clearInterval(countdownInterval);
                    countdownInterval = null;
                }

                // Clear the countdown line and show cancellation
                process.stdout.write('\r❌ Recording cancelled!                                 \n');

                if (recordingProcess && recordingProcess.kill) {
                    recordingProcess.kill();
                }

                logger.info('❌ Audio commit cancelled by user');
                process.exit(0);
            }
        };

        // Remove the old SIGINT handler and use our new keyboard handling
        // Note: We'll still handle SIGINT for cleanup, but route it through cancelRecording
        process.on('SIGINT', cancelRecording);

        // Start keyboard handling and countdown if we have a recording process
        if (recordingProcess) {
            setupKeyboardHandling();
            startCountdown();
        }

        // Wait for recording to finish (either timeout or manual stop)
        if (recordingProcess) {
            try {
                await recordingProcess;

                // Only proceed if not cancelled
                if (!recordingCancelled) {
                    // Clear countdown on successful completion
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }

                    // Clean up keyboard input
                    if (process.stdin.setRawMode) {
                        process.stdin.setRawMode(false);
                        process.stdin.pause();
                    }

                    process.stdout.write('\r⏱️  Recording completed!                               \n');
                    logger.info('✅ Recording completed automatically');
                }
            } catch (error: any) {
                // Only handle errors if not cancelled
                if (!recordingCancelled) {
                    // Clear countdown on error
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }

                    // Clean up keyboard input
                    if (process.stdin.setRawMode) {
                        process.stdin.setRawMode(false);
                        process.stdin.pause();
                    }

                    if (!recordingFinished && error.signal === 'SIGTERM') {
                        process.stdout.write('\r⏱️  Recording stopped by user!                         \n');
                        logger.info('✅ Recording stopped by user');
                    } else if (!recordingFinished) {
                        process.stdout.write('\r⏱️  Recording error!                                   \n');
                        logger.warn('Recording process ended unexpectedly: %s', error.message);
                    }
                }
            }
        }

        // If recording was cancelled, we should have already exited, but just in case
        if (recordingCancelled) {
            return '';
        }

        // Ensure recording is stopped and keyboard input is cleaned up
        await stopRecording();

        // Clean up keyboard input one more time to be sure
        if (process.stdin.setRawMode) {
            process.stdin.setRawMode(false);
            process.stdin.pause();
        }

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

        // Save audio file and transcript to output directory
        try {
            const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
            const storage = createStorage({ log: logger.info });
            await storage.ensureDirectory(outputDirectory);

            // Save audio file copy
            const audioOutputFilename = getTimestampedAudioFilename();
            const audioOutputPath = getOutputPath(outputDirectory, audioOutputFilename);
            await fs.copyFile(audioFilePath, audioOutputPath);
            logger.debug('Saved audio file: %s', audioOutputPath);

            // Save transcript
            if (audioContext.trim()) {
                const transcriptOutputFilename = getTimestampedTranscriptFilename();
                const transcriptOutputPath = getOutputPath(outputDirectory, transcriptOutputFilename);
                const transcriptContent = `# Audio Transcript\n\n**Recorded:** ${new Date().toISOString()}\n\n**Transcript:**\n\n${audioContext}`;
                await storage.writeFile(transcriptOutputPath, transcriptContent, 'utf-8');
                logger.debug('Saved transcript: %s', transcriptOutputPath);
            }
        } catch (error: any) {
            logger.warn('Failed to save audio/transcript files: %s', error.message);
        }

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