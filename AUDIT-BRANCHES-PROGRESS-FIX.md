# Branch Audit Progress Feedback Improvements

## Problem

The `kodrdriv tree publish --audit-branches` command takes a long time to run (several minutes for large monorepos) with no progress feedback, making it difficult to know if the command is actually running or stuck.

## Root Cause

The `auditBranchState` function in `src/utils/branchState.ts` performs extensive checks on every package:
- Git operations (fetch, ls-remote, rev-list, merge-tree)
- GitHub API calls to check for existing PRs
- Version validation
- Target branch sync checks

For a monorepo with 50+ packages, these sequential operations can take 2-3 seconds per package (100-150 seconds total) with no feedback during execution.

## Changes Made

### 1. Phase-based Progress Reporting

Added two-phase execution with clear messaging:

```
Phase 1/2: Detecting most common branch across packages...
  [1/50] Checking branch: package-a
  [2/50] Checking branch: package-b
  ...
✓ Most common branch: development (48/50 packages)

Phase 2/2: Auditing package state (checking git status, conflicts, PRs, versions)...
  [1/50] Auditing: package-a
  [2/50] Auditing: package-b
  ...
✓ Audit complete: 45/50 packages have no issues
  Issues found in 5 package(s)
```

### 2. Per-Package Progress Counters

Each package now shows its position in the queue `[N/Total]` so users can track overall progress.

### 3. Verbose Operation Logging

Added verbose logging for expensive operations within each package check:
- "Fetching latest from origin..."
- "Checking for merge conflicts..."
- "Checking GitHub for existing PRs..."
- "Found existing PR #123..."

These only appear when `--verbose` or `--debug` flags are used, providing more detailed feedback without cluttering default output.

### 4. Completion Summary

Added clear completion message showing:
- Number of packages with no issues
- Number of packages with issues (if any)

## Impact

Users can now:
1. **See that the command is running** - immediate feedback with progress counters
2. **Estimate completion time** - `[15/50]` indicates 30% complete
3. **Identify slow operations** - verbose mode shows which operation is taking time
4. **Know when it's done** - clear completion message

## Files Modified

- `src/utils/branchState.ts` - Added progress logging to `auditBranchState` and `checkBranchStatus` functions

## Testing

Compile check: ✅ Passed (`tsc --noEmit`)

Manual testing recommended:
```bash
kodrdriv tree publish --audit-branches
kodrdriv tree publish --audit-branches --verbose
kodrdriv tree publish --audit-branches --debug
```

## Future Optimizations (Not Implemented)

Potential future improvements for faster execution:
1. **Parallel package checks** - Process multiple packages simultaneously (requires careful handling of git operations)
2. **Batch GitHub API calls** - Use GraphQL to query multiple PRs at once
3. **Cache git fetch results** - Avoid fetching the same remote multiple times
4. **Skip checks for packages with no changes** - Use git status to detect unchanged packages early

These optimizations would require more significant refactoring and testing.

