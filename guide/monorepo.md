# Monorepo Guide

Complete guide to using kodrdriv in monorepo projects.

## Monorepo Support

Kodrdriv is designed for monorepos with:
- Multiple packages with interdependencies
- Shared configuration across packages
- Coordinated releases
- Parallel execution where possible

## Quick Start for Monorepos

### 1. Setup

```bash
# Install kodrdriv in root
npm install -g @eldrforge/kodrdriv

# Configure for monorepo
kodrdriv --init-config
```

### 2. Configure Tree

```yaml
# .kodrdriv/config.yaml
tree:
  directories:
    - packages/core
    - packages/utils
    - packages/api
    - packages/ui
  parallel: true
  maxConcurrency: 4
```

### 3. Development Workflow

```bash
# Link packages for local development
kodrdriv tree link

# Develop...

# Run checks
kodrdriv tree precommit --parallel

# Commit
kodrdriv tree commit

# Publish
kodrdriv tree publish --parallel
```

## Typical Monorepo Structure

```
my-monorepo/
├── package.json              # Root package
├── .kodrdriv/
│   └── config.yaml           # Shared configuration
├── packages/
│   ├── core/
│   │   ├── package.json      # "@org/core"
│   │   └── src/
│   ├── utils/
│   │   ├── package.json      # "@org/utils" (depends on core)
│   │   └── src/
│   ├── api/
│   │   ├── package.json      # "@org/api" (depends on core, utils)
│   │   └── src/
│   └── ui/
│       ├── package.json      # "@org/ui" (depends on all)
│       └── src/
└── output/                   # Shared output directory
```

## Development Workflows

### Daily Development with Linking

```bash
# One-time setup: Link all packages
kodrdriv tree link

# Develop normally - changes reflected immediately
cd packages/core
# ... edit files ...
cd ../utils
# ... use updated core ...

# Run checks across all packages
kodrdriv tree precommit --parallel

# Commit when ready
kodrdriv tree commit --add --sendit

# When done with feature: Unlink
kodrdriv tree unlink
```

**Benefits**:
- Instant updates across packages
- No build/publish cycle for testing
- Real-time integration testing

### Coordinated Releases

```bash
# Check what needs releasing
kodrdriv tree publish --dry-run

# Generate release notes for all
kodrdriv tree publish --context-files RELEASE-NOTES.md --dry-run

# Publish with review
kodrdriv tree publish --interactive

# Automated publish
kodrdriv tree publish --sendit --parallel
```

### Dependency Updates

```bash
# Update inter-project dependencies
kodrdriv updates --inter-project @org

# Update external dependencies in all packages
kodrdriv tree --cmd "npm update"

# Update specific scope across all
kodrdriv updates @external-scope
```

## Package Dependency Patterns

### Independent Packages

```
core (v1.0.0)    utils (v1.0.0)
  ↓                ↓
No dependencies between them
→ Can publish in parallel
```

```bash
kodrdriv tree publish --parallel --max-concurrency 2
# Both publish simultaneously
```

### Linear Dependencies

```
core (v1.0.0)
  ↓ depends on
utils (v1.0.0)
  ↓ depends on
api (v1.0.0)
```

```bash
kodrdriv tree publish
# Publishes: core → utils → api (sequential)
```

### Diamond Dependencies

```
      core
     ↙    ↘
  utils   api
     ↘    ↙
      ui
```

```bash
kodrdriv tree publish --parallel --max-concurrency 2
# Level 0: core
# Level 1: utils, api (parallel)
# Level 2: ui
```

## Version Management

### Synchronized Versions

All packages share same version:

```yaml
# Each package.json
{
  "version": "1.0.0"
}
```

```bash
# Bump all together
kodrdriv tree --cmd "npm version patch"
```

### Independent Versions

Each package has its own version:

```bash
# Publish updates only changed packages
kodrdriv tree publish --skip-already-published
```

### Inter-Project Dependencies

Update dependencies before publish:

```bash
# Update all @org dependencies
kodrdriv tree publish --update-deps @org
```

Automatically updates `package.json` dependencies to latest versions.

## Configuration Strategies

### Shared Configuration

Root `.kodrdriv/config.yaml` applies to all packages:

```yaml
model: gpt-4o
outputDirectory: output

commit:
  selfReflection: true

tree:
  directories:
    - packages/core
    - packages/api
    - packages/ui
  parallel: true
```

### Per-Package Configuration

Override in individual packages:

```yaml
# packages/core/.kodrdriv/config.yaml
commit:
  maxAgenticIterations: 15    # More thorough for core

release:
  focus: "API changes and breaking changes"
```

## Workflow Examples

### Example 1: Feature Development

```bash
# Day 1: Start feature
git checkout -b feature/new-auth
kodrdriv tree link

# Work on packages
cd packages/core
# ... implement core auth ...
cd ../api
# ... add API endpoints ...
cd ../ui
# ... add UI components ...

# Day 2: Testing
kodrdriv tree precommit --parallel

# Day 3: Commit
cd ../..  # Back to root
kodrdriv tree commit --context-files FEATURE-NOTES.md

# Day 4: PR
git push origin feature/new-auth
```

### Example 2: Release Cycle

```bash
# Week 1-4: Development with commits
kodrdriv tree link
# ... develop ...
kodrdriv tree commit --add --sendit

# Week 5: Prepare release
kodrdriv tree unlink
kodrdriv tree precommit --parallel

# Generate notes
kodrdriv tree publish --dry-run --context-files CHANGELOG.md

# Publish
kodrdriv tree publish --parallel --interactive
```

### Example 3: Hotfix

```bash
# Create hotfix branch
git checkout -b hotfix/security main

# Fix in affected package
cd packages/core
# ... fix security issue ...

# Quick commit
cd ../..
kodrdriv commit --sendit

# Publish just core
cd packages/core
kodrdriv publish --target-version patch --sendit

# Or publish tree with skip
cd ../..
kodrdriv tree publish --start-from @org/core --stop-at @org/api
```

## Dependency Scenarios

### Scenario 1: New Package

```bash
# Add new package
mkdir packages/new-package
cd packages/new-package
npm init -y

# Add dependencies
npm install @org/core

# Link in monorepo
cd ../..
kodrdriv tree link
```

### Scenario 2: Remove Package

```bash
# Remove from tree config
# Edit .kodrdriv/config.yaml, remove from directories

# Unpublish from npm (careful!)
npm unpublish @org/removed-package

# Remove directory
rm -rf packages/removed-package
```

### Scenario 3: Circular Dependency

**Problem**:
```
core → utils → core  # Circular!
```

**Solution**: Restructure to break cycle:
```
core → utils
shared ← (both depend on shared)
```

## Best Practices

### 1. Use Link for Development

```bash
# Start of day
kodrdriv tree link

# End of day (before publish)
kodrdriv tree unlink
```

### 2. Run Precommit Often

```bash
# Before commits
kodrdriv tree precommit --parallel

# Catches issues early
```

### 3. Use Parallel for Speed

```bash
# For IO-bound operations
kodrdriv tree precommit --parallel --max-concurrency 4

# For CPU-bound
kodrdriv tree --cmd "npm run build" --parallel --max-concurrency 2
```

### 4. Enable Checkpoints

Automatic for `publish` and `run` commands. Use `--continue` to resume.

### 5. Context Files for Releases

```bash
# Provide migration context
kodrdriv tree publish --context-files MIGRATION.md BREAKING-CHANGES.md
```

## Monorepo Tools Comparison

| Feature | Lerna | nx | Rush | kodrdriv |
|---------|-------|----|----|----------|
| Dependency analysis | ✅ | ✅ | ✅ | ✅ |
| Parallel execution | ✅ | ✅ | ✅ | ✅ |
| AI commit messages | ❌ | ❌ | ❌ | ✅ |
| AI release notes | ❌ | ❌ | ❌ | ✅ |
| Full publish workflow | ❌ | ❌ | ❌ | ✅ |
| Recovery/checkpoints | ❌ | ❌ | ❌ | ✅ |

## Advanced Patterns

### Pattern 1: Staged Releases

```bash
# Week 1: Release core
kodrdriv publish
cd packages/core
kodrdriv publish --sendit

# Week 2: Release dependents
kodrdriv tree publish --start-from @org/utils
```

### Pattern 2: Selective Updates

```bash
# Update only changed packages
kodrdriv tree publish \
  --skip-already-published \
  --parallel
```

### Pattern 3: Branch-Based Versioning

```yaml
branches:
  develop:
    targetBranch: main
    version:
      type: prerelease
      tag: dev

  staging:
    targetBranch: main
    version:
      type: prerelease
      tag: rc
```

```bash
# On develop: publishes 1.0.0-dev.0
kodrdriv tree publish

# On staging: publishes 1.0.0-rc.0
kodrdriv tree publish
```

## Troubleshooting Monorepos

### Issue: Package Not Publishing

**Check**:
```bash
# Verify package is in tree
kodrdriv tree publish --dry-run --verbose

# Check version
cd packages/problem-package
npm version

# Check if already published
npm view @org/problem-package versions
```

### Issue: Dependency Resolution

**Check**:
```bash
# View dependency graph
kodrdriv tree publish --debug | grep -A 20 "Dependency"

# Verify package.json
cat packages/*/package.json | grep -A 3 dependencies
```

### Issue: Parallel Deadlock

**Symptoms**: Parallel execution hangs

**Solution**:
```bash
# Check status
kodrdriv tree publish --status-parallel

# Kill and restart with sequential
kodrdriv tree publish
```

## Documentation References

Comprehensive guides in root directory:
- `TREE-TOOLKIT-COMPLETE.md` - Tree system implementation
- `MONOREPO-PUBLISH-IMPROVEMENTS.md` - Monorepo workflows
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Troubleshooting
- `CHECKPOINT-RECOVERY-FIX.md` - Recovery system

## Next Steps

- **[Tree Operations Guide](./tree-operations.md)** - Tree command details
- **[Configuration Guide](./configuration.md)** - Tree configuration
- **[Debugging Guide](./debugging.md)** - Troubleshoot tree issues
- **[Architecture Guide](./architecture.md)** - System design

Kodrdriv makes monorepo management straightforward and automated!




