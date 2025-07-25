import * as Cardigantime from '@theunwalked/cardigantime';
import { z } from "zod";

export const ConfigSchema = z.object({
    dryRun: z.boolean().optional(),
    verbose: z.boolean().optional(),
    debug: z.boolean().optional(),
    overrides: z.boolean().optional(),
    model: z.string().optional(),
    contextDirectories: z.array(z.string()).optional(),
    outputDirectory: z.string().optional(),
    preferencesDirectory: z.string().optional(),
    commit: z.object({
        add: z.boolean().optional(),
        cached: z.boolean().optional(),
        sendit: z.boolean().optional(),
        messageLimit: z.number().optional(),
        context: z.string().optional(),
        direction: z.string().optional(),
    }).optional(),
    audioCommit: z.object({
        maxRecordingTime: z.number().optional(),
        audioDevice: z.string().optional(),
        file: z.string().optional(),
        keepTemp: z.boolean().optional(),
    }).optional(),
    release: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        messageLimit: z.number().optional(),
        context: z.string().optional(),
        focus: z.string().optional(),
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
    }).optional(),
    publish: z.object({
        mergeMethod: z.enum(['merge', 'squash', 'rebase']).optional(),
        dependencyUpdatePatterns: z.array(z.string()).optional(),
        requiredEnvVars: z.array(z.string()).optional(),
        linkWorkspacePackages: z.boolean().optional(),
        unlinkWorkspacePackages: z.boolean().optional(),
        checksTimeout: z.number().optional(),
        skipUserConfirmation: z.boolean().optional(),
        sendit: z.boolean().optional(),
        waitForReleaseWorkflows: z.boolean().optional(),
        releaseWorkflowsTimeout: z.number().optional(),
        releaseWorkflowNames: z.array(z.string()).optional(),
    }).optional(),
    link: z.object({
        scopeRoots: z.record(z.string(), z.string()).optional(),
        workspaceFile: z.string().optional(),
        dryRun: z.boolean().optional(),
    }).optional(),
    publishTree: z.object({
        directory: z.string().optional(),
        excludedPatterns: z.array(z.string()).optional(),
        startFrom: z.string().optional(),
        script: z.string().optional(),
        publish: z.boolean().optional(),
    }).optional(),
    excludedPatterns: z.array(z.string()).optional(),
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
    labels: {
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
    focus?: string;
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
}

export type AudioCommitConfig = {
    maxRecordingTime?: number;
    audioDevice?: string;
    file?: string;
    keepTemp?: boolean;
}

export type PublishConfig = {
    from?: string;
    to?: string;
}
