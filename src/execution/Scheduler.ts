import { DependencyGraph } from '../util/dependencyGraph';
import { ExecutionState } from '../types/parallelExecution';
import { DependencyChecker } from './DependencyChecker';

/**
 * Scheduler determines which packages to execute next based on priority
 */
export class Scheduler {
    private graph: DependencyGraph;
    private checker: DependencyChecker;

    constructor(graph: DependencyGraph, checker: DependencyChecker) {
        this.graph = graph;
        this.checker = checker;
    }

    /**
     * Get next packages to schedule based on available slots
     * Returns packages sorted by priority (highest priority first)
     */
    getNext(availableSlots: number, state: ExecutionState): string[] {
        if (availableSlots <= 0 || state.ready.length === 0) {
            return [];
        }

        // Sort ready packages by priority
        const sorted = [...state.ready].sort((a, b) =>
            this.calculatePriority(b, state) - this.calculatePriority(a, state)
        );

        // Return top N packages that fit in available slots
        return sorted.slice(0, availableSlots);
    }

    /**
     * Calculate priority score for a package
     * Higher score = higher priority = execute sooner
     *
     * Priority factors:
     * 1. Number of dependents (more = higher priority, unblocks more packages)
     * 2. Depth in dependency tree (shallower = higher priority, enables earlier unlocking)
     * 3. Retry attempts (fewer = higher priority, give fresh packages a chance)
     */
    calculatePriority(packageName: string, state: ExecutionState): number {
        let score = 0;

        // Factor 1: More dependents = higher priority (weight: 100)
        // Packages that unblock many others should run first
        const dependentCount = this.checker.getDependentCount(packageName);
        score += dependentCount * 100;

        // Factor 2: Depth penalty (weight: -10)
        // Prefer packages closer to the root of the dependency tree
        const depth = this.checker.getDepth(packageName);
        score -= depth * 10;

        // Factor 3: Retry penalty (weight: -50)
        // Packages that have failed before get lower priority
        const retries = state.failed.filter(f => f.name === packageName).length;
        score -= retries * 50;

        // Factor 4: Bonus for packages with no dependents (leaf nodes)
        // These are usually final deliverables and good to complete early for feedback
        if (!this.checker.hasDependents(packageName)) {
            score += 5;
        }

        return score;
    }

    /**
     * Get estimated completion order (for progress reporting)
     */
    getEstimatedOrder(state: ExecutionState): string[] {
        const allPending = [...state.pending, ...state.ready];

        return allPending.sort((a, b) =>
            this.calculatePriority(b, state) - this.calculatePriority(a, state)
        );
    }

    /**
     * Predict which packages will become ready next
     * Useful for pre-loading or progress estimation
     */
    predictNextReady(state: ExecutionState): string[] {
        const predictions: string[] = [];

        // Look at currently running packages
        const runningNames = state.running.map(r => r.name);

        // For each running package, see which pending packages only depend on it
        for (const runningPkg of runningNames) {
            for (const pendingPkg of state.pending) {
                const deps = this.checker.getDependencies(pendingPkg);

                // Check if this pending package will be ready when running completes
                const blockedBy = Array.from(deps).filter(dep =>
                    !state.completed.includes(dep) && dep !== runningPkg
                );

                if (blockedBy.length === 0) {
                    predictions.push(pendingPkg);
                }
            }
        }

        return predictions;
    }
}
