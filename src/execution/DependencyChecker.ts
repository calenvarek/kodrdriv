import { DependencyGraph } from '../util/dependencyGraph';
import { ExecutionState } from '../types/parallelExecution';

/**
 * DependencyChecker validates package readiness and provides dependency information
 * for the task pool scheduler.
 */
export class DependencyChecker {
    private graph: DependencyGraph;

    constructor(graph: DependencyGraph) {
        this.graph = graph;
    }

    /**
     * Check if a package is ready to execute
     * A package is ready when all its dependencies are completed and none have failed
     */
    isReady(packageName: string, state: ExecutionState): boolean {
        const dependencies = this.graph.edges.get(packageName) || new Set();

        for (const dep of dependencies) {
            // If any dependency is not completed, not ready
            if (!state.completed.includes(dep)) {
                return false;
            }

            // If any dependency failed, should be skipped (not ready)
            if (state.failed.some(f => f.name === dep)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get count of packages that depend on this one
     * Higher count = higher priority (unlocks more packages)
     */
    getDependentCount(packageName: string): number {
        return (this.graph.reverseEdges.get(packageName) || new Set()).size;
    }

    /**
     * Get depth of package in dependency tree
     * Depth = longest path from a root package (package with no dependencies)
     * Lower depth = higher priority (can unlock dependent packages sooner)
     */
    getDepth(packageName: string): number {
        const visited = new Set<string>();

        const calculateDepth = (pkg: string): number => {
            if (visited.has(pkg)) return 0;
            visited.add(pkg);

            const deps = this.graph.edges.get(pkg) || new Set();
            if (deps.size === 0) return 0;

            return 1 + Math.max(...Array.from(deps).map(dep => calculateDepth(dep)));
        };

        return calculateDepth(packageName);
    }

    /**
     * Get all dependencies for a package
     */
    getDependencies(packageName: string): Set<string> {
        return this.graph.edges.get(packageName) || new Set();
    }

    /**
     * Get all dependents (packages that depend on this one)
     */
    getDependents(packageName: string): Set<string> {
        return this.graph.reverseEdges.get(packageName) || new Set();
    }

    /**
     * Check if package has any dependencies
     */
    hasDependencies(packageName: string): boolean {
        const deps = this.graph.edges.get(packageName);
        return deps !== undefined && deps.size > 0;
    }

    /**
     * Check if package has any dependents
     */
    hasDependents(packageName: string): boolean {
        const dependents = this.graph.reverseEdges.get(packageName);
        return dependents !== undefined && dependents.size > 0;
    }

    /**
     * Get packages that are blocked by a failed package
     */
    getBlockedPackages(failedPackage: string, state: ExecutionState): Set<string> {
        const blocked = new Set<string>();

        // Add all pending and ready packages that depend on the failed package
        const allPending = [...state.pending, ...state.ready];

        for (const pkg of allPending) {
            const deps = this.graph.edges.get(pkg) || new Set();
            if (deps.has(failedPackage)) {
                blocked.add(pkg);
            }
        }

        return blocked;
    }
}
