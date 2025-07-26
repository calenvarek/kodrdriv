import * as Cardigantime from '@theunwalked/cardigantime';
import 'dotenv/config';
import { CommandConfig } from 'types';
import * as Arguments from './arguments';
import * as AudioCommit from './commands/audio-commit';
import * as AudioReview from './commands/audio-review';
import * as Clean from './commands/clean';
import * as Commit from './commands/commit';
import * as Link from './commands/link';
import * as Publish from './commands/publish';
import * as PublishTree from './commands/publish-tree';
import * as Release from './commands/release';
import * as Review from './commands/review';
import * as SelectAudio from './commands/select-audio';
import * as Unlink from './commands/unlink';
import { COMMAND_AUDIO_COMMIT, COMMAND_AUDIO_REVIEW, COMMAND_CHECK_CONFIG, COMMAND_CLEAN, COMMAND_COMMIT, COMMAND_INIT_CONFIG, COMMAND_LINK, COMMAND_PUBLISH, COMMAND_PUBLISH_TREE, COMMAND_RELEASE, COMMAND_REVIEW, COMMAND_SELECT_AUDIO, COMMAND_UNLINK, DEFAULT_CONFIG_DIR } from './constants';
import { getLogger, setLogLevel } from './logging';
import { Config, ConfigSchema, SecureConfig } from './types';
import { UserCancellationError } from './error/CommandErrors';

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

    // Cast create to `any` to avoid excessive type instantiation issues in TS compiler
    const createCardigantime: any = (Cardigantime as unknown as { create: unknown }).create as any;

    const cardigantime = createCardigantime({
        defaults: {
            configDirectory: DEFAULT_CONFIG_DIR,
            // Move pathResolution INSIDE defaults
            pathResolution: {
                resolvePathArray: ['contextDirectories'], // Resolve contextDirectories array elements as paths
            },
            // Use fieldOverlaps instead of mergeStrategy, INSIDE defaults
            fieldOverlaps: {
                'contextDirectories': 'prepend', // Use prepend strategy for contextDirectories array
                // Add other field overlap configurations as needed
            },
        },
        features: ['config', 'hierarchical'],
        configShape: ConfigSchema.shape, // No need for 'as any' now
        logger: getLogger(),
    }); // No need for 'as any' at the end

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

    // If we have a specific command argument, use that
    if (command === 'commit' || command === 'audio-commit' || command === 'release' || command === 'publish' || command === 'publish-tree' || command === 'link' || command === 'unlink' || command === 'audio-review' || command === 'clean' || command === 'review' || command === 'select-audio') {
        commandName = command;
    }

    let summary: string = '';

    try {
        if (commandName === COMMAND_COMMIT) {
            summary = await Commit.execute(runConfig);
        } else if (commandName === COMMAND_AUDIO_COMMIT) {
            summary = await AudioCommit.execute(runConfig);
        } else if (commandName === COMMAND_RELEASE) {
            const releaseSummary = await Release.execute(runConfig);
            summary = `${releaseSummary.title}\n\n${releaseSummary.body}`;
        } else if (commandName === COMMAND_PUBLISH) {
            await Publish.execute(runConfig);
        } else if (commandName === COMMAND_PUBLISH_TREE) {
        // Handle publishTree directory mapping from command-specific arguments
            if (runConfig.audioReview?.directory && !runConfig.publishTree?.directory) {
                runConfig.publishTree = runConfig.publishTree || {};
                runConfig.publishTree.directory = runConfig.audioReview.directory;
            }
            // Handle publishTree exclusion patterns - use global excludedPatterns for publish-tree
            if (runConfig.excludedPatterns && !runConfig.publishTree?.excludedPatterns) {
                runConfig.publishTree = runConfig.publishTree || {};
                runConfig.publishTree.excludedPatterns = runConfig.excludedPatterns;
            }
            summary = await PublishTree.execute(runConfig);
        } else if (commandName === COMMAND_LINK) {
            summary = await Link.execute(runConfig);
        } else if (commandName === COMMAND_UNLINK) {
            summary = await Unlink.execute(runConfig);
        } else if (commandName === COMMAND_AUDIO_REVIEW) {
            summary = await AudioReview.execute(runConfig);
        } else if (commandName === COMMAND_CLEAN) {
            await Clean.execute(runConfig);
            summary = 'Output directory cleaned successfully.';
        } else if (commandName === COMMAND_REVIEW) {
            summary = await Review.execute(runConfig);
        } else if (commandName === COMMAND_SELECT_AUDIO) {
            await SelectAudio.execute(runConfig);
            summary = 'Audio selection completed successfully.';
        }

        // eslint-disable-next-line no-console
        console.log(`\n\n${summary}\n\n`);
    } catch (error: any) {
        // Handle user cancellation gracefully
        if (error instanceof UserCancellationError) {
            logger.info(error.message);
            process.exit(0);
        }

        // Re-throw other errors to be handled by main.ts
        throw error;
    }
}
