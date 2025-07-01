#!/usr/bin/env node
import * as Cardigantime from '@theunwalked/cardigantime';
import 'dotenv/config';
import * as Arguments from './arguments';
import * as AudioCommit from './commands/audio-commit';
import * as AudioReview from './commands/audio-review';
import * as Clean from './commands/clean';
import * as Commit from './commands/commit';
import * as Link from './commands/link';
import * as Publish from './commands/publish';
import * as Release from './commands/release';
import * as Unlink from './commands/unlink';
import { COMMAND_AUDIO_COMMIT, COMMAND_AUDIO_REVIEW, COMMAND_CHECK_CONFIG, COMMAND_CLEAN, COMMAND_COMMIT, COMMAND_INIT_CONFIG, COMMAND_LINK, COMMAND_PUBLISH, COMMAND_RELEASE, COMMAND_UNLINK, DEFAULT_CONFIG_DIR } from './constants';
import { getLogger, setLogLevel } from './logging';
import { CommandConfig } from 'types';
import { Config, ConfigSchema, SecureConfig } from './types';

/**
 * Configure early logging based on command line flags.
 * 
 * Hey we need this because we need to be able to debug CardiganTime.
 * This method checks for --verbose and --debug flags early in the process
 * before CardiganTime is configured, allowing us to capture debug output
 * from the CardiganTime initialization itself.
 */
function configureEarlyLogging(): void {
    const hasVerbose = process.argv.includes('--verbose');
    const hasDebug = process.argv.includes('--debug');

    // Set log level based on early flag detection
    if (hasDebug) {
        setLogLevel('debug');
    } else if (hasVerbose) {
        setLogLevel('verbose');
    }
}

export async function main() {
    // Configure logging early, before CardiganTime initialization
    configureEarlyLogging();

    const cardigantime = Cardigantime.create({
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

    try {
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
        if (command === 'commit' || command === 'audio-commit' || command === 'release' || command === 'publish' || command === 'link' || command === 'unlink' || command === 'audio-review' || command === 'clean') {
            commandName = command;
        }

        let summary: string = '';

        if (commandName === COMMAND_COMMIT) {
            summary = await Commit.execute(runConfig);
        } else if (commandName === COMMAND_AUDIO_COMMIT) {
            summary = await AudioCommit.execute(runConfig);
        } else if (commandName === COMMAND_RELEASE) {
            const releaseSummary = await Release.execute(runConfig);
            summary = `${releaseSummary.title}\n\n${releaseSummary.body}`;
        } else if (commandName === COMMAND_PUBLISH) {
            await Publish.execute(runConfig);
        } else if (commandName === COMMAND_LINK) {
            summary = await Link.execute(runConfig);
        } else if (commandName === COMMAND_UNLINK) {
            summary = await Unlink.execute(runConfig);
        } else if (commandName === COMMAND_AUDIO_REVIEW) {
            summary = await AudioReview.execute(runConfig);
        } else if (commandName === COMMAND_CLEAN) {
            await Clean.execute(runConfig);
            summary = 'Output directory cleaned successfully.';
        }

        // eslint-disable-next-line no-console
        console.log(`\n\n${summary}\n\n`);

    } catch (error: any) {
        logger.error('Exiting due to Error: %s, %s', error.message, error.stack);
        process.exit(1);
    }
}

main();