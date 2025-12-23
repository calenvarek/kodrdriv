import { getLogger } from '../logging';
import * as os from 'os';

export interface ResourceMetrics {
    peakConcurrency: number;
    averageConcurrency: number;
    totalAllocations: number;
    totalReleases: number;
    freeMemoryBytes?: number;
}

/**
 * ResourceMonitor manages concurrency limits and tracks resource utilization
 */
export class ResourceMonitor {
    private maxConcurrency: number;
    private currentConcurrency: number = 0;
    private metrics: ResourceMetrics;
    private allocationHistory: number[] = [];
    private logger = getLogger();

    // Memory threshold: warn if free memory is below 5%
    private readonly MEMORY_THRESHOLD_PERCENT = 5;

    constructor(maxConcurrency: number) {
        this.maxConcurrency = maxConcurrency;
        this.metrics = {
            peakConcurrency: 0,
            averageConcurrency: 0,
            totalAllocations: 0,
            totalReleases: 0
        };
    }

    /**
     * Check if we can allocate N slots
     */
    canAllocate(count: number = 1): boolean {
        // Check concurrency limit
        if (this.currentConcurrency + count > this.maxConcurrency) {
            return false;
        }

        // Check system memory (soft check)
        this.checkSystemMemory();

        return true;
    }

    /**
     * Log a warning if system memory is low
     */
    private checkSystemMemory(): void {
        try {
            const freeMem = os.freemem();
            const totalMem = os.totalmem();
            const freePercent = (freeMem / totalMem) * 100;

            if (freePercent < this.MEMORY_THRESHOLD_PERCENT) {
                const freeGB = (freeMem / (1024 * 1024 * 1024)).toFixed(2);
                this.logger.warn(`SYSTEM_MEMORY_LOW: System memory is running low | Free: ${freeGB}GB (${freePercent.toFixed(1)}%) | Action: Proceeding with caution`);
            }
        } catch (error) {
            // Ignore errors in memory check to avoid blocking execution
            this.logger.debug(`Failed to check system memory: ${error}`);
        }
    }

    /**
     * Allocate resource slots
     * @returns true if allocation succeeded, false if not enough slots available
     */
    allocate(count: number = 1): boolean {
        if (!this.canAllocate(count)) {
            return false;
        }

        this.currentConcurrency += count;
        this.metrics.totalAllocations += count;
        this.metrics.peakConcurrency = Math.max(
            this.metrics.peakConcurrency,
            this.currentConcurrency
        );

        this.allocationHistory.push(this.currentConcurrency);
        this.updateAverageConcurrency();

        this.logger.debug(`Allocated ${count} slot(s) (${this.currentConcurrency}/${this.maxConcurrency})`);

        return true;
    }

    /**
     * Release resource slots
     */
    release(count: number = 1): void {
        this.currentConcurrency = Math.max(0, this.currentConcurrency - count);
        this.metrics.totalReleases += count;

        this.allocationHistory.push(this.currentConcurrency);
        this.updateAverageConcurrency();

        this.logger.debug(`Released ${count} slot(s) (${this.currentConcurrency}/${this.maxConcurrency})`);
    }

    /**
     * Get number of available slots
     */
    getAvailableSlots(): number {
        return this.maxConcurrency - this.currentConcurrency;
    }

    /**
     * Get current concurrency level
     */
    getCurrentConcurrency(): number {
        return this.currentConcurrency;
    }

    /**
     * Get maximum concurrency limit
     */
    getMaxConcurrency(): number {
        return this.maxConcurrency;
    }

    /**
     * Get resource utilization metrics
     */
    getMetrics(): ResourceMetrics {
        return { ...this.metrics };
    }

    /**
     * Get utilization percentage (0-100)
     */
    getUtilization(): number {
        if (this.maxConcurrency === 0) return 0;
        return (this.currentConcurrency / this.maxConcurrency) * 100;
    }

    /**
     * Check if resources are fully utilized
     */
    isFullyUtilized(): boolean {
        return this.currentConcurrency >= this.maxConcurrency;
    }

    /**
     * Check if resources are idle
     */
    isIdle(): boolean {
        return this.currentConcurrency === 0;
    }

    /**
     * Update average concurrency calculation
     */
    private updateAverageConcurrency(): void {
        if (this.allocationHistory.length === 0) {
            this.metrics.averageConcurrency = 0;
            return;
        }

        const sum = this.allocationHistory.reduce((a, b) => a + b, 0);
        this.metrics.averageConcurrency = sum / this.allocationHistory.length;
    }

    /**
     * Reset metrics (useful for testing)
     */
    reset(): void {
        this.currentConcurrency = 0;
        this.allocationHistory = [];
        this.metrics = {
            peakConcurrency: 0,
            averageConcurrency: 0,
            totalAllocations: 0,
            totalReleases: 0
        };
    }
}
