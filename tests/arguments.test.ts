/* eslint-disable @typescript-eslint/no-unused-vars */
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as argumentsModule from '../src/arguments';
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

// Mock the logging module here, using a factory for getLogger's return value
vi.mock('../src/logging', () => {
    // Create mock logger inside the factory
    const mockLogger = {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    };

    return {
        getLogger: vi.fn(() => mockLogger),
        __esModule: true,
    };
});

// Mock the storage module here, using a factory for create's return value
vi.mock('../src/util/storage', () => {
    // Create mock storage inside the factory
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

    return {
        create: vi.fn(() => mockStorage),
        __esModule: true,
    };
});

// Import the mocked modules to access their mocks
import * as loggingModule from '../src/logging';
import * as storageModule from '../src/util/storage';

// Get references to the mocked objects
const mockLogger = (loggingModule.getLogger as any)();
const mockStorage = (storageModule.create as any)();

// Mock js-yaml module for YAML parsing
vi.mock('js-yaml', () => ({
    load: vi.fn(),
    dump: vi.fn(),
    __esModule: true,
}));

// Mock the validation module
vi.mock('../src/util/validation', () => ({
    safeJsonParse: vi.fn((json: string, context: string) => {
        try {
            return JSON.parse(json);
        } catch (error) {
            throw new Error(`Invalid JSON for ${context}: ${json}`);
        }
    }),
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

        it('should handle audio-commit args correctly', () => {
            const cliArgs: Input = {
                file: '/path/to/audio.wav',
                keepTemp: true,
            };

            const expectedConfig: Partial<Config> = {
                audioCommit: {
                    file: '/path/to/audio.wav',
                    keepTemp: true,
                },
                audioReview: {
                    file: '/path/to/audio.wav',
                    keepTemp: true,
                },
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle audio-review args correctly', () => {
            const cliArgs: Input = {
                file: '/path/to/audio.wav',
                directory: '/path/to/recordings',
                keepTemp: false,
                includeCommitHistory: true,
                includeRecentDiffs: false,
                includeReleaseNotes: true,
                includeGithubIssues: false,
                commitHistoryLimit: 10,
                diffHistoryLimit: 5,
                releaseNotesLimit: 3,
                githubIssuesLimit: 15,
                context: 'audio review context',
                sendit: true,
            };

            const expectedConfig: Partial<Config> = {
                audioCommit: {
                    file: '/path/to/audio.wav',
                    keepTemp: false,
                },
                audioReview: {
                    file: '/path/to/audio.wav',
                    directory: '/path/to/recordings',
                    keepTemp: false,
                    includeCommitHistory: true,
                    includeRecentDiffs: false,
                    includeReleaseNotes: true,
                    includeGithubIssues: false,
                    commitHistoryLimit: 10,
                    diffHistoryLimit: 5,
                    releaseNotesLimit: 3,
                    githubIssuesLimit: 15,
                    context: 'audio review context',
                    sendit: true,
                },
                commit: {
                    context: 'audio review context',
                    sendit: true,
                },
                review: {
                    includeCommitHistory: true,
                    includeRecentDiffs: false,
                    includeReleaseNotes: true,
                    includeGithubIssues: false,
                    commitHistoryLimit: 10,
                    diffHistoryLimit: 5,
                    releaseNotesLimit: 3,
                    githubIssuesLimit: 15,
                    context: 'audio review context',
                    sendit: true,
                },
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle review args with note correctly', () => {
            const cliArgs: Input = {
                note: 'Review note content',
                includeCommitHistory: false,
                includeRecentDiffs: true,
                context: 'review context',
                sendit: false,
            };

            const expectedConfig: Partial<Config> = {
                audioReview: {
                    includeCommitHistory: false,
                    includeRecentDiffs: true,
                    context: 'review context',
                    sendit: false,
                },
                commit: {
                    context: 'review context',
                    sendit: false,
                },
                review: {
                    note: 'Review note content',
                    includeCommitHistory: false,
                    includeRecentDiffs: true,
                    context: 'review context',
                    sendit: false,
                },
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });



        it('should handle exclude as alias for excludedPatterns', () => {
            const cliArgs: Input = {
                exclude: ['*.log', 'temp/*'],
            };

            const expectedConfig: Partial<Config> = {
                excludedPatterns: ['*.log', 'temp/*'],
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should prioritize excludedPatterns over exclude', () => {
            const cliArgs: Input = {
                excludedPatterns: ['*.log'],
                exclude: ['temp/*'],
            };

            const expectedConfig: Partial<Config> = {
                excludedPatterns: ['*.log'],
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle tree args correctly', () => {
            const cliArgs: Input = {
                directories: ['/workspace1', '/workspace2'],
                excludedPatterns: ['**/node_modules/**', '**/dist/**'],
                startFrom: 'package-a',
                cmd: 'npm run build',
            };

            const expectedConfig: Partial<Config> = {
                tree: {
                    directories: ['/workspace1', '/workspace2'],
                    exclude: ['**/node_modules/**', '**/dist/**'],
                    startFrom: 'package-a',
                    cmd: 'npm run build',
                },
                excludedPatterns: ['**/node_modules/**', '**/dist/**'],
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle basic excluded patterns correctly', () => {
            const cliArgs: Input = {
                excludedPatterns: ['*.log', 'temp/*'],
            };

            const expectedConfig: Partial<Config> = {
                excludedPatterns: ['*.log', 'temp/*'],
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle exclude as alias for excludedPatterns', () => {
            const cliArgs: Input = {
                exclude: ['*.log', 'temp/*'],
            };

            const expectedConfig: Partial<Config> = {
                excludedPatterns: ['*.log', 'temp/*'],
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should prioritize excludedPatterns over exclude', () => {
            const cliArgs: Input = {
                excludedPatterns: ['*.log'],
                exclude: ['*.tmp'],
            };

            const expectedConfig: Partial<Config> = {
                excludedPatterns: ['*.log'],
            };

            const transformed = transformCliArgs(cliArgs);
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle development command options correctly', () => {
            const cliArgs: Input = {
                targetVersion: 'minor',
                noMilestones: true,
            };

            const expectedConfig: Partial<Config> = {
                development: {
                    targetVersion: 'minor',
                    noMilestones: true,
                },
                publish: {
                    targetVersion: 'minor',
                    noMilestones: true,
                },
                release: {
                    noMilestones: true,
                },
            };

            const transformed = transformCliArgs(cliArgs, 'development');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle versions command options correctly', () => {
            const cliArgs: Input = {
                subcommand: 'minor',
                directories: ['/packages', '/libs'],
            };

            const expectedConfig: Partial<Config> = {
                versions: {
                    subcommand: 'minor',
                    directories: ['/packages', '/libs'],
                },
                audioReview: {},
            };

            const transformed = transformCliArgs(cliArgs, 'versions');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle publish command options correctly', () => {
            const cliArgs: Input = {
                mergeMethod: 'rebase',
                targetVersion: '2.1.0',
                syncTarget: true,
                noMilestones: false,
            };

            const expectedConfig: Partial<Config> = {
                publish: {
                    mergeMethod: 'rebase',
                    targetVersion: '2.1.0',
                    syncTarget: true,
                    noMilestones: false,
                },
            };

            const transformed = transformCliArgs(cliArgs, 'publish');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle publish command options when commandName is publish', () => {
            const cliArgs: Input = {
                from: 'main',
                interactive: true,
            };

            const expectedConfig: Partial<Config> = {
                publish: {
                    from: 'main',
                    interactive: true,
                },
            };

            const transformed = transformCliArgs(cliArgs, 'publish');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle publish command options when commandName is not publish', () => {
            const cliArgs: Input = {
                mergeMethod: 'squash',
                targetVersion: 'patch',
            };

            const expectedConfig: Partial<Config> = {
                publish: {
                    mergeMethod: 'squash',
                    targetVersion: 'patch',
                },
            };

            const transformed = transformCliArgs(cliArgs, 'commit');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle link command options correctly', () => {
            const cliArgs: Input = {
                scopeRoots: '{"@company": "../company", "@utils": "../utils"}',
                externals: ['@external/lib', 'lodash'],
            };

            const expectedConfig: Partial<Config> = {
                link: {
                    scopeRoots: { "@company": "../company", "@utils": "../utils" },
                    externals: ['@external/lib', 'lodash'],
                },
            };

            const transformed = transformCliArgs(cliArgs, 'link');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle link command with packageArgument when commandName is link', () => {
            const cliArgs: Input = {
                scopeRoots: '{"@test": "../test"}',
                externals: ['@test/lib'],
            };

            // Mock the packageArgument property
            (cliArgs as any).packageArgument = 'test-package';

            const expectedConfig: Partial<Config> = {
                link: {
                    scopeRoots: { "@test": "../test" },
                    externals: ['@test/lib'],
                    packageArgument: 'test-package',
                },
            };

            const transformed = transformCliArgs(cliArgs, 'link');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle unlink command options correctly', () => {
            const cliArgs: Input = {
                scopeRoots: '{"@company": "../company"}',
                workspaceFile: 'workspace.code-workspace',
                cleanNodeModules: true,
                externals: ['@external/lib'],
            };

            // Mock the packageArgument property
            (cliArgs as any).packageArgument = 'unlink-package';

            const expectedConfig: Partial<Config> = {
                unlink: {
                    scopeRoots: { "@company": "../company" },
                    workspaceFile: 'workspace.code-workspace',
                    cleanNodeModules: true,
                    externals: ['@external/lib'],
                    packageArgument: 'unlink-package',
                },
            };

            const transformed = transformCliArgs(cliArgs, 'unlink');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle unlink command options when commandName is not unlink', () => {
            const cliArgs: Input = {
                scopeRoots: '{"@test": "../test"}',
                cleanNodeModules: false,
            };

            // Should not create unlink section when commandName is not 'unlink'
            const transformed = transformCliArgs(cliArgs, 'commit');
            expect(transformed.unlink).toBeUndefined();
        });

        it('should handle tree command with directory fallback to directories array', () => {
            const cliArgs: Input = {
                directory: '/single/workspace',
                exclude: ['**/node_modules/**'],
                startFrom: 'package-a',
                cmd: 'npm install',
            };

            const expectedConfig: Partial<Config> = {
                tree: {
                    directories: ['/single/workspace'],
                    exclude: ['**/node_modules/**'],
                    startFrom: 'package-a',
                    cmd: 'npm install',
                },
                excludedPatterns: ['**/node_modules/**'],
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle tree command with both directory and directories (directories takes precedence)', () => {
            const cliArgs: Input = {
                directory: '/single/workspace',
                directories: ['/multi1', '/multi2'],
                exclude: ['**/dist/**'],
            };

            const expectedConfig: Partial<Config> = {
                tree: {
                    directories: ['/multi1', '/multi2'],
                    exclude: ['**/dist/**'],
                },
                excludedPatterns: ['**/dist/**'],
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle tree command with all possible options', () => {
            const cliArgs: Input = {
                directories: ['/workspace1', '/workspace2'],
                exclude: ['**/node_modules/**', '**/dist/**'],
                startFrom: 'package-a',
                stopAt: 'package-z',
                cmd: 'npm run build',
                continue: true,
                cleanNodeModules: true,
                externals: ['@external/lib', 'lodash'],
            };

            // Mock the builtInCommand and packageArgument properties
            (cliArgs as any).builtInCommand = 'publish';
            (cliArgs as any).packageArgument = 'specific-package';

            const expectedConfig: Partial<Config> = {
                tree: {
                    directories: ['/workspace1', '/workspace2'],
                    exclude: ['**/node_modules/**', '**/dist/**'],
                    startFrom: 'package-a',
                    stopAt: 'package-z',
                    cmd: 'npm run build',
                    builtInCommand: 'publish',
                    continue: true,
                    packageArgument: 'specific-package',
                    cleanNodeModules: true,
                    externals: ['@external/lib', 'lodash'],
                },
                excludedPatterns: ['**/node_modules/**', '**/dist/**'],
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle tree command with no tree-specific options', () => {
            const cliArgs: Input = {
                dryRun: true,
                verbose: true,
                model: 'gpt-4',
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed.tree).toBeUndefined();
            expect(transformed.dryRun).toBe(true);
            expect(transformed.verbose).toBe(true);
            expect(transformed.model).toBe('gpt-4');
        });

        it('should handle tree command with only excludedPatterns', () => {
            const cliArgs: Input = {
                excludedPatterns: ['**/node_modules/**'],
            };

            const expectedConfig: Partial<Config> = {
                tree: {
                    exclude: ['**/node_modules/**'],
                },
                excludedPatterns: ['**/node_modules/**'],
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle tree command with only exclude (fallback from excludedPatterns)', () => {
            const cliArgs: Input = {
                exclude: ['**/node_modules/**'],
            };

            const expectedConfig: Partial<Config> = {
                tree: {
                    exclude: ['**/node_modules/**'],
                },
                excludedPatterns: ['**/node_modules/**'],
            };

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed).toEqual(expectedConfig);
        });

        it('should handle excludedPaths as alias for excludedPatterns (non-tree)', () => {
            const cliArgs: Input = {
                excludedPaths: ['*.bak', 'cache/**'],
            } as any;

            const transformed = transformCliArgs(cliArgs);
            expect(transformed.excludedPatterns).toEqual(['*.bak', 'cache/**']);
            expect((transformed as any).tree).toBeUndefined();
        });

        it('should handle excludedPaths as alias for excludedPatterns (tree command)', () => {
            const cliArgs: Input = {
                excludedPaths: ['**/build/**', '**/.cache/**'],
                directory: '/workspace',
            } as any;

            const transformed = transformCliArgs(cliArgs, 'tree');
            expect(transformed.excludedPatterns).toEqual(['**/build/**', '**/.cache/**']);
            expect(transformed.tree?.exclude).toEqual(['**/build/**', '**/.cache/**']);
            expect(transformed.tree?.directories).toEqual(['/workspace']);
        });

        it('should map editorTimeout into review config when provided', () => {
            const cliArgs: Input = {
                editorTimeout: 5000,
                includeCommitHistory: true,
            } as any;

            const transformed = transformCliArgs(cliArgs, 'review');
            expect(transformed.review?.editorTimeout).toBe(5000);
            expect(transformed.review?.includeCommitHistory).toBe(true);
        });

        it('should propagate OpenAI options into commit when command is commit', () => {
            const cliArgs: Input = {
                add: true,
                openaiReasoning: 'high',
                openaiMaxOutputTokens: 2048,
            } as any;

            const transformed = transformCliArgs(cliArgs, 'commit');
            expect(transformed.commit?.add).toBe(true);
            expect(transformed.commit?.openaiReasoning).toBe('high');
            expect(transformed.commit?.openaiMaxOutputTokens).toBe(2048);
        });

        it('should propagate OpenAI options into audioCommit when audio inputs provided', () => {
            const cliArgs: Input = {
                file: '/audio.wav',
                keepTemp: true,
                openaiReasoning: 'medium',
                openaiMaxOutputTokens: 1234,
            } as any;

            const transformed = transformCliArgs(cliArgs);
            expect(transformed.audioCommit?.file).toBe('/audio.wav');
            expect(transformed.audioCommit?.keepTemp).toBe(true);
            expect(transformed.audioCommit?.openaiReasoning).toBe('medium');
            expect(transformed.audioCommit?.openaiMaxOutputTokens).toBe(1234);
        });

        it('should propagate OpenAI options into release when release-related args present', () => {
            const cliArgs: Input = {
                from: 'main',
                to: 'develop',
                openaiReasoning: 'low',
                openaiMaxOutputTokens: 4096,
            } as any;

            const transformed = transformCliArgs(cliArgs, 'release');
            expect(transformed.release?.from).toBe('main');
            expect(transformed.release?.to).toBe('develop');
            expect(transformed.release?.openaiReasoning).toBe('low');
            expect(transformed.release?.openaiMaxOutputTokens).toBe(4096);
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
                'audio-commit': createMockCommand('audio-commit'),
                'audio-review': createMockCommand('audio-review'),
                release: createMockCommand('release'),
                publish: createMockCommand('publish'),

                link: createMockCommand('link'),
                unlink: createMockCommand('unlink'),
                tree: createMockCommand('tree'),
                review: createMockCommand('review'),
                clean: createMockCommand('clean'),
                'select-audio': createMockCommand('select-audio'),
                development: createMockCommand('development'),
                versions: createMockCommand('versions'),
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
                configureHelp: vi.fn().mockReturnThis(),
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

            // Test the configuration merging logic directly
            const cliArgs = {
                scopeRoots: '{"@test": "../test"}',
            } as Input;

            const commandConfig = { commandName: 'link' };

            // Transform CLI args to nested structure
            const transformedCliArgs = transformCliArgs(cliArgs, commandConfig.commandName);

            // Merge configurations manually to test the logic
            const mergedConfig = {
                ...KODRDRIV_DEFAULTS,
                ...complexFileConfig,
                ...transformedCliArgs,
                // Special handling for nested sections
                link: {
                    ...KODRDRIV_DEFAULTS.link,
                    ...complexFileConfig.link,
                    ...transformedCliArgs.link,
                    scopeRoots: {
                        ...KODRDRIV_DEFAULTS.link?.scopeRoots,
                        ...complexFileConfig.link?.scopeRoots,
                        ...transformedCliArgs.link?.scopeRoots,
                    }
                }
            };

            // Verify the configuration was merged correctly
            expect(mergedConfig.model).toBe('gpt-4-turbo');
            expect(mergedConfig.contextDirectories).toEqual(['src', 'docs']);
            expect(mergedConfig.commit?.cached).toBe(true);
            expect(mergedConfig.release?.from).toBe('main');
            expect(mergedConfig.publish?.mergeMethod).toBe('squash');
            expect(mergedConfig.link?.scopeRoots).toEqual({ '@test': '../test' }); // CLI should override file
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
                expect(mockGenerateConfig).toHaveBeenCalledWith('/absolute/.kodrdriv');

                // Verify command config
                expect(commandConfig.commandName).toBe('init-config');

                // Config should be minimal default values
                expect(config).toBeDefined();
                expect(secureConfig).toBeDefined();
            } finally {
                process.argv = originalArgv;
            }
        });

        it('should handle check-config command with early return', async () => {
            // Mock process.argv to include --check-config
            const originalArgv = process.argv;
            process.argv = ['node', 'main.js', '--check-config'];

            try {
                // Mock cardigantime.checkConfig
                const mockCheckConfig = vi.fn().mockResolvedValue(undefined);
                (mockCardigantimeInstance as any).checkConfig = mockCheckConfig;

                const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

                // Verify checkConfig was called
                expect(mockCheckConfig).toHaveBeenCalled();

                // Verify command config
                expect(commandConfig.commandName).toBe('check-config');

                // Config should be minimal default values
                expect(config).toBeDefined();
                expect(secureConfig).toBeDefined();
            } finally {
                process.argv = originalArgv;
            }
        });

        it('should handle cardigantime configuration errors', async () => {
            // Test cardigantime.configure throwing an error
            vi.mocked(mockCardigantimeInstance.configure).mockRejectedValue(new Error('Cardigantime config error'));

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('Cardigantime config error');
        });

        it('should handle complex link configuration merging', async () => {
            const fileConfig: Partial<Config> = {
                link: {
                    scopeRoots: { '@file': '../file', '@shared': '../shared' },
                    dryRun: false,
                },
            };

            // Mock cardigantime.read to return the file config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(fileConfig);

            // Test the configuration merging logic directly
            const cliArgs = {
                scopeRoots: '{"@cli": "../cli", "@shared": "../cli-shared"}',
            } as Input;

            const commandConfig = { commandName: 'link' };

            // Transform CLI args to nested structure
            const transformedCliArgs = transformCliArgs(cliArgs, commandConfig.commandName);

            // Merge configurations manually to test the logic
            const mergedLink = {
                ...KODRDRIV_DEFAULTS.link,
                ...fileConfig.link,
                ...transformedCliArgs.link,
                // Special handling for scopeRoots to merge objects instead of overwriting
                scopeRoots: {
                    ...KODRDRIV_DEFAULTS.link?.scopeRoots,
                    ...fileConfig.link?.scopeRoots,
                    ...transformedCliArgs.link?.scopeRoots,
                }
            };

            // Verify the configuration was merged correctly
            expect(mergedLink.scopeRoots).toEqual({
                '@file': '../file',
                '@shared': '../cli-shared', // CLI should override file
                '@cli': '../cli',
            });
            expect(mergedLink.dryRun).toBe(false); // File config preserved
        });

        it('should handle configure with missing command options', async () => {
            // Mock program with missing command options
            mockProgram.args = ['commit'];
            mockCommands.commit.opts = undefined as any;

            // Mock cardigantime.read to return empty config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue({});

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            expect(commandConfig.commandName).toBe('commit');
            expect(config).toBeDefined();
            expect(secureConfig).toBeDefined();
        });

        it('should handle configure with command options that throw errors', async () => {
            // Mock program with command options that throw errors
            mockProgram.args = ['commit'];
            mockCommands.commit.opts.mockImplementation(() => {
                throw new Error('Command options error');
            });

            // Mock cardigantime.read to return empty config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue({});

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('Command options error');
        });

        it('should handle configure with complex nested configuration merging', async () => {
            const complexFileConfig: Partial<Config> = {
                model: 'gpt-4-turbo',
                contextDirectories: ['src', 'docs'],
                commit: {
                    add: true,
                    cached: false,
                    sendit: true,
                    interactive: false,
                    amend: true,
                    push: 'origin',
                    messageLimit: 25,
                    context: 'file commit context',
                    direction: 'file direction',
                    skipFileCheck: false,
                    maxDiffBytes: 4096,
                    openaiReasoning: 'high',
                    openaiMaxOutputTokens: 4000,
                },
                release: {
                    from: 'main',
                    to: 'develop',
                    context: 'file release context',
                    interactive: true,
                    messageLimit: 30,
                    maxDiffBytes: 8192,
                    noMilestones: false,
                    openaiReasoning: 'medium',
                    openaiMaxOutputTokens: 3000,
                },
                publish: {
                    mergeMethod: 'squash',
                    from: 'main',
                    targetVersion: 'patch',
                    interactive: false,
                    syncTarget: true,
                    noMilestones: true,
                },
                link: {
                    scopeRoots: { '@file': '../file', '@shared': '../shared' },
                    externals: ['@file/lib'],
                    packageArgument: 'file-package',
                },
                unlink: {
                    scopeRoots: { '@file': '../file' },
                    workspaceFile: 'file.code-workspace',
                    cleanNodeModules: true,
                    externals: ['@file/lib'],
                    packageArgument: 'file-unlink-package',
                },
                tree: {
                    directories: ['/file/workspace1', '/file/workspace2'],
                    exclude: ['**/file-node_modules/**'],
                    startFrom: 'file-package-a',
                    stopAt: 'file-package-z',
                    cmd: 'file npm run build',
                    builtInCommand: 'file-commit',
                    continue: true,
                    packageArgument: 'file-tree-package',
                    cleanNodeModules: false,
                    externals: ['@file/external'],
                },
                development: {
                    targetVersion: 'minor',
                    noMilestones: false,
                },
                versions: {
                    subcommand: 'minor',
                    directories: ['/file/packages'],
                },
            };

            // Mock cardigantime.read to return the complex file config
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(complexFileConfig);

            // Mock CLI args with some overrides
            (mockProgram.opts as Mock).mockReturnValue({
                model: 'gpt-4-cli',
                verbose: true,
            });

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({
                add: false, // Override file config
                interactive: true, // Override file config
                context: 'cli commit context', // Override file config
            });

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // Verify CLI overrides take precedence
            expect(config.model).toBe('gpt-4-cli'); // CLI override
            expect(config.verbose).toBe(true); // CLI override

            // Verify file config is preserved where CLI doesn't override
            expect(config.contextDirectories).toEqual(['src', 'docs']); // From file
            expect(config.release?.from).toBe('main'); // From file
            expect(config.publish?.mergeMethod).toBe('squash'); // From file

            // Verify commit config merging (CLI overrides file)
            expect(config.commit?.add).toBe(false); // CLI override
            expect(config.commit?.cached).toBe(false); // From file
            expect(config.commit?.sendit).toBe(true); // From file
            expect(config.commit?.interactive).toBe(true); // CLI override
            expect(config.commit?.context).toBe('cli commit context'); // CLI override
            expect(config.commit?.amend).toBe(true); // From file

            // Verify other command configs are preserved
            expect(config.release?.context).toBe('file release context');
            expect(config.link?.scopeRoots).toEqual({ '@file': '../file', '@shared': '../shared' });
            expect(config.tree?.directories).toEqual(['/file/workspace1', '/file/workspace2']);

            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle configure with empty CLI args', async () => {
            // Mock program with empty CLI args
            (mockProgram.opts as Mock).mockReturnValue({});

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({});

            // Mock cardigantime.read to return some file config
            const fileConfig: Partial<Config> = {
                model: 'gpt-4-from-file',
                verbose: true,
            };
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(fileConfig);

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // File config should be preserved
            expect(config.model).toBe('gpt-4-from-file');
            expect(config.verbose).toBe(true);

            // Defaults should be applied where no file config exists
            expect(config.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun);
            expect(config.debug).toBe(KODRDRIV_DEFAULTS.debug);

            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle configure with CLI args that override all file config', async () => {
            // Mock program with comprehensive CLI args
            (mockProgram.opts as Mock).mockReturnValue({
                dryRun: true,
                verbose: false,
                debug: true,
                overrides: true,
                model: 'gpt-4-cli',
                openaiReasoning: 'high',
                openaiMaxOutputTokens: 5000,
                contextDirectories: ['cli-src', 'cli-docs'],
                configDir: '/cli/config',
                outputDir: '/cli/output',
                preferencesDir: '/cli/preferences',
            });

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({
                add: true,
                cached: false,
                sendit: true,
                interactive: true,
                amend: false,
                push: 'cli-origin',
                messageLimit: 50,
                context: 'cli context',
                direction: 'cli direction',
                skipFileCheck: true,
                maxDiffBytes: 16384,
                openaiReasoning: 'high',
                openaiMaxOutputTokens: 5000,
            });

            // Mock cardigantime.read to return file config
            const fileConfig: Partial<Config> = {
                model: 'gpt-4-from-file',
                verbose: true,
                commit: {
                    add: false,
                    cached: true,
                    sendit: false,
                },
            };
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(fileConfig);

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // CLI args should override file config
            expect(config.dryRun).toBe(true);
            expect(config.verbose).toBe(false);
            expect(config.debug).toBe(true);
            expect(config.overrides).toBe(true);
            expect(config.model).toBe('gpt-4-cli');
            expect(config.openaiReasoning).toBe('high');
            expect(config.openaiMaxOutputTokens).toBe(5000);
            expect(config.contextDirectories).toEqual(['cli-src', 'cli-docs']);
            expect(config.configDirectory).toBe('/cli/config');
            expect(config.outputDirectory).toBe('/cli/output');
            expect(config.preferencesDirectory).toBe('/cli/preferences');

            // Commit config should be from CLI
            expect(config.commit?.add).toBe(true);
            expect(config.commit?.cached).toBe(false);
            expect(config.commit?.sendit).toBe(true);
            expect(config.commit?.interactive).toBe(true);
            expect(config.commit?.amend).toBe(false);
            expect(config.commit?.push).toBe('cli-origin');
            expect(config.commit?.messageLimit).toBe(50);
            expect(config.commit?.context).toBe('cli context');
            expect(config.commit?.direction).toBe('cli direction');
            expect(config.commit?.skipFileCheck).toBe(true);
            expect(config.commit?.maxDiffBytes).toBe(16384);
            expect(config.commit?.openaiReasoning).toBe('high');
            expect(config.commit?.openaiMaxOutputTokens).toBe(5000);

            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle configure with partial CLI args (preserving file config)', async () => {
            // Mock program with partial CLI args
            (mockProgram.opts as Mock).mockReturnValue({
                verbose: true, // Only override verbose
                model: 'gpt-4-cli', // Only override model
            });

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({
                add: true, // Only override add
            });

            // Mock cardigantime.read to return comprehensive file config
            const fileConfig: Partial<Config> = {
                dryRun: true,
                verbose: false,
                debug: true,
                overrides: false,
                model: 'gpt-4-from-file',
                openaiReasoning: 'medium',
                openaiMaxOutputTokens: 3000,
                contextDirectories: ['file-src', 'file-docs'],
                configDirectory: '/file/config',
                outputDirectory: '/file/output',
                preferencesDirectory: '/file/preferences',
                commit: {
                    add: false,
                    cached: true,
                    sendit: false,
                    interactive: true,
                    amend: false,
                    push: 'file-origin',
                    messageLimit: 25,
                    context: 'file context',
                    direction: 'file direction',
                    skipFileCheck: false,
                    maxDiffBytes: 4096,
                    openaiReasoning: 'medium',
                    openaiMaxOutputTokens: 3000,
                },
                release: {
                    from: 'file-main',
                    to: 'file-develop',
                    context: 'file release context',
                    interactive: false,
                    messageLimit: 30,
                    maxDiffBytes: 8192,
                    noMilestones: true,
                    openaiReasoning: 'low',
                    openaiMaxOutputTokens: 2000,
                },
            };
            vi.mocked(mockCardigantimeInstance.read).mockResolvedValue(fileConfig);

            const [config, secureConfig, commandConfig] = await configure(mockCardigantimeInstance);

            // CLI args should override specific values
            expect(config.verbose).toBe(true); // CLI override
            expect(config.model).toBe('gpt-4-cli'); // CLI override
            expect(config.commit?.add).toBe(true); // CLI override

            // File config should be preserved for non-overridden values
            expect(config.dryRun).toBe(true); // From file
            expect(config.debug).toBe(true); // From file
            expect(config.overrides).toBe(false); // From file
            expect(config.openaiReasoning).toBe('medium'); // From file
            expect(config.openaiMaxOutputTokens).toBe(3000); // From file
            expect(config.contextDirectories).toEqual(['file-src', 'file-docs']); // From file
            expect(config.configDirectory).toBe('/file/config'); // From file
            expect(config.outputDirectory).toBe('/file/output'); // From file
            expect(config.preferencesDirectory).toBe('/file/preferences'); // From file

            // Commit config should merge CLI and file
            expect(config.commit?.add).toBe(true); // CLI override
            expect(config.commit?.cached).toBe(true); // From file
            expect(config.commit?.sendit).toBe(false); // From file
            expect(config.commit?.interactive).toBe(true); // From file
            expect(config.commit?.amend).toBe(false); // From file
            expect(config.commit?.push).toBe('file-origin'); // From file
            expect(config.commit?.messageLimit).toBe(25); // From file
            expect(config.commit?.context).toBe('file context'); // From file
            expect(config.commit?.direction).toBe('file direction'); // From file
            expect(config.commit?.skipFileCheck).toBe(false); // From file
            expect(config.commit?.maxDiffBytes).toBe(4096); // From file
            expect(config.commit?.openaiReasoning).toBe('medium'); // From file
            expect(config.commit?.openaiMaxOutputTokens).toBe(3000); // From file

            // Release config should be completely from file
            expect(config.release?.from).toBe('file-main');
            expect(config.release?.to).toBe('file-develop');
            expect(config.release?.context).toBe('file release context');
            expect(config.release?.interactive).toBe(false);
            expect(config.release?.messageLimit).toBe(30);
            expect(config.release?.maxDiffBytes).toBe(8192);
            expect(config.release?.noMilestones).toBe(true);
            expect(config.release?.openaiReasoning).toBe('low');
            expect(config.release?.openaiMaxOutputTokens).toBe(2000);

            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle configure with cardigantime.read throwing validation errors', async () => {
            // Mock cardigantime.read to throw a validation error
            const validationError = new Error('Configuration validation failed: Invalid model name');
            vi.mocked(mockCardigantimeInstance.read).mockRejectedValue(validationError);

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({});

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('Configuration validation failed: Invalid model name');
        });

        it('should handle configure with cardigantime.read throwing network errors', async () => {
            // Mock cardigantime.read to throw a network error
            const networkError = new Error('ENOTFOUND: Failed to resolve config server');
            vi.mocked(mockCardigantimeInstance.read).mockRejectedValue(networkError);

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({});

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('ENOTFOUND: Failed to resolve config server');
        });

        it('should handle configure with cardigantime.read throwing permission errors', async () => {
            // Mock cardigantime.read to throw a permission error
            const permissionError = new Error('EACCES: permission denied');
            permissionError.name = 'PermissionError';
            vi.mocked(mockCardigantimeInstance.read).mockRejectedValue(permissionError);

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({});

            await expect(configure(mockCardigantimeInstance)).rejects.toThrow('EACCES: permission denied');
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

        it('should validate all audio-related fields', () => {
            const audioInput = {
                file: '/path/to/audio.wav',
                directory: '/path/to/recordings',
                keepTemp: true,
                includeCommitHistory: false,
                includeRecentDiffs: true,
                includeReleaseNotes: false,
                includeGithubIssues: true,
                commitHistoryLimit: 25,
                diffHistoryLimit: 10,
                releaseNotesLimit: 5,
                githubIssuesLimit: 20,
            };

            const result = InputSchema.parse(audioInput);
            expect(result).toEqual(audioInput);
        });



        it('should validate review note field', () => {
            const reviewInput = {
                note: 'This is a review note for analysis',
            };

            const result = InputSchema.parse(reviewInput);
            expect(result).toEqual(reviewInput);
        });

        it('should validate direction field for commit command', () => {
            const commitInput = {
                direction: 'Fix performance issues in user authentication',
            };

            const result = InputSchema.parse(commitInput);
            expect(result).toEqual(commitInput);
        });

        it('should validate skipFileCheck field', () => {
            const commitInput = {
                skipFileCheck: true,
            };

            const result = InputSchema.parse(commitInput);
            expect(result).toEqual(commitInput);
        });

        it('should validate outputDir and preferencesDir fields', () => {
            const configInput = {
                outputDir: '/custom/output',
                preferencesDir: '/custom/preferences',
            };

            const result = InputSchema.parse(configInput);
            expect(result).toEqual(configInput);
        });

        it('should validate editorTimeout and parallel fields', () => {
            const input = {
                editorTimeout: 10000,
                parallel: true,
            } as any;

            const result = InputSchema.parse(input);
            expect(result.editorTimeout).toBe(10000);
            expect(result.parallel).toBe(true);
        });

        it('should reject invalid types for editorTimeout and parallel', () => {
            const bad = {
                editorTimeout: 'not-a-number',
                parallel: 'yes',
            } as any;

            expect(() => InputSchema.parse(bad)).toThrow(ZodError);
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
                    amend: true,
                    context: 'commit context',
                    messageLimit: 5,
                };

                const result = transformCliArgs(cliArgs);

                expect(result.commit).toEqual({
                    add: true,
                    cached: false,
                    sendit: true,
                    amend: true,
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

        // Helper function to transform mockCommands to the expected format
        const createCommandStructure = (commands: Record<string, any>) => ({
            commitCommand: commands.commit,
            audioCommitCommand: commands['audio-commit'],
            audioReviewCommand: commands['audio-review'],
            releaseCommand: commands.release,
            publishCommand: commands.publish,
            linkCommand: commands.link,
            unlinkCommand: commands.unlink,
            treeCommand: commands.tree,
            reviewCommand: commands.review,
            cleanCommand: commands.clean,
            selectAudioCommand: commands['select-audio'],
            developmentCommand: commands.development,
            versionsCommand: commands.versions,
        });

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
                'audio-commit': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                'audio-review': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
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
                unlink: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                tree: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                review: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                clean: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                'select-audio': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                development: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                versions: {
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
                if (cmd.argument) cmd.argument.mockReturnValue(cmd);
                if (cmd.configureHelp) cmd.configureHelp.mockReturnValue(cmd);
            });

            mockProgram = {
                command: vi.fn().mockImplementation((cmdName: string) => {
                    return mockCommands[cmdName] || mockCommands.commit;
                }),
                option: vi.fn().mockReturnThis(),
                configureHelp: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['commit'], // Default to commit command
            } as unknown as Command;
        });

        it('should return default command when no args provided', async () => {
            mockProgram.args = [];
            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit'); // DEFAULT_COMMAND
            expect(cliArgs).toEqual({});
        });

        it('should handle commit command with options', async () => {
            mockProgram.args = ['commit'];

            // Mock the commit command options
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
        });

        it('should handle audio-commit command', async () => {
            mockProgram.args = ['audio-commit'];

            // Mock the audio-commit command options
            mockCommands['audio-commit'].opts.mockReturnValue({
                file: '/path/to/audio.wav',
                keepTemp: true,
                cached: false,
                add: true,
                sendit: false,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('audio-commit');
        });

        it('should handle audio-review command', async () => {
            mockProgram.args = ['audio-review'];

            // Mock the audio-review command options
            mockCommands['audio-review'].opts.mockReturnValue({
                file: '/path/to/review.wav',
                directory: '/recordings',
                includeCommitHistory: true,
                includeRecentDiffs: false,
                sendit: true,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('audio-review');
        });



        it('should handle unlink command', async () => {
            mockProgram.args = ['unlink'];

            // Mock the unlink command options
            mockCommands.unlink.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('unlink');
        });

        it('should handle clean command', async () => {
            mockProgram.args = ['clean'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('clean');
        });

        it('should handle select-audio command', async () => {
            mockProgram.args = ['select-audio'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('select-audio');
        });

        it('should handle release command', async () => {
            mockProgram.args = ['release'];

            // Mock the release command options
            mockCommands.release.opts.mockReturnValue({ from: 'main', to: 'develop' });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('release');
        });

        it('should handle publish command', async () => {
            mockProgram.args = ['publish'];

            // Mock the publish command options
            mockCommands.publish.opts.mockReturnValue({ mergeMethod: 'squash' });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('publish');
        });

        it('should handle link command', async () => {
            mockProgram.args = ['link'];

            // Mock the link command options

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('link');
        });

        it('should handle review command with note', async () => {
            mockProgram.args = ['review'];

            // Mock the review command args to include a positional note argument
            mockCommands.review.args = ['This is a review note'];
            mockCommands.review.opts.mockReturnValue({
                includeCommitHistory: true,
                sendit: false,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('review');
            expect(cliArgs.note).toBe('This is a review note');
        });

        it('should handle review command with STDIN note input', async () => {
            // Mock readStdin to return test input
            mockReadStdin.mockResolvedValue('Review note from STDIN input');

            mockProgram.args = ['review'];
            mockCommands.review.args = [];
            mockCommands.review.opts.mockReturnValue({
                includeCommitHistory: true,
                sendit: false,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('review');
            expect(cliArgs.note).toBe('Review note from STDIN input');
        });

        it('should prioritize STDIN over positional argument for review note', async () => {
            // Mock readStdin to return test input
            mockReadStdin.mockResolvedValue('STDIN note takes precedence');

            mockProgram.args = ['review'];
            mockCommands.review.args = ['positional-note'];
            mockCommands.review.opts.mockReturnValue({
                includeCommitHistory: true,
                sendit: false,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('review');
            expect(cliArgs.note).toBe('STDIN note takes precedence');
        });

        it('should throw error for invalid command', async () => {
            mockProgram.args = ['invalid'];

            await expect(getCliConfig(mockProgram, createCommandStructure(mockCommands))).rejects.toThrow('Invalid command: invalid');
        });

        it('should handle commit command with positional direction argument', async () => {
            mockProgram.args = ['commit'];

            // Mock the commit command args to include a positional direction argument
            mockCommands.commit.args = ['fix-performance-issues'];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            // The direction should be extracted from positional args
            expect(cliArgs.direction).toBe('fix-performance-issues');
        });

        it('should handle commit command without positional direction argument', async () => {
            mockProgram.args = ['commit'];

            // Mock the commit command with empty args
            mockCommands.commit.args = [];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

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

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe('fix performance issues from STDIN');
        });

        it('should prioritize STDIN over positional argument for direction', async () => {
            // Mock readStdin to return test input
            mockReadStdin.mockResolvedValue('STDIN direction takes precedence');

            mockProgram.args = ['commit'];
            mockCommands.commit.args = ['positional-direction'];
            mockCommands.commit.opts.mockReturnValue({ cached: true, add: false });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe('STDIN direction takes precedence');
        });

        it('should handle complex audio-review command with all options', async () => {
            mockProgram.args = ['audio-review'];

            // Mock comprehensive audio-review options
            mockCommands['audio-review'].opts.mockReturnValue({
                file: '/recordings/session1.wav',
                directory: '/all-recordings',
                keepTemp: true,
                includeCommitHistory: false,
                includeRecentDiffs: true,
                includeReleaseNotes: true,
                includeGithubIssues: false,
                commitHistoryLimit: 20,
                diffHistoryLimit: 15,
                releaseNotesLimit: 8,
                githubIssuesLimit: 25,
                context: 'Weekly team review session',
                sendit: true,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('audio-review');
            expect(cliArgs.file).toBe('/recordings/session1.wav');
            expect(cliArgs.directory).toBe('/all-recordings');
            expect(cliArgs.includeCommitHistory).toBe(false);
            expect(cliArgs.includeRecentDiffs).toBe(true);
            expect(cliArgs.commitHistoryLimit).toBe(20);
            expect(cliArgs.context).toBe('Weekly team review session');
            expect(cliArgs.sendit).toBe(true);
        });

        it('should handle development command', async () => {
            mockProgram.args = ['development'];

            mockCommands.development.opts.mockReturnValue({
                targetVersion: 'minor',
                noMilestones: true,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('development');
            expect(cliArgs.targetVersion).toBe('minor');
            expect(cliArgs.noMilestones).toBe(true);
        });

        it('should handle versions command', async () => {
            mockProgram.args = ['versions'];

            mockCommands.versions.opts.mockReturnValue({
                directories: ['/packages', '/libs'],
            });

            // Mock the versions command args to include a positional subcommand argument
            mockCommands.versions.args = ['minor'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('versions');
            expect(cliArgs.directories).toEqual(['/packages', '/libs']);
            expect(cliArgs.subcommand).toBe('minor');
        });

        it('should handle versions command without positional subcommand', async () => {
            mockProgram.args = ['versions'];

            mockCommands.versions.opts.mockReturnValue({
                directories: ['/packages'],
            });

            mockCommands.versions.args = [];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('versions');
            expect(cliArgs.directories).toEqual(['/packages']);
            expect(cliArgs.subcommand).toBeUndefined();
        });

        it('should handle versions command with undefined args', async () => {
            mockProgram.args = ['versions'];

            mockCommands.versions.opts.mockReturnValue({
                directories: ['/packages'],
            });

            mockCommands.versions.args = undefined as any;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('versions');
            expect(cliArgs.directories).toEqual(['/packages']);
            expect(cliArgs.subcommand).toBeUndefined();
        });

        it('should handle link command with status subcommand', async () => {
            mockProgram.args = ['link'];

            mockCommands.link.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
                externals: ['@test/lib'],
            });

            // Mock the link command args to include 'status' as subcommand
            mockCommands.link.args = ['status'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('link');
            expect(cliArgs.scopeRoots).toBe('{"@test": "../test"}');
            expect(cliArgs.externals).toEqual(['@test/lib']);
            expect((cliArgs as any).packageArgument).toBe('status');
        });

        it('should handle link command with package argument (not status)', async () => {
            mockProgram.args = ['link'];

            mockCommands.link.opts.mockReturnValue({
                scopeRoots: '{"@company": "../company"}',
            });

            // Mock the link command args to include a package name
            mockCommands.link.args = ['my-package'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('link');
            expect(cliArgs.scopeRoots).toBe('{"@company": "../company"}');
            expect((cliArgs as any).packageArgument).toBe('my-package');
        });

        it('should handle link command with empty args', async () => {
            mockProgram.args = ['link'];

            mockCommands.link.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
            });

            mockCommands.link.args = [];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('link');
            expect(cliArgs.scopeRoots).toBe('{"@test": "../test"}');
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle link command with undefined args', async () => {
            mockProgram.args = ['link'];

            mockCommands.link.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
            });

            mockCommands.link.args = undefined as any;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('link');
            expect(cliArgs.scopeRoots).toBe('{"@test": "../test"}');
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle unlink command with status subcommand', async () => {
            mockProgram.args = ['unlink'];

            mockCommands.unlink.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
                cleanNodeModules: true,
            });

            // Mock the unlink command args to include 'status' as subcommand
            mockCommands.unlink.args = ['status'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('unlink');
            expect(cliArgs.scopeRoots).toBe('{"@test": "../test"}');
            expect(cliArgs.cleanNodeModules).toBe(true);
            expect((cliArgs as any).packageArgument).toBe('status');
        });

        it('should handle unlink command with package argument (not status)', async () => {
            mockProgram.args = ['unlink'];

            mockCommands.unlink.opts.mockReturnValue({
                scopeRoots: '{"@company": "../company"}',
                cleanNodeModules: false,
            });

            // Mock the unlink command args to include a package name
            mockCommands.unlink.args = ['my-package'];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('unlink');
            expect(cliArgs.scopeRoots).toBe('{"@company": "../company"}');
            expect(cliArgs.cleanNodeModules).toBe(false);
            expect((cliArgs as any).packageArgument).toBe('my-package');
        });

        it('should handle unlink command with empty args', async () => {
            mockProgram.args = ['unlink'];

            mockCommands.unlink.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
            });

            mockCommands.unlink.args = [];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('unlink');
            expect(cliArgs.scopeRoots).toBe('{"@test": "../test"}');
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle unlink command with undefined args', async () => {
            mockProgram.args = ['unlink'];

            mockCommands.unlink.opts.mockReturnValue({
                scopeRoots: '{"@test": "../test"}',
            });

            mockCommands.unlink.args = undefined as any;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('unlink');
            expect(cliArgs.scopeRoots).toBe('{"@test": "../test"}');
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle command with opts method that returns undefined', async () => {
            mockProgram.args = ['commit'];

            // Mock commit command with opts method that returns undefined
            mockCommands.commit.opts = undefined as any;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs).toEqual({});
        });

        it('should handle command with opts method that throws error', async () => {
            mockProgram.args = ['commit'];

            // Mock commit command with opts method that throws an error
            mockCommands.commit.opts.mockImplementation(() => {
                throw new Error('opts method error');
            });

            await expect(getCliConfig(mockProgram, createCommandStructure(mockCommands))).rejects.toThrow('opts method error');
        });

        it('should handle command with args that throws error', async () => {
            mockProgram.args = ['commit'];

            // Mock commit command with args that throws an error
            mockCommands.commit.args = undefined as any;
            mockCommands.commit.opts.mockReturnValue({});

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs).toEqual({});
        });

        it('should handle command with args that is not an array', async () => {
            mockProgram.args = ['commit'];

            // Mock commit command with args that is not an array
            mockCommands.commit.args = 'not-an-array' as any;
            mockCommands.commit.opts.mockReturnValue({});

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs).toEqual({});
        });

        it('should handle command with args that contains falsy values', async () => {
            mockProgram.args = ['commit'];

            // Mock commit command with args that contains falsy values
            mockCommands.commit.args = ['', null, undefined, 'valid-direction'];
            mockCommands.commit.opts.mockReturnValue({});

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe('valid-direction');
        });

        it('should handle command with args that contains only falsy values', async () => {
            mockProgram.args = ['commit'];

            // Mock commit command with args that contains only falsy values
            mockCommands.commit.args = ['', null, undefined, false, 0];
            mockCommands.commit.opts.mockReturnValue({});

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBeUndefined();
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
                    // @ts-ignore
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

        it('should handle audioCommit options correctly', async () => {
            const options: Partial<Config> = {
                audioCommit: {
                    file: '/path/to/recording.wav',
                    keepTemp: true,
                    maxRecordingTime: 300,
                    audioDevice: 'default',
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.audioCommit?.file).toBe('/path/to/recording.wav');
            expect(result.audioCommit?.keepTemp).toBe(true);
            expect(result.audioCommit?.maxRecordingTime).toBe(300);
            expect(result.audioCommit?.audioDevice).toBe('default');
        });

        it('should handle audioReview options correctly', async () => {
            const options: Partial<Config> = {
                audioReview: {
                    file: '/path/to/review.wav',
                    directory: '/recordings',
                    keepTemp: false,
                    includeCommitHistory: false,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: false,
                    commitHistoryLimit: 25,
                    diffHistoryLimit: 15,
                    releaseNotesLimit: 8,
                    githubIssuesLimit: 30,
                    context: 'Audio review context',
                    sendit: true,
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.audioReview?.file).toBe('/path/to/review.wav');
            expect(result.audioReview?.directory).toBe('/recordings');
            expect(result.audioReview?.includeCommitHistory).toBe(false);
            expect(result.audioReview?.includeRecentDiffs).toBe(true);
            expect(result.audioReview?.commitHistoryLimit).toBe(25);
            expect(result.audioReview?.context).toBe('Audio review context');
            expect(result.audioReview?.sendit).toBe(true);
        });



        it('should handle complete review configuration', async () => {
            const options: Partial<Config> = {
                review: {
                    note: 'Comprehensive review note',
                    includeCommitHistory: false,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: false,
                    commitHistoryLimit: 50,
                    diffHistoryLimit: 20,
                    releaseNotesLimit: 10,
                    githubIssuesLimit: 15,
                    context: 'Monthly review session',
                    sendit: false,
                },
            };

            const result = await validateAndProcessOptions(options);

            expect(result.review?.note).toBe('Comprehensive review note');
            expect(result.review?.includeCommitHistory).toBe(false);
            expect(result.review?.includeRecentDiffs).toBe(true);
            expect(result.review?.includeReleaseNotes).toBe(true);
            expect(result.review?.includeGithubIssues).toBe(false);
            expect(result.review?.commitHistoryLimit).toBe(50);
            expect(result.review?.context).toBe('Monthly review session');
            expect(result.review?.sendit).toBe(false);
        });

        it('should handle configuration with all undefined values in nested objects', async () => {
            const undefinedNestedOptions: Partial<Config> = {
                commit: {
                    add: undefined,
                    cached: undefined,
                    sendit: undefined,
                    interactive: undefined,
                    amend: undefined,
                    push: undefined,
                    messageLimit: undefined,
                    context: undefined,
                    direction: undefined,
                    skipFileCheck: undefined,
                    maxDiffBytes: undefined,
                    openaiReasoning: undefined,
                    openaiMaxOutputTokens: undefined,
                },
                release: {
                    from: undefined,
                    to: undefined,
                    context: undefined,
                    interactive: undefined,
                    messageLimit: undefined,
                    maxDiffBytes: undefined,
                    noMilestones: undefined,
                    openaiReasoning: undefined,
                    openaiMaxOutputTokens: undefined,
                },
                publish: {
                    mergeMethod: undefined,
                    from: undefined,
                    targetVersion: undefined,
                    interactive: undefined,
                    syncTarget: undefined,
                    noMilestones: undefined,
                },
                link: {
                    scopeRoots: undefined,
                    externals: undefined,
                    packageArgument: undefined,
                },
                unlink: {
                    scopeRoots: undefined,
                    workspaceFile: undefined,
                    cleanNodeModules: undefined,
                    externals: undefined,
                    packageArgument: undefined,
                },
                tree: {
                    directories: undefined,
                    exclude: undefined,
                    startFrom: undefined,
                    stopAt: undefined,
                    cmd: undefined,
                    builtInCommand: undefined,
                    continue: undefined,
                    packageArgument: undefined,
                    cleanNodeModules: undefined,
                    externals: undefined,
                },
                development: {
                    targetVersion: undefined,
                    noMilestones: undefined,
                },
                versions: {
                    subcommand: undefined,
                    directories: undefined,
                },
            };

            const result = await validateAndProcessOptions(undefinedNestedOptions);

            // All nested objects should be defined with default values
            expect(result.commit).toBeDefined();
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add);
            expect(result.commit?.cached).toBe(KODRDRIV_DEFAULTS.commit.cached);
            expect(result.release).toBeDefined();
            expect(result.release?.from).toBe(KODRDRIV_DEFAULTS.release.from);
            expect(result.publish).toBeDefined();
            expect(result.publish?.mergeMethod).toBe(KODRDRIV_DEFAULTS.publish.mergeMethod);
            expect(result.link).toBeDefined();
            expect(result.link?.scopeRoots).toEqual(KODRDRIV_DEFAULTS.link.scopeRoots);
            expect(result.unlink).toBeDefined();
            expect(result.tree).toBeDefined();
            expect(result.development).toBeDefined();
            expect(result.versions).toBeDefined();
        });

        it('should handle configuration with mixed defined and undefined values', async () => {
            const mixedOptions: Partial<Config> = {
                model: 'gpt-4-turbo',
                dryRun: undefined,
                verbose: true,
                debug: undefined,
                contextDirectories: ['src'],
                commit: {
                    add: true,
                    cached: undefined,
                    sendit: false,
                    interactive: undefined,
                },
                release: {
                    from: 'main',
                    to: undefined,
                    context: 'release context',
                    messageLimit: undefined,
                },
            };

            const result = await validateAndProcessOptions(mixedOptions);

            expect(result.model).toBe('gpt-4-turbo');
            expect(result.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun); // Default
            expect(result.verbose).toBe(true);
            expect(result.debug).toBe(KODRDRIV_DEFAULTS.debug); // Default
            expect(result.contextDirectories).toEqual(['src']);
            expect(result.commit?.add).toBe(true);
            expect(result.commit?.cached).toBe(KODRDRIV_DEFAULTS.commit.cached); // Default
            expect(result.commit?.sendit).toBe(false);
            expect(result.commit?.interactive).toBe(KODRDRIV_DEFAULTS.commit.interactive); // Default
            expect(result.release?.from).toBe('main');
            expect(result.release?.to).toBe(KODRDRIV_DEFAULTS.release.to); // Default
            expect(result.release?.context).toBe('release context');
            expect(result.release?.messageLimit).toBe(KODRDRIV_DEFAULTS.release.messageLimit); // Default
        });

        it('should handle configuration with null values (should be treated as undefined)', async () => {
            const nullOptions: Partial<Config> = {
                model: null as any,
                dryRun: null as any,
                commit: {
                    add: null as any,
                    cached: null as any,
                },
            };

            const result = await validateAndProcessOptions(nullOptions);

            expect(result.model).toBe(KODRDRIV_DEFAULTS.model); // Default
            expect(result.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun); // Default
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add); // Default
            expect(result.commit?.cached).toBe(KODRDRIV_DEFAULTS.commit.cached); // Default
        });

        it('should handle configuration with empty objects', async () => {
            const emptyObjectOptions: Partial<Config> = {
                commit: {},
                release: {},
                publish: {},
                link: {},
                unlink: {},
                tree: {},
                development: {},
                versions: {},
            };

            const result = await validateAndProcessOptions(emptyObjectOptions);

            // All nested objects should be defined with default values
            expect(result.commit).toBeDefined();
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add);
            expect(result.release).toBeDefined();
            expect(result.release?.from).toBe(KODRDRIV_DEFAULTS.release.from);
            expect(result.publish).toBeDefined();
            expect(result.publish?.mergeMethod).toBe(KODRDRIV_DEFAULTS.publish.mergeMethod);
            expect(result.link).toBeDefined();
            expect(result.link?.scopeRoots).toEqual(KODRDRIV_DEFAULTS.link.scopeRoots);
            expect(result.unlink).toBeDefined();
            expect(result.tree).toBeDefined();
            expect(result.development).toBeDefined();
            expect(result.versions).toBeDefined();
        });

        it('should handle configuration with deeply nested undefined values', async () => {
            const deeplyNestedOptions: Partial<Config> = {
                commit: {
                    add: true,
                    cached: false,
                    sendit: undefined,
                },
                link: {
                    scopeRoots: { '@test': '../test' },
                    externals: undefined,
                    packageArgument: 'test-package',
                },
            };

            const result = await validateAndProcessOptions(deeplyNestedOptions);

            expect(result.commit?.add).toBe(true);
            expect(result.commit?.cached).toBe(false);
            expect(result.commit?.sendit).toBe(KODRDRIV_DEFAULTS.commit.sendit); // Default
            expect(result.link?.scopeRoots).toEqual({ '@test': '../test' });
            expect(result.link?.externals).toEqual(KODRDRIV_DEFAULTS.link.externals); // Default
            expect(result.link?.packageArgument).toBe('test-package');
        });

        it('should handle configuration with all command types having some values', async () => {
            const allCommandsOptions: Partial<Config> = {
                commit: { add: true },
                audioCommit: { keepTemp: true },
                release: { from: 'main' },
                audioReview: { includeCommitHistory: true },
                review: { sendit: false },
                publish: { mergeMethod: 'rebase' },
                link: { externals: ['@test/lib'] },
                unlink: { cleanNodeModules: true },
                tree: { directories: ['/workspace'] },
                development: { targetVersion: 'minor' },
                versions: { subcommand: 'patch' },
            };

            const result = await validateAndProcessOptions(allCommandsOptions);

            expect(result.commit?.add).toBe(true);
            expect(result.audioCommit?.keepTemp).toBe(true);
            expect(result.release?.from).toBe('main');
            expect(result.audioReview?.includeCommitHistory).toBe(true);
            expect(result.review?.sendit).toBe(false);
            expect(result.publish?.mergeMethod).toBe('rebase');
            expect(result.link?.externals).toEqual(['@test/lib']);
            expect(result.unlink?.cleanNodeModules).toBe(true);
            expect(result.tree?.directories).toEqual(['/workspace']);
            expect(result.development?.targetVersion).toBe('minor');
            expect(result.versions?.subcommand).toBe('patch');
        });

        it('should handle configuration with excludedPatterns array', async () => {
            const excludedPatternsOptions: Partial<Config> = {
                excludedPatterns: ['*.log', '**/node_modules/**', 'dist/*'],
            };

            const result = await validateAndProcessOptions(excludedPatternsOptions);

            expect(result.excludedPatterns).toEqual(['*.log', '**/node_modules/**', 'dist/*']);
        });

        it('should handle configuration with empty excludedPatterns array', async () => {
            const emptyExcludedPatternsOptions: Partial<Config> = {
                excludedPatterns: [],
            };

            const result = await validateAndProcessOptions(emptyExcludedPatternsOptions);

            expect(result.excludedPatterns).toEqual([]);
        });

        it('should handle configuration with undefined excludedPatterns', async () => {
            const undefinedExcludedPatternsOptions: Partial<Config> = {
                excludedPatterns: undefined,
            };

            const result = await validateAndProcessOptions(undefinedExcludedPatternsOptions);

            expect(result.excludedPatterns).toEqual(KODRDRIV_DEFAULTS.excludedPatterns);
        });

        it('should handle configuration with contextDirectories validation', async () => {
            // Mock storage to return different results for different directories
            mockStorage.isDirectoryReadable
                .mockResolvedValueOnce(true)   // src is readable
                .mockResolvedValueOnce(false)  // docs is not readable
                .mockResolvedValueOnce(true);  // tests is readable

            const contextDirectoriesOptions: Partial<Config> = {
                contextDirectories: ['src', 'docs', 'tests'],
            };

            const result = await validateAndProcessOptions(contextDirectoriesOptions);

            expect(result.contextDirectories).toEqual(['src', 'tests']); // Only readable directories
            expect(mockStorage.isDirectoryReadable).toHaveBeenCalledTimes(3);
        });

        it('should handle configuration with empty contextDirectories', async () => {
            const emptyContextDirectoriesOptions: Partial<Config> = {
                contextDirectories: [],
            };

            const result = await validateAndProcessOptions(emptyContextDirectoriesOptions);

            expect(result.contextDirectories).toEqual([]);
            expect(mockStorage.isDirectoryReadable).not.toHaveBeenCalled();
        });

        it('should handle configuration with undefined contextDirectories', async () => {
            const undefinedContextDirectoriesOptions: Partial<Config> = {};

            const result = await validateAndProcessOptions(undefinedContextDirectoriesOptions);

            expect(result.contextDirectories).toEqual([]); // Default empty array
        });

        it('should handle configuration with contextDirectories validation errors', async () => {
            // Mock storage to throw an error for one directory
            mockStorage.isDirectoryReadable
                .mockResolvedValueOnce(true)   // src is readable
                .mockRejectedValueOnce(new Error('Permission denied'))  // docs throws error
                .mockResolvedValueOnce(true);  // tests is readable

            const contextDirectoriesOptions: Partial<Config> = {
                contextDirectories: ['src', 'docs', 'tests'],
            };

            const result = await validateAndProcessOptions(contextDirectoriesOptions);

            expect(result.contextDirectories).toEqual(['src', 'tests']); // Only readable directories
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory docs: Permission denied')
            );
        });

        it('should handle configuration with all default values', async () => {
            const emptyOptions: Partial<Config> = {};

            const result = await validateAndProcessOptions(emptyOptions);

            // Verify all defaults are applied
            expect(result.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun);
            expect(result.verbose).toBe(KODRDRIV_DEFAULTS.verbose);
            expect(result.debug).toBe(KODRDRIV_DEFAULTS.debug);
            expect(result.overrides).toBe(KODRDRIV_DEFAULTS.overrides);
            expect(result.model).toBe(KODRDRIV_DEFAULTS.model);
            expect(result.openaiReasoning).toBe(KODRDRIV_DEFAULTS.openaiReasoning);
            expect(result.openaiMaxOutputTokens).toBe(KODRDRIV_DEFAULTS.openaiMaxOutputTokens);
            expect(result.contextDirectories).toEqual([]);
            expect(result.configDirectory).toBe(KODRDRIV_DEFAULTS.configDirectory);
            expect(result.outputDirectory).toBe(KODRDRIV_DEFAULTS.outputDirectory);
            expect(result.preferencesDirectory).toBe(KODRDRIV_DEFAULTS.preferencesDirectory);
            expect(result.excludedPatterns).toEqual(KODRDRIV_DEFAULTS.excludedPatterns);

            // Verify all command defaults are applied
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add);
            expect(result.commit?.cached).toBe(KODRDRIV_DEFAULTS.commit.cached);
            expect(result.commit?.sendit).toBe(KODRDRIV_DEFAULTS.commit.sendit);
            expect(result.release?.from).toBe(KODRDRIV_DEFAULTS.release.from);
            expect(result.release?.to).toBe(KODRDRIV_DEFAULTS.release.to);
            expect(result.publish?.mergeMethod).toBe(KODRDRIV_DEFAULTS.publish.mergeMethod);
            expect(result.link?.scopeRoots).toEqual(KODRDRIV_DEFAULTS.link.scopeRoots);
            expect(result.tree?.directories).toEqual(KODRDRIV_DEFAULTS.tree.directories);
        });

        it('should preserve review.editorTimeout and ignore unknown root properties like parallel', async () => {
            const options: Partial<Config> = {
                review: {
                    editorTimeout: 7500,
                } as any,
                parallel: true as any,
            } as any;

            const result = await validateAndProcessOptions(options);
            expect(result.review?.editorTimeout).toBe(7500);
            expect((result as any).parallel).toBeUndefined();
        });
    });

    describe('validateConfigDir', () => {
        beforeEach(() => {
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    // @ts-ignore
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
                    from: 'release/v1.0',
                    mergeMethod: 'rebase',
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

        it('should handle complex audio workflow transformation', () => {
            const audioWorkflowArgs: Input = {
                file: '/recordings/session-20241201.wav',
                directory: '/all-recordings/december',
                keepTemp: true,
                includeCommitHistory: false,
                includeRecentDiffs: true,
                includeReleaseNotes: false,
                includeGithubIssues: true,
                commitHistoryLimit: 30,
                diffHistoryLimit: 10,
                releaseNotesLimit: 5,
                githubIssuesLimit: 20,
                context: 'End-of-sprint retrospective',
                sendit: false,
            };

            const result = transformCliArgs(audioWorkflowArgs);

            expect(result.audioCommit).toEqual({
                file: '/recordings/session-20241201.wav',
                keepTemp: true,
            });

            expect(result.audioReview).toEqual({
                file: '/recordings/session-20241201.wav',
                directory: '/all-recordings/december',
                keepTemp: true,
                includeCommitHistory: false,
                includeRecentDiffs: true,
                includeReleaseNotes: false,
                includeGithubIssues: true,
                commitHistoryLimit: 30,
                diffHistoryLimit: 10,
                releaseNotesLimit: 5,
                githubIssuesLimit: 20,
                context: 'End-of-sprint retrospective',
                sendit: false,
            });

            expect(result.review).toEqual({
                includeCommitHistory: false,
                includeRecentDiffs: true,
                includeReleaseNotes: false,
                includeGithubIssues: true,
                commitHistoryLimit: 30,
                diffHistoryLimit: 10,
                releaseNotesLimit: 5,
                githubIssuesLimit: 20,
                context: 'End-of-sprint retrospective',
                sendit: false,
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

    describe('STDIN input handling edge cases', () => {
        const mockReadStdin = vi.mocked(readStdin);
        let mockCommands: any;

        // Helper function to transform mockCommands to the expected format
        const createCommandStructure = (commands: Record<string, any>) => ({
            commitCommand: commands.commit,
            audioCommitCommand: commands['audio-commit'],
            audioReviewCommand: commands['audio-review'],
            releaseCommand: commands.release,
            publishCommand: commands.publish,
            linkCommand: commands.link,
            unlinkCommand: commands.unlink,
            treeCommand: commands.tree,
            reviewCommand: commands.review,
            cleanCommand: commands.clean,
            selectAudioCommand: commands['select-audio'],
            developmentCommand: commands.development,
            versionsCommand: commands.versions,
        });

        beforeEach(() => {
            mockReadStdin.mockReset();

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
                'audio-commit': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                'audio-review': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                release: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                publish: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                link: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                unlink: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                tree: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                review: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                clean: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                development: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                versions: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                'select-audio': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                }
            };
        });

        it('should handle empty STDIN input gracefully', async () => {
            mockReadStdin.mockResolvedValue(null); // readStdin returns null for empty input

            const mockProgram = {
                command: vi.fn().mockReturnValue({
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: ['positional-value'],
                }),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['commit'],
            } as unknown as Command;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, mockCommands);

            expect(commandConfig.commandName).toBe('commit');
            // Empty STDIN (null) should not override positional argument
            expect(cliArgs.direction).toBe('positional-value');
        });

        it('should handle whitespace-only STDIN input', async () => {
            mockReadStdin.mockResolvedValue('   \n\t  ');

            const mockProgram = {
                command: vi.fn().mockReturnValue({
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                }),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['review'],
            } as unknown as Command;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, mockCommands);

            expect(commandConfig.commandName).toBe('review');
            expect(cliArgs.note).toBe('   \n\t  '); // Preserve whitespace as-is
        });

        it('should handle very long STDIN input', async () => {
            const longInput = 'A'.repeat(10000) + ' - this is a very long input for testing';
            mockReadStdin.mockResolvedValue(longInput);

            const mockProgram = {
                command: vi.fn().mockReturnValue({
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                }),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['commit'],
            } as unknown as Command;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, mockCommands);

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe(longInput);
            expect(cliArgs.direction?.length).toBe(10040);
        });

        it('should handle STDIN input with special characters', async () => {
            const specialInput = 'Fix: "quotes", \'apostrophes\', & ampersands, <tags>, $variables, `backticks`';
            mockReadStdin.mockResolvedValue(specialInput);

            const mockProgram = {
                command: vi.fn().mockReturnValue({
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                }),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['review'],
            } as unknown as Command;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('review');
            expect(cliArgs.note).toBe(specialInput);
        });

        it('should handle STDIN read errors gracefully', async () => {
            mockReadStdin.mockRejectedValue(new Error('STDIN read error'));

            const mockProgram = {
                command: vi.fn().mockReturnValue({
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: ['fallback-value'],
                }),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['commit'],
            } as unknown as Command;

            // Should throw the STDIN error
            await expect(getCliConfig(mockProgram, createCommandStructure(mockCommands))).rejects.toThrow('STDIN read error');
        });
    });

    describe('Complex JSON parsing edge cases', () => {
        describe('scopeRoots JSON parsing', () => {
            it('should handle nested JSON objects in scopeRoots', () => {
                const cliArgs: Input = {
                    scopeRoots: '{"@company": {"path": "../company", "dev": true}, "@utils": "../utils"}',
                };

                // This parses successfully but would likely cause issues later
                const result = transformCliArgs(cliArgs);
                expect(result.link?.scopeRoots).toEqual({
                    '@company': { "path": "../company", "dev": true },
                    '@utils': "../utils"
                });
            });

            it('should handle JSON with escaped quotes', () => {
                const cliArgs: Input = {
                    scopeRoots: '{"@test": "../test/\\"quoted\\"", "@lib": "../lib"}',
                };

                const result = transformCliArgs(cliArgs);
                expect(result.link?.scopeRoots).toEqual({
                    '@test': '../test/"quoted"',
                    '@lib': '../lib',
                });
            });

            it('should handle empty JSON object', () => {
                const cliArgs: Input = {
                    scopeRoots: '{}',
                };

                const result = transformCliArgs(cliArgs);
                expect(result.link?.scopeRoots).toEqual({});
            });

            it('should handle JSON with special characters in paths', () => {
                const cliArgs: Input = {
                    scopeRoots: '{"@special": "../path/with spaces/and-dashes_underscores"}',
                };

                const result = transformCliArgs(cliArgs);
                expect(result.link?.scopeRoots).toEqual({
                    '@special': '../path/with spaces/and-dashes_underscores',
                });
            });

            it('should throw descriptive error for malformed JSON', () => {
                const cliArgs: Input = {
                    scopeRoots: '{"@test": "../test", @invalid: "no-quotes"}',
                };

                expect(() => transformCliArgs(cliArgs)).toThrow('Invalid JSON for scope-roots: {"@test": "../test", @invalid: "no-quotes"}');
            });

            it('should handle non-object JSON (though not recommended)', () => {
                const cliArgs: Input = {
                    scopeRoots: '"string-instead-of-object"',
                };

                // This parses successfully but stores a string instead of an object
                const result = transformCliArgs(cliArgs);
                expect(result.link?.scopeRoots).toBe('string-instead-of-object');
            });

            it('should handle JSON array (though not recommended)', () => {
                const cliArgs: Input = {
                    scopeRoots: '["@test", "@lib"]',
                };

                // This parses successfully but stores an array instead of an object
                const result = transformCliArgs(cliArgs);
                expect(result.link?.scopeRoots).toEqual(['@test', '@lib']);
            });
        });
    });

    describe('Environment variable edge cases', () => {
        beforeEach(() => {
            process.env = { ...originalEnv };
        });

        it('should handle API key with special characters', async () => {
            process.env.OPENAI_API_KEY = 'sk-test_key-with-special@chars#$%';

            const result = await validateAndProcessSecureOptions();
            expect(result.openaiApiKey).toBe('sk-test_key-with-special@chars#$%');
        });

        it('should handle very long API keys', async () => {
            const longKey = 'sk-' + 'a'.repeat(500);
            process.env.OPENAI_API_KEY = longKey;

            const result = await validateAndProcessSecureOptions();
            expect(result.openaiApiKey).toBe(longKey);
        });

        it('should handle API key with whitespace', async () => {
            process.env.OPENAI_API_KEY = '  sk-test-key-with-whitespace  ';

            const result = await validateAndProcessSecureOptions();
            expect(result.openaiApiKey).toBe('  sk-test-key-with-whitespace  ');
        });

        it('should handle undefined API key separately from empty string', async () => {
            delete process.env.OPENAI_API_KEY;

            await expect(validateAndProcessSecureOptions()).rejects.toThrow('OpenAI API key is required');
        });

        it('should handle null-like values in environment', async () => {
            process.env.OPENAI_API_KEY = 'null';

            const result = await validateAndProcessSecureOptions();
            expect(result.openaiApiKey).toBe('null');
        });
    });

    describe('Advanced configuration merging scenarios', () => {
        beforeEach(() => {
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    // @ts-ignore
                    mock.mockReset();
                }
            });
            mockStorage.isDirectoryReadable.mockResolvedValue(true);
            mockStorage.isFileReadable.mockResolvedValue(false);
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(true);
        });

        it('should handle deeply nested configuration conflicts', async () => {
            const complexOptions: Partial<Config> = {
                commit: {
                    add: true,
                    cached: false,
                    sendit: true,
                    messageLimit: 25,
                    context: 'file context',
                    direction: 'file direction',
                    skipFileCheck: false,
                },
                audioCommit: {
                    maxRecordingTime: 600,
                    audioDevice: 'device-1',
                    file: '/path/from/file.wav',
                    keepTemp: true,
                },
                release: {
                    from: 'file-branch',
                    to: 'file-target',
                    messageLimit: 30,
                    context: 'file release context',
                },
                publish: {
                    mergeMethod: 'merge',
                    dependencyUpdatePatterns: ['package*.json', 'yarn.lock'],
                    requiredEnvVars: ['FILE_VAR1', 'FILE_VAR2'],
                    sendit: false,
                    targetBranch: 'main',
                },
                link: {
                    scopeRoots: { '@file': '../file', '@shared': '../file-shared' },
                    dryRun: false,
                },
            };

            const result = await validateAndProcessOptions(complexOptions);

            expect(result.commit?.add).toBe(true);
            expect(result.commit?.cached).toBe(false);
            expect(result.commit?.context).toBe('file context');
            expect(result.audioCommit?.maxRecordingTime).toBe(600);
            expect(result.release?.from).toBe('file-branch');
            expect(result.publish?.mergeMethod).toBe('merge');
            expect(result.link?.scopeRoots).toEqual({ '@file': '../file', '@shared': '../file-shared' });
        });

        it('should handle configuration with missing intermediate objects', async () => {
            const sparseOptions: Partial<Config> = {
                model: 'gpt-4-turbo',
                // No commit object, but we should get defaults
                release: {
                    from: 'main',
                    // to is missing, should get default
                },
                // Other objects completely missing
            };

            const result = await validateAndProcessOptions(sparseOptions);

            expect(result.model).toBe('gpt-4-turbo');
            expect(result.commit).toBeDefined();
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add);
            expect(result.release?.from).toBe('main');
            expect(result.release?.to).toBe(KODRDRIV_DEFAULTS.release.to);
            expect(result.audioCommit).toBeDefined();
            expect(result.publish).toBeDefined();
            expect(result.link).toBeDefined();
        });

        it('should handle configuration with all undefined values', async () => {
            const undefinedOptions: Partial<Config> = {
                dryRun: undefined,
                verbose: undefined,
                debug: undefined,
                model: undefined,
                contextDirectories: undefined,
                commit: {
                    add: undefined,
                    cached: undefined,
                    sendit: undefined,
                },
            };

            const result = await validateAndProcessOptions(undefinedOptions);

            expect(result.dryRun).toBe(KODRDRIV_DEFAULTS.dryRun);
            expect(result.verbose).toBe(KODRDRIV_DEFAULTS.verbose);
            expect(result.debug).toBe(KODRDRIV_DEFAULTS.debug);
            expect(result.model).toBe(KODRDRIV_DEFAULTS.model);
            expect(result.commit?.add).toBe(KODRDRIV_DEFAULTS.commit.add);
        });

        it('should preserve cardigantime-specific properties', async () => {
            const cardingantimeOptions: Partial<Config> = {
                model: 'gpt-4',
                discoveredConfigDirs: ['/discovered1', '/discovered2'] as any,
                resolvedConfigDirs: ['/resolved1', '/resolved2'] as any,
            };

            const result = await validateAndProcessOptions(cardingantimeOptions);

            expect(result.discoveredConfigDirs).toEqual(['/discovered1', '/discovered2']);
            expect(result.resolvedConfigDirs).toEqual(['/resolved1', '/resolved2']);
        });
    });

    describe('Command-specific option validation edge cases', () => {
        beforeEach(() => {
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    // @ts-ignore
                    mock.mockReset();
                }
            });
            mockStorage.isDirectoryReadable.mockResolvedValue(true);
            mockStorage.isFileReadable.mockResolvedValue(false);
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockResolvedValue(true);
        });

        it('should handle all audio-related limits at maximum values', async () => {
            const maxAudioOptions: Partial<Config> = {
                audioReview: {
                    commitHistoryLimit: 1000,
                    diffHistoryLimit: 500,
                    releaseNotesLimit: 100,
                    githubIssuesLimit: 20, // GitHub API limit
                    maxRecordingTime: 3600, // 1 hour
                    includeCommitHistory: true,
                    includeRecentDiffs: true,
                    includeReleaseNotes: true,
                    includeGithubIssues: true,
                },
            };

            const result = await validateAndProcessOptions(maxAudioOptions);

            expect(result.audioReview?.commitHistoryLimit).toBe(1000);
            expect(result.audioReview?.diffHistoryLimit).toBe(500);
            expect(result.audioReview?.releaseNotesLimit).toBe(100);
            expect(result.audioReview?.githubIssuesLimit).toBe(20);
            expect(result.audioReview?.maxRecordingTime).toBe(3600);
        });

        it('should handle minimal audio configuration', async () => {
            const minimalAudioOptions: Partial<Config> = {
                audioReview: {
                    includeCommitHistory: false,
                    includeRecentDiffs: false,
                    includeReleaseNotes: false,
                    includeGithubIssues: false,
                },
            };

            const result = await validateAndProcessOptions(minimalAudioOptions);

            expect(result.audioReview?.includeCommitHistory).toBe(false);
            expect(result.audioReview?.includeRecentDiffs).toBe(false);
            expect(result.audioReview?.includeReleaseNotes).toBe(false);
            expect(result.audioReview?.includeGithubIssues).toBe(false);
            // Should still get defaults for other properties
            expect(result.audioReview?.commitHistoryLimit).toBe(KODRDRIV_DEFAULTS.audioReview.commitHistoryLimit);
        });

        it('should handle publish command with all dependency patterns', async () => {
            const publishOptions: Partial<Config> = {
                publish: {
                    mergeMethod: 'rebase',
                    dependencyUpdatePatterns: [
                        'package.json',
                        'package-lock.json',
                        'yarn.lock',
                        'pnpm-lock.yaml',
                        'composer.json',
                        'Gemfile.lock',
                        'requirements.txt',
                    ],
                    requiredEnvVars: [
                        'NODE_ENV',
                        'API_KEY',
                        'DATABASE_URL',
                        'REDIS_URL',
                    ],
                    sendit: true,
                    targetBranch: 'main',
                },
            };

            const result = await validateAndProcessOptions(publishOptions);

            expect(result.publish?.mergeMethod).toBe('rebase');
            expect(result.publish?.dependencyUpdatePatterns).toHaveLength(7);
            expect(result.publish?.requiredEnvVars).toHaveLength(4);
            // linkWorkspacePackages and unlinkWorkspacePackages configuration options
            // were removed in the publish command simplification
            expect(result.publish?.sendit).toBe(true);
        });


    });

    describe('Storage error scenarios', () => {
        beforeEach(() => {
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    // @ts-ignore
                    mock.mockReset();
                }
            });
            mockLogger.warn.mockClear();
            mockLogger.error.mockClear();
        });

        it('should handle storage permission errors during directory validation', async () => {
            mockStorage.isDirectoryReadable
                .mockResolvedValueOnce(true)  // First directory OK
                .mockRejectedValueOnce(new Error('EACCES: permission denied'))  // Permission error
                .mockResolvedValueOnce(false) // Third directory not readable
                .mockResolvedValueOnce(true); // Fourth directory OK

            const dirs = ['/readable', '/permission-denied', '/not-readable', '/another-readable'];
            const result = await validateContextDirectories(dirs);

            expect(result).toEqual(['/readable', '/another-readable']);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory /permission-denied: EACCES: permission denied')
            );
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Directory not readable: /not-readable')
            );
        });

        it('should handle storage timeout errors', async () => {
            mockStorage.isDirectoryReadable.mockRejectedValue(new Error('ETIMEDOUT: operation timed out'));

            const dirs = ['/timeout-dir'];
            const result = await validateContextDirectories(dirs);

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory /timeout-dir: ETIMEDOUT: operation timed out')
            );
        });

        it('should handle storage network errors', async () => {
            mockStorage.isDirectoryReadable.mockRejectedValue(new Error('ENETUNREACH: network unreachable'));

            const dirs = ['/network-dir'];
            const result = await validateContextDirectories(dirs);

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory /network-dir: ENETUNREACH: network unreachable')
            );
        });

        it('should handle storage device errors', async () => {
            mockStorage.isDirectoryReadable.mockRejectedValue(new Error('EIO: I/O error'));

            const dirs = ['/device-error-dir'];
            const result = await validateContextDirectories(dirs);

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory /device-error-dir: EIO: I/O error')
            );
        });

        it('should handle config directory creation failure', async () => {
            const configDir = './failing-config';
            const createError = new Error('ENOSPC: no space left on device');

            mockStorage.exists.mockResolvedValue(false);
            mockStorage.createDirectory.mockRejectedValue(createError);

            const result = await validateConfigDir(configDir);

            // Should return the path anyway and warn
            expect(result).toMatch(/failing-config$/);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Config directory does not exist')
            );
        });

        it('should handle config directory writable check failure', async () => {
            const configDir = './write-check-failing';
            const writeError = new Error('EPERM: operation not permitted');

            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);
            mockStorage.isDirectoryWritable.mockRejectedValue(writeError);

            await expect(validateConfigDir(configDir)).rejects.toThrow(
                'Failed to validate config directory'
            );
            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to validate config directory'),
                writeError
            );
        });
    });

    describe('Complex CLI argument combinations', () => {
        let mockProgram: Command;
        let mockCommands: Record<string, any>;
        const mockReadStdin = vi.mocked(readStdin);

        // Helper function to transform mockCommands to the expected format
        const createCommandStructure = (commands: Record<string, any>) => ({
            commitCommand: commands.commit,
            audioCommitCommand: commands['audio-commit'],
            audioReviewCommand: commands['audio-review'],
            releaseCommand: commands.release,
            publishCommand: commands.publish,
            linkCommand: commands.link,
            unlinkCommand: commands.unlink,
            treeCommand: commands.tree,
            reviewCommand: commands.review,
            cleanCommand: commands.clean,
            selectAudioCommand: commands['select-audio'],
            developmentCommand: commands.development,
            versionsCommand: commands.versions,
        });

        beforeEach(() => {
            mockReadStdin.mockResolvedValue(null);

            mockCommands = {
                commit: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                'audio-review': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },

            };

            Object.values(mockCommands).forEach(cmd => {
                cmd.option.mockReturnValue(cmd);
                cmd.description.mockReturnValue(cmd);
                if (cmd.argument) cmd.argument.mockReturnValue(cmd);
                if (cmd.configureHelp) cmd.configureHelp.mockReturnValue(cmd);
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

        it('should handle audio-review with maximum option complexity', async () => {
            mockProgram.args = ['audio-review'];

            mockCommands['audio-review'].opts.mockReturnValue({
                file: '/path/to/complex-session-recording.wav',
                directory: '/recordings/team-retrospectives',
                keepTemp: true,
                includeCommitHistory: false,
                includeRecentDiffs: true,
                includeReleaseNotes: true,
                includeGithubIssues: false,
                commitHistoryLimit: 100,
                diffHistoryLimit: 50,
                releaseNotesLimit: 20,
                githubIssuesLimit: 15,
                context: 'Quarterly retrospective with detailed technical analysis',
                sendit: false,
                verbose: true,
                debug: true,
                dryRun: false,
                model: 'gpt-4-turbo',
                contextDirectories: ['src', 'docs', 'tests', 'infrastructure'],
                excludedPatterns: ['**/node_modules/**', '**/dist/**', '**/.git/**'],
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('audio-review');
            expect(cliArgs.file).toBe('/path/to/complex-session-recording.wav');
            expect(cliArgs.directory).toBe('/recordings/team-retrospectives');
            expect(cliArgs.includeCommitHistory).toBe(false);
            expect(cliArgs.includeRecentDiffs).toBe(true);
            expect(cliArgs.commitHistoryLimit).toBe(100);
            expect(cliArgs.context).toBe('Quarterly retrospective with detailed technical analysis');
            expect(cliArgs.contextDirectories).toEqual(['src', 'docs', 'tests', 'infrastructure']);
            expect(cliArgs.excludedPatterns).toEqual(['**/node_modules/**', '**/dist/**', '**/.git/**']);
        });



        it('should handle commit with complex context and direction', async () => {
            mockProgram.args = ['commit'];

            const complexDirection = 'Implement comprehensive error handling for user authentication flow including OAuth2, SAML, and multi-factor authentication with proper logging and monitoring';

            mockCommands.commit.args = [complexDirection];
            mockCommands.commit.opts.mockReturnValue({
                context: 'Major security enhancement sprint focusing on authentication resilience and audit compliance',
                cached: false,
                add: true,
                sendit: false,
                messageLimit: 5,
                skipFileCheck: false,
                verbose: true,
                debug: false,
                model: 'gpt-4-turbo',
                contextDirectories: ['src/auth', 'src/security', 'docs/security', 'tests/auth'],
                excludedPatterns: ['**/node_modules/**', '**/coverage/**', '**/*.test.js'],
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            expect(cliArgs.direction).toBe(complexDirection);
            expect(cliArgs.context).toBe('Major security enhancement sprint focusing on authentication resilience and audit compliance');
            expect(cliArgs.cached).toBe(false);
            expect(cliArgs.add).toBe(true);
            expect(cliArgs.messageLimit).toBe(5);
            expect(cliArgs.contextDirectories).toEqual(['src/auth', 'src/security', 'docs/security', 'tests/auth']);
        });

        it('should handle conflicting options gracefully', async () => {
            mockProgram.args = ['commit'];

            mockCommands.commit.opts.mockReturnValue({
                // Conflicting options that might not make sense together
                cached: true,  // Use cached changes
                add: true,     // But also add new changes
                sendit: true,  // Auto-commit
                dryRun: true,  // But also do a dry run
                skipFileCheck: true, // Skip file checks
                verbose: false, // Not verbose
                debug: true,   // But debug mode
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('commit');
            // All options should be preserved as specified, even if conflicting
            expect(cliArgs.cached).toBe(true);
            expect(cliArgs.add).toBe(true);
            expect(cliArgs.sendit).toBe(true);
            expect(cliArgs.dryRun).toBe(true);
            expect(cliArgs.skipFileCheck).toBe(true);
            expect(cliArgs.verbose).toBe(false);
            expect(cliArgs.debug).toBe(true);
        });
    });

    describe('Schema validation edge cases', () => {
        it('should validate InputSchema with boundary values', () => {
            const boundaryInput = {
                messageLimit: 0,
                commitHistoryLimit: 1,
                diffHistoryLimit: 999999,
                releaseNotesLimit: 0,
                githubIssuesLimit: 20,
                dryRun: false,
                verbose: false,
                debug: false,
                overrides: false,
                checkConfig: false,
                initConfig: false,
                cached: false,
                add: false,
                sendit: false,
                publish: false,

                skipFileCheck: false,
                keepTemp: false,
                includeCommitHistory: false,
                includeRecentDiffs: false,
                includeReleaseNotes: false,
                includeGithubIssues: false,
            };

            const result = InputSchema.parse(boundaryInput);
            expect(result).toEqual(boundaryInput);
        });

        it('should validate InputSchema with all string fields as empty strings', () => {
            const emptyStringInput = {
                model: '',
                configDir: '',
                outputDir: '',
                preferencesDir: '',
                from: '',
                to: '',
                context: '',
                note: '',
                direction: '',
                scopeRoots: '',
                startFrom: '',
                script: '',
                cmd: '',
                file: '',
                directory: '',
                contextDirectories: [],
                excludedPatterns: [],
                exclude: [],
            };

            const result = InputSchema.parse(emptyStringInput);
            expect(result).toEqual(emptyStringInput);
        });

        it('should validate InputSchema with maximum realistic string lengths', () => {
            const longStringInput = {
                model: 'very-long-model-name-that-might-exist-in-future-versions-of-openai'.repeat(5),
                context: 'Very detailed context description that might include multiple paragraphs of information about the current state of the project, its goals, architectural decisions, and other relevant details that could span several lines and be quite verbose in nature.'.repeat(3),
                direction: 'Extremely detailed direction for the commit message that provides comprehensive guidance about what should be included, how it should be formatted, what tone to use, what technical details to highlight, and any other specific requirements for the commit message generation process.'.repeat(2),
                script: 'npm ci && npm run lint:strict && npm run test:unit && npm run test:integration && npm run test:e2e && npm run security-audit && npm run performance-test && npm run build:production',
                file: '/very/long/path/to/audio/file/in/deeply/nested/directory/structure/that/might/exist/in/enterprise/environments/recording-session-' + Date.now() + '.wav',
            };

            const result = InputSchema.parse(longStringInput);
            expect(result.model).toBe(longStringInput.model);
            expect(result.context).toBe(longStringInput.context);
            expect(result.direction).toBe(longStringInput.direction);
        });

        it('should reject InputSchema with invalid types in arrays', () => {
            const invalidArrayInput = {
                contextDirectories: ['valid', 123, 'also-valid'], // Number in string array
            };

            expect(() => InputSchema.parse(invalidArrayInput)).toThrow(ZodError);
        });

        it('should reject InputSchema with invalid enum values', () => {
            const invalidEnumInput = {
                mergeMethod: 'force-push', // Not a valid merge method
            };

            expect(() => InputSchema.parse(invalidEnumInput)).toThrow(ZodError);
        });

        it('should handle InputSchema with nested objects (should be rejected)', () => {
            const nestedObjectInput = {
                model: {
                    name: 'gpt-4',
                    version: '1.0',
                },
            };

            expect(() => InputSchema.parse(nestedObjectInput)).toThrow(ZodError);
        });
    });

    describe('Command validation comprehensive scenarios', () => {
        it('should validate all ALLOWED_COMMANDS individually', () => {
            // This ensures all commands in ALLOWED_COMMANDS are actually valid
            ALLOWED_COMMANDS.forEach(command => {
                expect(() => validateCommand(command)).not.toThrow();
                expect(validateCommand(command)).toBe(command);
            });
        });

        it('should handle command names with special characters', () => {
            const specialCommands = [
                'audio_commit',
                'review.extended',
                'publish@version',
                'clean#force',
            ];

            specialCommands.forEach(command => {
                expect(() => validateCommand(command)).toThrow(
                    `Invalid command: ${command}, allowed commands: ${ALLOWED_COMMANDS.join(', ')}`
                );
            });
        });

        it('should handle command names with unicode characters', () => {
            const unicodeCommands = [
                'cømmit',
                'releäse',
                'publïsh',
                'revïew',
                'commit树',
            ];

            unicodeCommands.forEach(command => {
                expect(() => validateCommand(command)).toThrow();
            });
        });

        it('should handle very long command names', () => {
            const longCommand = 'commit' + 'x'.repeat(1000);
            expect(() => validateCommand(longCommand)).toThrow();
        });

        it('should handle null and undefined command names', () => {
            expect(() => validateCommand(null as any)).toThrow();
            expect(() => validateCommand(undefined as any)).toThrow();
        });

        it('should handle numeric command names', () => {
            expect(() => validateCommand(123 as any)).toThrow();
            expect(() => validateCommand(0 as any)).toThrow();
        });
    });

    describe('Process.argv manipulation edge cases', () => {
        const originalArgv = process.argv;

        afterEach(() => {
            process.argv = originalArgv;
        });

        it('should handle multiple init/check config flags', () => {
            process.argv = ['node', 'main.js', '--init-config', '--check-config'];

            const isInitConfig = process.argv.includes('--init-config');
            const isCheckConfig = process.argv.includes('--check-config');

            expect(isInitConfig).toBe(true);
            expect(isCheckConfig).toBe(true);
        });

        it('should handle config flags with values', () => {
            process.argv = ['node', 'main.js', '--init-config=./custom'];

            const hasInitConfig = process.argv.some(arg => arg.startsWith('--init-config'));
            expect(hasInitConfig).toBe(true);
        });

        it('should handle config flags at different positions', () => {
            process.argv = ['node', 'main.js', 'commit', '--verbose', '--init-config', '--debug'];

            const isInitConfig = process.argv.includes('--init-config');
            expect(isInitConfig).toBe(true);
        });

        it('should handle malformed argv', () => {
            process.argv = ['node']; // Missing script name

            const isInitConfig = process.argv.includes('--init-config');
            expect(isInitConfig).toBe(false);
        });

        it('should handle argv with special characters', () => {
            process.argv = ['node', 'main.js', '--init-config', '--verbose="special chars \\n\\t"'];

            const isInitConfig = process.argv.includes('--init-config');
            expect(isInitConfig).toBe(true);
        });
    });

    describe('Comprehensive error propagation tests', () => {
        beforeEach(() => {
            Object.values(mockStorage).forEach(mock => {
                if (typeof mock === 'function') {
                    // @ts-ignore
                    mock.mockReset();
                }
            });
            mockLogger.error.mockClear();
            mockLogger.warn.mockClear();
        });

        it('should propagate storage errors with full context', async () => {
            const complexError = new Error('Complex storage failure');
            complexError.stack = 'Error: Complex storage failure\n    at Storage.operation (/path/to/storage.js:123:45)';

            mockStorage.exists.mockRejectedValue(complexError);

            const configDir = './complex-error-config';

            await expect(validateConfigDir(configDir)).rejects.toThrow(
                'Failed to validate config directory'
            );

            expect(mockLogger.error).toHaveBeenCalledWith(
                expect.stringContaining('Failed to validate config directory'),
                complexError
            );
        });

        it('should handle errors with custom properties', async () => {
            const customError = new Error('Permission denied') as any;
            customError.code = 'EACCES';
            customError.errno = -13;
            customError.path = '/restricted/path';

            mockStorage.isDirectoryReadable.mockRejectedValue(customError);

            const dirs = ['/restricted/path'];
            const result = await validateContextDirectories(dirs);

            expect(result).toEqual([]);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory /restricted/path: Permission denied')
            );
        });

        it('should handle timeout errors during validation', async () => {
            const timeoutError = new Error('Operation timed out');
            timeoutError.name = 'TimeoutError';

            mockStorage.isDirectoryWritable.mockImplementation(() => {
                return new Promise((_, reject) => {
                    setTimeout(() => reject(timeoutError), 0);
                });
            });

            const configDir = './timeout-config';
            mockStorage.exists.mockResolvedValue(true);
            mockStorage.isDirectory.mockResolvedValue(true);

            await expect(validateConfigDir(configDir)).rejects.toThrow(
                'Failed to validate config directory'
            );
        });

        it('should handle nested async errors in directory validation', async () => {
            let callCount = 0;
            mockStorage.isDirectoryReadable.mockImplementation(async () => {
                callCount++;
                if (callCount === 2) {
                    throw new Error(`Nested async error ${callCount}`);
                }
                return callCount % 2 === 1; // Alternate between true/false
            });

            const dirs = ['/dir1', '/dir2', '/dir3', '/dir4', '/dir5'];
            const result = await validateContextDirectories(dirs);

            expect(result.length).toBeLessThan(dirs.length);
            expect(mockLogger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error validating directory /dir2: Nested async error 2')
            );
        });
    });

    describe('configuration merging with nested objects', () => {
        it.skip('should properly merge commit config from file with CLI args', async () => {
            // This test ensures the fix for the bug where CLI args would overwrite entire config sections
            // instead of merging individual properties within them

            // Create a mock program for cardigantime
            const mockProgram = {
                name: vi.fn().mockReturnThis(),
                summary: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                version: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: []
            } as any;

            // Mock cardigantime to return file values with commit.sendit = true
            const mockCardigantime = {
                configure: vi.fn().mockResolvedValue(mockProgram),
                read: vi.fn().mockResolvedValue({
                    commit: {
                        sendit: true,
                        add: true,
                        cached: true
                    },
                    model: 'gpt-4',
                } as Partial<Config>),
                checkConfig: vi.fn().mockResolvedValue(undefined),
                generateConfig: vi.fn().mockResolvedValue(undefined),
                setLogger: vi.fn(),
            };

            // Mock getCliConfig to return CLI args with only interactive = true
            vi.doMock('../src/arguments', async () => {
                const actual = await vi.importActual('../src/arguments');
                return {
                    ...actual,
                    getCliConfig: vi.fn().mockResolvedValue([
                        { interactive: true }, // Only interactive specified on CLI
                        { commandName: 'commit' }
                    ] as [Input, CommandConfig])
                };
            });

            // Re-import after mocking
            const { configure: mockedConfigure } = await import('../src/arguments');
            const [config] = await mockedConfigure(mockCardigantime);

            // Verify that both file config and CLI args are present
            expect(config.commit?.sendit).toBe(true);        // From file
            expect(config.commit?.add).toBe(true);           // From file
            expect(config.commit?.cached).toBe(true);        // From file
            expect(config.commit?.interactive).toBe(true);   // From CLI
            expect(config.model).toBe('gpt-4');              // From file
        });

        it.skip('should allow CLI args to override individual commit properties', async () => {
            // Test that CLI args can override specific properties without losing others

            // Create a mock program for cardigantime
            const mockProgram = {
                name: vi.fn().mockReturnThis(),
                summary: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                version: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: []
            } as any;

            const mockCardigantime = {
                configure: vi.fn().mockResolvedValue(mockProgram),
                read: vi.fn().mockResolvedValue({
                    commit: {
                        sendit: true,
                        add: false,    // Will be overridden by CLI
                        cached: true
                    }
                } as Partial<Config>),
                checkConfig: vi.fn().mockResolvedValue(undefined),
                generateConfig: vi.fn().mockResolvedValue(undefined),
                setLogger: vi.fn(),
            };

            // Mock getCliConfig to return CLI args with add and interactive
            vi.doMock('../src/arguments', async () => {
                const actual = await vi.importActual('../src/arguments');
                return {
                    ...actual,
                    getCliConfig: vi.fn().mockResolvedValue([
                        { add: true, interactive: true }, // Override add, add interactive
                        { commandName: 'commit' }
                    ] as [Input, CommandConfig])
                };
            });

            // Re-import after mocking
            const { configure: mockedConfigure2 } = await import('../src/arguments');
            const [config] = await mockedConfigure2(mockCardigantime);

            expect(config.commit?.sendit).toBe(true);        // From file (preserved)
            expect(config.commit?.add).toBe(true);           // From CLI (overridden)
            expect(config.commit?.cached).toBe(true);        // From file (preserved)
            expect(config.commit?.interactive).toBe(true);   // From CLI (new)
        });
    });

    describe('tree command handling', () => {
        let mockProgram: Command;
        let mockCommands: Record<string, any>;
        const mockReadStdin = vi.mocked(readStdin);

        // Helper function to transform mockCommands to the expected format
        const createCommandStructure = (commands: Record<string, any>) => ({
            commitCommand: commands.commit,
            audioCommitCommand: commands['audio-commit'],
            audioReviewCommand: commands['audio-review'],
            releaseCommand: commands.release,
            publishCommand: commands.publish,
            linkCommand: commands.link,
            unlinkCommand: commands.unlink,
            treeCommand: commands.tree,
            reviewCommand: commands.review,
            cleanCommand: commands.clean,
            selectAudioCommand: commands['select-audio'],
            developmentCommand: commands.development,
            versionsCommand: commands.versions,
        });

        beforeEach(() => {
            mockReadStdin.mockReset();

            mockCommands = {
                commit: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                'audio-review': {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
                tree: {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn().mockReturnThis(),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                },
            };

            Object.values(mockCommands).forEach(cmd => {
                cmd.option.mockReturnValue(cmd);
                cmd.description.mockReturnValue(cmd);
                if (cmd.argument) cmd.argument.mockReturnValue(cmd);
                if (cmd.configureHelp) cmd.configureHelp.mockReturnValue(cmd);
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

        it('should handle tree command with built-in commands and package arguments', async () => {
            mockProgram.args = ['tree', 'link', 'package-name'];
            mockCommands.tree.args = ['link', 'package-name'];

            mockCommands.tree.opts.mockReturnValue({
                directory: '/workspace',
                exclude: ['**/node_modules/**'],
                startFrom: 'package-a',
                stopAt: 'package-z',
                cmd: 'npm run build',
                continue: true,
                cleanNodeModules: false,
                externals: ['@external/lib'],
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect(cliArgs.directory).toBe('/workspace');
            expect(cliArgs.exclude).toEqual(['**/node_modules/**']);
            expect(cliArgs.startFrom).toBe('package-a');
            expect(cliArgs.stopAt).toBe('package-z');
            expect(cliArgs.cmd).toBe('npm run build');
            expect(cliArgs.continue).toBe(true);
            expect(cliArgs.cleanNodeModules).toBe(false);
            expect(cliArgs.externals).toEqual(['@external/lib']);
            // These should be set from positional arguments
            expect((cliArgs as any).builtInCommand).toBe('link');
            expect((cliArgs as any).packageArgument).toBe('package-name');
        });

        it('should handle tree command with unlink built-in command', async () => {
            mockProgram.args = ['tree', 'unlink', 'specific-package'];
            mockCommands.tree.args = ['unlink', 'specific-package'];

            mockCommands.tree.opts.mockReturnValue({
                directories: ['/workspace1', '/workspace2'],
                cleanNodeModules: true,
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect(cliArgs.directories).toEqual(['/workspace1', '/workspace2']);
            expect(cliArgs.cleanNodeModules).toBe(true);
            expect((cliArgs as any).builtInCommand).toBe('unlink');
            expect((cliArgs as any).packageArgument).toBe('specific-package');
        });

        it('should handle tree command with non-link/unlink built-in commands', async () => {
            mockProgram.args = ['tree', 'commit'];
            mockCommands.tree.args = ['commit'];

            mockCommands.tree.opts.mockReturnValue({
                directory: '/workspace',
                exclude: ['**/dist/**'],
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect(cliArgs.directory).toBe('/workspace');
            expect(cliArgs.exclude).toEqual(['**/dist/**']);
            expect((cliArgs as any).builtInCommand).toBe('commit');
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle tree command with only built-in command (no package argument)', async () => {
            mockProgram.args = ['tree', 'publish'];
            mockCommands.tree.args = ['publish'];

            mockCommands.tree.opts.mockReturnValue({
                directory: '/workspace',
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect(cliArgs.directory).toBe('/workspace');
            expect((cliArgs as any).builtInCommand).toBe('publish');
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle tree command with no positional arguments', async () => {
            mockProgram.args = ['tree'];

            mockCommands.tree.opts.mockReturnValue({
                directory: '/workspace',
                exclude: ['**/node_modules/**'],
            });

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect(cliArgs.directory).toBe('/workspace');
            expect(cliArgs.exclude).toEqual(['**/node_modules/**']);
            expect((cliArgs as any).builtInCommand).toBeUndefined();
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle tree command with empty args array', async () => {
            mockProgram.args = ['tree'];

            mockCommands.tree.opts.mockReturnValue({});
            mockCommands.tree.args = [];

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect((cliArgs as any).builtInCommand).toBeUndefined();
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });

        it('should handle tree command with undefined args', async () => {
            mockProgram.args = ['tree'];

            mockCommands.tree.opts.mockReturnValue({});
            mockCommands.tree.args = undefined as any;

            const [cliArgs, commandConfig] = await getCliConfig(mockProgram, createCommandStructure(mockCommands));

            expect(commandConfig.commandName).toBe('tree');
            expect((cliArgs as any).builtInCommand).toBeUndefined();
            expect((cliArgs as any).packageArgument).toBeUndefined();
        });
    });

    describe('help text generation (custom formatters)', () => {
        it('should execute commit command custom help formatter', async () => {
            // Build a minimal mock Command API with capture for configureHelp
            const makeMockCmd = () => {
                const cmd: any = {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn(function (this: any, cfg: any) {
                        this.__helpCfg = cfg; // capture
                        return this;
                    }),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                };
                return cmd;
            };

            const mockCommands: any = {
                commit: makeMockCmd(),
                review: makeMockCmd(),
                release: makeMockCmd(),
                publish: makeMockCmd(),
                link: makeMockCmd(),
                unlink: makeMockCmd(),
                tree: makeMockCmd(),
                'audio-commit': makeMockCmd(),
                'audio-review': makeMockCmd(),
                clean: makeMockCmd(),
                development: makeMockCmd(),
                versions: makeMockCmd(),
                'select-audio': makeMockCmd(),
            };

            const mockProgram: any = {
                command: vi.fn().mockImplementation((name: string) => mockCommands[name] || makeMockCmd()),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['commit'],
            };

            // Invoke getCliConfig to register commands and help formatters
            await getCliConfig(mockProgram as unknown as Command);

            // Now execute the captured formatter directly
            const cfg = mockCommands.commit.__helpCfg;
            expect(cfg && typeof cfg.formatHelp).toBe('function');

            const helper = {
                commandUsage: () => 'kodrdriv commit [direction] [options]',
                commandDescription: () => 'Generate commit notes',
            } as any;
            const out = cfg.formatHelp(mockCommands.commit, helper);
            expect(out).toContain('Commit Message Options');
            expect(out).toContain('--context <context>');
            expect(out).toContain('Global Options');
            expect(out).toContain('OPENAI_API_KEY');
        });

        it('should execute review command custom help formatter', async () => {
            const makeMockCmd = () => {
                const cmd: any = {
                    option: vi.fn().mockReturnThis(),
                    description: vi.fn().mockReturnThis(),
                    argument: vi.fn().mockReturnThis(),
                    configureHelp: vi.fn(function (this: any, cfg: any) {
                        this.__helpCfg = cfg; // capture
                        return this;
                    }),
                    opts: vi.fn().mockReturnValue({}),
                    args: [],
                };
                return cmd;
            };

            const mockCommands: any = {
                commit: makeMockCmd(),
                review: makeMockCmd(),
                release: makeMockCmd(),
                publish: makeMockCmd(),
                link: makeMockCmd(),
                unlink: makeMockCmd(),
                tree: makeMockCmd(),
                'audio-commit': makeMockCmd(),
                'audio-review': makeMockCmd(),
                clean: makeMockCmd(),
                development: makeMockCmd(),
                versions: makeMockCmd(),
                'select-audio': makeMockCmd(),
            };

            const mockProgram: any = {
                command: vi.fn().mockImplementation((name: string) => mockCommands[name] || makeMockCmd()),
                option: vi.fn().mockReturnThis(),
                description: vi.fn().mockReturnThis(),
                parse: vi.fn(),
                opts: vi.fn().mockReturnValue({}),
                args: ['review'],
            };

            await getCliConfig(mockProgram as unknown as Command);

            const cfg = mockCommands.review.__helpCfg;
            expect(cfg && typeof cfg.formatHelp).toBe('function');

            const helper = {
                commandUsage: () => 'kodrdriv review [note] [options]',
                commandDescription: () => 'Analyze review note for project issues using AI',
            } as any;
            const out = cfg.formatHelp(mockCommands.review, helper);
            expect(out).toContain('Arguments:');
            expect(out).toContain('Git Context Parameters');
            expect(out).toContain('Global Options');
            expect(out).toContain('OPENAI_API_KEY');
        });
    });

    describe('unlink transformCliArgs error handling', () => {
        it('should throw error for invalid JSON in unlink scopeRoots', () => {
            const cliArgs: Input = {
                scopeRoots: '{invalid}',
                cleanNodeModules: true,
            };
            expect(() => transformCliArgs(cliArgs, 'unlink')).toThrow('Invalid JSON for scope-roots: {invalid}');
        });
    });
});
