import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { getLogger } from '../logging';
import { Config } from '../types';
import {
    DependencyGraph,
    findAllDependents
} from '../util/dependencyGraph';
import {
    ParallelExecutionCheckpoint,
    ExecutionState,
    ExecutionResult,
    PackageResult,
    ExecutionMetrics,
    FailedPackageSnapshot
} from '../types/parallelExecution';
import { CheckpointManager } from '../util/checkpointManager';
import { DependencyChecker } from './DependencyChecker';
import { ResourceMonitor } from './ResourceMonitor';
import { Scheduler } from './Scheduler';

export interface PoolConfig {
    graph: DependencyGraph;
    maxConcurrency: number;
    command: string;
    config: Config;
    checkpointPath?: string;
    continue?: boolean;
    maxRetries?: number;
    initialRetryDelay?: number;
    maxRetryDelay?: number;
    backoffMultiplier?: number;
}

interface CompletedTask {
    packageName: string;
    result: PackageResult | null;
    error: Error | null;
}

interface RunningTask {
    packageName: string;
    startTime: Date;
    promise: Promise<PackageResult>;
    controller: AbortController;
}

/**
 * DynamicTaskPool manages parallel execution of packages with dependency awareness
 */
export class DynamicTaskPool extends EventEmitter {
    private config: PoolConfig;
    private graph: DependencyGraph;
    private state: ExecutionState;
    private dependencyChecker: DependencyChecker;
    private resourceMonitor: ResourceMonitor;
    private scheduler: Scheduler;
    private checkpointManager: CheckpointManager;
    private logger = getLogger();

    // Execution tracking
    private executionId: string;
    private startTime: Date;
    private runningTasks = new Map<string, RunningTask>();
    private packageStartTimes = new Map<string, Date>();
    private packageEndTimes = new Map<string, Date>();
    private packageDurations = new Map<string, number>();
    private retryAttempts = new Map<string, number>();
    private publishedVersions: Array<{name: string, version: string, time: Date}> = [];

    constructor(config: PoolConfig) {
        super();
        this.config = config;
        this.graph = config.graph;
        this.executionId = randomUUID();
        this.startTime = new Date();

        // Initialize components
        this.dependencyChecker = new DependencyChecker(this.graph);
        this.resourceMonitor = new ResourceMonitor(config.maxConcurrency);
        this.scheduler = new Scheduler(this.graph, this.dependencyChecker);
        this.checkpointManager = new CheckpointManager(
            config.checkpointPath || process.cwd()
        );

        // Initialize state
        this.state = this.initializeState();
    }

    /**
     * Main execution entry point
     */
    async execute(): Promise<ExecutionResult> {
        this.logger.info(`EXECUTION_STARTING: Starting parallel execution | Max Concurrency: ${this.config.maxConcurrency} | Mode: parallel | Purpose: Execute packages with dependency awareness`);
        this.emit('execution:started', { totalPackages: this.graph.packages.size });

        try {
            // Load checkpoint if continuing
            if (this.config.continue) {
                await this.loadCheckpoint();
            }

            // Initialize ready queue
            this.updateReadyQueue();

            // Main execution loop
            while (!this.isComplete()) {
                // Schedule as many packages as we can
                const availableSlots = this.resourceMonitor.getAvailableSlots();
                if (availableSlots > 0 && this.state.ready.length > 0) {
                    const toSchedule = this.scheduler.getNext(availableSlots, this.state);

                    for (const packageName of toSchedule) {
                        await this.schedulePackage(packageName);
                    }
                }

                // Check if we're stuck
                if (this.runningTasks.size === 0) {
                    if (this.state.ready.length > 0) {
                        throw new Error('Deadlock detected: packages ready but cannot execute');
                    }
                    break; // No more work to do
                }

                // Wait for next package to complete
                const completedTask = await this.waitForNext();
                await this.handleTaskCompletion(completedTask);

                // Update ready queue
                this.updateReadyQueue();

                // Save checkpoint periodically
                if (this.shouldCheckpoint()) {
                    await this.saveCheckpoint();
                }
            }

            // Final checkpoint and cleanup
            // Only cleanup if everything completed (no failures, no skipped packages due to dependencies)
            // Note: skippedNoChanges is OK - those packages successfully ran but had nothing to do
            const allCompleted = this.state.failed.length === 0 && this.state.skipped.length === 0;
            if (allCompleted) {
                await this.checkpointManager.cleanup();
            } else {
                await this.saveCheckpoint();
            }

            // Build and return result
            const result = this.buildExecutionResult();
            this.emit('execution:completed', { result });

            return result;
        } catch (error) {
            // Save checkpoint on error
            await this.saveCheckpoint();
            throw error;
        }
    }

    /**
     * Initialize execution state
     */
    private initializeState(): ExecutionState {
        const buildOrder = Array.from(this.graph.packages.keys());

        return {
            pending: [...buildOrder],
            ready: [],
            running: [],
            completed: [],
            failed: [],
            skipped: [],
            skippedNoChanges: []
        };
    }

    /**
     * Schedule a package for execution
     */
    private async schedulePackage(packageName: string): Promise<void> {
        // Move from ready to running
        this.state.ready = this.state.ready.filter(p => p !== packageName);

        // Allocate resource
        if (!this.resourceMonitor.allocate()) {
            throw new Error(`Failed to allocate resource for ${packageName}`);
        }

        // Record start time
        this.packageStartTimes.set(packageName, new Date());

        // Create abort controller
        const controller = new AbortController();

        // Start execution
        const promise = this.executePackage(packageName, controller.signal);

        // Track running task
        const task: RunningTask = {
            packageName,
            startTime: new Date(),
            promise,
            controller
        };

        this.runningTasks.set(packageName, task);

        // Update state
        this.state.running.push({
            name: packageName,
            startTime: task.startTime.toISOString(),
            elapsedTime: 0
        });

        // Emit event
        this.emit('package:started', { packageName });

        this.logger.verbose(
            `Scheduled ${packageName} (${this.runningTasks.size}/${this.config.maxConcurrency} slots used)`
        );
    }

    /**
     * Execute a single package (placeholder - will be overridden or use callback)
     */
    private async executePackage(
        _packageName: string,
        _signal: AbortSignal
    ): Promise<PackageResult> {
        // This is a placeholder that will be replaced with actual execution logic
        // In the real implementation, this would call the tree.ts executePackage function
        throw new Error('executePackage must be implemented');
    }

    /**
     * Wait for next task to complete
     */
    private async waitForNext(): Promise<CompletedTask> {
        const runningTasks = Array.from(this.runningTasks.entries());

        const promises = runningTasks.map(([name, task]) =>
            task.promise
                .then(result => ({ packageName: name, result, error: null }))
                .catch(error => ({ packageName: name, result: null, error }))
        );

        return await Promise.race(promises);
    }

    /**
     * Handle task completion
     */
    private async handleTaskCompletion(task: CompletedTask): Promise<void> {
        const { packageName, result, error } = task;

        // Remove from running
        this.runningTasks.delete(packageName);
        this.state.running = this.state.running.filter(r => r.name !== packageName);
        this.resourceMonitor.release();

        // Record timing
        const endTime = new Date();
        this.packageEndTimes.set(packageName, endTime);

        const startTime = this.packageStartTimes.get(packageName)!;
        const duration = endTime.getTime() - startTime.getTime();
        this.packageDurations.set(packageName, duration);

        if (error) {
            await this.handleFailure(packageName, error);
        } else {
            await this.handleSuccess(packageName, result!);
        }
    }

    /**
     * Handle successful package completion
     */
    private async handleSuccess(packageName: string, result: PackageResult): Promise<void> {
        // Check if this was skipped due to no changes
        if (result.skippedNoChanges) {
            this.state.skippedNoChanges.push(packageName);
            const duration = this.packageDurations.get(packageName)!;
            this.logger.info(`PACKAGE_SKIPPED_NO_CHANGES: Package skipped due to no code changes | Package: ${packageName} | Duration: ${this.formatDuration(duration)} | Reason: no-changes`);
            this.emit('package:skipped-no-changes', { packageName, result });
        } else {
            this.state.completed.push(packageName);
            const duration = this.packageDurations.get(packageName)!;
            this.logger.info(`PACKAGE_EXECUTION_COMPLETE: Package execution finished successfully | Package: ${packageName} | Duration: ${this.formatDuration(duration)} | Status: success`);
            this.emit('package:completed', { packageName, result });

            // Track published version if applicable
            if (result.publishedVersion) {
                this.publishedVersions.push({
                    name: packageName,
                    version: result.publishedVersion,
                    time: new Date()
                });
            }
        }
    }

    /**
     * Handle package failure
     */
    private async handleFailure(packageName: string, error: Error): Promise<void> {
        const attemptNumber = (this.retryAttempts.get(packageName) || 0) + 1;
        this.retryAttempts.set(packageName, attemptNumber);

        const isRetriable = this.isRetriableError(error);
        const maxRetries = this.config.maxRetries || 3;
        const canRetry = isRetriable && attemptNumber < maxRetries;

        if (canRetry) {
            // Schedule retry
            this.logger.warn(
                `⟳ ${packageName} failed (attempt ${attemptNumber}/${maxRetries}), will retry`
            );

            this.state.pending.push(packageName);
            this.emit('package:retrying', { packageName, attemptNumber });

            // Apply backoff delay
            const delay = this.calculateRetryDelay(attemptNumber);
            await new Promise(resolve => setTimeout(resolve, delay));
        } else {
            // Permanent failure
            const dependencies = Array.from(this.graph.edges.get(packageName) || []);
            const dependents = Array.from(findAllDependents(packageName, this.graph));

            // Extract detailed error information
            const errorDetails = this.extractErrorDetails(error, packageName);

            const failureInfo: FailedPackageSnapshot = {
                name: packageName,
                error: error.message,
                stack: error.stack,
                isRetriable,
                attemptNumber,
                failedAt: new Date().toISOString(),
                dependencies,
                dependents,
                errorDetails
            };

            this.state.failed.push(failureInfo);

            this.logger.error(`PACKAGE_FAILED_PERMANENT: Package failed permanently | Package: ${packageName} | Error: ${error.message} | Status: failed | Retriable: false`);
            this.emit('package:failed', { packageName, error });

            // Cascade failure to dependents
            await this.cascadeFailure(packageName);
        }
    }

    /**
     * Cascade failure to dependent packages
     */
    private async cascadeFailure(failedPackage: string): Promise<void> {
        const toSkip = findAllDependents(failedPackage, this.graph);

        for (const dependent of toSkip) {
            // Remove from pending/ready
            this.state.pending = this.state.pending.filter(p => p !== dependent);
            this.state.ready = this.state.ready.filter(p => p !== dependent);

            // Add to skipped
            if (!this.state.skipped.includes(dependent)) {
                this.state.skipped.push(dependent);
                this.logger.warn(`PACKAGE_SKIPPED_DEPENDENCY: Package skipped due to failed dependency | Package: ${dependent} | Failed Dependency: ${failedPackage} | Reason: dependency-failed`);
                this.emit('package:skipped', {
                    packageName: dependent,
                    reason: `Depends on failed ${failedPackage}`
                });
            }
        }
    }

    /**
     * Update ready queue
     */
    private updateReadyQueue(): void {
        const nowReady: string[] = [];

        for (const packageName of this.state.pending) {
            if (this.dependencyChecker.isReady(packageName, this.state)) {
                nowReady.push(packageName);
            }
        }

        for (const packageName of nowReady) {
            this.state.pending = this.state.pending.filter(p => p !== packageName);
            this.state.ready.push(packageName);
        }
    }

    /**
     * Check if execution is complete
     */
    private isComplete(): boolean {
        return (
            this.state.pending.length === 0 &&
            this.state.ready.length === 0 &&
            this.runningTasks.size === 0
        );
    }

    /**
     * Determine if should save checkpoint
     */
    private shouldCheckpoint(): boolean {
        // Checkpoint after each completion for now
        // Could be optimized to checkpoint less frequently
        return true;
    }

    /**
     * Save checkpoint
     */
    private async saveCheckpoint(): Promise<void> {
        const checkpoint: ParallelExecutionCheckpoint = {
            version: '1.0.0',
            executionId: this.executionId,
            createdAt: this.startTime.toISOString(),
            lastUpdated: new Date().toISOString(),
            command: this.config.command,
            originalConfig: this.config.config,
            dependencyGraph: {
                packages: Array.from(this.graph.packages.values()).map(pkg => ({
                    name: pkg.name,
                    version: pkg.version,
                    path: pkg.path,
                    dependencies: Array.from(pkg.dependencies)
                })),
                edges: Array.from(this.graph.edges.entries()).map(([pkg, deps]) => [
                    pkg,
                    Array.from(deps)
                ])
            },
            buildOrder: [
                ...this.state.pending,
                ...this.state.ready,
                ...this.state.running.map(r => r.name),
                ...this.state.completed,
                ...this.state.failed.map(f => f.name),
                ...this.state.skipped
            ],
            executionMode: 'parallel',
            maxConcurrency: this.config.maxConcurrency,
            state: this.state,
            publishedVersions: this.publishedVersions.map(pv => ({
                packageName: pv.name,
                version: pv.version,
                publishTime: pv.time.toISOString()
            })),
            retryAttempts: Object.fromEntries(this.retryAttempts),
            lastRetryTime: {},
            packageStartTimes: Object.fromEntries(
                Array.from(this.packageStartTimes.entries()).map(([k, v]) => [k, v.toISOString()])
            ),
            packageEndTimes: Object.fromEntries(
                Array.from(this.packageEndTimes.entries()).map(([k, v]) => [k, v.toISOString()])
            ),
            packageDurations: Object.fromEntries(this.packageDurations),
            totalStartTime: this.startTime.toISOString(),
            recoveryHints: [],
            canRecover: true
        };

        await this.checkpointManager.save(checkpoint);
        this.emit('checkpoint:saved', { timestamp: new Date() });
    }

    /**
     * Load checkpoint
     */
    private async loadCheckpoint(): Promise<void> {
        const checkpoint = await this.checkpointManager.load();

        if (!checkpoint) {
            this.logger.warn('CHECKPOINT_NOT_FOUND: No checkpoint file found | Action: Starting fresh execution | Path: ' + this.config.checkpointPath);
            return;
        }

        this.logger.info('CHECKPOINT_LOADING: Loading execution checkpoint | Purpose: Resume previous execution | Path: ' + this.config.checkpointPath);
        this.logger.info(`CHECKPOINT_EXECUTION_ID: Checkpoint execution identifier | ID: ${checkpoint.executionId}`);
        this.logger.info(`CHECKPOINT_STATE_COMPLETED: Completed packages from checkpoint | Count: ${checkpoint.state.completed.length} packages`);
        this.logger.info(`CHECKPOINT_STATE_FAILED: Failed packages from checkpoint | Count: ${checkpoint.state.failed.length} packages`);

        // Restore state
        this.executionId = checkpoint.executionId;
        this.startTime = new Date(checkpoint.totalStartTime);
        this.state = checkpoint.state;

        // Restore timing data
        for (const [pkg, time] of Object.entries(checkpoint.packageStartTimes)) {
            this.packageStartTimes.set(pkg, new Date(time));
        }
        for (const [pkg, time] of Object.entries(checkpoint.packageEndTimes)) {
            this.packageEndTimes.set(pkg, new Date(time));
        }
        for (const [pkg, duration] of Object.entries(checkpoint.packageDurations)) {
            this.packageDurations.set(pkg, duration);
        }

        // Restore retry attempts
        for (const [pkg, attempts] of Object.entries(checkpoint.retryAttempts)) {
            this.retryAttempts.set(pkg, attempts);
        }

        // Clear running state (cannot resume mid-execution)
        for (const running of this.state.running) {
            this.state.pending.push(running.name);
        }
        this.state.running = [];

        // CRITICAL FIX: Re-evaluate skipped packages
        // After loading checkpoint (especially with --mark-completed), packages that were
        // skipped due to failed dependencies might now be eligible to run if those
        // dependencies are now completed. Move them back to pending for reassessment.
        const unblocked: string[] = [];
        for (const packageName of this.state.skipped) {
            // Check if all dependencies are now completed
            const dependencies = this.graph.edges.get(packageName) || new Set();
            const allDepsCompleted = Array.from(dependencies).every(dep =>
                this.state.completed.includes(dep) || this.state.skippedNoChanges.includes(dep)
            );

            // Check if any dependencies are still failed
            const anyDepsFailed = Array.from(dependencies).some(dep =>
                this.state.failed.some(f => f.name === dep)
            );

            if (allDepsCompleted && !anyDepsFailed) {
                unblocked.push(packageName);
            }
        }

        // Move unblocked packages back to pending
        if (unblocked.length > 0) {
            this.logger.info(`PACKAGES_UNBLOCKED: Dependencies satisfied, packages now ready | Count: ${unblocked.length} | Packages: ${unblocked.join(', ')} | Status: ready-to-execute`);
            for (const packageName of unblocked) {
                this.state.skipped = this.state.skipped.filter(p => p !== packageName);
                this.state.pending.push(packageName);
            }
        }
    }

    /**
     * Build execution result
     */
    private buildExecutionResult(): ExecutionResult {
        const totalDuration = Date.now() - this.startTime.getTime();
        const completedDurations = Array.from(this.packageDurations.values());
        const averageDuration = completedDurations.length > 0
            ? completedDurations.reduce((a, b) => a + b, 0) / completedDurations.length
            : 0;

        const metrics: ExecutionMetrics = {
            totalDuration,
            averagePackageDuration: averageDuration,
            peakConcurrency: this.resourceMonitor.getMetrics().peakConcurrency,
            averageConcurrency: this.resourceMonitor.getMetrics().averageConcurrency
        };

        return {
            success: this.state.failed.length === 0,
            totalPackages: this.graph.packages.size,
            completed: this.state.completed,
            failed: this.state.failed,
            skipped: this.state.skipped,
            skippedNoChanges: this.state.skippedNoChanges,
            metrics
        };
    }

    /**
     * Check if error is retriable
     */
    private isRetriableError(error: Error): boolean {
        const retriablePatterns = [
            /ETIMEDOUT/i,
            /ECONNRESET/i,
            /ENOTFOUND/i,
            /rate limit/i,
            /temporary failure/i,
            /try again/i,
            /gateway timeout/i,
            /service unavailable/i
        ];

        return retriablePatterns.some(pattern =>
            pattern.test(error.message || String(error))
        );
    }

    /**
     * Calculate retry delay with exponential backoff
     */
    private calculateRetryDelay(attemptNumber: number): number {
        const initialDelay = this.config.initialRetryDelay || 5000;
        const maxDelay = this.config.maxRetryDelay || 60000;
        const multiplier = this.config.backoffMultiplier || 2;

        const delay = Math.min(
            initialDelay * Math.pow(multiplier, attemptNumber - 1),
            maxDelay
        );

        // Add jitter
        const jitter = Math.random() * 0.1 * delay;

        return delay + jitter;
    }

    /**
     * Format duration in human-readable format
     */
    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);

        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Extract detailed error information from error message and stack
     */
    private extractErrorDetails(error: Error, packageName: string): { type?: string; context?: string; logFile?: string; suggestion?: string } | undefined {
        const errorMsg = error.message || '';
        const errorStack = error.stack || '';
        const fullText = `${errorMsg}\n${errorStack}`;

        // Test coverage failure
        if (fullText.match(/coverage.*below.*threshold|coverage.*insufficient/i)) {
            const coverageMatch = fullText.match(/(\w+):\s*(\d+\.?\d*)%.*threshold:\s*(\d+\.?\d*)%/i);
            return {
                type: 'test_coverage',
                context: coverageMatch
                    ? `${coverageMatch[1]}: ${coverageMatch[2]}% (threshold: ${coverageMatch[3]}%)`
                    : 'Coverage below threshold',
                logFile: this.getLogFilePath(packageName),
                suggestion: `cd ${this.getPackagePath(packageName)} && npm test -- --coverage`
            };
        }

        // Build/compile errors
        if (fullText.match(/compilation.*failed|build.*failed|tsc.*error/i)) {
            return {
                type: 'build_error',
                context: this.extractFirstErrorLine(fullText),
                logFile: this.getLogFilePath(packageName),
                suggestion: `cd ${this.getPackagePath(packageName)} && npm run build`
            };
        }

        // Merge conflicts
        if (fullText.match(/merge.*conflict|conflict.*marker|<<<<<<<|>>>>>>>/i)) {
            return {
                type: 'merge_conflict',
                context: 'Unresolved merge conflicts detected',
                logFile: this.getLogFilePath(packageName),
                suggestion: `cd ${this.getPackagePath(packageName)} && git status`
            };
        }

        // Test failures
        if (fullText.match(/test.*failed|tests.*failed|\d+\s+failing/i)) {
            const failMatch = fullText.match(/(\d+)\s+failing/i);
            return {
                type: 'test_failure',
                context: failMatch ? `${failMatch[1]} test(s) failing` : 'Tests failed',
                logFile: this.getLogFilePath(packageName),
                suggestion: `cd ${this.getPackagePath(packageName)} && npm test`
            };
        }

        // Timeout errors
        if (fullText.match(/timeout|timed.*out/i)) {
            return {
                type: 'timeout',
                context: this.extractFirstErrorLine(fullText),
                logFile: this.getLogFilePath(packageName),
                suggestion: 'Consider increasing timeout or checking for stuck processes'
            };
        }

        // Generic error with log file
        return {
            type: 'unknown',
            context: errorMsg.split('\n')[0].substring(0, 200),
            logFile: this.getLogFilePath(packageName)
        };
    }

    private extractFirstErrorLine(text: string): string {
        const lines = text.split('\n');
        for (const line of lines) {
            if (line.match(/error|failed|exception/i) && line.trim().length > 10) {
                return line.trim().substring(0, 200);
            }
        }
        return text.split('\n')[0].substring(0, 200);
    }

    private getPackagePath(packageName: string): string {
        const pkgInfo = this.graph.packages.get(packageName);
        return pkgInfo?.path || '.';
    }

    private getLogFilePath(packageName: string): string {
        const pkgPath = this.getPackagePath(packageName);
        const outputDir = this.config.config.outputDirectory || 'output/kodrdriv';
        // Try to find the most recent log file
        return `${pkgPath}/${outputDir}/publish_*.log`;
    }
}
