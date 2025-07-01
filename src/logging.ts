import winston from 'winston';
import { DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS, PROGRAM_NAME } from './constants';

export interface LogContext {
    [key: string]: any;
}

const createTransports = (level: string) => {
    if (level === 'info') {
        return [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ level, message }) => {
                        return `${level}: ${message}`;
                    })
                )
            })
        ];
    }

    return [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
                    return `${timestamp} ${level}: ${message}${metaStr}`;
                })
            )
        })
    ];
};

const createFormat = (level: string) => {
    if (level === 'info') {
        return winston.format.combine(
            winston.format.errors({ stack: true }),
            winston.format.splat(),
        );
    }

    return winston.format.combine(
        winston.format.timestamp({ format: DATE_FORMAT_YEAR_MONTH_DAY_HOURS_MINUTES_SECONDS }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json()
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