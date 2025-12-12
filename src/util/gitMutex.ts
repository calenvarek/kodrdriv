import * as path from 'path';
// eslint-disable-next-line no-restricted-imports
import { statSync } from 'fs';
import { SimpleMutex } from './mutex';
import { getLogger } from '../logging';

/**
 * Manages per-repository mutexes for git operations
 * Prevents concurrent git operations in the same repository (which cause .git/index.lock conflicts)
 * while still allowing parallel operations across different repositories
 */
export class RepositoryMutexManager {
    private mutexes: Map<string, SimpleMutex> = new Map();
    private logger = getLogger();

    /**
     * Get or create a mutex for a specific git repository
     * @param repoPath Path to the git repository root
     * @returns SimpleMutex for this repository
     */
    getRepositoryMutex(repoPath: string): SimpleMutex {
        // Normalize path to avoid duplicates
        const normalizedPath = path.resolve(repoPath);

        if (!this.mutexes.has(normalizedPath)) {
            this.logger.debug(`Creating git mutex for repository: ${normalizedPath}`);
            this.mutexes.set(normalizedPath, new SimpleMutex());
        }

        return this.mutexes.get(normalizedPath)!;
    }

    /**
     * Execute a git operation with repository-level locking
     * @param packagePath Path to the package (will find its git repo root)
     * @param operation The async operation to execute under lock
     * @param operationName Optional name for logging
     * @returns Result of the operation
     */
    async withGitLock<T>(
        packagePath: string,
        operation: () => Promise<T>,
        operationName?: string
    ): Promise<T> {
        const repoPath = getGitRepositoryRoot(packagePath);

        if (!repoPath) {
            // Not in a git repository, execute without lock
            this.logger.debug(`No git repository found for ${packagePath}, executing without lock`);
            return await operation();
        }

        const mutex = this.getRepositoryMutex(repoPath);
        const startWait = Date.now();

        // Check if we need to wait
        if (mutex.isLocked()) {
            const queueLength = mutex.getQueueLength();
            this.logger.verbose(
                `Waiting for git lock on ${repoPath} (${queueLength} operation(s) in queue)${operationName ? ` for: ${operationName}` : ''}`
            );
        }

        await mutex.lock();

        const waitTime = Date.now() - startWait;
        if (waitTime > 100) {
            this.logger.debug(
                `Acquired git lock for ${repoPath} after ${waitTime}ms${operationName ? ` for: ${operationName}` : ''}`
            );
        }

        try {
            return await operation();
        } finally {
            mutex.unlock();
            this.logger.silly(`Released git lock for ${repoPath}${operationName ? ` after: ${operationName}` : ''}`);
        }
    }

    /**
     * Destroy all mutexes and clean up resources
     */
    destroy(): void {
        this.logger.debug(`Destroying ${this.mutexes.size} git repository mutex(es)`);
        for (const mutex of this.mutexes.values()) {
            mutex.destroy();
        }
        this.mutexes.clear();
    }

    /**
     * Get statistics about current mutex usage
     */
    getStats(): { totalRepos: number; lockedRepos: number; totalWaiting: number } {
        let lockedRepos = 0;
        let totalWaiting = 0;

        for (const mutex of this.mutexes.values()) {
            if (mutex.isLocked()) {
                lockedRepos++;
            }
            totalWaiting += mutex.getQueueLength();
        }

        return {
            totalRepos: this.mutexes.size,
            lockedRepos,
            totalWaiting
        };
    }
}

/**
 * Find the git repository root for a given path
 * Walks up the directory tree until it finds a .git directory
 * @param startPath Starting path (can be a file or directory)
 * @returns Absolute path to git repository root, or null if not in a git repo
 */
export function getGitRepositoryRoot(startPath: string): string | null {
    let currentPath = path.resolve(startPath);

    // If startPath is a file, start from its directory
    try {
        const stats = statSync(currentPath);
        if (stats.isFile()) {
            currentPath = path.dirname(currentPath);
        }
    } catch {
        // If stat fails, assume it's a directory and continue
    }

    // Walk up until we find .git or reach root
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
        const gitPath = path.join(currentPath, '.git');

        try {
            const stats = statSync(gitPath);
            if (stats.isDirectory() || stats.isFile()) {
                // Found .git (can be directory or file for submodules)
                return currentPath;
            }
        } catch {
            // .git doesn't exist at this level, continue up
        }

        // Move up one directory
        const parentPath = path.dirname(currentPath);
        if (parentPath === currentPath) {
            // Reached root without finding .git
            break;
        }
        currentPath = parentPath;
    }

    return null;
}

/**
 * Check if a path is within a git repository
 * @param checkPath Path to check
 * @returns true if path is in a git repository
 */
export function isInGitRepository(checkPath: string): boolean {
    return getGitRepositoryRoot(checkPath) !== null;
}

/**
 * Check if two paths are in the same git repository
 * @param path1 First path
 * @param path2 Second path
 * @returns true if both paths are in the same git repository
 */
export function areInSameRepository(path1: string, path2: string): boolean {
    const repo1 = getGitRepositoryRoot(path1);
    const repo2 = getGitRepositoryRoot(path2);

    if (!repo1 || !repo2) {
        return false;
    }

    return repo1 === repo2;
}

// Global singleton instance
let globalGitMutexManager: RepositoryMutexManager | null = null;

/**
 * Get the global git mutex manager instance
 * Creates one if it doesn't exist
 */
export function getGitMutexManager(): RepositoryMutexManager {
    if (!globalGitMutexManager) {
        globalGitMutexManager = new RepositoryMutexManager();
    }
    return globalGitMutexManager;
}

/**
 * Destroy the global git mutex manager
 * Should be called when shutting down or during cleanup
 */
export function destroyGitMutexManager(): void {
    if (globalGitMutexManager) {
        globalGitMutexManager.destroy();
        globalGitMutexManager = null;
    }
}

/**
 * Helper function to wrap git operations with automatic locking
 * Uses the global git mutex manager
 *
 * @example
 * await runGitWithLock(packagePath, async () => {
 *     await run('git add package.json');
 *     await run('git commit -m "Update version"');
 * }, 'version bump commit');
 */
export async function runGitWithLock<T>(
    packagePath: string,
    operation: () => Promise<T>,
    operationName?: string
): Promise<T> {
    const manager = getGitMutexManager();
    return await manager.withGitLock(packagePath, operation, operationName);
}
