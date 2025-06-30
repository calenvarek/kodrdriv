import { describe, test, expect, beforeEach, vi } from 'vitest';
import { setLogLevel, getLogger, LogContext } from '../src/logging.js';
import winston from 'winston';
import { PROGRAM_NAME } from '../src/constants.js';

describe('Logging module', () => {
    beforeEach(() => {
        // Clear mock calls before each test
        vi.clearAllMocks();
    });

    test('getLogger returns a logger instance', () => {
        const logger = getLogger();
        expect(logger).toBeDefined();
        expect(typeof logger.info).toBe('function');
        expect(typeof logger.error).toBe('function');
        expect(typeof logger.debug).toBe('function');
        expect(typeof logger.warn).toBe('function');
    });

    test('getLogger returns the same instance across multiple calls', () => {
        const logger1 = getLogger();
        const logger2 = getLogger();

        // Should be the exact same instance
        expect(logger1).toBe(logger2);
    });

    test('setLogLevel reconfigures the existing logger instance', () => {
        const logger = getLogger();

        // Spy on the configure method of the logger instance
        const configureSpy = vi.spyOn(logger, 'configure');

        // Set log level to debug
        setLogLevel('debug');

        // Verify configure was called once
        expect(configureSpy).toHaveBeenCalledTimes(1);

        // Verify correct configuration was passed
        const callArgs = configureSpy.mock.calls[0];
        expect(callArgs).toBeDefined();
        if (callArgs && callArgs[0]) {
            const config = callArgs[0];
            expect(config.level).toBe('debug');
            expect(config.defaultMeta).toEqual({ service: PROGRAM_NAME });
            expect(config.format).toBeDefined();
            expect(config.transports).toBeDefined();
        }
    });

    test('setLogLevel maintains the same logger instance', () => {
        const loggerBefore = getLogger();

        // Change log level
        setLogLevel('debug');

        const loggerAfter = getLogger();

        // Should still be the same instance
        expect(loggerBefore).toBe(loggerAfter);
    });

    test('setLogLevel with info level configures logger differently than other levels', () => {
        const logger = getLogger();
        const configureSpy = vi.spyOn(logger, 'configure');

        // Set log level to info
        setLogLevel('info');

        // Set log level to debug
        setLogLevel('debug');

        // Verify configure was called twice with different configurations
        expect(configureSpy).toHaveBeenCalledTimes(2);

        const infoCalls = configureSpy.mock.calls[0];
        const debugCalls = configureSpy.mock.calls[1];

        expect(infoCalls).toBeDefined();
        expect(debugCalls).toBeDefined();

        if (infoCalls && infoCalls[0] && debugCalls && debugCalls[0]) {
            const infoConfig = infoCalls[0];
            const debugConfig = debugCalls[0];

            expect(infoConfig.level).toBe('info');
            expect(debugConfig.level).toBe('debug');

            // The format and transports should be different between the two calls
            expect(infoConfig.format).not.toEqual(debugConfig.format);
        }
    });

    test('logger methods can be called without errors', () => {
        const logger = getLogger();

        // Simply verify that these method calls don't throw exceptions
        expect(() => {
            logger.info('Test info message');
            logger.error('Test error message');
            logger.warn('Test warning message');
            logger.debug('Test debug message');
        }).not.toThrow();
    });

    test('logger with context includes context in metadata', () => {
        const logger = getLogger();

        // Spy on the logger's info method
        const infoSpy = vi.spyOn(logger, 'info');

        // Log with context
        const context: LogContext = { requestId: '123', userId: '456' };
        logger.info('Message with context', context);

        // Verify logger's info method was called with context
        expect(infoSpy).toHaveBeenCalledWith('Message with context', context);
    });

    test('logger format functions handle meta objects correctly', () => {
        const logger = getLogger();

        // Test debug level with meta data
        setLogLevel('debug');

        // Simply verify logging with meta doesn't throw exceptions
        expect(() => {
            logger.info('Test message with meta', {
                key1: 'value1',
                key2: 'value2',
                nested: { foo: 'bar' }
            });
        }).not.toThrow();

        // Test info level with meta data
        setLogLevel('info');

        expect(() => {
            logger.info('Test message with meta in info mode', {
                key1: 'value1',
                key2: 'value2'
            });
        }).not.toThrow();
    });

    test('logger level changes are immediately effective', () => {
        const logger = getLogger();

        // Set to debug level
        setLogLevel('debug');
        expect(logger.level).toBe('debug');

        // Set to info level
        setLogLevel('info');
        expect(logger.level).toBe('info');

        // Set to error level
        setLogLevel('error');
        expect(logger.level).toBe('error');
    });
});
