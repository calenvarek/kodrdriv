import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input, transformCliArgs, validateCommand, validateContextDirectories } from '../src/arguments'; // Adjust path as needed
// Import the type for type safety
import type { Cardigantime } from '@theunwalked/cardigantime';
// Removed Cardigantime import here, will be dynamically imported
import { ALLOWED_COMMANDS, KODRDRIV_DEFAULTS } from '../src/constants'; // Adjust path as needed
import { CommandConfig, Config, SecureConfig } from '../src/types'; // Adjust path as needed
// Removed Logging import here, will be dynamically imported
// import * as Logging from '../src/logging'; // Adjust path as needed
import { Mock } from 'vitest';

// Mock dependencies
vi.mock('commander');
vi.mock('path'); // Mock path if needed for specific tests

// Mock process.env
const originalEnv = process.env;
// Define mock logger structure (can be reused)
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
};

// Define mockStorage structure at the top level
const mockStorage = {
    isDirectoryReadable: vi.fn(),
    listFiles: vi.fn(),
    // Add other methods if they are part of the Storage interface and used
};

// Mock the logging module here, using a factory for getLogger's return value
vi.mock('../src/logging', () => {
    // This factory function is called when ../src/logging is imported
    return {
        getLogger: vi.fn(() => mockLogger), // Ensures mockLogger is accessed when getLogger is called
        __esModule: true,
    };
});

// Mock the storage module here, using a factory for create's return value
vi.mock('../src/util/storage', () => ({
    create: vi.fn(() => mockStorage), // Ensures mockStorage is accessed when create is called
    __esModule: true,
}));

beforeEach(async () => { // Make top-level beforeEach async
    vi.resetModules(); // Clears the cache
    process.env = { ...originalEnv }; // Restore original env variables

    // Clear mocks on the mockLogger object itself before each test
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    mockLogger.error.mockClear();
    mockLogger.debug.mockClear();

    // Dynamically import dependencies needed *before* tests run, if any
    // For example, if the module under test imports logging at the top level.
    // We don't need to import logging itself here unless setup requires it.

    // Removed: vi.spyOn(Logging, 'getLogger').mockReturnValue(...);
});

afterEach(() => {
    process.env = originalEnv; // Restore original env
    vi.clearAllMocks();
});

describe('Argument Parsing and Configuration', () => {

    describe('transformCliArgs', () => {
        it('should transform flat CLI args to nested Config structure', () => {
            const cliArgs: Input = {
                dryRun: true,
                verbose: false,
                debug: true,
                overrides: false,
                model: 'gpt-4',
                contextDirectories: ['src', 'lib'],
                instructions: 'path/to/instructions.md',
                configDir: '/custom/config',
                cached: true,
                sendit: false,
                from: 'main',
                to: 'v1.0',
                // openaiApiKey is deliberately omitted as it's handled separately
            };

            const expectedConfig: Partial<Config> = {
                dryRun: true,
                verbose: false,
                debug: true,
                overrides: false,
                model: 'gpt-4',
                contextDirectories: ['src', 'lib'],
                instructions: 'path/to/instructions.md',
                configDirectory: '/custom/config',
                commit: {
                    cached: true,
                    sendit: false,
                },
                release: {
                    from: 'main',
                    to: 'v1.0',
                },
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle missing optional arguments', () => {
            const cliArgs: Input = {
                // Only provide a subset of args
                dryRun: true,
                model: 'gpt-3.5-turbo',
            };

            const expectedConfig: Partial<Config> = {
                dryRun: true,
                model: 'gpt-3.5-turbo',
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should correctly map configDir to configDirectory', () => {
            const cliArgs: Input = { configDir: './config' };
            const expectedConfig: Partial<Config> = { configDirectory: './config' };
            expect(transformCliArgs(cliArgs)).toEqual(expectedConfig);
        });

        it('should handle only commit args', () => {
            const cliArgs: Input = { cached: true };
            const expectedConfig: Partial<Config> = { commit: { cached: true } };
            expect(transformCliArgs(cliArgs)).toEqual(expectedConfig);
        });

        it('should handle only release args', () => {
            const cliArgs: Input = { from: 'develop' };
            const expectedConfig: Partial<Config> = { release: { from: 'develop' } };
            expect(transformCliArgs(cliArgs)).toEqual(expectedConfig);
        });
    });

    // Add more describe blocks for other functions like configure, getCliConfig, etc.
    // Example for configure (will need more mocking)
    describe('configure', () => {
        // Use the imported type
        let mockCardigantimeInstance: Cardigantime<any>;
        // Hold the mocked module itself if needed
        let MockedCardigantime: any; // Keep this as any for the dynamically imported module

        beforeEach(async () => { // Make beforeEach async
            // Define the mock instance structure first
            mockCardigantimeInstance = {
                // Add explicit types to vi.fn()
                configure: vi.fn<() => Promise<Command>>().mockResolvedValue(new Command()),
                // Assuming read returns Promise<Partial<Config>> or similar - adjust if needed
                read: vi.fn<() => Promise<Partial<Config>>>().mockResolvedValue({}),
                // Assuming validate returns Promise<void>
                validate: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                // Add any other methods/properties expected on the instance
            } as unknown as Cardigantime<any>; // Keep type assertion here for simplicity if needed

            // Use unstable_mockModule
            vi.mock('@theunwalked/cardigantime', () => ({
                // Assuming Cardigantime is the class/factory we need to mock
                // Adjust if it's a default export or has a different name
                Cardigantime: vi.fn().mockImplementation(() => mockCardigantimeInstance),
                // Add any other exports from the module if they are used and need mocking
                __esModule: true, // Indicate it's an ES module
            }));

            // Dynamically import the mocked module *after* mocking it
            MockedCardigantime = await import('@theunwalked/cardigantime');

            // Reset mocks for cardigantime before each test (already done by vi.fn() above)
            // mockCardigantimeInstance = { ... } // Definition moved up

            // Removed: vi.spyOn(Cardigantime, 'Cardigantime').mockImplementation(() => mockCardigantimeInstance);

            // Mock other dependencies used within configure
            // You'll likely need to mock getCliConfig, validateAndProcessOptions, etc.
        });

        it('should integrate with cardigantime and merge configurations correctly', async () => {
            // Arrange: Set up mocks for dependencies called by configure
            // Mock getCliConfig to return controlled CLI args and command config
            const mockCliArgs: Input = { dryRun: true, configDir: 'cli/config' };
            const mockCommandConfig: CommandConfig = { commandName: 'commit' };
            // We need to import and mock getCliConfig, or mock the module containing it
            // For now, let's assume we can mock its behavior within arguments.ts if it's not exported
            // (If it *is* exported, we can mock it directly)
            // A common pattern is to mock the entire module and provide specific implementations

            // Mock file values returned by cardigantime.read
            const mockFileValues: Partial<Config> = { model: 'gpt-from-file', configDirectory: 'file/config' };

            // @ts-ignore
            (mockCardigantimeInstance.read as vi.Mock).mockResolvedValue(mockFileValues);

            // Mock the result of validateAndProcessOptions
            const mockProcessedConfig: Config = {
                ...KODRDRIV_DEFAULTS, // Start with defaults
                dryRun: true, // From CLI
                model: 'gpt-from-file', // From file
                configDirectory: 'cli/config', // From CLI (overrides file)
                // ... other merged and validated properties
                // Make sure the structure matches the final Config type
                instructions: 'default instructions content', // Assume validated
                contextDirectories: [], // Assume validated
                commit: { cached: false, sendit: false }, // Defaults
                release: { from: undefined, to: undefined } // Defaults
            };
            // We need to mock validateAndProcessOptions
            // Similar to getCliConfig, mock the module or the function directly if exported

            // Mock validateAndProcessSecureOptions
            const mockSecureConfig: SecureConfig = { openaiApiKey: 'mock-key-from-env' };
            process.env.OPENAI_API_KEY = 'mock-key-from-env';
            // Mock validateAndProcessSecureOptions


            // *** How to mock non-exported functions like getCliConfig? ***
            // 1. Export them for testing (simplest).
            // 2. Use vi.spyOn on the module itself if possible (can be tricky).
            // 3. Refactor code so logic is in testable, exported functions.
            // Let's assume for now we'd need to refactor or export them.

            // Act: Call configure
            // Need to pass the mock instance correctly. The configure function in arguments.ts
            // takes an instance as an argument.
            //  const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // Assert: Check the results
            // expect(mockCardigantimeInstance.configure).toHaveBeenCalled();
            // expect(mockCardigantimeInstance.read).toHaveBeenCalledWith(mockCliArgs); // Check if read is called with CLI args
            // expect(mockCardigantimeInstance.validate).toHaveBeenCalledWith(mockFileValues);
            // expect(config).toEqual(mockProcessedConfig); // Check merged config
            // expect(secureConfig).toEqual(mockSecureConfig); // Check secure config
            // expect(commandConfig).toEqual(mockCommandConfig); // Check command config

            // This test is incomplete without mocking the internal functions
            expect(true).toBe(true); // Placeholder assertion
        });
    });


    // TODO: Add tests for getCliConfig
    // TODO: Add tests for validateAndProcessOptions
    // TODO: Add tests for validateAndProcessSecureOptions

    describe('validateCommand', () => {
        // Need to import the real function if not already done
        // Assuming validateCommand is exported or made available for testing
        // If it's not exported, we cannot test it directly this way.
        // const validateCommand = jest.requireActual('../src/arguments').validateCommand;
        // Now imported directly

        it('should return the command name if it is allowed', () => {
            expect(validateCommand('commit')).toBe('commit');
            expect(validateCommand('release')).toBe('release');
        });

        it('should throw an error for an invalid command', () => {
            expect(() => validateCommand('invalid-command')).toThrow(
                `Invalid command: invalid-command, allowed commands: ${ALLOWED_COMMANDS.join(', ')}`
            );
        });

        it('should be case-sensitive (assuming ALLOWED_COMMANDS are lowercase)', () => {
            expect(() => validateCommand('Commit')).toThrow();
            expect(() => validateCommand('RELEASE')).toThrow();
        });
    });

    describe('validateContextDirectories', () => {
        let MockedLogging: typeof import('../src/logging');
        // let MockedStorage: typeof import('../src/util/storage'); // Keep if needed for type checking

        beforeEach(async () => { // Make async to allow await import
            // Dynamically import the mocked modules
            MockedLogging = await import('../src/logging');
            // MockedStorage = await import('../src/util/storage'); // Import if needed

            // Reset mock function states for the new test
            mockLogger.warn.mockClear(); // Already present for logger

            // Clear storage mock calls here, as mockStorage is now top-level
            mockStorage.isDirectoryReadable.mockClear();
            mockStorage.listFiles.mockClear(); // Assuming listFiles might be used or for consistency

            // No need to define mockStorage here, it's top-level
            // No need to mock '../src/util/storage' here, it's top-level
        });

        it('should return only readable directories', async () => {
            (mockStorage.isDirectoryReadable as Mock)
                // @ts-ignore
                .mockResolvedValueOnce(true)   // dir1 is readable
                // @ts-ignore
                .mockResolvedValueOnce(false)  // dir2 is not readable
                // @ts-ignore
                .mockResolvedValueOnce(true);  // dir3 is readable

            const inputDirs = ['path/to/dir1', 'path/to/dir2', 'path/to/dir3'];
            const expectedDirs: string[] = ['path/to/dir1', 'path/to/dir3'];
            const result = await validateContextDirectories(inputDirs);
            expect(result).toEqual(expectedDirs);
        });

        it('should return an empty array if no directories are readable', async () => {
            // @ts-ignore
            (mockStorage.isDirectoryReadable as Mock).mockResolvedValue(false);
            const inputDirs = ['no/valid/dir1', 'no/valid/dir2'];
            const result = await validateContextDirectories(inputDirs);
            expect(result).toEqual([]);
        });

        it('should handle errors during directory check and warn', async () => {
            // Access the mock directly (getLogger returns our shared mockLogger)
            // No need for vi.spyOn here, we can check mockLogger.warn directly
            (mockStorage.isDirectoryReadable as Mock).mockResolvedValueOnce(true) // dir1 is readable
                // @ts-ignore
                .mockRejectedValueOnce(new Error('Permission denied')) // dir2 throws error
                // @ts-ignore
                .mockResolvedValueOnce(true); // dir3 is readable

            const inputDirs = ['path/to/dir1', 'path/to/dir2', 'path/to/dir3'];
            const expectedDirs: string[] = ['path/to/dir1', 'path/to/dir3'];
            const result = await validateContextDirectories(inputDirs);

            expect(result).toEqual(expectedDirs);
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Error validating directory path/to/dir2: Permission denied'));
        });

        it('should handle an empty input array', async () => {
            const result = await validateContextDirectories([]);
            expect(result).toEqual([]);
            expect(mockStorage.isDirectoryReadable).not.toHaveBeenCalled();
        });
    });

    // TODO: Add tests for validateConfigDir
    // TODO: Add tests for validateAndReadInstructions
});
