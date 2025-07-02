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
import { execute as executeReview } from './review';

const detectBestAudioDevice = async (): Promise<string> => {
    try {
        // Get list of audio devices - this command always "fails" but gives us the device list
        try {
            await run('ffmpeg -f avfoundation -list_devices true -i ""');
        } catch (result: any) {
            // ffmpeg returns error code but we get the device list in stderr
            const output = result.stderr || result.stdout || '';

            // Parse audio devices from output
            const audioDevicesSection = output.split('AVFoundation audio devices:')[1];
            if (!audioDevicesSection) return '1'; // Default fallback

            const deviceLines = audioDevicesSection.split('\n')
                .filter((line: string) => line.includes('[') && line.includes(']'))
                .map((line: string) => line.trim());

            // Prefer AirPods, then built-in microphone over virtual/external devices
            const preferredDevices = [
                'AirPods',
                'MacBook Pro Microphone',
                'MacBook Air Microphone',
                'Built-in Microphone',
                'Internal Microphone'
            ];

            for (const deviceLine of deviceLines) {
                for (const preferred of preferredDevices) {
                    if (deviceLine.toLowerCase().includes(preferred.toLowerCase())) {
                        // Extract device index
                        const match = deviceLine.match(/\[(\d+)\]/);
                        if (match) {
                            return match[1];
                        }
                    }
                }
            }
        }

        // If no preferred device found, use device 1 as default (usually better than 0)
        return '1';
    } catch (error) {
        // Fallback to device 1
        return '1';
    }
};

const parseAudioDevices = async (): Promise<Array<{ index: string; name: string }>> => {
    try {
        try {
            await run('ffmpeg -f avfoundation -list_devices true -i ""');
        } catch (result: any) {
            const output = result.stderr || result.stdout || '';
            const audioDevicesSection = output.split('AVFoundation audio devices:')[1];

            if (audioDevicesSection) {
                const deviceLines = audioDevicesSection.split('\n')
                    .filter((line: string) => line.includes('[') && line.includes(']'))
                    .map((line: string) => line.trim());

                return deviceLines.map((line: string) => {
                    const match = line.match(/\[(\d+)\]\s+(.+)/);
                    if (match) {
                        return { index: match[1], name: match[2] };
                    }
                    return null;
                }).filter(Boolean) as Array<{ index: string; name: string }>;
            }
        }
        return [];
    } catch (error) {
        return [];
    }
};

const selectAudioDeviceInteractively = async (runConfig: Config): Promise<string | null> => {
    const logger = getLogger();

    logger.info('🎙️  Available audio devices:');
    const devices = await parseAudioDevices();

    if (devices.length === 0) {
        logger.error('❌ No audio devices found. Make sure ffmpeg is installed and audio devices are available.');
        return null;
    }

    // Display devices
    devices.forEach((device, i) => {
        logger.info(`   ${i + 1}. [${device.index}] ${device.name}`);
    });

    logger.info('');
    logger.info('📋 Select an audio device by entering its number (1-' + devices.length + '):');

    return new Promise((resolve) => {
        // Set up keyboard input
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.setEncoding('utf8');

        let inputBuffer = '';

        const keyHandler = (key: string) => {
            const keyCode = key.charCodeAt(0);

            if (keyCode === 13) { // ENTER key
                const selectedIndex = parseInt(inputBuffer) - 1;

                if (selectedIndex >= 0 && selectedIndex < devices.length) {
                    const selectedDevice = devices[selectedIndex];
                    logger.info(`✅ Selected: [${selectedDevice.index}] ${selectedDevice.name}`);

                    // Save to configuration
                    saveAudioDeviceToConfig(runConfig, selectedDevice.index, selectedDevice.name)
                        .then(() => {
                            logger.info('💾 Audio device saved to configuration');
                        })
                        .catch((error) => {
                            logger.warn('⚠️  Failed to save audio device to configuration: %s', error.message);
                        });

                    // Cleanup and resolve
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', keyHandler);
                    resolve(selectedDevice.index);
                } else {
                    logger.error('❌ Invalid selection. Please enter a number between 1 and ' + devices.length);
                    inputBuffer = '';
                    process.stdout.write('📋 Select an audio device: ');
                }
            } else if (keyCode === 3) { // Ctrl+C
                logger.info('\n❌ Selection cancelled');
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeListener('data', keyHandler);
                resolve(null);
            } else if (keyCode >= 48 && keyCode <= 57) { // Numbers 0-9
                inputBuffer += key;
                process.stdout.write(key);
            } else if (keyCode === 127) { // Backspace
                if (inputBuffer.length > 0) {
                    inputBuffer = inputBuffer.slice(0, -1);
                    process.stdout.write('\b \b');
                }
            }
        };

        process.stdin.on('data', keyHandler);
        process.stdout.write('📋 Select an audio device: ');
    });
};

const saveAudioDeviceToConfig = async (runConfig: Config, deviceIndex: string, deviceName: string): Promise<void> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    try {
        const configDir = runConfig.configDirectory || DEFAULT_OUTPUT_DIRECTORY;
        await storage.ensureDirectory(configDir);

        const configPath = getOutputPath(configDir, 'audio-config.json');

        // Read existing config or create new one
        let audioConfig: any = {};
        try {
            const existingConfig = await storage.readFile(configPath, 'utf-8');
            audioConfig = JSON.parse(existingConfig);
        } catch (error) {
            // File doesn't exist or is invalid, start with empty config
            audioConfig = {};
        }

        // Update audio device
        audioConfig.audioDevice = deviceIndex;
        audioConfig.audioDeviceName = deviceName;
        audioConfig.lastUpdated = new Date().toISOString();

        // Save updated config
        await storage.writeFile(configPath, JSON.stringify(audioConfig, null, 2), 'utf-8');
        logger.debug('Saved audio configuration to: %s', configPath);

    } catch (error: any) {
        logger.error('Failed to save audio configuration: %s', error.message);
        throw error;
    }
};

const loadAudioDeviceFromConfig = async (runConfig: Config): Promise<string | null> => {
    const logger = getLogger();
    const storage = createStorage({ log: logger.info });

    try {
        const configDir = runConfig.configDirectory || DEFAULT_OUTPUT_DIRECTORY;
        const configPath = getOutputPath(configDir, 'audio-config.json');

        const configContent = await storage.readFile(configPath, 'utf-8');
        const audioConfig = JSON.parse(configContent);

        if (audioConfig.audioDevice) {
            logger.debug('Loaded audio device from config: [%s] %s', audioConfig.audioDevice, audioConfig.audioDeviceName || 'Unknown');
            return audioConfig.audioDevice;
        }

        return null;
    } catch (error) {
        // Config file doesn't exist or is invalid
        logger.debug('No saved audio device configuration found');
        return null;
    }
};

const listAudioDevices = async (): Promise<void> => {
    const logger = getLogger();
    try {
        try {
            await run('ffmpeg -f avfoundation -list_devices true -i ""');
        } catch (result: any) {
            const output = result.stderr || result.stdout || '';
            const audioDevicesSection = output.split('AVFoundation audio devices:')[1];

            if (audioDevicesSection) {
                logger.info('🎙️  Available audio devices:');
                const deviceLines = audioDevicesSection.split('\n')
                    .filter((line: string) => line.includes('[') && line.includes(']'))
                    .map((line: string) => line.trim());

                deviceLines.forEach((line: string) => {
                    const match = line.match(/\[(\d+)\]\s+(.+)/);
                    if (match) {
                        logger.info(`   [${match[1]}] ${match[2]}`);
                    }
                });
            }
        }
    } catch (error) {
        logger.debug('Could not list audio devices');
    }
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Handle audio device selection if requested
    if (runConfig.audioReview?.selectAudioDevice) {
        logger.info('🎛️  Starting audio device selection...');
        const selectedDevice = await selectAudioDeviceInteractively(runConfig);

        if (selectedDevice === null) {
            logger.error('❌ Audio device selection cancelled or failed');
            process.exit(1);
        }

        logger.info('✅ Audio device selection complete');
        logger.info('');
        logger.info('You can now run the audio-review command without --select-audio-device to use your saved device');
        return 'Audio device configured successfully';
    }

    if (isDryRun) {
        logger.info('DRY RUN: Would start audio recording for review context');
        logger.info('DRY RUN: Would transcribe audio and use as context for review analysis');
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

    // Start audio recording and transcription
    logger.info('Starting audio recording for review context...');
    logger.info('This command will use your system\'s default audio recording tool');
    logger.info('💡 Tip: Use --select-audio-device to choose a specific microphone');
    logger.info('Press Ctrl+C after you finish speaking to generate your review analysis');

    const audioContext = await recordAndTranscribeAudio(runConfig);

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

const recordAndTranscribeAudio = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    const tempDir = await fs.mkdtemp(path.join(outputDirectory, '.temp-audio-'));
    const audioFilePath = path.join(tempDir, 'recording.wav');

    // Declare variables at function scope for cleanup access
    let recordingProcess: any = null;
    let recordingFinished = false;
    let recordingCancelled = false;
    let countdownInterval: NodeJS.Timeout | null = null;
    let remainingSeconds = 30;
    let intendedRecordingTime = 30;
    const maxRecordingTime = runConfig.audioReview?.maxRecordingTime || 300; // 5 minutes default
    const extensionTime = 30; // 30 seconds per extension

    try {
        // Use system recording tool - cross-platform approach
        logger.info('🎤 Starting recording... Speak now!');
        logger.info('📋 Controls: ENTER=done, E=extend+30s, C/Ctrl+C=cancel');

        // List available audio devices in debug mode
        if (runConfig.debug) {
            await listAudioDevices();
        }

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
                    // Immediate feedback
                    process.stdout.write('\r✅ ENTER pressed - stopping recording...                          \n');
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', keyHandler);
                    stopRecording();
                } else if (key.toLowerCase() === 'e') { // 'e' or 'E' key
                    extendRecording();
                } else if (key.toLowerCase() === 'c' || keyCode === 3) { // 'c', 'C', or Ctrl+C
                    // Immediate feedback
                    process.stdout.write('\r❌ Cancelling recording...                                       \n');
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

                // Get the best audio device (from saved config, CLI config, or auto-detected)
                const savedDevice = await loadAudioDeviceFromConfig(runConfig);
                const audioDevice = runConfig.audioReview?.audioDevice || savedDevice || await detectBestAudioDevice();
                recordCommand = `ffmpeg -f avfoundation -i ":${audioDevice}" -t ${maxRecordingTime} -y "${audioFilePath}"`;

                if (runConfig.audioReview?.audioDevice) {
                    logger.info(`🎙️  Using audio device ${audioDevice} (from CLI configuration)`);
                } else if (savedDevice) {
                    logger.info(`🎙️  Using audio device ${audioDevice} (from saved configuration)`);
                } else {
                    logger.info(`🎙️  Using audio device ${audioDevice} (auto-detected)`);
                }
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
                    recordingProcess.kill('SIGTERM');
                }
                logger.info('🛑 Recording stopped - proceeding with review');
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
                    recordingProcess.kill('SIGTERM');
                }

                logger.info('❌ Audio review cancelled by user');
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

            // Create a promise that resolves when user manually stops recording
            const manualStopPromise = new Promise<void>((resolve) => {
                const checkInterval = setInterval(() => {
                    if (recordingFinished || recordingCancelled) {
                        clearInterval(checkInterval);
                        resolve();
                    }
                }, 100);
            });

            // Wait for either the recording to finish naturally or manual stop
            try {
                await Promise.race([recordingProcess, manualStopPromise]);

                // If manually stopped, force kill the process if it's still running
                if (recordingFinished && recordingProcess && !recordingProcess.killed) {
                    recordingProcess.kill('SIGKILL');
                    // Give it a moment to die
                    await new Promise(resolve => setTimeout(resolve, 200));
                }

                // Only show completion message if not manually finished
                if (!recordingCancelled && !recordingFinished) {
                    // Clear countdown on successful completion
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }

                    process.stdout.write('\r⏱️  Recording completed!                               \n');
                    logger.info('✅ Recording completed automatically');
                }
            } catch (error: any) {
                // Only handle errors if not cancelled and not manually finished
                if (!recordingCancelled && !recordingFinished) {
                    // Clear countdown on error
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }

                    if (error.signal === 'SIGTERM' || error.signal === 'SIGKILL') {
                        // This is expected when we kill the process
                        logger.debug('Recording process terminated as expected');
                    } else {
                        logger.warn('Recording process ended unexpectedly: %s', error.message);
                    }
                }
            }

            // Always clean up keyboard input
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
            }
        }

        // If recording was cancelled, exit early
        if (recordingCancelled) {
            return '';
        }

        // Wait a moment for the recording file to be fully written
        if (recordingFinished) {
            await new Promise(resolve => setTimeout(resolve, 500));
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
        logger.info('⏳ This may take a few seconds depending on audio length...');
        const transcription = await transcribeAudio(audioFilePath);
        const audioContext = transcription.text;
        logger.info('✅ Audio transcribed successfully');
        logger.debug('Transcription: %s', audioContext);

        // Save audio file and transcript to output directory
        logger.info('💾 Saving audio file and transcript...');
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
            logger.info('📝 Using transcribed audio as review note');
            return audioContext;
        }

    } catch (error: any) {
        logger.error('Audio recording/transcription failed: %s', error.message);
        logger.info('Proceeding with review analysis without audio context...');
        return '';
    } finally {
        // Comprehensive cleanup to ensure program can exit
        try {
            // Clear any remaining countdown interval
            if (countdownInterval) {
                clearInterval(countdownInterval);
                countdownInterval = null;
            }

            // Ensure stdin is properly reset
            if (process.stdin.setRawMode) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                process.stdin.removeAllListeners('data');
            }

            // Remove process event listeners that we added
            process.removeAllListeners('SIGINT');
            process.removeAllListeners('SIGTERM');

            // Force kill any remaining recording process
            if (recordingProcess && !recordingProcess.killed) {
                try {
                    recordingProcess.kill('SIGKILL');
                } catch (killError) {
                    // Ignore kill errors
                }
            }

            // Clean up temporary directory
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (cleanupError: any) {
            logger.debug('Cleanup warning: %s', cleanupError.message);
        }
    }
}; 