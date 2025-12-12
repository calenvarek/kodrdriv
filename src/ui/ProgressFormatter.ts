import { ExecutionResult, ExecutionMetrics } from '../types/parallelExecution';

/**
 * ProgressFormatter creates beautiful formatted output for parallel execution
 */
export class ProgressFormatter {
    /**
     * Create a visual progress bar
     */
    static createProgressBar(current: number, total: number, width: number = 30): string {
        const percent = total > 0 ? current / total : 0;
        const filled = Math.round(width * percent);
        const empty = width - filled;

        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    /**
     * Format duration in human-readable format
     */
    static formatDuration(ms: number): string {
        if (ms < 1000) {
            return `${ms}ms`;
        }

        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        }
        if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        }
        return `${seconds}s`;
    }

    /**
     * Format bytes in human-readable format
     */
    static formatBytes(bytes: number): string {
        const units = ['B', 'KB', 'MB', 'GB'];
        let value = bytes;
        let unitIndex = 0;

        while (value >= 1024 && unitIndex < units.length - 1) {
            value /= 1024;
            unitIndex++;
        }

        return `${value.toFixed(2)} ${units[unitIndex]}`;
    }

    /**
     * Format percentage
     */
    static formatPercent(value: number, decimals: number = 1): string {
        return `${value.toFixed(decimals)}%`;
    }

    /**
     * Create execution summary table
     */
    static createSummaryTable(result: ExecutionResult): string[] {
        const lines: string[] = [];

        lines.push('');
        lines.push('═══════════════════════════════════════════════');
        lines.push('           Parallel Execution Summary');
        lines.push('═══════════════════════════════════════════════');
        lines.push('');

        // Status
        const status = result.success ? '✅ SUCCESS' : '⚠️  PARTIAL SUCCESS';
        lines.push(`Status: ${status}`);
        lines.push('');

        // Package summary
        lines.push('📦 Package Summary:');
        lines.push(`  Completed:  ${result.completed.length}/${result.totalPackages}`);
        if (result.failed.length > 0) {
            lines.push(`  Failed:     ${result.failed.length}`);
        }
        if (result.skipped.length > 0) {
            lines.push(`  Skipped:    ${result.skipped.length}`);
        }
        lines.push('');

        // Performance metrics
        lines.push(...this.createMetricsTable(result.metrics));

        // Failed packages details
        if (result.failed.length > 0) {
            lines.push('');
            lines.push('❌ Failed Packages:');
            for (const failure of result.failed) {
                lines.push(`  • ${failure.name}`);
                lines.push(`    Error: ${failure.error}`);
                if (failure.dependents.length > 0) {
                    lines.push(`    Blocked: ${failure.dependents.length} dependent(s)`);
                }
            }
        }

        lines.push('');
        lines.push('═══════════════════════════════════════════════');
        lines.push('');

        return lines;
    }

    /**
     * Create metrics table
     */
    static createMetricsTable(metrics: ExecutionMetrics): string[] {
        const lines: string[] = [];

        lines.push('⚡ Performance Metrics:');
        lines.push(`  Total Time:          ${this.formatDuration(metrics.totalDuration)}`);
        lines.push(`  Avg Per Package:     ${this.formatDuration(metrics.averagePackageDuration)}`);
        lines.push(`  Peak Concurrency:    ${metrics.peakConcurrency}`);
        lines.push(`  Average Concurrency: ${metrics.averageConcurrency.toFixed(1)}`);

        if (metrics.speedupVsSequential) {
            lines.push(`  Speedup:             ${metrics.speedupVsSequential.toFixed(2)}x 🚀`);
        }

        return lines;
    }

    /**
     * Create compact progress indicator
     */
    static createCompactProgress(completed: number, total: number, running: number): string {
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const bar = this.createProgressBar(completed, total, 20);

        return `[${bar}] ${percent}% (${completed}/${total}) ${running > 0 ? `| Running: ${running}` : ''}`;
    }

    /**
     * Create execution timeline visualization
     */
    static createTimeline(
        packageTimes: Map<string, { start: number; end: number }>,
        maxConcurrency: number
    ): string[] {
        const lines: string[] = [];

        lines.push('');
        lines.push('📊 Execution Timeline:');
        lines.push('');

        // Find time bounds
        let minTime = Infinity;
        let maxTime = 0;

        for (const [, times] of packageTimes) {
            minTime = Math.min(minTime, times.start);
            maxTime = Math.max(maxTime, times.end);
        }

        const totalDuration = maxTime - minTime;
        const timelineWidth = 50;

        // Sort by start time
        const sortedPackages = Array.from(packageTimes.entries())
            .sort(([, a], [, b]) => a.start - b.start);

        for (const [pkg, times] of sortedPackages) {
            const start = times.start - minTime;
            const duration = times.end - times.start;

            const startPos = Math.floor((start / totalDuration) * timelineWidth);
            const barLength = Math.max(1, Math.floor((duration / totalDuration) * timelineWidth));

            const timeline = ' '.repeat(startPos) + '█'.repeat(barLength);
            const durationStr = this.formatDuration(duration);

            lines.push(`  ${pkg.padEnd(20)} │${timeline.padEnd(timelineWidth)}│ ${durationStr}`);
        }

        lines.push('');
        lines.push(`  Total: ${this.formatDuration(totalDuration)} with max concurrency ${maxConcurrency}`);
        lines.push('');

        return lines;
    }

    /**
     * Create box around text
     */
    static createBox(title: string, content: string[], width: number = 60): string[] {
        const lines: string[] = [];

        const topBorder = '╔' + '═'.repeat(width - 2) + '╗';
        const bottomBorder = '╚' + '═'.repeat(width - 2) + '╝';
        const titleLine = '║ ' + title.padEnd(width - 4) + ' ║';

        lines.push(topBorder);
        lines.push(titleLine);
        lines.push('╠' + '═'.repeat(width - 2) + '╣');

        for (const line of content) {
            const paddedLine = '║ ' + line.padEnd(width - 4) + ' ║';
            lines.push(paddedLine);
        }

        lines.push(bottomBorder);

        return lines;
    }

    /**
     * Format speedup comparison
     */
    static createSpeedupComparison(
        parallelTime: number,
        sequentialTime: number,
        concurrency: number
    ): string[] {
        const lines: string[] = [];

        const speedup = sequentialTime / parallelTime;
        const efficiency = (speedup / concurrency) * 100;
        const timeSaved = sequentialTime - parallelTime;

        lines.push('');
        lines.push('📈 Speedup Analysis:');
        lines.push(`  Sequential Time:     ${this.formatDuration(sequentialTime)}`);
        lines.push(`  Parallel Time:       ${this.formatDuration(parallelTime)}`);
        lines.push(`  Speedup:             ${speedup.toFixed(2)}x 🚀`);
        lines.push(`  Efficiency:          ${this.formatPercent(efficiency)}`);
        lines.push(`  Time Saved:          ${this.formatDuration(timeSaved)} ⏰`);
        lines.push('');

        return lines;
    }

    /**
     * Create error summary
     */
    static createErrorSummary(failures: Array<{ name: string; error: string; dependents: string[] }>): string[] {
        const lines: string[] = [];

        if (failures.length === 0) {
            return lines;
        }

        lines.push('');
        lines.push('❌ Failure Summary:');
        lines.push('');

        for (const failure of failures) {
            lines.push(`  ${failure.name}:`);
            lines.push(`    Error: ${failure.error}`);

            if (failure.dependents.length > 0) {
                const dependentStr = failure.dependents.slice(0, 3).join(', ');
                const more = failure.dependents.length > 3 ? ` +${failure.dependents.length - 3} more` : '';
                lines.push(`    Blocked: ${dependentStr}${more}`);
            }
        }

        lines.push('');

        return lines;
    }

    /**
     * Create recovery guidance
     */
    static createRecoveryGuidance(hasRetriable: boolean, hasPermanent: boolean): string[] {
        const lines: string[] = [];

        lines.push('');
        lines.push('🔧 Recovery Options:');
        lines.push('');

        if (hasRetriable) {
            lines.push('  1. Retry failed packages:');
            lines.push('     kodrdriv tree [command] --continue --retry-failed');
            lines.push('');
        }

        if (hasPermanent) {
            lines.push('  2. Skip failed packages:');
            lines.push('     kodrdriv tree [command] --continue --skip-failed');
            lines.push('');
        }

        lines.push('  3. Mark specific package as completed:');
        lines.push('     kodrdriv tree [command] --continue --mark-completed "package-name"');
        lines.push('');

        lines.push('  4. Check detailed status:');
        lines.push('     kodrdriv tree --status-parallel');
        lines.push('');

        return lines;
    }
}
