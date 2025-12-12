# Parallel Publish Quick Reference Guide

## 🚨 When Parallel Publish Fails

### Scenario 1: Target Branch Out of Sync

**Error**: `❌ Target branch 'main' is not in sync with remote`

**Solution**:
```bash
# Run audit to see which packages have sync issues
kodrdriv tree publish --audit-branches

# Follow the "SYNC TARGET BRANCHES" instructions, e.g.:
cd ~/gitw/getfjell/logging
git checkout main
git reset --hard origin/main  # or git pull origin main if can fast-forward
git checkout working

# Repeat for each package with sync issues
# Then retry publish
kodrdriv tree publish --parallel --model "gpt-5-mini"
```

---

### Scenario 2: npm Install Race Condition

**Error**: `npm error code ENOTEMPTY` or `directory not empty` during parallel publish

**Solution**:
```bash
# Clean and reinstall in the affected package
cd ~/gitw/getfjell/<failed-package>
rm -rf node_modules
npm install
git add package-lock.json
git commit -m "Fix lockfile after npm install"
git push origin working

# Then publish with dependency updates
kodrdriv publish --update-deps @fjell --model "gpt-5-mini"
```

---

### Scenario 3: Package Failed, Need to Publish Manually

**⚠️ CRITICAL**: Don't just run `kodrdriv publish` - it will skip dependency updates!

**Wrong**:
```bash
cd ~/gitw/getfjell/cache
kodrdriv publish --model "gpt-5-mini"
# ❌ Publishes with OLD dependency versions
```

**Correct**:
```bash
cd ~/gitw/getfjell/cache
kodrdriv publish --update-deps @fjell --model "gpt-5-mini"
# ✅ Updates dependencies, then publishes
```

---

### Scenario 4: Multiple Packages Failed

**Option A**: Update all dependencies, then retry
```bash
cd ~/gitw/getfjell
kodrdriv tree updates --inter-project @fjell
kodrdriv tree publish --continue
```

**Option B**: Fall back to serial mode
```bash
cd ~/gitw/getfjell
kodrdriv tree publish --model "gpt-5-mini"
# Slow but reliable
```

---

## 🔍 Pre-Flight Checklist

Before running parallel publish:

```bash
# 1. Run enhanced audit
kodrdriv tree publish --audit-branches

# 2. Check for critical issues:
#    - 🚨 Target branch sync issues
#    - ⚠️  Merge conflicts
#    - 📋 Existing PRs
#    - ⚠️  Version consistency issues

# 3. Fix all issues (follow audit output)

# 4. Re-run audit to verify
kodrdriv tree publish --audit-branches
# Should show: "✅ All X package(s) are in good state!"

# 5. Run parallel publish
kodrdriv tree publish --parallel --model "gpt-5-mini"
```

---

## 📋 New Commands Reference

### Update Inter-Project Dependencies

```bash
# Update dependencies in current package
kodrdriv updates --inter-project @fjell

# Update dependencies across all packages in tree
kodrdriv tree updates --inter-project @fjell

# Publish with dependency update
kodrdriv publish --update-deps @fjell --model "gpt-5-mini"
```

### Enhanced Audit

```bash
# Run comprehensive audit (now includes target branch sync check)
kodrdriv tree publish --audit-branches

# Audit output now shows:
# - ✅ Good State packages
# - 🚨 Target Branch Sync Issues (NEW)
# - ⚠️  Version Issues
# - 🚨 CRITICAL ISSUES (conflicts, PRs, sync)
# - 📝 RECOMMENDED WORKFLOW (step-by-step fixes)
```

---

## 🎯 Recommended Workflow

### For Clean Releases (No Issues)

```bash
cd ~/gitw/getfjell

# 1. Audit
kodrdriv tree publish --audit-branches

# 2. Parallel publish
kodrdriv tree publish --parallel --model "gpt-5-mini"
```

### For Releases with Issues

```bash
cd ~/gitw/getfjell

# 1. Audit
kodrdriv tree publish --audit-branches

# 2. Fix issues (follow numbered steps in audit output)
# Priority order:
#   1️⃣ SYNC TARGET BRANCHES (most critical)
#   2️⃣ RESOLVE MERGE CONFLICTS
#   3️⃣ FIX VERSION ISSUES
#   4️⃣ SYNC WITH REMOTE
#   5️⃣ PUSH LOCAL COMMITS

# 3. Re-audit to verify
kodrdriv tree publish --audit-branches

# 4. Parallel publish
kodrdriv tree publish --parallel --model "gpt-5-mini"
```

### Recovery from Failed Parallel Publish

```bash
cd ~/gitw/getfjell

# Option 1: Update all deps and retry
kodrdriv tree updates --inter-project @fjell
kodrdriv tree publish --continue

# Option 2: Manual publish with dep updates
cd <failed-package>
kodrdriv publish --update-deps @fjell --model "gpt-5-mini"

# Option 3: Serial fallback
kodrdriv tree publish --model "gpt-5-mini"
```

---

## 🔧 Troubleshooting

### "All packages in good state" but parallel publish still fails

This shouldn't happen with the new audit, but if it does:

1. Check if main branches are EXACTLY in sync:
   ```bash
   cd <package>
   git fetch origin
   git rev-parse main
   git rev-parse origin/main
   # These should match exactly
   ```

2. If they don't match:
   ```bash
   git checkout main
   git reset --hard origin/main
   git checkout working
   ```

### Checkpoint shows old failures after manual fix

```bash
# Mark packages as completed
kodrdriv tree publish --continue --mark-completed "pkg1,pkg2"

# Or reset checkpoint and start fresh
rm .kodrdriv-checkpoint.json
kodrdriv tree publish --parallel --model "gpt-5-mini"
```

### Package published but checkpoint still shows failure

This is a known issue. Workarounds:

```bash
# Option 1: Mark as completed
kodrdriv tree publish --continue --mark-completed "<package-name>"

# Option 2: Skip and continue
kodrdriv tree publish --continue --skip-packages "<package-name>"
```

---

## ⚡ Performance Tips

### Speed Up Audit

```bash
# Audit is now ~2-3 seconds slower per package due to target branch sync check
# For large repos (50+ packages), this adds ~2-3 minutes
# This is acceptable given the failures it prevents
```

### Speed Up Parallel Publish

```bash
# Pre-build all packages first (avoids build races)
kodrdriv tree run "npm run build"

# Then publish without build
kodrdriv tree publish --parallel --model "gpt-5-mini"
```

### When to Use Serial Mode

Use serial mode (`kodrdriv tree publish`) when:
- Critical production release (can't afford failures)
- First time publishing a new monorepo
- Packages have complex interdependencies
- You don't have time to babysit parallel mode

Use parallel mode when:
- Development/testing releases
- Packages are mostly independent
- You're available to handle failures
- Time savings matter (30-60 min vs 60-120 min)

---

## 📊 Success Indicators

### Audit Should Show

```
╔══════════════════════════════════════════════════════════════╗
║  Branch State Audit (16 packages)
║  All packages on: working
╠══════════════════════════════════════════════════════════════╣

✅ Good State (16 packages):
   @fjell/logging (v4.4.65-dev.0)
   @fjell/common-config (v1.1.38-dev.0)
   ...

✅ All 16 package(s) are in good state!
```

### Parallel Publish Should Complete

```
📦 Executing 16 packages in parallel

[1/16] ✅ @fjell/logging
[2/16] ✅ @fjell/common-config
...
[16/16] ✅ @fjell/sample-app

✨ Parallel execution completed in 45s

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Publish Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Published (16):
   - @fjell/logging
   - @fjell/common-config
   ...

Total time: 45s
Success rate: 100% (16/16 packages processed)
Peak concurrency: 4 packages
```

---

## 🆘 When All Else Fails

```bash
# Nuclear option: Reset everything and use serial mode
cd ~/gitw/getfjell

# 1. Sync all main branches
for dir in */; do
  cd "$dir"
  git checkout main
  git reset --hard origin/main
  git checkout working
  cd ..
done

# 2. Update all dependencies
kodrdriv tree updates --inter-project @fjell

# 3. Serial publish (slow but reliable)
kodrdriv tree publish --model "gpt-5-mini"
```

---

## 📞 Getting Help

If you encounter issues not covered here:

1. Run audit with verbose output:
   ```bash
   kodrdriv tree publish --audit-branches --verbose
   ```

2. Check the checkpoint file:
   ```bash
   cat .kodrdriv-checkpoint.json | jq
   ```

3. Review the implementation report:
   ```bash
   cat PARALLEL-PUBLISH-FIXES-IMPLEMENTED.md
   ```

4. File an issue with:
   - Audit output
   - Error messages
   - Checkpoint state
   - Steps to reproduce

