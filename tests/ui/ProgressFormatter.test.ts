import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressFormatter } from '../../src/ui/ProgressFormatter';
import { ExecutionResult, ExecutionMetrics } from '../../src/types/parallelExecution';

describe('ProgressFormatter', () => {
    describe('createProgressBar', () => {
        it('should create a progress bar with correct length', () => {
            const bar = ProgressFormatter.createProgressBar(5, 10, 10);
            expect(bar.length).toBe(10);
        });

        it('should show 50% progress', () => {
            const bar = ProgressFormatter.createProgressBar(5, 10, 10);
            const filledCount = bar.split('█').length - 1;
            expect(filledCount).toBe(5);
        });

        it('should show 100% progress', () => {
            const bar = ProgressFormatter.createProgressBar(10, 10, 10);
            expect(bar).toBe('██████████');
        });

        it('should show 0% progress', () => {
            const bar = ProgressFormatter.createProgressBar(0, 10, 10);
            expect(bar).toBe('░░░░░░░░░░');
        });

        it('should handle zero total', () => {
            const bar = ProgressFormatter.createProgressBar(0, 0, 10);
            expect(bar).toBe('░░░░░░░░░░');
        });

        it('should use default width of 30', () => {
            const bar = ProgressFormatter.createProgressBar(50, 100);
            expect(bar.length).toBe(30);
        });
    });

    describe('formatDuration', () => {
        it('should format milliseconds', () => {
            expect(ProgressFormatter.formatDuration(500)).toBe('500ms');
        });

        it('should format seconds', () => {
            expect(ProgressFormatter.formatDuration(5000)).toBe('5s');
        });

        it('should format minutes and seconds', () => {
            expect(ProgressFormatter.formatDuration(125000)).toBe('2m 5s');
        });

        it('should format hours, minutes and seconds', () => {
            expect(ProgressFormatter.formatDuration(3661000)).toBe('1h 1m 1s');
        });

        it('should handle zero', () => {
            expect(ProgressFormatter.formatDuration(0)).toBe('0ms');
        });

        it('should handle less than 1 second', () => {
            expect(ProgressFormatter.formatDuration(999)).toBe('999ms');
        });
    });

    describe('formatBytes', () => {
        it('should format bytes', () => {
            expect(ProgressFormatter.formatBytes(512)).toContain('B');
        });

        it('should format kilobytes', () => {
            expect(ProgressFormatter.formatBytes(1024)).toContain('KB');
        });

        it('should format megabytes', () => {
            expect(ProgressFormatter.formatBytes(1024 * 1024)).toContain('MB');
        });

        it('should format gigabytes', () => {
            expect(ProgressFormatter.formatBytes(1024 * 1024 * 1024)).toContain('GB');
        });

        it('should handle zero bytes', () => {
            expect(ProgressFormatter.formatBytes(0)).toContain('B');
        });

        it('should cap at gigabytes', () => {
            const formatted = ProgressFormatter.formatBytes(1024 * 1024 * 1024 * 1024);
            expect(formatted).toContain('GB');
        });
    });

    describe('formatPercent', () => {
        it('should format percentage with default decimals', () => {
            expect(ProgressFormatter.formatPercent(75.5)).toBe('75.5%');
        });

        it('should format percentage with custom decimals', () => {
            expect(ProgressFormatter.formatPercent(75.555, 2)).toBe('75.56%');
        });

        it('should format percentage with zero decimals', () => {
            expect(ProgressFormatter.formatPercent(75.5, 0)).toBe('76%');
        });

        it('should handle 0%', () => {
            expect(ProgressFormatter.formatPercent(0)).toBe('0.0%');
        });

        it('should handle 100%', () => {
            expect(ProgressFormatter.formatPercent(100)).toBe('100.0%');
        });
    });

    describe('createSummaryTable', () => {
        it('should create summary lines for successful execution', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 5000,
                averagePackageDuration: 1250,
                peakConcurrency: 4,
                averageConcurrency: 2.5
            };

            const result: ExecutionResult = {
                success: true,
                totalPackages: 5,
                completed: ['pkg1', 'pkg2', 'pkg3'],
                failed: [],
                skipped: [],
                skippedNoChanges: ['pkg4', 'pkg5'],
                metrics
            };

            const lines = ProgressFormatter.createSummaryTable(result);

            expect(lines).toContainEqual(expect.stringContaining('Parallel Execution Summary'));
            expect(lines).toContainEqual(expect.stringContaining('SUCCESS'));
            expect(lines.join('\n')).toContain('Package Summary');
        });

        it('should show partial success for failed packages', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 5000,
                averagePackageDuration: 1250,
                peakConcurrency: 4,
                averageConcurrency: 2.5
            };

            const result: ExecutionResult = {
                success: false,
                totalPackages: 5,
                completed: ['pkg1', 'pkg2'],
                failed: [
                    {
                        name: 'pkg3',
                        error: 'Build failed',
                        isRetriable: true,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: []
                    }
                ],
                skipped: ['pkg4'],
                skippedNoChanges: ['pkg5'],
                metrics
            };

            const lines = ProgressFormatter.createSummaryTable(result);

            expect(lines.join('\n')).toContain('PARTIAL SUCCESS');
        });

        it('should include failed packages section', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 5000,
                averagePackageDuration: 1250,
                peakConcurrency: 4,
                averageConcurrency: 2.5
            };

            const result: ExecutionResult = {
                success: false,
                totalPackages: 3,
                completed: ['pkg1'],
                failed: [
                    {
                        name: 'pkg2',
                        error: 'Test failed',
                        isRetriable: false,
                        attemptNumber: 1,
                        failedAt: new Date().toISOString(),
                        dependencies: [],
                        dependents: ['pkg3']
                    }
                ],
                skipped: ['pkg3'],
                skippedNoChanges: [],
                metrics
            };

            const lines = ProgressFormatter.createSummaryTable(result);
            const output = lines.join('\n');

            expect(output).toContain('Failed Packages');
            expect(output).toContain('pkg2');
        });

        it('should show skip reason and dependents', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 5000,
                averagePackageDuration: 1250,
                peakConcurrency: 4,
                averageConcurrency: 2.5
            };

            const result: ExecutionResult = {
                success: false,
                totalPackages: 2,
                completed: [],
                failed: [],
                skipped: ['pkg2'],
                skippedNoChanges: [],
                metrics
            };

            const lines = ProgressFormatter.createSummaryTable(result);
            const output = lines.join('\n');

            expect(output).toContain('Skipped');
        });

        it('should include metrics table', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 60000,
                averagePackageDuration: 12000,
                peakConcurrency: 8,
                averageConcurrency: 4.2
            };

            const result: ExecutionResult = {
                success: true,
                totalPackages: 5,
                completed: ['pkg1', 'pkg2', 'pkg3', 'pkg4', 'pkg5'],
                failed: [],
                skipped: [],
                skippedNoChanges: [],
                metrics
            };

            const lines = ProgressFormatter.createSummaryTable(result);
            const output = lines.join('\n');

            expect(output).toContain('Performance');
        });
    });

    describe('createMetricsTable', () => {
        it('should create metrics lines', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 30000,
                averagePackageDuration: 7500,
                peakConcurrency: 4,
                averageConcurrency: 2.5
            };

            const lines = ProgressFormatter.createMetricsTable(metrics);

            expect(lines.length).toBeGreaterThan(0);
            expect(lines.join('\n')).toContain('Performance');
        });

        it('should format duration correctly in metrics', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 125000,
                averagePackageDuration: 31250,
                peakConcurrency: 4,
                averageConcurrency: 2.5
            };

            const lines = ProgressFormatter.createMetricsTable(metrics);
            const output = lines.join('\n');

            expect(output).toContain('Time');
        });

        it('should show concurrency metrics', () => {
            const metrics: ExecutionMetrics = {
                totalDuration: 30000,
                averagePackageDuration: 7500,
                peakConcurrency: 8,
                averageConcurrency: 5.5
            };

            const lines = ProgressFormatter.createMetricsTable(metrics);
            const output = lines.join('\n');

            expect(output).toContain('Concurrency');
        });
    });

    describe('createErrorSummary', () => {
        it('should create error summary for failed packages', () => {
            const failures = [
                {
                    name: 'pkg1',
                    error: 'Build failed',
                    isRetriable: true,
                    attemptNumber: 1,
                    failedAt: new Date().toISOString(),
                    dependencies: [],
                    dependents: []
                },
                {
                    name: 'pkg2',
                    error: 'Test timeout',
                    isRetriable: false,
                    attemptNumber: 2,
                    failedAt: new Date().toISOString(),
                    dependencies: [],
                    dependents: ['pkg3']
                }
            ];

            const lines = ProgressFormatter.createErrorSummary(failures);

            expect(lines.length).toBeGreaterThan(0);
            expect(lines.join('\n')).toContain('pkg1');
            expect(lines.join('\n')).toContain('pkg2');
        });

        it('should handle empty failures list', () => {
            const lines = ProgressFormatter.createErrorSummary([]);
            expect(Array.isArray(lines)).toBe(true);
        });
    });

    describe('createRecoveryGuidance', () => {
        it('should provide guidance for retriable failures', () => {
            const lines = ProgressFormatter.createRecoveryGuidance(true, false);

            expect(lines.length).toBeGreaterThan(0);
            expect(lines.join('\n')).toContain('retry');
        });

        it('should provide guidance for permanent failures', () => {
            const lines = ProgressFormatter.createRecoveryGuidance(false, true);

            expect(lines.length).toBeGreaterThan(0);
        });

        it('should provide guidance for both types', () => {
            const lines = ProgressFormatter.createRecoveryGuidance(true, true);

            expect(lines.length).toBeGreaterThan(0);
        });

        it('should handle no failures', () => {
            const lines = ProgressFormatter.createRecoveryGuidance(false, false);

            expect(Array.isArray(lines)).toBe(true);
        });
    });
});

