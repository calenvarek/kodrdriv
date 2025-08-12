# Development Command

Manage transition from main to working branch with development version setup:

```bash
kodrdriv development
```

The `development` command streamlines the workflow of moving from the main branch to a working branch while setting up proper development versioning. It automates the common pattern of switching to a development branch, merging latest changes, and bumping to a development version.

## What It Does

The development command handles several automated workflows depending on your current state:

1. **Branch Management**: Creates or switches to the `working` branch
2. **Synchronization**: Merges main branch changes into working branch
3. **Version Bumping**: Increments to the next development prerelease version
4. **Lock File Updates**: Runs `npm install` to update package lock files
5. **Milestone Management**: Creates and manages GitHub milestones for the target version
6. **Automated Commit**: Uses `kodrdriv commit` to commit the development setup changes

## Behavior Based on Current State

### Starting from Main Branch
- Switches to `working` branch (creates if needed)
- Merges `main` into `working`
- Bumps version to development prerelease (e.g., `1.2.3` → `1.2.4-dev.0`)
- Commits changes

### Starting from Working Branch
- Checks if working branch needs updates from main
- Merges main if needed
- Bumps version if not already at proper development version
- Commits changes

### Working Branch Doesn't Exist
- Creates `working` branch from current `main`
- Sets up development version
- Commits initial development setup

## Command Options

- `--target-version <targetVersion>`: Specify version bump type or explicit version (default: 'patch')
  - **Semantic bumps**: Use "patch", "minor", or "major" for automatic version increments
  - **Explicit version**: Provide a specific version number (e.g., "2.1.0")
  - **Examples**:
    - `patch`: `1.2.3` → `1.2.4-dev.0`
    - `minor`: `1.2.3` → `1.3.0-dev.0`
    - `major`: `1.2.3` → `2.0.0-dev.0`
    - `2.5.0`: `1.2.3` → `2.5.0-dev.0`
- `--no-milestones`: Disable GitHub milestone integration
  - Skips automatic creation and management of GitHub milestones
  - Useful when working in repositories without GitHub milestone workflows

## Examples

```bash
# Basic development setup (patch bump)
kodrdriv development

# Minor version development bump
kodrdriv development --target-version minor

# Major version development bump
kodrdriv development --target-version major

# Explicit version development setup
kodrdriv development --target-version 2.1.0

# Development setup without milestone management
kodrdriv development --no-milestones

# Dry run to see what would happen
kodrdriv development --dry-run
```

## GitHub Milestone Integration

When milestone integration is enabled (default), the development command:

1. **Creates Target Milestone**: Creates a milestone for the base version (e.g., `release/1.2.4` for `1.2.4-dev.0`)
2. **Migrates Issues**: Moves open issues from the previous release milestone if it exists and is closed
3. **Organizes Development**: Provides a target milestone for organizing issues and pull requests during development

### Milestone Naming Convention
- Target version `1.2.4-dev.0` → Milestone: `release/1.2.4`
- Target version `2.0.0-dev.0` → Milestone: `release/2.0.0`

## Version Development Patterns

### Standard Development Version Format
All development versions follow the pattern: `<base-version>-dev.0`

**Examples:**
- Release `1.2.3` → Development `1.2.4-dev.0` (patch)
- Release `1.2.3` → Development `1.3.0-dev.0` (minor)
- Release `1.2.3` → Development `2.0.0-dev.0` (major)

### Pre-release Cleanup
If your current version is already a pre-release (e.g., `1.2.4-beta.1`), the development command:
- Strips the pre-release suffix
- Applies the version bump to the base version
- Adds the `-dev.0` suffix

**Example:** `1.2.4-beta.1` with patch → `1.2.5-dev.0`

## Git Workflow Integration

### Branch Synchronization
The development command ensures your working branch stays synchronized:

1. **Fetches Latest**: Syncs the main branch with its remote
2. **Merges Safely**: Uses non-fast-forward merge to maintain history
3. **Conflict Detection**: Stops if merge conflicts require manual resolution
4. **Status Reporting**: Reports the synchronization results

### Automatic Commit
After version changes, the command uses `kodrdriv commit` with:
- `--add`: Automatically stages all changes
- `--sendit`: Commits without manual review
- **Smart Messages**: Generates intelligent commit messages describing the development setup

## Error Handling

### Common Scenarios
- **Merge Conflicts**: Stops execution and reports conflict resolution requirements
- **Git State Issues**: Validates git repository state before making changes
- **Version Conflicts**: Detects and handles existing development versions appropriately
- **Network Issues**: Gracefully handles GitHub API connectivity problems for milestones

### Recovery
If the command fails partway through:
1. **Manual Resolution**: Resolve any reported conflicts (e.g., merge conflicts)
2. **Retry**: Re-run the same development command
3. **State Detection**: The command detects partially completed work and continues appropriately

## Configuration

You can configure development command behavior in your `.kodrdriv/config.json`:

```json
{
  "development": {
    "targetVersion": "minor",
    "noMilestones": false
  }
}
```

**Configuration Options:**
- `targetVersion`: Default version bump type (patch, minor, major, or explicit version)
- `noMilestones`: Default setting for milestone integration

## Use Cases

### Starting New Feature Development
```bash
# Switch to development environment for new feature
kodrdriv development

# Start working on features with proper development version
# ... make changes ...
kodrdriv commit "implement new authentication feature"
```

### Resuming Development After Release
```bash
# After publishing a release, set up for next development cycle
kodrdriv development --target-version minor
```

### Setting Up Major Version Development
```bash
# Begin work on breaking changes
kodrdriv development --target-version major
```

### Repository Without GitHub Integration
```bash
# For local-only or non-GitHub repositories
kodrdriv development --no-milestones
```

## Integration with Other Commands

### With Publish Command
```bash
# Typical release cycle
kodrdriv development           # Set up development environment
# ... development work ...
kodrdriv publish              # Publish release
kodrdriv development          # Set up for next development cycle
```

### With Tree Command
```bash
# Set up development environment across workspace
kodrdriv tree development
```

The development command integrates with the tree command to set up development environments across multiple packages in a workspace simultaneously.

## Best Practices

1. **Consistent Workflow**: Always use `kodrdriv development` when starting new development cycles
2. **Clean State**: Ensure working directory is clean before running development setup
3. **Version Strategy**: Plan your version bumps (patch vs minor vs major) based on planned changes
4. **Milestone Usage**: Leverage GitHub milestones created by the command for organizing development work
5. **Branch Hygiene**: Let the command manage branch creation and synchronization rather than manual git operations

The development command eliminates manual version management and branch synchronization, ensuring consistent development environment setup across your team and projects.
