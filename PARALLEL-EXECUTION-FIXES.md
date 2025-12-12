# Parallel Execution Fixes

## Critical Bugs Fixed

### 1. Recovery System - Checkpoint Deleted When Packages Skipped (Commit b6deb3f)

**Problem**: When using `--mark-completed` during recovery, the checkpoint was deleted even though dependent packages were skipped, making recovery impossible.

**Symptoms**:
- Misleading "All X packages completed successfully!" message when packages were actually skipped
- Lost checkpoint, unable to continue execution
- No way to resume and complete skipped packages

**Fix**: Modified checkpoint cleanup logic to preserve checkpoint when packages are skipped.

**Files Changed**:
- `src/execution/DynamicTaskPool.ts`: Only cleanup if NO failures AND NO skipped packages
- `src/execution/TreeExecutionAdapter.ts`: Show accurate message for skipped packages
- `src/execution/RecoveryManager.ts`: Accept both directory names and package names
- `src/arguments.ts`: Updated help text for consistency
- `src/ui/ProgressFormatter.ts`: Updated recovery guidance

### 2. Parallel Execution - Race Conditions in Dependency Updates (Commit 371050c)

**Problem**: When running `kodrdriv tree publish --parallel`, multiple packages updated dependencies simultaneously, causing catastrophic failures.

**Symptoms**:
```
1. ENOTEMPTY errors:
   npm error ENOTEMPTY: directory not empty, rename
   '/path/node_modules/@eldrforge/git-tools' ->
   '/path/node_modules/@eldrforge/.git-tools-xxx'

2. "not a git repository" errors:
   fatal: not a git repository (or any of the parent directories): .git

3. Git state conflicts:
   error: Working directory has uncommitted changes
```

**Root Cause**:
- Dependency update operations (npm install + git commit) ran in parallel
- Multiple packages tried to:
  - Update same dependencies → filesystem race conditions
  - Commit at same time → git state conflicts
  - Run in different working directories → lost git context

**Solution**: Wrapped dependency update + commit section with per-repository lock (`runGitWithLock`):
- Operations serialize within each repository
- Maintains parallelism across different repositories
- Prevents npm install race conditions
- Prevents git commit conflicts
- Preserves working directory context

**Files Changed**:
- `src/commands/tree.ts`: Import `runGitWithLock` and wrap dependency update section

## Impact

### Before Fixes:
```bash
# Parallel publish would fail catastrophically:
kodrdriv tree publish --parallel
# → ENOTEMPTY errors
# → Git repository errors
# → Unable to recover
```

### After Fixes:
```bash
# Parallel publish works reliably:
kodrdriv tree publish --parallel
# → Dependency updates happen serially per repo
# → Git operations don't conflict
# → If something fails, recovery actually works

# Recovery now works:
kodrdriv tree publish --continue --mark-completed "git-tools"
# → Checkpoint preserved
# → Remaining packages execute
# → Can use simple directory names
```

## Technical Details

### Git Lock Mechanism

The fix uses `runGitWithLock()` from `src/util/gitMutex.ts`:

```typescript
await runGitWithLock(packageDir, async () => {
    // Update scoped dependencies (npm install)
    await updateScopedDependencies(...);

    // Update inter-project dependencies (npm install)
    await updateInterProjectDependencies(...);

    // Commit changes (git operations)
    await Commit.execute(...);
}, `${packageName}: dependency updates`);
```

This ensures that:
1. Operations are serialized within each git repository
2. Parallel execution continues across different repositories
3. File-based locks coordinate across processes
4. No race conditions on npm install or git operations

### Checkpoint Preservation

The checkpoint cleanup now checks both conditions:

```typescript
const allCompleted = this.state.failed.length === 0 &&
                    this.state.skipped.length === 0;
if (allCompleted) {
    await this.checkpointManager.cleanup();
} else {
    await this.saveCheckpoint(); // Keep checkpoint for recovery
}
```

## Testing

Both fixes have been tested and work correctly:
- Recovery system preserves checkpoints when needed
- Parallel execution no longer causes race conditions
- Directory names work for `--mark-completed`

## Version

These fixes are in version `1.2.24-dev.0` commit `371050c`.
