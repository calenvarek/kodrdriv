#!/usr/bin/env node
import path from 'path';
import fs from 'fs/promises';
import { Model, Request } from '@riotprompt/riotprompt';
import { ChatCompletionMessageParam } from 'openai/resources';
import { getLogger } from '../logging';
import { Config } from '../types';
import { transcribeAudio, createCompletion } from '../util/openai';
import * as Prompts from '../prompt/prompts';
import { run } from '../util/child';
import * as Log from '../content/log';
import * as Diff from '../content/diff';
import { DEFAULT_EXCLUDED_PATTERNS, DEFAULT_OUTPUT_DIRECTORY } from '../constants';
import { getOutputPath, getTimestampedRequestFilename, getTimestampedResponseFilename } from '../util/general';
import { create as createStorage } from '../util/storage';
import { getOpenIssues, createIssue } from '../util/github';

interface AudioIssue {
    title: string;
    description: string;
    priority: 'low' | 'medium' | 'high';
    category: 'ui' | 'content' | 'functionality' | 'accessibility' | 'performance' | 'other';
    suggestions?: string[];
}

interface AudioReviewResult {
    summary: string;
    totalIssues: number;
    issues: AudioIssue[];
}

// Enhanced exclusion patterns specifically for audio review context
// These focus on excluding large files, binaries, and content that doesn't help with issue analysis
const getAudioReviewExcludedPatterns = (basePatterns: string[]): string[] => {
    const audioReviewSpecificExclusions = [
        // Lock files and dependency files (often massive)
        "*lock*",
        "*.lock",
        "pnpm-lock.yaml",
        "package-lock.json",
        "yarn.lock",
        "bun.lockb",
        "composer.lock",
        "Cargo.lock",
        "Gemfile.lock",
        "Pipfile.lock",
        "poetry.lock",

        // Image files (binary and large)
        "*.png",
        "*.jpg",
        "*.jpeg",
        "*.gif",
        "*.bmp",
        "*.tiff",
        "*.webp",
        "*.svg",
        "*.ico",
        "*.icns",

        // Video and audio files
        "*.mp4",
        "*.avi",
        "*.mov",
        "*.wmv",
        "*.flv",
        "*.mp3",
        "*.wav",
        "*.flac",

        // Archives and compressed files
        "*.zip",
        "*.tar",
        "*.tar.gz",
        "*.tgz",
        "*.rar",
        "*.7z",
        "*.bz2",
        "*.xz",

        // Binary executables and libraries
        "*.exe",
        "*.dll",
        "*.so",
        "*.dylib",
        "*.bin",
        "*.app",

        // Database files
        "*.db",
        "*.sqlite",
        "*.sqlite3",
        "*.mdb",

        // Large generated files
        "*.map",
        "*.min.js",
        "*.min.css",
        "bundle.*",
        "vendor.*",

        // Documentation that's often large
        "*.pdf",
        "*.doc",
        "*.docx",
        "*.ppt",
        "*.pptx",

        // IDE and OS generated files
        ".DS_Store",
        "Thumbs.db",
        "*.swp",
        "*.tmp",

        // Certificate and key files
        "*.pem",
        "*.crt",
        "*.key",
        "*.p12",
        "*.pfx",

        // Large config/data files that are often auto-generated
        "tsconfig.tsbuildinfo",
        "*.cache",
        ".eslintcache",
    ];

    // Combine base patterns with audio review specific exclusions, removing duplicates
    const combinedPatterns = [...new Set([...basePatterns, ...audioReviewSpecificExclusions])];
    return combinedPatterns;
};

// Function to truncate overly large diff content while preserving structure
const truncateLargeDiff = (diffContent: string, maxLength: number = 5000): string => {
    if (diffContent.length <= maxLength) {
        return diffContent;
    }

    const lines = diffContent.split('\n');
    const truncatedLines: string[] = [];
    let currentLength = 0;
    let truncated = false;

    for (const line of lines) {
        if (currentLength + line.length + 1 > maxLength) {
            truncated = true;
            break;
        }
        truncatedLines.push(line);
        currentLength += line.length + 1; // +1 for newline
    }

    if (truncated) {
        truncatedLines.push('');
        truncatedLines.push(`... [TRUNCATED: Original diff was ${diffContent.length} characters, showing first ${currentLength}] ...`);
    }

    return truncatedLines.join('\n');
};

// Function to find and read recent release notes
const findRecentReleaseNotes = async (limit: number, outputDirectory?: string): Promise<string[]> => {
    const logger = getLogger();
    const releaseNotes: string[] = [];

    if (limit <= 0) {
        return releaseNotes;
    }

    try {
        // Common release notes file patterns
        const patterns = [
            'RELEASE_NOTES.md',
            'CHANGELOG.md',
            'CHANGES.md',
            'HISTORY.md',
            'RELEASES.md'
        ];

        // If outputDirectory is specified, check there first for RELEASE_NOTES.md
        if (outputDirectory) {
            try {
                const outputReleaseNotesPath = getOutputPath(outputDirectory, 'RELEASE_NOTES.md');
                const content = await fs.readFile(outputReleaseNotesPath, 'utf-8');
                if (content.trim()) {
                    const truncatedContent = truncateLargeDiff(content, 3000);
                    releaseNotes.push(`=== ${outputReleaseNotesPath} ===\n${truncatedContent}`);
                    logger.debug(`Found release notes in output directory: ${outputReleaseNotesPath} (%d characters)`, content.length);

                    if (releaseNotes.length >= limit) {
                        return releaseNotes.slice(0, limit);
                    }
                }
            } catch {
                // File doesn't exist in output directory, continue with other patterns
            }
        }

        for (const pattern of patterns) {
            try {
                const content = await fs.readFile(pattern, 'utf-8');
                if (content.trim()) {
                    // Truncate very large release notes files
                    const truncatedContent = truncateLargeDiff(content, 3000); // Smaller limit for release notes
                    releaseNotes.push(`=== ${pattern} ===\n${truncatedContent}`);

                    if (truncatedContent.length < content.length) {
                        logger.debug(`Found release notes in ${pattern} (%d characters, truncated from %d)`,
                            truncatedContent.length, content.length);
                    } else {
                        logger.debug(`Found release notes in ${pattern} (%d characters)`, content.length);
                    }

                    // For now, just take the first file found
                    // Could be enhanced to parse multiple releases from a single file
                    if (releaseNotes.length >= limit) {
                        break;
                    }
                }
            } catch {
                // File doesn't exist, continue to next pattern
                continue;
            }
        }

        if (releaseNotes.length === 0) {
            logger.debug('No release notes files found');
        }

    } catch (error: any) {
        logger.warn('Error searching for release notes: %s', error.message);
    }

    return releaseNotes.slice(0, limit);
};

export const execute = async (runConfig: Config): Promise<string> => {
    const logger = getLogger();
    const isDryRun = runConfig.dryRun || false;

    // Show configuration even in dry-run mode
    logger.debug('Audio review context configuration:');
    logger.debug('  Include commit history: %s', runConfig.audioReview?.includeCommitHistory);
    logger.debug('  Include recent diffs: %s', runConfig.audioReview?.includeRecentDiffs);
    logger.debug('  Include release notes: %s', runConfig.audioReview?.includeReleaseNotes);
    logger.debug('  Include GitHub issues: %s', runConfig.audioReview?.includeGithubIssues);
    logger.debug('  Commit history limit: %d', runConfig.audioReview?.commitHistoryLimit);
    logger.debug('  Diff history limit: %d', runConfig.audioReview?.diffHistoryLimit);
    logger.debug('  Release notes limit: %d', runConfig.audioReview?.releaseNotesLimit);
    logger.debug('  GitHub issues limit: %d', runConfig.audioReview?.githubIssuesLimit);
    logger.debug('  Sendit mode (auto-create issues): %s', runConfig.audioReview?.sendit);

    if (isDryRun) {
        logger.info('DRY RUN: Would start audio recording for review analysis');
        logger.info('DRY RUN: Would gather additional context based on configuration above');
        logger.info('DRY RUN: Would analyze transcription and identify issues');

        if (runConfig.audioReview?.sendit) {
            logger.info('DRY RUN: Would automatically create GitHub issues (sendit mode enabled)');
        } else {
            logger.info('DRY RUN: Would prompt for confirmation before creating GitHub issues');
        }

        // Show what exclusion patterns would be used in dry-run mode
        if (runConfig.audioReview?.includeRecentDiffs) {
            const basePatterns = runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS;
            const audioReviewExcluded = getAudioReviewExcludedPatterns(basePatterns);
            logger.info('DRY RUN: Would use %d exclusion patterns for diff context', audioReviewExcluded.length);
            logger.debug('DRY RUN: Sample exclusions: %s', audioReviewExcluded.slice(0, 15).join(', ') +
                (audioReviewExcluded.length > 15 ? '...' : ''));
        }

        return 'DRY RUN: Audio review command would record, transcribe, analyze audio, and create GitHub issues';
    }

    // Gather additional context based on configuration
    let additionalContext = '';

    // Fetch commit history if enabled
    if (runConfig.audioReview?.includeCommitHistory) {
        try {
            logger.debug('Fetching recent commit history...');
            const log = await Log.create({
                limit: runConfig.audioReview.commitHistoryLimit
            });
            const logContent = await log.get();
            if (logContent.trim()) {
                additionalContext += `\n\n[Recent Commit History]\n${logContent}`;
                logger.debug('Added commit history to context (%d characters)', logContent.length);
            }
        } catch (error: any) {
            logger.warn('Failed to fetch commit history: %s', error.message);
        }
    }

    // Fetch recent diffs if enabled
    if (runConfig.audioReview?.includeRecentDiffs) {
        try {
            logger.debug('Fetching recent commit diffs...');
            const diffLimit = runConfig.audioReview.diffHistoryLimit || 5;

            // Get enhanced exclusion patterns for audio review context
            const basePatterns = runConfig.excludedPatterns ?? DEFAULT_EXCLUDED_PATTERNS;
            const audioReviewExcluded = getAudioReviewExcludedPatterns(basePatterns);
            logger.debug('Using %d exclusion patterns for diff context (including %d audio-review specific)',
                audioReviewExcluded.length, audioReviewExcluded.length - basePatterns.length);
            logger.debug('Sample exclusions: %s', audioReviewExcluded.slice(0, 10).join(', ') +
                (audioReviewExcluded.length > 10 ? '...' : ''));

            // Get recent commits and their diffs
            for (let i = 0; i < diffLimit; i++) {
                try {
                    const diffRange = i === 0 ? 'HEAD~1' : `HEAD~${i + 1}..HEAD~${i}`;
                    const diff = await Diff.create({
                        from: `HEAD~${i + 1}`,
                        to: `HEAD~${i}`,
                        excludedPatterns: audioReviewExcluded
                    });
                    const diffContent = await diff.get();
                    if (diffContent.trim()) {
                        const truncatedDiff = truncateLargeDiff(diffContent);
                        additionalContext += `\n\n[Recent Diff ${i + 1} (${diffRange})]\n${truncatedDiff}`;

                        if (truncatedDiff.length < diffContent.length) {
                            logger.debug('Added diff %d to context (%d characters, truncated from %d)',
                                i + 1, truncatedDiff.length, diffContent.length);
                        } else {
                            logger.debug('Added diff %d to context (%d characters)', i + 1, diffContent.length);
                        }
                    } else {
                        logger.debug('Diff %d was empty after exclusions', i + 1);
                    }
                } catch (error: any) {
                    logger.debug('Could not fetch diff %d: %s', i + 1, error.message);
                    break; // Stop if we can't fetch more diffs
                }
            }
        } catch (error: any) {
            logger.warn('Failed to fetch recent diffs: %s', error.message);
        }
    }

    // Fetch release notes if enabled
    if (runConfig.audioReview?.includeReleaseNotes) {
        try {
            logger.debug('Fetching recent release notes...');
            const outputDirectory = runConfig.outputDirectory || DEFAULT_OUTPUT_DIRECTORY;
            const releaseNotes = await findRecentReleaseNotes(runConfig.audioReview.releaseNotesLimit || 3, outputDirectory);
            if (releaseNotes.length > 0) {
                additionalContext += `\n\n[Recent Release Notes]\n${releaseNotes.join('\n\n')}`;
                logger.debug('Added %d release notes files to context', releaseNotes.length);
            }
        } catch (error: any) {
            logger.warn('Failed to fetch release notes: %s', error.message);
        }
    }

    // Fetch GitHub issues if enabled
    if (runConfig.audioReview?.includeGithubIssues) {
        try {
            logger.debug('Fetching open GitHub issues...');
            const issuesLimit = Math.min(runConfig.audioReview.githubIssuesLimit || 20, 20); // Cap at 20
            const githubIssues = await getOpenIssues(issuesLimit);
            if (githubIssues.trim()) {
                additionalContext += `\n\n[Open GitHub Issues]\n${githubIssues}`;
                logger.debug('Added GitHub issues to context (%d characters)', githubIssues.length);
            } else {
                logger.debug('No open GitHub issues found');
            }
        } catch (error: any) {
            logger.warn('Failed to fetch GitHub issues: %s', error.message);
        }
    }

    if (additionalContext) {
        logger.debug('Total additional context gathered: %d characters', additionalContext.length);
    } else {
        logger.debug('No additional context gathered');
    }

    logger.info('Starting audio review session...');
    logger.info('This command will use your system\'s default audio recording tool');
    logger.info('Press Ctrl+C after you finish speaking to analyze the audio');

    // Create temporary file for audio recording
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
        process.on('SIGTERM', stopRecording);

        // Wait for recording to complete (either by timeout or user interruption)
        if (recordingProcess) {
            try {
                await recordingProcess;
            } catch (error: any) {
                // Check if this is just a normal interruption (expected behavior)
                if (error.message.includes('signal 15') || error.message.includes('SIGTERM') ||
                    error.message.includes('Exiting normally')) {
                    // This is expected when we interrupt ffmpeg - not an actual error
                    logger.debug('Recording interrupted as expected: %s', error.message);
                } else {
                    // This might be a real error, but let's check if we got an audio file anyway
                    logger.warn('Recording process exited with error, but checking for audio file: %s', error.message);
                }
            }
        }

        // Check if audio file exists
        try {
            await fs.access(audioFilePath);
        } catch {
            throw new Error('No audio file was created. Please ensure your system has audio recording capabilities.');
        }

        const stats = await fs.stat(audioFilePath);
        if (stats.size === 0) {
            throw new Error('Audio file is empty. Please check your microphone permissions and try again.');
        }

        logger.info('💾 Audio recorded successfully');

        // Transcribe audio using Whisper
        logger.info('🔤 Transcribing audio with Whisper...');
        const transcription = await transcribeAudio(audioFilePath, {
            model: 'whisper-1',
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('audio-transcription')),
            debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('audio-transcription')),
        });

        logger.info('📝 Transcription completed');
        logger.debug('Transcription: %s', transcription.text);

        // Analyze transcription for issues using OpenAI
        logger.info('🤖 Analyzing transcription for project issues...');
        const prompts = Prompts.create(runConfig.model as Model, runConfig);

        // Combine additional context with user-provided context
        let finalContext = additionalContext;
        if (runConfig.audioReview?.context) {
            finalContext = runConfig.audioReview.context + finalContext;
        }

        const analysisPrompt = await prompts.createAudioReviewPrompt(transcription.text, finalContext || undefined);
        const request: Request = prompts.format(analysisPrompt);

        const analysisResult = await createCompletion(request.messages as ChatCompletionMessageParam[], {
            model: runConfig.model,
            responseFormat: { type: 'json_object' },
            debug: runConfig.debug,
            debugRequestFile: getOutputPath(outputDirectory, getTimestampedRequestFilename('audio-analysis')),
            debugResponseFile: getOutputPath(outputDirectory, getTimestampedResponseFilename('audio-analysis')),
        }) as AudioReviewResult;

        logger.info('✅ Analysis completed');

        // Handle GitHub issue creation if there are issues to create
        if (analysisResult.issues && analysisResult.issues.length > 0) {
            const senditMode = runConfig.audioReview?.sendit || false;
            const createdIssues: Array<{ issue: AudioIssue, githubUrl: string, number: number }> = [];

            logger.info(`🔍 Found ${analysisResult.issues.length} issues to potentially create as GitHub issues`);

            for (let i = 0; i < analysisResult.issues.length; i++) {
                const issue = analysisResult.issues[i];
                let shouldCreateIssue = senditMode;

                if (!senditMode) {
                    // Interactive confirmation for each issue
                    logger.info(`\n📋 Issue ${i + 1} of ${analysisResult.issues.length}:`);
                    logger.info(`   Title: ${issue.title}`);
                    logger.info(`   Priority: ${issue.priority} | Category: ${issue.category}`);
                    logger.info(`   Description: ${issue.description}`);
                    if (issue.suggestions && issue.suggestions.length > 0) {
                        logger.info(`   Suggestions: ${issue.suggestions.join(', ')}`);
                    }

                    // Get user choice
                    const choice = await getUserChoice('\nWhat would you like to do with this issue?', [
                        { key: 'c', label: 'Create GitHub issue' },
                        { key: 's', label: 'Skip this issue' },
                        { key: 'e', label: 'Edit issue details' }
                    ]);

                    if (choice === 'c') {
                        shouldCreateIssue = true;
                    } else if (choice === 'e') {
                        // Allow user to edit the issue
                        const editedIssue = await editIssueInteractively(issue);
                        analysisResult.issues[i] = editedIssue;
                        shouldCreateIssue = true;
                    }
                    // If choice is 's', shouldCreateIssue remains false
                }

                if (shouldCreateIssue) {
                    try {
                        logger.info(`🚀 Creating GitHub issue: "${issue.title}"`);

                        // Format issue body with additional details
                        const issueBody = formatIssueBody(issue);

                        // Create labels based on priority and category
                        const labels = [
                            `priority-${issue.priority}`,
                            `category-${issue.category}`,
                            'audio-review'
                        ];

                        const createdIssue = await createIssue(issue.title, issueBody, labels);
                        createdIssues.push({
                            issue,
                            githubUrl: createdIssue.html_url,
                            number: createdIssue.number
                        });

                        logger.info(`✅ Created GitHub issue #${createdIssue.number}: ${createdIssue.html_url}`);
                    } catch (error: any) {
                        logger.error(`❌ Failed to create GitHub issue for "${issue.title}": ${error.message}`);
                    }
                }
            }

            // Update the result summary to include created issues
            if (createdIssues.length > 0) {
                return formatAudioReviewResultsWithIssues(analysisResult, createdIssues);
            }
        }

        // Format and return results (original behavior if no issues created)
        return formatAudioReviewResults(analysisResult);

    } catch (error: any) {
        logger.error('Error during audio review: %s', error.message);
        throw error;
    } finally {
        // Cleanup temporary files
        try {
            await fs.rm(tempDir, { recursive: true });
        } catch (cleanupError) {
            logger.warn('Failed to cleanup temporary directory: %s', cleanupError);
        }
    }
};

// Helper function to get user choice interactively
async function getUserChoice(prompt: string, choices: Array<{ key: string, label: string }>): Promise<string> {
    const logger = getLogger();

    logger.info(prompt);
    choices.forEach(choice => {
        logger.info(`   [${choice.key}] ${choice.label}`);
    });
    logger.info('');

    return new Promise(resolve => {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', (key) => {
            const keyStr = key.toString().toLowerCase();
            const choice = choices.find(c => c.key === keyStr);
            if (choice) {
                process.stdin.setRawMode(false);
                process.stdin.pause();
                logger.info(`Selected: ${choice.label}\n`);
                resolve(choice.key);
            }
        });
    });
}

// Helper function to edit issue interactively
async function editIssueInteractively(issue: AudioIssue): Promise<AudioIssue> {
    const logger = getLogger();
    const readline = await import('readline');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const question = (prompt: string): Promise<string> => {
        return new Promise(resolve => {
            rl.question(prompt, resolve);
        });
    };

    try {
        logger.info('📝 Edit issue details (press Enter to keep current value):');

        const newTitle = await question(`Title [${issue.title}]: `);
        const newDescription = await question(`Description [${issue.description}]: `);
        const newPriority = await question(`Priority (low/medium/high) [${issue.priority}]: `);
        const newCategory = await question(`Category (ui/content/functionality/accessibility/performance/other) [${issue.category}]: `);

        const updatedIssue: AudioIssue = {
            title: newTitle.trim() || issue.title,
            description: newDescription.trim() || issue.description,
            priority: (newPriority.trim() as any) || issue.priority,
            category: (newCategory.trim() as any) || issue.category,
            suggestions: issue.suggestions
        };

        logger.info('✅ Issue updated successfully');
        return updatedIssue;
    } finally {
        rl.close();
    }
}

// Helper function to format issue body for GitHub
function formatIssueBody(issue: AudioIssue): string {
    let body = `## Description\n\n${issue.description}\n\n`;

    body += `## Details\n\n`;
    body += `- **Priority:** ${issue.priority}\n`;
    body += `- **Category:** ${issue.category}\n`;
    body += `- **Source:** Audio Review\n\n`;

    if (issue.suggestions && issue.suggestions.length > 0) {
        body += `## Suggestions\n\n`;
        issue.suggestions.forEach(suggestion => {
            body += `- ${suggestion}\n`;
        });
        body += '\n';
    }

    body += `---\n\n`;
    body += `*This issue was automatically created from an audio review session.*`;

    return body;
}

// Helper function to format results with created GitHub issues
function formatAudioReviewResultsWithIssues(
    result: AudioReviewResult,
    createdIssues: Array<{ issue: AudioIssue, githubUrl: string, number: number }>
): string {
    let output = `🎤 Audio Review Results\n\n`;
    output += `📋 Summary: ${result.summary}\n`;
    output += `📊 Total Issues Found: ${result.totalIssues}\n`;
    output += `🚀 GitHub Issues Created: ${createdIssues.length}\n\n`;

    if (result.issues && result.issues.length > 0) {
        output += `📝 Issues Identified:\n\n`;

        result.issues.forEach((issue, index) => {
            const priorityEmoji = issue.priority === 'high' ? '🔴' :
                issue.priority === 'medium' ? '🟡' : '🟢';
            const categoryEmoji = issue.category === 'ui' ? '🎨' :
                issue.category === 'content' ? '📝' :
                    issue.category === 'functionality' ? '⚙️' :
                        issue.category === 'accessibility' ? '♿' :
                            issue.category === 'performance' ? '⚡' : '🔧';

            output += `${index + 1}. ${priorityEmoji} ${issue.title}\n`;
            output += `   ${categoryEmoji} Category: ${issue.category} | Priority: ${issue.priority}\n`;
            output += `   📖 Description: ${issue.description}\n`;

            // Check if this issue was created as a GitHub issue
            const createdIssue = createdIssues.find(ci => ci.issue === issue);
            if (createdIssue) {
                output += `   🔗 GitHub Issue: #${createdIssue.number} - ${createdIssue.githubUrl}\n`;
            }

            if (issue.suggestions && issue.suggestions.length > 0) {
                output += `   💡 Suggestions:\n`;
                issue.suggestions.forEach(suggestion => {
                    output += `      • ${suggestion}\n`;
                });
            }
            output += `\n`;
        });
    } else {
        output += `✅ No specific issues identified from the audio review.\n\n`;
    }

    if (createdIssues.length > 0) {
        output += `\n🎯 Created GitHub Issues:\n`;
        createdIssues.forEach(createdIssue => {
            output += `• #${createdIssue.number}: ${createdIssue.issue.title} - ${createdIssue.githubUrl}\n`;
        });
        output += `\n`;
    }

    output += `🚀 Next Steps: Review the created GitHub issues and prioritize them in your development workflow.`;

    return output;
}

function formatAudioReviewResults(result: AudioReviewResult): string {
    let output = `🎤 Audio Review Results\n\n`;
    output += `📋 Summary: ${result.summary}\n`;
    output += `📊 Total Issues Found: ${result.totalIssues}\n\n`;

    if (result.issues && result.issues.length > 0) {
        output += `📝 Issues Identified:\n\n`;

        result.issues.forEach((issue, index) => {
            const priorityEmoji = issue.priority === 'high' ? '🔴' :
                issue.priority === 'medium' ? '🟡' : '🟢';
            const categoryEmoji = issue.category === 'ui' ? '🎨' :
                issue.category === 'content' ? '📝' :
                    issue.category === 'functionality' ? '⚙️' :
                        issue.category === 'accessibility' ? '♿' :
                            issue.category === 'performance' ? '⚡' : '🔧';

            output += `${index + 1}. ${priorityEmoji} ${issue.title}\n`;
            output += `   ${categoryEmoji} Category: ${issue.category} | Priority: ${issue.priority}\n`;
            output += `   📖 Description: ${issue.description}\n`;

            if (issue.suggestions && issue.suggestions.length > 0) {
                output += `   💡 Suggestions:\n`;
                issue.suggestions.forEach(suggestion => {
                    output += `      • ${suggestion}\n`;
                });
            }
            output += `\n`;
        });
    } else {
        output += `✅ No specific issues identified from the audio review.\n\n`;
    }

    output += `🚀 Next Steps: Review the identified issues and prioritize them for your development workflow.`;

    return output;
} 