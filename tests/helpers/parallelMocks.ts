import type { DependencyGraph, PackageInfo } from '@eldrforge/tree-core';
import type { ParallelExecutionCheckpoint, ExecutionState } from '@eldrforge/tree-execution';
import { Config } from '../../src/types';

/**
 * Create a mock dependency graph from a simple structure definition
 *
 * @example
 * const graph = createMockGraph({
 *   'package-a': [],  // No dependencies
 *   'package-b': ['package-a'],  // Depends on package-a
 *   'package-c': ['package-a', 'package-b']  // Depends on both
 * });
 */
export function createMockGraph(structure: Record<string, string[]>): DependencyGraph {
    const packages = new Map<string, PackageInfo>();
    const edges = new Map<string, Set<string>>();

    // Create packages
    for (const [name, deps] of Object.entries(structure)) {
        packages.set(name, {
            name,
            version: '1.0.0',
            path: `/mock/packages/${name}`,
            dependencies: new Set(deps),
            devDependencies: new Set(),
            localDependencies: new Set(deps)
        });

        edges.set(name, new Set(deps));
    }

    // Build reverse edges (dependents)
    const reverseEdges = new Map<string, Set<string>>();
    for (const [pkg, deps] of edges) {
        for (const dep of deps) {
            if (!reverseEdges.has(dep)) {
                reverseEdges.set(dep, new Set());
            }
            reverseEdges.get(dep)!.add(pkg);
        }
    }

    return { packages, edges, reverseEdges };
}

/**
 * Create a mock checkpoint with optional overrides
 */
export function createMockCheckpoint(
    overrides?: Partial<ParallelExecutionCheckpoint>
): ParallelExecutionCheckpoint {
    const now = new Date().toISOString();

    return {
        version: '1.0.0',
        executionId: `test-exec-${Date.now()}`,
        createdAt: now,
        lastUpdated: now,
        command: 'npm test',
        originalConfig: createMockConfig(),
        dependencyGraph: {
            packages: [],
            edges: []
        },
        buildOrder: ['package-a', 'package-b', 'package-c'],
        executionMode: 'parallel',
        maxConcurrency: 4,
        state: createMockExecutionState(),
        publishedVersions: [],
        retryAttempts: {},
        lastRetryTime: {},
        packageStartTimes: {},
        packageEndTimes: {},
        packageDurations: {},
        totalStartTime: now,
        recoveryHints: [],
        canRecover: true,
        ...overrides
    };
}

/**
 * Create a mock execution state
 */
export function createMockExecutionState(
    overrides?: Partial<ExecutionState>
): ExecutionState {
    return {
        pending: [],
        ready: [],
        running: [],
        completed: [],
        failed: [],
        skipped: [],
        skippedNoChanges: [],
        ...overrides
    };
}

/**
 * Create a mock config
 */
export function createMockConfig(overrides?: Partial<Config>): Config {
    return {
        dryRun: false,
        verbose: false,
        debug: false,
        tree: {
            parallel: true,
            maxConcurrency: 4,
            retry: {
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 10000,
                backoffMultiplier: 2
            }
        },
        ...overrides
    } as Config;
}

/**
 * Create a large mock checkpoint for performance testing
 */
export function createLargeCheckpoint(packageCount: number): ParallelExecutionCheckpoint {
    const packages = Array.from({ length: packageCount }, (_, i) => `package-${i}`);

    return createMockCheckpoint({
        buildOrder: packages,
        state: {
            pending: packages.slice(packageCount / 2),
            ready: [],
            running: [],
            completed: packages.slice(0, packageCount / 2),
            failed: [],
            skipped: [],
            skippedNoChanges: []
        }
    });
}

/**
 * Execution timer for testing parallel execution timing
 */
export class ExecutionTimer {
    private startTimes = new Map<string, number>();
    private endTimes = new Map<string, number>();

    start(id: string): void {
        this.startTimes.set(id, Date.now());
    }

    end(id: string): void {
        this.endTimes.set(id, Date.now());
    }

    getDuration(id: string): number {
        const start = this.startTimes.get(id);
        const end = this.endTimes.get(id);
        if (!start || !end) return 0;
        return end - start;
    }

    /**
     * Check if two tasks ran in parallel (started within threshold of each other)
     */
    wereParallel(id1: string, id2: string, thresholdMs: number = 100): boolean {
        const start1 = this.startTimes.get(id1);
        const start2 = this.startTimes.get(id2);
        if (!start1 || !start2) return false;
        return Math.abs(start1 - start2) < thresholdMs;
    }

    /**
     * Check if two tasks ran sequentially (first ended before second started)
     */
    wereSequential(id1: string, id2: string): boolean {
        const end1 = this.endTimes.get(id1);
        const start2 = this.startTimes.get(id2);
        if (!end1 || !start2) return false;
        return end1 <= start2;
    }

    /**
     * Get all timing data
     */
    getAllTimings(): Map<string, { start: number; end: number; duration: number }> {
        const timings = new Map();

        for (const [id, start] of this.startTimes) {
            const end = this.endTimes.get(id);
            if (end) {
                timings.set(id, {
                    start,
                    end,
                    duration: end - start
                });
            }
        }

        return timings;
    }

    /**
     * Reset all timings
     */
    reset(): void {
        this.startTimes.clear();
        this.endTimes.clear();
    }
}

/**
 * Mock executor for testing parallel execution without actually running commands
 */
export class MockExecutor {
    private executionTimes = new Map<string, number>();
    private failures = new Set<string>();
    private delays = new Map<string, number>();
    private callbacks = new Map<string, () => void>();

    /**
     * Set how long a package should take to execute
     */
    setExecutionTime(packageName: string, ms: number): void {
        this.executionTimes.set(packageName, ms);
    }

    /**
     * Mark a package to fail
     */
    setFailure(packageName: string): void {
        this.failures.add(packageName);
    }

    /**
     * Set an initial delay before starting execution
     */
    setDelay(packageName: string, ms: number): void {
        this.delays.set(packageName, ms);
    }

    /**
     * Set a callback to run when package starts
     */
    onStart(packageName: string, callback: () => void): void {
        this.callbacks.set(packageName, callback);
    }

    /**
     * Execute a mock package
     */
    async execute(packageName: string): Promise<{ success: boolean; duration: number }> {
        // Initial delay
        const delay = this.delays.get(packageName) || 0;
        if (delay > 0) {
            await this.sleep(delay);
        }

        // Run callback if set
        const callback = this.callbacks.get(packageName);
        if (callback) {
            callback();
        }

        // Check for failure
        if (this.failures.has(packageName)) {
            throw new Error(`Mock failure for ${packageName}`);
        }

        // Simulate execution time
        const duration = this.executionTimes.get(packageName) || 100;
        await this.sleep(duration);

        return { success: true, duration };
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset all mock settings
     */
    reset(): void {
        this.executionTimes.clear();
        this.failures.clear();
        this.delays.clear();
        this.callbacks.clear();
    }
}

/**
 * Create a mock graph with common patterns
 */
export const MockGraphPatterns = {
    /**
     * Linear dependency chain: A -> B -> C -> D
     */
    linear: (): DependencyGraph => createMockGraph({
        'package-a': [],
        'package-b': ['package-a'],
        'package-c': ['package-b'],
        'package-d': ['package-c']
    }),

    /**
     * Diamond dependencies:
     *     A
     *    / \
     *   B   C
     *    \ /
     *     D
     */
    diamond: (): DependencyGraph => createMockGraph({
        'package-a': [],
        'package-b': ['package-a'],
        'package-c': ['package-a'],
        'package-d': ['package-b', 'package-c']
    }),

    /**
     * All independent packages (maximum parallelism)
     */
    independent: (count: number = 5): DependencyGraph => {
        const structure: Record<string, string[]> = {};
        for (let i = 0; i < count; i++) {
            structure[`package-${i}`] = [];
        }
        return createMockGraph(structure);
    },

    /**
     * Complex graph with multiple levels
     */
    complex: (): DependencyGraph => createMockGraph({
        // Level 0 (no dependencies)
        'utils': [],
        'types': [],

        // Level 1 (depend on level 0)
        'core': ['utils', 'types'],
        'common': ['types'],

        // Level 2 (depend on level 1)
        'api': ['core', 'common'],
        'ui': ['core', 'common'],

        // Level 3 (depend on level 2)
        'web': ['api', 'ui'],
        'mobile': ['api', 'ui']
    })
};
