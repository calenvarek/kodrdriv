# Tree Built-in Commands

The tree command supports executing kodrdriv's built-in commands across multiple packages with dependency analysis and configuration isolation.

## Overview

Built-in commands provide dependency-aware execution of core kodrdriv functionality:

```bash
kodrdriv tree commit    # Run commit operations across packages
kodrdriv tree publish   # Run publish operations across packages
kodrdriv tree link      # Link workspace packages across packages
kodrdriv tree unlink    # Unlink workspace packages across packages
kodrdriv tree branches  # Display branch and status information across packages
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
- Parallel execution when dependencies allow
- Proper error handling and recovery points

### Unified Error Handling
Consistent error reporting and recovery:
- Shows which packages completed successfully
- Provides restart commands for failed operations
- Maintains execution context across package boundaries

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

# Commit with parallel execution
kodrdriv tree commit --parallel

# Resume from a specific package
kodrdriv tree commit --start-from my-package

# Exclude certain packages
kodrdriv tree commit --excluded-patterns "test-*" "temp-*"
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

**Usage:**
```bash
# Publish all packages in dependency order
kodrdriv tree publish

# Publish with parallel execution (respects dependencies)
kodrdriv tree publish --parallel

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

# Link with parallel execution
kodrdriv tree link --parallel

# Link specific directories only
kodrdriv tree link --directories ./apps ./packages

# Exclude certain packages from linking
kodrdriv tree link --excluded-patterns "build-*"
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

# Unlink with parallel execution
kodrdriv tree unlink --parallel

# Dry run to see what would be unlinked
kodrdriv tree unlink --dry-run

# Resume from a specific package
kodrdriv tree unlink --start-from my-package
```

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
kodrdriv tree branches --excluded-patterns "temp-*" "build-*"

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

## Execution Order and Dependencies

### Dependency Levels

Built-in commands execute in dependency levels:

```
Level 1: Packages with no local dependencies
Level 2: Packages depending only on Level 1 packages
Level 3: Packages depending on Level 1 and/or Level 2 packages
...
```

### Parallel Execution

When using `--parallel`, packages within the same dependency level execute simultaneously:

```bash
# Execute packages in parallel where possible
kodrdriv tree publish --parallel
```

Example execution flow:
```
Level 1: utils, constants (parallel)
Level 2: core, helpers (parallel, after Level 1 completes)
Level 3: api, ui (parallel, after Level 2 completes)
Level 4: app (sequential, after Level 3 completes)
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
kodrdriv tree link

# 3. Development iteration
kodrdriv tree --cmd "npm run build" --parallel
kodrdriv tree --cmd "npm test"

# 4. Verify workspace before commit
kodrdriv tree branches

# 5. Commit changes
kodrdriv tree commit

# 6. Prepare for release
kodrdriv tree unlink
kodrdriv tree --cmd "npm run build" --parallel

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
