import { Config } from '../types';
import type { SerializedGraph } from '@eldrforge/tree-core';

export interface ParallelExecutionCheckpoint {
    // Metadata
    version: string;
    executionId: string;
    createdAt: string;
    lastUpdated: string;

    // Execution configuration
    command: string;
    originalConfig: Config;
    dependencyGraph: SerializedGraph;
    buildOrder: string[];

    // Execution mode
    executionMode: 'sequential' | 'parallel';
    maxConcurrency: number;

    // Current state
    state: ExecutionState;

    // Version tracking
    publishedVersions: PublishedVersion[];

    // Retry tracking
    retryAttempts: Record<string, number>;
    lastRetryTime: Record<string, string>;

    // Timing and metrics
    packageStartTimes: Record<string, string>;
    packageEndTimes: Record<string, string>;
    packageDurations: Record<string, number>;
    totalStartTime: string;

    // Recovery metadata
    recoveryHints: RecoveryHint[];
    canRecover: boolean;
    estimatedTimeRemaining?: number;
}

export interface ExecutionState {
    pending: string[];
    ready: string[];
    running: RunningPackageSnapshot[];
    completed: string[];
    failed: FailedPackageSnapshot[];
    skipped: string[]; // Skipped due to failed dependencies
    skippedNoChanges: string[]; // Skipped due to no code changes (e.g., only version bump)
}

export interface RunningPackageSnapshot {
    name: string;
    startTime: string;
    elapsedTime: number;
}

export interface FailedPackageSnapshot {
    name: string;
    error: string;
    stack?: string;
    isRetriable: boolean;
    attemptNumber: number;
    failedAt: string;
    dependencies: string[];
    dependents: string[];
    errorDetails?: {
        type?: string; // e.g., 'test_coverage', 'build_error', 'merge_conflict'
        context?: string; // Additional context about the error
        logFile?: string; // Path to log file with full error
        suggestion?: string; // Suggested fix
    };
}

export interface RecoveryHint {
    type: 'error' | 'warning' | 'info';
    message: string;
    actionable: boolean;
    suggestedCommand?: string;
}

export interface PublishedVersion {
    packageName: string;
    version: string;
    publishTime: string;
}

export interface ExecutionResult {
    success: boolean;
    totalPackages: number;
    completed: string[]; // Successfully completed (published or executed)
    failed: FailedPackageSnapshot[];
    skipped: string[]; // Skipped due to failed dependencies
    skippedNoChanges: string[]; // Skipped due to no code changes
    metrics: ExecutionMetrics;
}

export interface ExecutionMetrics {
    totalDuration: number;
    averagePackageDuration: number;
    peakConcurrency: number;
    averageConcurrency: number;
    speedupVsSequential?: number;
}

export interface PackageResult {
    success: boolean;
    duration: number;
    publishedVersion?: string;
    stdout?: string;
    stderr?: string;
    skippedNoChanges?: boolean; // True if package was skipped due to no code changes
}

export interface RetryConfig {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
    retriableErrors?: string[]; // Regex patterns
}

export interface RecoveryConfig {
    checkpointInterval: 'package' | 'batch';
    autoRetry: boolean;
    continueOnError: boolean;
}

export interface MonitoringConfig {
    showProgress: boolean;
    showMetrics: boolean;
    logLevel: 'minimal' | 'normal' | 'verbose';
}
