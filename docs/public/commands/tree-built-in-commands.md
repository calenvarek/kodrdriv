# Tree Built-in Commands

The tree command supports executing kodrdriv's built-in commands across multiple packages with dependency analysis and configuration isolation.

## Overview

Built-in commands provide dependency-aware execution of core kodrdriv functionality:

```bash
kodrdriv tree commit      # Run commit operations across packages
kodrdriv tree publish     # Run publish operations across packages
kodrdriv tree link        # Link workspace packages across packages
kodrdriv tree unlink      # Unlink workspace packages across packages
kodrdriv tree development # Set up development environments across packages
kodrdriv tree branches    # Display branch and status information across packages
kodrdriv tree run         # Run npm scripts across packages with space-separated script names
kodrdriv tree checkout    # Checkout all packages to a specified branch with safety checks
```

## Key Features

### Configuration Isolation
Each package executes with its own kodrdriv configuration:
- Individual `.kodrdriv` configuration directories
- Package-specific preferences and context directories
- Separate OpenAI API usage and logging per package

### Dependency-Aware Execution
Commands execute in topological dependency order:
- Dependencies are processed before dependents

- Proper error handling and recovery points

### Enhanced Error Handling
Comprehensive error reporting and recovery:
- **Error Summary**: Clear summary showing what failed, where, and position in build order
- **Timeout Detection**: Automatic detection and handling of timeout errors (especially for publish operations)
- **Recovery Commands**: Provides exact commands to resume from failed packages
- **Execution Context**: Maintains context across package boundaries for resume operations

## Supported Commands

### `kodrdriv tree commit`

Executes commit operations across all packages that have uncommitted changes.

**What it does:**
- Runs `kodrdriv commit` in each package directory
- Uses each package's individual commit configuration
- Maintains package-specific git history and context

**Usage:**
```bash
# Commit across all packages
kodrdriv tree commit



# Resume from a specific package
kodrdriv tree commit --start-from my-package

# Exclude certain packages
kodrdriv tree commit --exclude "test-*" "temp-*"
```

**Configuration:**
Each package can have its own commit settings in `.kodrdriv/config.json`:
```json
{
  "commit": {
    "messageLimit": 25,
    "context": "This package handles user authentication"
  }
}
```

### `kodrdriv tree publish`

Executes publish operations across all packages in dependency order.

**What it does:**
- Runs `kodrdriv publish` in each package directory
- Ensures dependencies are published before dependents
- Uses each package's individual publish configuration
 - Skips a package if only the `package.json` version changed compared to the target branch; in that case the package is still marked successful and its current version is recorded for inter-project dependency updates

**Usage:**
```bash
# Publish all packages in dependency order
kodrdriv tree publish



# Resume from a specific package
kodrdriv tree publish --start-from my-package

# Dry run to see execution plan
kodrdriv tree publish --dry-run
```

**Configuration:**
Each package can have its own publish settings:
```json
{
  "publish": {
    "mergeMethod": "squash",
    "requiredEnvVars": ["PACKAGE_SPECIFIC_TOKEN"],
    "dependencyUpdatePatterns": ["@company/*"],
    "targetBranch": "main"
  }
}
```

### `kodrdriv tree link`

Links workspace packages across all packages for local development.

**What it does:**
- Runs `kodrdriv link` in each package directory
- Creates `file:` dependencies for local workspace packages
- Respects each package's scope and linking configuration

**Usage:**
```bash
# Link all workspace packages
kodrdriv tree link



# Link specific directories only
kodrdriv tree link --directories ./apps ./packages

# Exclude certain packages from linking
kodrdriv tree link --exclude "build-*"

# Link external dependencies that match patterns
kodrdriv tree link --externals "@somelib" "lodash"

# Link both same-scope and external dependencies
kodrdriv tree link --externals "@external/lib"
```

**Configuration:**
Each package can have its own linking scope:
```json
{
  "link": {
    "scopeRoots": {
      "@company": "../packages/",
      "@utils": "../../shared/"
    }
  }
}
```

### `kodrdriv tree unlink`

Unlinks workspace packages across all packages, restoring registry dependencies.

**What it does:**
- Runs `kodrdriv unlink` in each package directory
- Removes `file:` dependencies and restores registry versions
- Cleans up development artifacts per package configuration

**Usage:**
```bash
# Unlink all workspace packages
kodrdriv tree unlink



# Dry run to see what would be unlinked
kodrdriv tree unlink --dry-run

# Resume from a specific package
kodrdriv tree unlink --start-from my-package
```

### `kodrdriv tree development`

Sets up development environments across all packages in the workspace.

**What it does:**
- Runs `kodrdriv development` in each package directory
- Manages branch transitions and version bumping per package
- Creates package-specific development versions and milestones
- Maintains individual package git workflows

**Usage:**
```bash
# Set up development environment across all packages
kodrdriv tree development

# Set up with minor version bumps
kodrdriv tree development --target-version minor

# Resume from a specific package
kodrdriv tree development --start-from my-package

# Exclude certain packages
kodrdriv tree development --exclude "test-*" "build-*"

# Disable milestone integration across workspace
kodrdriv tree development --no-milestones
```

**Configuration:**
Each package can have its own development settings:
```json
{
  "development": {
    "targetVersion": "minor",
    "noMilestones": false
  }
}
```

**Use Cases:**
- **Workspace-wide Development Setup**: Prepare all packages for new development cycle
- **Coordinated Version Bumping**: Ensure consistent development versioning across packages
- **Branch Management**: Standardize working branch setup across the workspace
- **Milestone Coordination**: Create aligned milestones for workspace-wide feature development

### `kodrdriv tree branches`

Displays a comprehensive branch and status overview across all packages in tabular format.

**What it does:**
- Shows current git branch for each package
- Displays package version from package.json
- Reports git status (clean, modified, ahead/behind, etc.)
- Formats information in an easy-to-scan table

**Usage:**
```bash
# Display branch status for all packages
kodrdriv tree branches

# Show branch status for specific directories
kodrdriv tree branches --directories ./apps ./packages

# Check branch status with package exclusions
kodrdriv tree branches --exclude "temp-*" "build-*"

# Analyze branches across multiple directory trees
kodrdriv tree branches --directories ./client-apps ./server-packages ./shared-libs
```

**Example Output:**
```
Branch Status Summary:

Package         | Branch        | Version | Status
--------------- | ------------- | ------- | ------
utils           | main          | 1.2.3   | clean
core            | feature/auth  | 1.0.1   | modified
api             | main          | 2.1.0   | ahead
ui              | develop       | 1.5.2   | behind
app             | main          | 3.0.0   | clean
```

**Use Cases:**
- **Pre-release verification**: Ensure all packages are on the correct branch before publishing
- **Development coordination**: See what branches team members are working on across packages
- **Branch synchronization**: Identify packages that need git pulls or pushes
- **Release preparation**: Verify workspace is ready for coordinated release
- **Workspace overview**: Get a quick snapshot of the entire workspace state

**Integration with Workflows:**
```bash
# Check workspace status before starting work
kodrdriv tree branches

# Verify all packages are ready for release
kodrdriv tree branches | grep -v "main.*clean" && echo "Some packages not ready for release"

# Use in CI/CD to verify branch consistency
kodrdriv tree branches --directories ./packages | grep -v "main" && exit 1
```

### `kodrdriv tree run`

Executes npm scripts across all packages in dependency order with convenient space-separated syntax.

**What it does:**
- Validates that all packages have the required scripts before execution
- Converts space-separated script names to `npm run` commands
- Executes scripts in dependency order across all packages
- Maintains execution context for recovery and continuation
- Provides the same error handling and recovery as other built-in commands

**Usage:**
```bash
# Run clean, build, and test scripts across all packages
kodrdriv tree run "clean build test"

# This is equivalent to:
kodrdriv tree --cmd "npm run clean && npm run build && npm run test"

# Run multiple scripts with different names
kodrdriv tree run "lint test coverage"

# Resume from a failed package
kodrdriv tree run "clean build test" --continue

# Start from a specific package
kodrdriv tree run "build test" --start-from my-package
```

**Key Benefits:**
- **Pre-flight Validation**: Checks that all packages have required scripts before starting
- **Convenient Syntax**: `"clean build test"` instead of `"npm run clean && npm run build && npm run test"`
- **Context Preservation**: Supports `--continue` for recovery after failures
- **Dependency Awareness**: Scripts run in proper dependency order
- **Error Recovery**: Same robust error handling as other built-in commands

**Script Validation:**
The command validates that all packages have the required scripts before execution starts. If any package is missing a script, it will:
- Show exactly which packages are missing which scripts
- Provide clear guidance on how to fix the issue
- Prevent execution to avoid partial failures

**Common Use Cases:**
```bash
# Pre-publish validation
kodrdriv tree run "clean build test"

# Development setup
kodrdriv tree run "install build"

# Quality checks
kodrdriv tree run "lint test coverage"

# Single script (like precommit)
kodrdriv tree run "precommit"

# Full CI pipeline
kodrdriv tree run "clean install build test coverage"
```

**Example Error Output:**
```bash
$ kodrdriv tree run "clean build test"
🔍 Validating scripts before execution: clean, build, test
❌ Script validation failed. Missing scripts:
  package-a: clean, test
  package-b: build

❌ Script validation failed. Cannot proceed with execution.

💡 To fix this:
   1. Add the missing scripts to the package.json files
   2. Or exclude packages that don't need these scripts using --exclude
   3. Or run individual packages that have the required scripts
```

**Configuration:**
No special configuration required - uses each package's `package.json` scripts.

### `kodrdriv tree checkout`

Safely checkout all packages in the workspace to a specified branch with comprehensive safety checks.

**What it does:**
- Performs two-phase operation: safety check, then checkout
- Scans all packages for uncommitted changes before proceeding
- Handles branch creation from remote or creates new branches
- Provides detailed status reporting and error recovery guidance

**Usage:**
```bash
# Checkout all packages to development branch
kodrdriv tree checkout development

# Checkout to feature branch (with safety checks)
kodrdriv tree checkout feature/new-auth

# Dry run to see what would happen
kodrdriv tree checkout main --dry-run

# Exclude certain packages from checkout
kodrdriv tree checkout development --exclude "build-*" "temp-*"
```

**Safety Features:**
- **Phase 1**: Scans all packages for uncommitted changes, unstaged files, or git errors
- **Precondition Checks**: Blocks operation if any package has modifications
- **Clear Error Reporting**: Shows exactly which packages have issues and how to resolve them
- **Recovery Guidance**: Suggests specific commands to resolve issues

**Branch Handling:**
- **Existing Local Branch**: Checks out to existing branch
- **Remote Branch**: Creates local branch tracking remote if branch exists on origin
- **New Branch**: Creates entirely new branch if it doesn't exist anywhere

**Example Output:**
```
🔍 Phase 1: Checking for uncommitted changes across workspace...
✅ package-a: clean
⚠️  package-b: 2 unstaged, 1 uncommitted
✅ package-c: clean

❌ Cannot proceed with checkout: 1 packages have uncommitted changes or errors:

  📦 package-b (/path/to/package-b):
      Status: 2 unstaged, 1 uncommitted

🔧 To resolve this issue:
   1. Commit or stash changes in the packages listed above
   2. Or use "kodrdriv tree commit" to commit changes across all packages
   3. Then re-run the checkout command
```

**Use Cases:**
- **Environment Switching**: Quickly switch entire workspace to different branch
- **Release Preparation**: Ensure all packages are on the correct branch for release
- **Feature Development**: Switch workspace to feature branch for coordinated development
- **Hotfix Deployment**: Emergency switch to hotfix branch across all packages

**Error Recovery:**
If checkout fails partway through, the command provides:
- **Status Report**: Which packages succeeded and which failed
- **Specific Errors**: Detailed error messages for each failure
- **Recovery Suggestions**: Commands to fix issues and retry

**Configuration:**
No special configuration required - uses workspace package discovery and git operations.

## Execution Order and Dependencies

### Dependency Levels

Built-in commands execute in dependency levels:

```
Level 1: Packages with no local dependencies
Level 2: Packages depending only on Level 1 packages
Level 3: Packages depending on Level 1 and/or Level 2 packages
...
```



## Error Handling and Recovery

### Failure Recovery

If a command fails in any package:

1. **Error Context**: Shows which package failed and why
2. **Success Count**: Reports how many packages completed successfully
3. **Recovery Command**: Provides exact restart command

Example failure scenario:
```
[3/5] api: ❌ Failed - Command failed in package api
Failed after 2 successful packages.
To resume from this package, run:
    kodrdriv tree publish --start-from api
```

### Resume Execution

Resume from the failed package:
```bash
kodrdriv tree publish --start-from api
```

This continues from where the previous execution failed, skipping successfully completed packages.

## Best Practices

### Package Organization

1. **Consistent Structure**: Maintain similar directory structures across packages
2. **Configuration Management**: Use hierarchical configuration for common settings
3. **Dependency Clarity**: Keep local dependencies explicit and well-documented

### Execution Strategy

1. **Start with Linking**: `kodrdriv tree link` before development
2. **Regular Commits**: Use `kodrdriv tree commit` for coordinated commits
3. **Dependency Order**: Always publish in dependency order with `kodrdriv tree publish`
4. **Clean Unlinking**: `kodrdriv tree unlink` before final release

### Configuration Tips

1. **Global Defaults**: Set common configuration in root `.kodrdriv/config.json`
2. **Package Overrides**: Override specific settings in package-level configurations
3. **Environment Variables**: Use package-specific environment variables when needed

## Integration Examples

### Complete Development Workflow

```bash
# 1. Check workspace status
kodrdriv tree branches

# 2. Set up development environment
kodrdriv tree --cmd "npm install"
kodrdriv tree development
kodrdriv tree link

# 3. Development iteration
kodrdriv tree --cmd "npm run build"
kodrdriv tree --cmd "npm test"

# 4. Verify workspace before commit
kodrdriv tree branches

# 5. Commit changes
kodrdriv tree commit

# 6. Prepare for release
kodrdriv tree unlink
kodrdriv tree --cmd "npm run build"

# 7. Publish release (with stop-at for staged releases)
kodrdriv tree publish --stop-at main-app
kodrdriv tree publish --start-from main-app
```

### CI/CD Pipeline Integration

```bash
# In CI/CD pipeline
kodrdriv tree branches                 # Verify branch consistency
kodrdriv tree --cmd "npm ci"           # Install exact dependencies
kodrdriv tree --cmd "npm run build"    # Build all packages
kodrdriv tree --cmd "npm test"         # Test all packages

# Staged release process
kodrdriv tree publish --stop-at integration-app  # Publish core packages first
kodrdriv tree --cmd "npm run integration-test"   # Run integration tests
kodrdriv tree publish --start-from integration-app  # Publish remaining packages
```

## Troubleshooting

### Common Issues

1. **Configuration Conflicts**: Ensure package-level configs don't conflict with global settings
2. **Dependency Loops**: Tree command will detect and report circular dependencies
3. **Environment Variables**: Each package needs access to required environment variables
4. **Git State**: Ensure git repositories are in expected state for commit/publish operations

### Debug Information

Use `--debug` flag for detailed execution information:
```bash
kodrdriv tree commit --debug
```

This shows:
- Dependency analysis details
- Package-by-package execution logs
- Configuration resolution per package
- Detailed error information

For more general tree command information, see [Tree Command](tree.md).
