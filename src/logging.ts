import winston from 'winston';
// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs';
import path from 'path';
import { DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS, PROGRAM_NAME, DEFAULT_OUTPUT_DIRECTORY } from './constants';

export interface LogContext {
    [key: string]: any;
}

// Track if debug directory has been ensured for this session
let debugDirectoryEnsured = false;

const ensureDebugDirectory = () => {
    if (debugDirectoryEnsured) return;

    const debugDir = path.join(DEFAULT_OUTPUT_DIRECTORY, 'debug');

    try {
        fs.mkdirSync(debugDir, { recursive: true });
        debugDirectoryEnsured = true;
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error(`Failed to create debug directory ${debugDir}:`, error);
    }
};

const generateDebugLogFilename = () => {
    const now = new Date();
    const timestamp = now.toISOString()
        .replace(/[-:]/g, '')
        .replace(/\./g, '')
        .replace('T', '-')
        .replace('Z', '');

    return `${timestamp}-debug.log`;
};

const createTransports = (level: string) => {
    const transports: winston.transport[] = [];

    // Always add console transport for info level and above
    if (level === 'info') {
        transports.push(
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ level, message, dryRun }): string => {
                        const dryRunPrefix = dryRun ? '🔍 DRY RUN: ' : '';
                        return `${level}: ${dryRunPrefix}${String(message)}`;
                    })
                )
            })
        );
    } else {
        // For debug/verbose levels, add console transport that shows info and above
        transports.push(
            new winston.transports.Console({
                level: 'info', // Show info, warn, and error on console
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, level, message, dryRun, ...meta }): string => {
                        // For info level messages, use simpler format without timestamp
                        if (level.includes('info')) {
                            const dryRunPrefix = dryRun ? '🔍 DRY RUN: ' : '';
                            return `${dryRunPrefix}${String(message)}`;
                        }
                        const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                        const dryRunPrefix = dryRun ? '🔍 DRY RUN: ' : '';
                        return `${timestamp} ${level}: ${dryRunPrefix}${String(message)}${metaStr}`;
                    })
                )
            })
        );

        // Add file transport for debug levels (debug and silly)
        if (level === 'debug' || level === 'silly') {
            ensureDebugDirectory();

            const debugLogPath = path.join(DEFAULT_OUTPUT_DIRECTORY, 'debug', generateDebugLogFilename());

            transports.push(
                new winston.transports.File({
                    filename: debugLogPath,
                    level: 'debug', // Capture debug and above in the file
                    format: winston.format.combine(
                        winston.format.timestamp({ format: DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS }),
                        winston.format.errors({ stack: true }),
                        winston.format.splat(),
                        winston.format.printf(({ timestamp, level, message, ...meta }) => {
                            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                            return `${timestamp} ${level}: ${message}${metaStr}`;
                        })
                    )
                })
            );
        }
    }

    return transports;
};

const createFormat = (level: string) => {
    const baseFormats = [
        winston.format.errors({ stack: true }),
        winston.format.splat(),
    ];

    if (level === 'info') {
        return winston.format.combine(
            ...baseFormats,
            winston.format.printf(({ message, dryRun, ..._meta }): string => {
                // Auto-format dry-run messages
                if (dryRun) {
                    return `🔍 DRY RUN: ${message}`;
                }
                return String(message);
            })
        );
    }

    return winston.format.combine(
        winston.format.timestamp({ format: DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS_MILLISECONDS }),
        ...baseFormats,
        winston.format.printf(({ timestamp, level, message, dryRun, ...meta }): string => {
            const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            const dryRunPrefix = dryRun ? '🔍 DRY RUN: ' : '';
            return `${timestamp} ${level}: ${dryRunPrefix}${String(message)}${metaStr}`;
        })
    );
};

// Create the logger instance once
const logger = winston.createLogger({
    level: 'info',
    format: createFormat('info'),
    defaultMeta: { service: PROGRAM_NAME },
    transports: createTransports('info'),
});

export const setLogLevel = (level: string) => {
    // Reconfigure the existing logger instead of creating a new one
    logger.configure({
        level,
        format: createFormat(level),
        defaultMeta: { service: PROGRAM_NAME },
        transports: createTransports(level),
    });
};

export const getLogger = () => logger;

/**
 * Get a logger that automatically formats messages for dry-run mode
 */
export const getDryRunLogger = (isDryRun: boolean) => {
    if (!isDryRun) {
        return logger;
    }

    // Return a wrapper that adds dry-run context to all log calls
    return {
        info: (message: string, ...args: any[]) => logger.info(message, { dryRun: true }, ...args),
        warn: (message: string, ...args: any[]) => logger.warn(message, { dryRun: true }, ...args),
        error: (message: string, ...args: any[]) => logger.error(message, { dryRun: true }, ...args),
        debug: (message: string, ...args: any[]) => logger.debug(message, { dryRun: true }, ...args),
        verbose: (message: string, ...args: any[]) => logger.verbose(message, { dryRun: true }, ...args),
        silly: (message: string, ...args: any[]) => logger.silly(message, { dryRun: true }, ...args),
    };
};
