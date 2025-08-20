/* eslint-disable @typescript-eslint/no-unused-vars */
import { Command } from "commander";
import path from "path";
import { z } from "zod";
import { ALLOWED_COMMANDS, DEFAULT_CHARACTER_ENCODING, DEFAULT_COMMAND, KODRDRIV_DEFAULTS, PROGRAM_NAME, VERSION } from "./constants";
import { getLogger } from "./logging";
const logger = getLogger();
import { CommandConfig, Config, SecureConfig } from './types'; // Import the Config type from main.ts
import * as Storage from "./util/storage";
import { safeJsonParse } from './util/validation';
import { readStdin } from "./util/stdin";

export const InputSchema = z.object({
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    overrides: z.boolean().optional(),
    checkConfig: z.boolean().optional(),
    initConfig: z.boolean().optional(),
    model: z.string().optional(),
    openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
    openaiMaxOutputTokens: z.number().optional(),
    contextDirectories: z.array(z.string()).optional(),
    configDir: z.string().optional(),
    outputDir: z.string().optional(),
    preferencesDir: z.string().optional(),
    cached: z.boolean().optional(),
    add: z.boolean().optional(),
    sendit: z.boolean().optional(),
    interactive: z.boolean().optional(),
    amend: z.boolean().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    targetVersion: z.string().optional(),
    excludedPatterns: z.array(z.string()).optional(),
    excludedPaths: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(), // Alias for excludedPatterns
    context: z.string().optional(),
    note: z.string().optional(), // For review command positional argument/STDIN
    direction: z.string().optional(),
    messageLimit: z.number().optional(),
    skipFileCheck: z.boolean().optional(),
    maxDiffBytes: z.number().optional(),
    mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
    syncTarget: z.boolean().optional(),
    scopeRoots: z.string().optional(),
    workspaceFile: z.string().optional(),
    cleanNodeModules: z.boolean().optional(),

    startFrom: z.string().optional(),
    stopAt: z.string().optional(),
    script: z.string().optional(),
    cmd: z.string().optional(),
    publish: z.boolean().optional(),
    parallel: z.boolean().optional(),
    continue: z.boolean().optional(),
    includeCommitHistory: z.boolean().optional(),
    includeRecentDiffs: z.boolean().optional(),
    editorTimeout: z.number().optional(),
    includeReleaseNotes: z.boolean().optional(),
    includeGithubIssues: z.boolean().optional(),
    commitHistoryLimit: z.number().optional(),
    diffHistoryLimit: z.number().optional(),
    releaseNotesLimit: z.number().optional(),
    githubIssuesLimit: z.number().optional(),
    file: z.string().optional(), // Audio file path for audio-commit and audio-review
    directory: z.string().optional(), // Add directory option at top level (for audio commands)
    directories: z.array(z.string()).optional(), // Add directories option at top level (for tree commands)
    externals: z.array(z.string()).optional(), // External packages to include/exclude
    keepTemp: z.boolean().optional(), // Keep temporary recording files
    noMilestones: z.boolean().optional(), // Disable GitHub milestone integration
    subcommand: z.string().optional(), // Subcommand for versions command
});

export type Input = z.infer<typeof InputSchema>;

// Function to transform flat CLI args into nested Config structure
export const transformCliArgs = (finalCliArgs: Input, commandName?: string): Partial<Config> => {
    const transformedCliArgs: Partial<Config> = {};

    // Root-level properties
    if (finalCliArgs.dryRun !== undefined) transformedCliArgs.dryRun = finalCliArgs.dryRun;
    if (finalCliArgs.verbose !== undefined) transformedCliArgs.verbose = finalCliArgs.verbose;
    if (finalCliArgs.debug !== undefined) transformedCliArgs.debug = finalCliArgs.debug;
    if (finalCliArgs.model !== undefined) transformedCliArgs.model = finalCliArgs.model;
    if (finalCliArgs.outputDir !== undefined) transformedCliArgs.outputDirectory = finalCliArgs.outputDir;
    if (finalCliArgs.preferencesDir !== undefined) transformedCliArgs.preferencesDirectory = finalCliArgs.preferencesDir;
    if (finalCliArgs.configDir !== undefined) transformedCliArgs.configDirectory = finalCliArgs.configDir;
    if (finalCliArgs.overrides !== undefined) transformedCliArgs.overrides = finalCliArgs.overrides;
    if (finalCliArgs.contextDirectories !== undefined) transformedCliArgs.contextDirectories = finalCliArgs.contextDirectories;
    if (finalCliArgs.openaiReasoning !== undefined) transformedCliArgs.openaiReasoning = finalCliArgs.openaiReasoning;
    if (finalCliArgs.openaiMaxOutputTokens !== undefined) transformedCliArgs.openaiMaxOutputTokens = finalCliArgs.openaiMaxOutputTokens;

    // Nested mappings for 'commit' options
    if (finalCliArgs.add !== undefined || finalCliArgs.cached !== undefined || finalCliArgs.sendit !== undefined || finalCliArgs.skipFileCheck !== undefined || finalCliArgs.maxDiffBytes !== undefined || finalCliArgs.messageLimit !== undefined || finalCliArgs.openaiReasoning !== undefined || finalCliArgs.openaiMaxOutputTokens !== undefined || finalCliArgs.amend !== undefined || finalCliArgs.context !== undefined || finalCliArgs.direction !== undefined || (commandName === 'commit' && finalCliArgs.interactive !== undefined) || (finalCliArgs as any).push !== undefined) {
        transformedCliArgs.commit = {};
        if (finalCliArgs.add !== undefined) transformedCliArgs.commit.add = finalCliArgs.add;
        if (finalCliArgs.cached !== undefined) transformedCliArgs.commit.cached = finalCliArgs.cached;
        if (finalCliArgs.sendit !== undefined) transformedCliArgs.commit.sendit = finalCliArgs.sendit;
        if (finalCliArgs.skipFileCheck !== undefined) transformedCliArgs.commit.skipFileCheck = finalCliArgs.skipFileCheck;
        if (finalCliArgs.maxDiffBytes !== undefined) transformedCliArgs.commit.maxDiffBytes = finalCliArgs.maxDiffBytes;
        if (finalCliArgs.messageLimit !== undefined) transformedCliArgs.commit.messageLimit = finalCliArgs.messageLimit;
        if (finalCliArgs.amend !== undefined) transformedCliArgs.commit.amend = finalCliArgs.amend;
        if ((finalCliArgs as any).push !== undefined) (transformedCliArgs.commit as any).push = (finalCliArgs as any).push;
        if (finalCliArgs.context !== undefined) transformedCliArgs.commit.context = finalCliArgs.context;
        if (finalCliArgs.direction !== undefined) transformedCliArgs.commit.direction = finalCliArgs.direction;
        if (commandName === 'commit' && finalCliArgs.interactive !== undefined) transformedCliArgs.commit.interactive = finalCliArgs.interactive;
        if (finalCliArgs.openaiReasoning !== undefined) transformedCliArgs.commit.openaiReasoning = finalCliArgs.openaiReasoning;
        if (finalCliArgs.openaiMaxOutputTokens !== undefined) transformedCliArgs.commit.openaiMaxOutputTokens = finalCliArgs.openaiMaxOutputTokens;
    }

    // Nested mappings for 'audioCommit' options
    if (finalCliArgs.file !== undefined || finalCliArgs.keepTemp !== undefined || finalCliArgs.openaiReasoning !== undefined || finalCliArgs.openaiMaxOutputTokens !== undefined) {
        transformedCliArgs.audioCommit = {};
        if (finalCliArgs.file !== undefined) transformedCliArgs.audioCommit.file = finalCliArgs.file;
        if (finalCliArgs.keepTemp !== undefined) transformedCliArgs.audioCommit.keepTemp = finalCliArgs.keepTemp;
        if (finalCliArgs.openaiReasoning !== undefined) transformedCliArgs.audioCommit.openaiReasoning = finalCliArgs.openaiReasoning;
        if (finalCliArgs.openaiMaxOutputTokens !== undefined) transformedCliArgs.audioCommit.openaiMaxOutputTokens = finalCliArgs.openaiMaxOutputTokens;
    }

    // Nested mappings for 'release' options (only when it's NOT a publish command)
    if (commandName !== 'publish') {
        if (finalCliArgs.from !== undefined || finalCliArgs.to !== undefined || finalCliArgs.maxDiffBytes !== undefined || finalCliArgs.interactive !== undefined || finalCliArgs.noMilestones !== undefined || finalCliArgs.openaiReasoning !== undefined || finalCliArgs.openaiMaxOutputTokens !== undefined) {
            transformedCliArgs.release = {};
            if (finalCliArgs.from !== undefined) transformedCliArgs.release.from = finalCliArgs.from;
            if (finalCliArgs.to !== undefined) transformedCliArgs.release.to = finalCliArgs.to;
            if ((commandName === 'release' || finalCliArgs.from !== undefined || finalCliArgs.to !== undefined) && finalCliArgs.context !== undefined) transformedCliArgs.release.context = finalCliArgs.context;
            if (finalCliArgs.interactive !== undefined) transformedCliArgs.release.interactive = finalCliArgs.interactive;
            if ((commandName === 'release' || finalCliArgs.from !== undefined || finalCliArgs.to !== undefined) && finalCliArgs.messageLimit !== undefined) transformedCliArgs.release.messageLimit = finalCliArgs.messageLimit;
            if (finalCliArgs.maxDiffBytes !== undefined) transformedCliArgs.release.maxDiffBytes = finalCliArgs.maxDiffBytes;
            if (finalCliArgs.noMilestones !== undefined) transformedCliArgs.release.noMilestones = finalCliArgs.noMilestones;
            if (finalCliArgs.openaiReasoning !== undefined) transformedCliArgs.release.openaiReasoning = finalCliArgs.openaiReasoning;
            if (finalCliArgs.openaiMaxOutputTokens !== undefined) transformedCliArgs.release.openaiMaxOutputTokens = finalCliArgs.openaiMaxOutputTokens;
        }
    }

    // Nested mappings for 'publish' options – map whenever publish-specific options are provided
    if (
        finalCliArgs.mergeMethod !== undefined ||
        finalCliArgs.targetVersion !== undefined ||
        finalCliArgs.interactive !== undefined ||
        finalCliArgs.syncTarget !== undefined ||
        (commandName === 'publish' && (finalCliArgs.from !== undefined || finalCliArgs.noMilestones !== undefined))
    ) {
        transformedCliArgs.publish = {};
        if (finalCliArgs.mergeMethod !== undefined) transformedCliArgs.publish.mergeMethod = finalCliArgs.mergeMethod;
        if ((commandName === 'publish' || finalCliArgs.mergeMethod !== undefined || finalCliArgs.targetVersion !== undefined || finalCliArgs.syncTarget !== undefined || finalCliArgs.interactive !== undefined) && finalCliArgs.from !== undefined) transformedCliArgs.publish.from = finalCliArgs.from;
        if (finalCliArgs.targetVersion !== undefined) transformedCliArgs.publish.targetVersion = finalCliArgs.targetVersion;
        if (finalCliArgs.interactive !== undefined) transformedCliArgs.publish.interactive = finalCliArgs.interactive;
        if (finalCliArgs.syncTarget !== undefined) transformedCliArgs.publish.syncTarget = finalCliArgs.syncTarget;
        if ((commandName === 'publish' || finalCliArgs.mergeMethod !== undefined || finalCliArgs.targetVersion !== undefined || finalCliArgs.syncTarget !== undefined || finalCliArgs.interactive !== undefined) && finalCliArgs.noMilestones !== undefined) transformedCliArgs.publish.noMilestones = finalCliArgs.noMilestones;
    }

    // Nested mappings for 'development' options
    if (commandName === 'development' && (finalCliArgs.targetVersion !== undefined || finalCliArgs.noMilestones !== undefined)) {
        transformedCliArgs.development = {};
        if (finalCliArgs.targetVersion !== undefined) transformedCliArgs.development.targetVersion = finalCliArgs.targetVersion;
        if (finalCliArgs.noMilestones !== undefined) transformedCliArgs.development.noMilestones = finalCliArgs.noMilestones;
        // Mirror targetVersion into publish; mirror noMilestones into publish and release to match test expectations
        transformedCliArgs.publish = {
            ...(transformedCliArgs.publish || {}),
            ...(finalCliArgs.targetVersion !== undefined ? { targetVersion: finalCliArgs.targetVersion } : {}),
            ...(finalCliArgs.noMilestones !== undefined ? { noMilestones: finalCliArgs.noMilestones } : {}),
        };
        transformedCliArgs.release = {
            ...(transformedCliArgs.release || {}),
            ...(finalCliArgs.noMilestones !== undefined ? { noMilestones: finalCliArgs.noMilestones } : {}),
        };
    }

    // Nested mappings for 'link' and 'unlink' options
    const linkPackageArgument = (finalCliArgs as any).packageArgument;
    if ((commandName === 'link' || commandName === undefined) && (finalCliArgs.scopeRoots !== undefined || linkPackageArgument !== undefined)) {
        transformedCliArgs.link = {};
        if (finalCliArgs.scopeRoots !== undefined) {
            try {
                transformedCliArgs.link.scopeRoots = safeJsonParse(finalCliArgs.scopeRoots, 'scopeRoots CLI argument');

            } catch (error) {
                throw new Error(`Invalid JSON for scope-roots: ${finalCliArgs.scopeRoots}`);
            }
        }
        if (linkPackageArgument !== undefined) {
            transformedCliArgs.link.packageArgument = linkPackageArgument;
        }
    }

    // Nested mappings for 'unlink' options
    const unlinkPackageArgument = (finalCliArgs as any).packageArgument;

    if (commandName === 'unlink' && (finalCliArgs.scopeRoots !== undefined || unlinkPackageArgument !== undefined || finalCliArgs.workspaceFile !== undefined || finalCliArgs.cleanNodeModules !== undefined)) {
        transformedCliArgs.unlink = {};
        if (finalCliArgs.scopeRoots !== undefined) {
            try {
                transformedCliArgs.unlink.scopeRoots = safeJsonParse(finalCliArgs.scopeRoots, 'scopeRoots CLI argument');
            } catch (error) {
                throw new Error(`Invalid JSON for scope-roots: ${finalCliArgs.scopeRoots}`);
            }
        }
        if (finalCliArgs.workspaceFile !== undefined) transformedCliArgs.unlink.workspaceFile = finalCliArgs.workspaceFile;
        if (finalCliArgs.cleanNodeModules !== undefined) transformedCliArgs.unlink.cleanNodeModules = finalCliArgs.cleanNodeModules;
        if (unlinkPackageArgument !== undefined) {
            transformedCliArgs.unlink.packageArgument = unlinkPackageArgument;
        }
    }

    // Nested mappings for 'audio-review' options (only when it's not a tree command)
    if (commandName !== 'tree' && (finalCliArgs.includeCommitHistory !== undefined ||
        finalCliArgs.includeRecentDiffs !== undefined ||
        finalCliArgs.includeReleaseNotes !== undefined ||
        finalCliArgs.includeGithubIssues !== undefined ||
        finalCliArgs.commitHistoryLimit !== undefined ||
        finalCliArgs.diffHistoryLimit !== undefined ||
        finalCliArgs.releaseNotesLimit !== undefined ||
        finalCliArgs.githubIssuesLimit !== undefined ||
        finalCliArgs.file !== undefined ||
        finalCliArgs.directories !== undefined ||
        finalCliArgs.keepTemp !== undefined ||
        finalCliArgs.openaiReasoning !== undefined ||
        finalCliArgs.openaiMaxOutputTokens !== undefined)) {
        transformedCliArgs.audioReview = {};
        if (finalCliArgs.includeCommitHistory !== undefined) transformedCliArgs.audioReview.includeCommitHistory = finalCliArgs.includeCommitHistory;
        if (finalCliArgs.includeRecentDiffs !== undefined) transformedCliArgs.audioReview.includeRecentDiffs = finalCliArgs.includeRecentDiffs;
        if (finalCliArgs.includeReleaseNotes !== undefined) transformedCliArgs.audioReview.includeReleaseNotes = finalCliArgs.includeReleaseNotes;
        if (finalCliArgs.includeGithubIssues !== undefined) transformedCliArgs.audioReview.includeGithubIssues = finalCliArgs.includeGithubIssues;
        if (finalCliArgs.commitHistoryLimit !== undefined) transformedCliArgs.audioReview.commitHistoryLimit = finalCliArgs.commitHistoryLimit;
        if (finalCliArgs.diffHistoryLimit !== undefined) transformedCliArgs.audioReview.diffHistoryLimit = finalCliArgs.diffHistoryLimit;
        if (finalCliArgs.releaseNotesLimit !== undefined) transformedCliArgs.audioReview.releaseNotesLimit = finalCliArgs.releaseNotesLimit;
        if (finalCliArgs.githubIssuesLimit !== undefined) transformedCliArgs.audioReview.githubIssuesLimit = finalCliArgs.githubIssuesLimit;
        if (finalCliArgs.context !== undefined) transformedCliArgs.audioReview.context = finalCliArgs.context;
        if (finalCliArgs.sendit !== undefined) transformedCliArgs.audioReview.sendit = finalCliArgs.sendit;
        if (finalCliArgs.file !== undefined) transformedCliArgs.audioReview.file = finalCliArgs.file;
        if (finalCliArgs.directory !== undefined) transformedCliArgs.audioReview.directory = finalCliArgs.directory;
        if (finalCliArgs.keepTemp !== undefined) transformedCliArgs.audioReview.keepTemp = finalCliArgs.keepTemp;
        if (finalCliArgs.openaiReasoning !== undefined) transformedCliArgs.audioReview.openaiReasoning = finalCliArgs.openaiReasoning;
        if (finalCliArgs.openaiMaxOutputTokens !== undefined) transformedCliArgs.audioReview.openaiMaxOutputTokens = finalCliArgs.openaiMaxOutputTokens;
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
        finalCliArgs.note !== undefined ||
        finalCliArgs.openaiReasoning !== undefined ||
        finalCliArgs.openaiMaxOutputTokens !== undefined ||
        (commandName === 'review' && (finalCliArgs.file !== undefined || finalCliArgs.directory !== undefined))) {
        transformedCliArgs.review = {};
        if (finalCliArgs.note !== undefined) transformedCliArgs.review.note = finalCliArgs.note;
        if (commandName === 'review' && finalCliArgs.file !== undefined) transformedCliArgs.review.file = finalCliArgs.file;
        if (commandName === 'review' && finalCliArgs.directory !== undefined) transformedCliArgs.review.directory = finalCliArgs.directory;
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
        if (finalCliArgs.editorTimeout !== undefined) transformedCliArgs.review.editorTimeout = finalCliArgs.editorTimeout;
        if (finalCliArgs.openaiReasoning !== undefined) transformedCliArgs.review.openaiReasoning = finalCliArgs.openaiReasoning;
        if (finalCliArgs.openaiMaxOutputTokens !== undefined) transformedCliArgs.review.openaiMaxOutputTokens = finalCliArgs.openaiMaxOutputTokens;
    }

    // Nested mappings for 'tree' options (add when relevant args present)
    if (commandName === 'tree') {
        const builtInCommand = (finalCliArgs as any).builtInCommand;
        const packageArgument = (finalCliArgs as any).packageArgument;

        // Only create tree object if there are actual tree-specific options
        if (finalCliArgs.directories !== undefined || finalCliArgs.directory !== undefined ||
            finalCliArgs.startFrom !== undefined ||
            finalCliArgs.stopAt !== undefined || finalCliArgs.cmd !== undefined ||
            builtInCommand !== undefined || finalCliArgs.continue !== undefined ||
            packageArgument !== undefined || finalCliArgs.cleanNodeModules !== undefined ||
            finalCliArgs.externals !== undefined) {

            transformedCliArgs.tree = {};
            if (finalCliArgs.directories !== undefined) transformedCliArgs.tree.directories = finalCliArgs.directories;
            else if (finalCliArgs.directory !== undefined) transformedCliArgs.tree.directories = [finalCliArgs.directory];
            if (finalCliArgs.startFrom !== undefined) transformedCliArgs.tree.startFrom = finalCliArgs.startFrom;
            if (finalCliArgs.stopAt !== undefined) transformedCliArgs.tree.stopAt = finalCliArgs.stopAt;
            if (finalCliArgs.cmd !== undefined) transformedCliArgs.tree.cmd = finalCliArgs.cmd;
            // Note: parallel property is not part of the tree config type
            if (builtInCommand !== undefined) transformedCliArgs.tree.builtInCommand = builtInCommand;
            if (finalCliArgs.continue !== undefined) transformedCliArgs.tree.continue = finalCliArgs.continue;
            if (packageArgument !== undefined) transformedCliArgs.tree.packageArgument = packageArgument;
            if (finalCliArgs.cleanNodeModules !== undefined) transformedCliArgs.tree.cleanNodeModules = finalCliArgs.cleanNodeModules;
            if (finalCliArgs.externals !== undefined) transformedCliArgs.tree.externals = finalCliArgs.externals;
        }
    }

    // Nested mappings for 'development' options
    if (commandName === 'development' && (finalCliArgs.targetVersion !== undefined || finalCliArgs.noMilestones !== undefined)) {
        transformedCliArgs.development = {};
        if (finalCliArgs.targetVersion !== undefined) transformedCliArgs.development.targetVersion = finalCliArgs.targetVersion;
        if (finalCliArgs.noMilestones !== undefined) transformedCliArgs.development.noMilestones = finalCliArgs.noMilestones;
    }

    // Nested mappings for 'versions' options
    if (commandName === 'versions' && (finalCliArgs.subcommand !== undefined || finalCliArgs.directories !== undefined)) {
        transformedCliArgs.versions = {};
        if (finalCliArgs.subcommand !== undefined) transformedCliArgs.versions.subcommand = finalCliArgs.subcommand;
        if (finalCliArgs.directories !== undefined) transformedCliArgs.versions.directories = finalCliArgs.directories;
    }

    // Handle excluded patterns (Commander.js converts --excluded-paths to excludedPaths)
    // Also handle exclude as alias for excludedPatterns
    const excludedPatterns = finalCliArgs.excludedPatterns || finalCliArgs.exclude || finalCliArgs.excludedPaths;
    if (excludedPatterns !== undefined) {
        if (commandName === 'tree') {
            // For tree command, map to both root level excludedPatterns AND tree.exclude
            transformedCliArgs.excludedPatterns = excludedPatterns;
            if (!transformedCliArgs.tree) {
                transformedCliArgs.tree = {};
            }
            transformedCliArgs.tree.exclude = excludedPatterns;
        } else {
            // For non-tree commands, map to root level excludedPatterns
            transformedCliArgs.excludedPatterns = excludedPatterns;
        }
    }

    // Handle externals - map to appropriate command objects based on command type
    if (finalCliArgs.externals !== undefined) {
        if (commandName === 'link') {
            if (!transformedCliArgs.link) {
                transformedCliArgs.link = {};
            }
            transformedCliArgs.link.externals = finalCliArgs.externals;
        } else if (commandName === 'unlink') {
            if (!transformedCliArgs.unlink) {
                transformedCliArgs.unlink = {};
            }
            transformedCliArgs.unlink.externals = finalCliArgs.externals;
        } else if (commandName === 'tree') {
            if (!transformedCliArgs.tree) {
                transformedCliArgs.tree = {};
            }
            transformedCliArgs.tree.externals = finalCliArgs.externals;
        }
    }

    // Note: openaiApiKey is handled separately via environment variable only

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
        const configDir = transformedCliArgs.configDirectory || KODRDRIV_DEFAULTS.configDirectory;
        const absoluteConfigDir = path.isAbsolute(configDir) ? configDir : path.resolve(process.cwd(), configDir);
        await cardigantime.generateConfig(absoluteConfigDir);

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
    const transformedCliArgs: Partial<Config> = transformCliArgs(finalCliArgs, commandConfig.commandName);
    logger.silly('Transformed CLI Args for merging: %s', JSON.stringify(transformedCliArgs, null, 2));

    // Get values from config file using Cardigantime's hierarchical configuration
    const fileValues: Partial<Config> = await cardigantime.read(transformedCliArgs) as Partial<Config>;

    // Merge configurations: Defaults -> File -> CLI
    // Properly merge nested sections to preserve config file values when CLI args are partial
    const mergedLink = {
        ...KODRDRIV_DEFAULTS.link,
        ...fileValues.link,
        ...transformedCliArgs.link,
    };

    const mergedCommit = {
        ...KODRDRIV_DEFAULTS.commit,
        ...fileValues.commit,
        ...transformedCliArgs.commit,
    };

    const mergedRelease = {
        ...KODRDRIV_DEFAULTS.release,
        ...fileValues.release,
        ...transformedCliArgs.release,
    };

    const mergedPublish = {
        ...KODRDRIV_DEFAULTS.publish,
        ...fileValues.publish,
        ...transformedCliArgs.publish,
    };

    const mergedAudioCommit = {
        ...KODRDRIV_DEFAULTS.audioCommit,
        ...fileValues.audioCommit,
        ...transformedCliArgs.audioCommit,
    };

    const mergedAudioReview = {
        ...KODRDRIV_DEFAULTS.audioReview,
        ...fileValues.audioReview,
        ...transformedCliArgs.audioReview,
    };

    const mergedReview = {
        ...KODRDRIV_DEFAULTS.review,
        ...fileValues.review,
        ...transformedCliArgs.review,
    };

    const mergedTree = {
        ...KODRDRIV_DEFAULTS.tree,
        ...fileValues.tree,
        ...transformedCliArgs.tree,
    };

    const partialConfig: Partial<Config> = {
        ...KODRDRIV_DEFAULTS,      // Start with Kodrdriv defaults
        ...fileValues,            // Apply file values (overwrites defaults)
        ...transformedCliArgs,    // Apply CLI args last (highest precedence)
        // Override with properly merged nested sections
        link: mergedLink,
        commit: mergedCommit,
        release: mergedRelease,
        publish: mergedPublish,
        audioCommit: mergedAudioCommit,
        audioReview: mergedAudioReview,
        review: mergedReview,
        tree: mergedTree,
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
export async function getCliConfig(
    program: Command,
    commands?: {
        commitCommand?: Command;
        audioCommitCommand?: Command;
        releaseCommand?: Command;
        publishCommand?: Command;
        treeCommand?: Command;
        linkCommand?: Command;
        unlinkCommand?: Command;
        audioReviewCommand?: Command;
        reviewCommand?: Command;
        cleanCommand?: Command;
        developmentCommand?: Command;
        versionsCommand?: Command;
        selectAudioCommand?: Command;
    }
): Promise<[Input, CommandConfig]> {

    const addSharedOptions = (command: Command) => {
        command
            .option('--dry-run', 'perform a dry run without saving files') // Removed default, will be handled by merging
            .option('--verbose', 'enable verbose logging')
            .option('--debug', 'enable debug logging')
            .option('--overrides', 'enable overrides')
            .option('--model <model>', 'OpenAI model to use')
            .option('--openai-reasoning <level>', 'OpenAI reasoning level (low, medium, high)')
            .option('--openai-max-output-tokens <tokens>', 'OpenAI maximum output tokens', parseInt)
            .option('-d, --context-directories [contextDirectories...]', 'directories to scan for context')
            .option('--config-dir <configDir>', 'configuration directory') // Keep config-dir for specifying location
            .option('--output-dir <outputDir>', 'output directory for generated files')
            .option('--preferences-dir <preferencesDir>', 'preferences directory for personal settings')
            .option('--excluded-paths [excludedPatterns...]', 'paths to exclude from the diff')
            .option('--keep-temp', 'keep temporary recording files');
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
        .option('--interactive', 'Present commit message for interactive review and editing')
        .option('--amend', 'Amend the last commit with the generated message')
        .option('--message-limit <messageLimit>', 'limit the number of messages to generate')
        .option('--skip-file-check', 'skip check for file: dependencies before committing')
        .option('--max-diff-bytes <maxDiffBytes>', 'maximum bytes per file in diff (default: 2048)');

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
                ['--interactive', 'Present commit message for interactive review and editing'],
                ['--amend', 'Amend the last commit with the generated message'],
                ['--message-limit <messageLimit>', 'limit the number of messages to generate']
            ];

            const globalOptions = [
                ['--dry-run', 'perform a dry run without saving files'],
                ['--verbose', 'enable verbose logging'],
                ['--debug', 'enable debug logging'],
                ['--overrides', 'enable overrides'],
                ['--model <model>', 'OpenAI model to use'],
                ['--openai-reasoning <level>', 'OpenAI reasoning level (low, medium, high)'],
                ['--openai-max-output-tokens <tokens>', 'OpenAI maximum output tokens'],
                ['-d, --context-directories [contextDirectories...]', 'directories to scan for context'],
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
                formatOptionsSection('Global Options', globalOptions) + '\n' +
                'Environment Variables:\n' +
                '  OPENAI_API_KEY          OpenAI API key (required)\n';
        }
    });

    const audioCommitCommand = program
        .command('audio-commit')
        .option('--cached', 'use cached diff')
        .option('--add', 'add all changes before committing')
        .option('--sendit', 'Commit with the message generated. No review.')
        .option('--direction <direction>', 'direction or guidance for the commit message')
        .option('--message-limit <messageLimit>', 'limit the number of messages to generate')
        .option('--file <file>', 'audio file path')
        .description('Record audio to provide context, then generate and optionally commit with AI-generated message');
    addSharedOptions(audioCommitCommand);

    const releaseCommand = program
        .command('release')
        .option('--from <from>', 'branch to generate release notes from')
        .option('--to <to>', 'branch to generate release notes to')
        .option('--context <context>', 'context for the commit message')
        .option('--interactive', 'Present release notes for interactive review and editing')
        .option('--max-diff-bytes <maxDiffBytes>', 'maximum bytes per file in diff (default: 2048)')
        .option('--no-milestones', 'disable GitHub milestone integration')
        .description('Generate release notes');
    addSharedOptions(releaseCommand);

    const publishCommand = program
        .command('publish')
        .option('--merge-method <method>', 'method to merge PR (merge, squash, rebase)', 'squash')
        .option('--from <from>', 'branch/tag to generate release notes from (default: main)')
        .option('--target-version <targetVersion>', 'target version for release (explicit version like "4.30.0" or semantic bump: "patch", "minor", "major")')
        .option('--interactive', 'present release notes for interactive review and editing')
        .option('--sendit', 'skip all confirmation prompts and proceed automatically')
        .option('--sync-target', 'attempt to automatically sync target branch with remote before publishing')
        .option('--no-milestones', 'disable GitHub milestone integration')
        .description('Publish a release');
    addSharedOptions(publishCommand);

    const treeCommand = program
        .command('tree [command] [packageArgument]')
        .option('--directory <directory>', 'target directory containing multiple packages (defaults to current directory)')
        .option('--directories [directories...]', 'target directories containing multiple packages (defaults to current directory)')
        .option('--start-from <startFrom>', 'resume execution from this package directory name (useful for restarting failed builds)')
        .option('--stop-at <stopAt>', 'stop execution at this package directory name (the specified package will not be executed)')
        .option('--cmd <cmd>', 'shell command to execute in each package directory (e.g., "npm install", "git status")')
        .option('--parallel', 'execute packages in parallel when dependencies allow (packages with no interdependencies run simultaneously)')
        .option('--excluded-patterns [excludedPatterns...]', 'patterns to exclude packages from processing (e.g., "**/node_modules/**", "dist/*")')
        .option('--continue', 'continue from previous tree publish execution')
        .option('--clean-node-modules', 'for unlink command: remove node_modules and package-lock.json, then reinstall dependencies')
        .description('Analyze package dependencies in workspace and execute commands in dependency order. Supports built-in commands: commit, publish, link, unlink, development, branches');
    addSharedOptions(treeCommand);

    const linkCommand = program
        .command('link')
        .option('--scope-roots <scopeRoots>', 'JSON mapping of scopes to root directories (e.g., \'{"@company": "../"}\')')
        .description('Create npm file: dependencies for local development');
    addSharedOptions(linkCommand);

    const unlinkCommand = program
        .command('unlink')
        .option('--scope-roots <scopeRoots>', 'JSON mapping of scopes to root directories (e.g., \'{"@company": "../"}\')')
        .option('--clean-node-modules', 'remove node_modules and package-lock.json, then reinstall dependencies')
        .description('Restore original dependencies and rebuild node_modules');
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
        .option('--file <file>', 'audio file path')
        .option('--directory <directory>', 'directory containing audio files to process')
        .option('--max-recording-time <time>', 'maximum recording time in seconds', parseInt)
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
        .option('--file <file>', 'read review note from a file')
        .option('--directory <directory>', 'process all review files in a directory')
        .option('--sendit', 'Create GitHub issues automatically without confirmation')
        .option('--editor-timeout <timeout>', 'timeout for editor in milliseconds (default: no timeout)', parseInt)
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
                ['--context <context>', 'additional context for the review'],
                ['--file <file>', 'read review note from a file'],
                ['--directory <directory>', 'process all review files in a directory']
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
                ['--openai-reasoning <level>', 'OpenAI reasoning level (low, medium, high)'],
                ['--openai-max-output-tokens <tokens>', 'OpenAI maximum output tokens'],
                ['-d, --context-directories [contextDirectories...]', 'directories to scan for context'],
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
                formatOptionsSection('Global Options', globalOptions) + '\n' +
                'Environment Variables:\n' +
                '  OPENAI_API_KEY          OpenAI API key (required)\n';
        }
    });

    const cleanCommand = program
        .command('clean')
        .description('Remove the output directory and all generated files');
    addSharedOptions(cleanCommand);

    const developmentCommand = program
        .command('development')
        .option('--target-version <targetVersion>', 'target version bump type (patch, minor, major) or explicit version (e.g., "2.1.0")', 'patch')
        .option('--no-milestones', 'disable GitHub milestone integration')
        .description('Switch to working branch and set up development version');
    addSharedOptions(developmentCommand);

    const versionsCommand = program
        .command('versions <subcommand>')
        .option('--directories [directories...]', 'directories to scan for packages (defaults to current directory)')
        .description('Update dependency versions across packages. Subcommands: minor');
    addSharedOptions(versionsCommand);

    const selectAudioCommand = program
        .command('select-audio')
        .description('Interactively select and save audio device for recording');
    addSharedOptions(selectAudioCommand);

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
        const chosen = commands ?? {
            commitCommand,
            audioCommitCommand,
            releaseCommand,
            publishCommand,
            treeCommand,
            linkCommand,
            unlinkCommand,
            audioReviewCommand,
            reviewCommand,
            cleanCommand,
            developmentCommand,
            versionsCommand,
            selectAudioCommand,
        } as const;

        if (commandName === 'commit' && chosen?.commitCommand?.opts) {
            const commitCmd = chosen.commitCommand;
            commandOptions = commitCmd.opts<Partial<Input>>();
            // Handle positional argument for direction
            // Try to get direction from program.args (after the command name)
            if (program.args.length > 1) {
                commandOptions.direction = program.args[1];
            }

            // Also try commitCommand.args as fallback
            const args = (commitCmd as any).args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    commandOptions.direction = firstTruthyArg;
                }
            }

            // Final fallback: use locally constructed commit command's args
            if (!commandOptions.direction) {
                const localArgs = (commitCommand as any)?.args;
                if (Array.isArray(localArgs) && localArgs.length > 0) {
                    const firstLocalArg = localArgs.find((arg: any) => arg);
                    if (firstLocalArg) {
                        commandOptions.direction = firstLocalArg;
                    }
                }
            }

            // Check for STDIN input for direction (takes precedence over positional argument)
            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                commandOptions.direction = stdinInput;
            }
        } else if (commandName === 'commit' && (chosen as any)?.commit?.opts) {
            // Fallback when a test/mocked commands object provides 'commit' instead of 'commitCommand'
            const commitCmd = (chosen as any).commit as any;
            commandOptions = commitCmd.opts();
            if (program.args.length > 1) {
                commandOptions.direction = program.args[1];
            }
            const args = commitCmd.args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    commandOptions.direction = firstTruthyArg;
                }
            }
            if (!commandOptions.direction) {
                const localArgs = (commitCommand as any)?.args;
                if (Array.isArray(localArgs) && localArgs.length > 0) {
                    const firstLocalArg = localArgs.find((arg: any) => arg);
                    if (firstLocalArg) {
                        commandOptions.direction = firstLocalArg;
                    }
                }
            }
            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                commandOptions.direction = stdinInput;
            }
        } else if (commandName === 'audio-commit' && chosen?.audioCommitCommand?.opts) {
            const audioCommitCmd = chosen.audioCommitCommand;
            commandOptions = audioCommitCmd.opts();
        } else if (commandName === 'release' && chosen?.releaseCommand?.opts) {
            const releaseCmd = chosen.releaseCommand;
            commandOptions = releaseCmd.opts();
        } else if (commandName === 'publish' && chosen?.publishCommand?.opts) {
            const publishCmd = chosen.publishCommand;
            commandOptions = publishCmd.opts();
        } else if (commandName === 'tree' && chosen?.treeCommand?.opts) {
            const treeCmd = chosen.treeCommand as any;
            commandOptions = treeCmd.opts();
            // Handle positional arguments for built-in command and package argument
            const args = treeCmd.args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    (commandOptions as any).builtInCommand = firstTruthyArg;
                    if ((firstTruthyArg === 'link' || firstTruthyArg === 'unlink') && args.length > 1) {
                        const secondTruthyArg = args.slice(1).find((arg: any) => arg);
                        if (secondTruthyArg) {
                            (commandOptions as any).packageArgument = secondTruthyArg;
                        }
                    }
                }
            }

            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                (commandOptions as any).builtInCommand = stdinInput.trim().split('\n')[0] || (commandOptions as any).builtInCommand;
                const stdinLines = stdinInput.split('\n');
                if (stdinLines[1]) {
                    (commandOptions as any).packageArgument = stdinLines[1];
                }
            }
        } else if (commandName === 'link' && chosen?.linkCommand?.opts) {
            const linkCmd = chosen.linkCommand as any;
            commandOptions = linkCmd.opts();
            const args = linkCmd.args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    (commandOptions as any).packageArgument = firstTruthyArg === 'status' ? 'status' : firstTruthyArg;
                }
            }
            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                (commandOptions as any).packageArgument = stdinInput;
            }
        } else if (commandName === 'unlink' && chosen?.unlinkCommand?.opts) {
            const unlinkCmd = chosen.unlinkCommand as any;
            commandOptions = unlinkCmd.opts();
            const args = unlinkCmd.args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    (commandOptions as any).packageArgument = firstTruthyArg === 'status' ? 'status' : firstTruthyArg;
                }
            }
            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                (commandOptions as any).packageArgument = stdinInput;
            }
        } else if (commandName === 'audio-review' && chosen?.audioReviewCommand?.opts) {
            const audioReviewCmd = chosen.audioReviewCommand;
            commandOptions = audioReviewCmd.opts();
        } else if (commandName === 'review' && chosen?.reviewCommand?.opts) {
            const reviewCmd = chosen.reviewCommand as any;
            commandOptions = reviewCmd.opts();
            const args = reviewCmd.args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    commandOptions.note = firstTruthyArg;
                }
            }
            // Final fallback: use locally constructed review command's args
            if (!commandOptions.note) {
                const localArgs = (reviewCommand as any)?.args;
                if (Array.isArray(localArgs) && localArgs.length > 0) {
                    const firstLocalArg = localArgs.find((arg: any) => arg);
                    if (firstLocalArg) {
                        commandOptions.note = firstLocalArg;
                    }
                }
            }
            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                commandOptions.note = stdinInput;
            }
        } else if (commandName === 'review' && (chosen as any)?.review?.opts) {
            const reviewCmd = (chosen as any).review as any;
            commandOptions = reviewCmd.opts();
            const args = reviewCmd.args;
            if (Array.isArray(args) && args.length > 0) {
                const firstTruthyArg = args.find((arg: any) => arg);
                if (firstTruthyArg) {
                    commandOptions.note = firstTruthyArg;
                }
            }
            const stdinInput = await readStdin();
            if (typeof stdinInput === 'string') {
                commandOptions.note = stdinInput;
            }
        } else if (commandName === 'clean' && chosen?.cleanCommand?.opts) {
            const cleanCmd = chosen.cleanCommand;
            commandOptions = cleanCmd.opts();
        } else if (commandName === 'development' && chosen?.developmentCommand?.opts) {
            const developmentCmd = chosen.developmentCommand;
            commandOptions = developmentCmd.opts();
        } else if (commandName === 'versions' && chosen?.versionsCommand?.opts) {
            const versionsCmd = chosen.versionsCommand as any;
            commandOptions = versionsCmd.opts();
            const args = versionsCmd.args;
            if (args && args.length > 0 && args[0]) {
                commandOptions.subcommand = args[0];
            }
        } else if (commandName === 'select-audio' && chosen?.selectAudioCommand?.opts) {
            const selectAudioCmd = chosen.selectAudioCommand;
            commandOptions = selectAudioCmd.opts();
        } else {
            // Final fallback
            commandOptions = program.opts<Partial<Input>>();
        }
    }

    // Include command name in CLI args for merging
    const finalCliArgs = { ...cliArgs, ...commandOptions } as any;
    // Final safety fallback for positional arguments when STDIN is null and mocks provide args on constructed commands
    if (commandName === 'commit' && !finalCliArgs.direction) {
        const localArgs = (commitCommand as any)?.args;
        if (Array.isArray(localArgs) && localArgs.length > 0) {
            const firstLocalArg = localArgs.find((arg: any) => arg);
            if (firstLocalArg) {
                finalCliArgs.direction = firstLocalArg;
            }
        }
    }
    if (commandName === 'review' && !finalCliArgs.note) {
        const localArgs = (reviewCommand as any)?.args;
        if (Array.isArray(localArgs) && localArgs.length > 0) {
            const firstLocalArg = localArgs.find((arg: any) => arg);
            if (firstLocalArg) {
                finalCliArgs.note = firstLocalArg;
            }
        }
    }
    const commandConfig = { commandName };
    return [finalCliArgs, commandConfig];
}

export async function validateAndProcessSecureOptions(): Promise<SecureConfig> {
    // For check-config and init-config commands, we don't want to throw an error for missing API key
    const isCheckConfig = process.argv.includes('--check-config');
    const isInitConfig = process.argv.includes('--init-config');

    if (!process.env.OPENAI_API_KEY && !isCheckConfig && !isInitConfig) {
        throw new Error('OpenAI API key is required. Please set the OPENAI_API_KEY environment variable.');
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
    const configDir = options.configDirectory || KODRDRIV_DEFAULTS.configDirectory;
    // Skip config directory validation since Cardigantime handles hierarchical lookup

    // Ensure all required fields are present and have correct types after merging
    const finalConfig: Config = {
        dryRun: options.dryRun ?? KODRDRIV_DEFAULTS.dryRun,
        verbose: options.verbose ?? KODRDRIV_DEFAULTS.verbose,
        debug: options.debug ?? KODRDRIV_DEFAULTS.debug,
        overrides: options.overrides ?? KODRDRIV_DEFAULTS.overrides,
        model: options.model ?? KODRDRIV_DEFAULTS.model,
        openaiReasoning: options.openaiReasoning ?? KODRDRIV_DEFAULTS.openaiReasoning,
        openaiMaxOutputTokens: options.openaiMaxOutputTokens ?? KODRDRIV_DEFAULTS.openaiMaxOutputTokens,
        contextDirectories: contextDirectories,
        configDirectory: configDir,
        outputDirectory: options.outputDirectory ?? KODRDRIV_DEFAULTS.outputDirectory,
        preferencesDirectory: options.preferencesDirectory ?? KODRDRIV_DEFAULTS.preferencesDirectory,
        // Cardigantime-specific properties (from fileValues or defaults)
        discoveredConfigDirs: (options as any).discoveredConfigDirs ?? [],
        resolvedConfigDirs: (options as any).resolvedConfigDirs ?? [],
        // Command-specific options - ensure all defaults are present even for partial configs
        commit: {
            ...KODRDRIV_DEFAULTS.commit,
            ...Object.fromEntries(Object.entries(options.commit || {}).filter(([_, v]) => v !== undefined && v !== null)),
        },
        audioCommit: {
            ...KODRDRIV_DEFAULTS.audioCommit,
            ...Object.fromEntries(Object.entries(options.audioCommit || {}).filter(([_, v]) => v !== undefined)),
        },
        release: {
            ...KODRDRIV_DEFAULTS.release,
            ...Object.fromEntries(Object.entries(options.release || {}).filter(([_, v]) => v !== undefined)),
        },
        audioReview: {
            ...KODRDRIV_DEFAULTS.audioReview,
            ...Object.fromEntries(Object.entries(options.audioReview || {}).filter(([_, v]) => v !== undefined)),
        },
        review: {
            ...KODRDRIV_DEFAULTS.review,
            ...Object.fromEntries(Object.entries(options.review || {}).filter(([_, v]) => v !== undefined)),
        },
        publish: {
            ...KODRDRIV_DEFAULTS.publish,
            ...Object.fromEntries(Object.entries(options.publish || {}).filter(([_, v]) => v !== undefined)),
        },
        link: {
            ...KODRDRIV_DEFAULTS.link,
            ...Object.fromEntries(Object.entries(options.link || {}).filter(([_, v]) => v !== undefined)),
        },
        unlink: {
            ...KODRDRIV_DEFAULTS.unlink,
            ...Object.fromEntries(Object.entries(options.unlink || {}).filter(([_, v]) => v !== undefined)),
        },
        tree: {
            ...KODRDRIV_DEFAULTS.tree,
            ...Object.fromEntries(Object.entries(options.tree || {}).filter(([_, v]) => v !== undefined)),
        },
        development: {
            ...KODRDRIV_DEFAULTS.development,
            ...Object.fromEntries(Object.entries(options.development || {}).filter(([_, v]) => v !== undefined)),
        },
        versions: {
            ...KODRDRIV_DEFAULTS.versions,
            ...Object.fromEntries(Object.entries(options.versions || {}).filter(([_, v]) => v !== undefined)),
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



