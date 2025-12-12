import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { FileLock, RepositoryFileLockManager } from '../src/util/fileLock';

describe('FileLock', () => {
    let tempDir: string;
    let lockPath: string;

    beforeEach(() => {
        // Create a temporary directory for testing
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'filelock-test-'));
        lockPath = path.join(tempDir, 'test.lock');
    });

    afterEach(() => {
        // Clean up temp directory
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should acquire and release lock', async () => {
        const lock = new FileLock(lockPath);

        expect(lock.isLocked()).toBe(false);

        await lock.lock();
        expect(lock.isLocked()).toBe(true);
        expect(fs.existsSync(lockPath)).toBe(true);

        lock.unlock();
        expect(lock.isLocked()).toBe(false);
        expect(fs.existsSync(lockPath)).toBe(false);
    });

    it('should block concurrent lock acquisition', async () => {
        const lock1 = new FileLock(lockPath);
        const lock2 = new FileLock(lockPath);

        await lock1.lock();

        // Try to acquire second lock (should timeout quickly for this test)
        const timeoutPromise = new Promise<void>((resolve) => {
            setTimeout(() => resolve(), 500);
        });

        const lockPromise = lock2.lock().catch(() => {
            // Expected to timeout
        });

        await Promise.race([lockPromise, timeoutPromise]);

        // Lock2 should not have acquired the lock
        expect(lock2.isLocked()).toBe(false);
        expect(lock1.isLocked()).toBe(true);

        // Clean up
        lock1.unlock();
    });

    it('should handle stale locks', async () => {
        const lock1 = new FileLock(lockPath);
        const lock2 = new FileLock(lockPath);

        // Create a stale lock (very old timestamp)
        const staleLockData = {
            pid: 99999,
            timestamp: Date.now() - 60000, // 60 seconds old
            hostname: 'test-host'
        };
        fs.writeFileSync(lockPath, JSON.stringify(staleLockData));

        // Should be able to acquire the lock (stale lock removed)
        await lock2.lock();
        expect(lock2.isLocked()).toBe(true);

        lock2.unlock();
    });
});

describe('RepositoryFileLockManager', () => {
    let tempDir: string;
    let repoDir: string;
    let gitDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-lock-test-'));
        repoDir = path.join(tempDir, 'repo');
        gitDir = path.join(repoDir, '.git');

        // Create a mock git repository
        fs.mkdirSync(repoDir, { recursive: true });
        fs.mkdirSync(gitDir, { recursive: true });
    });

    afterEach(() => {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    });

    it('should create lock in .git directory for regular repo', () => {
        const manager = new RepositoryFileLockManager();
        const lock = manager.getRepositoryLock(repoDir);

        expect(lock).toBeDefined();

        // Clean up
        manager.destroy();
    });

    it('should handle git submodule with gitdir reference', () => {
        // Remove the .git directory and create a .git file (submodule style)
        fs.rmSync(gitDir, { recursive: true });

        // Create the actual git directory in parent .git/modules
        const parentGitModules = path.join(tempDir, '.git', 'modules', 'repo');
        fs.mkdirSync(parentGitModules, { recursive: true });

        // Create .git file with gitdir reference
        const gitFileContent = `gitdir: ../.git/modules/repo`;
        fs.writeFileSync(path.join(repoDir, '.git'), gitFileContent, 'utf-8');

        const manager = new RepositoryFileLockManager();
        const lock = manager.getRepositoryLock(repoDir);

        expect(lock).toBeDefined();

        // Clean up
        manager.destroy();
    });

    it('should handle relative gitdir paths in submodules', () => {
        // Remove the .git directory and create a .git file (submodule style)
        fs.rmSync(gitDir, { recursive: true });

        // Create the actual git directory in parent
        const actualGitDir = path.join(tempDir, 'parent-git', 'modules', 'test-submodule');
        fs.mkdirSync(actualGitDir, { recursive: true });

        // Create .git file with relative gitdir reference
        const gitFileContent = `gitdir: ../parent-git/modules/test-submodule`;
        fs.writeFileSync(path.join(repoDir, '.git'), gitFileContent, 'utf-8');

        const manager = new RepositoryFileLockManager();
        const lock = manager.getRepositoryLock(repoDir);

        expect(lock).toBeDefined();

        // Clean up
        manager.destroy();
    });

    it('should throw error for missing git directory', () => {
        // Remove .git directory
        fs.rmSync(gitDir, { recursive: true });

        const manager = new RepositoryFileLockManager();

        expect(() => {
            manager.getRepositoryLock(repoDir);
        }).toThrow('No .git directory or file found');

        // Clean up
        manager.destroy();
    });

    it('should throw error for invalid git file format', () => {
        // Remove .git directory and create invalid .git file
        fs.rmSync(gitDir, { recursive: true });
        fs.writeFileSync(path.join(repoDir, '.git'), 'invalid content', 'utf-8');

        const manager = new RepositoryFileLockManager();

        expect(() => {
            manager.getRepositoryLock(repoDir);
        }).toThrow('Invalid .git file format');

        // Clean up
        manager.destroy();
    });

    it('should throw error for missing submodule git directory', () => {
        // Remove .git directory and create .git file pointing to non-existent directory
        fs.rmSync(gitDir, { recursive: true });
        const gitFileContent = `gitdir: ../non-existent-dir`;
        fs.writeFileSync(path.join(repoDir, '.git'), gitFileContent, 'utf-8');

        const manager = new RepositoryFileLockManager();

        expect(() => {
            manager.getRepositoryLock(repoDir);
        }).toThrow('Submodule git directory does not exist');

        // Clean up
        manager.destroy();
    });

    it('should execute operation under lock', async () => {
        const manager = new RepositoryFileLockManager();
        let operationExecuted = false;

        const result = await manager.withGitLock(repoDir, async () => {
            operationExecuted = true;
            return 'success';
        });

        expect(operationExecuted).toBe(true);
        expect(result).toBe('success');

        // Clean up
        manager.destroy();
    });

    it('should release lock even if operation throws', async () => {
        const manager = new RepositoryFileLockManager();
        const lock = manager.getRepositoryLock(repoDir);

        await expect(async () => {
            await manager.withGitLock(repoDir, async () => {
                throw new Error('Operation failed');
            });
        }).rejects.toThrow('Operation failed');

        // Lock should be released
        expect(lock.isLocked()).toBe(false);

        // Clean up
        manager.destroy();
    });

    it('should serialize multiple operations on same repo', async () => {
        const manager = new RepositoryFileLockManager();
        const executionOrder: number[] = [];

        // Start multiple operations concurrently
        const promises = [
            manager.withGitLock(repoDir, async () => {
                executionOrder.push(1);
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push(2);
            }),
            manager.withGitLock(repoDir, async () => {
                executionOrder.push(3);
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push(4);
            }),
            manager.withGitLock(repoDir, async () => {
                executionOrder.push(5);
                await new Promise(resolve => setTimeout(resolve, 50));
                executionOrder.push(6);
            })
        ];

        await Promise.all(promises);

        // Operations should be serialized: [1,2], [3,4], [5,6]
        // Not interleaved like [1,3,5,2,4,6]
        expect(executionOrder).toEqual([1, 2, 3, 4, 5, 6]);

        // Clean up
        manager.destroy();
    });
});

