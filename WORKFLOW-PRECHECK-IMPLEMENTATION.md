# Workflow Precheck Implementation

## Problem Statement

The `kodrdriv publish` command was freezing when running in the getfjell/http-api repository during the `publish-tree` operation.

### Root Cause

The workflow file at `~/gitw/getfjell/http-api/.github/workflows/test.yml` is configured with:

```yaml
on:
  push:
    branches:
      - main
      - working
      - 'feature/**'
```

**The problem:** This workflow triggers on `push` events but **NOT on `pull_request` events**.

When `kodrdriv publish`:
1. Creates a new branch and pushes commits ✅
2. Creates a pull request ✅
3. Waits for PR checks to complete using `waitForPullRequestChecks()` ❌

The `waitForPullRequestChecks()` function queries the GitHub API for check runs associated with the PR. Because the workflow only triggers on `push` (not `pull_request`), GitHub doesn't associate those workflow runs with the PR, so the API returns no checks.

The function was designed to detect this after 1 minute (6 consecutive checks with no results), but in your case it was likely stuck in a detection loop or the command was running with `skipUserConfirmation: true` which caused it to wait for the full 1-hour timeout.

## Solution

I've implemented **two complementary improvements** to prevent this issue:

### 1. Workflow Validation Precheck (runs before PR creation)
### 2. Smart Wait Skipping (skips waiting if no PR workflows detected)

### Changes Made

#### 1. Workflow Validation Precheck

**New function** `checkWorkflowConfiguration()` in `@eldrforge/github-tools` that:
- Lists all workflows in the repository
- Analyzes each workflow file's YAML content
- Determines if workflows will be triggered by PRs to the target branch
- Returns detailed information about workflow configuration

**Location:** `~/gitw/calenvarek/github-tools/src/github.ts`

**Example output:**
```typescript
{
  hasWorkflows: true,
  workflowCount: 4,
  hasPullRequestTriggers: false,  // ⚠️  This is the warning
  triggeredWorkflowNames: [],
  warning: "4 workflow(s) are configured, but none appear to trigger on pull requests to main"
}
```

#### 2. Smart Wait Skipping

**After** the PR is created, the publish command now checks the workflow configuration again and **skips waiting entirely** if no workflows will trigger on the PR.

**Location:** `~/gitw/calenvarek/kodrdriv/src/commands/publish.ts` (lines 833-850)

**Output when skipping:**
```
Waiting for PR #75 checks to complete...
⏭️  Skipping check wait - no workflows configured to trigger on this PR
```

This prevents the command from freezing when workflows exist but don't trigger on PRs.

#### 3. Improved Detection in `waitForPullRequestChecks`

Made the wait function smarter and faster:
- **Reduced wait time**: Now checks after 30 seconds instead of 1 minute
- **Better detection**: Distinguishes between "no workflow runs" vs "workflow runs exist on branch but aren't PR checks"
- **Explicit handling**: When workflows trigger on `push` but not `pull_request`, it detects this and proceeds without waiting

**Location:** `~/gitw/calenvarek/github-tools/src/github.ts`

**Key improvements:**
```typescript
// Changed from 6 checks (1 minute) to 3 checks (30 seconds)
const maxConsecutiveNoChecks = 3;

// New logic to detect workflows that trigger on push but not pull_request
logger.info(`Found workflow runs on the branch, but none appear as PR checks.`);
logger.info(`This usually means workflows trigger on 'push' but not 'pull_request'.`);
// ... proceeds without waiting in non-interactive mode
```

#### 4. Precheck Warning

Modified the `runPrechecks()` function to call `checkWorkflowConfiguration()` and warn users before creating the PR.

**Location:** `~/gitw/calenvarek/kodrdriv/src/commands/publish.ts` (lines 244-267)

**Output when workflows are missing:**
```
Checking GitHub Actions workflow configuration...
⚠️  Found 4 workflow(s), but none are triggered by PRs to main.
   The publish process will create a PR but will not wait for any checks to complete.
   Consider updating workflow triggers to include: on.pull_request.branches: [main]
```

#### 5. Tests

Created comprehensive test suite with 8 test cases covering:
- No workflows configured
- Workflows with `pull_request` triggers
- Workflows without `pull_request` triggers
- Branch-specific triggers
- Wildcard patterns
- Multiple workflows with mixed configurations
- API error handling

**Location:** `~/gitw/calenvarek/github-tools/tests/checkWorkflowConfiguration.test.ts`

**Result:** All 8 tests passing ✅

## How to Fix the http-api Workflow

Update `~/gitw/getfjell/http-api/.github/workflows/test.yml`:

```yaml
name: Run Tests

on:
  push:
    branches:
      - main
      - working
      - 'feature/**'
  pull_request:  # ← ADD THIS
    branches:
      - main

permissions:
  contents: read
  statuses: write

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test

      - uses: codecov/codecov-action@v5
        with:
          slug: getfjell/http-api
          token: ${{ secrets.CODECOV_TOKEN }}
```

**What this does:**
- Triggers the workflow when PRs are opened/updated targeting `main` branch
- GitHub will now associate the check runs with the PR
- `kodrdriv publish` will detect the checks and wait for them to complete
- The PR merge will only proceed after checks pass ✅

## Testing the Fix

After updating the workflow file and rebuilding:

1. **Test the precheck:**
   ```bash
   cd ~/gitw/getfjell/http-api
   kodrdriv publish --dry-run
   ```

   Before fix: Would warn about missing PR triggers
   After fix: Should show workflow will run on PRs ✅

2. **Test actual publish:**
   ```bash
   kodrdriv publish
   ```

   Should now:
   - Create PR
   - Detect workflow runs
   - Wait for checks to complete
   - Merge when checks pass

## Related Files Modified

### github-tools package:
- `~/gitw/calenvarek/github-tools/src/github.ts` - Added `checkWorkflowConfiguration()` and `isTriggeredByPullRequest()`
- `~/gitw/calenvarek/github-tools/src/index.ts` - Exported new function
- `~/gitw/calenvarek/github-tools/tests/checkWorkflowConfiguration.test.ts` - New test file

### kodrdriv package:
- `~/gitw/calenvarek/kodrdriv/src/commands/publish.ts` - Added workflow validation to prechecks

Both packages have been built and all tests pass.

## Future Improvements

Consider adding:
1. Configuration option to skip workflow validation if desired
2. Ability to specify minimum required workflows
3. Integration with workflow file templates for new projects

## Summary

**What was frozen:** The `kodrdriv publish` command waiting for PR checks that never appeared

**Why it happened:** The workflow triggers on `push` but not `pull_request`, so GitHub doesn't associate runs with the PR

**How we fixed it:**
1. ✅ **Precheck Warning**: Validates workflow configuration before creating the PR and warns about missing triggers
2. ✅ **Smart Wait Skipping**: Automatically skips waiting if no workflows will trigger on the PR (no more freezing!)
3. ✅ **Improved Detection**: Detects within 30 seconds when workflows exist on branch but aren't PR checks

**How to fix your workflow:** Add `pull_request` trigger to your workflow files (see above)

**Current state:**
- ✅ Precheck implemented and warns users
- ✅ Smart skip logic prevents freezing
- ✅ Faster detection (30s instead of 1 minute)
- ✅ Better error messages
- ✅ All tests passing (8/8)
- ✅ Both packages built
- ⚠️  http-api workflow needs updating for best experience (see above)

**Behavior now:**
- **Before fix**: Command would freeze for up to 1 hour waiting for checks
- **After fix**: Command detects the issue within 30 seconds and proceeds automatically in non-interactive mode, or prompts user in interactive mode

