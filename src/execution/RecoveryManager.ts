import { getLogger } from '../logging';
import { DependencyGraph, findAllDependents } from '../util/dependencyGraph';
import { ParallelExecutionCheckpoint, FailedPackageSnapshot, RecoveryHint } from '../types/parallelExecution';
import { CheckpointManager } from '../util/checkpointManager';
import * as path from 'path';

export interface ValidationResult {
    valid: boolean;
    issues: string[];
    warnings: string[];
}

export interface RecoveryOptions {
    markCompleted?: string[];
    markFailed?: string[];
    skipPackages?: string[];
    retryFailed?: boolean;
    skipFailed?: boolean;
    resetPackage?: string;
    maxRetries?: number;
}

/**
 * RecoveryManager provides granular control over execution state recovery
 */
export class RecoveryManager {
    private checkpoint: ParallelExecutionCheckpoint;
    private graph: DependencyGraph;
    private checkpointManager: CheckpointManager;
    private logger = getLogger();

    constructor(
        checkpoint: ParallelExecutionCheckpoint,
        graph: DependencyGraph,
        checkpointManager: CheckpointManager
    ) {
        this.checkpoint = checkpoint;
        this.graph = graph;
        this.checkpointManager = checkpointManager;
    }

    /**
     * Resolve a package identifier (directory name or package name) to a package name
     */
    private resolvePackageName(identifier: string): string | null {
        // Try exact package name match first
        if (this.graph.packages.has(identifier)) {
            return identifier;
        }

        // Try directory name match
        for (const [pkgName, pkgInfo] of this.graph.packages) {
            const dirName = path.basename(pkgInfo.path);
            if (dirName === identifier) {
                return pkgName;
            }
        }

        return null;
    }

    /**
     * Mark packages as completed
     * Accepts either package names (e.g., "@eldrforge/git-tools") or directory names (e.g., "git-tools")
     */
    async markCompleted(packages: string[]): Promise<void> {
        this.logger.info(`RECOVERY_MARKING_COMPLETED: Marking packages as completed | Package Count: ${packages.length} | Action: Update checkpoint state | Purpose: Manual recovery`);

        for (const pkgIdentifier of packages) {
            // Resolve identifier to package name
            const pkg = this.resolvePackageName(pkgIdentifier);

            if (!pkg) {
                // List available packages for better error message
                const available = Array.from(this.graph.packages.entries())
                    .map(([name, info]) => `${path.basename(info.path)} (${name})`)
                    .join(', ');
                throw new Error(`Package not found: ${pkgIdentifier}. Available packages: ${available}`);
            }

            // Validate not already completed
            if (this.checkpoint.state.completed.includes(pkg)) {
                this.logger.warn(`RECOVERY_ALREADY_COMPLETED: Package already marked as completed | Package: ${pkg} | Action: Skipping | Status: already-completed`);
                continue;
            }

            // Remove from other states
            this.removeFromAllStates(pkg);

            // Add to completed
            this.checkpoint.state.completed.push(pkg);

            this.logger.info(`RECOVERY_PACKAGE_COMPLETED: Package marked as completed | Package: ${pkg} | Status: completed | Checkpoint: Updated`);
        }

        // Update ready queue and count what got unblocked
        const beforeSkipped = this.checkpoint.state.skipped.length;
        const beforeReady = this.checkpoint.state.ready.length;

        this.updateReadyState();

        const afterSkipped = this.checkpoint.state.skipped.length;
        const afterReady = this.checkpoint.state.ready.length;

        const unblockedCount = beforeSkipped - afterSkipped;
        const newReadyCount = afterReady - beforeReady;

        // Save checkpoint
        await this.saveCheckpoint();

        this.logger.info('State updated successfully');

        if (unblockedCount > 0) {
            this.logger.info(`✓ Unblocked ${unblockedCount} package(s)`);
        }
        if (newReadyCount > 0) {
            this.logger.info(`✓ ${newReadyCount} package(s) ready to execute`);
        }
        if (unblockedCount === 0 && newReadyCount === 0 && this.checkpoint.state.skipped.length > 0) {
            this.logger.warn(`⚠️  No packages unblocked. ${this.checkpoint.state.skipped.length} packages still blocked by dependencies.`);
            this.logger.warn('   Use --status to see what\'s blocking them.');
        }
    }

    /**
     * Mark packages as failed
     */
    async markFailed(packages: string[], reason: string = 'Manually marked as failed'): Promise<void> {
        this.logger.info(`RECOVERY_MARKING_FAILED: Marking packages as failed | Package Count: ${packages.length} | Action: Update checkpoint state | Purpose: Skip dependent packages`);

        for (const pkg of packages) {
            // Validate package exists
            if (!this.graph.packages.has(pkg)) {
                throw new Error(`Package not found: ${pkg}`);
            }

            // Remove from other states
            this.removeFromAllStates(pkg);

            // Add to failed
            const failureInfo: FailedPackageSnapshot = {
                name: pkg,
                error: reason,
                isRetriable: false,
                attemptNumber: 1,
                failedAt: new Date().toISOString(),
                dependencies: Array.from(this.graph.edges.get(pkg) || []),
                dependents: Array.from(findAllDependents(pkg, this.graph))
            };

            this.checkpoint.state.failed.push(failureInfo);

            this.logger.info(`RECOVERY_PACKAGE_FAILED: Package marked as failed | Package: ${pkg} | Status: failed | Checkpoint: Updated`);

            // Cascade to dependents
            const dependents = findAllDependents(pkg, this.graph);
            for (const dep of dependents) {
                this.removeFromAllStates(dep);
                this.checkpoint.state.skipped.push(dep);
                this.logger.warn(`RECOVERY_DEPENDENT_SKIPPED: Dependent package skipped | Package: ${dep} | Failed Dependency: ${pkg} | Reason: dependency-failed`);
            }
        }

        await this.saveCheckpoint();
    }

    /**
     * Skip packages and their dependents
     */
    async skipPackages(packages: string[]): Promise<void> {
        this.logger.info(`Skipping ${packages.length} package(s)...`);

        const toSkip = new Set<string>(packages);

        // Find all dependents
        for (const pkg of packages) {
            const dependents = findAllDependents(pkg, this.graph);
            for (const dep of dependents) {
                toSkip.add(dep);
            }
        }

        this.logger.info(`Total packages to skip (including dependents): ${toSkip.size}`);

        for (const pkg of toSkip) {
            this.removeFromAllStates(pkg);
            if (!this.checkpoint.state.skipped.includes(pkg)) {
                this.checkpoint.state.skipped.push(pkg);
            }
            this.logger.info(`RECOVERY_PACKAGE_SKIPPED: Package marked as skipped | Package: ${pkg} | Status: skipped | Checkpoint: Updated`);
        }

        await this.saveCheckpoint();
    }

    /**
     * Retry failed packages
     */
    async retryFailed(options?: { maxRetries?: number }): Promise<void> {
        const failed = this.checkpoint.state.failed;

        if (failed.length === 0) {
            this.logger.info('RECOVERY_NO_FAILED: No failed packages found | Action: Nothing to retry | Status: All packages succeeded or skipped');
            return;
        }

        this.logger.info(`RECOVERY_RETRY_STARTING: Initiating retry for failed packages | Failed Count: ${failed.length} | Action: Reset to pending and retry`);

        const retriable: FailedPackageSnapshot[] = [];
        const nonRetriable: FailedPackageSnapshot[] = [];

        for (const failedPkg of failed) {
            if (failedPkg.isRetriable || options?.maxRetries) {
                retriable.push(failedPkg);
            } else {
                nonRetriable.push(failedPkg);
            }
        }

        if (nonRetriable.length > 0) {
            this.logger.warn(`${nonRetriable.length} package(s) are not retriable: ${nonRetriable.map(p => p.name).join(', ')}`);
            if (!options?.maxRetries) {
                this.logger.warn('Use --max-retries to force retry of non-retriable packages');
            }
        }

        for (const failedPkg of retriable) {
            // Reset retry count if max retries overridden
            if (options?.maxRetries) {
                this.checkpoint.retryAttempts[failedPkg.name] = 0;
            }

            // Move back to pending
            this.removeFromAllStates(failedPkg.name);
            this.checkpoint.state.pending.push(failedPkg.name);

            // Un-skip dependents if they were skipped
            for (const dependent of failedPkg.dependents) {
                if (this.checkpoint.state.skipped.includes(dependent)) {
                    this.checkpoint.state.skipped = this.checkpoint.state.skipped.filter(p => p !== dependent);
                    this.checkpoint.state.pending.push(dependent);
                    this.logger.info(`RECOVERY_DEPENDENT_RESTORED: Dependent package moved back to pending | Package: ${dependent} | Previous Status: skipped | New Status: pending | Reason: Retry parent package`);
                }
            }

            this.logger.info(`RECOVERY_PACKAGE_PENDING: Package moved to pending for retry | Package: ${failedPkg.name} | Previous Status: failed | New Status: pending | Action: Will retry`);
        }

        // Keep only non-retriable failures in failed state
        this.checkpoint.state.failed = nonRetriable;

        // Update ready queue
        this.updateReadyState();

        await this.saveCheckpoint();

        this.logger.info(`RECOVERY_RETRY_READY: Packages reset and ready for retry | Package Count: ${retriable.length} | Status: pending | Next: Will execute`);
    }

    /**
     * Skip failed packages and continue with remaining
     */
    async skipFailed(): Promise<void> {
        const failed = this.checkpoint.state.failed.map(f => f.name);

        if (failed.length === 0) {
            this.logger.info('RECOVERY_NO_FAILED_TO_SKIP: No failed packages found | Action: Nothing to skip | Status: Clean state');
            return;
        }

        this.logger.info(`RECOVERY_SKIP_FAILED: Skipping failed packages and dependents | Failed Count: ${failed.length} | Action: Mark as skipped | Purpose: Continue with remaining packages`);

        await this.skipPackages(failed);

        // Clear failed state
        this.checkpoint.state.failed = [];

        this.logger.info('RECOVERY_SKIP_COMPLETE: Failed packages skipped successfully | Status: Execution can continue | Next: Process remaining packages');
    }

    /**
     * Reset specific package to initial state
     */
    async resetPackage(packageName: string): Promise<void> {
        this.logger.info(`RECOVERY_PACKAGE_RESETTING: Resetting package to initial state | Package: ${packageName} | Action: Clear all state | Purpose: Fresh start`);

        if (!this.graph.packages.has(packageName)) {
            throw new Error(`Package not found: ${packageName}`);
        }

        // Remove from all states
        this.removeFromAllStates(packageName);

        // Add back to pending
        this.checkpoint.state.pending.push(packageName);

        // Clear retry attempts
        delete this.checkpoint.retryAttempts[packageName];
        delete this.checkpoint.packageStartTimes[packageName];
        delete this.checkpoint.packageEndTimes[packageName];
        delete this.checkpoint.packageDurations[packageName];

        await this.saveCheckpoint();

        this.logger.info(`RECOVERY_PACKAGE_RESET: Package reset to initial state | Package: ${packageName} | Status: pending | Checkpoint: Updated`);
    }

    /**
     * Validate checkpoint state integrity
     */
    validateState(): ValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];

        // Check for duplicates across states
        const allPackages: string[] = [
            ...this.checkpoint.state.pending,
            ...this.checkpoint.state.ready,
            ...this.checkpoint.state.running.map(r => r.name),
            ...this.checkpoint.state.completed,
            ...this.checkpoint.state.failed.map(f => f.name),
            ...this.checkpoint.state.skipped,
            ...this.checkpoint.state.skippedNoChanges
        ];

        const duplicates = this.findDuplicates(allPackages);
        if (duplicates.length > 0) {
            issues.push(`Packages in multiple states: ${duplicates.join(', ')}`);
        }

        // Check for missing packages
        const missing = this.checkpoint.buildOrder.filter(
            pkg => !allPackages.includes(pkg)
        );
        if (missing.length > 0) {
            issues.push(`Missing packages: ${missing.join(', ')}`);
        }

        // Check dependency consistency
        for (const pkg of this.checkpoint.state.completed) {
            const deps = this.graph.edges.get(pkg) || new Set();
            for (const dep of deps) {
                if (!this.checkpoint.state.completed.includes(dep)) {
                    warnings.push(`${pkg} completed but dependency ${dep} not completed`);
                }
            }
        }

        // Check for stale running packages
        const now = Date.now();
        for (const running of this.checkpoint.state.running) {
            const elapsed = now - new Date(running.startTime).getTime();
            if (elapsed > 3600000) { // 1 hour
                warnings.push(`${running.name} has been running for ${this.formatDuration(elapsed)}`);
            }
        }

        return {
            valid: issues.length === 0,
            issues,
            warnings
        };
    }

    /**
     * Generate recovery hints based on current state
     */
    generateRecoveryHints(): RecoveryHint[] {
        const hints: RecoveryHint[] = [];

        // Check for retriable failures
        const retriableFailed = this.checkpoint.state.failed.filter(f => f.isRetriable);
        if (retriableFailed.length > 0) {
            hints.push({
                type: 'info',
                message: `${retriableFailed.length} package(s) failed with retriable errors`,
                actionable: true,
                suggestedCommand: 'kodrdriv tree [command] --continue --retry-failed'
            });
        }

        // Check for non-retriable failures
        const permanentFailed = this.checkpoint.state.failed.filter(f => !f.isRetriable);
        if (permanentFailed.length > 0) {
            hints.push({
                type: 'warning',
                message: `${permanentFailed.length} package(s) failed permanently`,
                actionable: true,
                suggestedCommand: 'kodrdriv tree [command] --continue --skip-failed'
            });

            for (const pkg of permanentFailed.slice(0, 3)) { // Limit to first 3
                hints.push({
                    type: 'error',
                    message: `${pkg.name}: ${pkg.error}`,
                    actionable: true,
                    suggestedCommand: `# Fix the issue, then:\nkodrdriv tree [command] --continue --mark-completed "${path.basename(this.graph.packages.get(pkg.name)?.path || pkg.name)}"`
                });
            }
        }

        // Check for long-running packages
        const now = Date.now();
        for (const running of this.checkpoint.state.running) {
            const elapsed = now - new Date(running.startTime).getTime();
            if (elapsed > 1800000) { // 30 minutes
                hints.push({
                    type: 'warning',
                    message: `${running.name} has been running for ${this.formatDuration(elapsed)} - may be stuck`,
                    actionable: false
                });
            }
        }

        // Check for state inconsistencies
        const validation = this.validateState();
        if (!validation.valid) {
            hints.push({
                type: 'error',
                message: 'State inconsistencies detected - checkpoint may be corrupted',
                actionable: true,
                suggestedCommand: 'kodrdriv tree --validate-state'
            });
        }

        return hints;
    }

    /**
     * Show detailed status
     */
    async showStatus(): Promise<string> {
        const lines: string[] = [];

        lines.push('═══════════════════════════════════════');
        lines.push('     Parallel Execution Status');
        lines.push('═══════════════════════════════════════');
        lines.push('');
        lines.push(`Execution ID: ${this.checkpoint.executionId}`);
        lines.push(`Started: ${new Date(this.checkpoint.totalStartTime).toLocaleString()}`);
        lines.push(`Last Updated: ${new Date(this.checkpoint.lastUpdated).toLocaleString()}`);
        lines.push('');

        // Progress summary
        const total = this.checkpoint.buildOrder.length;
        const completed = this.checkpoint.state.completed.length;
        const skippedNoChanges = this.checkpoint.state.skippedNoChanges.length;
        const failed = this.checkpoint.state.failed.length;
        const skipped = this.checkpoint.state.skipped.length;
        const running = this.checkpoint.state.running.length;
        const pending = this.checkpoint.state.pending.length + this.checkpoint.state.ready.length;

        lines.push('📊 Progress:');
        lines.push(`  Completed: ${completed}/${total} (${Math.round(completed/total*100)}%)`);
        lines.push(`  Skipped (no changes): ${skippedNoChanges}`);
        lines.push(`  Running:   ${running}`);
        lines.push(`  Pending:   ${pending}`);
        lines.push(`  Failed:    ${failed}`);
        lines.push(`  Skipped (dependency failed):   ${skipped}`);
        lines.push('');

        // Progress bar
        const progressBar = this.createProgressBar(completed, total);
        lines.push(`Progress: [${progressBar}] ${Math.round(completed/total*100)}%`);
        lines.push('');

        // Running packages
        if (running > 0) {
            lines.push('🔄 Currently Running:');
            for (const pkg of this.checkpoint.state.running) {
                const elapsed = Date.now() - new Date(pkg.startTime).getTime();
                lines.push(`  • ${pkg.name} (${this.formatDuration(elapsed)})`);
            }
            lines.push('');
        }

        // Failed packages
        if (failed > 0) {
            lines.push('❌ Failed Packages:');
            for (const pkg of this.checkpoint.state.failed) {
                lines.push(`  ✗ ${pkg.name}`);
                lines.push(`    Error: ${pkg.error}`);
                lines.push(`    Retriable: ${pkg.isRetriable ? 'Yes' : 'No'}`);
                lines.push(`    Attempts: ${pkg.attemptNumber}`);
                if (pkg.dependents.length > 0) {
                    lines.push(`    Blocked: ${pkg.dependents.length} dependent(s)`);
                }
            }
            lines.push('');
        }

        // Skipped packages with dependency details
        if (skipped > 0) {
            lines.push('🔒 Blocked Packages (dependency issues):');
            for (const pkgName of this.checkpoint.state.skipped) {
                const deps = this.graph.edges.get(pkgName) || new Set();
                const depStatus = Array.from(deps).map(dep => {
                    if (this.checkpoint.state.completed.includes(dep) ||
                        this.checkpoint.state.skippedNoChanges.includes(dep)) {
                        return `${dep} ✓`;
                    } else if (this.checkpoint.state.failed.some(f => f.name === dep)) {
                        return `${dep} ❌`;
                    } else if (this.checkpoint.state.running.some(r => r.name === dep)) {
                        return `${dep} ⏳`;
                    } else if (this.checkpoint.state.skipped.includes(dep)) {
                        return `${dep} 🔒`;
                    } else if (this.checkpoint.state.pending.includes(dep) ||
                               this.checkpoint.state.ready.includes(dep)) {
                        return `${dep} ⏳`;
                    } else {
                        return `${dep} ❓`;
                    }
                });

                lines.push(`  • ${pkgName}`);
                if (depStatus.length > 0) {
                    lines.push(`    Dependencies: ${depStatus.join(', ')}`);
                }
            }
            lines.push('');
            lines.push('Legend: ✓ = complete, ❌ = failed, ⏳ = pending/running, 🔒 = blocked');
            lines.push('');
        }

        // Ready to execute
        if (this.checkpoint.state.ready.length > 0) {
            lines.push('⏳ Ready to Execute:');
            for (const pkgName of this.checkpoint.state.ready) {
                const deps = this.graph.edges.get(pkgName) || new Set();
                if (deps.size === 0) {
                    lines.push(`  • ${pkgName} (no dependencies)`);
                } else {
                    const depList = Array.from(deps).join(', ');
                    lines.push(`  • ${pkgName} (depends on: ${depList})`);
                }
            }
            lines.push('');
        }

        // Recovery hints
        const hints = this.generateRecoveryHints();
        if (hints.length > 0) {
            lines.push('💡 Recovery Suggestions:');
            for (const hint of hints) {
                const icon = hint.type === 'error' ? '❌' : hint.type === 'warning' ? '⚠️' : 'ℹ️';
                lines.push(`  ${icon} ${hint.message}`);
                if (hint.suggestedCommand) {
                    lines.push(`     ${hint.suggestedCommand}`);
                }
            }
            lines.push('');
        }

        // State validation
        const validation = this.validateState();
        if (!validation.valid) {
            lines.push('⚠️  State Issues Detected:');
            for (const issue of validation.issues) {
                lines.push(`  • ${issue}`);
            }
            lines.push('');
        }

        if (validation.warnings.length > 0) {
            lines.push('⚠️  Warnings:');
            for (const warning of validation.warnings) {
                lines.push(`  • ${warning}`);
            }
            lines.push('');
        }

        return lines.join('\n');
    }

    /**
     * Apply multiple recovery options at once
     */
    async applyRecoveryOptions(options: RecoveryOptions): Promise<void> {
        this.logger.info('RECOVERY_OPTIONS_APPLYING: Applying recovery options to checkpoint | Purpose: Modify execution state | Options: Complete, fail, skip, retry, reset');

        if (options.markCompleted && options.markCompleted.length > 0) {
            await this.markCompleted(options.markCompleted);
        }

        if (options.markFailed && options.markFailed.length > 0) {
            await this.markFailed(options.markFailed);
        }

        if (options.skipPackages && options.skipPackages.length > 0) {
            await this.skipPackages(options.skipPackages);
        }

        if (options.retryFailed) {
            await this.retryFailed({ maxRetries: options.maxRetries });
        }

        if (options.skipFailed) {
            await this.skipFailed();
        }

        if (options.resetPackage) {
            await this.resetPackage(options.resetPackage);
        }

        this.logger.info('RECOVERY_OPTIONS_APPLIED: Recovery options applied successfully | Status: Checkpoint updated | Next: Resume execution or exit');
    }

    /**
     * Get checkpoint for external access
     */
    getCheckpoint(): ParallelExecutionCheckpoint {
        return this.checkpoint;
    }

    // Private helper methods

    private removeFromAllStates(packageName: string): void {
        this.checkpoint.state.pending = this.checkpoint.state.pending.filter(p => p !== packageName);
        this.checkpoint.state.ready = this.checkpoint.state.ready.filter(p => p !== packageName);
        this.checkpoint.state.running = this.checkpoint.state.running.filter(r => r.name !== packageName);
        this.checkpoint.state.completed = this.checkpoint.state.completed.filter(p => p !== packageName);
        this.checkpoint.state.failed = this.checkpoint.state.failed.filter(f => f.name !== packageName);
        this.checkpoint.state.skipped = this.checkpoint.state.skipped.filter(p => p !== packageName);
        this.checkpoint.state.skippedNoChanges = this.checkpoint.state.skippedNoChanges.filter(p => p !== packageName);
    }

    private updateReadyState(): void {
        // CRITICAL FIX: First, re-evaluate skipped packages
        // Packages that were skipped due to failed dependencies might now be eligible
        // to run if those dependencies have been completed (e.g., via --mark-completed)
        const unblocked: string[] = [];
        for (const pkg of this.checkpoint.state.skipped) {
            const deps = this.graph.edges.get(pkg) || new Set();
            const allDepsCompleted = Array.from(deps).every(dep =>
                this.checkpoint.state.completed.includes(dep) ||
                this.checkpoint.state.skippedNoChanges.includes(dep)
            );

            // Check if any dependencies are still failed
            const anyDepsFailed = Array.from(deps).some(dep =>
                this.checkpoint.state.failed.some(f => f.name === dep)
            );

            if (allDepsCompleted && !anyDepsFailed) {
                unblocked.push(pkg);
            }
        }

        // Move unblocked packages back to pending
        for (const pkg of unblocked) {
            this.checkpoint.state.skipped = this.checkpoint.state.skipped.filter(p => p !== pkg);
            this.checkpoint.state.pending.push(pkg);
            this.logger.info(`RECOVERY_PACKAGE_UNBLOCKED: Package unblocked due to satisfied dependencies | Package: ${pkg} | Previous Status: skipped | New Status: pending | Reason: Dependencies satisfied`);
        }

        // Move packages from pending to ready if dependencies met
        const nowReady: string[] = [];

        for (const pkg of this.checkpoint.state.pending) {
            const deps = this.graph.edges.get(pkg) || new Set();
            const allDepsCompleted = Array.from(deps).every(dep =>
                this.checkpoint.state.completed.includes(dep) ||
                this.checkpoint.state.skippedNoChanges.includes(dep)
            );

            if (allDepsCompleted) {
                nowReady.push(pkg);
            }
        }

        for (const pkg of nowReady) {
            this.checkpoint.state.pending = this.checkpoint.state.pending.filter(p => p !== pkg);
            this.checkpoint.state.ready.push(pkg);
        }
    }

    private findDuplicates(arr: string[]): string[] {
        const seen = new Set<string>();
        const duplicates = new Set<string>();

        for (const item of arr) {
            if (seen.has(item)) {
                duplicates.add(item);
            }
            seen.add(item);
        }

        return Array.from(duplicates);
    }

    private async saveCheckpoint(): Promise<void> {
        this.checkpoint.lastUpdated = new Date().toISOString();
        await this.checkpointManager.save(this.checkpoint);
    }

    private formatDuration(ms: number): string {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    private createProgressBar(current: number, total: number, width: number = 30): string {
        const percent = current / total;
        const filled = Math.round(width * percent);
        const empty = width - filled;

        return '█'.repeat(filled) + '░'.repeat(empty);
    }
}

/**
 * Load checkpoint and create recovery manager
 */
export async function loadRecoveryManager(
    graph: DependencyGraph,
    outputDirectory?: string
): Promise<RecoveryManager | null> {
    const checkpointManager = new CheckpointManager(outputDirectory);
    const checkpoint = await checkpointManager.load();

    if (!checkpoint) {
        return null;
    }

    return new RecoveryManager(checkpoint, graph, checkpointManager);
}
