# Tree Operations Guide

Multi-package workflow automation.

## Overview

Tree operations execute commands across multiple packages in a workspace, respecting dependency order. Essential for monorepos and multi-package projects.

## Core Concept

```
Workspace
├── packages/core      (no dependencies)
├── packages/utils     (depends on core)
└── packages/ui        (depends on core, utils)

Execution order: core → utils → ui
```

Kodrdriv automatically:
1. Discovers packages
2. Analyzes dependencies
3. Determines execution order
4. Executes in topologically sorted order

## Basic Usage

### Sequential Execution

```bash
# Run command in all packages
kodrdriv tree --cmd "npm test"

# Built-in commands
kodrdriv tree commit
kodrdriv tree publish
kodrdriv tree precommit
kodrdriv tree link
kodrdriv tree unlink
```

### Parallel Execution

```bash
# Enable parallel mode
kodrdriv tree publish --parallel

# Control concurrency
kodrdriv tree publish --parallel --max-concurrency 3

# Parallel with options
kodrdriv tree precommit --parallel --max-concurrency 4
```

**Benefits**:
- Packages with no dependencies run simultaneously
- Respects dependency order
- Faster execution (2-4x speedup typical)

## Built-In Commands

### tree commit

Generate commits for all packages:

```bash
kodrdriv tree commit

# With options
kodrdriv tree commit --add --sendit

# With context
kodrdriv tree commit --context-files MIGRATION.md
```

### tree publish

Publish all packages in dependency order:

```bash
# Sequential
kodrdriv tree publish

# Parallel
kodrdriv tree publish --parallel

# With self-reflection
kodrdriv tree publish --self-reflection --context-files RELEASE.md

# Skip confirmations
kodrdriv tree publish --sendit --parallel
```

### tree precommit

Run lint + build + test across packages:

```bash
kodrdriv tree precommit

# Parallel for speed
kodrdriv tree precommit --parallel --max-concurrency 4
```

### tree link

Create local development dependencies:

```bash
# Link all packages
kodrdriv tree link

# Link specific scope
kodrdriv tree link @myorg

# With external patterns
kodrdriv tree link --externals "../external-dep"
```

### tree unlink

Restore npm dependencies:

```bash
# Unlink all
kodrdriv tree unlink

# Clean and reinstall
kodrdriv tree unlink --clean-node-modules
```

## Advanced Features

### Recovery from Failures

**If execution fails mid-way**:

```bash
# Check status
kodrdriv tree publish --status

# Resume from checkpoint
kodrdriv tree publish --continue

# Retry failed packages only
kodrdriv tree publish --retry-failed

# Skip failed packages
kodrdriv tree publish --skip-failed
```

### Manual Recovery

```bash
# Mark package as completed
kodrdriv tree publish --promote @myorg/completed-package

# Skip specific packages
kodrdriv tree publish --skip @myorg/skip-this,@myorg/and-this

# Mark multiple as completed
kodrdriv tree publish --mark-completed pkg1,pkg2,pkg3
```

### Execution Control

```bash
# Start from specific package
kodrdriv tree publish --start-from @myorg/mid-package

# Stop before specific package
kodrdriv tree publish --stop-at @myorg/last-package

# Exclude patterns
kodrdriv tree publish --exclude "**/test-*"
```

### Monitoring

```bash
# Check detailed status
kodrdriv tree publish --status-parallel

# Shows:
# - Package states (pending/running/completed/failed)
# - Timing information
# - Error details
# - Dependency relationships
```

## Parallel Execution

### How It Works

1. **Analyze Dependencies**:
```
Level 0: core, utils-a (no deps) → Run in parallel
Level 1: api (needs core) → Wait for level 0
Level 2: ui (needs api) → Wait for level 1
```

2. **Execute in Batches**:
- All packages at same level run together
- Respects maxConcurrency limit
- Proceeds to next level when ready

3. **Handle Failures**:
- Failed package stops its dependents
- Other branches continue
- Checkpoint saved for recovery

### Parallel Configuration

```yaml
tree:
  parallel: true
  maxConcurrency: 4
  retry:
    maxAttempts: 3
    initialDelayMs: 5000
    maxDelayMs: 60000
    backoffMultiplier: 2
  monitoring:
    showProgress: true
    showMetrics: true
```

### Parallel Best Practices

```bash
# Start conservative
kodrdriv tree publish --parallel --max-concurrency 2

# Increase based on system
# CPU-bound tasks: maxConcurrency = cores
# IO-bound tasks: maxConcurrency = cores * 2
# Network-bound: maxConcurrency = cores * 4

# Monitor first run
kodrdriv tree publish --parallel --max-concurrency 4 --verbose
```

## Custom Commands

### Run Arbitrary Commands

```bash
# Run npm script
kodrdriv tree --cmd "npm run build"

# Run shell command
kodrdriv tree --cmd "git status"

# Complex command
kodrdriv tree --cmd "npm test && npm run lint"
```

### Validation

Commands are validated for parallel safety:
- `commit`, `precommit`, `run` → Safe
- `publish` → Requires sequential execution per branch
- Custom → Validation performed

## Dependency Management

### Understanding Dependencies

Kodrdriv detects dependencies from:
- `package.json` dependencies
- `package.json` devDependencies
- `file:` references

### Dependency Graph

View with debug mode:
```bash
kodrdriv tree publish --debug

# Shows:
# - Package discovery
# - Dependency relationships
# - Execution order
# - Depth levels
```

### Handling Circular Dependencies

If detected:
```
Error: Circular dependency detected: A → B → C → A
```

**Solution**: Fix package.json to remove cycle.

## Checkpoint System

### How Checkpoints Work

1. **Save State**: After each package completes
2. **Store Location**: `.kodrdriv-context` file
3. **Resume**: `--continue` flag reads checkpoint

### Checkpoint Contents

```json
{
  "command": "kodrdriv publish",
  "completedPackages": ["@org/core", "@org/utils"],
  "publishedVersions": [...],
  "startTime": "2025-12-31T...",
  "lastUpdateTime": "2025-12-31T..."
}
```

### Managing Checkpoints

```bash
# View checkpoint
cat .kodrdriv-context

# Continue from checkpoint
kodrdriv tree publish --continue

# Modify checkpoint manually
# Edit .kodrdriv-context

# Clear checkpoint
rm .kodrdriv-context
```

## Filtering Packages

### By Pattern

```bash
# Exclude test packages
kodrdriv tree publish --exclude "**/test-*"

# Multiple patterns
kodrdriv tree publish --exclude "**/test-*" --exclude "**/temp-*"
```

### By Name

```bash
# Skip specific packages
kodrdriv tree publish --skip @org/experimental,@org/deprecated
```

### By Directory

```bash
# Specific directories only
kodrdriv tree publish --directories packages/core packages/ui
```

## Package Discovery

### Automatic Discovery

Kodrdriv finds packages by scanning for `package.json`:
```bash
# Default: current directory and subdirectories
kodrdriv tree publish

# Custom directories
kodrdriv tree publish --directories packages libs
```

### Package Metadata

For each package, kodrdriv tracks:
- Name (from package.json)
- Version (from package.json)
- Path (directory location)
- Dependencies (from package.json)
- Dependents (computed)

## Error Handling

### Failure Strategies

**Default (stop on error)**:
```bash
kodrdriv tree publish
# Stops at first failure
```

**Continue on error**:
```bash
kodrdriv tree publish --continue
# Continues after failure (via checkpoint)
```

**Skip failed**:
```bash
kodrdriv tree publish --skip-failed
# Marks as failed and continues
```

### Timeout Handling

For long-running operations:
```bash
kodrdriv tree publish --checks-timeout 7200000  # 2 hours
```

If timeout occurs:
1. Checkpoint saved
2. Recovery instructions provided
3. Can resume with `--continue`

## Performance Optimization

### Sequential vs Parallel

**Sequential** (safe, slower):
```bash
kodrdriv tree publish
# Time: N packages × time per package
```

**Parallel** (faster, more complex):
```bash
kodrdriv tree publish --parallel
# Time: Depth × time per batch
```

**Speedup example** (10 packages, 3 levels):
- Sequential: 10 × 5min = 50min
- Parallel (4 concurrent): 3 × 7min = 21min
- **Speedup**: 2.4x

### Concurrency Tuning

```bash
# Conservative (safe)
--max-concurrency 2

# Balanced
--max-concurrency 4

# Aggressive (fast, riskier)
--max-concurrency 8
```

Choose based on:
- System resources (CPU, memory)
- External dependencies (API rate limits)
- Command characteristics (CPU vs IO bound)

## Troubleshooting

### Package Not Found

```bash
# Check discovery
kodrdriv tree publish --debug | grep "Discovered"

# Verify package.json exists
find . -name "package.json" -not -path "*/node_modules/*"

# Check directories
kodrdriv tree publish --directories packages
```

### Wrong Execution Order

```bash
# View dependency graph
kodrdriv tree publish --debug

# Check package.json dependencies
# Ensure file: deps are correct
```

### Parallel Execution Fails

```bash
# Check detailed status
kodrdriv tree publish --status-parallel

# Reduce concurrency
kodrdriv tree publish --parallel --max-concurrency 2

# Use sequential
kodrdriv tree publish
```

### Recovery Issues

```bash
# Check checkpoint
cat .kodrdriv-context

# Validate state
kodrdriv tree publish --validate-state

# Reset if corrupted
rm .kodrdriv-context
kodrdriv tree publish
```

## Real-World Examples

### Example 1: Full Monorepo Publish

```bash
# 1. Link for development
kodrdriv tree link

# 2. Make changes across packages

# 3. Run checks
kodrdriv tree precommit --parallel

# 4. Commit all
kodrdriv tree commit --add

# 5. Publish with context
kodrdriv tree publish \
  --parallel \
  --context-files MIGRATION.md \
  --self-reflection

# 6. Unlink after publish
kodrdriv tree unlink
```

### Example 2: Selective Publish

```bash
# Publish core and utils only
kodrdriv tree publish \
  --start-from @org/core \
  --stop-at @org/api \
  --parallel
```

### Example 3: Recovery from Timeout

```bash
# Publish starts
kodrdriv tree publish --parallel

# Timeout occurs at package 5

# Check status
kodrdriv tree publish --status-parallel

# Manual intervention
cd packages/package-5
kodrdriv publish --sendit
cd ../..

# Resume tree
kodrdriv tree publish --continue
```

## Advanced Configuration

```yaml
tree:
  # Target specific packages
  directories:
    - packages/core
    - packages/api

  # Parallel execution
  parallel: true
  maxConcurrency: 3

  # Exclude patterns
  exclude:
    - "**/deprecated-*"
    - "**/experimental-*"

  # Retry configuration
  retry:
    maxAttempts: 3
    initialDelayMs: 5000
    maxDelayMs: 60000
    backoffMultiplier: 2
    retriableErrors:
      - "ETIMEDOUT"
      - "ECONNRESET"

  # Recovery
  recovery:
    checkpointInterval: package
    autoRetry: true
    continueOnError: false

  # Monitoring
  monitoring:
    showProgress: true
    showMetrics: true
    logLevel: normal
```

## Implementation Details

See comprehensive documentation:
- `TREE-TOOLKIT-COMPLETE.md` - Complete extraction story
- `PARALLEL-PUBLISH-QUICK-REFERENCE.md` - Parallel execution
- `CHECKPOINT-RECOVERY-FIX.md` - Recovery mechanisms
- `PARALLEL-PUBLISH-DEBUGGING-GUIDE.md` - Troubleshooting

## Next Steps

- **[Monorepo Guide](./monorepo.md)** - Monorepo-specific patterns
- **[Commands Reference](./commands.md)** - Tree command details
- **[Debugging Guide](./debugging.md)** - Troubleshoot tree issues
- **[Architecture Guide](./architecture.md)** - Tree system design

Tree operations make managing multi-package projects simple and efficient!

