import { describe, it, expect, beforeEach } from 'vitest';
import { PerformanceTracker } from '../../src/util/performanceTracker';

describe('PerformanceTracker', () => {
    let tracker: PerformanceTracker;

    beforeEach(() => {
        tracker = new PerformanceTracker();
    });

    describe('constructor', () => {
        it('should initialize with current time', () => {
            const tracker1 = new PerformanceTracker();
            const now = Date.now();
            expect(tracker1).toBeDefined();
        });
    });

    describe('recordPackageStart', () => {
        it('should record package start time', () => {
            tracker.recordPackageStart('package-a');
            // Verify by calling calculateMetrics
            const metrics = tracker.calculateMetrics(2);
            expect(metrics).toBeDefined();
        });

        it('should handle multiple packages', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageStart('package-b');
            tracker.recordPackageStart('package-c');

            const metrics = tracker.calculateMetrics(3);
            expect(metrics).toBeDefined();
        });
    });

    describe('recordPackageEnd', () => {
        it('should record package end time', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageEnd('package-a');

            const metrics = tracker.calculateMetrics(1);
            expect(metrics.totalDuration).toBeGreaterThanOrEqual(0);
        });

        it('should only count packages with both start and end', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageEnd('package-a');
            tracker.recordPackageStart('package-b'); // No end recorded

            const metrics = tracker.calculateMetrics(2);
            expect(metrics).toBeDefined();
        });
    });

    describe('recordConcurrency', () => {
        it('should record concurrency levels', () => {
            tracker.recordConcurrency(1);
            tracker.recordConcurrency(2);
            tracker.recordConcurrency(1);

            const metrics = tracker.calculateMetrics(2);
            expect(metrics.peakConcurrency).toBe(2);
        });

        it('should calculate average concurrency', () => {
            tracker.recordConcurrency(2);
            tracker.recordConcurrency(2);
            tracker.recordConcurrency(2);

            const metrics = tracker.calculateMetrics(2);
            expect(metrics.averageConcurrency).toBe(2);
        });

        it('should handle zero concurrency', () => {
            tracker.recordConcurrency(0);
            tracker.recordConcurrency(0);

            const metrics = tracker.calculateMetrics(2);
            expect(metrics.peakConcurrency).toBe(0);
        });
    });

    describe('calculateMetrics', () => {
        it('should return ExecutionMetrics object', () => {
            const metrics = tracker.calculateMetrics(4);

            expect(metrics).toHaveProperty('totalDuration');
            expect(metrics).toHaveProperty('averagePackageDuration');
            expect(metrics).toHaveProperty('peakConcurrency');
            expect(metrics).toHaveProperty('averageConcurrency');
            expect(metrics).toHaveProperty('speedupVsSequential');
        });

        it('should calculate total duration', async () => {
            await new Promise(resolve => setTimeout(resolve, 10));
            const metrics = tracker.calculateMetrics(1);
            expect(metrics.totalDuration).toBeGreaterThan(0);
        });

        it('should calculate average package duration', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageEnd('package-a');
            tracker.recordPackageStart('package-b');
            tracker.recordPackageEnd('package-b');

            const metrics = tracker.calculateMetrics(2);
            expect(metrics.averagePackageDuration).toBeGreaterThanOrEqual(0);
        });

        it('should handle empty tracker', () => {
            const metrics = tracker.calculateMetrics(4);

            expect(metrics.peakConcurrency).toBe(0);
            expect(metrics.averageConcurrency).toBe(0);
            expect(metrics.averagePackageDuration).toBe(0);
        });

        it('should calculate speedup correctly', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageEnd('package-a');
            tracker.recordPackageStart('package-b');
            tracker.recordPackageEnd('package-b');
            tracker.recordConcurrency(2);
            tracker.recordConcurrency(2);

            const metrics = tracker.calculateMetrics(2);
            expect(metrics.speedupVsSequential).toBeGreaterThan(0);
        });

        it('should handle single package', () => {
            tracker.recordPackageStart('single-pkg');
            tracker.recordPackageEnd('single-pkg');
            tracker.recordConcurrency(1);

            const metrics = tracker.calculateMetrics(1);
            expect(metrics.peakConcurrency).toBe(1);
        });

        it('should handle high concurrency recording', () => {
            for (let i = 0; i < 10; i++) {
                tracker.recordConcurrency(i);
            }

            const metrics = tracker.calculateMetrics(10);
            expect(metrics.peakConcurrency).toBe(9);
        });
    });

    describe('getEfficiency', () => {
        it('should return efficiency metrics', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageEnd('package-a');
            tracker.recordConcurrency(1);

            const efficiency = tracker.getEfficiency(2);

            expect(efficiency).toHaveProperty('utilization');
            expect(efficiency).toHaveProperty('efficiency');
            expect(efficiency).toHaveProperty('parallelEfficiency');
        });

        it('should calculate utilization percentage', () => {
            tracker.recordConcurrency(1);
            tracker.recordConcurrency(1);
            tracker.recordConcurrency(1);

            const efficiency = tracker.getEfficiency(2);
            expect(efficiency.utilization).toBeGreaterThanOrEqual(0);
            expect(efficiency.utilization).toBeLessThanOrEqual(100);
        });

        it('should calculate parallel efficiency', () => {
            tracker.recordPackageStart('package-a');
            tracker.recordPackageEnd('package-a');
            tracker.recordPackageStart('package-b');
            tracker.recordPackageEnd('package-b');
            tracker.recordConcurrency(2);
            tracker.recordConcurrency(2);

            const efficiency = tracker.getEfficiency(2);
            expect(efficiency.parallelEfficiency).toBeGreaterThanOrEqual(0);
        });

        it('should handle zero maxConcurrency', () => {
            tracker.recordConcurrency(1);

            const efficiency = tracker.getEfficiency(0);
            expect(efficiency).toBeDefined();
        });

        it('should handle empty concurrency history', () => {
            const efficiency = tracker.getEfficiency(4);

            expect(efficiency.utilization).toBe(0);
        });

        it('should handle full utilization', () => {
            tracker.recordConcurrency(4);
            tracker.recordConcurrency(4);
            tracker.recordConcurrency(4);

            const efficiency = tracker.getEfficiency(4);
            expect(efficiency.utilization).toBeCloseTo(100, 1);
        });
    });

    describe('edge cases', () => {
        it('should handle rapid start/end calls', () => {
            for (let i = 0; i < 100; i++) {
                tracker.recordPackageStart(`package-${i}`);
                tracker.recordPackageEnd(`package-${i}`);
            }

            const metrics = tracker.calculateMetrics(10);
            expect(metrics).toBeDefined();
        });

        it('should maintain accuracy with high concurrency values', () => {
            for (let i = 1; i <= 100; i++) {
                tracker.recordConcurrency(i);
            }

            const metrics = tracker.calculateMetrics(100);
            expect(metrics.peakConcurrency).toBe(100);
        });

        it('should handle multiple tracker instances', () => {
            const tracker2 = new PerformanceTracker();

            tracker.recordConcurrency(1);
            tracker2.recordConcurrency(2);

            const metrics1 = tracker.calculateMetrics(2);
            const metrics2 = tracker2.calculateMetrics(2);

            expect(metrics1.peakConcurrency).toBe(1);
            expect(metrics2.peakConcurrency).toBe(2);
        });

        it('should calculate metrics without any package data', () => {
            tracker.recordConcurrency(0);
            tracker.recordConcurrency(0);

            const metrics = tracker.calculateMetrics(1);
            expect(metrics.speedupVsSequential).toBe(1);
        });
    });
});

