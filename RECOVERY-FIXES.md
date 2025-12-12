# Recovery System Fixes

## Issues Fixed

### 1. Checkpoint Deleted When Packages Are Skipped

**Problem**: When using `--mark-completed` to mark a failed package as done, the system would delete the checkpoint even though dependent packages were skipped. This resulted in:
- Misleading "All X packages completed successfully! 🎉" message when packages were actually skipped
- Lost checkpoint making it impossible to continue the execution
- No way to resume and complete the skipped packages

**Root Cause**: In `DynamicTaskPool.ts`, the cleanup logic only checked for failed packages, not skipped packages:

```typescript
// Before (WRONG)
if (this.state.failed.length === 0) {
    await this.checkpointManager.cleanup();  // Deletes checkpoint
}

// After (FIXED)
const allCompleted = this.state.failed.length === 0 && this.state.skipped.length === 0;
if (allCompleted) {
    await this.checkpointManager.cleanup();
}
```

**Fix**: Modified `src/execution/DynamicTaskPool.ts` to preserve the checkpoint when packages are skipped, and updated `src/execution/TreeExecutionAdapter.ts` to show the correct message when packages are skipped.

### 2. Inconsistent Package Identifier Format

**Problem**: The `--mark-completed` option required NPM package names (e.g., `"@eldrforge/git-tools"`), while `--start-from` accepted directory names (e.g., `"git-tools"`). This was confusing and inconsistent.

**Fix**: Updated `src/execution/RecoveryManager.ts` to accept both directory names and package names for `--mark-completed`, matching the behavior of `--start-from`:

```typescript
// Now both work:
kodrdriv tree publish --continue --mark-completed "git-tools"
kodrdriv tree publish --continue --mark-completed "@eldrforge/git-tools"
```

The system will:
1. Try exact package name match first
2. Fall back to directory name match
3. Provide helpful error with available packages if not found

**Updated Files**:
- `src/execution/RecoveryManager.ts` - Added `resolvePackageName()` helper and updated `markCompleted()`
- `src/arguments.ts` - Updated help text
- `src/ui/ProgressFormatter.ts` - Updated recovery guidance to use directory names

## Testing

All existing tests pass, including the specific RecoveryManager tests.

## Usage

Now you can use directory names (much simpler):

```bash
# Start a parallel publish
kodrdriv tree publish --parallel

# If git-tools fails due to merge conflict, fix it manually, then:
kodrdriv tree publish --continue --mark-completed "git-tools"

# The remaining packages (ai-service, github-tools, kodrdriv) will now execute
```

The system will:
1. Keep the checkpoint if packages are skipped
2. Show accurate status messages
3. Allow you to continue execution to complete the skipped packages
