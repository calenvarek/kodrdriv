import { describe, it, beforeEach, afterEach, expect, vi } from 'vitest';

// Mock all external dependencies
vi.mock('@theunwalked/cardigantime', () => ({
    create: vi.fn()
}));

vi.mock('../src/logging', () => ({
    getLogger: vi.fn().mockReturnValue({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
        verbose: vi.fn(),
        silly: vi.fn()
    }),
    setLogLevel: vi.fn()
}));

vi.mock('../src/arguments', () => ({
    configure: vi.fn()
}));

vi.mock('../src/commands/commit', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/audio-commit', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/release', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/publish', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/publish-tree', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/link', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/unlink', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/audio-review', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/clean', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/review', () => ({
    execute: vi.fn()
}));

vi.mock('../src/commands/select-audio', () => ({
    execute: vi.fn()
}));

vi.mock('../src/constants', () => ({
    COMMAND_AUDIO_COMMIT: 'audio-commit',
    COMMAND_AUDIO_REVIEW: 'audio-review',
    COMMAND_CHECK_CONFIG: 'check-config',
    COMMAND_CLEAN: 'clean',
    COMMAND_COMMIT: 'commit',
    COMMAND_INIT_CONFIG: 'init-config',
    COMMAND_LINK: 'link',
    COMMAND_PUBLISH: 'publish',
    COMMAND_PUBLISH_TREE: 'publish-tree',
    COMMAND_RELEASE: 'release',
    COMMAND_REVIEW: 'review',
    COMMAND_SELECT_AUDIO: 'select-audio',
    COMMAND_UNLINK: 'unlink',
    DEFAULT_CONFIG_DIR: '.kodrdriv'
}));

vi.mock('../src/types', () => ({
    ConfigSchema: {
        shape: {}
    }
}));

describe('Application module', () => {
    let Application: any;
    let Cardigantime: any;
    let Logging: any;
    let Arguments: any;
    let Commands: any;
    let mockLogger: any;
    let mockCardigantime: any;
    let originalArgv: string[];
    let originalConsoleLog: any;

    beforeEach(async () => {
        // Store original process.argv and console.log
        originalArgv = [...process.argv];
        originalConsoleLog = console.log;
        console.log = vi.fn();

        // Clear all mocks
        vi.clearAllMocks();

        // Import modules after mocking
        Cardigantime = await import('@theunwalked/cardigantime');
        Logging = await import('../src/logging');
        Arguments = await import('../src/arguments');
        Commands = {
            Commit: await import('../src/commands/commit'),
            AudioCommit: await import('../src/commands/audio-commit'),
            Release: await import('../src/commands/release'),
            Publish: await import('../src/commands/publish'),
            PublishTree: await import('../src/commands/publish-tree'),
            Link: await import('../src/commands/link'),
            Unlink: await import('../src/commands/unlink'),
            AudioReview: await import('../src/commands/audio-review'),
            Clean: await import('../src/commands/clean'),
            Review: await import('../src/commands/review'),
            SelectAudio: await import('../src/commands/select-audio'),
        };
        Application = await import('../src/application');

        // Setup mock implementations
        mockLogger = {
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
            debug: vi.fn(),
            verbose: vi.fn(),
            silly: vi.fn()
        };

        mockCardigantime = {
            setLogger: vi.fn()
        };

        Cardigantime.create.mockReturnValue(mockCardigantime);
        Logging.getLogger.mockReturnValue(mockLogger);

        // Default configuration mock
        Arguments.configure.mockResolvedValue([
            { verbose: false, debug: false }, // runConfig
            {}, // secureConfig
            { commandName: 'commit' } // commandConfig
        ]);
    });

    afterEach(() => {
        // Restore original process.argv and console.log
        process.argv = originalArgv;
        console.log = originalConsoleLog;
    });

    describe('configureEarlyLogging', () => {
        it('should set debug log level when --debug flag is present', () => {
            process.argv = ['node', 'main.js', '--debug'];

            Application.configureEarlyLogging();

            expect(Logging.setLogLevel).toHaveBeenCalledWith('debug');
        });

        it('should set verbose log level when --verbose flag is present', () => {
            process.argv = ['node', 'main.js', '--verbose'];

            Application.configureEarlyLogging();

            expect(Logging.setLogLevel).toHaveBeenCalledWith('verbose');
        });

        it('should prefer debug over verbose when both flags are present', () => {
            process.argv = ['node', 'main.js', '--verbose', '--debug'];

            Application.configureEarlyLogging();

            expect(Logging.setLogLevel).toHaveBeenCalledWith('debug');
        });

        it('should not set log level when no flags are present', () => {
            process.argv = ['node', 'main.js'];

            Application.configureEarlyLogging();

            expect(Logging.setLogLevel).not.toHaveBeenCalled();
        });
    });

    describe('runApplication', () => {
        it('should configure CardiganTime with correct options', async () => {
            await Application.runApplication();

            expect(Cardigantime.create).toHaveBeenCalledWith({
                defaults: {
                    configDirectory: '.kodrdriv',
                    pathResolution: {
                        resolvePathArray: ['contextDirectories']
                    },
                    fieldOverlaps: {
                        'contextDirectories': 'prepend'
                    }
                },
                features: ['config', 'hierarchical'],
                configShape: {},
                logger: mockLogger
            });
        });

        it('should configure logging based on verbose flag', async () => {
            Arguments.configure.mockResolvedValue([
                { verbose: true, debug: false },
                {},
                { commandName: 'commit' }
            ]);

            await Application.runApplication();

            expect(Logging.setLogLevel).toHaveBeenCalledWith('verbose');
        });

        it('should configure logging based on debug flag', async () => {
            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: true },
                {},
                { commandName: 'commit' }
            ]);

            await Application.runApplication();

            expect(Logging.setLogLevel).toHaveBeenCalledWith('debug');
        });

        it('should set logger on cardigantime instance', async () => {
            await Application.runApplication();

            expect(mockCardigantime.setLogger).toHaveBeenCalledWith(mockLogger);
        });

        it('should handle check-config command and return early', async () => {
            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'check-config' }
            ]);

            await Application.runApplication();

            // Should not execute any commands
            expect(Commands.Commit.execute).not.toHaveBeenCalled();
            // Should not call console.log since function returns early
            expect(console.log).not.toHaveBeenCalled();
        });

        it('should handle init-config command and return early', async () => {
            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'init-config' }
            ]);

            await Application.runApplication();

            // Should not execute any commands
            expect(Commands.Commit.execute).not.toHaveBeenCalled();
            // Should not call console.log since function returns early
            expect(console.log).not.toHaveBeenCalled();
        });

        it('should execute commit command', async () => {
            process.argv = ['node', 'main.js', 'commit'];
            Commands.Commit.execute.mockResolvedValue('Commit completed successfully');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'commit' }
            ]);

            await Application.runApplication();

            expect(Commands.Commit.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nCommit completed successfully\n\n');
        });

        it('should execute audio-commit command', async () => {
            process.argv = ['node', 'main.js', 'audio-commit'];
            Commands.AudioCommit.execute.mockResolvedValue('Audio commit completed successfully');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'audio-commit' }
            ]);

            await Application.runApplication();

            expect(Commands.AudioCommit.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nAudio commit completed successfully\n\n');
        });

        it('should execute release command and format output', async () => {
            process.argv = ['node', 'main.js', 'release'];
            Commands.Release.execute.mockResolvedValue({
                title: 'Release v1.0.0',
                body: 'Release notes content'
            });

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'release' }
            ]);

            await Application.runApplication();

            expect(Commands.Release.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nRelease v1.0.0\n\nRelease notes content\n\n');
        });

        it('should execute publish command', async () => {
            process.argv = ['node', 'main.js', 'publish'];

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'publish' }
            ]);

            await Application.runApplication();

            expect(Commands.Publish.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\n\n\n');
        });

        it('should execute publish-tree command and handle directory mapping', async () => {
            process.argv = ['node', 'main.js', 'publish-tree'];
            Commands.PublishTree.execute.mockResolvedValue('Publish tree completed');

            const runConfig: any = {
                verbose: false,
                debug: false,
                audioReview: { directory: '/test/dir' },
                excludedPatterns: ['*.log']
            };

            Arguments.configure.mockResolvedValue([
                runConfig,
                {},
                { commandName: 'publish-tree' }
            ]);

            await Application.runApplication();

            expect(Commands.PublishTree.execute).toHaveBeenCalled();
            expect(runConfig.publishTree?.directory).toBe('/test/dir');
            expect(runConfig.publishTree?.excludedPatterns).toEqual(['*.log']);
            expect(console.log).toHaveBeenCalledWith('\n\nPublish tree completed\n\n');
        });

        it('should execute link command', async () => {
            process.argv = ['node', 'main.js', 'link'];
            Commands.Link.execute.mockResolvedValue('Link completed successfully');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'link' }
            ]);

            await Application.runApplication();

            expect(Commands.Link.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nLink completed successfully\n\n');
        });

        it('should execute unlink command', async () => {
            process.argv = ['node', 'main.js', 'unlink'];
            Commands.Unlink.execute.mockResolvedValue('Unlink completed successfully');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'unlink' }
            ]);

            await Application.runApplication();

            expect(Commands.Unlink.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nUnlink completed successfully\n\n');
        });

        it('should execute audio-review command', async () => {
            process.argv = ['node', 'main.js', 'audio-review'];
            Commands.AudioReview.execute.mockResolvedValue('Audio review completed successfully');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'audio-review' }
            ]);

            await Application.runApplication();

            expect(Commands.AudioReview.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nAudio review completed successfully\n\n');
        });

        it('should execute clean command with default summary', async () => {
            process.argv = ['node', 'main.js', 'clean'];

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'clean' }
            ]);

            await Application.runApplication();

            expect(Commands.Clean.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nOutput directory cleaned successfully.\n\n');
        });

        it('should execute review command', async () => {
            process.argv = ['node', 'main.js', 'review'];
            Commands.Review.execute.mockResolvedValue('Review completed successfully');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'review' }
            ]);

            await Application.runApplication();

            expect(Commands.Review.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nReview completed successfully\n\n');
        });

        it('should execute select-audio command with default summary', async () => {
            process.argv = ['node', 'main.js', 'select-audio'];

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'select-audio' }
            ]);

            await Application.runApplication();

            expect(Commands.SelectAudio.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nAudio selection completed successfully.\n\n');
        });

        it('should handle unknown commands gracefully', async () => {
            process.argv = ['node', 'main.js', 'unknown'];

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'unknown' }
            ]);

            await Application.runApplication();

            // Should not execute any commands
            expect(Commands.Commit.execute).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\n\n\n');
        });

        it('should use command from process.argv when available', async () => {
            process.argv = ['node', 'main.js', 'commit'];
            Commands.Commit.execute.mockResolvedValue('Commit from argv');

            Arguments.configure.mockResolvedValue([
                { verbose: false, debug: false },
                {},
                { commandName: 'different-command' }
            ]);

            await Application.runApplication();

            expect(Commands.Commit.execute).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('\n\nCommit from argv\n\n');
        });
    });
});
