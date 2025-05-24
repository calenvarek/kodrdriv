import * as Cardigantime from '@theunwalked/cardigantime';
import { Command } from "commander";
import path from "path";
import { z } from "zod";
import { ALLOWED_COMMANDS, DEFAULT_CHARACTER_ENCODING, DEFAULT_COMMAND, DEFAULT_INSTRUCTIONS_DIR, KODRDRIV_DEFAULTS, PROGRAM_NAME, VERSION } from "./constants";
import { getLogger } from "./logging";
import { CommandConfig, Config, ConfigSchema, SecureConfig } from './types'; // Import the Config type from main.ts
import * as Storage from "./util/storage";

export const InputSchema = z.object({
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    overrides: z.boolean().optional(),
    openaiApiKey: z.string().optional(),
    model: z.string().optional(),
    contextDirectories: z.array(z.string()).optional(),
    instructions: z.string().optional(),
    configDir: z.string().optional(),
    cached: z.boolean().optional(),
    sendit: z.boolean().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    excludedPatterns: z.array(z.string()).optional(),
});

export type Input = z.infer<typeof InputSchema>;

// Function to transform flat CLI args into nested Config structure
export const transformCliArgs = (finalCliArgs: Input): Partial<Config> => {
    const transformedCliArgs: Partial<Config> = {};

    // Direct mappings from Input to Config
    if (finalCliArgs.dryRun !== undefined) transformedCliArgs.dryRun = finalCliArgs.dryRun;
    if (finalCliArgs.verbose !== undefined) transformedCliArgs.verbose = finalCliArgs.verbose;
    if (finalCliArgs.debug !== undefined) transformedCliArgs.debug = finalCliArgs.debug;
    if (finalCliArgs.overrides !== undefined) transformedCliArgs.overrides = finalCliArgs.overrides;
    if (finalCliArgs.model !== undefined) transformedCliArgs.model = finalCliArgs.model;
    if (finalCliArgs.contextDirectories !== undefined) transformedCliArgs.contextDirectories = finalCliArgs.contextDirectories;
    if (finalCliArgs.instructions !== undefined) transformedCliArgs.instructions = finalCliArgs.instructions;

    // Map configDir (CLI) to configDirectory (Cardigantime standard)
    if (finalCliArgs.configDir !== undefined) transformedCliArgs.configDirectory = finalCliArgs.configDir;

    // Nested mappings for 'commit' options
    if (finalCliArgs.cached !== undefined || finalCliArgs.sendit !== undefined) {
        transformedCliArgs.commit = {};
        if (finalCliArgs.cached !== undefined) transformedCliArgs.commit.cached = finalCliArgs.cached;
        if (finalCliArgs.sendit !== undefined) transformedCliArgs.commit.sendit = finalCliArgs.sendit;
    }

    // Nested mappings for 'release' options
    if (finalCliArgs.from !== undefined || finalCliArgs.to !== undefined) {
        transformedCliArgs.release = {};
        if (finalCliArgs.from !== undefined) transformedCliArgs.release.from = finalCliArgs.from;
        if (finalCliArgs.to !== undefined) transformedCliArgs.release.to = finalCliArgs.to;
    }

    if (finalCliArgs.excludedPatterns !== undefined) transformedCliArgs.excludedPatterns = finalCliArgs.excludedPatterns;

    // Note: finalCliArgs.openaiApiKey is intentionally omitted here as it belongs to SecureConfig

    return transformedCliArgs;
}

// Update configure signature to accept cardigantime
export const configure = async (cardigantime: Cardigantime.Cardigantime<typeof ConfigSchema.shape>): Promise<[Config, SecureConfig, CommandConfig]> => {
    const logger = getLogger();
    let program = new Command();

    // Configure program basics
    program
        .name(PROGRAM_NAME)
        .summary('Create Intelligent Release Notes or Change Logs from Git')
        .description('Create Intelligent Release Notes or Change Logs from Git')
        .version(VERSION);

    // Let cardigantime add its arguments first
    program = await cardigantime.configure(program);

    // Get CLI arguments using the new function
    const [finalCliArgs, commandConfig]: [Input, CommandConfig] = getCliConfig(program);
    logger.debug('Loaded Command Line Options: %s', JSON.stringify(finalCliArgs, null, 2));

    // Transform the flat CLI args using the new function
    const transformedCliArgs: Partial<Config> = transformCliArgs(finalCliArgs);
    logger.debug('Transformed CLI Args for merging: %s', JSON.stringify(transformedCliArgs, null, 2));

    // Get values from config file
    const fileValues: Config = await cardigantime.read(finalCliArgs);
    await cardigantime.validate(fileValues); // Validate file config against the shape

    // Merge configurations: Defaults -> File -> CLI
    const partialConfig: Partial<Config> = {
        ...KODRDRIV_DEFAULTS,      // Start with Kodrdriv defaults
        ...fileValues,            // Apply file values (overwrites defaults)
        ...transformedCliArgs,    // Apply CLI args last (highest precedence)
    } as Partial<Config>; // Cast to Partial<MainConfig> initially

    // Specific validation and processing after merge
    const config: Config = await validateAndProcessOptions(partialConfig);

    logger.verbose('Final configuration: %s', JSON.stringify(config, null, 2));

    const secureConfig: SecureConfig = await validateAndProcessSecureOptions();

    return [config, secureConfig, commandConfig];
}

// Function to handle CLI argument parsing and processing
function getCliConfig(program: Command): [Input, CommandConfig] {

    const addSharedOptions = (command: Command) => {
        command
            .option('--dry-run', 'perform a dry run without saving files') // Removed default, will be handled by merging
            .option('--verbose', 'enable verbose logging')
            .option('--debug', 'enable debug logging')
            .option('--overrides', 'enable overrides')
            .option('--model <model>', 'OpenAI model to use')
            .option('-d, --context-directories [contextDirectories...]', 'directories to scan for context')
            .option('-i, --instructions <file>', 'instructions for the AI')
            .option('--config-dir <configDir>', 'configuration directory') // Keep config-dir for specifying location
            .option('--excluded-paths [excludedPatterns...]', 'paths to exclude from the diff');
    }

    // Add subcommands
    const commitCommand = program
        .command('commit')
        .option('--cached', 'use cached diff')
        .option('--sendit', 'Commit with the message generated. No review.')
        .description('Generate commit notes');
    addSharedOptions(commitCommand);

    const releaseCommand = program
        .command('release')
        .option('--from <from>', 'branch to generate release notes from')
        .option('--to <to>', 'branch to generate release notes to')
        .description('Generate release notes');
    addSharedOptions(releaseCommand);

    program.parse();

    const cliArgs: Input = program.opts<Input>(); // Get all opts initially

    // Determine which command is being run
    let commandName = DEFAULT_COMMAND;
    let commandOptions: Partial<Input> = {}; // Store specific command options

    if (program.args.length > 0 && ALLOWED_COMMANDS.includes(program.args[0])) {
        commandName = program.args[0];
        if (commandName === 'commit' && commitCommand.opts) {
            commandOptions = commitCommand.opts<Partial<Input>>();
        } else if (commandName === 'release' && releaseCommand.opts) {
            commandOptions = releaseCommand.opts<Partial<Input>>();
        }
    }

    validateCommand(commandName);

    // Include command name in CLI args for merging
    const finalCliArgs = { ...cliArgs, ...commandOptions };
    const commandConfig = { commandName };
    return [finalCliArgs, commandConfig];
}

async function validateAndProcessSecureOptions(): Promise<SecureConfig> {
    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key is required, set OPENAI_API_KEY environment variable or provide --openai-api-key');
    }
    // Prefer CLI key if provided, otherwise use env var
    const openaiApiKey = process.env.OPENAI_API_KEY as string;

    const secureConfig: SecureConfig = {
        openaiApiKey: openaiApiKey,
    };

    return secureConfig;
}

// Renamed validation function to reflect its broader role
async function validateAndProcessOptions(options: Partial<Config>): Promise<Config> {

    const contextDirectories = await validateContextDirectories(options.contextDirectories || KODRDRIV_DEFAULTS.contextDirectories);
    const instructionsPathOrContent = options.instructions || KODRDRIV_DEFAULTS.instructions;
    const instructions = await validateAndReadInstructions(instructionsPathOrContent);
    const configDir = options.configDirectory || KODRDRIV_DEFAULTS.configDirectory;
    await validateConfigDir(configDir); // Keep validation, but maybe remove return if not used elsewhere

    // Ensure all required fields are present and have correct types after merging
    const finalConfig: Config = {
        dryRun: options.dryRun ?? KODRDRIV_DEFAULTS.dryRun,
        verbose: options.verbose ?? KODRDRIV_DEFAULTS.verbose,
        debug: options.debug ?? KODRDRIV_DEFAULTS.debug,
        overrides: options.overrides ?? KODRDRIV_DEFAULTS.overrides,
        model: options.model ?? KODRDRIV_DEFAULTS.model,
        instructions: instructions, // Use processed instructions content
        contextDirectories: contextDirectories,
        configDirectory: configDir,
        // Command-specific options with defaults
        commit: {
            cached: options.commit?.cached ?? KODRDRIV_DEFAULTS.commit.cached, // Might be undefined if not commit command
            sendit: options.commit?.sendit ?? KODRDRIV_DEFAULTS.commit.sendit,
        },
        release: {
            from: options.release?.from ?? KODRDRIV_DEFAULTS.release.from,
            to: options.release?.to ?? KODRDRIV_DEFAULTS.release.to,
        },
        excludedPatterns: options.excludedPatterns ?? KODRDRIV_DEFAULTS.excludedPatterns,
    };

    // Final validation against the MainConfig shape (optional, cardigantime might handle it)
    // You could potentially use ConfigShape.parse(finalConfig) here if needed

    return finalConfig;
}

// Export for testing
export function validateCommand(commandName: string): string {
    if (!ALLOWED_COMMANDS.includes(commandName)) {
        throw new Error(`Invalid command: ${commandName}, allowed commands: ${ALLOWED_COMMANDS.join(', ')}`);
    }
    return commandName;
}

async function validateConfigDir(configDir: string): Promise<string> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });

    // Make sure the config directory is absolute
    const absoluteConfigDir = path.isAbsolute(configDir) ?
        configDir :
        path.resolve(process.cwd(), configDir);

    // Create the config directory if it doesn't exist
    try {
        if (!(await storage.exists(absoluteConfigDir))) {
            logger.info(`Creating config directory: ${absoluteConfigDir}`);
            await storage.createDirectory(absoluteConfigDir);
        } else if (!(await storage.isDirectory(absoluteConfigDir))) {
            throw new Error(`Config directory is not a directory: ${absoluteConfigDir}`);
        } else if (!(await storage.isDirectoryWritable(absoluteConfigDir))) {
            throw new Error(`Config directory is not writable: ${absoluteConfigDir}`);
        }
    } catch (error: any) {
        logger.error(`Failed to validate or create config directory: ${absoluteConfigDir}`, error);
        throw new Error(`Failed to validate or create config directory: ${absoluteConfigDir}: ${error.message}`);
    }

    return absoluteConfigDir;
}

// Export for testing
export async function validateContextDirectories(contextDirectories: string[]): Promise<string[]> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });

    // Filter out directories that don't exist
    const validDirectories = [];

    for (const dir of contextDirectories) {
        try {
            if (await storage.isDirectoryReadable(dir)) {
                validDirectories.push(dir);
            } else {
                logger.warn(`Directory not readable: ${dir}`);
            }
        } catch (error: any) {
            logger.warn(`Error validating directory ${dir}: ${error.message}`);
        }
    }

    return validDirectories;
}

// Updated to handle reading the file content
// Export for testing
export async function validateAndReadInstructions(instructionsPath: string): Promise<string> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });
    try {
        // Assume it's a file path first
        if (await storage.isFileReadable(instructionsPath)) {
            logger.debug(`Reading instructions from file: ${instructionsPath}`);
            return storage.readFile(instructionsPath, DEFAULT_CHARACTER_ENCODING);
        } else {
            // If not a readable file, assume it might be the content itself (e.g., from config file)
            logger.debug(`Using provided instructions string directly.`);
            return instructionsPath; // Return the string as is
        }
    } catch (error: any) {
        logger.error('Error reading instructions file %s: %s', instructionsPath, error.message);
        // Decide how to handle error: throw, return default, etc.
        // Returning default for now, but might need adjustment
        logger.warn('Falling back to default instructions path due to error.');
        // Re-read the default file path if the provided one failed
        if (DEFAULT_INSTRUCTIONS_DIR && await storage.isFileReadable(DEFAULT_INSTRUCTIONS_DIR)) {
            return storage.readFile(DEFAULT_INSTRUCTIONS_DIR, DEFAULT_CHARACTER_ENCODING);
        }
        throw new Error(`Failed to read instructions from ${instructionsPath} or default location.`);
    }
}