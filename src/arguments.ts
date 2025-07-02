/* eslint-disable @typescript-eslint/no-unused-vars */
import { Command } from "commander";
import path from "path";
import { z } from "zod";
import { ALLOWED_COMMANDS, DEFAULT_CHARACTER_ENCODING, DEFAULT_COMMAND, DEFAULT_INSTRUCTIONS_DIR, KODRDRIV_DEFAULTS, PROGRAM_NAME, VERSION } from "./constants";
import { getLogger } from "./logging";
import { CommandConfig, Config, SecureConfig } from './types'; // Import the Config type from main.ts
import * as Storage from "./util/storage";
import { readStdin } from "./util/stdin";

export const InputSchema = z.object({
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    overrides: z.boolean().optional(),
    checkConfig: z.boolean().optional(),
    initConfig: z.boolean().optional(),
    openaiApiKey: z.string().optional(),
    model: z.string().optional(),
    contextDirectories: z.array(z.string()).optional(),
    instructions: z.string().optional(),
    configDir: z.string().optional(),
    outputDir: z.string().optional(),
    cached: z.boolean().optional(),
    add: z.boolean().optional(),
    sendit: z.boolean().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    excludedPatterns: z.array(z.string()).optional(),
    context: z.string().optional(),
    note: z.string().optional(), // For review command positional argument/STDIN
    direction: z.string().optional(),
    messageLimit: z.number().optional(),
    mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
    scopeRoots: z.string().optional(),
    workspaceFile: z.string().optional(),
    includeCommitHistory: z.boolean().optional(),
    includeRecentDiffs: z.boolean().optional(),
    includeReleaseNotes: z.boolean().optional(),
    includeGithubIssues: z.boolean().optional(),
    commitHistoryLimit: z.number().optional(),
    diffHistoryLimit: z.number().optional(),
    releaseNotesLimit: z.number().optional(),
    githubIssuesLimit: z.number().optional(),
    selectAudioDevice: z.boolean().optional(),
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

    // Map outputDir (CLI) to outputDirectory (Config standard)
    if (finalCliArgs.outputDir !== undefined) transformedCliArgs.outputDirectory = finalCliArgs.outputDir;

    // Nested mappings for 'commit' options
    if (finalCliArgs.cached !== undefined || finalCliArgs.sendit !== undefined || finalCliArgs.add !== undefined) {
        transformedCliArgs.commit = {};
        if (finalCliArgs.add !== undefined) transformedCliArgs.commit.add = finalCliArgs.add;
        if (finalCliArgs.cached !== undefined) transformedCliArgs.commit.cached = finalCliArgs.cached;
        if (finalCliArgs.sendit !== undefined) transformedCliArgs.commit.sendit = finalCliArgs.sendit;
        if (finalCliArgs.messageLimit !== undefined) transformedCliArgs.commit.messageLimit = finalCliArgs.messageLimit;
        if (finalCliArgs.context !== undefined) transformedCliArgs.commit.context = finalCliArgs.context;
        if (finalCliArgs.direction !== undefined) transformedCliArgs.commit.direction = finalCliArgs.direction;
    }

    // Nested mappings for 'audioCommit' options
    if (finalCliArgs.selectAudioDevice !== undefined) {
        transformedCliArgs.audioCommit = {};
        transformedCliArgs.audioCommit.selectAudioDevice = finalCliArgs.selectAudioDevice;
    }

    // Nested mappings for 'release' options
    if (finalCliArgs.from !== undefined || finalCliArgs.to !== undefined) {
        transformedCliArgs.release = {};
        if (finalCliArgs.from !== undefined) transformedCliArgs.release.from = finalCliArgs.from;
        if (finalCliArgs.to !== undefined) transformedCliArgs.release.to = finalCliArgs.to;
        if (finalCliArgs.context !== undefined) transformedCliArgs.release.context = finalCliArgs.context;
        if (finalCliArgs.messageLimit !== undefined) transformedCliArgs.release.messageLimit = finalCliArgs.messageLimit;
    }

    // Nested mappings for 'publish' options
    if (finalCliArgs.mergeMethod !== undefined) {
        transformedCliArgs.publish = {};
        if (finalCliArgs.mergeMethod !== undefined) transformedCliArgs.publish.mergeMethod = finalCliArgs.mergeMethod;
    }

    // Nested mappings for 'link' and 'unlink' options (both use the same configuration)
    if (finalCliArgs.scopeRoots !== undefined || finalCliArgs.workspaceFile !== undefined) {
        transformedCliArgs.link = {};
        if (finalCliArgs.scopeRoots !== undefined) {
            try {
                transformedCliArgs.link.scopeRoots = JSON.parse(finalCliArgs.scopeRoots);

            } catch (error) {
                throw new Error(`Invalid JSON for scope-roots: ${finalCliArgs.scopeRoots}`);
            }
        }
        if (finalCliArgs.workspaceFile !== undefined) transformedCliArgs.link.workspaceFile = finalCliArgs.workspaceFile;
    }

    // Nested mappings for 'audio-review' options
    if (finalCliArgs.includeCommitHistory !== undefined ||
        finalCliArgs.includeRecentDiffs !== undefined ||
        finalCliArgs.includeReleaseNotes !== undefined ||
        finalCliArgs.includeGithubIssues !== undefined ||
        finalCliArgs.commitHistoryLimit !== undefined ||
        finalCliArgs.diffHistoryLimit !== undefined ||
        finalCliArgs.releaseNotesLimit !== undefined ||
        finalCliArgs.githubIssuesLimit !== undefined) {
        transformedCliArgs.audioReview = {};
        if (finalCliArgs.includeCommitHistory !== undefined) transformedCliArgs.audioReview.includeCommitHistory = finalCliArgs.includeCommitHistory;
        if (finalCliArgs.includeRecentDiffs !== undefined) transformedCliArgs.audioReview.includeRecentDiffs = finalCliArgs.includeRecentDiffs;
        if (finalCliArgs.includeReleaseNotes !== undefined) transformedCliArgs.audioReview.includeReleaseNotes = finalCliArgs.includeReleaseNotes;
        if (finalCliArgs.includeGithubIssues !== undefined) transformedCliArgs.audioReview.includeGithubIssues = finalCliArgs.includeGithubIssues;
        if (finalCliArgs.commitHistoryLimit !== undefined) transformedCliArgs.audioReview.commitHistoryLimit = finalCliArgs.commitHistoryLimit;
        if (finalCliArgs.diffHistoryLimit !== undefined) transformedCliArgs.audioReview.diffHistoryLimit = finalCliArgs.diffHistoryLimit;
        if (finalCliArgs.releaseNotesLimit !== undefined) transformedCliArgs.audioReview.releaseNotesLimit = finalCliArgs.releaseNotesLimit;
        if (finalCliArgs.githubIssuesLimit !== undefined) transformedCliArgs.audioReview.githubIssuesLimit = finalCliArgs.githubIssuesLimit;
        // Only add context and sendit if we already have an audioReview object from the specific properties above
        if (finalCliArgs.context !== undefined) transformedCliArgs.audioReview.context = finalCliArgs.context;
        if (finalCliArgs.sendit !== undefined) transformedCliArgs.audioReview.sendit = finalCliArgs.sendit;
    }

    // Nested mappings for 'review' options
    if (finalCliArgs.includeCommitHistory !== undefined ||
        finalCliArgs.includeRecentDiffs !== undefined ||
        finalCliArgs.includeReleaseNotes !== undefined ||
        finalCliArgs.includeGithubIssues !== undefined ||
        finalCliArgs.commitHistoryLimit !== undefined ||
        finalCliArgs.diffHistoryLimit !== undefined ||
        finalCliArgs.releaseNotesLimit !== undefined ||
        finalCliArgs.githubIssuesLimit !== undefined ||
        finalCliArgs.context !== undefined ||
        finalCliArgs.sendit !== undefined ||
        finalCliArgs.note !== undefined) {
        transformedCliArgs.review = {};
        if (finalCliArgs.note !== undefined) transformedCliArgs.review.note = finalCliArgs.note;
        // Include optional review configuration options if specified
        if (finalCliArgs.includeCommitHistory !== undefined) transformedCliArgs.review.includeCommitHistory = finalCliArgs.includeCommitHistory;
        if (finalCliArgs.includeRecentDiffs !== undefined) transformedCliArgs.review.includeRecentDiffs = finalCliArgs.includeRecentDiffs;
        if (finalCliArgs.includeReleaseNotes !== undefined) transformedCliArgs.review.includeReleaseNotes = finalCliArgs.includeReleaseNotes;
        if (finalCliArgs.includeGithubIssues !== undefined) transformedCliArgs.review.includeGithubIssues = finalCliArgs.includeGithubIssues;
        if (finalCliArgs.commitHistoryLimit !== undefined) transformedCliArgs.review.commitHistoryLimit = finalCliArgs.commitHistoryLimit;
        if (finalCliArgs.diffHistoryLimit !== undefined) transformedCliArgs.review.diffHistoryLimit = finalCliArgs.diffHistoryLimit;
        if (finalCliArgs.releaseNotesLimit !== undefined) transformedCliArgs.review.releaseNotesLimit = finalCliArgs.releaseNotesLimit;
        if (finalCliArgs.githubIssuesLimit !== undefined) transformedCliArgs.review.githubIssuesLimit = finalCliArgs.githubIssuesLimit;
        if (finalCliArgs.context !== undefined) transformedCliArgs.review.context = finalCliArgs.context;
        if (finalCliArgs.sendit !== undefined) transformedCliArgs.review.sendit = finalCliArgs.sendit;
    }

    if (finalCliArgs.excludedPatterns !== undefined) transformedCliArgs.excludedPatterns = finalCliArgs.excludedPatterns;


    // Note: finalCliArgs.openaiApiKey is intentionally omitted here as it belongs to SecureConfig

    return transformedCliArgs;
}



// Update configure signature to accept cardigantime
export const configure = async (cardigantime: any): Promise<[Config, SecureConfig, CommandConfig]> => {
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

    // Check if --check-config is in process.argv early
    if (process.argv.includes('--check-config')) {
        // For check-config, use CardiganTime's built-in checkConfig method
        program.parse();
        const cliArgs: Input = program.opts<Input>();

        // Transform the flat CLI args
        const transformedCliArgs: Partial<Config> = transformCliArgs(cliArgs);

        // Use CardiganTime's built-in checkConfig method which displays
        // hierarchical configuration information in a well-formatted way
        await cardigantime.checkConfig(transformedCliArgs);

        // Return minimal config for consistency, but main processing is done
        const config: Config = await validateAndProcessOptions({});
        const secureConfig: SecureConfig = await validateAndProcessSecureOptions();
        const commandConfig: CommandConfig = { commandName: 'check-config' };

        return [config, secureConfig, commandConfig];
    }

    // Check if --init-config is in process.argv early
    if (process.argv.includes('--init-config')) {
        // For init-config, use CardiganTime's built-in generateConfig method
        program.parse();
        const cliArgs: Input = program.opts<Input>();

        // Transform the flat CLI args
        const transformedCliArgs: Partial<Config> = transformCliArgs(cliArgs);


        // Use CardiganTime's built-in generateConfig method
        await cardigantime.generateConfig(transformedCliArgs.configDirectory || KODRDRIV_DEFAULTS.configDirectory);

        // Return minimal config for consistency, but main processing is done
        const config: Config = await validateAndProcessOptions({});
        const secureConfig: SecureConfig = await validateAndProcessSecureOptions();
        const commandConfig: CommandConfig = { commandName: 'init-config' };

        return [config, secureConfig, commandConfig];
    }

    // Get CLI arguments using the new function
    const [finalCliArgs, commandConfig]: [Input, CommandConfig] = await getCliConfig(program);
    logger.silly('Loaded Command Line Options: %s', JSON.stringify(finalCliArgs, null, 2));

    // Transform the flat CLI args using the new function
    const transformedCliArgs: Partial<Config> = transformCliArgs(finalCliArgs);
    logger.silly('Transformed CLI Args for merging: %s', JSON.stringify(transformedCliArgs, null, 2));

    // Get values from config file using Cardigantime's hierarchical configuration
    const fileValues: Partial<Config> = await cardigantime.read(transformedCliArgs) as Partial<Config>;

    // Merge configurations: Defaults -> File -> CLI
    // Properly merge the link section to preserve scope roots from config file
    const mergedLink = {
        ...KODRDRIV_DEFAULTS.link,
        ...fileValues.link,
        ...transformedCliArgs.link,
    };

    const partialConfig: Partial<Config> = {
        ...KODRDRIV_DEFAULTS,      // Start with Kodrdriv defaults
        ...fileValues,            // Apply file values (overwrites defaults)
        ...transformedCliArgs,    // Apply CLI args last (highest precedence)
        link: mergedLink,         // Override with properly merged link section
    } as Partial<Config>; // Cast to Partial<Config> initially

    // Specific validation and processing after merge
    const config: Config = await validateAndProcessOptions(partialConfig);

    // Log effective configuration summary at verbose level
    logger.verbose('Configuration complete. Effective settings:');
    logger.verbose(`  Command: ${commandConfig.commandName}`);
    logger.verbose(`  Model: ${config.model}`);
    logger.verbose(`  Dry run: ${config.dryRun}`);
    logger.verbose(`  Debug: ${config.debug}`);
    logger.verbose(`  Verbose: ${config.verbose}`);
    logger.verbose(`  Config directory: ${config.configDirectory}`);
    logger.verbose(`  Output directory: ${config.outputDirectory}`);
    logger.verbose(`  Context directories: ${config.contextDirectories?.join(', ') || 'none'}`);
    if (config.excludedPatterns && config.excludedPatterns.length > 0) {
        logger.verbose(`  Excluded patterns: ${config.excludedPatterns.join(', ')}`);
    }
    if (Object.keys(config.link?.scopeRoots || {}).length > 0) {
        logger.verbose(`  Link scope roots: ${Object.keys(config.link!.scopeRoots!).join(', ')}`);
    }

    logger.silly('Final configuration: %s', JSON.stringify(config, null, 2));

    const secureConfig: SecureConfig = await validateAndProcessSecureOptions();

    return [config, secureConfig, commandConfig];
}

// Function to handle CLI argument parsing and processing
export async function getCliConfig(program: Command): Promise<[Input, CommandConfig]> {

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
            .option('--output-dir <outputDir>', 'output directory for generated files')
            .option('--excluded-paths [excludedPatterns...]', 'paths to exclude from the diff');
    }

    // Add global options to the main program
    // (cardigantime already adds most global options like --verbose, --debug, --config-dir)

    // Add subcommands
    const commitCommand = program
        .command('commit')
        .argument('[direction]', 'direction or guidance for the commit message')
        .description('Generate commit notes')
        .option('--context <context>', 'context for the commit message')
        .option('--cached', 'use cached diff')
        .option('--add', 'add all changes before committing')
        .option('--sendit', 'Commit with the message generated. No review.')
        .option('--message-limit <messageLimit>', 'limit the number of messages to generate');

    // Add shared options to commit command
    addSharedOptions(commitCommand);

    // Customize help output for commit command
    commitCommand.configureHelp({
        formatHelp: (cmd, helper) => {
            const nameAndVersion = `${helper.commandUsage(cmd)}\n\n${helper.commandDescription(cmd)}\n`;

            const commitOptions = [
                ['--context <context>', 'context for the commit message']
            ];

            const behavioralOptions = [
                ['--cached', 'use cached diff'],
                ['--add', 'add all changes before committing'],
                ['--sendit', 'Commit with the message generated. No review.'],
                ['--message-limit <messageLimit>', 'limit the number of messages to generate']
            ];

            const globalOptions = [
                ['--dry-run', 'perform a dry run without saving files'],
                ['--verbose', 'enable verbose logging'],
                ['--debug', 'enable debug logging'],
                ['--overrides', 'enable overrides'],
                ['--model <model>', 'OpenAI model to use'],
                ['-d, --context-directories [contextDirectories...]', 'directories to scan for context'],
                ['-i, --instructions <file>', 'instructions for the AI'],
                ['--config-dir <configDir>', 'configuration directory'],
                ['--excluded-paths [excludedPatterns...]', 'paths to exclude from the diff'],
                ['-h, --help', 'display help for command']
            ];

            const formatOptionsSection = (title: string, options: string[][]) => {
                const maxWidth = Math.max(...options.map(([flag]) => flag.length));
                return `${title}:\n` + options.map(([flag, desc]) =>
                    `  ${flag.padEnd(maxWidth + 2)} ${desc}`
                ).join('\n') + '\n';
            };

            return nameAndVersion + '\n' +
                formatOptionsSection('Commit Message Options', commitOptions) + '\n' +
                formatOptionsSection('Behavioral Options', behavioralOptions) + '\n' +
                formatOptionsSection('Global Options', globalOptions);
        }
    });

    const audioCommitCommand = program
        .command('audio-commit')
        .option('--cached', 'use cached diff')
        .option('--add', 'add all changes before committing')
        .option('--sendit', 'Commit with the message generated. No review.')
        .option('--direction <direction>', 'direction or guidance for the commit message')
        .option('--message-limit <messageLimit>', 'limit the number of messages to generate')
        .option('--select-audio-device', 'interactively select audio device and save to configuration')
        .description('Record audio to provide context, then generate and optionally commit with AI-generated message');
    addSharedOptions(audioCommitCommand);

    const releaseCommand = program
        .command('release')
        .option('--from <from>', 'branch to generate release notes from')
        .option('--to <to>', 'branch to generate release notes to')
        .option('--context <context>', 'context for the commit message')
        .description('Generate release notes');
    addSharedOptions(releaseCommand);

    const publishCommand = program
        .command('publish')
        .option('--merge-method <method>', 'method to merge PR (merge, squash, rebase)', 'squash')
        .description('Publish a release');
    addSharedOptions(publishCommand);

    const linkCommand = program
        .command('link')
        .option('--scope-roots <scopeRoots>', 'JSON mapping of scopes to root directories (e.g., \'{"@company": "../"}\')')
        .option('--workspace-file <workspaceFile>', 'path to workspace file', 'pnpm-workspace.yaml')
        .description('Manage pnpm workspace links for local development');
    addSharedOptions(linkCommand);

    const unlinkCommand = program
        .command('unlink')
        .option('--scope-roots <scopeRoots>', 'JSON mapping of scopes to root directories (e.g., \'{"@company": "../"}\')')
        .option('--workspace-file <workspaceFile>', 'path to workspace file', 'pnpm-workspace.yaml')
        .description('Remove pnpm workspace links and rebuild dependencies');
    addSharedOptions(unlinkCommand);

    const audioReviewCommand = program
        .command('audio-review')
        .option('--include-commit-history', 'include recent commit log messages in context (default: true)')
        .option('--no-include-commit-history', 'exclude commit log messages from context')
        .option('--include-recent-diffs', 'include recent commit diffs in context (default: true)')
        .option('--no-include-recent-diffs', 'exclude recent diffs from context')
        .option('--include-release-notes', 'include recent release notes in context (default: false)')
        .option('--no-include-release-notes', 'exclude release notes from context')
        .option('--include-github-issues', 'include open GitHub issues in context (default: true)')
        .option('--no-include-github-issues', 'exclude GitHub issues from context')
        .option('--commit-history-limit <limit>', 'number of recent commits to include', parseInt)
        .option('--diff-history-limit <limit>', 'number of recent commit diffs to include', parseInt)
        .option('--release-notes-limit <limit>', 'number of recent release notes to include', parseInt)
        .option('--github-issues-limit <limit>', 'number of open GitHub issues to include (max 20)', parseInt)
        .option('--context <context>', 'additional context for the audio review')
        .option('--sendit', 'Create GitHub issues automatically without confirmation')
        .description('Record audio, transcribe with Whisper, and analyze for project issues using AI');
    addSharedOptions(audioReviewCommand);

    const reviewCommand = program
        .command('review')
        .argument('[note]', 'review note to analyze for project issues')
        .option('--include-commit-history', 'include recent commit log messages in context (default: true)')
        .option('--no-include-commit-history', 'exclude commit log messages from context')
        .option('--include-recent-diffs', 'include recent commit diffs in context (default: true)')
        .option('--no-include-recent-diffs', 'exclude recent diffs from context')
        .option('--include-release-notes', 'include recent release notes in context (default: false)')
        .option('--no-include-release-notes', 'exclude release notes from context')
        .option('--include-github-issues', 'include open GitHub issues in context (default: true)')
        .option('--no-include-github-issues', 'exclude GitHub issues from context')
        .option('--commit-history-limit <limit>', 'number of recent commits to include', parseInt)
        .option('--diff-history-limit <limit>', 'number of recent commit diffs to include', parseInt)
        .option('--release-notes-limit <limit>', 'number of recent release notes to include', parseInt)
        .option('--github-issues-limit <limit>', 'number of open GitHub issues to include (max 20)', parseInt)
        .option('--context <context>', 'additional context for the review')
        .option('--sendit', 'Create GitHub issues automatically without confirmation')
        .description('Analyze review note for project issues using AI');
    addSharedOptions(reviewCommand);

    // Customize help output for review command
    reviewCommand.configureHelp({
        formatHelp: (cmd, helper) => {
            const nameAndVersion = `kodrdriv review [note] [options]\n\nAnalyze review note for project issues using AI\n`;

            const argumentsSection = [
                ['note', 'review note to analyze for project issues (can also be piped via STDIN)']
            ];

            const reviewOptions = [
                ['--context <context>', 'additional context for the review']
            ];

            const gitContextOptions = [
                ['--include-commit-history', 'include recent commit log messages in context (default: true)'],
                ['--no-include-commit-history', 'exclude commit log messages from context'],
                ['--include-recent-diffs', 'include recent commit diffs in context (default: true)'],
                ['--no-include-recent-diffs', 'exclude recent diffs from context'],
                ['--include-release-notes', 'include recent release notes in context (default: false)'],
                ['--no-include-release-notes', 'exclude release notes from context'],
                ['--include-github-issues', 'include open GitHub issues in context (default: true)'],
                ['--no-include-github-issues', 'exclude GitHub issues from context'],
                ['--commit-history-limit <limit>', 'number of recent commits to include'],
                ['--diff-history-limit <limit>', 'number of recent commit diffs to include'],
                ['--release-notes-limit <limit>', 'number of recent release notes to include'],
                ['--github-issues-limit <limit>', 'number of open GitHub issues to include (max 20)']
            ];

            const behavioralOptions = [
                ['--sendit', 'Create GitHub issues automatically without confirmation']
            ];

            const globalOptions = [
                ['--dry-run', 'perform a dry run without saving files'],
                ['--verbose', 'enable verbose logging'],
                ['--debug', 'enable debug logging'],
                ['--overrides', 'enable overrides'],
                ['--model <model>', 'OpenAI model to use'],
                ['-d, --context-directories [contextDirectories...]', 'directories to scan for context'],
                ['-i, --instructions <file>', 'instructions for the AI'],
                ['--config-dir <configDir>', 'configuration directory'],
                ['--output-dir <outputDir>', 'output directory for generated files'],
                ['--excluded-paths [excludedPatterns...]', 'paths to exclude from the diff'],
                ['-h, --help', 'display help for command']
            ];

            const formatOptionsSection = (title: string, options: string[][]) => {
                const maxWidth = Math.max(...options.map(([flag]) => flag.length));
                return `${title}:\n` + options.map(([flag, desc]) =>
                    `  ${flag.padEnd(maxWidth + 2)} ${desc}`
                ).join('\n') + '\n';
            };

            return nameAndVersion + '\n' +
                formatOptionsSection('Arguments', argumentsSection) + '\n' +
                formatOptionsSection('Options', reviewOptions) + '\n' +
                formatOptionsSection('Git Context Parameters', gitContextOptions) + '\n' +
                formatOptionsSection('Behavioral Options', behavioralOptions) + '\n' +
                formatOptionsSection('Global Options', globalOptions);
        }
    });

    const cleanCommand = program
        .command('clean')
        .description('Remove the output directory and all generated files');
    addSharedOptions(cleanCommand);

    program.parse();

    const cliArgs: Input = program.opts<Input>(); // Get all opts initially

    // Determine which command is being run
    let commandName = DEFAULT_COMMAND;
    let commandOptions: Partial<Input> = {}; // Store specific command options

    if (program.args.length > 0) {
        commandName = program.args[0];
        validateCommand(commandName);
    }

    // Only proceed with command-specific options if validation passed
    if (ALLOWED_COMMANDS.includes(commandName)) {
        if (commandName === 'commit' && commitCommand.opts) {
            commandOptions = commitCommand.opts<Partial<Input>>();
            // Handle positional argument for direction
            const args = commitCommand.args;
            if (args && args.length > 0 && args[0]) {
                commandOptions.direction = args[0];
            }

            // Check for STDIN input for direction (takes precedence over positional argument)
            const stdinInput = await readStdin();
            if (stdinInput) {
                commandOptions.direction = stdinInput;
            }
        } else if (commandName === 'audio-commit' && audioCommitCommand.opts) {
            commandOptions = audioCommitCommand.opts<Partial<Input>>();
        } else if (commandName === 'release' && releaseCommand.opts) {
            commandOptions = releaseCommand.opts<Partial<Input>>();
        } else if (commandName === 'publish' && publishCommand.opts) {
            commandOptions = publishCommand.opts<Partial<Input>>();
        } else if (commandName === 'link' && linkCommand.opts) {
            commandOptions = linkCommand.opts<Partial<Input>>();
        } else if (commandName === 'unlink' && unlinkCommand.opts) {
            commandOptions = unlinkCommand.opts<Partial<Input>>();
        } else if (commandName === 'audio-review' && audioReviewCommand.opts) {
            commandOptions = audioReviewCommand.opts<Partial<Input>>();
        } else if (commandName === 'review' && reviewCommand.opts) {
            commandOptions = reviewCommand.opts<Partial<Input>>();
            // Handle positional argument for note
            const args = reviewCommand.args;
            if (args && args.length > 0 && args[0]) {
                commandOptions.note = args[0];
            }

            // Check for STDIN input for note (takes precedence over positional argument)
            const stdinInput = await readStdin();
            if (stdinInput) {
                commandOptions.note = stdinInput;
            }
        } else if (commandName === 'clean' && cleanCommand.opts) {
            commandOptions = cleanCommand.opts<Partial<Input>>();
        }
    }

    // Include command name in CLI args for merging
    const finalCliArgs = { ...cliArgs, ...commandOptions };
    const commandConfig = { commandName };
    return [finalCliArgs, commandConfig];
}

export async function validateAndProcessSecureOptions(): Promise<SecureConfig> {
    // For check-config and init-config commands, we don't want to throw an error for missing API key
    const isCheckConfig = process.argv.includes('--check-config');
    const isInitConfig = process.argv.includes('--init-config');

    if (!process.env.OPENAI_API_KEY && !isCheckConfig && !isInitConfig) {
        throw new Error('OpenAI API key is required, set OPENAI_API_KEY environment variable or provide --openai-api-key');
    }

    // Prefer CLI key if provided, otherwise use env var (might be undefined for check-config/init-config)
    const openaiApiKey = process.env.OPENAI_API_KEY;

    const secureConfig: SecureConfig = {
        openaiApiKey: openaiApiKey,
    };

    return secureConfig;
}

// Renamed validation function to reflect its broader role
export async function validateAndProcessOptions(options: Partial<Config>): Promise<Config> {

    const contextDirectories = await validateContextDirectories(options.contextDirectories || KODRDRIV_DEFAULTS.contextDirectories);
    const instructionsPathOrContent = options.instructions || KODRDRIV_DEFAULTS.instructions;
    const instructions = await validateAndReadInstructions(instructionsPathOrContent);
    const configDir = options.configDirectory || KODRDRIV_DEFAULTS.configDirectory;
    // Skip config directory validation since Cardigantime handles hierarchical lookup

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
        outputDirectory: options.outputDirectory ?? KODRDRIV_DEFAULTS.outputDirectory,
        // Command-specific options with defaults
        commit: {
            add: options.commit?.add ?? KODRDRIV_DEFAULTS.commit.add,
            cached: options.commit?.cached ?? KODRDRIV_DEFAULTS.commit.cached, // Might be undefined if not commit command
            sendit: options.commit?.sendit ?? KODRDRIV_DEFAULTS.commit.sendit,
            messageLimit: options.commit?.messageLimit ?? KODRDRIV_DEFAULTS.commit.messageLimit,
            context: options.commit?.context,
            direction: options.commit?.direction,
        },
        audioCommit: {
            maxRecordingTime: options.audioCommit?.maxRecordingTime ?? KODRDRIV_DEFAULTS.audioCommit.maxRecordingTime,
            audioDevice: options.audioCommit?.audioDevice ?? KODRDRIV_DEFAULTS.audioCommit.audioDevice,
            selectAudioDevice: options.audioCommit?.selectAudioDevice,
        },
        release: {
            from: options.release?.from ?? KODRDRIV_DEFAULTS.release.from,
            to: options.release?.to ?? KODRDRIV_DEFAULTS.release.to,
            messageLimit: options.release?.messageLimit ?? KODRDRIV_DEFAULTS.release.messageLimit,
            context: options.release?.context,
        },
        audioReview: {
            includeCommitHistory: options.audioReview?.includeCommitHistory ?? KODRDRIV_DEFAULTS.audioReview.includeCommitHistory,
            includeRecentDiffs: options.audioReview?.includeRecentDiffs ?? KODRDRIV_DEFAULTS.audioReview.includeRecentDiffs,
            includeReleaseNotes: options.audioReview?.includeReleaseNotes ?? KODRDRIV_DEFAULTS.audioReview.includeReleaseNotes,
            includeGithubIssues: options.audioReview?.includeGithubIssues ?? KODRDRIV_DEFAULTS.audioReview.includeGithubIssues,
            commitHistoryLimit: options.audioReview?.commitHistoryLimit ?? KODRDRIV_DEFAULTS.audioReview.commitHistoryLimit,
            diffHistoryLimit: options.audioReview?.diffHistoryLimit ?? KODRDRIV_DEFAULTS.audioReview.diffHistoryLimit,
            releaseNotesLimit: options.audioReview?.releaseNotesLimit ?? KODRDRIV_DEFAULTS.audioReview.releaseNotesLimit,
            githubIssuesLimit: options.audioReview?.githubIssuesLimit ?? KODRDRIV_DEFAULTS.audioReview.githubIssuesLimit,
            context: options.audioReview?.context,
            sendit: options.audioReview?.sendit ?? KODRDRIV_DEFAULTS.audioReview.sendit,
        },
        review: {
            includeCommitHistory: options.review?.includeCommitHistory ?? KODRDRIV_DEFAULTS.review.includeCommitHistory,
            includeRecentDiffs: options.review?.includeRecentDiffs ?? KODRDRIV_DEFAULTS.review.includeRecentDiffs,
            includeReleaseNotes: options.review?.includeReleaseNotes ?? KODRDRIV_DEFAULTS.review.includeReleaseNotes,
            includeGithubIssues: options.review?.includeGithubIssues ?? KODRDRIV_DEFAULTS.review.includeGithubIssues,
            commitHistoryLimit: options.review?.commitHistoryLimit ?? KODRDRIV_DEFAULTS.review.commitHistoryLimit,
            diffHistoryLimit: options.review?.diffHistoryLimit ?? KODRDRIV_DEFAULTS.review.diffHistoryLimit,
            releaseNotesLimit: options.review?.releaseNotesLimit ?? KODRDRIV_DEFAULTS.review.releaseNotesLimit,
            githubIssuesLimit: options.review?.githubIssuesLimit ?? KODRDRIV_DEFAULTS.review.githubIssuesLimit,
            context: options.review?.context,
            sendit: options.review?.sendit ?? KODRDRIV_DEFAULTS.review.sendit,
            note: options.review?.note,
        },
        publish: {
            mergeMethod: options.publish?.mergeMethod ?? KODRDRIV_DEFAULTS.publish.mergeMethod,
            dependencyUpdatePatterns: options.publish?.dependencyUpdatePatterns,
            requiredEnvVars: options.publish?.requiredEnvVars ?? KODRDRIV_DEFAULTS.publish.requiredEnvVars,
        },
        link: {
            scopeRoots: options.link?.scopeRoots ?? KODRDRIV_DEFAULTS.link.scopeRoots,
            workspaceFile: options.link?.workspaceFile ?? KODRDRIV_DEFAULTS.link.workspaceFile,
            dryRun: options.link?.dryRun ?? KODRDRIV_DEFAULTS.link.dryRun,
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

export async function validateConfigDir(configDir: string): Promise<string> {
    const logger = getLogger();
    const storage = Storage.create({ log: logger.info });

    // Make sure the config directory is absolute
    const absoluteConfigDir = path.isAbsolute(configDir) ?
        configDir :
        path.resolve(process.cwd(), configDir);

    try {
        // Check if the path exists
        if (!(await storage.exists(absoluteConfigDir))) {
            // Directory doesn't exist, warn and fall back to defaults
            logger.warn(`Config directory does not exist: ${absoluteConfigDir}. Using default configuration.`);
            return absoluteConfigDir; // Return the path anyway, app will use defaults
        }

        // Path exists, check if it's a directory
        if (!(await storage.isDirectory(absoluteConfigDir))) {
            throw new Error(`Config directory is not a directory: ${absoluteConfigDir}`);
        }

        // Check if it's writable
        if (!(await storage.isDirectoryWritable(absoluteConfigDir))) {
            throw new Error(`Config directory is not writable: ${absoluteConfigDir}`);
        }
    } catch (error: any) {
        logger.error(`Failed to validate config directory: ${absoluteConfigDir}`, error);
        throw new Error(`Failed to validate config directory: ${absoluteConfigDir}: ${error.message}`);
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
            logger.verbose(`Reading instructions from file: ${instructionsPath}`);
            return storage.readFile(instructionsPath, DEFAULT_CHARACTER_ENCODING);
        } else {
            // If not a readable file, assume it might be the content itself (e.g., from config file)
            logger.verbose(`Using provided instructions string directly.`);
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

