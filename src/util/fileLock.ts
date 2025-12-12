// eslint-disable-next-line no-restricted-imports
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getLogger } from '../logging';

/**
 * File-based lock for cross-process synchronization
 * Uses atomic file operations to coordinate across multiple Node processes
 */
export class FileLock {
    private lockPath: string;
    private lockAcquired = false;
    private maxRetries = 100; // Maximum number of lock attempts
    private retryDelay = 100; // Initial retry delay in ms
    private maxRetryDelay = 2000; // Maximum retry delay in ms
    private lockTimeout = 30000; // Consider lock stale after 30 seconds
    private logger = getLogger();

    constructor(lockPath: string) {
        this.lockPath = lockPath;
    }

    /**
     * Acquire the file lock with exponential backoff retry
     */
    async lock(): Promise<void> {
        let attempts = 0;
        let currentDelay = this.retryDelay;

        while (attempts < this.maxRetries) {
            try {
                // Try to create lock file atomically with 'wx' flag (fails if exists)
                const lockData = {
                    pid: process.pid,
                    timestamp: Date.now(),
                    hostname: os.hostname()
                };

                // Check if lock file exists and is stale
                if (fs.existsSync(this.lockPath)) {
                    const lockContent = fs.readFileSync(this.lockPath, 'utf-8');
                    try {
                        const existingLock = JSON.parse(lockContent);
                        const lockAge = Date.now() - existingLock.timestamp;

                        // If lock is stale, try to remove it
                        if (lockAge > this.lockTimeout) {
                            this.logger.debug(`Removing stale lock file (age: ${lockAge}ms, pid: ${existingLock.pid})`);
                            try {
                                fs.unlinkSync(this.lockPath);
                            } catch {
                                // Lock might have been removed by another process, continue
                            }
                        }
                    } catch {
                        // Invalid lock file, try to remove it
                        try {
                            fs.unlinkSync(this.lockPath);
                        } catch {
                            // Ignore errors
                        }
                    }
                }

                // Try to acquire lock
                fs.writeFileSync(this.lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
                this.lockAcquired = true;

                if (attempts > 0) {
                    this.logger.debug(`Acquired file lock after ${attempts} attempts: ${this.lockPath}`);
                }

                return;
            } catch (error: any) {
                if (error.code === 'EEXIST') {
                    // Lock file exists, retry with backoff
                    attempts++;

                    if (attempts === 1 || attempts % 10 === 0) {
                        this.logger.verbose(`Waiting for file lock (attempt ${attempts}/${this.maxRetries}): ${this.lockPath}`);
                    }

                    await new Promise(resolve => setTimeout(resolve, currentDelay));

                    // Exponential backoff
                    currentDelay = Math.min(currentDelay * 1.5, this.maxRetryDelay);
                } else {
                    // Unexpected error
                    throw new Error(`Failed to acquire file lock ${this.lockPath}: ${error.message}`);
                }
            }
        }

        throw new Error(`Failed to acquire file lock after ${this.maxRetries} attempts: ${this.lockPath}`);
    }

    /**
     * Release the file lock
     */
    unlock(): void {
        if (!this.lockAcquired) {
            return;
        }

        try {
            if (fs.existsSync(this.lockPath)) {
                fs.unlinkSync(this.lockPath);
            }
            this.lockAcquired = false;
            this.logger.silly(`Released file lock: ${this.lockPath}`);
        } catch (error: any) {
            // Lock file might have been removed by another process or stale lock cleanup
            this.logger.debug(`Error releasing file lock ${this.lockPath}: ${error.message}`);
            this.lockAcquired = false;
        }
    }

    /**
     * Check if this instance currently holds the lock
     */
    isLocked(): boolean {
        return this.lockAcquired;
    }
}

/**
 * Manages file-based locks for git repositories (cross-process safe)
 */
export class RepositoryFileLockManager {
    private locks: Map<string, FileLock> = new Map();
    private logger = getLogger();
    private cleanupRegistered = false;

    /**
     * Get or create a file lock for a specific git repository
     * @param repoPath Path to the git repository root
     * @returns FileLock for this repository
     */
    getRepositoryLock(repoPath: string): FileLock {
        const normalizedPath = path.resolve(repoPath);

        if (!this.locks.has(normalizedPath)) {
            // Resolve the actual .git directory (handles both regular repos and submodules)
            const gitDirPath = this.resolveGitDirectory(normalizedPath);
            const lockPath = path.join(gitDirPath, 'kodrdriv.lock');
            this.logger.debug(`Creating file lock for repository: ${normalizedPath} at ${lockPath}`);
            this.locks.set(normalizedPath, new FileLock(lockPath));

            // Register cleanup handler on first lock creation
            if (!this.cleanupRegistered) {
                this.registerCleanupHandlers();
                this.cleanupRegistered = true;
            }
        }

        return this.locks.get(normalizedPath)!;
    }

    /**
     * Resolve the actual .git directory path, handling both regular repos and submodules
     * @param repoPath Path to the repository root
     * @returns Path to the actual .git directory
     */
    private resolveGitDirectory(repoPath: string): string {
        const gitPath = path.join(repoPath, '.git');

        try {
            const stat = fs.statSync(gitPath);

            if (stat.isDirectory()) {
                // Regular git repository
                return gitPath;
            } else if (stat.isFile()) {
                // Git submodule - .git is a file with format: gitdir: <path>
                const gitFileContent = fs.readFileSync(gitPath, 'utf-8').trim();
                const match = gitFileContent.match(/^gitdir:\s*(.+)$/);

                if (match && match[1]) {
                    // Resolve the gitdir path (it's relative to the repo path)
                    const gitDirPath = path.resolve(repoPath, match[1]);
                    this.logger.debug(`Resolved submodule gitdir: ${gitDirPath}`);

                    // Ensure the git directory exists
                    if (!fs.existsSync(gitDirPath)) {
                        throw new Error(`Submodule git directory does not exist: ${gitDirPath}`);
                    }

                    return gitDirPath;
                }

                throw new Error(`Invalid .git file format in ${gitPath}: ${gitFileContent}`);
            }
        } catch (error: any) {
            // Check if error is from statSync (file doesn't exist)
            if (error.code === 'ENOENT') {
                throw new Error(`No .git directory or file found in ${repoPath}`);
            }
            throw new Error(`Failed to resolve git directory for ${repoPath}: ${error.message}`);
        }

        throw new Error(`No .git directory or file found in ${repoPath}`);
    }

    /**
     * Register cleanup handlers to release locks on process exit
     */
    private registerCleanupHandlers(): void {
        const cleanup = () => {
            this.destroy();
        };

        // Handle various exit scenarios
        process.on('exit', cleanup);
        process.on('SIGINT', () => {
            cleanup();
            process.exit(130); // Standard exit code for SIGINT
        });
        process.on('SIGTERM', () => {
            cleanup();
            process.exit(143); // Standard exit code for SIGTERM
        });
        process.on('uncaughtException', (error) => {
            this.logger.error('FILELOCK_UNCAUGHT_EXCEPTION: Uncaught exception detected, cleaning up locks | Error: ' + error + ' | Action: Release all locks');
            cleanup();
            process.exit(1);
        });
    }

    /**
     * Execute a git operation with repository-level file locking
     * @param repoPath Path to the git repository root
     * @param operation The async operation to execute under lock
     * @param operationName Optional name for logging
     * @returns Result of the operation
     */
    async withGitLock<T>(
        repoPath: string,
        operation: () => Promise<T>,
        operationName?: string
    ): Promise<T> {
        const lock = this.getRepositoryLock(repoPath);
        const startWait = Date.now();

        this.logger.silly(
            `Acquiring file lock for ${repoPath}${operationName ? ` for: ${operationName}` : ''}`
        );

        await lock.lock();

        const waitTime = Date.now() - startWait;
        if (waitTime > 100) {
            this.logger.debug(
                `Acquired file lock for ${repoPath} after ${waitTime}ms${operationName ? ` for: ${operationName}` : ''}`
            );
        }

        try {
            return await operation();
        } finally {
            lock.unlock();
        }
    }

    /**
     * Clean up all locks
     */
    destroy(): void {
        this.logger.debug(`Cleaning up ${this.locks.size} file lock(s)`);
        for (const lock of this.locks.values()) {
            lock.unlock();
        }
        this.locks.clear();
    }
}
