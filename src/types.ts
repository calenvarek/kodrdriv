import * as Cardigantime from '@theunwalked/cardigantime';
import { z } from "zod";

export const ConfigSchema = z.object({
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    overrides: z.boolean().optional(),
    model: z.string().optional(),
    openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
    openaiMaxOutputTokens: z.number().optional(),
    contextDirectories: z.array(z.string()).optional(),
    outputDirectory: z.string().optional(),
    preferencesDirectory: z.string().optional(),
    commit: z.object({
        add: z.boolean().optional(),
        cached: z.boolean().optional(),
        sendit: z.boolean().optional(),
        interactive: z.boolean().optional(),
        amend: z.boolean().optional(),
        push: z.union([z.boolean(), z.string()]).optional(),
        messageLimit: z.number().optional(),
        context: z.string().optional(),
        direction: z.string().optional(),
        skipFileCheck: z.boolean().optional(),
        maxDiffBytes: z.number().optional(),
        model: z.string().optional(),
        openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
        openaiMaxOutputTokens: z.number().optional(),
    }).optional(),
    audioCommit: z.object({
        maxRecordingTime: z.number().optional(),
        audioDevice: z.string().optional(),
        file: z.string().optional(),
        keepTemp: z.boolean().optional(),
        model: z.string().optional(),
        openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
        openaiMaxOutputTokens: z.number().optional(),
    }).optional(),
    release: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        messageLimit: z.number().optional(),
        context: z.string().optional(),
        interactive: z.boolean().optional(),
        focus: z.string().optional(),
        maxDiffBytes: z.number().optional(),
        model: z.string().optional(),
        openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
        openaiMaxOutputTokens: z.number().optional(),
        noMilestones: z.boolean().optional(),
        fromMain: z.boolean().optional(),
        currentBranch: z.string().optional(),
    }).optional(),
    review: z.object({
        includeCommitHistory: z.boolean().optional(),
        includeRecentDiffs: z.boolean().optional(),
        includeReleaseNotes: z.boolean().optional(),
        includeGithubIssues: z.boolean().optional(),
        commitHistoryLimit: z.number().optional(),
        diffHistoryLimit: z.number().optional(),
        releaseNotesLimit: z.number().optional(),
        githubIssuesLimit: z.number().optional(),
        context: z.string().optional(),
        sendit: z.boolean().optional(),
        note: z.string().optional(),
        editorTimeout: z.number().optional(),
        maxContextErrors: z.number().optional(),
        model: z.string().optional(),
        openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
        openaiMaxOutputTokens: z.number().optional(),
        file: z.string().optional(), // File path to read review note from
        directory: z.string().optional(), // Directory to process multiple review files
    }).optional(),
    audioReview: z.object({
        includeCommitHistory: z.boolean().optional(),
        includeRecentDiffs: z.boolean().optional(),
        includeReleaseNotes: z.boolean().optional(),
        includeGithubIssues: z.boolean().optional(),
        commitHistoryLimit: z.number().optional(),
        diffHistoryLimit: z.number().optional(),
        releaseNotesLimit: z.number().optional(),
        githubIssuesLimit: z.number().optional(),
        context: z.string().optional(),
        sendit: z.boolean().optional(),
        maxRecordingTime: z.number().optional(),
        audioDevice: z.string().optional(),
        file: z.string().optional(),
        directory: z.string().optional(),
        keepTemp: z.boolean().optional(),
        model: z.string().optional(),
        openaiReasoning: z.enum(['low', 'medium', 'high']).optional(),
        openaiMaxOutputTokens: z.number().optional(),
    }).optional(),
    publish: z.object({
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
        from: z.string().optional(),
        targetVersion: z.string().optional(),
        interactive: z.boolean().optional(),
        dependencyUpdatePatterns: z.array(z.string()).optional(),
        scopedDependencyUpdates: z.array(z.string()).optional(),
        requiredEnvVars: z.array(z.string()).optional(),
        linkWorkspacePackages: z.boolean().optional(),
        unlinkWorkspacePackages: z.boolean().optional(),
        checksTimeout: z.number().optional(),
        skipUserConfirmation: z.boolean().optional(),
        syncTarget: z.boolean().optional(),
        sendit: z.boolean().optional(),
        waitForReleaseWorkflows: z.boolean().optional(),
        releaseWorkflowsTimeout: z.number().optional(),
        releaseWorkflowNames: z.array(z.string()).optional(),
        targetBranch: z.string().optional(),
        noMilestones: z.boolean().optional(),
        fromMain: z.boolean().optional(),
        skipPrePublishMerge: z.boolean().optional(),
    }).optional(),
    branches: z.record(z.string(), z.object({
        targetBranch: z.string().optional(),
        developmentBranch: z.boolean().optional(),
        version: z.object({
            type: z.enum(['release', 'prerelease']),
            increment: z.boolean().optional(),
            incrementLevel: z.enum(['patch', 'minor', 'major']).optional(),
            tag: z.string().optional(),
        }).optional(),
    })).optional(),
    link: z.object({
        scopeRoots: z.record(z.string(), z.string()).optional(),
        dryRun: z.boolean().optional(),
        packageArgument: z.string().optional(),
        externals: z.array(z.string()).optional(),
    }).optional(),
    unlink: z.object({
        scopeRoots: z.record(z.string(), z.string()).optional(),
        workspaceFile: z.string().optional(),
        dryRun: z.boolean().optional(),
        cleanNodeModules: z.boolean().optional(),
        packageArgument: z.string().optional(),
        externals: z.array(z.string()).optional(),
    }).optional(),
    tree: z.object({
        directories: z.array(z.string()).optional(),
        exclude: z.array(z.string()).optional(),
        startFrom: z.string().optional(),
        stopAt: z.string().optional(),
        cmd: z.string().optional(),
        builtInCommand: z.string().optional(),
        continue: z.boolean().optional(),
        status: z.boolean().optional(),
        promote: z.string().optional(),
        packageArgument: z.string().optional(),
        cleanNodeModules: z.boolean().optional(),
        externals: z.array(z.string()).optional(),
        // Parallel execution options
        parallel: z.boolean().optional(),
        maxConcurrency: z.number().optional(),
        retry: z.object({
            maxAttempts: z.number().optional(),
            initialDelayMs: z.number().optional(),
            maxDelayMs: z.number().optional(),
            backoffMultiplier: z.number().optional(),
            retriableErrors: z.array(z.string()).optional(),
        }).optional(),
        recovery: z.object({
            checkpointInterval: z.enum(['package', 'batch']).optional(),
            autoRetry: z.boolean().optional(),
            continueOnError: z.boolean().optional(),
        }).optional(),
        monitoring: z.object({
            showProgress: z.boolean().optional(),
            showMetrics: z.boolean().optional(),
            logLevel: z.enum(['minimal', 'normal', 'verbose']).optional(),
        }).optional(),
        // Recovery options
        markCompleted: z.array(z.string()).optional(),
        skipPackages: z.array(z.string()).optional(),
        retryFailed: z.boolean().optional(),
        skipFailed: z.boolean().optional(),
        resetPackage: z.string().optional(),
        statusParallel: z.boolean().optional(),
        validateState: z.boolean().optional(),
    }).optional(),
    development: z.object({
        targetVersion: z.string().optional(),
        noMilestones: z.boolean().optional(),
        tagWorkingBranch: z.boolean().optional(),
        createRetroactiveTags: z.boolean().optional(),
        workingTagPrefix: z.string().optional(),
    }).optional(),
    versions: z.object({
        subcommand: z.string().optional(),
        directories: z.array(z.string()).optional(),
    }).optional(),
    updates: z.object({
        scope: z.string().optional(),
        directories: z.array(z.string()).optional(),
    }).optional(),
    excludedPatterns: z.array(z.string()).optional(),
    traits: z.any().optional(), // Add traits property for cardigantime compatibility
});

export const SecureConfigSchema = z.object({
    openaiApiKey: z.string().optional(),
});

export const CommandConfigSchema = z.object({
    commandName: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & Cardigantime.Config;
export type SecureConfig = z.infer<typeof SecureConfigSchema>;
export type CommandConfig = z.infer<typeof CommandConfigSchema>;

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface PullRequest {
    html_url: string;
    number: number;
    labels?: {
        name: string;
    }[];
}

export type ReleaseSummary = {
    title: string;
    body: string;
}

export type ReleaseConfig = {
    from?: string;
    to?: string;
    context?: string;
    interactive?: boolean;
    focus?: string;
    messageLimit?: number;
    maxDiffBytes?: number;
    model?: string;
    openaiReasoning?: 'low' | 'medium' | 'high';
    openaiMaxOutputTokens?: number;
    currentBranch?: string;
}

export type ReviewConfig = {
    includeCommitHistory?: boolean;
    includeRecentDiffs?: boolean;
    includeReleaseNotes?: boolean;
    includeGithubIssues?: boolean;
    commitHistoryLimit?: number;
    diffHistoryLimit?: number;
    releaseNotesLimit?: number;
    githubIssuesLimit?: number;
    context?: string;
    sendit?: boolean;
    note?: string;
    editorTimeout?: number;
    maxContextErrors?: number;
    model?: string;
    openaiReasoning?: 'low' | 'medium' | 'high';
    openaiMaxOutputTokens?: number;
}

export type AudioReviewConfig = {
    includeCommitHistory?: boolean;
    includeRecentDiffs?: boolean;
    includeReleaseNotes?: boolean;
    includeGithubIssues?: boolean;
    commitHistoryLimit?: number;
    diffHistoryLimit?: number;
    releaseNotesLimit?: number;
    githubIssuesLimit?: number;
    context?: string;
    sendit?: boolean;
    maxRecordingTime?: number;
    audioDevice?: string;
    file?: string;
    directory?: string;
    keepTemp?: boolean;
    model?: string;
    openaiReasoning?: 'low' | 'medium' | 'high';
    openaiMaxOutputTokens?: number;
}

export type CommitConfig = {
    add?: boolean;
    cached?: boolean;
    sendit?: boolean;
    interactive?: boolean;
    messageLimit?: number;
    context?: string;
    direction?: string;
    skipFileCheck?: boolean;
    maxDiffBytes?: number;
    model?: string;
    openaiReasoning?: 'low' | 'medium' | 'high';
    openaiMaxOutputTokens?: number;
}

export type AudioCommitConfig = {
    maxRecordingTime?: number;
    audioDevice?: string;
    file?: string;
    keepTemp?: boolean;
    model?: string;
    openaiReasoning?: 'low' | 'medium' | 'high';
    openaiMaxOutputTokens?: number;
}

export type LinkConfig = {
    scopeRoots?: Record<string, string>;
    dryRun?: boolean;
    packageArgument?: string;
    externalLinkPatterns?: string[];
}

export type UnlinkConfig = {
    scopeRoots?: Record<string, string>;
    workspaceFile?: string;
    dryRun?: boolean;
    cleanNodeModules?: boolean;
    packageArgument?: string;
}

export type PublishConfig = {
    mergeMethod?: 'merge' | 'squash' | 'rebase';
    from?: string;
    targetVersion?: string;
    interactive?: boolean;
    dependencyUpdatePatterns?: string[];
    scopedDependencyUpdates?: string[];
    requiredEnvVars?: string[];
    linkWorkspacePackages?: boolean;
    unlinkWorkspacePackages?: boolean;
    checksTimeout?: number;
    skipUserConfirmation?: boolean;
    sendit?: boolean;
    waitForReleaseWorkflows?: boolean;
    releaseWorkflowsTimeout?: number;
    releaseWorkflowNames?: string[];
    targetBranch?: string;
}

export type VersionTargetConfig = {
    type: 'release' | 'prerelease';
    increment?: boolean;
    tag?: string;
}

export type BranchTargetConfig = {
    targetBranch: string;
    developmentBranch?: boolean;
    version?: VersionTargetConfig;
}

export type TargetsConfig = Record<string, BranchTargetConfig>;

export type TreeConfig = {
    directories?: string[];
    excludedPatterns?: string[];
    exclude?: string[]; // Alias for excludedPatterns
    startFrom?: string;
    stopAt?: string;
    cmd?: string;

    builtInCommand?: string;
    continue?: boolean; // Continue from previous tree publish execution
    status?: boolean; // Check status of running tree publish processes
    promote?: string; // Mark a package as completed in the execution context
    packageArgument?: string; // Package argument for link/unlink commands (e.g., "@fjell" or "@fjell/core")
    cleanNodeModules?: boolean; // For unlink command: remove node_modules and package-lock.json, then reinstall dependencies
    externalLinkPatterns?: string[];
    externals?: string[]; // Alias for externalLinkPatterns

    // Parallel execution options
    parallel?: boolean;
    maxConcurrency?: number;
    retry?: {
        maxAttempts: number;
        initialDelayMs: number;
        maxDelayMs: number;
        backoffMultiplier: number;
        retriableErrors?: string[];
    };
    recovery?: {
        checkpointInterval: 'package' | 'batch';
        autoRetry: boolean;
        continueOnError: boolean;
    };
    monitoring?: {
        showProgress: boolean;
        showMetrics: boolean;
        logLevel: 'minimal' | 'normal' | 'verbose';
    };

    // Recovery options
    markCompleted?: string[];
    skipPackages?: string[];
    retryFailed?: boolean;
    skipFailed?: boolean;
    resetPackage?: string;
    statusParallel?: boolean;
    validateState?: boolean;
}

export type DevelopmentConfig = {
    targetVersion?: string; // 'patch', 'minor', 'major', or explicit version like '2.1.0' (default: 'patch')
    noMilestones?: boolean; // Disable GitHub milestone integration
    tagWorkingBranch?: boolean; // Tag working branch with release version before bumping to dev (default: true)
    createRetroactiveTags?: boolean; // Create tags for past releases found in git history (default: false)
    workingTagPrefix?: string; // Tag prefix for working branch tags (default: 'working/')
}

export type VersionsConfig = {
    subcommand?: string; // 'minor' or other versioning strategies
    directories?: string[]; // directories to scan for packages
}

export type UpdatesConfig = {
    scope?: string; // npm scope to update (e.g., '@fjell', '@getdidthey')
    directories?: string[]; // directories to scan for packages (tree mode)
}
