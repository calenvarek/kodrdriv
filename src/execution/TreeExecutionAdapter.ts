import { DynamicTaskPool, PoolConfig } from './DynamicTaskPool';
import { PackageInfo } from '../util/dependencyGraph';
import { Config } from '../types';
import { PackageResult } from '../types/parallelExecution';
import { getLogger } from '../logging';

/**
 * ExecutePackageFunction type matches the signature of tree.ts executePackage
 */
export type ExecutePackageFunction = (
    packageName: string,
    packageInfo: PackageInfo,
    commandToRun: string,
    runConfig: Config,
    isDryRun: boolean,
    index: number,
    total: number,
    allPackageNames: Set<string>,
    isBuiltInCommand?: boolean
) => Promise<{ success: boolean; error?: any; isTimeoutError?: boolean }>;

/**
 * TreeExecutionAdapter bridges DynamicTaskPool with tree.ts executePackage
 */
export class TreeExecutionAdapter {
    private pool: DynamicTaskPool;
    private executePackageFn: ExecutePackageFunction;
    private config: PoolConfig;
    private startedCount: number = 0;
    private completedCount: number = 0;

    constructor(config: PoolConfig, executePackageFn: ExecutePackageFunction) {
        this.config = config;
        this.executePackageFn = executePackageFn;

        // Create custom pool that uses our execute function
        this.pool = new DynamicTaskPool(config);

        // Track completion count for progress display
        this.pool.on('package:completed', () => {
            this.completedCount++;
        });

        // Override the executePackage method to use tree.ts function
        (this.pool as any).executePackage = this.createExecutePackageWrapper();
    }

    /**
     * Create wrapper that adapts tree.ts executePackage to DynamicTaskPool format
     */
    private createExecutePackageWrapper() {
        return async (packageName: string, _signal: AbortSignal): Promise<PackageResult> => {
            const packageInfo = this.config.graph.packages.get(packageName);
            if (!packageInfo) {
                throw new Error(`Package not found: ${packageName}`);
            }

            const allPackageNames = new Set(this.config.graph.packages.keys());
            const isDryRun = this.config.config.dryRun || false;
            const isBuiltInCommand = !this.config.command.startsWith('npm') &&
                                     !this.config.command.includes('&&');

            // Increment started count and use it as index for progress display
            const currentIndex = this.startedCount++;

            // Call tree.ts executePackage
            const startTime = Date.now();
            const result = await this.executePackageFn(
                packageName,
                packageInfo,
                this.config.command,
                this.config.config,
                isDryRun,
                currentIndex, // Use incremented started count for proper [N/Total] display
                this.config.graph.packages.size,
                allPackageNames,
                isBuiltInCommand
            );

            const duration = Date.now() - startTime;

            if (!result.success) {
                throw result.error || new Error('Package execution failed');
            }

            // Check if this was a "no changes" skip (result will have skippedNoChanges flag)
            const skippedNoChanges = (result as any).skippedNoChanges || false;

            return {
                success: true,
                duration,
                // Extract published version if available (from output or state)
                publishedVersion: undefined,
                stdout: undefined,
                stderr: undefined,
                skippedNoChanges
            };
        };
    }

    /**
     * Execute parallel execution
     */
    async execute() {
        return await this.pool.execute();
    }

    /**
     * Get the underlying task pool for event listeners
     */
    getPool(): DynamicTaskPool {
        return this.pool;
    }
}

/**
 * Create progress logger that listens to pool events
 */
export function createParallelProgressLogger(pool: DynamicTaskPool, config: Config): void {
    const logger = getLogger();
    const startTime = Date.now();
    let completedCount = 0;
    let totalPackages = 0;

    pool.on('execution:started', ({ totalPackages: total }) => {
        totalPackages = total;
        logger.info(`\n📦 Executing ${total} packages in parallel\n`);
    });

    pool.on('package:started', ({ packageName }) => {
        if (config.verbose || config.debug) {
            logger.info(`▶️  Started: ${packageName}`);
        }
    });

    pool.on('package:completed', ({ packageName, result }) => {
        completedCount++;
        const percent = Math.round((completedCount / totalPackages) * 100);
        const elapsed = Math.round((Date.now() - startTime) / 1000);

        if (config.debug) {
            logger.info(`✅ Completed: ${packageName} (${result.duration}ms) [${completedCount}/${totalPackages} - ${percent}% - ${elapsed}s elapsed]`);
        } else if (config.verbose) {
            logger.info(`✅ Completed: ${packageName} [${completedCount}/${totalPackages}]`);
        } else {
            // Minimal output
            logger.info(`[${completedCount}/${totalPackages}] ✅ ${packageName}`);
        }
    });

    pool.on('package:failed', ({ packageName, error }) => {
        logger.error(`❌ Failed: ${packageName} - ${error.message}`);
    });

    pool.on('package:retrying', ({ packageName, attemptNumber }) => {
        logger.warn(`🔄 Retrying: ${packageName} (attempt ${attemptNumber})`);
    });

    pool.on('package:skipped', ({ packageName, reason }) => {
        logger.warn(`⊘ Skipped: ${packageName} (${reason})`);
    });

    pool.on('package:skipped-no-changes', ({ packageName }) => {
        if (config.verbose || config.debug) {
            logger.info(`⊘ Skipped: ${packageName} (no code changes)`);
        }
    });

    pool.on('checkpoint:saved', () => {
        if (config.debug) {
            logger.debug('💾 Checkpoint saved');
        }
    });

    pool.on('execution:completed', ({ result }) => {
        const totalTime = Math.round((Date.now() - startTime) / 1000);
        logger.info(`\n✨ Parallel execution completed in ${totalTime}s`);

        if (config.verbose || config.debug) {
            logger.info(`\nMetrics:`);
            logger.info(`  Total packages: ${result.totalPackages}`);
            logger.info(`  Completed: ${result.completed.length}`);
            logger.info(`  Skipped (no changes): ${result.skippedNoChanges.length}`);
            logger.info(`  Skipped (dependency failed): ${result.skipped.length}`);
            logger.info(`  Failed: ${result.failed.length}`);
            logger.info(`  Peak concurrency: ${result.metrics.peakConcurrency}`);
            logger.info(`  Average concurrency: ${result.metrics.averageConcurrency.toFixed(1)}`);
        }
    });
}

import { ProgressFormatter } from '../ui/ProgressFormatter';

/**
 * Format parallel execution result for display
 */
export function formatParallelResult(result: any): string {
    const lines: string[] = [];

    // Separator line
    lines.push('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    lines.push('📊 Publish Summary');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Detailed status breakdown by category
    if (result.completed.length > 0) {
        lines.push(`✅ Published (${result.completed.length}):`);
        for (const pkg of result.completed) {
            lines.push(`   - ${pkg}`);
        }
        lines.push('');
    }

    if (result.skippedNoChanges.length > 0) {
        lines.push(`⏭️  Skipped (${result.skippedNoChanges.length}) - no code changes:`);
        for (const pkg of result.skippedNoChanges) {
            lines.push(`   - ${pkg}`);
        }
        lines.push('');
    }

    if (result.failed.length > 0) {
        lines.push(`❌ Failed (${result.failed.length}):`);
        for (const pkg of result.failed) {
            lines.push(`   - ${pkg}`);
        }
        lines.push('');
    }

    if (result.skipped.length > 0) {
        lines.push(`⊘ Skipped due to dependencies (${result.skipped.length}):`);
        for (const pkg of result.skipped) {
            lines.push(`   - ${pkg}`);
        }
        lines.push('');
    }

    // Summary line
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Calculate success rate
    const totalProcessed = result.completed.length + result.failed.length + result.skippedNoChanges.length;
    const successRate = totalProcessed > 0 ? Math.round((result.completed.length / totalProcessed) * 100) : 0;

    // Format elapsed time
    const totalTimeMs = result.metrics?.totalTime || 0;
    const minutes = Math.floor(totalTimeMs / 60000);
    const seconds = Math.floor((totalTimeMs % 60000) / 1000);
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    lines.push(`Total time: ${timeStr}`);
    lines.push(`Success rate: ${successRate}% (${result.completed.length}/${totalProcessed} packages processed)`);

    if (result.metrics?.peakConcurrency) {
        lines.push(`Peak concurrency: ${result.metrics.peakConcurrency} packages`);
    }

    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Failed packages with formatted error summary
    if (result.failed.length > 0) {
        lines.push('');
        const errorLines = ProgressFormatter.createErrorSummary(result.failed);
        lines.push(...errorLines);

        // Next steps for failures
        lines.push('\n📋 Next steps:');
        lines.push('1. Review the errors above for each failed package');
        lines.push('2. Fix the issues in the failed packages');
        lines.push('3. Retry the publish command');

        if (result.skipped.length > 0) {
            lines.push('\nNote: Once failed packages are fixed, their dependent packages will also be published.');
        }

        // Recovery guidance
        const hasRetriable = result.failed.some((f: any) => f.isRetriable);
        const hasPermanent = result.failed.some((f: any) => !f.isRetriable);
        const recoveryLines = ProgressFormatter.createRecoveryGuidance(hasRetriable, hasPermanent);
        lines.push(...recoveryLines);
    }

    return lines.join('\n');
}
