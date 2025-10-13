# Development Command

Navigate to your active development branch for coding work:

```bash
kodrdriv development
```

The `development` command provides intelligent navigation to your active development branch from anywhere in your workflow. It automatically detects your configured development branch and handles version synchronization when needed.

## What It Does

The development command intelligently navigates you to your active development branch from anywhere in your workflow:

1. **Branch Detection**: Automatically finds your configured development branch
2. **Smart Navigation**: Takes you to the development branch from any current location
3. **Version Synchronization**: When coming from deployment branches, syncs versions if they have the same prerelease tag
4. **Branch Creation**: Creates the development branch if it doesn't exist

## Behavior Based on Current Branch

### From Main or Test Branches
- Simply checks out your development branch (usually `working`)
- Creates the development branch if it doesn't exist

### From Development Branch (deployment)
- Checks if development and working branches have the same prerelease tag
- If same tag: syncs working branch version to match development
- If different tags: no version sync needed
- Then switches to working branch

### Already on Development Branch
- Does nothing, you're already where you need to be

## Configuration

Set up your development branch in `.kodrdriv/config.yaml`:

```yaml
targets:
  working:
    targetBranch: "development"
    developmentBranch: true  # Mark this as your active development branch
    version:
      type: "prerelease"
      increment: true
      tag: "dev"
  development:
    targetBranch: "test"
    version:
      type: "prerelease"
      increment: true
      tag: "test"
  test:
    targetBranch: "main"
    version:
      type: "release"
```

## Examples

```bash
# Navigate to development branch from any location
git checkout main          # or test, or development
kodrdriv development      # Takes you to your configured development branch

# From different branches
git checkout test
kodrdriv development      # → working

git checkout development
kodrdriv development      # → working (with version sync if same prerelease tag)

git checkout main
kodrdriv development      # → working

# Dry run to see what would happen
kodrdriv development --dry-run
```

## How It Finds Your Development Branch

1. **Configured Branch**: Looks for the branch marked with `developmentBranch: true` in your `targets` configuration
2. **Default Fallback**: Uses `working` if no development branch is configured
3. **Smart Detection**: Automatically handles branch creation if needed

## Integration with Branch Targeting

The development command works seamlessly with your branch targeting configuration:

```yaml
targets:
  working:
    targetBranch: "development"
    developmentBranch: true      # ← This tells development command where to go
    version:
      type: "prerelease"
      increment: true
      tag: "dev"
```

## Use Cases

### Quick Development Navigation
```bash
# From anywhere in your workflow
git checkout test           # You're reviewing test deployment
kodrdriv development       # → working (ready for coding)
```

### Version Synchronization
```bash
# After publishing to development branch
git checkout development    # Version: 1.2.3-dev.5
kodrdriv development       # → working with version: 1.2.3-dev.5 (synced)
```

### Cross-Package Development Setup
```bash
# Set up development environment across entire workspace
kodrdriv tree development
# Each package navigates to its configured development branch
```

This streamlined approach focuses on getting you to the right place for development work, rather than complex version management setup.
