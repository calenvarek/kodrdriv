import { Logger } from 'winston';
import { CommandError, UserCancellationError } from '@eldrforge/shared';

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
        logger.info('USER_CANCELLATION: Operation cancelled by user | Reason: ' + error.message + ' | Status: aborted');
        if (exitOnError) process.exit(0);
        return;
    }

    // Handle known command errors
    if (error instanceof CommandError) {
        // Import PullRequestCheckError dynamically to avoid circular imports
        const { PullRequestCheckError } = await import('@eldrforge/shared');

        // Special handling for PR check errors since they have detailed recovery instructions
        if (error instanceof PullRequestCheckError) {
            // The error has already displayed its detailed recovery instructions
            // Just show a brief summary here
            logger.error(`COMMAND_FAILED: Command execution failed | Command: ${command} | Error: ${error.message} | Recovery: See above`);
            logger.info('ERROR_RECOVERY_INFO: Detailed recovery instructions provided above | Action: Review and follow steps');
        } else {
            logger.error(`COMMAND_FAILED: Command execution failed | Command: ${command} | Error: ${error.message}`);
            if (error.cause && typeof error.cause === 'object' && 'message' in error.cause) {
                logger.debug(`Caused by: ${(error.cause as Error).message}`);
                if (logger.isDebugEnabled() && 'stack' in error.cause) {
                    logger.debug(`Stack trace:`, (error.cause as Error).stack);
                }
            }

            // Provide recovery suggestions for recoverable errors
            if (error.recoverable) {
                logger.info('ERROR_RECOVERABLE: This error is recoverable | Action: Retry operation or adjust configuration | Status: can-retry');
            }
        }

        if (exitOnError) process.exit(1);
        throw error;
    }

    // Handle unexpected errors
    logger.error(`ERROR_UNEXPECTED: Command encountered unexpected error | Command: ${command} | Error: ${error.message} | Type: unexpected`);
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
