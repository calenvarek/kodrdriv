import * as Cardigantime from '@theunwalked/cardigantime';
import 'dotenv/config';
import { setLogger as setGitLogger } from '@eldrforge/git-tools';
import { setLogger as setGitHubLogger, setPromptFunction } from '@eldrforge/github-tools';
import { promptConfirmation } from '@eldrforge/shared';
import { CommandConfig } from 'types';
import * as Arguments from './arguments';
import * as AudioCommit from './commands/audio-commit';
import * as AudioReview from './commands/audio-review';
import * as Clean from './commands/clean';
import * as Commit from './commands/commit';
import * as Development from './commands/development';
import * as Link from './commands/link';
import * as Precommit from './commands/precommit';
import * as Publish from './commands/publish';
import * as Release from './commands/release';
import * as Review from './commands/review';
import * as SelectAudio from './commands/select-audio';
import * as Tree from './commands/tree';
import * as Unlink from './commands/unlink';
import * as Updates from './commands/updates';
import * as Versions from './commands/versions';
import { COMMAND_AUDIO_COMMIT, COMMAND_AUDIO_REVIEW, COMMAND_CHECK_CONFIG, COMMAND_CLEAN, COMMAND_COMMIT, COMMAND_DEVELOPMENT, COMMAND_INIT_CONFIG, COMMAND_LINK, COMMAND_PRECOMMIT, COMMAND_PUBLISH, COMMAND_RELEASE, COMMAND_REVIEW, COMMAND_SELECT_AUDIO, COMMAND_TREE, COMMAND_UNLINK, COMMAND_UPDATES, COMMAND_VERSIONS, DEFAULT_CONFIG_DIR, VERSION } from './constants';
import { UserCancellationError } from '@eldrforge/shared';
import { getLogger, setLogLevel } from './logging';
import { Config, SecureConfig } from './types';

/**
 * Print debug information about the command being executed when debug flag is enabled.
 */
function printDebugCommandInfo(commandName: string, runConfig: Config): void {
    if (runConfig.debug) {
        const logger = getLogger();
        logger.info('DEBUG_INFO_HEADER: KodrDriv debug information');
        logger.info('DEBUG_INFO_COMMAND: Command being executed | Command: %s', commandName);
        logger.info('DEBUG_INFO_VERSION: KodrDriv version | Version: %s', VERSION);
        logger.info('DEBUG_INFO_FOOTER: End of debug information');
    }
}

/**
 * Configure early logging based on command line flags.
 *
 * Hey we need this because we need to be able to debug CardiganTime.
 * This method checks for --verbose and --debug flags early in the process
 * before CardiganTime is configured, allowing us to capture debug output
 * from the CardiganTime initialization itself.
 */
export function configureEarlyLogging(): void {
    const hasVerbose = process.argv.includes('--verbose');
    const hasDebug = process.argv.includes('--debug');

    // Set log level based on early flag detection
    if (hasDebug) {
        setLogLevel('debug');
    } else if (hasVerbose) {
        setLogLevel('verbose');
    }
}

export async function runApplication(): Promise<void> {
    // Configure logging early, before CardiganTime initialization
    configureEarlyLogging();

    // Use proper typing for CardiganTime create function
    interface CardigantimeCreateParams {
        defaults?: any;
        features?: string[];
        configShape?: any;
        logger?: any;
    }

    interface CardigantimeInstance {
        read: (args: any) => Promise<any>;
        checkConfig: () => Promise<void>;
        generateConfig: (dir: string) => Promise<void>;
        setLogger: (logger: any) => void;
    }

    const cardigantimeModule = Cardigantime as any;
    const createCardigantime = cardigantimeModule.create as (params: CardigantimeCreateParams) => CardigantimeInstance;

    const cardigantime = createCardigantime({
        defaults: {
            configDirectory: DEFAULT_CONFIG_DIR,
        },
        features: ['config', 'hierarchical'],
        logger: getLogger(),
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [runConfig, secureConfig, commandConfig]: [Config, SecureConfig, CommandConfig] = await Arguments.configure(cardigantime); // Pass cardigantime instance

    // Set log level based on verbose flag
    if (runConfig.verbose) {
        setLogLevel('verbose');
    }
    if (runConfig.debug) {
        setLogLevel('debug');
    }

    const logger = getLogger();
    cardigantime.setLogger(logger);

    // Configure external packages to use our logger and prompt
    setGitLogger(logger);
    setGitHubLogger(logger);
    setPromptFunction(promptConfirmation);

    // Display version information
    logger.info('APPLICATION_STARTING: KodrDriv application initializing | Version: %s | Status: starting', VERSION);

    // Handle check-config command first
    if (commandConfig.commandName === COMMAND_CHECK_CONFIG) {
        // CardiganTime's checkConfig has already been called in Arguments.configure()
        // No additional processing needed here
        return;
    }

    // Handle init-config command
    if (commandConfig.commandName === COMMAND_INIT_CONFIG) {
        // CardiganTime's initConfig has already been called in Arguments.configure()
        // No additional processing needed here
        return;
    }

    // Get the command from Commander
    const command = process.argv[2];
    let commandName = commandConfig.commandName;

    // Handle special case for tree command with built-in command argument
    if (command === 'tree' && process.argv[3]) {
        const treeBuiltInCommand = process.argv[3];
        const supportedBuiltInCommands = ['commit', 'publish', 'link', 'unlink', 'development', 'updates'];
        if (supportedBuiltInCommands.includes(treeBuiltInCommand)) {
            // This is a tree command with built-in command, keep commandName as 'tree'
            commandName = 'tree';
        } else {
            // Unknown tree argument, let it fail naturally in tree.ts
            commandName = 'tree';
        }
    }
    // If we have a specific command argument, use that
    else if (command === 'commit' || command === 'audio-commit' || command === 'release' || command === 'publish' || command === 'tree' || command === 'link' || command === 'unlink' || command === 'audio-review' || command === 'clean' || command === 'precommit' || command === 'review' || command === 'select-audio' || command === 'development' || command === 'versions' || command === 'updates') {
        commandName = command;
    }

    let summary: string = '';

    try {
        // Print debug info at the start of command execution
        if (commandName) {
            printDebugCommandInfo(commandName, runConfig);
        }

        if (commandName === COMMAND_COMMIT) {
            summary = await Commit.execute(runConfig);
        } else if (commandName === COMMAND_AUDIO_COMMIT) {
            summary = await AudioCommit.execute(runConfig);
        } else if (commandName === COMMAND_RELEASE) {
            const releaseSummary = await Release.execute(runConfig);
            summary = `${releaseSummary.title}\n\n${releaseSummary.body}`;
        } else if (commandName === COMMAND_PUBLISH) {
            await Publish.execute(runConfig);
        } else if (commandName === COMMAND_TREE) {
            // Handle tree directories mapping from command-specific arguments
            if (runConfig.audioReview?.directory && !runConfig.tree?.directories) {
                runConfig.tree = runConfig.tree || {};
                runConfig.tree.directories = [runConfig.audioReview.directory];
            }
            // Handle tree exclusion patterns - use global excludedPatterns for tree
            if (runConfig.excludedPatterns && !runConfig.tree?.exclude) {
                runConfig.tree = runConfig.tree || {};
                runConfig.tree.exclude = runConfig.excludedPatterns;
            }
            summary = await Tree.execute(runConfig);
        } else if (commandName === COMMAND_LINK) {
            summary = await Link.execute(runConfig);
        } else if (commandName === COMMAND_UNLINK) {
            summary = await Unlink.execute(runConfig);
        } else if (commandName === COMMAND_AUDIO_REVIEW) {
            summary = await AudioReview.execute(runConfig);
        } else if (commandName === COMMAND_CLEAN) {
            await Clean.execute(runConfig);
            summary = 'Output directory cleaned successfully.';
        } else if (commandName === COMMAND_PRECOMMIT) {
            summary = await Precommit.execute(runConfig);
        } else if (commandName === COMMAND_REVIEW) {
            summary = await Review.execute(runConfig);
        } else if (commandName === COMMAND_SELECT_AUDIO) {
            await SelectAudio.execute(runConfig);
            summary = 'Audio selection completed successfully.';
        } else if (commandName === COMMAND_DEVELOPMENT) {
            summary = await Development.execute(runConfig);
        } else if (commandName === COMMAND_VERSIONS) {
            summary = await Versions.execute(runConfig);
        } else if (commandName === COMMAND_UPDATES) {
            summary = await Updates.execute(runConfig);
        }

        // eslint-disable-next-line no-console
        console.log(`\n\n${summary}\n\n`);
    } catch (error: any) {
        // Handle user cancellation gracefully
        if (error instanceof UserCancellationError) {
            logger.info('APPLICATION_ERROR: Application error occurred | Error: ' + error.message);
            process.exit(0);
        }

        // Re-throw other errors to be handled by main.ts
        throw error;
    }
}
