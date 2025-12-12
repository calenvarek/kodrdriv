# Example Output: Branch Audit with Progress Feedback

## Before (No Feedback)

```bash
$ kodrdriv tree publish --audit-branches
🔍 Auditing branch state across all packages...
BRANCH_STATE_AUDIT: Auditing branch state for packages | Package Count: 50 | Purpose: Verify synchronization
Checking for merge conflicts with 'main' and existing pull requests...

[... 2-3 minutes of silence ...]

✅ All 45 package(s) are in good state!
```

**Problem:** Users don't know if the command is running or stuck.

---

## After (With Progress Feedback)

### Default Output

```bash
$ kodrdriv tree publish --audit-branches
🔍 Auditing branch state across all packages...
BRANCH_STATE_AUDIT: Auditing branch state for packages | Package Count: 50 | Purpose: Verify synchronization
Checking for merge conflicts with 'main' and existing pull requests...

📋 Phase 1/2: Detecting most common branch across packages...
  [1/50] Checking branch: @myorg/core
  [2/50] Checking branch: @myorg/utils
  [3/50] Checking branch: @myorg/api
  ...
  [48/50] Checking branch: @myorg/tests
  [49/50] Checking branch: @myorg/docs
  [50/50] Checking branch: @myorg/cli
✓ Most common branch: development (48/50 packages)

📋 Phase 2/2: Auditing package state (checking git status, conflicts, PRs, versions)...
  [1/50] Auditing: @myorg/core
  [2/50] Auditing: @myorg/utils
  [3/50] Auditing: @myorg/api
  ...
  [48/50] Auditing: @myorg/tests
  [49/50] Auditing: @myorg/docs
  [50/50] Auditing: @myorg/cli
✓ Audit complete: 45/50 packages have no issues
  Issues found in 5 package(s)

[... detailed issue report ...]

⚠️  Found issues in 5 package(s). Review the fixes above.
```

### Verbose Output (`--verbose`)

```bash
$ kodrdriv tree publish --audit-branches --verbose
🔍 Auditing branch state across all packages...
BRANCH_STATE_AUDIT: Auditing branch state for packages | Package Count: 50 | Purpose: Verify synchronization
Checking for merge conflicts with 'main' and existing pull requests...

📋 Phase 1/2: Detecting most common branch across packages...
  [1/50] Checking branch: @myorg/core
  [2/50] Checking branch: @myorg/utils
  ...
✓ Most common branch: development (48/50 packages)

📋 Phase 2/2: Auditing package state (checking git status, conflicts, PRs, versions)...
  [1/50] Auditing: @myorg/core
    Fetching latest from origin for /path/to/core...
    Checking for merge conflicts with main...
    Checking GitHub for existing PRs...
  [2/50] Auditing: @myorg/utils
    Fetching latest from origin for /path/to/utils...
    Checking for merge conflicts with main...
    Checking GitHub for existing PRs...
    Found existing PR #123: https://github.com/myorg/utils/pull/123
  [3/50] Auditing: @myorg/api
    Fetching latest from origin for /path/to/api...
    Checking for merge conflicts with main...
    ⚠️  Merge conflicts detected with main
    Checking GitHub for existing PRs...
  ...
✓ Audit complete: 45/50 packages have no issues
  Issues found in 5 package(s)
```

## Benefits

1. **Immediate Feedback:** Users see progress start immediately
2. **Progress Tracking:** `[N/Total]` shows exactly where you are
3. **Time Estimation:** If `[10/50]` takes 30 seconds, expect ~2.5 minutes total
4. **Debug Support:** Verbose mode shows which operations are slow
5. **Clear Completion:** Final summary shows results at a glance

## Testing the Changes

```bash
# Test in a monorepo with multiple packages
cd /path/to/your/monorepo

# Default output (progress with package names)
kodrdriv tree publish --audit-branches

# Verbose output (shows git operations)
kodrdriv tree publish --audit-branches --verbose

# Debug output (most detailed)
kodrdriv tree publish --audit-branches --debug
```

