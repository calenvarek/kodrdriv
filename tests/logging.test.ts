import { describe, test, expect, beforeEach, vi, afterEach } from 'vitest';
import { setLogLevel, getLogger, getDryRunLogger, LogContext } from '../src/logging.js';
import winston from 'winston';
import { PROGRAM_NAME, DEFAULT_OUTPUT_DIRECTORY } from '../src/constants.js';
import path from 'path';

describe('Logging module', () => {
    beforeEach(() => {
        // Clear mock calls before each test
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Reset log level to info after each test
        setLogLevel('info');
    });

    describe('getLogger', () => {
        test('returns a logger instance', () => {
            const logger = getLogger();
            expect(logger).toBeDefined();
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.error).toBe('function');
            expect(typeof logger.debug).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.verbose).toBe('function');
            expect(typeof logger.silly).toBe('function');
        });

        test('returns the same instance across multiple calls', () => {
            const logger1 = getLogger();
            const logger2 = getLogger();

            // Should be the exact same instance
            expect(logger1).toBe(logger2);
        });

        test('logger has correct default configuration', () => {
            const logger = getLogger();
            expect(logger.level).toBe('info');
            expect(logger.defaultMeta).toEqual({ service: PROGRAM_NAME });
        });
    });

    describe('setLogLevel', () => {
        test('reconfigures the existing logger instance', () => {
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

        test('maintains the same logger instance', () => {
            const loggerBefore = getLogger();

            // Change log level
            setLogLevel('debug');

            const loggerAfter = getLogger();

            // Should still be the same instance
            expect(loggerBefore).toBe(loggerAfter);
        });

        test('configures logger differently for info vs debug levels', () => {
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

        test('level changes are immediately effective', () => {
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

        test('handles various log levels correctly', () => {
            const logger = getLogger();

            const levels = ['silly', 'debug', 'verbose', 'info', 'warn', 'error'];

            levels.forEach(level => {
                setLogLevel(level);
                expect(logger.level).toBe(level);
            });
        });
    });

                describe('debug level configuration', () => {
        test('debug level configures file transport correctly', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('debug');

            const config = configureSpy.mock.calls[0]?.[0];
            expect(config?.transports).toBeDefined();
            if (config?.transports && Array.isArray(config.transports)) {
                expect(config.transports).toHaveLength(2); // Console + File transport
            }
        });

        test('silly level configures file transport correctly', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('silly');

            const config = configureSpy.mock.calls[0]?.[0];
            expect(config?.transports).toBeDefined();
            if (config?.transports && Array.isArray(config.transports)) {
                expect(config.transports).toHaveLength(2); // Console + File transport
            }
        });

        test('info level does not configure file transport', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('info');

            const config = configureSpy.mock.calls[0]?.[0];
            expect(config?.transports).toBeDefined();
            if (config?.transports && Array.isArray(config.transports)) {
                expect(config.transports).toHaveLength(1); // Only console transport
            }
        });

        test('setLogLevel with debug does not throw errors', () => {
            expect(() => setLogLevel('debug')).not.toThrow();
        });

        test('setLogLevel with silly does not throw errors', () => {
            expect(() => setLogLevel('silly')).not.toThrow();
        });
    });

    describe('logger methods', () => {
        test('all logger methods can be called without errors', () => {
            const logger = getLogger();

            expect(() => {
                logger.info('Test info message');
                logger.error('Test error message');
                logger.warn('Test warning message');
                logger.debug('Test debug message');
                logger.verbose('Test verbose message');
                logger.silly('Test silly message');
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

        test('logger handles complex meta objects correctly', () => {
            const logger = getLogger();

            // Test debug level with meta data
            setLogLevel('debug');

            expect(() => {
                logger.info('Test message with meta', {
                    key1: 'value1',
                    key2: 'value2',
                    nested: { foo: 'bar' },
                    array: [1, 2, 3],
                    nullValue: null,
                    undefinedValue: undefined
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

        test('logger handles errors with stack traces', () => {
            const logger = getLogger();
            setLogLevel('debug');

            const testError = new Error('Test error with stack');

            expect(() => {
                logger.error('Error occurred', { error: testError });
            }).not.toThrow();
        });
    });

    describe('getDryRunLogger', () => {
        test('returns original logger when isDryRun is false', () => {
            const originalLogger = getLogger();
            const dryRunLogger = getDryRunLogger(false);

            expect(dryRunLogger).toBe(originalLogger);
        });

        test('returns wrapper logger when isDryRun is true', () => {
            const originalLogger = getLogger();
            const dryRunLogger = getDryRunLogger(true);

            expect(dryRunLogger).not.toBe(originalLogger);
            expect(typeof dryRunLogger.info).toBe('function');
            expect(typeof dryRunLogger.error).toBe('function');
            expect(typeof dryRunLogger.debug).toBe('function');
            expect(typeof dryRunLogger.warn).toBe('function');
            expect(typeof dryRunLogger.verbose).toBe('function');
            expect(typeof dryRunLogger.silly).toBe('function');
        });

        test('dry run logger adds dryRun context to all log calls', () => {
            const originalLogger = getLogger();
            const infoSpy = vi.spyOn(originalLogger, 'info');
            const errorSpy = vi.spyOn(originalLogger, 'error');
            const warnSpy = vi.spyOn(originalLogger, 'warn');
            const debugSpy = vi.spyOn(originalLogger, 'debug');
            const verboseSpy = vi.spyOn(originalLogger, 'verbose');
            const sillySpy = vi.spyOn(originalLogger, 'silly');

            const dryRunLogger = getDryRunLogger(true);

            dryRunLogger.info('Test info message');
            dryRunLogger.error('Test error message');
            dryRunLogger.warn('Test warn message');
            dryRunLogger.debug('Test debug message');
            dryRunLogger.verbose('Test verbose message');
            dryRunLogger.silly('Test silly message');

            expect(infoSpy).toHaveBeenCalledWith('Test info message', { dryRun: true });
            expect(errorSpy).toHaveBeenCalledWith('Test error message', { dryRun: true });
            expect(warnSpy).toHaveBeenCalledWith('Test warn message', { dryRun: true });
            expect(debugSpy).toHaveBeenCalledWith('Test debug message', { dryRun: true });
            expect(verboseSpy).toHaveBeenCalledWith('Test verbose message', { dryRun: true });
            expect(sillySpy).toHaveBeenCalledWith('Test silly message', { dryRun: true });
        });

        test('dry run logger handles additional arguments correctly', () => {
            const originalLogger = getLogger();
            const infoSpy = vi.spyOn(originalLogger, 'info');

            const dryRunLogger = getDryRunLogger(true);

            const metadata = { key: 'value' };
            const extraArg = 'extra';

            dryRunLogger.info('Test message', metadata, extraArg);

            expect(infoSpy).toHaveBeenCalledWith('Test message', { dryRun: true }, metadata, extraArg);
        });

        test('dry run logger preserves method chaining behavior', () => {
            const dryRunLogger = getDryRunLogger(true);

            // These should not throw errors and should work like normal logger methods
            expect(() => {
                dryRunLogger.info('Chain test 1');
                dryRunLogger.error('Chain test 2');
                dryRunLogger.debug('Chain test 3');
            }).not.toThrow();
        });
    });

    describe('transport configuration', () => {
        test('info level uses console transport only', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('info');

            const config = configureSpy.mock.calls[0]?.[0];
            expect(config?.transports).toBeDefined();
            if (config?.transports && Array.isArray(config.transports)) {
                expect(config.transports).toHaveLength(1);
                expect(config.transports[0]).toBeInstanceOf(winston.transports.Console);
            }
        });

        test('debug level uses both console and file transports', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('debug');

            const config = configureSpy.mock.calls[0]?.[0];
            expect(config?.transports).toBeDefined();
            if (config?.transports && Array.isArray(config.transports)) {
                expect(config.transports).toHaveLength(2);
                expect(config.transports[0]).toBeInstanceOf(winston.transports.Console);
                expect(config.transports[1]).toBeInstanceOf(winston.transports.File);
            }
        });

        test('verbose level only uses console transport', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('verbose');

            const config = configureSpy.mock.calls[0]?.[0];
            expect(config?.transports).toBeDefined();
            if (config?.transports && Array.isArray(config.transports)) {
                expect(config.transports).toHaveLength(1);
                expect(config.transports[0]).toBeInstanceOf(winston.transports.Console);
            }
        });
    });

    describe('format configuration', () => {
        test('different log levels use different formats', () => {
            const logger = getLogger();
            const configureSpy = vi.spyOn(logger, 'configure');

            setLogLevel('info');
            const infoFormat = configureSpy.mock.calls[0]?.[0]?.format;

            setLogLevel('debug');
            const debugFormat = configureSpy.mock.calls[1]?.[0]?.format;

            expect(infoFormat).not.toEqual(debugFormat);
        });

        test('format handles dry run metadata correctly', () => {
            setLogLevel('info');
            const logger = getLogger();

            // Test that logging with dryRun metadata doesn't throw
            expect(() => {
                logger.info('Test message', { dryRun: true });
                logger.info('Test message', { dryRun: false });
            }).not.toThrow();
        });
    });

    describe('edge cases and error handling', () => {
        test('handles empty messages', () => {
            const logger = getLogger();

            expect(() => {
                logger.info('');
                logger.error('');
                logger.debug('');
            }).not.toThrow();
        });

        test('handles null and undefined messages', () => {
            const logger = getLogger();

            expect(() => {
                logger.info(null as any);
                logger.info(undefined as any);
                logger.error(null as any);
                logger.debug(undefined as any);
            }).not.toThrow();
        });

        test('handles circular references in metadata', () => {
            const logger = getLogger();

            const circularObj: any = { name: 'test' };
            circularObj.self = circularObj;

            expect(() => {
                logger.info('Circular reference test', { circular: circularObj });
            }).not.toThrow();
        });

        test('handles very large metadata objects', () => {
            const logger = getLogger();

            const largeObj = {};
            for (let i = 0; i < 1000; i++) {
                (largeObj as any)[`key${i}`] = `value${i}`.repeat(100);
            }

            expect(() => {
                logger.info('Large object test', largeObj);
            }).not.toThrow();
        });
    });

    describe('integration scenarios', () => {
        test('switching between log levels multiple times works correctly', () => {
            const logger = getLogger();

            const levels = ['info', 'debug', 'verbose', 'info', 'error', 'debug'];

            levels.forEach(level => {
                setLogLevel(level);
                expect(logger.level).toBe(level);

                // Log at each level to ensure no errors
                expect(() => {
                    logger.info(`Test at ${level} level`);
                    logger.debug(`Debug test at ${level} level`);
                }).not.toThrow();
            });
        });

        test('dry run logger works correctly after log level changes', () => {
            const originalLogger = getLogger();
            const infoSpy = vi.spyOn(originalLogger, 'info');

            setLogLevel('debug');
            const dryRunLogger = getDryRunLogger(true);

            dryRunLogger.info('Test after level change');

            expect(infoSpy).toHaveBeenCalledWith('Test after level change', { dryRun: true });

            setLogLevel('info');
            dryRunLogger.info('Test after second level change');

            expect(infoSpy).toHaveBeenCalledWith('Test after second level change', { dryRun: true });
        });

        test('logger maintains consistency across async operations', async () => {
            const logger = getLogger();

            const promises = Array.from({ length: 10 }, async (_, i) => {
                const currentLogger = getLogger();
                expect(currentLogger).toBe(logger);

                currentLogger.info(`Async test ${i}`);

                return currentLogger;
            });

            const results = await Promise.all(promises);

            // All should be the same instance
            results.forEach(result => {
                expect(result).toBe(logger);
            });
        });
    });
});
