import { describe, it, expect, beforeEach } from 'vitest';
import { ResourceMonitor } from '@eldrforge/tree-execution';

describe('ResourceMonitor', () => {
    let monitor: ResourceMonitor;

    beforeEach(() => {
        monitor = new ResourceMonitor(4);
    });

    describe('canAllocate', () => {
        it('should return true when slots are available', () => {
            expect(monitor.canAllocate(1)).toBe(true);
            expect(monitor.canAllocate(4)).toBe(true);
        });

        it('should return false when not enough slots', () => {
            monitor.allocate(4);
            expect(monitor.canAllocate(1)).toBe(false);
        });
    });

    describe('allocate', () => {
        it('should allocate resources', () => {
            const success = monitor.allocate(2);

            expect(success).toBe(true);
            expect(monitor.getCurrentConcurrency()).toBe(2);
            expect(monitor.getAvailableSlots()).toBe(2);
        });

        it('should fail when not enough resources', () => {
            monitor.allocate(4);
            const success = monitor.allocate(1);

            expect(success).toBe(false);
            expect(monitor.getCurrentConcurrency()).toBe(4);
        });

        it('should track peak concurrency', () => {
            monitor.allocate(2);
            monitor.allocate(1);
            monitor.release(1);
            monitor.allocate(2);

            const metrics = monitor.getMetrics();
            expect(metrics.peakConcurrency).toBe(4);
        });
    });

    describe('release', () => {
        it('should release resources', () => {
            monitor.allocate(3);
            monitor.release(1);

            expect(monitor.getCurrentConcurrency()).toBe(2);
            expect(monitor.getAvailableSlots()).toBe(2);
        });

        it('should not go below zero', () => {
            monitor.release(5);

            expect(monitor.getCurrentConcurrency()).toBe(0);
        });
    });

    describe('getUtilization', () => {
        it('should calculate utilization percentage', () => {
            monitor.allocate(2);

            expect(monitor.getUtilization()).toBe(50);
        });

        it('should return 0 when idle', () => {
            expect(monitor.getUtilization()).toBe(0);
        });

        it('should return 100 when fully utilized', () => {
            monitor.allocate(4);

            expect(monitor.getUtilization()).toBe(100);
        });
    });

    describe('isFullyUtilized', () => {
        it('should detect full utilization', () => {
            monitor.allocate(4);

            expect(monitor.isFullyUtilized()).toBe(true);
        });

        it('should detect partial utilization', () => {
            monitor.allocate(2);

            expect(monitor.isFullyUtilized()).toBe(false);
        });
    });

    describe('isIdle', () => {
        it('should detect idle state', () => {
            expect(monitor.isIdle()).toBe(true);
        });

        it('should detect active state', () => {
            monitor.allocate(1);

            expect(monitor.isIdle()).toBe(false);
        });
    });

    describe('metrics', () => {
        it('should track total allocations and releases', () => {
            monitor.allocate(2);
            monitor.allocate(1);
            monitor.release(1);
            monitor.allocate(2);
            monitor.release(3);

            const metrics = monitor.getMetrics();

            expect(metrics.totalAllocations).toBe(5);
            expect(metrics.totalReleases).toBe(4);
        });

        it('should calculate average concurrency', () => {
            monitor.allocate(2);
            monitor.allocate(2);
            monitor.release(2);

            const metrics = monitor.getMetrics();

            expect(metrics.averageConcurrency).toBeGreaterThan(0);
        });
    });

    describe('reset', () => {
        it('should reset all metrics', () => {
            monitor.allocate(3);
            monitor.release(1);
            monitor.reset();

            expect(monitor.getCurrentConcurrency()).toBe(0);
            expect(monitor.getMetrics().totalAllocations).toBe(0);
            expect(monitor.getMetrics().peakConcurrency).toBe(0);
        });
    });
});
