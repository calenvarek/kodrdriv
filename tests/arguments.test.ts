import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Input, InputSchema, transformCliArgs, validateCommand, validateContextDirectories, getCliConfig, validateAndProcessSecureOptions, validateAndProcessOptions, validateConfigDir, configure } from '../src/arguments';
import { readStdin } from '../src/util/stdin';
import type { Cardigantime } from '@theunwalked/cardigantime';
import { ALLOWED_COMMANDS, KODRDRIV_DEFAULTS, DEFAULT_CHARACTER_ENCODING } from '../src/constants';

// Mock the readStdin function
vi.mock('../src/util/stdin', () => ({
    readStdin: vi.fn()
}));
import { CommandConfig, Config, SecureConfig } from '../src/types';
import { Mock } from 'vitest';
import { ZodError } from 'zod';

// Mock dependencies
vi.mock('commander');
vi.mock('path', () => ({
    default: {
        isAbsolute: vi.fn((p: string) => p.startsWith('/')),
        resolve: vi.fn((cwd: string, p: string) => p.startsWith('/') ? p : `/absolute/${p}`),
        join: vi.fn((...paths: string[]) => paths.join('/')),
    },
    isAbsolute: vi.fn((p: string) => p.startsWith('/')),
    resolve: vi.fn((cwd: string, p: string) => p.startsWith('/') ? p : `/absolute/${p}`),
    join: vi.fn((...paths: string[]) => paths.join('/')),
}));

// Mock process.env
const originalEnv = process.env;
// Define mock logger structure (can be reused)
const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
    silly: vi.fn()
};

// Define mockStorage structure at the top level
const mockStorage = {
    exists: vi.fn(),
    isDirectory: vi.fn(),
    isDirectoryWritable: vi.fn(),
    isDirectoryReadable: vi.fn(),
    isFileReadable: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    createDirectory: vi.fn(),
    listFiles: vi.fn(),
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

// Mock js-yaml module for YAML parsing
vi.mock('js-yaml', () => ({
    load: vi.fn(),
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
    mockLogger.verbose.mockClear();
    mockLogger.silly.mockClear();

    // Dynamically import dependencies needed *before* tests run, if any
    // For example, if the module under test imports logging at the top level.
    // We don't need to import logging itself here unless setup requires it.

    // Removed: vi.spyOn(Logging, 'getLogger').mockReturnValue(...);

    // Set up default storage mocks
    mockStorage.isDirectoryReadable.mockResolvedValue(true);
    mockStorage.isFileReadable.mockResolvedValue(false);
    mockStorage.exists.mockResolvedValue(false); // Default to no config file
    mockStorage.isDirectory.mockResolvedValue(true);
    mockStorage.isDirectoryWritable.mockResolvedValue(true);
    mockStorage.readFile.mockReset();
    mockStorage.writeFile.mockReset();
    mockStorage.createDirectory.mockReset();
    mockStorage.listFiles.mockReset();
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
                configDir: '/custom/config',
                cached: true,
                sendit: false,
                from: 'main',
                to: 'v1.0',
                // openaiApiKey is handled separately via environment variable only
            };

            const expectedConfig: Partial<Config> = {
                dryRun: true,
                verbose: false,
                debug: true,
                overrides: false,
                model: 'gpt-4',
                contextDirectories: ['src', 'lib'],
                configDirectory: '/custom/config',
                commit: {
                    cached: true,
                    sendit: false,
                },
                release: {
                    from: 'main',
                    to: 'v1.0',
                },
                review: {
                    sendit: false,
                }
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
        let mockCardigantimeInstance: Cardigantime<any>;
        let mockProgram: Command;
        let mockCommands: Record<string, any>;

        beforeEach(async () => {
            // Reset environment
            process.env = { ...originalEnv };
            process.env.OPENAI_API_KEY = 'test-api-key';

            // Create a proper command chain mock that matches Commander.js behavior
            const createMockCommand = (commandName: string) => {
                const mockCmd = {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                };
                // Make sure the mock command returns itself for chaining
                mockCmd.option.mockReturnValue(mockCmd);
                mockCmd.description.mockReturnValue(mockCmd);
                mockCmd.argument.mockReturnValue(mockCmd);
                mockCmd.configureHelp.mockReturnValue(mockCmd);
                return mockCmd;
            };

            // Create command mocks for each command type
            mockCommands = {
                commit: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [], // Add args property for positional arguments
                },
                release: createMockCommand('release'),
                publish: createMockCommand('publish'),
                link: createMockCommand('link'),
            };

            // Mock program with proper chaining
            mockProgram = {
                name: vi.fn().mockReturnThis(),
                summary: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                version: vi.fn().mockReturnThis(),
                command: vi.fn().mockImplementation((cmd: string) => {
                    return mockCommands[cmd as keyof typeof mockCommands] || mockCommands.commit;
                }),
                option: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['commit'], // Default to commit command
            } as unknown as Command;

            // Mock cardigantime instance
            mockCardigantimeInstance = {
                configure: vi.fn().mockResolvedValue(mockProgram),
                read: vi.fn().mockResolvedValue({}),
                validate: vi.fn().mockResolvedValue(undefined),
                checkConfig: vi.fn().mockResolvedValue(undefined),
                initConfig: vi.fn().mockResolvedValue(undefined),
                generateConfig: vi.fn().mockResolvedValue(undefined),
            } as unknown as Cardigantime<any>;

            // Mock Command constructor
            vi.mocked(Command).mockImplementation(() => mockProgram);

            // Set up default storage mocks
            mockStorage.isDirectoryReadable.mockResolvedValue(true);
            mockStorage.isFileReadable.mockResolvedValue(false);
            mockStorage.exists.mockResolvedValue(false); // Default to no config file
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(true);
            mockStorage.readFile.mockReset();
            mockStorage.writeFile.mockReset();
            mockStorage.createDirectory.mockReset();
            mockStorage.listFiles.mockReset();

            // Reset js-yaml mock
            const mockYaml = await import('js-yaml');
            vi.mocked(mockYaml.load).mockReset();
        });

        it('should integrate with cardigantime and merge configurations correctly', async () => {
            // Set up file config values
            const fileConfig: Partial<Config> = {
                model: 'gpt-4-from-file',
                verbose: true,
                contextDirectories: ['src'],
            };

            // Mock cardigantime.read to return the file config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(fileConfig);

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({ cached: true, sendit: false });

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // Verify cardigantime integration
            expect(mockCardigantimeInstance.configure).toHaveBeenCalledWith(mockProgram);

            // Verify merged configuration
            expect(config.model).toBe('gpt-4-from-file'); // From file
            expect(config.verbose).toBe(true); // From file
            expect(config.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun); // From defaults

            // Verify secure config
            expect(secureConfig.openaiApiKey).toBe('test-api-key');

            // Verify command config
            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle CLI overrides of file config', async () => {
            // File config
            const fileConfig: Partial<Config> = {
                model: 'gpt-4-from-file',
                verbose: false,
                dryRun: false,
            };

            // Mock cardigantime.read to return the file config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(fileConfig);

            // CLI args override
            (mockProgram.opts as Mock).mockReturnValue({
                model: 'gpt-4-from-cli',
                verbose: true,
            });

            // Mock the release command options
            mockCommands.release.opts.mockReturnValue({ from: 'main', to: 'develop' });
            mockProgram.args = ['release'];

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // CLI should override file config
            expect(config.model).toBe('gpt-4-from-cli'); // CLI override
            expect(config.verbose).toBe(true); // CLI override
            expect(config.dryRun).toBe(false); // From file (no CLI override)

            expect(commandConfig.commandName).toBe('release');
        });

        it('should handle configuration validation errors', async () => {
            // Test cardigantime.read throwing an error
            vi.mocked(mockCardigantimeInstance.read).mockRejectedValue(new Error('File read error'));

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('File read error');
        });

        it('should handle missing API key', async () => {
            // Mock no config file exists (empty fileValues)
            mockStorage.exists.mockResolvedValue(false);

            delete process.env.OPENAI_API_KEY;

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('OpenAI API key is required');
        });

        it('should handle complex configuration with all command types', async () => {
            const complexFileConfig: Partial<Config> = {
                model: 'gpt-4-turbo',
                contextDirectories: ['src', 'docs'],
                commit: { cached: true },
                release: { from: 'main' },
                publish: { mergeMethod: 'squash' },
                link: { scopeRoots: { '@test': '../' } },
            };

            // Mock cardigantime.read to return the file config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(complexFileConfig);

            // Mock link command options
            mockCommands.link.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
            });
            mockProgram.args = ['link'];

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            expect(config.model).toBe('gpt-4-turbo');
            expect(config.contextDirectories).toEqual(['src', 'docs']); // From file config, validated as readable
            expect(config.link?.scopeRoots).toEqual({'@test': '../test'}); // CLI overrides file
            expect(commandConfig.commandName).toBe('link');
        });

        it('should handle init-config command with early return', async () => {
            // Mock process.argv to include --init-config
            const originalArgv = process.argv;
            process.argv = ['node', 'main.js', '--init-config'];

            try {
                // Mock cardigantime.generateConfig
                const mockGenerateConfig = vi.fn().mockResolvedValue(undefined);
                (mockCardigantimeInstance as any).generateConfig = mockGenerateConfig;

                // Mock storage methods for config file creation
                mockStorage.exists.mockResolvedValueOnce(false); // Config dir doesn't exist
                mockStorage.exists.mockResolvedValueOnce(false); // Config file doesn't exist
                mockStorage.createDirectory.mockResolvedValue(undefined);
                mockStorage.writeFile.mockResolvedValue(undefined);

                const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

                // Verify generateConfig was called with default config directory
                expect(mockGenerateConfig).toHaveBeenCalledWith('.kodrdriv');

                // Verify command config
                expect(commandConfig.commandName).toBe('init-config');

                // Config should be minimal default values
                expect(config).toBeDefined();
                expect(secureConfig).toBeDefined();
            } finally {
                process.argv = originalArgv;
            }
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
            mockStorage.exists.mockClear();
            mockStorage.isDirectory.mockClear();
            mockStorage.isDirectoryWritable.mockClear();
            mockStorage.isDirectoryReadable.mockClear();
            mockStorage.isFileReadable.mockClear();
            mockStorage.readFile.mockClear();
            mockStorage.createDirectory.mockClear();
            mockStorage.listFiles.mockClear();

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

    describe('InputSchema', () => {
        it('should validate valid input with all fields', () => {
            const validInput = {
                dryRun: true,
                verbose: false,
                debug: true,
                overrides: false,

                model: 'gpt-4',
                contextDirectories: ['src', 'tests'],
                configDir: '/config',
                cached: true,
                add: false,
                sendit: true,
                from: 'main',
                to: 'develop',
                excludedPatterns: ['*.log', 'node_modules'],
                context: 'test context',
                messageLimit: 20,
                mergeMethod: 'squash' as const,
                scopeRoots: '{"@test": "../"}',
            };

            const result = InputSchema.parse(validInput);
            expect(result).toEqual(validInput);
        });

        it('should validate mergeMethod enum values', () => {
            const validMergeMethods = ['merge', 'squash', 'rebase'] as const;

            validMergeMethods.forEach(method => {
                const input = { mergeMethod: method };
                const result = InputSchema.parse(input);
                expect(result.mergeMethod).toBe(method);
            });
        });

        it('should reject invalid mergeMethod values', () => {
            const invalidInput = {
                mergeMethod: 'invalid-method',
            };

            expect(() => InputSchema.parse(invalidInput)).toThrow(ZodError);
        });

        it('should validate scopeRoots as string (JSON will be parsed later)', () => {
            const input = {
                scopeRoots: '{"@test": "../test", "@lib": "../lib"}',
            };

            const result = InputSchema.parse(input);
            expect(result.scopeRoots).toBe('{"@test": "../test", "@lib": "../lib"}');
        });


        it('should validate input with minimal fields', () => {
            const minimalInput = {};
            const result = InputSchema.parse(minimalInput);
            expect(result).toEqual({});
        });

        it('should validate input with optional arrays as empty', () => {
            const inputWithEmptyArrays = {
                contextDirectories: [],
                excludedPatterns: [],
            };
            const result = InputSchema.parse(inputWithEmptyArrays);
            expect(result).toEqual(inputWithEmptyArrays);
        });

        it('should reject invalid types', () => {
            const invalidInput = {
                dryRun: 'not-boolean',
                messageLimit: 'not-number',
                contextDirectories: 'not-array',
            };

            expect(() => InputSchema.parse(invalidInput)).toThrow(ZodError);
        });

        it('should handle undefined values gracefully', () => {
            const inputWithUndefined = {
                dryRun: undefined,
                model: undefined,
                contextDirectories: undefined,
            };
            const result = InputSchema.parse(inputWithUndefined);
            expect(result).toEqual({});
        });
    });



    describe('edge cases and error scenarios', () => {
        describe('transformCliArgs edge cases', () => {
            it('should handle context and messageLimit for both commit and release', () => {
                const cliArgs: Input = {
                    context: 'shared context',
                    messageLimit: 15,
                    cached: true, // This should trigger commit object creation
                    from: 'main', // This should trigger release object creation
                };

                const result = transformCliArgs(cliArgs);

                expect(result).toEqual({
                    commit: {
                        cached: true,
                        context: 'shared context',
                        messageLimit: 15,
                    },
                    release: {
                        from: 'main',
                        context: 'shared context',
                        messageLimit: 15,
                    },
                    review: {
                        "context": "shared context",
                    },
                });
            });

            it('should handle all commit-related options', () => {
                const cliArgs: Input = {
                    add: true,
                    cached: false,
                    sendit: true,
                    context: 'commit context',
                    messageLimit: 5,
                };

                const result = transformCliArgs(cliArgs);

                expect(result.commit).toEqual({
                    add: true,
                    cached: false,
                    sendit: true,
                    context: 'commit context',
                    messageLimit: 5,
                });
            });

            it('should handle all release-related options', () => {
                const cliArgs: Input = {
                    from: 'develop',
                    to: 'feature-branch',
                    context: 'release context',
                    messageLimit: 25,
                };

                const result = transformCliArgs(cliArgs);

                expect(result.release).toEqual({
                    from: 'develop',
                    to: 'feature-branch',
                    context: 'release context',
                    messageLimit: 25,
                });
            });

            it('should handle excludedPatterns correctly', () => {
                const cliArgs: Input = {
                    excludedPatterns: ['*.test.js', 'coverage/*'],
                };

                const result = transformCliArgs(cliArgs);

                expect(result.excludedPatterns).toEqual(['*.test.js', 'coverage/*']);
            });

            it('should handle publish command options', () => {
                const cliArgs: Input = {
                    mergeMethod: 'squash',
                };

                const result = transformCliArgs(cliArgs);

                expect(result.publish).toEqual({
                    mergeMethod: 'squash',
                });
            });

            it('should handle link command options with valid JSON scopeRoots', () => {
                const cliArgs: Input = {
                    scopeRoots: '{"@test": "../test", "@lib": "../lib"}',
                };

                const result = transformCliArgs(cliArgs);

                expect(result.link).toEqual({
                    scopeRoots: { "@test": "../test", "@lib": "../lib" },
                });
            });

            it('should throw error for invalid JSON in scopeRoots', () => {
                const cliArgs: Input = {
                    scopeRoots: '{"invalid": json}',
                };

                expect(() => transformCliArgs(cliArgs)).toThrow('Invalid JSON for scope-roots: {"invalid": json}');
            });


        });

        describe('validateCommand edge cases', () => {
            it('should handle empty string as invalid', () => {
                expect(() => validateCommand('')).toThrow();
            });

            it('should handle whitespace as invalid', () => {
                expect(() => validateCommand('  ')).toThrow();
                expect(() => validateCommand('\t')).toThrow();
                expect(() => validateCommand('\n')).toThrow();
            });

            it('should be case sensitive for all allowed commands', () => {
                ALLOWED_COMMANDS.forEach(cmd => {
                    expect(() => validateCommand(cmd.toUpperCase())).toThrow();
                    expect(() => validateCommand(cmd.charAt(0).toUpperCase() + cmd.slice(1))).toThrow();
                });
            });
        });

        describe('validateContextDirectories edge cases', () => {
            it('should handle mixed readable and error scenarios', async () => {
                mockStorage.isDirectoryReadable
                    .mockResolvedValueOnce(true)  // dir1 readable
                    .mockRejectedValueOnce(new Error('Network error')) // dir2 error
                    .mockResolvedValueOnce(false) // dir3 not readable
                    .mockResolvedValueOnce(true); // dir4 readable

                const inputDirs = ['dir1', 'dir2', 'dir3', 'dir4'];
                const result = await validateContextDirectories(inputDirs);

                expect(result).toEqual(['dir1', 'dir4']);
                expect(mockLogger.warn).toHaveBeenCalledTimes(2); // Once for error, once for not readable
            });

            it('should handle very long directory lists', async () => {
                const longDirList = Array.from({ length: 100 }, (_, i) => `dir${i}`);
                mockStorage.isDirectoryReadable.mockResolvedValue(true);

                const result = await validateContextDirectories(longDirList);

                expect(result).toEqual(longDirList);
                expect(mockStorage.isDirectoryReadable).toHaveBeenCalledTimes(100);
            });
        });
    });

    describe('getCliConfig', () => {
        let mockProgram: Command;
        let mockCommands: Record<string, any>;
        const mockReadStdin = vi.mocked(readStdin);

        beforeEach(() => {
            // Reset the mock to return null by default (no STDIN input)
            mockReadStdin.mockResolvedValue(null);
            // Create mock command objects for each command type
            mockCommands = {
                commit: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [], // Add args property for positional arguments
                },
                release: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                publish: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                link: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
            };

            // Make sure each command's option method returns itself for chaining
            Object.values(mockCommands).forEach(cmd => {
                cmd.option.mockReturnValue(cmd);
                cmd.description.mockReturnValue(cmd);
                cmd.argument.mockReturnValue(cmd);
                cmd.configureHelp.mockReturnValue(cmd);
            });

            mockProgram = {
                command: vi.fn().mockImplementation((cmdName: string) => {
                    return mockCommands[cmdName] || mockCommands.commit;
                }),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: [],
            } as unknown as Command;
        });

        it('should return default command when no args provided', async () => {
            mockProgram.args = [];
            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('commit'); // DEFAULT_COMMAND
            expect(cliArgs).toEqual({});
        });

        it('should handle commit command with options', async () => {
            mockProgram.args = ['commit'];

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle release command', async () => {
            mockProgram.args = ['release'];

            // Mock the release command options
            mockCommands.release.opts.mockReturnValue({ from: 'main', to: 'develop' });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('release');
        });

        it('should handle publish command', async () => {
            mockProgram.args = ['publish'];

            // Mock the publish command options
            mockCommands.publish.opts.mockReturnValue({ mergeMethod: 'squash' });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('publish');
        });

        it('should handle link command', async () => {
            mockProgram.args = ['link'];

            // Mock the link command options

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('link');
        });

        it('should throw error for invalid command', async () => {
            mockProgram.args = ['invalid'];

            await expect(getCliConfig(mockProgram)).rejects.toThrow('Invalid command: invalid');
        });

        it('should handle commit command with positional direction argument', async () => {
            mockProgram.args = ['commit'];

            // Mock the commit command args to include a positional direction argument
            mockCommands.commit.args = ['fix-performance-issues'];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('commit');
            // The direction should be extracted from positional args
            expect(cliArgs.direction).toBe('fix-performance-issues');
        });

        it('should handle commit command without positional direction argument', async () => {
            mockProgram.args = ['commit'];

            // Mock the commit command with empty args
            mockCommands.commit.args = [];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('commit');
            // Direction should be undefined when no positional arg provided
            expect(cliArgs.direction).toBeUndefined();
        });

        it('should handle commit command with STDIN direction input', async () => {
            // Mock readStdin to return test input
            mockReadStdin.mockResolvedValue('fix performance issues from STDIN');

            mockProgram.args = ['commit'];
            mockCommands.commit.args = [];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe('fix performance issues from STDIN');
        });

        it('should prioritize STDIN over positional argument for direction', async () => {
            // Mock readStdin to return test input
            mockReadStdin.mockResolvedValue('STDIN direction takes precedence');

            mockProgram.args = ['commit'];
            mockCommands.commit.args = ['positional-direction'];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram);

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe('STDIN direction takes precedence');
        });
    });

    describe('validateAndProcessSecureOptions', () => {
        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        it('should return SecureConfig with API key from environment', async () => {
            process.env.OPENAI_API_KEY = 'test-api-key';

            const result = await validateAndProcessSecureOptions();

            expect(result).toEqual({
                openaiApiKey: 'test-api-key',
            });
        });

        it('should throw error when API key is missing', async () => {
            delete process.env.OPENAI_API_KEY;

            await expect(validateAndProcessSecureOptions()).rejects.toThrow(
                'OpenAI API key is required. Please set the OPENAI_API_KEY environment variable.'
            );
        });

        it('should handle empty string API key as missing', async () => {
            process.env.OPENAI_API_KEY = '';

            await expect(validateAndProcessSecureOptions()).rejects.toThrow(
                'OpenAI API key is required'
            );
        });
    });

    describe('validateAndProcessOptions', () => {
        beforeEach(() => {
            // Reset all storage mocks
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    mock.mockReset();
                }
            });

            // Set up default mocks
            mockStorage.isDirectoryReadable.mockResolvedValue(true);
            mockStorage.isFileReadable.mockResolvedValue(false); // Default to treating instructions as content
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(true);
        });

        it('should process options with all defaults', async () => {
            const options: Partial<Config> = {};

            const result = await validateAndProcessOptions(options);

            expect(result.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun);
            expect(result.verbose).toBe(KODRDRIV_DEFAULTS.verbose);
            expect(result.debug).toBe(KODRDRIV_DEFAULTS.debug);
            expect(result.model).toBe(KODRDRIV_DEFAULTS.model);
            expect(result.contextDirectories).toEqual([]);

        });

        it('should merge provided options with defaults', async () => {
            const options: Partial<Config> = {
                dryRun: true,
                verbose: true,
                model: 'gpt-4',
                contextDirectories: ['src', 'tests'],
                commit: {
                    cached: true,
                    sendit: false,
                },
                release: {
                    from: 'main',
                    to: 'develop',
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.dryRun).toBe(true);
            expect(result.verbose).toBe(true);
            expect(result.model).toBe('gpt-4');
            expect(result.commit?.cached).toBe(true);
            expect(result.commit?.sendit).toBe(false);
            expect(result.release?.from).toBe('main');
            expect(result.release?.to).toBe('develop');
        });

        it('should handle partial command configurations', async () => {
            const options: Partial<Config> = {
                commit: {
                    cached: true,
                    // other fields should use defaults
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.commit?.cached).toBe(true);
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add);
            expect(result.commit?.sendit).toBe(KODRDRIV_DEFAULTS.commit.sendit);
        });

        it('should process instructions from file content', async () => {
            const instructionsContent = '# Custom instructions\nThis is custom content.';
            mockStorage.isFileReadable.mockResolvedValue(true);
            mockStorage.readFile.mockResolvedValue(instructionsContent);

            const options: Partial<Config> = {
                contextDirectories: ['src'],
            };

            const result = await validateAndProcessOptions(options);

            expect(result.contextDirectories).toEqual(['src']);
        });

        it('should handle link command options correctly', async () => {
            const options: Partial<Config> = {
                link: {
                    scopeRoots: { "@test": "../test" },
                    dryRun: true,
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.link?.scopeRoots).toEqual({ "@test": "../test" });
            expect(result.link?.dryRun).toBe(true);
        });

        it('should handle publish command options correctly', async () => {
            const options: Partial<Config> = {
                publish: {
                    mergeMethod: 'rebase',
                    dependencyUpdatePatterns: ['package*.json'],
                    requiredEnvVars: ['CUSTOM_VAR'],
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.publish?.mergeMethod).toBe('rebase');
            expect(result.publish?.dependencyUpdatePatterns).toEqual(['package*.json']);
            expect(result.publish?.requiredEnvVars).toEqual(['CUSTOM_VAR']);
        });
    });

    describe('validateConfigDir', () => {
        beforeEach(() => {
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    mock.mockReset();
                }
            });
            // Clear logger mocks
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
            mockLogger.verbose.mockClear();
        });

        it('should return absolute path when directory exists and is writable', async () => {
            const configDir = './config';
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(true);

            const result = await validateConfigDir(configDir);

            expect(result).toMatch(/config$/);
            expect(mockStorage.exists).toHaveBeenCalled();
            expect(mockStorage.isDirectory).toHaveBeenCalled();
            expect(mockStorage.isDirectoryWritable).toHaveBeenCalled();
        });

        it('should warn and fall back to defaults when directory does not exist', async () => {
            const configDir = './new-config';
            mockStorage.exists.mockResolvedValue(false);

            const result = await validateConfigDir(configDir);

            expect(result).toMatch(/new-config$/);
            expect(mockStorage.exists).toHaveBeenCalled();
            expect(mockStorage.createDirectory).not.toHaveBeenCalled();
            expect(mockStorage.isDirectoryWritable).not.toHaveBeenCalled();
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Config directory does not exist'));
            expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Using default configuration'));
        });

        it('should throw error when path exists but is not a directory', async () => {
            const configDir = './not-a-directory';
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(false);

            await expect(validateConfigDir(configDir)).rejects.toThrow('Config directory is not a directory');
        });

        it('should throw error when directory is not writable', async () => {
            const configDir = './readonly-config';
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(false);

            await expect(validateConfigDir(configDir)).rejects.toThrow('Config directory is not writable');
        });

        it('should handle storage errors gracefully', async () => {
            const configDir = './error-config';
            const storageError = new Error('Storage system failure');
            mockStorage.exists.mockRejectedValue(storageError);

            await expect(validateConfigDir(configDir)).rejects.toThrow('Failed to validate config directory');
            expect(mockStorage.exists).toHaveBeenCalled();
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to validate config directory'),
                storageError
            );
        });

        it('should handle absolute paths correctly', async () => {
            const absolutePath = '/absolute/config/path';
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(true);

            const result = await validateConfigDir(absolutePath);

            expect(result).toBe(absolutePath);
        });
    });

    describe('integration scenarios', () => {
        it('should handle complete configuration transformation with all command types', () => {
            const complexCliArgs: Input = {
                dryRun: true,
                verbose: true,
                debug: false,
                overrides: true,
                model: 'gpt-4-turbo',
                contextDirectories: ['src', 'docs', 'tests'],
                configDir: '/custom/config',
                add: true,
                cached: false,
                sendit: true,
                from: 'release/v1.0',
                to: 'release/v2.0',
                excludedPatterns: ['*.log', '*.tmp', 'node_modules/*'],
                context: 'Major release preparation',
                messageLimit: 50,
                mergeMethod: 'rebase',
                scopeRoots: '{"@core": "../core", "@utils": "../utils"}',
            };

            const expectedConfig: Partial<Config> = {
                dryRun: true,
                verbose: true,
                debug: false,
                overrides: true,
                model: 'gpt-4-turbo',
                contextDirectories: ['src', 'docs', 'tests'],
                configDirectory: '/custom/config',
                commit: {
                    add: true,
                    cached: false,
                    sendit: true,
                    context: 'Major release preparation',
                    messageLimit: 50,
                },
                release: {
                    from: 'release/v1.0',
                    to: 'release/v2.0',
                    context: 'Major release preparation',
                    messageLimit: 50,
                },
                review: {
                    context: "Major release preparation",
                    sendit: true,
                },
                publish: {
                    mergeMethod: 'rebase',
                },
                publishTree: {
                    excludedPatterns: ['*.log', '*.tmp', 'node_modules/*'],
                },
                link: {
                    scopeRoots: { "@core": "../core", "@utils": "../utils" },
                },
                excludedPatterns: ['*.log', '*.tmp', 'node_modules/*'],
            };

            const result = transformCliArgs(complexCliArgs);
            expect(result).toEqual(expectedConfig);
        });

        it('should validate all allowed commands are handled by validateCommand', () => {
            ALLOWED_COMMANDS.forEach(command => {
                expect(() => validateCommand(command)).not.toThrow();
                expect(validateCommand(command)).toBe(command);
            });
        });
    });

    describe('check-config functionality', () => {
        it('should detect check-config command from process.argv', () => {
            // Mock process.argv to include --check-config
            const originalArgv = process.argv;
            process.argv = ['node', 'main.js', '--check-config'];

            try {
                const isCheckConfig = process.argv.includes('--check-config');
                expect(isCheckConfig).toBe(true);
            } finally {
                process.argv = originalArgv;
            }
        });

        it('should validate secure options without throwing for check-config', async () => {
            // Mock process.argv to include --check-config
            const originalArgv = process.argv;
            const originalApiKey = process.env.OPENAI_API_KEY;

            process.argv = ['node', 'main.js', '--check-config'];
            delete process.env.OPENAI_API_KEY;

            try {
                const result = await validateAndProcessSecureOptions();
                expect(result.openaiApiKey).toBeUndefined();
            } finally {
                process.argv = originalArgv;
                if (originalApiKey) {
                    process.env.OPENAI_API_KEY = originalApiKey;
                }
            }
        });
    });

    describe('init-config functionality', () => {
        it('should detect init-config command from process.argv', () => {
            // Mock process.argv to include --init-config
            const originalArgv = process.argv;
            process.argv = ['node', 'main.js', '--init-config'];

            try {
                const isInitConfig = process.argv.includes('--init-config');
                expect(isInitConfig).toBe(true);
            } finally {
                process.argv = originalArgv;
            }
        });

        it('should validate secure options without throwing for init-config', async () => {
            // Mock process.argv to include --init-config
            const originalArgv = process.argv;
            const originalApiKey = process.env.OPENAI_API_KEY;

            process.argv = ['node', 'main.js', '--init-config'];
            delete process.env.OPENAI_API_KEY;

            try {
                const result = await validateAndProcessSecureOptions();
                expect(result.openaiApiKey).toBeUndefined();
            } finally {
                process.argv = originalArgv;
                if (originalApiKey) {
                    process.env.OPENAI_API_KEY = originalApiKey;
                }
            }
        });
    });
});
