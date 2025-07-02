import fs from 'fs/promises';
import path from 'path';
import { DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getLogger } from '../logging';
import { run } from '../util/child';
import { getOutputPath, getTimestampedAudioFilename, getTimestampedTranscriptFilename } from '../util/general';
import { transcribeAudio } from '../util/openai';
import { create as createStorage } from '../util/storage';
import { audioDeviceConfigExists, loadAudioDeviceFromHomeConfig } from '../commands/select-audio';
import { detectBestAudioDevice, listAudioDevices } from './devices';
import { AudioProcessingOptions, AudioProcessingResult } from './types';
import { validateAudioFile } from './validation';

/**
 * Main audio processor class that handles recording, processing, and transcription
 */
export class AudioProcessor {
    private readonly logger = getLogger();

    /**
     * Process audio from either a file or by recording new audio
     * @param options Audio processing options
     * @returns AudioProcessingResult with transcript and file paths
     */
    async processAudio(options: AudioProcessingOptions): Promise<AudioProcessingResult> {
        // Check if audio device is configured (only for recording, not for file processing)
        if (!options.file && options.preferencesDirectory && !await audioDeviceConfigExists(options.preferencesDirectory)) {
            throw new Error('No audio device configured. Please run "kodrdriv select-audio" first to configure your audio device.');
        }

        if (options.dryRun) {
            if (options.file) {
                this.logger.info('DRY RUN: Would process audio file: %s', options.file);
            } else {
                this.logger.info('DRY RUN: Would start audio recording');
            }
            this.logger.info('DRY RUN: Would transcribe audio and return transcript');
            return {
                transcript: '',
                cancelled: false
            };
        }

        if (options.file) {
            // Process existing audio file
            return await this.processAudioFile(options.file, options);
        } else {
            // Record new audio
            return await this.recordAndTranscribeAudio(options);
        }
    }

    /**
     * Process an existing audio file
     */
    private async processAudioFile(filePath: string, options: AudioProcessingOptions): Promise<AudioProcessingResult> {
        this.logger.info('🎯 Processing audio file: %s', filePath);

        // Validate the audio file
        await validateAudioFile(filePath);

        // Transcribe the audio
        this.logger.info('🎯 Transcribing audio...');
        this.logger.info('⏳ This may take a few seconds depending on audio length...');
        const transcription = await transcribeAudio(filePath);
        const audioContext = transcription.text;
        this.logger.info('✅ Audio transcribed successfully');
        this.logger.debug('Transcription: %s', audioContext);

        // Save transcript to output directory
        let transcriptFilePath: string | undefined;
        if (options.outputDirectory) {
            transcriptFilePath = await this.saveTranscript(audioContext, filePath, options.outputDirectory);
        }

        if (!audioContext.trim()) {
            this.logger.warn('No audio content was transcribed.');
            return {
                transcript: '',
                audioFilePath: filePath,
                transcriptFilePath,
                cancelled: false
            };
        }

        this.logger.info('📝 Audio transcribed successfully');
        return {
            transcript: audioContext,
            audioFilePath: filePath,
            transcriptFilePath,
            cancelled: false
        };
    }

    /**
     * Record and transcribe new audio
     */
    private async recordAndTranscribeAudio(options: AudioProcessingOptions): Promise<AudioProcessingResult> {
        const outputDirectory = options.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
        const storage = createStorage({ log: this.logger.info });
        await storage.ensureDirectory(outputDirectory);

        const tempDir = await fs.mkdtemp(path.join(outputDirectory, '.temp-audio-'));
        const audioFilePath = path.join(tempDir, 'recording.wav');

        // Recording state variables
        let recordingProcess: any = null;
        let recordingFinished = false;
        let recordingCancelled = false;
        let recordingFailed = false;
        let countdownInterval: NodeJS.Timeout | null = null;
        let remainingSeconds = 30;
        let intendedRecordingTime = 30;
        const maxRecordingTime = options.maxRecordingTime || 300; // 5 minutes default
        const extensionTime = 30; // 30 seconds per extension

        // Cleanup functions that need to be accessible in finally block
        let keyHandler: ((data: Buffer | string) => void) | null = null;
        const originalRawMode = false;
        const sigintHandler: (() => void) | null = null;

        const cleanupKeyboardHandling = () => {
            try {
                if (keyHandler) {
                    process.stdin.removeListener('data', keyHandler);
                    keyHandler = null;
                }
                if (process.stdin.setRawMode) {
                    process.stdin.setRawMode(originalRawMode);
                }
                process.stdin.pause();
            } catch (e) {
                // Ignore cleanup errors
            }
        };

        try {
            this.logger.info('🎤 Starting recording... Speak now!');
            this.logger.info('📋 Controls: ENTER=done, E=extend+30s, C/Ctrl+C=cancel');

            // List available audio devices in debug mode
            if (options.debug) {
                await listAudioDevices();
            }

            // Recording control functions
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
                    this.logger.info(`🔄 Extended recording by ${extensionTime}s (total: ${Math.floor(intendedRecordingTime / 60)}:${(intendedRecordingTime % 60).toString().padStart(2, '0')})`);
                    updateCountdownDisplay();
                } else {
                    const canExtend = maxRecordingTime - intendedRecordingTime;
                    if (canExtend > 0) {
                        intendedRecordingTime = maxRecordingTime;
                        remainingSeconds += canExtend;
                        this.logger.info(`🔄 Extended recording by ${canExtend}s (maximum reached: ${Math.floor(maxRecordingTime / 60)}:${(maxRecordingTime % 60).toString().padStart(2, '0')})`);
                        updateCountdownDisplay();
                    } else {
                        this.logger.warn(`⚠️  Cannot extend: maximum recording time (${Math.floor(maxRecordingTime / 60)}:${(maxRecordingTime % 60).toString().padStart(2, '0')}) reached`);
                    }
                }
            };

            const stopRecording = async () => {
                if (!recordingFinished && !recordingCancelled) {
                    recordingFinished = true;
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                    process.stdout.write('\r⏱️  Recording finished!                                  \n');
                    if (recordingProcess && recordingProcess.kill) {
                        recordingProcess.kill('SIGTERM');
                    }
                    this.logger.info('🛑 Recording stopped');
                }
            };

            const cancelRecording = async () => {
                if (!recordingFinished && !recordingCancelled) {
                    recordingCancelled = true;
                    if (countdownInterval) {
                        clearInterval(countdownInterval);
                        countdownInterval = null;
                    }
                    process.stdout.write('\r❌ Recording cancelled!                                 \n');
                    if (recordingProcess && recordingProcess.kill) {
                        recordingProcess.kill('SIGTERM');
                    }
                    this.logger.info('❌ Audio recording cancelled by user');
                }
            };

            // Set up keyboard input handling
            let keyHandler: ((data: Buffer | string) => void) | null = null;
            let originalRawMode = false;

            const setupKeyboardHandling = () => {
                // Ensure stdin is properly configured
                if (!process.stdin.readable) {
                    this.logger.warn('stdin is not readable, keyboard controls may not work');
                    return;
                }

                // Save original stdin state
                originalRawMode = process.stdin.isRaw || false;

                try {
                    process.stdin.setRawMode(true);
                    process.stdin.resume();
                    process.stdin.setEncoding('utf8');

                    keyHandler = (data: Buffer | string) => {
                        const key = data.toString();
                        const keyCode = key.charCodeAt(0);

                        if (options.debug) {
                            this.logger.debug('Key pressed: code=%d, char=%s', keyCode, JSON.stringify(key));
                        }

                        if (keyCode === 13 || keyCode === 10) { // ENTER key (CR or LF)
                            process.stdout.write('\r✅ ENTER pressed - stopping recording...                          \n');
                            stopRecording();
                        } else if (key.toLowerCase() === 'e') { // 'e' or 'E' key
                            extendRecording();
                        } else if (key.toLowerCase() === 'c' || keyCode === 3) { // 'c', 'C', or Ctrl+C
                            process.stdout.write('\r❌ Cancelling recording...                                       \n');
                            cancelRecording();
                        }
                    };

                    process.stdin.on('data', keyHandler);
                } catch (error: any) {
                    this.logger.warn('Failed to setup keyboard handling: %s', error.message);
                    this.logger.info('You may need to use Ctrl+C to stop recording');
                }
            };

            // Start countdown display
            const startCountdown = () => {
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
                        stopRecording();
                    }
                }, 1000);
            };

            // Set up recording command
            recordingProcess = await this.setupRecording(audioFilePath, maxRecordingTime, options);

            if (options.debug) {
                this.logger.debug('setupRecording returned: %s', recordingProcess ? 'process object' : 'null');
            }

            // Handle SIGINT for cleanup
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

                // Create a promise that waits for the recording process to finish
                const recordingProcessPromise = new Promise<void>((resolve, reject) => {
                    if (!recordingProcess) {
                        resolve();
                        return;
                    }

                    const processStartTime = Date.now();

                    recordingProcess.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
                        const processRunTime = Date.now() - processStartTime;

                        if (options.debug) {
                            this.logger.debug('Recording process exited with code %s, signal %s after %dms', code, signal, processRunTime);
                        }

                        // If the process exits very quickly with an error code, it likely failed to start recording
                        if (code !== 0 && processRunTime < 2000) { // Less than 2 seconds
                            this.logger.debug('Recording process failed early - runtime: %dms, exit code: %s', processRunTime, code);
                            recordingFailed = true;
                        }

                        resolve();
                    });

                    recordingProcess.on('error', (error: Error) => {
                        this.logger.error('Recording process error: %s', error.message);
                        recordingFailed = true;
                        reject(error);
                    });
                });

                // Wait for either the recording to finish naturally or manual stop
                try {
                    await Promise.race([recordingProcessPromise, manualStopPromise]);

                    if (recordingFinished && recordingProcess && !recordingProcess.killed) {
                        recordingProcess.kill('SIGTERM');
                        await new Promise(resolve => setTimeout(resolve, 200));
                        if (!recordingProcess.killed) {
                            recordingProcess.kill('SIGKILL');
                        }
                    }

                    if (!recordingCancelled && !recordingFinished) {
                        if (countdownInterval) {
                            clearInterval(countdownInterval);
                            countdownInterval = null;
                        }
                        process.stdout.write('\r⏱️  Recording completed!                               \n');
                        this.logger.info('✅ Recording completed automatically');
                    }
                } catch (error: any) {
                    if (!recordingCancelled && !recordingFinished) {
                        if (countdownInterval) {
                            clearInterval(countdownInterval);
                            countdownInterval = null;
                        }
                        if (error.signal === 'SIGTERM' || error.signal === 'SIGKILL') {
                            this.logger.debug('Recording process terminated as expected');
                        } else {
                            this.logger.warn('Recording process ended unexpectedly: %s', error.message);
                        }
                    }
                }

                // Clean up keyboard input and process listeners
                cleanupKeyboardHandling();
                if (sigintHandler) {
                    process.removeListener('SIGINT', sigintHandler);
                }
            }

            // If recording was cancelled, return early
            if (recordingCancelled) {
                return {
                    transcript: '',
                    cancelled: true
                };
            }

            // If recording failed (process exited with error too quickly), fail the command
            if (recordingFailed) {
                this.logger.error('❌ Audio recording failed to start or exited with an error');
                this.logger.info('This usually means the audio device is busy, not accessible, or ffmpeg configuration is incorrect');
                this.logger.info('💡 Try running "kodrdriv select-audio" to choose a different audio device');

                throw new Error('Audio recording failed - cannot proceed with audio-commit command');
            }

            // Wait for the recording file to be fully written
            if (recordingFinished) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            // Check if recording process failed early (before we try to verify the file)
            try {
                // Verify audio file was created
                await this.verifyAudioFile(audioFilePath);
            } catch (verifyError: any) {
                // If the file doesn't exist, the recording process likely failed
                this.logger.error('❌ Recording process failed - no audio file was created: %s', verifyError.message);
                this.logger.info('This can happen if the audio device is busy, not accessible, or if ffmpeg is not properly configured');
                this.logger.info('💡 Try running "kodrdriv select-audio" to choose a different audio device');

                throw new Error(`Audio recording failed - ${verifyError.message}`);
            }

            // Transcribe the audio
            const audioContext = await this.transcribeRecordedAudio(audioFilePath);

            // Save files to output directory
            const { audioOutputPath, transcriptOutputPath } = await this.saveRecordedFiles(
                audioFilePath, audioContext, outputDirectory
            );

            if (!audioContext.trim()) {
                this.logger.warn('No audio content was transcribed.');
                return {
                    transcript: '',
                    audioFilePath: audioOutputPath,
                    transcriptFilePath: transcriptOutputPath,
                    cancelled: false
                };
            }

            this.logger.info('📝 Audio recorded and transcribed successfully');
            return {
                transcript: audioContext,
                audioFilePath: audioOutputPath,
                transcriptFilePath: transcriptOutputPath,
                cancelled: false
            };

        } catch (error: any) {
            this.logger.error('Audio recording/transcription failed: %s', error.message);
            // Re-throw the error so the command fails properly
            throw error;
        } finally {
            // Cleanup is handled comprehensively in the cleanup function
            await this.cleanup(countdownInterval, recordingProcess, tempDir);
        }
    }

    /**
     * Set up recording command based on platform
     */
    private async setupRecording(audioFilePath: string, maxRecordingTime: number, options: AudioProcessingOptions): Promise<any> {
        let recordCommand: string;

        if (process.platform === 'darwin') {
            // macOS - try ffmpeg first
            try {
                await run('which ffmpeg');
                const homeDeviceConfig = options.preferencesDirectory ?
                    await loadAudioDeviceFromHomeConfig(options.preferencesDirectory) : null;
                const audioDevice = options.audioDevice || homeDeviceConfig?.audioDevice || await detectBestAudioDevice();
                recordCommand = `ffmpeg -f avfoundation -i ":${audioDevice}" -t ${maxRecordingTime} -y "${audioFilePath}"`;

                if (options.audioDevice) {
                    this.logger.info(`🎙️  Using audio device ${audioDevice} (from configuration)`);
                } else if (homeDeviceConfig) {
                    this.logger.info(`🎙️  Using audio device ${audioDevice} (${homeDeviceConfig.audioDeviceName})`);
                } else {
                    this.logger.info(`🎙️  Using audio device ${audioDevice} (auto-detected)`);
                }
            } catch {
                // Try sox/rec as fallback
                try {
                    await run('which rec');
                    recordCommand = `rec -r 44100 -c 1 -t wav "${audioFilePath}" trim 0 ${maxRecordingTime}`;
                } catch {
                    throw new Error('MANUAL_RECORDING_NEEDED');
                }
            }
        } else if (process.platform === 'win32') {
            // Windows - use ffmpeg
            try {
                await run('where ffmpeg');
                recordCommand = `ffmpeg -f dshow -i audio="Microphone" -t ${maxRecordingTime} -y "${audioFilePath}"`;
            } catch {
                throw new Error('MANUAL_RECORDING_NEEDED');
            }
        } else {
            // Linux - use arecord or ffmpeg
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

        try {
            // Use spawn instead of exec for better process control
            const { spawn } = await import('child_process');
            const args = recordCommand.split(' ');
            const command = args.shift()!;

            const recordingProcess = spawn(command, args, {
                stdio: ['ignore', 'ignore', 'pipe'], // Ignore stdin/stdout, capture stderr
                detached: false
            });

            // Handle process errors
            recordingProcess.on('error', (error) => {
                this.logger.error('Recording process error: %s', error.message);
            });

            recordingProcess.stderr?.on('data', (data) => {
                if (options.debug) {
                    this.logger.debug('Recording process: %s', data.toString().trim());
                }
            });

            return recordingProcess;
        } catch (error: any) {
            if (error.message === 'MANUAL_RECORDING_NEEDED') {
                this.showManualRecordingInstructions(audioFilePath);
                await this.waitForManualRecording();
                return null;
            } else {
                throw error;
            }
        }
    }

    /**
     * Show instructions for manual recording
     */
    private showManualRecordingInstructions(audioFilePath: string): void {
        this.logger.warn('⚠️  Automatic recording not available on this system.');
        this.logger.warn('📱 Please record audio manually using your system\'s built-in tools:');
        this.logger.warn('');

        if (process.platform === 'darwin') {
            this.logger.warn('🍎 macOS options:');
            this.logger.warn('   1. Use QuickTime Player: File → New Audio Recording');
            this.logger.warn('   2. Use Voice Memos app');
            this.logger.warn('   3. Install ffmpeg: brew install ffmpeg');
            this.logger.warn('   4. Install sox: brew install sox');
        } else if (process.platform === 'win32') {
            this.logger.warn('🪟 Windows options:');
            this.logger.warn('   1. Use Voice Recorder app');
            this.logger.warn('   2. Install ffmpeg: https://ffmpeg.org/download.html');
        } else {
            this.logger.warn('🐧 Linux options:');
            this.logger.warn('   1. Install alsa-utils: sudo apt install alsa-utils');
            this.logger.warn('   2. Install ffmpeg: sudo apt install ffmpeg');
        }

        this.logger.warn('');
        this.logger.warn(`💾 Save your recording as: ${audioFilePath}`);
        this.logger.warn('🎵 Recommended format: WAV, 44.1kHz, mono or stereo');
        this.logger.warn('');
        this.logger.warn('⌨️  Press ENTER when you have saved the audio file...');
    }

    /**
     * Wait for user to complete manual recording
     */
    private async waitForManualRecording(): Promise<void> {
        return new Promise(resolve => {
            process.stdin.setRawMode(true);
            process.stdin.resume();
            const enterHandler = (key: Buffer) => {
                if (key[0] === 13) { // Enter key
                    process.stdin.setRawMode(false);
                    process.stdin.pause();
                    process.stdin.removeListener('data', enterHandler);
                    resolve();
                }
            };
            process.stdin.on('data', enterHandler);
        });
    }

    /**
     * Verify that the audio file was created successfully
     */
    private async verifyAudioFile(audioFilePath: string): Promise<void> {
        try {
            await fs.access(audioFilePath);
            const stats = await fs.stat(audioFilePath);
            if (stats.size === 0) {
                throw new Error('Audio file is empty');
            }
            this.logger.info('✅ Audio file created successfully (%d bytes)', stats.size);
        } catch (error: any) {
            throw new Error(`Failed to create audio file: ${error.message}`);
        }
    }

    /**
     * Transcribe recorded audio
     */
    private async transcribeRecordedAudio(audioFilePath: string): Promise<string> {
        this.logger.info('🎯 Transcribing audio...');
        this.logger.info('⏳ This may take a few seconds depending on audio length...');
        const transcription = await transcribeAudio(audioFilePath);
        const audioContext = transcription.text;
        this.logger.info('✅ Audio transcribed successfully');
        this.logger.debug('Transcription: %s', audioContext);
        return audioContext;
    }

    /**
     * Save transcript file
     */
    private async saveTranscript(audioContext: string, sourceFilePath: string, outputDirectory: string): Promise<string | undefined> {
        if (!audioContext.trim()) return undefined;

        try {
            this.logger.info('💾 Saving transcript...');
            const storage = createStorage({ log: this.logger.info });
            await storage.ensureDirectory(outputDirectory);

            const transcriptOutputFilename = getTimestampedTranscriptFilename();
            const transcriptOutputPath = getOutputPath(outputDirectory, transcriptOutputFilename);
            const transcriptContent = `# Audio Transcript\n\n**Source:** ${sourceFilePath}\n**Processed:** ${new Date().toISOString()}\n\n**Transcript:**\n\n${audioContext}`;
            await storage.writeFile(transcriptOutputPath, transcriptContent, 'utf-8');
            this.logger.debug('Saved transcript: %s', transcriptOutputPath);
            return transcriptOutputPath;
        } catch (error: any) {
            this.logger.warn('Failed to save transcript file: %s', error.message);
            return undefined;
        }
    }

    /**
     * Save recorded audio file and transcript
     */
    private async saveRecordedFiles(audioFilePath: string, audioContext: string, outputDirectory: string): Promise<{ audioOutputPath?: string; transcriptOutputPath?: string }> {
        try {
            this.logger.info('💾 Saving audio file and transcript...');
            const storage = createStorage({ log: this.logger.info });
            await storage.ensureDirectory(outputDirectory);

            // Save audio file copy
            const audioOutputFilename = getTimestampedAudioFilename();
            const audioOutputPath = getOutputPath(outputDirectory, audioOutputFilename);
            await fs.copyFile(audioFilePath, audioOutputPath);
            this.logger.debug('Saved audio file: %s', audioOutputPath);

            // Save transcript
            let transcriptOutputPath: string | undefined;
            if (audioContext.trim()) {
                const transcriptOutputFilename = getTimestampedTranscriptFilename();
                transcriptOutputPath = getOutputPath(outputDirectory, transcriptOutputFilename);
                const transcriptContent = `# Audio Transcript\n\n**Recorded:** ${new Date().toISOString()}\n\n**Transcript:**\n\n${audioContext}`;
                await storage.writeFile(transcriptOutputPath, transcriptContent, 'utf-8');
                this.logger.debug('Saved transcript: %s', transcriptOutputPath);
            }

            return { audioOutputPath, transcriptOutputPath };
        } catch (error: any) {
            this.logger.warn('Failed to save audio/transcript files: %s', error.message);
            return {};
        }
    }

    /**
     * Clean up resources
     */
    private async cleanup(countdownInterval: NodeJS.Timeout | null, recordingProcess: any, tempDir: string): Promise<void> {
        try {
            // Clear countdown interval
            if (countdownInterval) {
                clearInterval(countdownInterval);
            }

            // Reset stdin thoroughly - this is critical for preventing hanging
            try {
                if (process.stdin.setRawMode) {
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();
                process.stdin.removeAllListeners('data');
                process.stdin.removeAllListeners('keypress');
                process.stdin.removeAllListeners('readable');
                process.stdin.removeAllListeners('end');
                process.stdin.removeAllListeners('close');
                // Force stdin to unpipe if it was piped
                if (process.stdin.unpipe) {
                    process.stdin.unpipe();
                }
            } catch (stdinError) {
                // Ignore stdin cleanup errors
            }

            // Remove ALL process event listeners to prevent hanging
            process.removeAllListeners('SIGINT');
            process.removeAllListeners('SIGTERM');
            process.removeAllListeners('SIGQUIT');
            process.removeAllListeners('SIGHUP');
            process.removeAllListeners('exit');
            process.removeAllListeners('beforeExit');

            // Kill recording process aggressively
            if (recordingProcess && !recordingProcess.killed) {
                try {
                    recordingProcess.kill('SIGTERM');
                    // Give it a very short time to terminate gracefully
                    await new Promise(resolve => setTimeout(resolve, 50));
                    if (!recordingProcess.killed) {
                        recordingProcess.kill('SIGKILL');
                    }
                    // Remove all listeners from the recording process
                    recordingProcess.removeAllListeners();
                } catch (killError) {
                    // Ignore kill errors
                }
            }

            // Clean up temporary directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (fsError) {
                // Ignore filesystem cleanup errors
            }
        } catch (cleanupError: any) {
            this.logger.debug('Cleanup warning: %s', cleanupError.message);
        }
    }
}

/**
 * Create a new audio processor instance
 */
export const createAudioProcessor = (): AudioProcessor => {
    return new AudioProcessor();
}; 