# AI-Friendly Logging Guide for KodrDriv

## Overview

All log messages in KodrDriv follow a structured pattern to be easily understood by AI agents, MCP-driven tools, and automated systems. This guide documents the standard patterns and provides examples.

## Message Format

```
OPERATION_STATE: Human-readable description | Key: value | Key2: value2 | Purpose: explanation
```

### Components:

1. **Structured Prefix** (`OPERATION_STATE`): Machine-readable operation identifier
2. **Description**: Human-readable explanation of what's happening
3. **Key-Value Pairs**: Contextual information separated by pipes (`|`)
4. **Purpose/Impact/Action**: Why this is happening or what to do next

## Naming Conventions

###Snake_Case Prefixes

All operation prefixes use `SNAKE_CASE` with underscores:
- ✅ `PACKAGE_STARTED`
- ✅ `GIT_FETCH_SUCCESS`
- ❌ `PackageStarted`
- ❌ `package-started`

### Common Suffixes

Use consistent suffixes to indicate operation state:
- `_STARTING` / `_STARTED`: Operation beginning
- `_COMPLETE` / `_COMPLETED`: Operation finished successfully
- `_SUCCESS`: Successful completion
- `_FAILED`: Operation failed
- `_ERROR`: Error occurred
- `_WARNING`: Warning condition
- `_SKIPPED`: Operation bypassed
- `_ABORTED`: Operation cancelled
- `_RETRYING` / `_ATTEMPTING`: Retry in progress

### Domain Prefixes

Group related operations with consistent prefixes:
- **Git Operations**: `GIT_FETCH`, `GIT_ADD`, `GIT_COMMIT`, `GIT_PUSH`
- **Branch Operations**: `BRANCH_SYNC`, `BRANCH_CREATE`, `BRANCH_SWITCH`
- **NPM Operations**: `NPM_INSTALL`, `NPM_LINK`, `NPM_LOCK`
- **Package Operations**: `PACKAGE_STARTED`, `PACKAGE_COMPLETED`, `PACKAGE_FAILED`
- **Merge Operations**: `MERGE_STARTING`, `MERGE_CONFLICTS`, `MERGE_SUCCESS`
- **Precheck Operations**: `PRECHECK_STARTING`, `PRECHECK_GIT_STATUS`, `PRECHECK_COMPLETE`

## Standard Keys

Use these standardized keys in key-value pairs:

| Key | Usage | Example |
|-----|-------|---------|
| `Package` | Package name | `Package: @scope/name` |
| `Status` | Current state | `Status: success` |
| `Error` | Error message | `Error: Connection timeout` |
| `Purpose` | Why operation exists | `Purpose: Validate dependencies` |
| `Action` | What to do next | `Action: Retry operation` |
| `Path` | File/directory path | `Path: /path/to/file` |
| `Command` | Command being run | `Command: npm install` |
| `Branch` | Git branch name | `Branch: main` |
| `Remote` | Git remote name | `Remote: origin` |
| `Count` | Number of items | `Count: 10` |
| `Progress` | Current progress | `Progress: [5/10]` |
| `Duration` | Time taken | `Duration: 1500ms` |
| `Mode` | Operation mode | `Mode: dry-run` |
| `Type` | Item type | `Type: relative_file_dependency` |
| `Reason` | Why something happened | `Reason: No changes detected` |
| `Impact` | Effect of operation | `Impact: Recovery may be affected` |

## Examples by Category

### Package Execution

```typescript
// Starting
logger.info('PACKAGE_STARTED: Package execution initiated | Package: @scope/name | Status: running');

// Progress
logger.info('PACKAGE_EXECUTING: Running command | Package: test | Progress: [3/10] | Command: npm test');

// Success
logger.info('PACKAGE_COMPLETED: Package finished successfully | Package: test | Duration: 1500ms | Status: success');

// Failure
logger.error('PACKAGE_FAILED: Package execution failed | Package: test | Error: Test timeout | Status: failed');

// Skip
logger.info('PACKAGE_SKIPPED_NO_CHANGES: Package skipped | Package: test | Reason: no-code-changes');
```

### Git Operations

```typescript
// Fetch
logger.info('GIT_FETCH_STARTING: Fetching remote information | Remote: origin | Purpose: Avoid conflicts');
logger.info('GIT_FETCH_SUCCESS: Fetched remote successfully | Remote: origin | Status: up-to-date');
logger.warn('GIT_FETCH_FAILED: Unable to fetch remote | Remote: origin | Error: Connection timeout');

// Branch Sync
logger.info('BRANCH_SYNC_ATTEMPTING: Initiating branch sync | Branch: main | Remote: origin | Operation: fetch + merge');
logger.info('BRANCH_SYNC_SUCCESS: Branch synchronized | Branch: main | Remote: origin | Status: in-sync');
logger.error('BRANCH_SYNC_FAILED: Sync operation failed | Branch: main | Error: Conflicts detected | Impact: Cannot proceed');
```

### NPM Operations

```typescript
logger.info('NPM_LINK_DETECTED: Found npm link references | File: package-lock.json | Type: relative_file_dependency');
logger.info('NPM_LINK_CLEANUP_REQUIRED: Npm links must be cleaned | Impact: Must clean before publish');
logger.info('NPM_LOCK_REGENERATED: Successfully regenerated package-lock.json | Path: ./package-lock.json | Status: clean');
```

### Merge Operations

```typescript
logger.info('MERGE_STARTING: Initiating merge operation | Target: main | Source: feature-branch');
logger.warn('MERGE_CONFLICTS_DETECTED: Conflicts found | Files: package.json, package-lock.json | Strategy: auto-resolve');
logger.info('MERGE_AUTO_RESOLVING: Automatically resolving conflicts | Strategy: Keep current branch | Files: 2');
logger.info('MERGE_SUCCESS: Merge completed successfully | Target: main | Conflicts Resolved: 2');
```

### Error Handling

```typescript
// Recoverable
logger.error('ERROR_RECOVERABLE: This error is recoverable | Action: Retry operation | Status: can-retry');

// Unexpected
logger.error('ERROR_UNEXPECTED: Unexpected error occurred | Command: publish | Error: message | Type: unexpected');

// Resolution Steps
logger.error('CONFLICT_RESOLUTION_REQUIRED: Manual intervention needed');
logger.error('   Step 1: Resolve conflicts in files');
logger.error('   Step 2: Stage resolved files | Command: git add <files>');
logger.error('   Step 3: Complete merge | Command: git commit');
```

### Dry Run Mode

```typescript
// Always indicate dry-run clearly
logger.info('GIT_ADD_DRY_RUN: Would stage all changes | Mode: dry-run | Command: git add -A');
logger.info('PUSH_DRY_RUN: Would push to remote | Mode: dry-run | Remote: origin | Command: git push');
logger.info('PRECHECK_GIT_REPO: Would verify git repository | Mode: dry-run | Command: git rev-parse --git-dir');
```

### Progress and Metrics

```typescript
logger.info('PARALLEL_EXECUTION_STARTING: Initiating parallel execution | Package Count: 10 | Mode: parallel');
logger.info('PROGRESS: [5/10] Package completed: @scope/package');
logger.info('PARALLEL_EXECUTION_COMPLETED: Execution finished | Duration: 45s | Status: completed');

logger.info('EXECUTION_METRICS: Performance statistics:');
logger.info('  METRIC_TOTAL_PACKAGES: 10');
logger.info('  METRIC_COMPLETED: 8 packages successfully completed');
logger.info('  METRIC_FAILED: 2 packages failed');
logger.info('  METRIC_PEAK_CONCURRENCY: 4 packages running simultaneously');
```

### User Interaction

```typescript
logger.info('SENDIT_MODE_ACTIVE: SendIt mode enabled | Action: Commit will execute automatically | Staged Changes: Available');
logger.info('USER_CANCELLATION: Operation cancelled by user | Reason: User aborted | Status: cancelled');
logger.info('COMMIT_NO_ACTION: No commit will be performed | Status: aborted | Next: User can retry');
```

## Migration Checklist

When updating log messages:

- [ ] Add structured prefix with SNAKE_CASE
- [ ] Include human-readable description
- [ ] Add relevant key-value pairs with pipe separators
- [ ] Include Purpose, Action, Impact, or Reason when applicable
- [ ] Use consistent key names from standard list
- [ ] Indicate dry-run mode explicitly
- [ ] Provide resolution steps for errors
- [ ] Include progress for iterative operations
- [ ] Add status indicators
- [ ] Remove emojis from structured prefixes (can keep in description)

## Bad vs Good Examples

### ❌ Bad
```typescript
logger.info('✅ Completed: test');
logger.warn('⚠️ Could not fetch from remote: timeout');
logger.info('Running command...');
```

### ✅ Good
```typescript
logger.info('PACKAGE_COMPLETED: Package execution finished | Package: test | Status: success');
logger.warn('GIT_FETCH_FAILED: Unable to fetch from remote | Remote: origin | Error: timeout | Impact: May cause conflicts');
logger.info('PACKAGE_EXECUTING: Running command for package | Package: test | Command: npm test');
```

## Testing

Run the logging pattern tests:
```bash
npm test -- tests/logging/aiFriendlyLogging.test.ts
```

All 27 tests should pass, validating:
- Message format
- Prefix naming
- Key-value pairs
- Semantic operations
- Context inclusion
- Error recovery info
- Machine-readable markers

## Benefits for AI Agents

1. **Easy Parsing**: Structured format enables regex-based extraction
2. **State Tracking**: Operation prefixes indicate current workflow state
3. **Context Understanding**: Key-value pairs provide necessary details
4. **Decision Making**: Action/Impact fields guide next steps
5. **Error Recovery**: Explicit resolution steps and alternatives
6. **Progress Monitoring**: Standardized progress indicators

## References

- Test Suite: `tests/logging/aiFriendlyLogging.test.ts`
- Implementation Examples: All `src/commands/*.ts` files
- Execution Logging: `src/execution/TreeExecutionAdapter.ts`
- Error Handling: `src/util/errorHandler.ts`

