#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { Formatter, Model, Request } from '@riotprompt/riotprompt';
import { ChatCompletionMessageParam } from 'openai/resources';
import shellescape from 'shell-escape';
import { getLogger } from '../logging';
import { Config } from '../types';
import { transcribeAudio, createCompletion } from '../util/openai';
import * as Prompts from '../prompt/prompts';
import { run } from '../util/child';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename, stringifyJSON } from '../util/general';
import { create as createStorage } from '../util/storage';

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const prompts = Prompts.create(runConfig.model as Model, runConfig);
    const isDryRun = runConfig.dryRun || false;

    if (isDryRun) {
        logger.info('DRY RUN: Would start audio recording for commit context');
        logger.info('DRY RUN: Would transcribe audio and use as context for commit message generation');

        if (runConfig.commit?.add) {
            logger.info('DRY RUN: Would add all changes to the index with: git add -A');
        }

        if (runConfig.commit?.sendit) {
            logger.info('DRY RUN: Would automatically commit with generated message');
        }

        return 'DRY RUN: Audio-commit command would record audio, transcribe it, and generate commit message using the transcription as context';
    }

    // Handle add option first
    if (runConfig.commit?.add) {
        logger.verbose('Adding all changes to the index...');
        await run('git add -A');
    }

    // Start audio recording
    logger.info('Starting audio recording for commit context...');
    logger.info('This command will use your system\'s default audio recording tool');
    logger.info('Press Ctrl+C after you finish speaking to generate your commit message');

    // Create temporary file for audio recording
    const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
    const storage = createStorage({ log: logger.info });
    await storage.ensureDirectory(outputDirectory);

    const tempDir = await fs.mkdtemp(path.join(outputDirectory, '.temp-audio-'));
    const audioFilePath = path.join(tempDir, 'recording.wav');

    let audioContext = '';

    try {
        // Use system recording tool - cross-platform approach
        logger.info('🎤 Starting recording... Speak now!');
        logger.info('Recording will stop automatically after 30 seconds or when you press Ctrl+C');

        let recordingProcess: any;
        let recordingFinished = false;

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
                if (recordingProcess && recordingProcess.kill) {
                    recordingProcess.kill();
                }
                logger.info('🛑 Recording stopped');
            }
        };

        // Listen for Ctrl+C
        process.on('SIGINT', stopRecording);

        // Wait for recording to finish (either timeout or manual stop)
        if (recordingProcess) {
            try {
                await recordingProcess;
                logger.info('✅ Recording completed automatically');
            } catch (error: any) {
                if (!recordingFinished && error.signal === 'SIGTERM') {
                    logger.info('✅ Recording stopped by user');
                } else if (!recordingFinished) {
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
        audioContext = transcription.text;
        logger.info('✅ Audio transcribed successfully');
        logger.debug('Transcription: %s', audioContext);

        if (!audioContext.trim()) {
            logger.warn('No audio content was transcribed. Proceeding without audio context.');
        } else {
            logger.info('📝 Using transcribed audio as commit context');
        }

    } catch (error: any) {
        logger.error('Audio recording/transcription failed: %s', error.message);
        logger.info('Proceeding with commit generation without audio context...');
        audioContext = '';
    } finally {
        // Clean up temporary directory
        try {
            await fs.rm(tempDir, { recursive: true, force: true });
        } catch (error: any) {
            logger.debug('Failed to clean up temporary directory: %s', error.message);
        }
    }

    // Now proceed with commit logic using the transcribed audio as context
    let cached = runConfig.commit?.cached;
    // If `add` is used, we should always look at staged changes.
    if (runConfig.commit?.add) {
        cached = true;
    } else if (cached === undefined) {
        // If cached is undefined? We're going to look for a staged commit; otherwise, we'll use the supplied setting.
        cached = await Diff.hasStagedChanges();
    }

    // Fix: Exit early if sendit is true but no changes are staged
    if (runConfig.commit?.sendit && !cached) {
        logger.warn('SendIt mode enabled, but no changes to commit.');
        process.exit(1);
    }

    const options = { cached, excludedPatterns: runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS };
    const diff = await Diff.create(options);
    const diffContent = await diff.get();

    const logOptions = {
        limit: runConfig.commit?.messageLimit,
    };
    const log = await Log.create(logOptions);
    const logContent = await log.get();

    // Use the transcribed audio as context, fallback to any configured context
    const commitContext = audioContext.trim() || runConfig.commit?.context || '';

    const prompt = await prompts.createCommitPrompt(diffContent, logContent, commitContext);

    if (runConfig.debug) {
        const formattedPrompt = Formatter.create({ logger }).formatPrompt("gpt-4o-mini", prompt);
        logger.silly('Formatted Prompt: %s', stringifyJSON(formattedPrompt));
    }

    const request: Request = prompts.format(prompt);

    if (runConfig.debug) {
        const storage = createStorage({ log: logger.info });
        await storage.ensureDirectory(outputDirectory);
    }

    const summary = await createCompletion(request.messages as ChatCompletionMessageParam[], {
        model: runConfig.model,
        debug: runConfig.debug,
        debugRequestFile: runConfig.debug ? getOutputPath(outputDirectory, getTimestampedRequestFilename('audio-commit')) : undefined,
        debugResponseFile: runConfig.debug ? getOutputPath(outputDirectory, getTimestampedResponseFilename('audio-commit')) : undefined,
    });

    if (runConfig.commit?.sendit) {
        if (!cached) {
            logger.error('SendIt mode enabled, but no changes to commit. Message: \n\n%s\n\n', summary);
            process.exit(1);
        }

        logger.info('SendIt mode enabled. Committing with message: \n\n%s\n\n', summary);
        try {
            const escapedSummary = shellescape([summary]);
            await run(`git commit -m ${escapedSummary}`);
            logger.info('Commit successful!');
        } catch (error) {
            logger.error('Failed to commit:', error);
            process.exit(1);
        }
    }

    return summary;
} 