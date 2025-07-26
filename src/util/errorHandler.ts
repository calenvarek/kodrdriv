import { Logger } from 'winston';
import { CommandError, UserCancellationError } from '../error/CommandErrors';

export interface ErrorHandlerOptions {
    logger: Logger;
    command: string;
    exitOnError?: boolean;
}

export interface CommandResult<T = string> {
    success: boolean;
    data?: T;
    error?: CommandError;
    warnings?: string[];
}

export interface Command<TConfig = any, TResult = string> {
    execute(config: TConfig): Promise<CommandResult<TResult>>;
    validate?(config: TConfig): Promise<void>;
}

/**
 * Standardized error handler for all commands
 */
export const handleCommandError = async (
    error: Error,
    options: ErrorHandlerOptions
): Promise<never | void> => {
    const { logger, command, exitOnError = false } = options;

    // Handle user cancellation gracefully
    if (error instanceof UserCancellationError) {
        logger.info(error.message);
        if (exitOnError) process.exit(0);
        return;
    }

    // Handle known command errors
    if (error instanceof CommandError) {
        // Import PullRequestCheckError dynamically to avoid circular imports
        const { PullRequestCheckError } = await import('../error/CommandErrors');

        // Special handling for PR check errors since they have detailed recovery instructions
        if (error instanceof PullRequestCheckError) {
            // The error has already displayed its detailed recovery instructions
            // Just show a brief summary here
            logger.error(`${command} failed: ${error.message}`);
            logger.info('Detailed recovery instructions were provided above.');
        } else {
            logger.error(`${command} failed: ${error.message}`);
            if (error.cause) {
                logger.debug(`Caused by: ${error.cause.message}`);
                if (logger.isDebugEnabled()) {
                    logger.debug(`Stack trace:`, error.cause.stack);
                }
            }

            // Provide recovery suggestions for recoverable errors
            if (error.recoverable) {
                logger.info('This error is recoverable. You may try again or adjust your configuration.');
            }
        }

        if (exitOnError) process.exit(1);
        throw error;
    }

    // Handle unexpected errors
    logger.error(`${command} encountered unexpected error: ${error.message}`);
    if (logger.isDebugEnabled()) {
        logger.debug(`Stack trace:`, error.stack);
    }
    if (exitOnError) process.exit(1);
    throw error;
};

/**
 * Wrapper for command execution with standardized error handling
 */
export const executeWithErrorHandling = async <T>(
    command: string,
    logger: Logger,
    execution: () => Promise<T>,
    exitOnError: boolean = true
): Promise<T> => {
    try {
        return await execution();
    } catch (error: any) {
        await handleCommandError(error, {
            logger,
            command,
            exitOnError
        });
        // This line only reached if exitOnError is false
        throw error;
    }
};

/**
 * Creates a command result for successful operations
 */
export const createSuccessResult = <T>(data: T, warnings?: string[]): CommandResult<T> => ({
    success: true,
    data,
    warnings
});

/**
 * Creates a command result for failed operations
 */
export const createErrorResult = <T>(error: CommandError, warnings?: string[]): CommandResult<T> => ({
    success: false,
    error,
    warnings
});
