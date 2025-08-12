#!/usr/bin/env node
import { getDryRunLogger } from '../logging';
import { spawnSync } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs/promises';

export interface Choice {
    key: string;
    label: string;
}

export interface InteractiveOptions {
    /** Additional error message suggestions for non-TTY scenarios */
    nonTtyErrorSuggestions?: string[];
}

/**
 * Get user choice interactively from terminal input
 * @param prompt The prompt message to display
 * @param choices Array of available choices
 * @param options Additional options for customizing behavior
 * @returns Promise resolving to the selected choice key
 */
export async function getUserChoice(
    prompt: string,
    choices: Choice[],
    options: InteractiveOptions = {}
): Promise<string> {
    const logger = getDryRunLogger(false);

    logger.info(prompt);
    choices.forEach(choice => {
        logger.info(`   [${choice.key}] ${choice.label}`);
    });
    logger.info('');

    // Check if stdin is a TTY (terminal) or piped
    if (!process.stdin.isTTY) {
        logger.error('⚠️  STDIN is piped but interactive mode is enabled');
        logger.error('   Interactive prompts cannot be used when input is piped');
        logger.error('   Solutions:');
        logger.error('   • Use terminal input instead of piping');

        // Add any additional suggestions
        if (options.nonTtyErrorSuggestions) {
            options.nonTtyErrorSuggestions.forEach(suggestion => {
                logger.error(`   • ${suggestion}`);
            });
        }

        return 's'; // Default to skip
    }

    return new Promise((resolve, reject) => {
        let isResolved = false;
        let dataHandler: ((key: Buffer) => void) | null = null;
        let errorHandler: ((error: Error) => void) | null = null;

        const cleanup = () => {
            if (dataHandler) {
                process.stdin.removeListener('data', dataHandler);
            }
            if (errorHandler) {
                process.stdin.removeListener('error', errorHandler);
            }

            try {
                if (process.stdin.setRawMode) {
                    process.stdin.setRawMode(false);
                }
                process.stdin.pause();
                // Detach stdin again now that we're done
                if (typeof process.stdin.unref === 'function') {
                    process.stdin.unref();
                }
            } catch {
                // Ignore cleanup errors
            }
        };

        const safeResolve = (value: string) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(value);
            }
        };

        const safeReject = (error: Error) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(error);
            }
        };

        try {
            // Ensure stdin is referenced so the process doesn't exit while waiting for input
            if (typeof process.stdin.ref === 'function') {
                process.stdin.ref();
            }

            process.stdin.setRawMode(true);
            process.stdin.resume();

            dataHandler = (key: Buffer) => {
                try {
                    const keyStr = key.toString().toLowerCase();
                    const choice = choices.find(c => c.key === keyStr);
                    if (choice) {
                        logger.info(`Selected: ${choice.label}\n`);
                        safeResolve(choice.key);
                    }
                } catch (error) {
                    safeReject(error instanceof Error ? error : new Error('Unknown error processing input'));
                }
            };

            errorHandler = (error: Error) => {
                safeReject(error);
            };

            process.stdin.on('data', dataHandler);
            process.stdin.on('error', errorHandler);

        } catch (error) {
            safeReject(error instanceof Error ? error : new Error('Failed to setup input handlers'));
        }
    });
}

/**
 * Secure temporary file handle that prevents TOCTOU vulnerabilities
 */
export class SecureTempFile {
    private fd: fs.FileHandle | null = null;
    private filePath: string;
    private isCleanedUp = false;

    private constructor(filePath: string, fd: fs.FileHandle) {
        this.filePath = filePath;
        this.fd = fd;
    }

    /**
     * Create a secure temporary file with proper permissions and atomic operations
     * @param prefix Prefix for the temporary filename
     * @param extension File extension (e.g., '.txt', '.md')
     * @returns Promise resolving to SecureTempFile instance
     */
    static async create(prefix: string = 'kodrdriv', extension: string = '.txt'): Promise<SecureTempFile> {
        const tmpDir = os.tmpdir();

        // Ensure temp directory exists and is writable (skip check in test environments)
        if (!process.env.VITEST) {
            try {
                await fs.access(tmpDir, fs.constants.W_OK);
            } catch (error: any) {
                // Try to create the directory if it doesn't exist
                try {
                    await fs.mkdir(tmpDir, { recursive: true, mode: 0o700 });
                } catch (mkdirError: any) {
                    throw new Error(`Temp directory not writable: ${tmpDir} - ${error.message}. Failed to create: ${mkdirError.message}`);
                }
            }
        }

        const tmpFilePath = path.join(tmpDir, `${prefix}_${Date.now()}_${Math.random().toString(36).substring(7)}${extension}`);

        // Create file with exclusive access and restrictive permissions (owner read/write only)
        // Using 'wx' flag ensures exclusive creation (fails if file exists)
        let fd: fs.FileHandle;
        try {
            fd = await fs.open(tmpFilePath, 'wx', 0o600);
        } catch (error: any) {
            if (error.code === 'EEXIST') {
                // Highly unlikely with timestamp + random suffix, but handle it
                throw new Error(`Temporary file already exists: ${tmpFilePath}`);
            }
            throw new Error(`Failed to create temporary file: ${error.message}`);
        }

        return new SecureTempFile(tmpFilePath, fd);
    }

    /**
     * Get the file path (use with caution in external commands)
     */
    get path(): string {
        if (this.isCleanedUp) {
            throw new Error('Temp file has been cleaned up');
        }
        return this.filePath;
    }

    /**
     * Write content to the temporary file
     */
    async writeContent(content: string): Promise<void> {
        if (!this.fd || this.isCleanedUp) {
            throw new Error('Temp file is not available for writing');
        }
        await this.fd.writeFile(content, 'utf8');
    }

    /**
     * Read content from the temporary file
     */
    async readContent(): Promise<string> {
        if (!this.fd || this.isCleanedUp) {
            throw new Error('Temp file is not available for reading');
        }
        const content = await this.fd.readFile('utf8');
        return content;
    }

    /**
     * Close the file handle
     */
    async close(): Promise<void> {
        if (this.fd && !this.isCleanedUp) {
            await this.fd.close();
            this.fd = null;
        }
    }

    /**
     * Securely cleanup the temporary file - prevents TOCTOU by using file descriptor
     */
    async cleanup(): Promise<void> {
        if (this.isCleanedUp) {
            return; // Already cleaned up
        }

        try {
            // Close file descriptor first if still open
            if (this.fd) {
                await this.fd.close();
                this.fd = null;
            }

            // Now safely remove the file
            // Use fs.unlink which is safer than checking existence first
            await fs.unlink(this.filePath);
        } catch (error: any) {
            // Only ignore ENOENT (file not found) errors
            if (error.code !== 'ENOENT') {
                const logger = getDryRunLogger(false);
                logger.warn(`Failed to cleanup temp file ${this.filePath}: ${error.message}`);
                // Don't throw here to avoid masking main operations
            }
        } finally {
            this.isCleanedUp = true;
        }
    }
}

/**
 * Create a secure temporary file for editing with proper permissions
 * @param prefix Prefix for the temporary filename
 * @param extension File extension (e.g., '.txt', '.md')
 * @returns Promise resolving to the temporary file path
 * @deprecated Use SecureTempFile.create() for better security
 */
export async function createSecureTempFile(prefix: string = 'kodrdriv', extension: string = '.txt'): Promise<string> {
    const secureTempFile = await SecureTempFile.create(prefix, extension);
    await secureTempFile.close();
    return secureTempFile.path;
}

/**
 * Clean up a temporary file
 * @param filePath Path to the temporary file to clean up
 * @deprecated Use SecureTempFile.cleanup() for better security
 */
export async function cleanupTempFile(filePath: string): Promise<void> {
    try {
        await fs.unlink(filePath);
    } catch (error: any) {
        // Only ignore ENOENT (file not found) errors
        if (error.code !== 'ENOENT') {
            const logger = getDryRunLogger(false);
            logger.warn(`Failed to cleanup temp file ${filePath}: ${error.message}`);
        }
    }
}

export interface EditorResult {
    content: string;
    wasEdited: boolean;
}

/**
 * Open content in user's editor for editing
 * @param content Initial content to edit
 * @param templateLines Additional template lines to include (will be filtered out)
 * @param fileExtension File extension for syntax highlighting
 * @returns Promise resolving to the edited content
 */
export async function editContentInEditor(
    content: string,
    templateLines: string[] = [],
    fileExtension: string = '.txt'
): Promise<EditorResult> {
    const logger = getDryRunLogger(false);
    const editor = process.env.EDITOR || process.env.VISUAL || 'vi';

    const secureTempFile = await SecureTempFile.create('kodrdriv_edit', fileExtension);
    try {
        // Build template content
        const templateContent = [
            ...templateLines,
            ...(templateLines.length > 0 ? [''] : []), // Add separator if we have template lines
            content,
            '',
        ].join('\n');

        await secureTempFile.writeContent(templateContent);
        await secureTempFile.close(); // Close before external editor access

        logger.info(`📝 Opening ${editor} to edit content...`);

        // Open the editor synchronously
        const result = spawnSync(editor, [secureTempFile.path], { stdio: 'inherit' });

        if (result.error) {
            throw new Error(`Failed to launch editor '${editor}': ${result.error.message}`);
        }

        // Read the file back in, stripping comment lines
        const fileContent = (await fs.readFile(secureTempFile.path, 'utf8'))
            .split('\n')
            .filter(line => !line.trim().startsWith('#'))
            .join('\n')
            .trim();

        if (!fileContent) {
            throw new Error('Content is empty after editing');
        }

        logger.info('✅ Content updated successfully');

        return {
            content: fileContent,
            wasEdited: fileContent !== content.trim()
        };

    } finally {
        // Always clean up the temp file securely
        await secureTempFile.cleanup();
    }
}

/**
 * Standard choices for interactive feedback loops
 */
export const STANDARD_CHOICES = {
    CONFIRM: { key: 'c', label: 'Confirm and proceed' },
    EDIT: { key: 'e', label: 'Edit in editor' },
    SKIP: { key: 's', label: 'Skip and abort' },
    IMPROVE: { key: 'i', label: 'Improve with LLM feedback' }
} as const;

/**
 * Get text input from the user
 * @param prompt The prompt message to display
 * @param options Additional options for customizing behavior
 * @returns Promise resolving to the user's text input
 */
export async function getUserTextInput(
    prompt: string,
    options: InteractiveOptions = {}
): Promise<string> {
    const logger = getDryRunLogger(false);

    // Check if stdin is a TTY (terminal) or piped
    if (!process.stdin.isTTY) {
        logger.error('⚠️  STDIN is piped but interactive text input is required');
        logger.error('   Interactive text input cannot be used when input is piped');
        logger.error('   Solutions:');
        logger.error('   • Use terminal input instead of piping');

        // Add any additional suggestions
        if (options.nonTtyErrorSuggestions) {
            options.nonTtyErrorSuggestions.forEach(suggestion => {
                logger.error(`   • ${suggestion}`);
            });
        }

        throw new Error('Interactive text input requires a terminal');
    }

    logger.info(prompt);
    logger.info('(Press Enter when done, or type Ctrl+C to cancel)');
    logger.info('');

    return new Promise((resolve, reject) => {
        let inputBuffer = '';
        let isResolved = false;
        let dataHandler: ((chunk: string) => void) | null = null;
        let errorHandler: ((error: Error) => void) | null = null;

        const cleanup = () => {
            if (dataHandler) {
                process.stdin.removeListener('data', dataHandler);
            }
            if (errorHandler) {
                process.stdin.removeListener('error', errorHandler);
            }

            try {
                process.stdin.pause();
                // Detach stdin again now that we're done
                if (typeof process.stdin.unref === 'function') {
                    process.stdin.unref();
                }
            } catch {
                // Ignore cleanup errors
            }
        };

        const safeResolve = (value: string) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                resolve(value);
            }
        };

        const safeReject = (error: Error) => {
            if (!isResolved) {
                isResolved = true;
                cleanup();
                reject(error);
            }
        };

        try {
            // Ensure stdin is referenced so the process doesn't exit while waiting for input
            if (typeof process.stdin.ref === 'function') {
                process.stdin.ref();
            }

            process.stdin.setEncoding('utf8');
            process.stdin.resume();

            dataHandler = (chunk: string) => {
                try {
                    inputBuffer += chunk;

                    // Check if user pressed Enter (newline character)
                    if (inputBuffer.includes('\n')) {
                        const userInput = inputBuffer.replace(/\n$/, '').trim();

                        if (userInput === '') {
                            logger.warn('Empty input received. Please provide feedback text.');
                            safeReject(new Error('Empty input received'));
                        } else {
                            logger.info(`✅ Received feedback: "${userInput}"\n`);
                            safeResolve(userInput);
                        }
                    }
                } catch (error) {
                    safeReject(error instanceof Error ? error : new Error('Unknown error processing input'));
                }
            };

            errorHandler = (error: Error) => {
                safeReject(error);
            };

            process.stdin.on('data', dataHandler);
            process.stdin.on('error', errorHandler);

        } catch (error) {
            safeReject(error instanceof Error ? error : new Error('Failed to setup input handlers'));
        }
    });
}

/**
 * Get LLM improvement feedback from the user using the editor
 * @param contentType Type of content being improved (e.g., 'commit message', 'release notes')
 * @param currentContent The current content to be improved
 * @returns Promise resolving to the user's feedback text
 */
export async function getLLMFeedbackInEditor(
    contentType: string,
    currentContent: string
): Promise<string> {
    const templateLines = [
        '# Provide Your Instructions and Guidance for a Revision Here',
        '#',
        '# Type your guidance above this line. Be specific about what you want changed,',
        '# added, or improved. You can also edit the original content below directly',
        '# to provide examples or show desired changes.',
        '#',
        '# Lines starting with "#" will be ignored.',
        '',
        '### YOUR FEEDBACK AND GUIDANCE:',
        '',
        '# (Type your improvement instructions here)',
        '',
        `### ORIGINAL ${contentType.toUpperCase()}:`,
        ''
    ];

    const result = await editContentInEditor(
        currentContent,
        templateLines,
        '.md'
    );

    // Extract just the feedback section (everything before the original content)
    const lines = result.content.split('\n');
    const originalSectionIndex = lines.findIndex(line =>
        line.trim().toLowerCase().startsWith('### original')
    );

    let feedback: string;
    if (originalSectionIndex >= 0) {
        // Take everything before the "### ORIGINAL" section
        feedback = lines.slice(0, originalSectionIndex).join('\n').trim();
    } else {
        // If no original section found, take everything
        feedback = result.content.trim();
    }

    // Remove the feedback header if it exists
    feedback = feedback.replace(/^### YOUR FEEDBACK AND GUIDANCE:\s*/i, '').trim();

    if (!feedback) {
        throw new Error('No feedback provided. Please provide improvement instructions.');
    }

    return feedback;
}

/**
 * Check if interactive mode is available (TTY check)
 * @param errorMessage Custom error message to throw if TTY not available
 * @throws Error if not in TTY environment
 */
export function requireTTY(errorMessage: string = 'Interactive mode requires a terminal. Use --dry-run instead.'): void {
    if (!process.stdin.isTTY) {
        const logger = getDryRunLogger(false);
        logger.error('❌ Interactive mode requires a terminal (TTY)');
        logger.error('   Solutions:');
        logger.error('   • Run without piping input');
        logger.error('   • Use --dry-run to see the generated content');
        throw new Error(errorMessage);
    }
}

export interface LLMImprovementConfig {
    /** The type of content being improved (for filenames and logging) */
    contentType: string;
    /** Function that creates a prompt for improvement */
    createImprovedPrompt: (
        promptConfig: any,
        improvementContent: any,
        promptContext: any
    ) => Promise<any>;
    /** Function that calls LLM with the improved prompt */
    callLLM: (
        request: any,
        runConfig: any,
        outputDirectory: string
    ) => Promise<any>;
    /** Function that validates/processes the LLM response */
    processResponse?: (response: any) => any;
}

/**
 * Generic LLM improvement function that can be configured for different content types
 * @param currentContent The current content to improve
 * @param runConfig Runtime configuration
 * @param promptConfig Prompt configuration
 * @param promptContext Prompt context
 * @param outputDirectory Output directory for debug files
 * @param improvementConfig Configuration for this specific improvement type
 * @returns Promise resolving to the improved content
 */
export async function improveContentWithLLM<T>(
    currentContent: T,
    runConfig: any,
    promptConfig: any,
    promptContext: any,
    outputDirectory: string,
    improvementConfig: LLMImprovementConfig
): Promise<T> {
    const logger = getDryRunLogger(false);

    logger.info(`🤖 Requesting LLM to improve the ${improvementConfig.contentType}...`);

    // Create the improved prompt using the provided function
    const improvedPromptResult = await improvementConfig.createImprovedPrompt(
        promptConfig,
        currentContent,
        promptContext
    );

    // Call the LLM with the improved prompt
    const improvedResponse = await improvementConfig.callLLM(improvedPromptResult, runConfig, outputDirectory);

    // Process the response if a processor is provided
    const finalResult = improvementConfig.processResponse
        ? improvementConfig.processResponse(improvedResponse)
        : improvedResponse;

    logger.info(`✅ LLM has provided improved ${improvementConfig.contentType}`);
    return finalResult;
}
