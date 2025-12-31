# Configuration Guide

Complete configuration reference for kodrdriv.

For detailed documentation, see: [`docs/public/configuration.md`](../docs/public/configuration.md)

## Configuration Hierarchy

Settings merge in order (highest priority first):

1. **CLI Arguments** - `--model gpt-4o`
2. **Config Files** - `.kodrdriv/config.yaml`
3. **Defaults** - Built-in defaults

## Configuration Files

### Location Priority

1. `.kodrdriv/` in current directory (project config)
2. `~/.kodrdriv/` in home directory (user config)
3. Built-in defaults

### Supported Formats

- **YAML**: `.kodrdriv/config.yaml` (recommended)
- **JSON**: `.kodrdriv/config.json`
- **JavaScript**: `.kodrdriv/config.js`

## Configuration Schema

### Global Options

```yaml
# AI Model Configuration
model: gpt-4o                    # or gpt-4o-mini
openaiReasoning: medium          # low | medium | high
openaiMaxOutputTokens: 4096

# Output Settings
outputDirectory: output
preferencesDirectory: ~/.kodrdriv

# Context Settings
contextDirectories:
  - src
  - docs

# Logging
verbose: false
debug: false
dryRun: false

# Advanced
overrides: true
excludedPatterns:
  - "**/node_modules/**"
  - "**/dist/**"
```

### Commit Configuration

```yaml
commit:
  # Behavior
  add: false                     # Auto-stage changes
  cached: true                   # Use staged changes
  sendit: false                  # Auto-commit
  interactive: false             # Interactive review
  amend: false                   # Amend last commit
  push: false                    # Push after commit

  # AI Settings
  maxAgenticIterations: 10       # Analysis depth
  allowCommitSplitting: false    # Suggest splits
  toolTimeout: 10000             # Tool timeout (ms)
  selfReflection: false          # Generate reports

  # Context
  context: ""                    # Additional context
  contextFiles: []               # Context file paths
  direction: ""                  # User guidance

  # Limits
  messageLimit: 10               # Recent commits to include
  maxDiffBytes: 20480            # Max diff size per file
  skipFileCheck: false           # Skip file: dep check

  # Model Overrides
  model: ""                      # Override global model
  openaiReasoning: ""            # Override reasoning level
  openaiMaxOutputTokens: 0       # Override max tokens
```

### Release Configuration

```yaml
release:
  # References
  from: ""                       # Start ref (default: last tag)
  to: "HEAD"                     # End ref

  # AI Settings
  maxAgenticIterations: 30       # Analysis depth
  selfReflection: false          # Generate reports

  # Behavior
  interactive: false             # Interactive review
  noMilestones: false            # Disable milestones
  fromMain: false                # Compare against main

  # Context
  context: ""                    # Additional context
  contextFiles: []               # Context file paths
  focus: ""                      # Release focus/emphasis

  # Limits
  messageLimit: 20               # Commits to include
  maxDiffBytes: 20480            # Max diff size

  # Model Overrides
  model: ""
  openaiReasoning: ""
  openaiMaxOutputTokens: 0
```

### Publish Configuration

```yaml
publish:
  # GitHub Settings
  targetBranch: main             # Target branch
  mergeMethod: squash            # merge | squash | rebase

  # Behavior
  sendit: false                  # Skip confirmations
  interactive: false             # Review notes
  syncTarget: false              # Auto-sync target

  # Checks
  checksTimeout: 3600000         # PR checks timeout (ms)
  skipUserConfirmation: false    # Skip timeout prompt
  waitForReleaseWorkflows: true  # Wait for release workflows
  releaseWorkflowsTimeout: 1800000  # Workflow timeout (ms)
  releaseWorkflowNames: []       # Specific workflows to wait for

  # Version Management
  targetVersion: patch           # patch | minor | major | X.Y.Z
  skipAlreadyPublished: false    # Skip if already published
  forceRepublish: false          # Delete tag and republish

  # Dependencies
  linkWorkspacePackages: true    # Link before publish
  unlinkWorkspacePackages: true  # Unlink after publish
  updateDeps: ""                 # Update scope (e.g., @myorg)

  # Advanced
  noMilestones: false            # Disable milestones
  requiredEnvVars:               # Required env vars
    - GITHUB_TOKEN
    - OPENAI_API_KEY
```

### Tree Configuration

```yaml
tree:
  # Directories
  directories:
    - packages/core
    - packages/ui

  # Execution
  parallel: false                # Enable parallel execution
  maxConcurrency: 4              # Max parallel packages

  # Filtering
  exclude:                       # Exclude patterns
    - "**/test-*"
  startFrom: ""                  # Start from package
  stopAt: ""                     # Stop at package

  # Recovery
  continue: false                # Continue from checkpoint
  retryFailed: false             # Retry failed packages
  skipFailed: false              # Skip failed packages
  markCompleted: []              # Mark as completed
  skipPackages: []               # Skip packages

  # Monitoring
  monitoring:
    showProgress: true
    showMetrics: true
    logLevel: normal             # minimal | normal | verbose

  # Retry Configuration
  retry:
    maxAttempts: 3
    initialDelayMs: 5000
    maxDelayMs: 60000
    backoffMultiplier: 2
```

## Configuration Examples

### Minimal (Defaults)

```yaml
model: gpt-4o-mini
```

### Standard Development

```yaml
model: gpt-4o
outputDirectory: output

commit:
  sendit: false
  selfReflection: true

release:
  selfReflection: true
  focus: "user-facing changes and breaking changes"
```

### Automated CI/CD

```yaml
model: gpt-4o
outputDirectory: output

commit:
  sendit: true
  add: true
  selfReflection: false

release:
  interactive: false
  noMilestones: false

publish:
  sendit: true
  skipUserConfirmation: true
  targetBranch: main
```

### Monorepo

```yaml
model: gpt-4o
outputDirectory: output

tree:
  directories:
    - packages/core
    - packages/ui
    - packages/utils
  parallel: true
  maxConcurrency: 3
  retry:
    maxAttempts: 3
  monitoring:
    showProgress: true
    showMetrics: true

commit:
  selfReflection: true

release:
  selfReflection: true
  maxAgenticIterations: 35
```

### High Quality, Cost-Effective

```yaml
# Use best model for releases, cheaper for commits
model: gpt-4o-mini              # Global default

commit:
  maxAgenticIterations: 8        # Efficient
  selfReflection: false          # Save tokens

release:
  model: gpt-4o                  # Override for quality
  maxAgenticIterations: 40
  selfReflection: true
  contextFiles:
    - CHANGELOG.md
```

## Environment Variables

```bash
# Required
export OPENAI_API_KEY="sk-..."

# For publish command
export GITHUB_TOKEN="ghp-..."

# Optional: Custom config path
export KODRDRIV_CONFIG=".kodrdriv/config.prod.yaml"
```

## Configuration Validation

### Check Configuration

```bash
# Show merged configuration
kodrdriv --check-config

# Show with source priority
kodrdriv --check-config --verbose

# Check specific command
kodrdriv commit --dry-run --verbose
```

### Initialize Configuration

```bash
# Create default config
kodrdriv --init-config

# Creates:
# - .kodrdriv/config.yaml
# - .kodrdriv/personas/ (empty)
# - .kodrdriv/instructions/ (empty)
```

## Per-Command Overrides

Override global settings per command:

```yaml
# Global: cheap and fast
model: gpt-4o-mini
openaiReasoning: low

# But for releases: quality matters
release:
  model: gpt-4o
  openaiReasoning: high
  maxAgenticIterations: 50

# And for reviews: balanced
review:
  model: gpt-4o
  openaiReasoning: medium
```

## Advanced Configuration

### Stop-Context Filtering

Automatically remove sensitive information:

```yaml
stopContext:
  enabled: true
  caseSensitive: false
  warnOnFilter: true
  replacement: "[REDACTED]"

  # Simple strings
  strings:
    - "internal-api-key"
    - "secret-token"

  # Regex patterns
  patterns:
    - regex: "sk-[a-zA-Z0-9]{48}"
      description: "OpenAI API keys"
    - regex: "ghp_[a-zA-Z0-9]{36}"
      description: "GitHub tokens"
```

### Branch-Specific Versioning

```yaml
branches:
  develop:
    targetBranch: main
    developmentBranch: true
    version:
      type: prerelease
      tag: dev

  staging:
    targetBranch: main
    version:
      type: prerelease
      tag: rc
```

### Custom Scope Roots

For link/unlink with multiple scopes:

```yaml
link:
  scopeRoots:
    "@myorg": "../packages"
    "@external": "../../external-deps"
```

## Configuration Patterns

### Pattern 1: Safety First

```yaml
commit:
  sendit: false               # Manual review
  skipFileCheck: false        # Check for file: deps

publish:
  sendit: false               # Manual approval
  interactive: true           # Review notes
  skipUserConfirmation: false # Confirm timeouts
```

### Pattern 2: Speed Optimized

```yaml
model: gpt-4o-mini

commit:
  maxAgenticIterations: 6
  messageLimit: 5

release:
  maxAgenticIterations: 20
  messageLimit: 10
```

### Pattern 3: Quality Optimized

```yaml
model: gpt-4o
openaiReasoning: high

commit:
  selfReflection: true
  maxAgenticIterations: 15

release:
  selfReflection: true
  maxAgenticIterations: 50
  contextFiles:
    - CHANGELOG.md
    - ARCHITECTURE.md
```

## Troubleshooting Configuration

### Config Not Loading

```bash
# Check file exists
ls -la .kodrdriv/

# Validate YAML syntax
cat .kodrdriv/config.yaml

# Check merged config
kodrdriv --check-config
```

### Settings Being Ignored

```bash
# Check priority (CLI > file > defaults)
kodrdriv commit --model gpt-4o --check-config

# Verify field names match exactly
# (configuration file keys match CLI names)
```

### Validation Errors

```bash
# Use --check-config to validate
kodrdriv --check-config

# Common issues:
# - Typos in field names
# - Wrong data types (string vs number)
# - Invalid enum values (model names)
```

## Next Steps

- **[Usage Guide](./usage.md)** - Apply configuration in workflows
- **[Commands Reference](./commands.md)** - Command-specific options
- **[Debugging Guide](./debugging.md)** - Troubleshoot config issues
- **[Full Configuration Docs](../docs/public/configuration.md)** - Complete reference

## Configuration Checklist

When setting up kodrdriv:

- [ ] Set OPENAI_API_KEY
- [ ] Set GITHUB_TOKEN (if using publish)
- [ ] Run `kodrdriv --init-config`
- [ ] Edit `.kodrdriv/config.yaml`
- [ ] Test with `kodrdriv commit --dry-run`
- [ ] Verify with `kodrdriv --check-config`
- [ ] Customize for your workflow
- [ ] Document team conventions

Your configuration is the foundation of a great kodrdriv experience!

