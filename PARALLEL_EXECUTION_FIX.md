# Parallel Execution Freeze Fix

## Problem

When running `kodrdriv tree publish --parallel`, the execution would freeze because:

1. **Multiple child processes** were spawned (one per package)
2. All packages were in the **same git repository** (`/Users/tobrien/gitw/calenvarek`)
3. Each child process had its own **in-memory mutex** (SimpleMutex)
4. In-memory mutexes **cannot coordinate across separate processes**
5. Multiple processes tried to run git operations concurrently
6. Git created `.git/index.lock` files, causing conflicts and hangs

## Root Cause

The `SimpleMutex` class in `src/util/mutex.ts` was designed for **single-process** synchronization. It uses in-memory state that cannot be shared between separate Node.js processes.

When `kodrdriv tree publish --parallel` spawns child processes using `exec()`, each child process:
- Gets its own memory space
- Creates its own `RepositoryMutexManager` singleton
- Has no way to coordinate with other processes

## Solution

Implemented a **file-based locking mechanism** in `src/util/fileLock.ts`:

### Key Features

1. **Cross-Process Safety**: Uses atomic file operations (`wx` flag) that work across processes
2. **Exponential Backoff**: Retries lock acquisition with increasing delays (100ms → 2000ms max)
3. **Stale Lock Detection**: Automatically removes locks older than 30 seconds
4. **Automatic Cleanup**: Releases locks on process exit (normal, SIGINT, SIGTERM, uncaughtException)
5. **Per-Repository Locking**: Creates `.git/kodrdriv.lock` file in each repository

### Implementation Details

#### FileLock Class
```typescript
class FileLock {
    async lock(): Promise<void> {
        // Attempts to create lock file atomically with 'wx' flag
        // Retries with exponential backoff if file exists
        // Detects and removes stale locks (>30 seconds old)
    }
    
    unlock(): void {
        // Removes lock file
    }
}
```

#### RepositoryFileLockManager Class
```typescript
class RepositoryFileLockManager {
    getRepositoryLock(repoPath: string): FileLock {
        // Returns file lock for .git/kodrdriv.lock
    }
    
    async withGitLock<T>(repoPath, operation, operationName): Promise<T> {
        // Acquires lock, executes operation, releases lock
    }
}
```

### Changes Made

1. **Created** `src/util/fileLock.ts` - New file-based locking implementation
2. **Modified** `src/util/gitMutex.ts` - Now uses FileLock instead of SimpleMutex
3. **No Breaking Changes** - API remains the same, only implementation changed

### How It Works

```
Parent Process (kodrdriv tree publish --parallel)
├── Spawns: kodrdriv publish [git-tools]
│   └── Tries to acquire .git/kodrdriv.lock
│       ✓ Success! Executes git operations
│       ✓ Releases lock
├── Spawns: kodrdriv publish [ai-service]
│   └── Tries to acquire .git/kodrdriv.lock
│       ⏳ Waits... lock file exists
│       ✓ Previous process released lock
│       ✓ Acquires lock, executes, releases
├── Spawns: kodrdriv publish [github-tools]
│   └── (same pattern)
└── Spawns: kodrdriv publish [kodrdriv]
    └── (same pattern)
```

### Testing

- ✅ All 283 existing tests pass
- ✅ Build succeeds with no linter errors
- ✅ Lock files are automatically cleaned up on exit
- ✅ Stale locks (>30s) are automatically removed

## Usage

No changes needed! The fix is transparent:

```bash
# This now works without freezing
kodrdriv tree publish --parallel

# Same for other commands that use git operations
kodrdriv tree commit --parallel
```

## Lock File Location

Lock files are created at:
```
/path/to/repo/.git/kodrdriv.lock
```

These files:
- Are automatically created/removed
- Are gitignored (in .git directory)
- Are safe to manually delete if stale
- Contain diagnostic info (PID, timestamp, hostname)

## Performance Impact

- **Minimal overhead**: File operations are fast (microseconds)
- **Better than deadlock**: Small delay is better than infinite freeze
- **Automatic backoff**: Reduces contention with exponential delays
- **Stale lock cleanup**: Prevents indefinite blocking

## Future Improvements

Potential enhancements:
1. Make lock timeout configurable
2. Add lock health monitoring/metrics
3. Implement lock priority/queueing
4. Add verbose lock acquisition logging

## Verification

To verify the fix works:
```bash
cd /Users/tobrien/gitw/calenvarek/kodrdriv
npm run build
kodrdriv tree publish --parallel --dry-run
```

The parallel execution should now proceed without freezing.
