# Parallel Publish Debugging Guide

Quick reference for debugging parallel publish failures with the improved logging and error reporting.

## Finding Log Files

When a package fails during parallel publish, the error summary shows the log file location:

```
❌ Failure Summary:

  @fjell/registry:
    Type: Test Coverage
    Details: statements: 69.65% (threshold: 70%)
    Log: /Users/tobrien/gitw/getfjell/registry/output/kodrdriv/publish_2025-12-12_19-18-55.log
    💡 Suggestion: cd /Users/tobrien/gitw/getfjell/registry && npm test -- --coverage
```

**To view the full log**:
```bash
cat /Users/tobrien/gitw/getfjell/registry/output/kodrdriv/publish_2025-12-12_19-18-55.log
```

## Common Error Types

### Test Coverage Failures

```
Type: Test Coverage
Details: statements: 69.65% (threshold: 70%)
```

**What it means**: Test coverage dropped below the required threshold.

**How to fix**:
```bash
cd {package-path}
npm test -- --coverage  # Check actual coverage
# Add more tests to increase coverage
```

**Retriable**: ❌ No (requires code changes)

---

### Test Failures

```
Type: Test Failure
Details: 3 test(s) failing
```

**What it means**: Some tests are failing.

**How to fix**:
```bash
cd {package-path}
npm test  # Run tests to see failures
# Fix failing tests
```

**Retriable**: ❌ No (requires code changes)

---

### Build Errors

```
Type: Build Error
Details: compilation failed: TS2304: Cannot find name 'foo'
```

**What it means**: TypeScript compilation or build step failed.

**How to fix**:
```bash
cd {package-path}
npm run build  # Run build to see full error
# Fix compilation errors
```

**Retriable**: ❌ No (requires code changes)

---

### Git Lock File Conflicts

```
Type: Git Lock
Details: Git lock file conflict - another git process running
```

**What it means**: Multiple packages tried to run git operations simultaneously and created lock file conflicts.

**How to fix**:
```bash
cd {package-path}
rm -f .git/index.lock  # Remove stale lock file
# Re-run with --continue
kodrdriv tree publish --parallel --continue
```

**Retriable**: ✅ Yes (will auto-retry)

---

### Dependency Errors

```
Type: Dependency Error
Details: ERESOLVE unable to resolve dependency tree
```

**What it means**: npm install failed due to dependency conflicts or corruption.

**How to fix**:
```bash
cd {package-path}
rm -rf node_modules package-lock.json
npm install  # Clean reinstall
```

**Retriable**: ✅ Yes (will auto-retry)

---

### Pull Request Conflicts

```
Type: Pr Conflict
Details: Pull request has merge conflicts
```

**What it means**: The PR created for this package has conflicts with the target branch.

**How to fix**:
1. Visit the PR URL (shown in log file)
2. Resolve conflicts (GitHub UI or locally)
3. Re-run publish:
```bash
kodrdriv tree publish --parallel --continue
```

**Retriable**: ✅ Yes (after manual conflict resolution)

---

### Git State Errors

```
Type: Git State
Details: Working directory has uncommitted changes
```

**What it means**: Package has uncommitted changes that prevent publish.

**How to fix**:
```bash
cd {package-path}
git status  # See what's uncommitted
git add . && git commit -m "description"  # Commit changes
# OR
git stash  # Stash changes temporarily
```

**Retriable**: ❌ No (requires manual intervention)

---

### Timeout Errors

```
Type: Timeout
Details: timeout waiting for PR checks
```

**What it means**: Command timed out waiting for external service (PR checks, workflows, etc.)

**How to fix**:
- Check if GitHub Actions are running
- Increase timeout if needed: `--checks-timeout 900000` (15 minutes)
- Or skip waiting: `--sendit` flag
```bash
kodrdriv tree publish --parallel --continue --checks-timeout 900000
```

**Retriable**: ✅ Yes (will auto-retry)

---

### No Changes (Not an Error)

```
Type: No Changes
Details: No changes detected - package already published
```

**What it means**: Package was already published and has no new changes.

**How to fix**: This is expected behavior. Package will be skipped.

**Retriable**: N/A (not an error)

## Recovery Commands

### Retry Everything (Including Retriable Errors)

```bash
kodrdriv tree publish --parallel --continue
```

This will:
- ✅ Skip completed packages
- ✅ Retry packages that failed with retriable errors (git locks, timeouts, etc.)
- ⊘ Skip packages with non-retriable errors (tests, coverage, build)

---

### Mark Specific Packages as Completed

If you manually fixed and published a package:

```bash
kodrdriv tree publish --parallel --continue --mark-completed "core,logging"
```

This will:
- Mark specified packages as completed in checkpoint
- Unblock their dependent packages
- Continue with remaining packages

---

### Check Parallel Execution Status

```bash
kodrdriv tree --status-parallel
```

Shows:
- Which packages completed successfully
- Which packages failed and why
- Which packages were skipped due to dependency failures
- Checkpoint information

---

### Clear Checkpoint and Start Fresh

```bash
rm output/kodrdriv/.kodrdriv-parallel-context.json*
kodrdriv tree publish --parallel
```

⚠️ **Warning**: This discards all progress and starts from scratch.

## Debugging Workflow

### Step 1: Review Error Summary

After a parallel publish fails, review the error summary printed to console:

```
❌ Failed (2):
   - @fjell/registry
   - @fjell/http-api

❌ Failure Summary:

  @fjell/registry:
    Type: Test Coverage
    Details: statements: 69.65% (threshold: 70%)
    Log: /path/to/publish_2025-12-12_19-18-55.log
    💡 Suggestion: cd /path && npm test -- --coverage
    Blocked: @fjell/cache, @fjell/providers
```

### Step 2: Check Log Files

For each failed package, read its log file:

```bash
cat /path/to/publish_2025-12-12_19-18-55.log
```

Look for:
- Full error messages
- Stack traces
- Command output
- Timestamps to identify when failure occurred

### Step 3: Categorize Errors

Determine if errors are **retriable** or **permanent**:

**Retriable** (will auto-retry):
- Git lock files (`.git/index.lock`)
- Network timeouts
- npm cache issues
- Rate limiting
- GitHub API temporary errors

**Permanent** (need manual fix):
- Test failures
- Coverage drops
- Build errors
- Merge conflicts
- Auth failures

### Step 4: Fix Permanent Errors

For non-retriable errors:

1. Navigate to package directory
2. Run suggested command from error summary
3. Fix the underlying issue (tests, coverage, etc.)
4. Verify fix works: `npm test`, `npm run build`, etc.

### Step 5: Retry

After fixing issues:

```bash
# Retry with continue (will skip completed, retry retriable)
kodrdriv tree publish --parallel --continue

# OR if you manually published some packages
kodrdriv tree publish --parallel --continue --mark-completed "pkg1,pkg2"
```

### Step 6: Verify Success

Check that:
- ✅ All packages show as completed or skipped (no changes)
- ✅ No packages in failed state
- ✅ Dependent packages published successfully
- ✅ Tags created in git
- ✅ GitHub releases created

## Tips and Best Practices

### Before Running Parallel Publish

1. **Run Branch Audit**:
   ```bash
   kodrdriv tree publish --audit-branches
   ```
   Catches branch sync issues before publish starts.

2. **Check for Uncommitted Changes**:
   ```bash
   git status
   ```
   Ensure working directory is clean.

3. **Verify All Tests Pass**:
   ```bash
   kodrdriv tree test
   ```
   Catch test failures before publish.

### During Parallel Publish

1. **Use Verbose Mode for First Run**:
   ```bash
   kodrdriv tree publish --parallel --verbose
   ```
   See detailed progress and catch issues early.

2. **Monitor Log Files in Real-Time**:
   ```bash
   tail -f {package}/output/kodrdriv/publish_*.log
   ```
   Watch a specific package's progress.

### After Failures

1. **Don't Delete Checkpoint Immediately**:
   The checkpoint preserves progress. Only delete if you want to start completely fresh.

2. **Fix One Category at a Time**:
   - First, let retriable errors auto-retry
   - Then fix test/coverage issues
   - Finally handle git/merge conflicts

3. **Use Mark-Completed Sparingly**:
   Only mark packages as completed if you manually verified they published correctly.

## Common Pitfalls

### ❌ Deleting Checkpoint Too Soon

**Problem**: Deleting checkpoint makes you lose all progress.

**Solution**: Use `--continue` to resume from checkpoint instead.

---

### ❌ Marking Failed Packages as Completed

**Problem**: Marks package as completed without actually publishing it.

**Solution**: Only use `--mark-completed` for packages you manually verified are published.

---

### ❌ Not Reading Log Files

**Problem**: Error summary is truncated, missing full context.

**Solution**: Always read the full log file for complete error details.

---

### ❌ Running in Different Directory

**Problem**: Checkpoint is project-specific, running from wrong directory creates new checkpoint.

**Solution**: Always run from same project root directory.

---

### ❌ Mixing Sequential and Parallel Modes

**Problem**: Sequential context (`.kodrdriv-context.json`) and parallel context (`.kodrdriv-parallel-context.json`) are separate.

**Solution**: Stick with one mode for a publish run, don't mix.

## Need More Help?

- Check full log files in `{package}/output/kodrdriv/`
- Review error suggestions in summary
- Verify git state: `git status`
- Check GitHub for PR/workflow status
- Use `--status-parallel` to see checkpoint state

---

**Last Updated**: 2025-12-12
**Applies to**: kodrdriv v1.2.29-dev.0 and later

