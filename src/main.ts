#!/usr/bin/env node
import * as Cardigantime from '@theunwalked/cardigantime';
import 'dotenv/config';
import * as Arguments from './arguments';
import * as Commit from './commands/commit';
import * as Publish from './commands/publish';
import * as Release from './commands/release';
import { COMMAND_COMMIT, COMMAND_PUBLISH, COMMAND_RELEASE, DEFAULT_CONFIG_DIR } from './constants';
import { getLogger, setLogLevel } from './logging';
import { CommandConfig } from 'types';
import { Config, ConfigSchema, SecureConfig } from './types';

export async function main() {

    const cardigantime = Cardigantime.create<typeof ConfigSchema.shape>({
        defaults: {
            configDirectory: DEFAULT_CONFIG_DIR, // Default directory for config file
        },
        configShape: ConfigSchema.shape, // Pass the Zod shape for validation
        logger: getLogger(),           // Optional: Pass logger instance
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

    try {
        // Get the command from Commander
        const command = process.argv[2];
        let commandName = commandConfig.commandName;

        // If we have a specific command argument, use that
        if (command === 'commit' || command === 'release' || command === 'publish') {
            commandName = command;
        }

        let summary: string = '';

        if (commandName === COMMAND_COMMIT) {
            summary = await Commit.execute(runConfig);
        } else if (commandName === COMMAND_RELEASE) {
            summary = await Release.execute(runConfig);
        } else if (commandName === COMMAND_PUBLISH) {
            await Publish.execute(runConfig);
        }

        // eslint-disable-next-line no-console
        console.log(`\n\n${summary}\n\n`);

    } catch (error: any) {
        logger.error('Exiting due to Error: %s, %s', error.message, error.stack);
        process.exit(1);
    }
}

main();